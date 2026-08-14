// @vitest-environment jsdom
/**
 * 하단 탭바 회귀 방지 — **App.tsx 소스를 직접 검사한다.**
 *
 * 배경: 라우터 도입 때 `setMoreSub(null)` 의 의미가 "상태 지우기"에서 "뒤로가기 실행"
 * 으로 바뀌었는데, 탭바에 남아 있던 `if (tab.key !== 'more') setMoreSub(null);` 한 줄이
 * 방금 한 탭 이동을 즉시 되돌려 **홈·학생·일정 탭이 먹통**이 됐다.
 *
 * 그때 tsc·lint·vitest 4395개·regression 39개가 전부 초록불이었다. 어떤 검사도
 * "탭을 눌렀을 때 무슨 일이 일어나는가"를 보지 않았기 때문이다.
 *
 * ⚠️ 이 파일의 1차 버전은 App 을 import 하지 않고 useRoute 만 직접 호출했다.
 * 그건 App 의 규칙을 **복사**한 것이라, 버그가 살아 있는 코드에서도 통과했다.
 * 즉 그물처럼 보이는 그물이 아니었다. 그래서 이 저장소가 이미 쓰는
 * 소스 검사 방식(bottomSheetCoverage.meta.test.ts 와 같은 계열)으로 바꿨다.
 * App 전체를 렌더하려면 28개 스토어·동기화·OAuth 를 다 세워야 해서 비용이 크다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const APP_SOURCE = readFileSync(resolve(__dirname, '../../..', 'src/mobile/App.tsx'), 'utf8');

/** 탭 버튼의 onClick 표현식을 뽑아낸다. */
function extractTabOnClick(): string {
  const marker = 'onClick=';
  // 탭바는 tabs.map 안에서 렌더된다. 그 블록만 잘라 본다.
  const navStart = APP_SOURCE.indexOf('tabs.map(');
  expect(
    navStart,
    'App.tsx 에서 tabs.map( 을 찾지 못했습니다 — 탭바 구조가 바뀌었나요?',
  ).toBeGreaterThan(-1);
  const navBlock = APP_SOURCE.slice(navStart, navStart + 1500);
  const at = navBlock.indexOf(marker);
  expect(at, '탭 버튼에 onClick 이 없습니다').toBeGreaterThan(-1);
  // onClick={...} 의 중괄호 균형을 맞춰 잘라낸다.
  let i = navBlock.indexOf('{', at);
  let depth = 0;
  const start = i;
  for (; i < navBlock.length; i += 1) {
    if (navBlock[i] === '{') depth += 1;
    else if (navBlock[i] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return navBlock.slice(start, i + 1);
}

describe('하단 탭바 — 탭 이동은 setActiveTab 하나로 끝난다', () => {
  const onClick = extractTabOnClick();

  it('탭 onClick 이 setActiveTab 을 호출한다', () => {
    expect(onClick).toMatch(/setActiveTab\s*\(\s*tab\.key\s*\)/);
  });

  it('탭 onClick 에 goBack 이 섞여 있지 않다 (방금 한 이동을 되돌린다)', () => {
    expect(
      onClick,
      `탭 onClick 에 goBack 이 있습니다. 탭을 누르는 즉시 원래 화면으로 튕깁니다.\n실제 코드: ${onClick}`,
    ).not.toMatch(/goBack/);
  });

  it('탭 onClick 에 하위 화면 해제 호출이 남아 있지 않다', () => {
    // setMoreSub(null) 은 이제 존재하지 않고, openMoreSub/openAttendance 는
    // "이동"이라 탭 이동과 함께 부르면 두 번 이동한다.
    expect(
      onClick,
      `탭 onClick 에 하위 화면 조작이 섞여 있습니다.\n실제 코드: ${onClick}`,
    ).not.toMatch(/setMoreSub|openMoreSub|setAttendanceNav|openAttendance/);
  });

  it('탭 onClick 이 호출하는 함수는 하나뿐이다', () => {
    const calls = onClick.match(/\b[a-zA-Z_$][\w$]*\s*\(/g) ?? [];
    expect(
      calls.length,
      `탭 onClick 이 여러 함수를 호출합니다: ${calls.join(', ')}\n` +
        `탭 이동은 setActiveTab 하나로 끝나야 합니다. 이동을 두 번 하면 히스토리가 어긋나거나 화면이 튕깁니다.`,
    ).toBe(1);
  });

  /**
   * 위 단언들만으로는 `onClick={() => handleTabPress(tab.key)}` 처럼 **한 단계 감싸면**
   * 전부 통과하고 버그가 그 안에 숨을 수 있다. 표현식 모양 자체를 고정해서, 감싸는
   * 순간 빨간불이 나고 의식적으로 이 테스트를 갱신하게 만든다.
   */
  it('탭 onClick 표현식이 정확히 `() => setActiveTab(tab.key)` 이다', () => {
    const normalized = onClick.replace(/\s+/g, ' ').trim();
    expect(
      normalized,
      `탭 onClick 을 감싸거나 바꾸셨나요? 그렇다면 이 테스트가 검사하는 대상이 더 이상\n` +
        `실제 동작을 대표하지 않으므로, 감싼 함수까지 검사하도록 이 파일을 갱신해야 합니다.\n` +
        `실제 코드: ${normalized}`,
    ).toBe('{() => setActiveTab(tab.key)}');
  });
});

describe('의미가 바뀐 세터의 옛 이름이 되살아나지 않았다', () => {
  it('setMoreSub / setAttendanceNav 호출이 App.tsx 에 없다', () => {
    // 주석 안의 언급은 허용(왜 개명했는지 설명하고 있다). 실제 호출만 막는다.
    const withoutComments = APP_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(withoutComments).not.toMatch(/\bsetMoreSub\s*\(/);
    expect(withoutComments).not.toMatch(/\bsetAttendanceNav\s*\(/);
  });
});
