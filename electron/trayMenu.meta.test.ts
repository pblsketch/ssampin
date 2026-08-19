/**
 * Meta-test: 트레이 메뉴에서 창 모드가 빠지는 회귀 방지.
 *
 * 배경 (2026-08-19):
 * 옆핀은 위젯·아이콘과 같은 계열의 **네 번째 창 모드**로 확정됐는데(2026-08-14),
 * 작업표시줄 트레이 메뉴에만 빠져 있었다. 그래서 설정에서 "앱 닫기 동작"을 옆핀으로
 * 바꿔 두지 않은 사람은 **옆핀으로 갈 길이 아예 없었다** — 기능은 있는데 닿지 못하는
 * 상태였다(v2.3.7의 "원리적으로 도달 불가능한 표시 조건"과 같은 계열의 사고).
 *
 * `main.ts`가 6천 줄이 넘어 메뉴 항목 하나는 리팩터링 중 조용히 사라지기 쉽다.
 * 사라져도 빌드·타입 검사는 통과하고 화면에도 오류가 없다 — 사람이 트레이를 열어
 * 눈으로 봐야만 안다. 그래서 정적 grep으로 못박는다.
 */
import { describe, expect, test } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const MAIN_TS_PATH = path.join(__dirname, 'main.ts');

function readMainTs(): string {
  return fs.readFileSync(MAIN_TS_PATH, 'utf-8');
}

/** 트레이 메뉴 템플릿 부분만 잘라 낸다 — 파일 다른 곳의 같은 문자열에 속지 않도록 */
function trayMenuSource(): string {
  const source = readMainTs();
  const start = source.indexOf('function createTray()');
  expect(start, 'createTray() 를 찾지 못했다 — 트레이 구현이 옮겨졌는가?').toBeGreaterThan(-1);
  const end = source.indexOf('tray.setContextMenu', start);
  expect(end, 'tray.setContextMenu 를 찾지 못했다').toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('트레이 메뉴에 창 모드가 모두 있다', () => {
  // WindowMode = 'icon' | 'widget' | 'main' | 'sidePin' (main.ts 의 미러 타입)
  const MODES: readonly { readonly target: string; readonly label: string }[] = [
    { target: 'main', label: '쌤핀 열기' },
    { target: 'widget', label: '위젯 모드' },
    { target: 'icon', label: '아이콘 모드' },
    { target: 'sidePin', label: '옆핀 모드' },
  ];

  test.each(MODES)('$label 로 갈 수 있다', ({ target, label }) => {
    const menu = trayMenuSource();
    expect(menu, `트레이 메뉴에 "${label}" 항목이 없다`).toContain(`label: '${label}'`);
    expect(menu, `"${label}" 이 executeWindowTransition('${target}') 를 부르지 않는다`).toContain(
      `executeWindowTransition('${target}')`,
    );
  });

  test('위치 초기화가 세 모드에 다 있다 — 되돌릴 길은 한자리에 모여 있어야 한다', () => {
    const menu = trayMenuSource();
    for (const label of ['위젯 위치 초기화', '아이콘 위치 초기화', '옆핀 손잡이 위치 초기화']) {
      expect(menu, `트레이 메뉴에 "${label}" 이 없다`).toContain(`label: '${label}'`);
    }
  });

  test('옆핀 위치 초기화는 옆핀을 안 연 상태에서도 저장값을 고친다', () => {
    // 옆핀 창이 없다고 그냥 돌아가 버리면, 한 번 이상한 자리에 둔 사람은 옆핀을
    // 열기 전에는 되돌릴 수 없고 열면 또 그 자리에 뜨는 순환에 갇힌다.
    const menu = trayMenuSource();
    const start = menu.indexOf("label: '옆핀 손잡이 위치 초기화'");
    expect(start, '옆핀 위치 초기화 항목을 찾지 못했다').toBeGreaterThan(-1);
    const item = menu.slice(start, start + 900);
    expect(item, '옆핀이 떠 있을 때 service 를 부르지 않는다').toContain('resetRailPosition()');
    expect(item, '옆핀이 없을 때 저장값을 고치지 않는다').toContain('saveSidePinDeviceState(');
  });

  test('옆핀 항목은 눌러도 아무 일이 없으면 안 된다 — 꺼져 있어도 켜져야 한다', () => {
    // 옆핀에는 별도의 켜짐 설정이 있고 기본값이 꺼짐이다. 전환 분기가 enable()을
    // 함께 부르지 않으면, 메뉴는 있는데 눌러도 아무 일이 없는 상태가 된다.
    const source = readMainTs();
    const start = source.indexOf("case 'sidePin': {");
    expect(start, "executeWindowTransition 의 case 'sidePin' 을 찾지 못했다").toBeGreaterThan(-1);
    const branch = source.slice(start, source.indexOf('break;', start));
    expect(branch, "case 'sidePin' 이 옆핀을 켜지 않는다").toContain('enable()');
  });
});
