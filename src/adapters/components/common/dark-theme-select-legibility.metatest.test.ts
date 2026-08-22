/*
  디자인 시스템 메타테스트 — 네이티브 드롭다운(select 목록) 가독성 가드.

  배경: 사용자 신고 2026-08-21 — 다크 모드에서 select 를 펼치면 항목 글자가
  거의 안 보였다(온라인 교무실 '공간 관리'의 공간 종류 고르기).

  원인: 드롭다운 목록(popup)은 브라우저가 따로 그리는 상자다. option 에 배경색을
  지정하지 않으면 **흰 바탕**으로 그려지는데, option 은 select 의 `color` 를
  물려받으므로 다크 모드에서 밝은 글자색(--sp-text)이 내려온다.
  결과가 '흰 배경 + 밝은 글씨' — 실측 명암비 **1.23:1** (WCAG AA 기준 4.5:1).
  앱에 option 규칙이 아예 없어서 select 를 쓰는 곳(104군데) 전부가 같은 상태였다.

  대응: `src/index.css` 에 `select option` 규칙을 두어 배경과 글자색을 **함께**
  테마 변수로 못박았다. 실측 명암비 다크 11.29:1 / 라이트 14.45:1.

  이 메타테스트가 잡는 회귀:
   1) 규칙이 통째로 사라지는 것 (신고 상태로 되돌아감)
   2) 배경 또는 글자색 **한쪽만** 지정하는 것
      — 글자만 주면 지금 신고 상태, 배경만 주면 반대 테마에서 같은 사고가 난다
   3) 테마 변수 대신 고정 색을 박는 것 (한쪽 테마에서 반드시 깨진다)
   4) 규칙을 한 테마에만 거는 것 (.theme-dark 안에만 두면 라이트에서 안 걸린다)
*/

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const cssPath = path.join(repoRoot, 'src', 'index.css');
const css = fs.readFileSync(cssPath, 'utf-8');

/** `select option { ... }` 블록 본문을 꺼낸다 */
function optionRuleBody(): string | null {
  const idx = css.indexOf('select option');
  if (idx === -1) return null;
  const open = css.indexOf('{', idx);
  const close = css.indexOf('}', open);
  if (open === -1 || close === -1) return null;
  return css.slice(open + 1, close);
}

describe('MT-D3: 네이티브 드롭다운 가독성 가드', () => {
  it('select option 규칙이 index.css 에 있다 (없으면 다크 모드에서 항목이 안 보인다)', () => {
    expect(optionRuleBody()).not.toBeNull();
  });

  it('★ 배경색과 글자색을 함께 지정한다 (한쪽만 주면 반대 테마가 깨진다)', () => {
    const body = optionRuleBody();
    expect(body).not.toBeNull();
    expect(body).toMatch(/background-color\s*:/);
    expect(body).toMatch(/(^|[^-])color\s*:/m);
  });

  it('★ 고정 색이 아니라 테마 변수를 쓴다', () => {
    const body = optionRuleBody() ?? '';
    expect(body).toContain('var(--sp-');
    // 고정 HEX 나 rgb() 리터럴이 들어오면 한쪽 테마에서 반드시 깨진다
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(body).not.toMatch(/\brgba?\(/);
  });

  it('★ 특정 테마 안에만 걸려 있지 않다 (양쪽 테마에 모두 적용되어야 한다)', () => {
    const idx = css.indexOf('select option');
    expect(idx).toBeGreaterThan(-1);
    // 선택자 앞부분에 .theme-dark / .theme-light 한정이 붙어 있으면 반쪽짜리다
    const selectorStart = css.lastIndexOf('\n', idx) + 1;
    const selector = css.slice(selectorStart, css.indexOf('{', idx));
    expect(selector).not.toContain('.theme-dark');
    expect(selector).not.toContain('.theme-light');
  });

  it('optgroup(항목 묶음 제목)도 같이 처리한다', () => {
    expect(css).toContain('select optgroup');
  });
});
