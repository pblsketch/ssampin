/*
  디자인 시스템 메타테스트 — 강조색 배경 위 흰 글씨 가드.

  배경(2026-08-14): 무채색 미니멀 테마(뉴트럴/뉴트럴 다크)를 추가하면서 accent 가
  거의 검정(#1c1c1e) 또는 거의 흰색(#fafafa)이 됐고, 그동안 파랑·주황 accent 뒤에
  가려져 있던 대비 구멍 두 개가 드러났다. 둘 다 "안 보이는 글자"로 신고됐다.

  구멍 1 — 인라인 배경 + `text-white`
    라이트 테마는 `.theme-light .text-white { color: var(--sp-text) !important }` 로
    흰 글씨를 본문색(어두움)으로 강제한다. 밝은 배경 위 흰 글씨를 막기 위한 보정이다.
    이 보정의 예외 목록은 `[class*='bg-blue-'].text-white` 처럼 **Tailwind 배경 클래스**만
    알아본다. 배경을 `style={{ background: 'var(--sp-accent)' }}` 로 넣으면 예외에
    걸리지 않아, 어두운 accent 배경 위에 어두운 글씨가 된다(MessageBanner 1.05:1).
    → 인라인 배경이 테마 토큰이면 글자색도 인라인으로 지정해야 한다.

  구멍 2 — 알파 변형이 정확 매치를 빠져나감
    `.bg-sp-accent .text-white` 는 정확 매치라 `text-white/70` 을 잡지 못한다.
    뉴트럴 다크(accent 가 거의 흰색)에서 모바일 안내 배너의 닫기 버튼이 흰 배경 위
    흰 아이콘(1.03:1)으로 사라졌다. → 앞경계 고정 쌍으로 알파 변형까지 덮는다.

  두 규칙 모두 "지금 0건"인 상태를 고정한다. 새 코드가 같은 구멍을 다시 뚫으면 잡힌다.
*/

import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

function walkTsx(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'dist-electron')
      continue;
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsx(full, out);
    } else if (
      entry.name.endsWith('.tsx') &&
      !entry.name.includes('.test.') &&
      !entry.name.includes('.metatest.')
    ) {
      out.push(full);
    }
  }
}

/** JSX 여는 태그 한 덩어리 (`<div ... >`). 여러 줄에 걸친 태그도 잡는다. */
const JSX_OPEN_TAG = /<[A-Za-z][^<>]*?>/gs;

/** className 에 text-white 또는 그 알파 변형(text-white/70)이 있는가 */
const HAS_TEXT_WHITE = /\btext-white(?:\/\d+)?\b/;

/** style={{ background: ... }} / backgroundColor 의 값 추출 */
const INLINE_BG = /(?:background|backgroundColor):\s*([^,}]+)/;

describe('MT-D3: 강조색 배경 위 흰 글씨 가드', () => {
  it('인라인 배경이 테마 토큰(var(--sp-*))인 요소는 text-white 에 의존하지 않는다', () => {
    const files: string[] = [];
    walkTsx(path.join(repoRoot, 'src'), files);

    const violations: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      let m: RegExpExecArray | null;
      JSX_OPEN_TAG.lastIndex = 0;
      while ((m = JSX_OPEN_TAG.exec(content)) !== null) {
        const tag = m[0];
        if (!HAS_TEXT_WHITE.test(tag)) continue;

        const bg = tag.match(INLINE_BG);
        if (!bg?.[1]) continue;

        // 테마 토큰 배경만 문제 삼는다. 고정 hex·데이터 색(학생 아바타 등)은
        // 테마와 무관하게 밝기가 정해져 있어 이 구멍에 해당하지 않는다.
        if (!/var\(--sp-/.test(bg[1])) continue;

        const line = content.slice(0, m.index).split('\n').length;
        const rel = path.relative(repoRoot, file).replace(/\\/g, '/');
        violations.push(
          `${rel}:${line} — 인라인 배경이 테마 토큰(${bg[1].trim()})인데 글자색을 text-white 에 의존한다.\n` +
            `    라이트 테마 보정이 흰 글씨를 어두운 본문색으로 바꿔 배경에 묻힌다.\n` +
            `    className 에서 text-white 를 빼고 style 에 color 를 함께 지정할 것\n` +
            `    (예: color: 'var(--sp-accent-fg)').`,
        );
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('index.css 의 .bg-sp-accent 자동 대비 규칙이 알파 변형까지 덮는다', () => {
    const css = fs.readFileSync(path.join(repoRoot, 'src', 'index.css'), 'utf-8');

    // prettier 가 따옴표를 어느 쪽으로 정규화해도 통과하도록 양쪽 모두 허용
    const required: { label: string; re: RegExp }[] = [
      {
        label: '같은 요소: .bg-sp-accent.text-white',
        re: /\.bg-sp-accent\.text-white\b/,
      },
      {
        label: '자식 요소: .bg-sp-accent .text-white',
        re: /\.bg-sp-accent\s+\.text-white\b/,
      },
      {
        label: "알파 변형 앞경계 고정: .bg-sp-accent [class^='text-white/']",
        re: /\.bg-sp-accent\s+\[class\^=["']text-white\/["']\]/,
      },
      {
        label: "알파 변형 토큰 경계: .bg-sp-accent [class*=' text-white/']",
        re: /\.bg-sp-accent\s+\[class\*=["'] text-white\/["']\]/,
      },
    ];

    const missing = required.filter((r) => !r.re.test(css)).map((r) => r.label);

    expect(
      missing,
      `src/index.css 에서 다음 규칙이 사라졌다:\n  - ${missing.join('\n  - ')}\n` +
        `accent 가 거의 흰색인 테마(뉴트럴 다크)에서 배너 닫기 버튼이 흰 배경 위 흰 아이콘이 된다.`,
    ).toEqual([]);
  });
});
