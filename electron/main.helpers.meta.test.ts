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
});
