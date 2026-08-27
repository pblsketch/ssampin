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

/**
 * 트레이 메뉴 템플릿 부분만 잘라 낸다 — 파일 다른 곳의 같은 문자열에 속지 않도록.
 *
 * 2026-08-27: 기준점이 `createTray()` 에서 `buildTrayMenuTemplate()` 로 바뀌었다.
 * 모니터 구성이 달라지면 메뉴를 **다시 그려야** 해서(옆핀 모니터 목록) 항목 조립을
 * 별도 함수로 뺐기 때문이다. 검사하는 내용은 그대로다.
 */
function trayMenuSource(): string {
  const source = readMainTs();
  const start = source.indexOf('function buildTrayMenuTemplate()');
  expect(
    start,
    'buildTrayMenuTemplate() 를 찾지 못했다 — 트레이 메뉴 조립이 옮겨졌는가?',
  ).toBeGreaterThan(-1);
  const end = source.indexOf('\n}\n', start);
  expect(end, '트레이 메뉴 템플릿의 끝을 찾지 못했다').toBeGreaterThan(start);
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

  test('위젯 위치 초기화는 위젯을 안 연 상태에서도 저장값을 고치고, 실제로 위젯을 띄운다', () => {
    // 2026-08-19 신고 재발 방지. 위젯을 화면 밖으로 놓친 사람에게 이 메뉴는 유일한
    // 탈출구인데, 하필 그 상황에서 아무 일도 하지 않았다:
    //   ① 위젯 창이 살아 있을 때만 동작 → 전체 앱·아이콘 모드에서는 통째로 no-op.
    //      위젯을 잃어버리면 위젯 모드로 갈 수도 없으니 영영 못 되찾는 순환에 갇힌다.
    //   ② 좌표만 고치고 창을 안 띄움 → 화면에는 아무 변화가 없어 "고장 났다"로 보인다.
    const menu = trayMenuSource();
    const menuStart = menu.indexOf("label: '위젯 위치 초기화'");
    expect(menuStart, '위젯 위치 초기화 항목을 찾지 못했다').toBeGreaterThan(-1);
    expect(menu.slice(menuStart, menuStart + 300)).toContain('resetWidgetPosition()');

    const source = readMainTs();
    const fnStart = source.indexOf('async function resetWidgetPosition(');
    expect(fnStart, 'resetWidgetPosition() 을 찾지 못했다').toBeGreaterThan(-1);
    const fn = source.slice(fnStart, source.indexOf('\n}\n', fnStart));

    const savePos = fn.indexOf('saveWidgetBounds(');
    const guardPos = fn.indexOf('if (widgetWindow');
    expect(savePos, '저장값을 고치지 않는다').toBeGreaterThan(-1);
    expect(guardPos, '살아 있는 위젯 창을 옮기지 않는다').toBeGreaterThan(-1);
    expect(
      savePos,
      '저장이 "위젯 창이 있으면" 조건 안에 갇혀 있다 — 창이 없으면 또 no-op이 된다',
    ).toBeLessThan(guardPos);

    expect(fn, '초기화만 하고 위젯을 띄우지 않는다').toContain("executeWindowTransition('widget')");
    expect(fn, '되돌린 자리가 화면 안이라는 보장이 없다').toContain('resolveWidgetResetBounds(');
  });

  test('아이콘 위치 초기화도 아이콘을 안 연 상태에서 저장값을 고치고, 아이콘을 띄운다', () => {
    // 위젯과 같은 계열의 구멍이었다 — 아이콘 창이 없으면 통째로 no-op이라,
    // 저장값이 그대로 남아 다음에 아이콘 모드로 가면 또 화면 밖에서 시작했다.
    const menu = trayMenuSource();
    const menuStart = menu.indexOf("label: '아이콘 위치 초기화'");
    expect(menuStart, '아이콘 위치 초기화 항목을 찾지 못했다').toBeGreaterThan(-1);
    expect(menu.slice(menuStart, menuStart + 300)).toContain('resetIconPosition()');

    const source = readMainTs();
    const fnStart = source.indexOf('async function resetIconPosition(');
    expect(fnStart, 'resetIconPosition() 을 찾지 못했다').toBeGreaterThan(-1);
    const fn = source.slice(fnStart, source.indexOf('\n}\n', fnStart));

    const savePos = fn.indexOf('saveIconBounds(');
    const guardPos = fn.indexOf('if (iconWindow');
    expect(savePos, '저장값을 고치지 않는다').toBeGreaterThan(-1);
    expect(guardPos, '살아 있는 아이콘 창을 옮기지 않는다').toBeGreaterThan(-1);
    expect(
      savePos,
      '저장이 "아이콘 창이 있으면" 조건 안에 갇혀 있다 — 창이 없으면 또 no-op이 된다',
    ).toBeLessThan(guardPos);

    expect(fn, '초기화만 하고 아이콘을 띄우지 않는다').toContain("executeWindowTransition('icon')");
    expect(fn, '확장 상태를 접지 않아 렌더러와 창 크기가 어긋난다').toContain(
      'collapseIconWindow()',
    );
  });

  test('위치 초기화는 예약된 아이콘 저장을 먼저 끊는다 — 되돌린 값이 덮어써지면 안 된다', () => {
    // scheduleIconBoundsSave 는 저장할 좌표를 인자로 붙잡아 둔다(위젯 쪽과 다르다).
    // 끊지 않으면 초기화 500ms 뒤에 예약분이 깨어나 옛 좌표를 다시 써 넣는다.
    // 아이콘을 화면 밖으로 끌어 놓친 직후 메뉴를 여는 흐름이 정확히 그 500ms 안이다.
    const source = readMainTs();
    expect(source, 'cancelScheduledIconBoundsSave() 헬퍼가 없다').toMatch(
      /function cancelScheduledIconBoundsSave\s*\(\s*\)/,
    );

    for (const [name, marker] of [
      ['트레이', 'async function resetIconPosition('],
      ['핀 우클릭 메뉴', "ipcMain.handle('icon:reset-position'"],
    ] as const) {
      const start = source.indexOf(marker);
      expect(start, `${name} 초기화 경로를 찾지 못했다`).toBeGreaterThan(-1);
      const body = source.slice(start, source.indexOf('\n  });\n', start) + 1);
      const scoped = body.length > 0 ? body : source.slice(start, start + 1200);
      expect(scoped, `${name} 초기화가 예약된 저장을 끊지 않는다`).toContain(
        'cancelScheduledIconBoundsSave()',
      );
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

  test('옆핀 모니터 선택이 트레이에 있다 — 옆핀을 안 연 상태에서도 고를 수 있어야 한다', () => {
    // 이 메뉴가 유일한 진입점이다(설정 화면 미구현). 조용히 빠지면 기능 전체에 닿지 못한다.
    const menu = trayMenuSource();
    expect(menu, '트레이 메뉴가 옆핀 모니터 항목을 붙이지 않는다').toContain(
      '...buildSidePinDisplayMenu()',
    );

    const source = readMainTs();
    const start = source.indexOf('function buildSidePinDisplayMenu(');
    expect(start, 'buildSidePinDisplayMenu() 를 찾지 못했다').toBeGreaterThan(-1);
    const fn = source.slice(start, source.indexOf('\n}\n', start));

    expect(fn, '"자동(주 모니터)"으로 되돌릴 길이 없다').toContain("label: '자동 (주 모니터)'");
    expect(fn, '옆핀이 떠 있을 때 곧바로 옮기지 않는다').toContain('setPreferredDisplay(');
    expect(fn, '옆핀을 안 연 상태에서 저장값을 고치지 않는다').toContain(
      'setSidePinPreferredDisplayInFile(',
    );
    // 모니터가 한 대뿐이면 고를 것이 없다 — 눌러도 아무 일이 없는 메뉴를 두지 않는다.
    expect(fn, '모니터가 한 대뿐일 때도 메뉴를 만든다').toContain('length < 2');
  });

  test('모니터를 꽂거나 빼면 트레이 메뉴를 다시 그린다', () => {
    // 메뉴는 만들 때 한 번 그려진다. 다시 그리지 않으면 새로 꽂은 모니터가
    // 목록에 영영 안 나오고, 뽑은 모니터가 계속 남는다.
    const source = readMainTs();
    expect(source, '모니터 연결 시 트레이 메뉴를 다시 그리지 않는다').toContain(
      "screen.on('display-added', refreshTrayMenu)",
    );
    expect(source, '모니터 해제 시 트레이 메뉴를 다시 그리지 않는다').toContain(
      "screen.on('display-removed', refreshTrayMenu)",
    );
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
