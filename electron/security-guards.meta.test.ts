/**
 * Meta-test: BrowserWindow 신설 시 installNavigationGuard() 호출 누락 회귀 방지.
 *
 * 배경 (2026-05-07):
 * `바탕화면 정리` 위젯 박스에 파일 드롭 시 앱이 통째로 unload되는 사용자 신고를 계기로
 * 발견된 시스템적 위험 — Electron의 BrowserWindow는 dragover/drop을 누구도 preventDefault
 * 하지 않으면 드롭된 file:// URL로 navigate해 React 렌더러를 unload시킨다. 본 PDCA에서
 * preload `installDropGuard()` + main `installNavigationGuard(win)` 2-layer 방어로
 * 6개(printWin 제외) BrowserWindow 일원 보호를 도입했다.
 *
 * 본 메타 테스트는 향후 BrowserWindow 신설 시 가드 호출 누락으로 같은 크래시가 재발하지
 * 않도록 정적 grep 기반으로 강제한다.
 *
 * Design 문서: docs/02-design/features/desktop-organize-drop-crash-fix.design.md §3.6.2
 */
import { describe, expect, test } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const MAIN_TS_PATH = path.join(__dirname, 'main.ts');
const PRELOAD_TS_PATH = path.join(__dirname, 'preload.ts');

function readMainTs(): string {
  return fs.readFileSync(MAIN_TS_PATH, 'utf-8');
}

function readPreloadTs(): string {
  return fs.readFileSync(PRELOAD_TS_PATH, 'utf-8');
}

describe('electron/security-guards.ts coverage', () => {
  test('preload.ts에서 installDropGuard()를 호출한다', () => {
    const src = readPreloadTs();
    // import 문 검증
    expect(
      src,
      'preload.ts는 ./security-guards에서 installDropGuard를 import해야 한다',
    ).toMatch(/import\s*\{[^}]*installDropGuard[^}]*\}\s*from\s*['"]\.\/security-guards['"]/);
    // 호출 검증 (top-level)
    expect(
      src,
      'preload.ts는 installDropGuard()를 1회 이상 호출해야 한다',
    ).toMatch(/\binstallDropGuard\s*\(\s*\)/);
  });

  test('main.ts에서 installNavigationGuard를 import한다', () => {
    const src = readMainTs();
    expect(
      src,
      'main.ts는 ./security-guards에서 installNavigationGuard를 import해야 한다',
    ).toMatch(
      /import\s*\{[^}]*installNavigationGuard[^}]*\}\s*from\s*['"]\.\/security-guards['"]/,
    );
  });

  test('main.ts의 모든 BrowserWindow 신설마다 installNavigationGuard 호출이 존재한다 (printWin 제외)', () => {
    const src = readMainTs();

    // BrowserWindow 신설 카운트 — 주석 안 패턴은 포함될 수 있으나
    // 본 코드베이스에 그런 경우 없음 (실제 확인 완료)
    const browserWindowMatches = src.match(/new BrowserWindow\(/g) ?? [];
    const browserWindowCount = browserWindowMatches.length;

    // installNavigationGuard 호출 카운트 (import 라인은 함수 호출 형식이 아니므로 자연 제외)
    const guardCallMatches = src.match(/installNavigationGuard\s*\(/g) ?? [];
    const guardCallCount = guardCallMatches.length;

    // 의도적 예외:
    //   - printWin (electron/main.ts:~2955) — hidden + ephemeral PDF 인쇄 전용,
    //     사용자 입력 노출 0이라 가드 미적용
    const INTENTIONAL_EXEMPTIONS = 1; // printWin

    const expectedGuardCalls = browserWindowCount - INTENTIONAL_EXEMPTIONS;

    expect(
      guardCallCount,
      `BrowserWindow 신설 ${browserWindowCount}건 중 ${expectedGuardCalls}건이 installNavigationGuard 호출을 가져야 한다 ` +
        `(printWin ${INTENTIONAL_EXEMPTIONS}건 의도적 예외). 현재 ${guardCallCount}건. ` +
        `신규 BrowserWindow 추가 시 생성 직후 installNavigationGuard(win) 호출을 추가하세요. ` +
        `Design §3.2 참조.`,
    ).toBe(expectedGuardCalls);
  });

  test('각 주요 BrowserWindow(quickAdd/sticker/icon/main/widget)마다 installNavigationGuard 호출이 짝지어진다', () => {
    const src = readMainTs();
    // 각 BrowserWindow 변수별로 installNavigationGuard 호출 검증
    const expectedPairs: Array<{ winVar: string; description: string }> = [
      { winVar: 'quickAddWindow', description: '글로벌 단축키 quick-add 창' },
      { winVar: 'stickerPickerWindow', description: '이모티콘 picker 창' },
      { winVar: 'iconWindow', description: '아이콘 모드 floating 창' },
      { winVar: 'mainWindow', description: '메인 앱 창' },
      { winVar: 'widgetWindow', description: '위젯 창' },
    ];

    for (const { winVar, description } of expectedPairs) {
      const callPattern = new RegExp(`installNavigationGuard\\s*\\(\\s*${winVar}\\s*\\)`);
      expect(
        src,
        `${winVar} (${description})에 installNavigationGuard 호출이 없다`,
      ).toMatch(callPattern);
    }
  });
});
