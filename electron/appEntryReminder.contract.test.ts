import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * 할 일 알람 훅이 **어느 창에서 도는지**를 소스 구간으로 잠근다.
 *
 * **왜 이 방식인가.** 바탕화면 위젯·아이콘·빠른 입력·스티커·멀티설문 공유 창은 전부
 * 같은 `index.html`·같은 번들을 로드하고, `src/main.tsx` 가 무조건 `<App/>` 을 렌더한다.
 * 즉 "진입점이 무엇을 import 하는가"로는 이 창들을 **원리적으로 구분할 수 없다.**
 * 그래서 소스를 읽어 **함수 구간을 잘라 그 안만** 확인한다
 * (`electron/sidePinEntry.contract.test.ts` 가 같은 도구를 쓴다).
 *
 * **무엇을 막는가.** 훅이 분기 함수 `App()` 이나 `WidgetApp()` 쪽으로 올라가면 최대 6개
 * 창이 같은 `'todo'` 칸에 예약을 밀어 넣어 **서로의 알람을 조용히 덮어쓴다.**
 * "출처당 생산자는 정확히 하나"라는 약속이 깨지는 것인데, 아무 에러도 안 나고 알림만
 * 어긋나므로 사람 눈으로는 몇 달이 지나도 못 찾는다.
 */

const HOOK = 'useTodoAlarmOsPush';

function source(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

/** `function 이름(` 부터 다음 최상위 `function ` 직전까지를 잘라 낸다. */
function sliceFunction(src: string, header: string, nextHeader: string): string {
  const start = src.indexOf(header);
  expect(
    start,
    `${header} 를 찾지 못했다 — 함수 이름이 바뀌었다면 이 테스트도 함께 고쳐야 한다`,
  ).toBeGreaterThan(-1);
  const end = src.indexOf(nextHeader, start);
  expect(end, `${nextHeader} 를 찾지 못했다`).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('할 일 알람 훅 배치 계약', () => {
  test('창을 고르는 분기 함수 App() 안에는 알람 훅이 없다', () => {
    const app = source('src/App.tsx');
    const branch = sliceFunction(app, 'export function App() {', 'function IconApp() {');

    expect(branch).not.toContain(HOOK);
  });

  test('위젯 창(WidgetApp) 안에는 알람 훅이 없다', () => {
    const app = source('src/App.tsx');
    const widget = sliceFunction(app, 'function WidgetApp() {', 'function MainApp() {');

    expect(widget).not.toContain(HOOK);
  });

  test('메인 화면(MainApp) 안에는 알람 훅이 있다', () => {
    const app = source('src/App.tsx');
    const start = app.indexOf('function MainApp() {');
    expect(start).toBeGreaterThan(-1);

    expect(app.slice(start)).toContain(`${HOOK}()`);
  });

  test('옆핀 진입점은 알람 훅도, 공용 App 도 가져오지 않는다', () => {
    const entry = source('src/sidepin-main.tsx');

    expect(entry).not.toContain(HOOK);
    expect(entry).not.toContain("from './App'");
  });

  test('알람 훅은 남의 예약까지 지우는 인자 없는 전체 삭제를 부르지 않는다', () => {
    const hook = source('src/adapters/hooks/useTodoAlarmOsPush.ts');

    // 주석에 적은 경고 문구까지 잡히면 설명을 잘 달수록 빨간불이 되므로 코드 줄만 본다.
    const codeOnly = hook
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//') && !line.trimStart().startsWith('*'))
      .join('\n');

    expect(codeOnly).not.toMatch(/clearReminderSchedule\(\s*\)/);
    expect(codeOnly).toContain("clearReminderSchedule('todo')");
  });
});
