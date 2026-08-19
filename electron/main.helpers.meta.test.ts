/**
 * Meta-test: electron/main.ts의 윈도우 브로드캐스트 패턴 회귀 방지.
 *
 * 배경:
 * 과거 main.ts에는 `[mainWindow, widgetWindow]` 인라인 배열과 `mainWindow.webContents.send` +
 * `widgetWindow.webContents.send` 짝 패턴이 8곳 이상 흩어져 있어, 새 윈도우(iconWindow 등)
 * 추가 시 한 곳만 빠뜨려도 silent bug가 발생할 위험이 있었다. 이 테스트는 모든 브로드캐스트
 * 패턴이 `getAllAppWindows()` 헬퍼 또는 `broadcastToAllWindows()`를 통과하는지 강제한다.
 *
 * 향후 iconWindow 추가 시 `getAllAppWindows()` 한 곳만 수정하면 모든 사이트에 자동 반영된다.
 */
import { describe, expect, test } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const MAIN_TS_PATH = path.join(__dirname, 'main.ts');

function readMainTs(): string {
  return fs.readFileSync(MAIN_TS_PATH, 'utf-8');
}

describe('electron/main.ts window broadcast helpers', () => {
  test('getAllAppWindows() 헬퍼 함수가 정의되어 있다', () => {
    const src = readMainTs();
    expect(src).toMatch(/function getAllAppWindows\s*\(\s*\)\s*:\s*BrowserWindow\[\]/);
  });

  test('broadcastToAllWindows() 헬퍼 함수가 정의되어 있다', () => {
    const src = readMainTs();
    expect(src).toMatch(/function broadcastToAllWindows\s*\(/);
  });

  test('인라인 [mainWindow, widgetWindow] 배열 패턴이 0건이다', () => {
    const src = readMainTs();
    // 공백/줄바꿈 변형까지 포착하기 위해 유연한 정규식
    const matches = src.match(/\[\s*mainWindow\s*,\s*widgetWindow\s*\]/g);
    expect(matches, '윈도우 배열은 getAllAppWindows() 헬퍼를 사용해야 한다').toBeNull();
  });

  test('autoUpdater 이벤트 핸들러에 mainWindow + widgetWindow 짝 send 패턴이 없다', () => {
    const src = readMainTs();
    // autoUpdater.on('event', ...) 안에서 mainWindow.webContents.send와 widgetWindow.webContents.send가
    // 함께 등장하는 패턴 검출 (broadcastToAllWindows로 대체되어야 함)
    const autoUpdaterBlocks = src.match(/autoUpdater\.on\([^)]+\)[^}]+?\}\s*\);/gs) ?? [];
    for (const block of autoUpdaterBlocks) {
      const hasMainSend = /mainWindow\.webContents\.send/.test(block);
      const hasWidgetSend = /widgetWindow\.webContents\.send/.test(block);
      expect(
        hasMainSend && hasWidgetSend,
        `autoUpdater 핸들러에 main+widget 짝 send 패턴 발견. broadcastToAllWindows() 사용 권장:\n${block.slice(0, 200)}`,
      ).toBe(false);
    }
  });

  test('analytics:flush 송신 시 main + widget 짝 send 패턴이 없다', () => {
    const src = readMainTs();
    // 'analytics:flush' 라는 채널명을 mainWindow + widgetWindow 양쪽으로 직접 보내는 패턴 검출
    const mainAnalytics = /mainWindow\.webContents\.send\(\s*['"]analytics:flush['"]/.test(src);
    const widgetAnalytics = /widgetWindow\.webContents\.send\(\s*['"]analytics:flush['"]/.test(src);
    expect(
      mainAnalytics && widgetAnalytics,
      'analytics:flush는 broadcastToAllWindows를 사용해야 한다',
    ).toBe(false);
  });

  test('data:changed 브로드캐스트 시 main + widget 짝 send 패턴이 없다', () => {
    const src = readMainTs();
    const mainDataChanged = /mainWindow\.webContents\.send\(\s*['"]data:changed['"]/.test(src);
    const widgetDataChanged = /widgetWindow\.webContents\.send\(\s*['"]data:changed['"]/.test(src);
    expect(
      mainDataChanged && widgetDataChanged,
      'data:changed는 broadcastToAllWindows를 사용해야 한다',
    ).toBe(false);
  });

  test('위젯 창 크기는 setBounds 를 직접 부르지 않는다 — 전부 applyWidgetWindowBounds 를 거친다', () => {
    // 2026-08-19 실측: 175% 배율에서 setBounds(W) 직후 getBounds() 는 W+1 을 돌려주고,
    // 그 값을 다시 지정하면 또 +1 이다(100% 에서는 오차 0). 그래서 "재서 → 고쳐서 →
    // 다시 지정"하는 코드는 부를 때마다 위젯을 키웠고, 드래그 한 번에 +4 DIP 씩 자라
    // 위젯 오른쪽이 화면 밖(옆 모니터)으로 밀려났다. 커진 값이 파일에도 저장돼
    // 재시작 후에도 이어졌다.
    //
    // setBounds 를 직접 부르면 그 크기가 "의도"로 기록되지 않아, 다음 측정에서
    // "사용자가 크기를 바꿨다"로 오인되고 래칫이 되살아난다.
    const sources: readonly [string, string][] = [
      ['electron/main.ts', readMainTs()],
      [
        'electron/desktopWidgetManager.ts',
        fs.readFileSync(path.join(__dirname, 'desktopWidgetManager.ts'), 'utf-8'),
      ],
    ];

    for (const [name, src] of sources) {
      const rawWrites = src.match(/\b(widgetWindow|cachedWidgetWindow|win)\.setBounds\s*\(/g) ?? [];
      expect(
        rawWrites.length,
        `${name} 이 위젯 창에 setBounds 를 직접 부른다 (${rawWrites.join(', ')}) — ` +
          'applyWidgetWindowBounds 를 써야 소수 배율 래칫이 안 생긴다',
      ).toBe(0);
    }
  });

  test('위젯 위치 저장은 잰 값이 아니라 의도값을 쓴다', () => {
    // 잰 값을 저장하면 불어난 크기가 widget-bounds.json 에 남아 재시작 후에도 이어진다.
    const src = readMainTs();
    const start = src.indexOf('function scheduleWidgetBoundsSave(');
    expect(start, 'scheduleWidgetBoundsSave() 를 찾지 못했다').toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf('\n}\n', start));

    expect(body, '저장 경로가 의도값을 안 쓴다').toContain('readWidgetWindowBounds(');
    expect(body, '저장 경로가 잰 값을 그대로 쓴다').not.toMatch(/widgetWindow\.getBounds\s*\(/);
  });

  test('위젯 복구에 느슨한 clampWidgetBoundsToWorkArea 를 쓰지 않는다', () => {
    // 2026-08-19 신고 재발 방지.
    // clampWidgetBoundsToWorkArea 의 규칙은 "최소 가시량(헤더 40px)만 남으면 통과"다.
    // 드래그 중 화면 가장자리에 붙이는 것을 허용하려고 일부러 느슨하게 만든 규칙이라,
    // 복구에 쓰면 화면 밖으로 나간 위젯이 "화면 바닥의 40px 띠"가 된 채 복구 완료로
    // 처리된다 — 선생님 눈에는 여전히 위젯이 없다. 특히 바탕화면 아래 모드에서는
    // 그 띠마저 바탕화면 아이콘 뒤라 아무것도 안 보인다.
    // 복구는 placeWidgetFullyInsideWorkArea(통째로 화면 안)만 쓴다.
    const src = readMainTs();
    const looseCalls = src.match(/clampWidgetBoundsToWorkArea\s*\(/g) ?? [];
    expect(
      looseCalls.length,
      'main.ts 가 느슨한 clamp 를 호출한다 — 복구 자리는 placeWidgetFullyInsideWorkArea 로 정해야 한다',
    ).toBe(0);
    expect(src, '복구 경로가 placeWidgetFullyInsideWorkArea 를 쓰지 않는다').toContain(
      'placeWidgetFullyInsideWorkArea(',
    );
  });
});
