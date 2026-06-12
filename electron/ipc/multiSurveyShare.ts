/**
 * multiSurveyShare.ts — MultiSurvey v2 교실 화면(Share view) Electron IPC 핸들러.
 *
 * IPC 채널:
 *   multi-survey-share:open     — 교사 콘솔에서 Share window 열기 (entryUrl 포함)
 *   multi-survey-share:snapshot — liveSession 스냅샷을 Share window로 중계
 *   multi-survey-share:close    — Share window 닫기
 *
 * 주의: Share window는 세션마다 새로 생성하고 close 시 destroy한다 (hide 재사용 없음).
 *
 * security-guards.ts: buildMultiSurveyShareWindow 에서 installNavigationGuard 호출 필수.
 * (security-guards.meta.test.ts — BrowserWindow 카운트 검증)
 */

import { ipcMain, BrowserWindow } from 'electron';
import path from 'path';
import { installNavigationGuard } from '../security-guards';

/** 현재 열려 있는 Share window (세션 당 최대 1개) */
let multiSurveyShareWindow: BrowserWindow | null = null;

/**
 * 마지막 스냅샷 캐시 — Share window를 라이브 도중 늦게 열거나 새로고침해도
 * 다음 phase/응답 이벤트를 기다리지 않고 즉시 현재 상태를 표시하기 위함.
 * (자동 넘김 OFF면 다음 이벤트가 한참 없을 수 있어 빈 대기 화면에 갇힌다)
 */
let lastSnapshot: unknown = null;

/**
 * Share view BrowserWindow 생성.
 * 두 번째 모니터 전체화면 사용이 목적이므로 fullscreen: true.
 * 단일 모니터 환경에서는 최대화된 일반 창으로 열린다.
 */
function buildMultiSurveyShareWindow(entryUrl: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: false,
    resizable: true,
    minimizable: true,
    maximizable: true,
    title: '쌤핀 — 교실 화면',
    backgroundColor: '#0a0e17',
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  // 보안: file:// drop navigate 차단 — 모든 BrowserWindow 필수
  installNavigationGuard(win);

  const queryBase: Record<string, string> = {
    mode: 'msShare',
    entryUrl,
  };

  if (process.env['VITE_DEV_SERVER_URL']) {
    const qs = new URLSearchParams(queryBase).toString();
    void win.loadURL(`${process.env['VITE_DEV_SERVER_URL']}?${qs}`);
  } else {
    void win.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: queryBase,
    });
  }

  // 로드 완료 시 캐시된 마지막 스냅샷 재전송 (늦은 오픈·새로고침 대응)
  win.webContents.on('did-finish-load', () => {
    if (win.isDestroyed()) return;
    if (lastSnapshot !== null) {
      win.webContents.send('multi-survey-share:snapshot', lastSnapshot);
    }
  });

  win.on('closed', () => {
    multiSurveyShareWindow = null;
  });

  return win;
}

/**
 * MultiSurvey Share IPC 핸들러 등록.
 * app ready 이후 mainWindow 생성 직후에 호출한다.
 */
export function registerMultiSurveyShareHandlers(_mainWindow: BrowserWindow): void {
  // multi-survey-share:open — Share window 열기 (없으면 새로 생성, 있으면 포커스)
  ipcMain.handle('multi-survey-share:open', (_event, payload: unknown) => {
    // IPC 입력 검증 — entryUrl 비문자열/비객체 payload 거부
    if (typeof payload !== 'object' || payload === null) return;
    const entryUrl = (payload as Record<string, unknown>)['entryUrl'];
    if (typeof entryUrl !== 'string') return;
    if (multiSurveyShareWindow && !multiSurveyShareWindow.isDestroyed()) {
      multiSurveyShareWindow.focus();
      return;
    }
    multiSurveyShareWindow = buildMultiSurveyShareWindow(entryUrl);
    multiSurveyShareWindow.once('ready-to-show', () => {
      if (!multiSurveyShareWindow || multiSurveyShareWindow.isDestroyed()) return;
      multiSurveyShareWindow.show();
    });
  });

  // multi-survey-share:snapshot — 교사 콘솔 → Share window 스냅샷 중계 (one-way)
  ipcMain.on('multi-survey-share:snapshot', (_event, snapshot: unknown) => {
    lastSnapshot = snapshot;
    if (!multiSurveyShareWindow || multiSurveyShareWindow.isDestroyed()) return;
    multiSurveyShareWindow.webContents.send('multi-survey-share:snapshot', snapshot);
  });

  // multi-survey-share:close — Share window 닫기 (라이브 종료 시 콘솔이 호출 → 캐시도 폐기)
  ipcMain.handle('multi-survey-share:close', () => {
    lastSnapshot = null;
    if (multiSurveyShareWindow && !multiSurveyShareWindow.isDestroyed()) {
      multiSurveyShareWindow.destroy();
      multiSurveyShareWindow = null;
    }
  });
}
