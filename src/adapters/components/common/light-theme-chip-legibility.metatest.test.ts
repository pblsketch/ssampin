/*
  디자인 시스템 메타테스트 — 라이트 테마 chip/badge 가독성 가드.

  배경: 사용자 신고 2026-05-20 — 다크 테마에서는 잘 보이는 amber chip 이
  라이트 테마에서는 옅은 그레이 배경(#e0e2e6) 위에 옅은 노랑 글씨로 거의 안 보임.
  WCAG AA(≥4.5:1) fail.

  대응: `src/index.css` 의 `.theme-light` override 가 amber/red/orange/purple-(100|200|300)
  옅은 텍스트를 700 톤(어두운 강조 색)으로 강제. 이 메타테스트는 신규 코드가
  override 화이트리스트 밖의 옅은 색상(예: text-amber-200 신규 추가) 또는
  override 누락 상태에서 amber/red/orange/purple-(100|200|300)을 도입할 때 잡는다.

  가드 스코프 (Phase 2B): amber/red/orange/purple 4 색상만 검사.
  sky/blue/fuchsia/lime/teal/cyan/emerald/green 등 추가 색상의 라이트 테마 회귀는
  별도 PDCA(`chip-light-theme-additional-colors`)에서 동일 패턴으로 처리 예정.

  화이트리스트는 index.css 의 override 정의에서 자동으로 가져온다 (단일 진실 원천).
*/

import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

// Phase 2B 스코프 — Plan 명시 4 색상 + Plan 작성 시점 사용자 신고 색상.
// 추가 색상(sky/blue/fuchsia/lime 등)은 후속 PDCA 에서 정규식 확장 + override 동반.
// alpha 변형(/80, /90 등)도 잡음 — Tailwind 가 text-amber-300/80 을 별도 클래스로 컴파일하므로
// override selector 가 `[class*="text-amber-300"]` 부분 매치 패턴으로 alpha 변형까지 함께 잡는다.
const COLOR_RE = /\btext-(amber|red|orange|purple)-(100|200|300)(?:\/\d+)?\b/g;

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'dist-electron')
      continue;
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (
      (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) &&
      !entry.name.includes('.test.') &&
      !entry.name.includes('.metatest.')
    ) {
      out.push(full);
    }
  }
}

/**
 * index.css 의 라이트 테마 override 셀렉터를 파싱해 (color, shade) 화이트리스트 집합 반환.
 * 두 패턴 모두 지원:
 *   - `.theme-light .text-amber-300 { ... }` (정확 매치)
 *   - `.theme-light [class*="text-amber-300"] { ... }` (alpha 변형까지 잡는 부분 매치 — 권장)
 */
function loadOverrideAllowSet(): Set<string> {
  const cssPath = path.join(repoRoot, 'src', 'index.css');
  const css = fs.readFileSync(cssPath, 'utf-8');
  const allow = new Set<string>();
  const exact = /\.theme-light\s+\.text-(\w+)-(\d+)/g;
  const partial = /\.theme-light\s+\[class\*="text-(\w+)-(\d+)"\]/g;
  for (const re of [exact, partial]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(css)) !== null) {
      allow.add(`${m[1]}-${m[2]}`);
    }
  }
  return allow;
}

describe('MT-D2: 라이트 테마 chip/badge 가독성 가드', () => {
  it('text-{color}-(100|200|300) 사용처는 모두 index.css .theme-light override 가 정의되어 있어야 함', () => {
    const srcDir = path.join(repoRoot, 'src');
    const files: string[] = [];
    walk(srcDir, files);

    const allow = loadOverrideAllowSet();
    const violations: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        // 한 줄에 여러 매치 가능 (예: 조건부 className)
        COLOR_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = COLOR_RE.exec(line)) !== null) {
          const key = `${m[1]}-${m[2]}`;
          if (!allow.has(key)) {
            const rel = path.relative(repoRoot, file).replace(/\\/g, '/');
            violations.push(
              `${rel}:${i + 1} — text-${key}${m[0].includes('/') ? `(alpha 변형 ${m[0]})` : ''} 사용처에 .theme-light override 없음.\n` +
                `    src/index.css 에 .theme-light [class*="text-${key}"] { color: ... } 추가 필요`,
            );
          }
        }
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });
});
