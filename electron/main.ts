import { app, BrowserWindow, ipcMain, screen, dialog, shell, Tray, Menu, nativeImage, powerMonitor, globalShortcut, clipboard } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { autoUpdater } from 'electron-updater';
import { registerOAuthHandlers } from './ipc/oauth';
import { registerPKCEFallbackHandlers } from './ipc/oauthPKCEFallback';
import { registerSecureStorageHandlers } from './ipc/secureStorage';
import { registerLiveVoteHandlers } from './ipc/liveVote';
import { registerLiveSurveyHandlers } from './ipc/liveSurvey';
import { registerLiveWordCloudHandlers } from './ipc/liveWordCloud';
import { registerLiveMultiSurveyHandlers } from './ipc/liveMultiSurvey';
import { registerLiveDiscussionHandlers } from './ipc/liveDiscussion';
import { registerRealtimeWallHandlers } from './ipc/realtimeWall';
import { registerRealtimeWallLinkPreviewHandler } from './ipc/realtimeWallLinkPreview';
import { registerRealtimeWallPdfHandlers } from './ipc/realtimeWallPdf';
import { registerBoardHandlers, endActiveBoardSessionSync } from './ipc/board';
import {
  registerRealtimeWallBoardHandlers,
  saveDirtyWallBoardsSync,
} from './ipc/realtimeWallBoard';

declare const __dirname: string;

let mainWindow: BrowserWindow | null = null;
let widgetWindow: BrowserWindow | null = null;
let quickAddWindow: BrowserWindow | null = null;
let stickerPickerWindow: BrowserWindow | null = null;
let widgetWasActive = false;
let widgetActiveBeforeSleep = false;  // suspend/lock 시점의 스냅샷
let isSystemSuspending = false;       // 시스템 이벤트(화면보호기/잠금/절전)로 인한 close 구분 플래그
let savePositionTimer: ReturnType<typeof setTimeout> | null = null;
let tray: Tray | null = null;
let isQuitting = false;

// 위젯 표시 모드 상태 추적: 'normal' | 'topmost'
let currentDesktopMode: string = 'normal';
let winDRecoveryTimer: ReturnType<typeof setInterval> | null = null;
let winDRecoveryDedup = false;  // minimize 핸들러와 폴링 중복 방지
let widgetBoundsBeforeLayout: WidgetBounds | null = null;

interface WidgetBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function getDataDir(): string {
  const dir = path.join(app.getPath('userData'), 'data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Sticker paste 진단 로그 — main 콘솔(stdout) + mainWindow DevTools 콘솔 양쪽에 출력.
 * 사용자가 cmd로 실행하지 않아도 DevTools에서 흐름을 볼 수 있도록 IPC로 forwarding한다.
 */
function stickerLog(message: string, data?: unknown): void {
  if (data !== undefined) {
    console.log(message, data);
  } else {
    console.log(message);
  }
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sticker:diag-log', { message, data: data === undefined ? null : data });
    }
  } catch {
    /* ignore */
  }
}

// ─── 글로벌 퀵애드 단축키 ───
type ShortcutSyncConfig = {
  globalEnabled: boolean;
  bindings: Array<{ id: string; combo: string; enabled: boolean }>;
};

function comboToAccelerator(combo: string): string {
  const tokens = combo.toLowerCase().split('+').map((t) => t.trim()).filter(Boolean);
  const mod = tokens.includes('mod') || tokens.includes('ctrl') || tokens.includes('cmd') || tokens.includes('meta');
  const alt = tokens.includes('alt') || tokens.includes('option');
  const shift = tokens.includes('shift');
  const key = tokens.find((t) => !['mod', 'ctrl', 'cmd', 'meta', 'alt', 'option', 'shift'].includes(t));
  if (!key) return '';
  const parts: string[] = [];
  if (mod) parts.push('CommandOrControl');
  if (alt) parts.push('Alt');
  if (shift) parts.push('Shift');
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts.join('+');
}

function isMainWindowVisible(): boolean {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  return mainWindow.isVisible();
}

function fadeInQuickAddWindow(): void {
  if (!quickAddWindow || quickAddWindow.isDestroyed()) return;
  const startTime = Date.now();
  const duration = 160; // ms — 부드러운 ease-out cubic
  quickAddWindow.setOpacity(0);
  const interval = setInterval(() => {
    if (!quickAddWindow || quickAddWindow.isDestroyed()) {
      clearInterval(interval);
      return;
    }
    const elapsed = Date.now() - startTime;
    const t = Math.min(1, elapsed / duration);
    // ease-out cubic: 1 - (1-t)^3
    const opacity = 1 - Math.pow(1 - t, 3);
    quickAddWindow.setOpacity(opacity);
    if (t >= 1) clearInterval(interval);
  }, 16);
}

function showQuickAddWindowAt(): void {
  if (!quickAddWindow || quickAddWindow.isDestroyed()) return;
  // 매 트리거마다 화면 중앙 재위치
  const display = screen.getPrimaryDisplay();
  const { width: areaWidth, height: areaHeight } = display.workAreaSize;
  const [winWidth, winHeight] = quickAddWindow.getSize();
  quickAddWindow.setPosition(
    Math.round(display.workArea.x + (areaWidth - winWidth) / 2),
    Math.round(display.workArea.y + areaHeight * 0.22),
  );
  quickAddWindow.show();
  quickAddWindow.focus();
}

function buildQuickAddWindow(initialKind: string, prewarm: boolean): void {
  const display = screen.getPrimaryDisplay();
  const { width: areaWidth, height: areaHeight } = display.workAreaSize;
  const winWidth = 480;
  const winHeight = 440;

  quickAddWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: Math.round(display.workArea.x + (areaWidth - winWidth) / 2),
    y: Math.round(display.workArea.y + areaHeight * 0.22),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    hasShadow: false,
    opacity: 0,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  quickAddWindow.setAlwaysOnTop(true, 'screen-saver');
  quickAddWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const queryBase: Record<string, string> = { mode: 'quickAdd', kind: initialKind };
  if (prewarm) queryBase.prewarm = '1';

  if (process.env['VITE_DEV_SERVER_URL']) {
    const qs = new URLSearchParams(queryBase).toString();
    void quickAddWindow.loadURL(`${process.env['VITE_DEV_SERVER_URL']}?${qs}`);
  } else {
    void quickAddWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: queryBase,
    });
  }

  // prewarm이면 ready-to-show에서 show 안 함 — 첫 단축키까지 hidden 대기
  if (!prewarm) {
    quickAddWindow.once('ready-to-show', () => {
      if (!quickAddWindow || quickAddWindow.isDestroyed()) return;
      showQuickAddWindowAt();
      fadeInQuickAddWindow();
    });
  }

  // 사용자가 닫기 버튼/ESC로 닫으면 → 실제 close 대신 hide (재사용 + 빠른 재오픈)
  quickAddWindow.on('close', (e) => {
    if (isQuitting) return;
    if (!quickAddWindow || quickAddWindow.isDestroyed()) return;
    e.preventDefault();
    quickAddWindow.hide();
    quickAddWindow.setOpacity(0);
  });

  quickAddWindow.on('closed', () => {
    quickAddWindow = null;
  });
}

function prewarmQuickAddWindow(): void {
  if (quickAddWindow && !quickAddWindow.isDestroyed()) return;
  buildQuickAddWindow('todo', true);
}

function createOrFocusQuickAddWindow(commandId: string): void {
  // 이미 살아있으면 (visible / hidden / prewarm) → 즉시 show + IPC로 kind 전환
  if (quickAddWindow && !quickAddWindow.isDestroyed()) {
    const wasHidden = !quickAddWindow.isVisible();
    if (quickAddWindow.isMinimized()) quickAddWindow.restore();
    showQuickAddWindowAt();
    if (wasHidden) fadeInQuickAddWindow();
    quickAddWindow.webContents.send('shortcut:triggered', commandId);
    return;
  }
  // 창 자체가 없는 경우 (prewarm 실패/예외) — 즉시 빌드 후 show
  buildQuickAddWindow(commandId.replace('quickAdd.', ''), false);
}

function destroyQuickAddWindow(): void {
  if (!quickAddWindow || quickAddWindow.isDestroyed()) return;
  // close 이벤트 우회를 위해 destroy 직접 호출
  quickAddWindow.destroy();
  quickAddWindow = null;
}

// ─── Sticker picker (내 이모티콘) — quickAdd 패턴 복제 ───
//   PRD §3.1.1 윈도우 사양: 400×480, 화면 상단 22%, frameless, alwaysOnTop, hide-on-close.
//   prewarm으로 첫 단축키 latency 제거.

function fadeInStickerPickerWindow(): void {
  if (!stickerPickerWindow || stickerPickerWindow.isDestroyed()) return;
  const startTime = Date.now();
  const duration = 160;
  stickerPickerWindow.setOpacity(0);
  const interval = setInterval(() => {
    if (!stickerPickerWindow || stickerPickerWindow.isDestroyed()) {
      clearInterval(interval);
      return;
    }
    const elapsed = Date.now() - startTime;
    const t = Math.min(1, elapsed / duration);
    // ease-out cubic: 1 - (1-t)^3
    const opacity = 1 - Math.pow(1 - t, 3);
    stickerPickerWindow.setOpacity(opacity);
    if (t >= 1) clearInterval(interval);
  }, 16);
}

function getActiveStickerDisplay(): Electron.Display {
  // 멀티 모니터: 커서가 있는 디스플레이 우선, 실패 시 primary
  try {
    return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  } catch {
    return screen.getPrimaryDisplay();
  }
}

function showStickerPickerWindowAt(): void {
  if (!stickerPickerWindow || stickerPickerWindow.isDestroyed()) return;
  const display = getActiveStickerDisplay();
  const { width: areaWidth, height: areaHeight } = display.workAreaSize;
  const [winWidth, winHeight] = stickerPickerWindow.getSize();
  stickerPickerWindow.setPosition(
    Math.round(display.workArea.x + (areaWidth - winWidth) / 2),
    Math.round(display.workArea.y + areaHeight * 0.22),
  );
  stickerPickerWindow.show();
  stickerPickerWindow.focus();
  // 사용 안 함 경고 회피 (winHeight는 인터페이스 명확성을 위해 분해)
  void winHeight;
}

function buildStickerPickerWindow(prewarm: boolean): void {
  const display = getActiveStickerDisplay();
  const { width: areaWidth, height: areaHeight } = display.workAreaSize;
  const winWidth = 400;
  const winHeight = 480;

  stickerPickerWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: Math.round(display.workArea.x + (areaWidth - winWidth) / 2),
    y: Math.round(display.workArea.y + areaHeight * 0.22),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    hasShadow: false,
    opacity: 0,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  stickerPickerWindow.setAlwaysOnTop(true, 'screen-saver');
  stickerPickerWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const queryBase: Record<string, string> = { mode: 'stickerPicker' };
  if (prewarm) queryBase.prewarm = '1';

  if (process.env['VITE_DEV_SERVER_URL']) {
    const qs = new URLSearchParams(queryBase).toString();
    void stickerPickerWindow.loadURL(`${process.env['VITE_DEV_SERVER_URL']}?${qs}`);
  } else {
    void stickerPickerWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: queryBase,
    });
  }

  if (!prewarm) {
    stickerPickerWindow.once('ready-to-show', () => {
      if (!stickerPickerWindow || stickerPickerWindow.isDestroyed()) return;
      showStickerPickerWindowAt();
      fadeInStickerPickerWindow();
    });
  }

  // close 시 destroy 대신 hide — 재사용으로 빠른 재오픈 (quickAdd 패턴)
  stickerPickerWindow.on('close', (e) => {
    if (isQuitting) return;
    if (!stickerPickerWindow || stickerPickerWindow.isDestroyed()) return;
    e.preventDefault();
    stickerPickerWindow.hide();
    stickerPickerWindow.setOpacity(0);
  });

  stickerPickerWindow.on('closed', () => {
    stickerPickerWindow = null;
  });
}

function prewarmStickerPickerWindow(): void {
  if (stickerPickerWindow && !stickerPickerWindow.isDestroyed()) return;
  buildStickerPickerWindow(true);
}

function createOrFocusStickerPickerWindow(): void {
  // 이미 살아있으면 즉시 show (prewarm 또는 hidden 상태)
  if (stickerPickerWindow && !stickerPickerWindow.isDestroyed()) {
    const wasHidden = !stickerPickerWindow.isVisible();
    if (stickerPickerWindow.isMinimized()) stickerPickerWindow.restore();
    showStickerPickerWindowAt();
    if (wasHidden) fadeInStickerPickerWindow();
    stickerPickerWindow.webContents.send('shortcut:triggered', 'sticker-picker:toggle');
    return;
  }
  buildStickerPickerWindow(false);
}

function destroyStickerPickerWindow(): void {
  if (!stickerPickerWindow || stickerPickerWindow.isDestroyed()) return;
  stickerPickerWindow.destroy();
  stickerPickerWindow = null;
}

function triggerShortcut(commandId: string): void {
  // ─── sticker-picker:toggle (PRD §3.1.3) ───
  // 토글 동작: 피커가 visible이면 hide, 아니면 항상 별도 팝업으로 띄운다.
  // ★ 메인창 visible 여부와 무관 — 다른 quickAdd 단축키와 달리 sticker picker는
  //   별도 frameless BrowserWindow이므로 mainWindow에 IPC를 보내봤자 처리 핸들러가 없다.
  //   COMMAND_TO_KIND 매핑이 없는 commandId라 useGlobalShortcuts onShortcutTriggered가 무시함.
  if (commandId === 'sticker-picker:toggle') {
    if (stickerPickerWindow && !stickerPickerWindow.isDestroyed() && stickerPickerWindow.isVisible()) {
      stickerPickerWindow.hide();
      stickerPickerWindow.setOpacity(0);
      return;
    }
    createOrFocusStickerPickerWindow();
    return;
  }

  if (isMainWindowVisible()) {
    // 메인 창이 떠있으면 (최소화 포함) 메인 창에 인앱 모달
    if (mainWindow!.isMinimized()) mainWindow!.restore();
    mainWindow!.focus();
    mainWindow!.webContents.send('shortcut:triggered', commandId);
    return;
  }
  // 메인 창이 hidden/destroyed (위젯 모드 또는 트레이 상태) → 별도 팝업 창
  createOrFocusQuickAddWindow(commandId);
}

function applyGlobalShortcuts(config: ShortcutSyncConfig): { registered: string[]; failed: string[] } {
  globalShortcut.unregisterAll();
  const registered: string[] = [];
  const failed: string[] = [];
  if (!config.globalEnabled) {
    console.log('[shortcuts] globalEnabled=false, skipping all registrations');
    return { registered, failed };
  }
  console.log(`[shortcuts] applying ${config.bindings.length} bindings`);
  for (const b of config.bindings) {
    if (!b.enabled) continue;
    const accel = comboToAccelerator(b.combo);
    if (!accel) {
      console.log(`[shortcuts] ${b.id} → "${b.combo}" REGISTRATION FAILED (invalid accelerator)`);
      failed.push(b.id);
      continue;
    }
    try {
      const ok = globalShortcut.register(accel, () => {
        triggerShortcut(b.id);
      });
      if (ok) {
        console.log(`[shortcuts] ${b.id} → ${accel} (registered)`);
        registered.push(b.id);
      } else {
        console.log(`[shortcuts] ${b.id} → ${accel} REGISTRATION FAILED (likely OS-level conflict)`);
        failed.push(b.id);
        // PRD §3.1.4 — sticker 단축키 등록 실패 시 메인 창에 토스트용 이벤트
        if (b.id === 'sticker-picker:toggle' && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('sticker:shortcut-conflict', { combo: b.combo });
        }
      }
    } catch (err) {
      console.error(`[shortcuts] ${b.id} → ${accel} REGISTRATION FAILED (exception)`, err);
      failed.push(b.id);
      if (b.id === 'sticker-picker:toggle' && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sticker:shortcut-conflict', { combo: b.combo });
      }
    }
  }
  return { registered, failed };
}

/**
 * 메인 창을 "위젯 모드로 전환" 상황에서 숨기거나(기본) 완전히 destroy한다.
 * 메모리 절약 모드(memorySaverMode)가 true이면 destroy하여 렌더러 프로세스를 해제한다.
 * 주의: destroy 시 상태는 파일에 이미 저장돼 있으므로 복귀 시 재생성해도 데이터 손실 없음.
 */
function hideOrDestroyMainWindow(memorySaverMode: boolean): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (memorySaverMode) {
    console.log('[memory-saver] 메인 창 destroy — 렌더러 프로세스 해제');
    // close는 close 이벤트의 preventDefault에 걸리므로 destroy 사용
    mainWindow.destroy();
    mainWindow = null;
  } else {
    mainWindow.hide();
  }
}

/**
 * 메인 창이 필요할 때 호출. 기존 창이 있으면 show+focus, 없으면 재생성.
 * 메모리 절약 모드에서 위젯 → 메인 복귀 시 사용된다.
 */
function ensureMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
}

function readWidgetBounds(): WidgetBounds | null {
  const filePath = path.join(getDataDir(), 'widget-bounds.json');
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as WidgetBounds;
  } catch {
    return null;
  }
}

function saveWidgetBounds(bounds: WidgetBounds): void {
  const filePath = path.join(getDataDir(), 'widget-bounds.json');
  fs.writeFileSync(filePath, JSON.stringify(bounds), 'utf-8');
}

function scheduleWidgetBoundsSave(): void {
  if (savePositionTimer !== null) {
    clearTimeout(savePositionTimer);
  }
  savePositionTimer = setTimeout(() => {
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      const bounds = widgetWindow.getBounds();
      saveWidgetBounds(bounds);
    }
    savePositionTimer = null;
  }, 500);
}

function getDefaultWidgetBounds(width: number): { x: number; y: number } {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
  const margin = 16;
  return {
    x: screenWidth - width - margin,
    y: margin,
  };
}

function getAppIcon(): Electron.NativeImage {
  const isMac = process.platform === 'darwin';
  const candidates = isMac
    ? [
        path.join(__dirname, '../build/icon.icns'),
        path.join(__dirname, '../build/icon.png'),
        path.join(process.resourcesPath || '', 'icon.icns'),
      ]
    : [
        path.join(__dirname, '../build/icon.ico'),
        path.join(__dirname, '../public/favicon.ico'),
        path.join(process.resourcesPath || '', 'icon.ico'),
      ];
  const found = candidates.find((p) => fs.existsSync(p));
  return found ? nativeImage.createFromPath(found) : nativeImage.createEmpty();
}

/** Setup.exe를 직접 실행하고 있는지 감지 → 경고 다이얼로그 표시 */
function checkInstallation(): void {
  if (process.platform !== 'win32') return;
  const exePath = app.getPath('exe');
  const tempDir = app.getPath('temp');
  const downloadsPatterns = ['Downloads', 'download', '다운로드'];

  const isFromTemp = exePath.toLowerCase().startsWith(tempDir.toLowerCase());
  const isFromDownloads = downloadsPatterns.some((p) =>
    exePath.toLowerCase().includes(p.toLowerCase())
  );
  const isSetupExe = path.basename(exePath).toLowerCase().includes('setup');

  if (isFromTemp || (isFromDownloads && isSetupExe)) {
    dialog.showMessageBoxSync({
      type: 'warning',
      title: '쌤핀 설치 안내',
      message: '설치 파일을 직접 실행하고 계신 것 같아요!',
      detail:
        '쌤핀을 정상적으로 사용하려면 설치가 필요해요.\n\n' +
        '현재 파일을 더블클릭하면 설치 과정이 진행됩니다.\n' +
        '설치 완료 후에는 바탕화면의 "쌤핀" 아이콘을 사용해주세요.\n\n' +
        '💡 이미 설치하셨다면, 다운로드 폴더의 Setup 파일이 아닌\n' +
        '바탕화면이나 시작 메뉴의 "쌤핀" 아이콘으로 실행해주세요.',
      buttons: ['확인'],
    });
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: '쌤핀',
    icon: getAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
    backgroundColor: '#0a0e17',
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (process.env['VITE_DEV_SERVER_URL']) {
    mainWindow.loadURL(process.env['VITE_DEV_SERVER_URL']);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      const opts = readSettingsWidgetOptions();

      if (opts.closeAction === 'ask') {
        // 매번 물어보기 — 렌더러에 다이얼로그 요청
        mainWindow?.webContents.send('close-action:ask');
        return;
      }

      if (opts.closeAction === 'widget') {
        // X 버튼 → 위젯 모드로 전환
        if (!widgetWindow || widgetWindow.isDestroyed()) {
          // 위젯이 실제로 표시된 뒤 메인 창을 숨겨/해제하여 "아무것도 안 보이는" gap 방지
          createWidgetWindow(opts, () => hideOrDestroyMainWindow(opts.memorySaverMode));
        } else {
          widgetWindow.show();
          hideOrDestroyMainWindow(opts.memorySaverMode);
        }
      } else {
        // tray: 위젯 전환 없이 트레이로만 숨김 (메모리 절약 모드와 무관)
        mainWindow?.hide();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray(): void {
  try {
    let trayIcon: Electron.NativeImage;
    if (process.platform === 'darwin') {
      // macOS: 템플릿 이미지 사용 (다크/라이트 모드 자동 대응)
      const templatePath = path.join(__dirname, '../build/iconTemplate.png');
      if (fs.existsSync(templatePath)) {
        trayIcon = nativeImage.createFromPath(templatePath);
        trayIcon.setTemplateImage(true);
      } else {
        trayIcon = getAppIcon().resize({ width: 16, height: 16 });
      }
    } else {
      trayIcon = getAppIcon().resize({ width: 16, height: 16 });
    }
    tray = new Tray(trayIcon);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '쌤핀 열기',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          } else {
            createWindow();
          }
        },
      },
      {
        label: '위젯 모드',
        click: () => {
          if (!widgetWindow || widgetWindow.isDestroyed()) {
            const widgetOptions = readSettingsWidgetOptions();
            createWidgetWindow(widgetOptions);
            hideOrDestroyMainWindow(widgetOptions.memorySaverMode);
          } else {
            widgetWindow.show();
          }
        },
      },
      {
        label: '위젯 위치 초기화',
        click: () => {
          if (widgetWindow && !widgetWindow.isDestroyed()) {
            const defaultPos = getDefaultWidgetBounds(widgetWindow.getBounds().width);
            const bounds = { x: defaultPos.x, y: defaultPos.y, width: 920, height: 700 };
            widgetWindow.setBounds(bounds);
            saveWidgetBounds(bounds);
          }
        },
      },
      { type: 'separator' },
      {
        label: '완전히 종료',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);

    tray.setToolTip('쌤핀');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      } else {
        createWindow();
      }
    });
  } catch {
    // ignore tray error if icon not found
  }
}

function applySystemSettings(): void {
  // 개발 모드에서는 자동 실행 설정하지 않음
  if (process.env['VITE_DEV_SERVER_URL']) return;

  try {
    const filePath = path.join(getDataDir(), 'settings.json');
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const settings = JSON.parse(raw);
      const autoLaunch = settings.system?.autoLaunch ?? false;

      // 이전 버전에서 name/path로 잘못 등록된 레지스트리 항목 정리
      app.setLoginItemSettings({ openAtLogin: false });

      // 올바른 설정으로 재등록 (Electron이 현재 exe 경로를 자동 사용)
      if (autoLaunch) {
        app.setLoginItemSettings({ openAtLogin: true });
      }
    }
  } catch {
    // fall through
  }
}

// ─── Win+D 복원 폴링 (양쪽 모드 모두 동작) ───
// Win+D는 모든 창을 최소화하는데, 위젯은 최소화되면 즉시 복원하여 바탕화면에 유지
function recoverWidget(): void {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  if (winDRecoveryDedup) return;
  winDRecoveryDedup = true;
  setTimeout(() => { winDRecoveryDedup = false; }, 500);

  widgetWindow.restore();
  widgetWindow.showInactive();
  if (currentDesktopMode === 'topmost') {
    widgetWindow.setAlwaysOnTop(true);
  }
}

function startWinDRecovery(): void {
  if (winDRecoveryTimer) return;

  // 백업 폴링: minimize 이벤트가 발동하지 않는 경우 대비
  winDRecoveryTimer = setInterval(() => {
    if (!widgetWindow || widgetWindow.isDestroyed()) return;
    const isHidden = widgetWindow.isMinimized() || !widgetWindow.isVisible();
    if (!isHidden) return;

    console.log(`[widget] Win+D 폴링 감지 (${currentDesktopMode}) — 복원`);
    recoverWidget();
  }, 1000);
}

function stopWinDRecovery(): void {
  if (winDRecoveryTimer) {
    clearInterval(winDRecoveryTimer);
    winDRecoveryTimer = null;
  }
}

function ensureWidgetOnScreen(): void {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  const bounds = widgetWindow.getBounds();

  // 위젯이 속한 디스플레이 찾기 (화면 밖이면 primary로 폴백)
  let display: Electron.Display;
  try {
    display = screen.getDisplayMatching(bounds);
  } catch {
    display = screen.getPrimaryDisplay();
  }
  const workArea = display.workArea;

  let { x, y, width, height } = bounds;

  // 크기가 화면보다 크면 축소
  if (width > workArea.width) width = workArea.width;
  if (height > workArea.height) height = workArea.height;

  // 완전히 화면 밖이면 기본 위치로 리셋
  const isCompletelyOutside =
    x + width < workArea.x ||
    y + height < workArea.y ||
    x > workArea.x + workArea.width ||
    y > workArea.y + workArea.height;

  if (isCompletelyOutside) {
    const defaultPos = getDefaultWidgetBounds(width);
    x = defaultPos.x;
    y = defaultPos.y;
    console.log('[widget] 화면 밖 감지 — 기본 위치로 리셋');
  } else {
    // 부분적으로 밖이면 안쪽으로 밀기
    if (x < workArea.x) x = workArea.x;
    if (y < workArea.y) y = workArea.y;
    if (x + width > workArea.x + workArea.width) x = workArea.x + workArea.width - width;
    if (y + height > workArea.y + workArea.height) y = workArea.y + workArea.height - height;
  }

  if (x !== bounds.x || y !== bounds.y || width !== bounds.width || height !== bounds.height) {
    widgetWindow.setBounds({ x, y, width, height });
    saveWidgetBounds({ x, y, width, height });
  }
}

// ─── 절전/화면보호기 복귀 시 위젯 복원 ───
let restoreDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function restoreWidgetAfterSleep(): void {
  if (isQuitting) return;

  // resume + unlock-screen 연속 발동 시 중복 방지
  if (restoreDebounceTimer) {
    clearTimeout(restoreDebounceTimer);
  }
  restoreDebounceTimer = setTimeout(() => {
    restoreDebounceTimer = null;
    doRestoreWidget().catch((err) => {
      console.error('[widget] 절전 복귀 오류:', err);
    });
  }, 300);
}

async function doRestoreWidget(): Promise<void> {
  if (isQuitting) return;

  const shouldRestore = widgetWasActive || widgetActiveBeforeSleep;

  if (widgetWindow && !widgetWindow.isDestroyed()) {
    // ── 케이스 A: 창이 살아있는 경우 ──
    console.log('[widget] 절전 복귀 — 위젯 리프레시 시도');
    const bounds = widgetWindow.getBounds();

    widgetWindow.hide();

    await new Promise<void>((resolve) => {
      setTimeout(async () => {
        if (!widgetWindow || widgetWindow.isDestroyed()) { resolve(); return; }

        widgetWindow.show();
        widgetWindow.setBounds(bounds);

        if (currentDesktopMode === 'topmost') {
          widgetWindow.setAlwaysOnTop(true);
        }

        widgetWindow.webContents.invalidate();

        // widgetWasActive 복원 (close 이벤트가 false로 만들었을 수 있음)
        if (widgetActiveBeforeSleep) {
          widgetWasActive = true;
        }

        // Win+D 복원 폴링 재시작 (close 핸들러에서 중단되었을 수 있음)
        if (process.platform === 'win32') {
          startWinDRecovery();
        }

        console.log('[widget] 절전 복귀 — 위젯 리프레시 완료');

        // 렌더러에 시스템 복귀 알림 (날짜/데이터 갱신용)
        for (const win of [mainWindow, widgetWindow]) {
          if (win && !win.isDestroyed()) {
            win.webContents.send('system:resume');
          }
        }

        // 500ms 뒤 렌더러 실제 동작 검증
        setTimeout(async () => {
          if (!widgetWindow || widgetWindow.isDestroyed()) { resolve(); return; }

          // 검증 1: visibility
          if (!widgetWindow.isVisible()) {
            console.log('[widget] 절전 복귀 — invisible, 재생성');
            recreateWidget();
            resolve(); return;
          }

          // 검증 2: 렌더러 크래시
          if (widgetWindow.webContents.isCrashed()) {
            console.log('[widget] 절전 복귀 — 렌더러 크래시, 재생성');
            recreateWidget();
            resolve(); return;
          }

          // 검증 3: 렌더러 응답 (3초 타임아웃)
          try {
            await Promise.race([
              widgetWindow.webContents.executeJavaScript('1+1'),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
            ]);
            console.log('[widget] 절전 복귀 — 렌더러 응답 정상');
          } catch {
            console.log('[widget] 절전 복귀 — 렌더러 freeze, 재생성');
            recreateWidget();
          }

          resolve();
        }, 500);
      }, 200);
    });

  } else if (shouldRestore) {
    // ── 케이스 B: 창 파괴됨 + 절전 전 활성이었음 ──
    console.log('[widget] 절전 복귀 — 위젯 파괴됨, 재생성');
    recreateWidget();
  }

  // 스냅샷 초기화
  widgetActiveBeforeSleep = false;
}

function recreateWidget(): void {
  // 기존 위젯 정리
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    stopWinDRecovery();
    widgetWindow.destroy();
  }
  widgetWindow = null;

  const opts = readSettingsWidgetOptions();
  createWidgetWindow(opts);
  widgetWasActive = true;
}

function createWidgetWindow(
  options: { width: number; height: number; desktopMode?: string },
  onReady?: () => void,
): void {
  const savedBounds = readWidgetBounds();
  const defaultPos = getDefaultWidgetBounds(options.width);

  // 저장된 bounds가 현재 화면 안에 있는지 검증
  let validBounds = savedBounds;
  if (savedBounds) {
    const displays = screen.getAllDisplays();
    const isOnAnyDisplay = displays.some((d) => {
      const wa = d.workArea;
      return (
        savedBounds.x < wa.x + wa.width &&
        savedBounds.x + (savedBounds.width ?? options.width) > wa.x &&
        savedBounds.y < wa.y + wa.height &&
        savedBounds.y + (savedBounds.height ?? options.height) > wa.y
      );
    });
    if (!isOnAnyDisplay) {
      console.log('[widget] 저장된 위치가 모든 디스플레이 밖 — 기본 위치 사용');
      validBounds = null;
    }
  }

  const x = validBounds?.x ?? defaultPos.x;
  const y = validBounds?.y ?? defaultPos.y;
  const width = validBounds?.width ?? options.width;
  const height = validBounds?.height ?? options.height;

  widgetWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    minWidth: 640,
    minHeight: 480,
    frame: false,
    transparent: true,
    thickFrame: false,
    alwaysOnTop: false,
    resizable: false,
    skipTaskbar: true,           // 작업표시줄에 나타나지 않음 (바탕화면 위젯)
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // 위젯이 가려지거나 최소화됐을 때 CPU/메모리 사용량 절감 (Chromium 기본 정책)
      backgroundThrottling: true,
    },
  });

  if (process.env['VITE_DEV_SERVER_URL']) {
    widgetWindow.loadURL(`${process.env['VITE_DEV_SERVER_URL']}?mode=widget`);
  } else {
    widgetWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { mode: 'widget' },
    });
  }

  // 렌더러가 첫 프레임을 그린 뒤 표시
  const attachAndShow = () => {
    if (!widgetWindow || widgetWindow.isDestroyed()) return;

    if (process.platform === 'win32') {
      const desktopMode = options.desktopMode ?? 'normal';

      if (desktopMode === 'topmost') {
        // ── 항상 위에 모드 ──
        currentDesktopMode = 'topmost';
        widgetWindow.setAlwaysOnTop(true);
        widgetWindow.show();
        console.log('[widget] 항상 위에 모드');
      } else {
        // ── 일반 모드 (normal): 다른 창에 가려질 수 있음 ──
        currentDesktopMode = 'normal';
        widgetWindow.setAlwaysOnTop(false);
        widgetWindow.show();
        console.log('[widget] 일반 모드');
      }

      // 양쪽 모드 모두 Win+D 복원 활성화
      startWinDRecovery();
    } else {
      widgetWindow.show();
    }

    widgetWasActive = true;
    onReady?.();
  };

  // ready-to-show: 렌더러가 첫 프레임을 그린 직후 (투명 플래시 방지)
  widgetWindow.once('ready-to-show', attachAndShow);

  // 폴백: Electron 이슈 #25253 — transparent 창에서 ready-to-show 미발동 대비
  widgetWindow.webContents.on('did-finish-load', () => {
    setTimeout(() => {
      if (widgetWindow && !widgetWindow.isDestroyed() && !widgetWindow.isVisible()) {
        attachAndShow();
      }
    }, 300);
  });

  widgetWindow.on('move', scheduleWidgetBoundsSave);
  widgetWindow.on('resize', scheduleWidgetBoundsSave);

  // Win+D minimize 차단: 즉시 복원 (primary)
  widgetWindow.on('minimize', () => {
    if (!widgetWindow || widgetWindow.isDestroyed()) return;
    console.log(`[widget] minimize 감지 (${currentDesktopMode}) — 복원`);
    recoverWidget();
  });

  widgetWindow.on('close', (e) => {
    console.log(`[diag] widget close — isQuitting=${isQuitting}, isSystemSuspending=${isSystemSuspending}, widgetWasActive=${widgetWasActive}`);
    if (!isQuitting) {
      e.preventDefault();
      widgetWindow?.hide();
      if (!isSystemSuspending) {
        // 사용자 의도 닫기일 때만 상태 초기화 + 폴링 중단 + 메인 표시/재생성
        stopWinDRecovery();
        widgetWasActive = false;
        // 메모리 절약 모드에서 destroy된 경우 재생성
        ensureMainWindow();
      }
      // 시스템 잠금/절전으로 인한 close면 상태 유지 → unlock/resume 시 복원 가능
    }
  });

  widgetWindow.on('closed', () => {
    console.log(`[diag] widget closed — isQuitting=${isQuitting}, isSystemSuspending=${isSystemSuspending}`);
    stopWinDRecovery();
    widgetWindow = null;
    currentDesktopMode = 'normal';
    if (!isQuitting && !isSystemSuspending) {
      widgetWasActive = false;
    }
  });

  // 진단용: 시스템/DWM이 hide를 유발하는지 확인
  widgetWindow.on('hide', () => {
    console.log(`[diag] widget hide — isSystemSuspending=${isSystemSuspending}, visible=false`);
  });

  widgetWindow.webContents.on('render-process-gone', (_e, details) => {
    console.log('[diag] widget renderer gone:', details);
  });
}

function readSettingsWidgetOptions(): { width: number; height: number; startInWidgetMode: boolean; closeAction: 'widget' | 'tray' | 'ask'; desktopMode: string; memorySaverMode: boolean } {
  try {
    const filePath = path.join(getDataDir(), 'settings.json');
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const settings = JSON.parse(raw) as {
        widget?: { width?: number; height?: number; transparent?: boolean; closeToWidget?: boolean; desktopMode?: string; memorySaverMode?: boolean };
      };
      const rawMode = settings.widget?.desktopMode ?? 'normal';
      // 마이그레이션: 이전 모드 → normal/topmost
      const desktopMode = rawMode === 'floating' ? 'topmost'
        : (rawMode === 'auto' || rawMode === 'desktop' || rawMode === 'behind' || rawMode === 'above') ? 'normal'
        : rawMode;
      // 하위 호환: closeAction 없으면 closeToWidget으로 판단
      const closeAction: 'widget' | 'tray' | 'ask' =
        (settings.widget as any)?.closeAction ??
        (settings.widget?.closeToWidget === false ? 'tray' : 'widget');
      return {
        width: settings.widget?.width ?? 920,
        height: settings.widget?.height ?? 700,
        startInWidgetMode: settings.widget?.transparent ?? false,
        closeAction,
        desktopMode,
        memorySaverMode: settings.widget?.memorySaverMode ?? true,
      };
    }
  } catch {
    // fall through to defaults
  }
  return { width: 920, height: 700, startInWidgetMode: false, closeAction: 'widget', desktopMode: 'normal', memorySaverMode: true };
}

function setupAutoUpdater(): void {
  // GitHub API rate limit (60 req/hr/IP) 회피를 위해 generic provider 사용
  // github provider는 api.github.com을 호출하여 rate limit에 걸릴 수 있음
  // generic provider는 CDN redirect URL을 직접 사용하므로 rate limit 없음
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: 'https://github.com/pblsketch/ssampin/releases/latest/download',
  });
  autoUpdater.autoDownload = false;

  autoUpdater.on('update-available', (info: { version: string; releaseNotes?: string | null }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:available', {
        version: info.version,
        releaseNotes: info.releaseNotes ?? undefined,
      });
    }
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.webContents.send('update:available', {
        version: info.version,
        releaseNotes: info.releaseNotes ?? undefined,
      });
    }
  });

  autoUpdater.on('update-not-available', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:not-available');
    }
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.webContents.send('update:not-available');
    }
  });

  autoUpdater.on('download-progress', (progress: { percent: number }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:download-progress', { percent: progress.percent });
    }
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.webContents.send('update:download-progress', { percent: progress.percent });
    }
  });

  autoUpdater.on('update-downloaded', (info: { version: string }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:update-downloaded', { version: info.version });
    }
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.webContents.send('update:update-downloaded', { version: info.version });
    }
  });

  autoUpdater.on('error', (err: Error) => {
    console.error('[autoUpdater] error:', err.message);
    // 네트워크 오류는 사용자에게 표시하지 않음 (백그라운드 체크이므로)
    const silentErrors = ['net::ERR_', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET'];
    const isSilent = silentErrors.some(keyword => err.message.includes(keyword));
    if (!isSilent && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:error', err.message);
    }
  });
}

function registerIpcHandlers(): void {
  // 닫기 동작 선택 (매번 물어보기 모드)
  ipcMain.on('close-action:respond', (_event, action: string) => {
    const opts = readSettingsWidgetOptions();
    if (action === 'widget') {
      if (!widgetWindow || widgetWindow.isDestroyed()) {
        createWidgetWindow(opts, () => hideOrDestroyMainWindow(opts.memorySaverMode));
      } else {
        widgetWindow.show();
        hideOrDestroyMainWindow(opts.memorySaverMode);
      }
    } else {
      // tray로 숨김은 메모리 절약 모드 영향 없음
      mainWindow?.hide();
    }
  });

  // data:read — userData/data/{filename}.json 읽기 (손상 감지 + 백업 복구)
  ipcMain.handle('data:read', (_event, filename: string): string | null => {
    const dataDir = getDataDir();
    const filePath = path.join(dataDir, `${filename}.json`);
    const backupPath = path.join(dataDir, `${filename}.backup.json`);

    // 원본 읽기 시도
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        if (raw.length < 5) {
          throw new Error('파일이 비어있음');
        }
        JSON.parse(raw); // JSON 유효성 검증
        return raw;
      }
    } catch {
      console.warn(`[data:read] 원본 손상 감지: ${filename}, 백업에서 복구 시도`);
      // 백업에서 복구
      try {
        if (fs.existsSync(backupPath)) {
          const backup = fs.readFileSync(backupPath, 'utf-8');
          JSON.parse(backup); // 백업도 유효한지 검증
          fs.writeFileSync(filePath, backup, 'utf-8');
          console.log(`[data:read] 백업에서 복구 성공: ${filename}`);
          return backup;
        }
      } catch {
        console.error(`[data:read] 백업 복구도 실패: ${filename}`);
      }
    }

    return null;
  });

  // data:write — JSON 파일 쓰기 (백업 + atomic write + 검증)
  ipcMain.handle(
    'data:write',
    (_event, filename: string, data: string): void => {
      const dataDir = getDataDir();
      const filePath = path.join(dataDir, `${filename}.json`);
      const backupPath = path.join(dataDir, `${filename}.backup.json`);

      // Step 1: 기존 파일이 있으면 백업 생성
      try {
        if (fs.existsSync(filePath)) {
          const existing = fs.readFileSync(filePath, 'utf-8');
          if (existing.length > 10) {
            fs.writeFileSync(backupPath, existing, 'utf-8');
          }
        }
      } catch {
        // 백업 실패해도 저장은 계속 진행
      }

      // Step 2: 임시 파일에 먼저 쓰기 (atomic write)
      const tempPath = path.join(dataDir, `${filename}.tmp.json`);
      try {
        fs.writeFileSync(tempPath, data, 'utf-8');

        // Step 3: 쓰기 검증 — 다시 읽어서 맞는지 확인
        const verification = fs.readFileSync(tempPath, 'utf-8');
        if (verification.length !== data.length) {
          console.error(
            `[data:write] 검증 실패: ${filename} (기대 ${data.length}바이트, 실제 ${verification.length}바이트)`,
          );
          try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
          return;
        }

        // Step 4: 검증 통과 → 임시 파일을 원본으로 교체 (rename은 atomic)
        fs.renameSync(tempPath, filePath);
      } catch (writeErr) {
        console.error(`[data:write] 저장 실패: ${filename}`, writeErr);
        try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
        return;
      }

      // 다른 창에 데이터 변경 알림 (메인 ↔ 위젯 동기화)
      for (const win of [mainWindow, widgetWindow]) {
        if (win && !win.isDestroyed() && win.webContents.id !== _event.sender.id) {
          win.webContents.send('data:changed', filename);
        }
      }

      if (filename === 'settings' && !process.env['VITE_DEV_SERVER_URL']) {
        try {
          const settings = JSON.parse(data);
          const autoLaunch = settings.system?.autoLaunch ?? false;
          app.setLoginItemSettings({
            openAtLogin: autoLaunch,
          });
        } catch {
          // ignore parsing error
        }
      }
    },
  );

  ipcMain.handle('data:remove', (_event, filename: string): void => {
    const dataDir = getDataDir();
    const filePath = path.join(dataDir, `${filename}.json`);
    const backupPath = path.join(dataDir, `${filename}.backup.json`);
    const tempPath = path.join(dataDir, `${filename}.tmp.json`);

    for (const targetPath of [filePath, backupPath, tempPath]) {
      try {
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
      } catch (error) {
        console.error(`[data:remove] 삭제 실패: ${targetPath}`, error);
      }
    }

    for (const win of [mainWindow, widgetWindow]) {
      if (win && !win.isDestroyed() && win.webContents.id !== _event.sender.id) {
        win.webContents.send('data:changed', filename);
      }
    }
  });

  // system:getMemoryMetrics — 현재 Electron 앱 프로세스별 메모리 사용량 조회 (진단용)
  // 반환: { totalBytes, processes: [{ type, pid, memoryBytes }] }
  ipcMain.handle('system:getMemoryMetrics', async (): Promise<{
    totalBytes: number;
    processes: Array<{ type: string; pid: number; memoryBytes: number; name?: string }>;
  }> => {
    try {
      const metrics = app.getAppMetrics();
      const processes = metrics.map((m) => ({
        type: m.type,
        pid: m.pid,
        // workingSetSize는 KB 단위 → bytes로 변환
        memoryBytes: (m.memory?.workingSetSize ?? 0) * 1024,
        name: (m as { name?: string }).name,
      }));
      const totalBytes = processes.reduce((sum, p) => sum + p.memoryBytes, 0);
      return { totalBytes, processes };
    } catch (err) {
      console.error('[system:getMemoryMetrics] 실패:', err);
      return { totalBytes: 0, processes: [] };
    }
  });

  // window:setAlwaysOnTop — 메인 창에만 적용 (위젯은 모드별 자동 관리)
  ipcMain.handle('window:setAlwaysOnTop', (_event, flag: boolean): void => {
    mainWindow?.setAlwaysOnTop(flag);
  });

  // window:setWidget (backward compat)
  ipcMain.handle(
    'window:setWidget',
    (
      _event,
      options: {
        width: number;
        height: number;
        transparent: boolean;
        opacity: number;
        alwaysOnTop: boolean;
      },
    ): void => {
      if (!mainWindow) return;
      mainWindow.setSize(options.width, options.height);
      mainWindow.setOpacity(options.opacity);
      mainWindow.setAlwaysOnTop(options.alwaysOnTop);
    },
  );

  // window:toggleWidget — 위젯 토글
  ipcMain.handle('window:toggleWidget', (): void => {
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      // 위젯이 열려있으면 닫고 메인창 복원 (필요 시 재생성)
      stopWinDRecovery();
      widgetWindow.destroy();
      widgetWindow = null;
      currentDesktopMode = 'normal';
      ensureMainWindow();
    } else {
      // 위젯이 없으면 생성하고, 표시된 뒤 메인창 숨김/해제
      const widgetOptions = readSettingsWidgetOptions();
      createWidgetWindow(widgetOptions, () => hideOrDestroyMainWindow(widgetOptions.memorySaverMode));
    }
  });

  // window:navigateToPage — 메인 창으로 포커스 이동 + 페이지 이동 + 위젯 닫기
  ipcMain.handle('window:navigateToPage', (_event, page: string) => {
    // 메모리 절약 모드에서 메인창이 destroy된 상태일 수 있으므로 재생성 후 페이지 이동
    ensureMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('navigate:to-page', page);
    }
    // Close widget window
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.close();
    }
  });

  // window:setWidgetLayout — 레이아웃 모드에 따라 위젯 창 크기 변경
  ipcMain.handle('window:setWidgetLayout', (_event, mode: string): void => {
    if (!widgetWindow || widgetWindow.isDestroyed()) return;

    // 위젯이 현재 위치한 모니터의 작업 영역을 사용 (다중 모니터 지원)
    const currentBounds = widgetWindow.getBounds();
    const workArea = screen.getDisplayMatching(currentBounds).workArea;

    // 최초 레이아웃 변경 시 원래 위치/크기 저장 (복원용)
    if (!widgetBoundsBeforeLayout) {
      widgetBoundsBeforeLayout = widgetWindow.getBounds();
    }

    let bounds: { x: number; y: number; width: number; height: number };

    switch (mode) {
      case 'full':
        // 전체화면: 작업 영역 전체
        bounds = {
          x: workArea.x,
          y: workArea.y,
          width: workArea.width,
          height: workArea.height,
        };
        break;
      case 'split-h':
        // 좌우 분할: 화면 우측 절반
        bounds = {
          x: workArea.x + Math.floor(workArea.width / 2),
          y: workArea.y,
          width: Math.floor(workArea.width / 2),
          height: workArea.height,
        };
        break;
      case 'split-v':
        // 상하 분할: 화면 하단 절반
        bounds = {
          x: workArea.x,
          y: workArea.y + Math.floor(workArea.height / 2),
          width: workArea.width,
          height: Math.floor(workArea.height / 2),
        };
        break;
      case 'quad':
        // 4분할: 화면 우하단 1/4
        bounds = {
          x: workArea.x + Math.floor(workArea.width / 2),
          y: workArea.y + Math.floor(workArea.height / 2),
          width: Math.floor(workArea.width / 2),
          height: Math.floor(workArea.height / 2),
        };
        break;
      default:
        // 알 수 없는 모드: 원래 크기로 복원
        if (widgetBoundsBeforeLayout) {
          widgetWindow.setBounds(widgetBoundsBeforeLayout);
          widgetBoundsBeforeLayout = null;
        }
        return;
    }

    widgetWindow.setBounds(bounds);
    // 레이아웃 변경 후 화면 밖 검증
    ensureWidgetOnScreen();
  });

  // window:applyWidgetSettings — 설정 페이지에서 위젯 설정 변경 시 실시간 적용
  ipcMain.handle('window:applyWidgetSettings', (
    _event,
    widget: { opacity: number; desktopMode: string },
  ): void => {
    if (!widgetWindow || widgetWindow.isDestroyed()) return;

    // 투명도 직접 적용
    widgetWindow.setOpacity(Math.max(0, Math.min(1, widget.opacity)));

    // 데스크톱 모드 변경
    const newMode = widget.desktopMode === 'topmost' ? 'topmost' : 'normal';
    if (newMode !== currentDesktopMode) {
      console.log(`[widget] 설정 변경: ${currentDesktopMode} → ${newMode}`);
      currentDesktopMode = newMode;

      if (newMode === 'topmost') {
        widgetWindow.setAlwaysOnTop(true);
      } else {
        widgetWindow.setAlwaysOnTop(false);
      }
    }
  });

  // window:setOpacity — 위젯 투명도 설정
  ipcMain.handle('window:setOpacity', (_event, value: number): void => {
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.setOpacity(Math.max(0, Math.min(1, value)));
    }
  });

  // window:resizeWidget — 위젯 JS 리사이즈 (thickFrame: false 대응)
  ipcMain.handle('window:resizeWidget', (_event, edge: string, dx: number, dy: number) => {
    if (!widgetWindow || widgetWindow.isDestroyed()) return;
    const bounds = widgetWindow.getBounds();

    const newBounds = { ...bounds };
    if (edge.includes('right'))  newBounds.width = Math.max(300, bounds.width + dx);
    if (edge.includes('bottom')) newBounds.height = Math.max(200, bounds.height + dy);
    if (edge.includes('left'))   { newBounds.x = bounds.x + dx; newBounds.width = Math.max(300, bounds.width - dx); }
    if (edge.includes('top'))    { newBounds.y = bounds.y + dy; newBounds.height = Math.max(200, bounds.height - dy); }

    widgetWindow.setBounds(newBounds);
    scheduleWidgetBoundsSave();
  });

  // window:closeApp — 앱 완전 종료
  ipcMain.handle('window:closeApp', (): void => {
    isQuitting = true;
    app.quit();
  });

  // export:showSaveDialog — 파일 저장 대화상자
  ipcMain.handle(
    'export:showSaveDialog',
    async (
      _event,
      options: {
        title: string;
        defaultPath: string;
        filters: { name: string; extensions: string[] }[];
      },
    ): Promise<string | null> => {
      if (!mainWindow) return null;
      const result = await dialog.showSaveDialog(mainWindow, {
        title: options.title,
        defaultPath: options.defaultPath,
        filters: options.filters,
      });
      if (result.canceled || !result.filePath) return null;
      return result.filePath;
    },
  );

  // export:writeFile — 바이너리/텍스트 파일 쓰기
  ipcMain.handle(
    'export:writeFile',
    (_event, filePath: string, data: ArrayBuffer | string): void => {
      try {
        if (typeof data === 'string') {
          fs.writeFileSync(filePath, data, 'utf-8');
        } else {
          fs.writeFileSync(filePath, Buffer.from(data));
        }
      } catch (err) {
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
          throw new Error(
            `파일이 다른 프로그램에서 열려 있어 저장할 수 없습니다.\n` +
            `해당 파일(${path.basename(filePath)})을 닫은 뒤 다시 시도하거나, 다른 이름으로 저장해 주세요.`,
          );
        }
        throw err;
      }
    },
  );

  // export:printToPDF — 현재 윈도우 PDF 출력.
  // options 인자 (선택): pageSize/landscape/marginsType. 지정 없으면 A4 portrait.
  ipcMain.handle(
    'export:printToPDF',
    async (
      _event,
      options?: {
        pageSize?:
          | 'A3'
          | 'A4'
          | 'A5'
          | 'Letter'
          | 'Legal'
          | 'Tabloid'
          | { width: number; height: number };
        landscape?: boolean;
        marginsType?: 0 | 1 | 2;
      },
    ): Promise<ArrayBuffer | null> => {
      if (!mainWindow) return null;
      const data = await mainWindow.webContents.printToPDF({
        printBackground: true,
        landscape: options?.landscape ?? false,
        pageSize: options?.pageSize ?? 'A4',
        ...(options?.marginsType !== undefined
          ? { marginsType: options.marginsType }
          : {}),
      });
      return data.buffer as ArrayBuffer;
    },
  );

  // export:openFile — 생성된 파일 열기
  ipcMain.handle(
    'export:openFile',
    (_event, filePath: string): void => {
      shell.openPath(filePath);
    },
  );

  // shell:openExternal — 기본 브라우저에서 URL 열기
  ipcMain.handle('shell:openExternal', (_event, url: string): void => {
    shell.openExternal(url);
  });

  // shell:openPath — 탐색기에서 폴더 열기
  ipcMain.handle('shell:openPath', async (_event, folderPath: string): Promise<string> => {
    return shell.openPath(folderPath);
  });

  // dialog:showOpen — 폴더/파일 선택 다이얼로그
  ipcMain.handle('dialog:showOpen', async (
    _event,
    options: { title?: string; properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>; filters?: { name: string; extensions: string[] }[] },
  ): Promise<{ canceled: boolean; filePaths: string[] }> => {
    const win = mainWindow ?? BrowserWindow.getFocusedWindow();
    if (!win) throw new Error('No window available');
    return dialog.showOpenDialog(win, options);
  });

  // audio:importAlarm — 알람음 파일 가져오기
  ipcMain.handle(
    'audio:importAlarm',
    async (): Promise<{ name: string; dataUrl: string } | null> => {
      if (!mainWindow) return null;
      const result = await dialog.showOpenDialog(mainWindow, {
        title: '알람음 파일 선택',
        filters: [
          { name: '오디오 파일', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'webm'] },
        ],
        properties: ['openFile'],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      const filePath = result.filePaths[0]!;
      const stat = fs.statSync(filePath);
      if (stat.size > 5 * 1024 * 1024) {
        return null; // 5MB 제한
      }
      const name = path.basename(filePath);
      const buf = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase().slice(1);
      const mimeMap: Record<string, string> = {
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
        ogg: 'audio/ogg',
        m4a: 'audio/mp4',
        webm: 'audio/webm',
      };
      const mime = mimeMap[ext] || 'audio/mpeg';
      const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
      return { name, dataUrl };
    },
  );

  // font:import — 커스텀 폰트 파일 가져오기
  ipcMain.handle(
    'font:import',
    async (): Promise<{ name: string; dataUrl: string; mimeType: string } | null> => {
      if (!mainWindow) return null;
      const result = await dialog.showOpenDialog(mainWindow, {
        title: '폰트 파일 선택',
        filters: [
          { name: '폰트 파일', extensions: ['woff2', 'woff', 'ttf', 'otf'] },
        ],
        properties: ['openFile'],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      const filePath = result.filePaths[0]!;
      const stat = fs.statSync(filePath);
      if (stat.size > 10 * 1024 * 1024) return null; // 10MB 제한
      const name = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase().slice(1);
      const mimeMap: Record<string, string> = {
        woff2: 'font/woff2',
        woff: 'font/woff',
        ttf: 'font/ttf',
        otf: 'font/otf',
      };
      const mimeType = mimeMap[ext] ?? 'font/woff2';
      const buf = fs.readFileSync(filePath);
      const dataUrl = `data:${mimeType};base64,${buf.toString('base64')}`;
      return { name, dataUrl, mimeType };
    },
  );

  // share:import — 일정 가져오기 (열기 대화상자 + 파일 읽기, .ssampin / .xlsx)
  ipcMain.handle(
    'share:import',
    async (): Promise<{ content: string | ArrayBuffer; fileType: 'ssampin' | 'xlsx' } | null> => {
      if (!mainWindow) return null;
      const result = await dialog.showOpenDialog(mainWindow, {
        title: '일정 가져오기',
        filters: [
          { name: '지원 파일', extensions: ['ssampin', 'xlsx'] },
          { name: '쌤핀 일정 파일', extensions: ['ssampin'] },
          { name: 'Excel 파일', extensions: ['xlsx'] },
        ],
        properties: ['openFile'],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      const filePath = result.filePaths[0]!;

      if (filePath.endsWith('.xlsx')) {
        const buf = fs.readFileSync(filePath);
        return {
          content: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
          fileType: 'xlsx',
        };
      }
      return { content: fs.readFileSync(filePath, 'utf-8'), fileType: 'ssampin' };
    },
  );

  // 클립보드 텍스트 읽기 — 렌더러 navigator.clipboard 권한 제약 우회
  ipcMain.handle(
    'clipboard:readText',
    async (): Promise<string> => {
      try {
        return clipboard.readText();
      } catch {
        return '';
      }
    },
  );

  // 즐겨찾기 가져오기 — .json (쌤핀 내보내기) 또는 .html (브라우저 내보내기)
  ipcMain.handle(
    'bookmarks:import',
    async (): Promise<{ content: string; format: 'json' | 'html' } | null> => {
      if (!mainWindow) return null;
      const result = await dialog.showOpenDialog(mainWindow, {
        title: '즐겨찾기 가져오기',
        filters: [
          { name: '지원 파일', extensions: ['json', 'html', 'htm'] },
          { name: '쌤핀 즐겨찾기 (JSON)', extensions: ['json'] },
          { name: '브라우저 북마크 (HTML)', extensions: ['html', 'htm'] },
        ],
        properties: ['openFile'],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      const filePath = result.filePaths[0]!;
      const lower = filePath.toLowerCase();
      const format: 'json' | 'html' = lower.endsWith('.json') ? 'json' : 'html';
      const content = fs.readFileSync(filePath, 'utf-8');
      return { content, format };
    },
  );

  // calendar:fetch-url — 외부 캘린더 URL 페치 (CORS 우회)
  ipcMain.handle(
    'calendar:fetch-url',
    async (_event: unknown, url: string): Promise<string | null> => {
      try {
        const mod = await import(url.startsWith('https') ? 'https' : 'http');
        return new Promise<string | null>((resolve) => {
          const req = mod.get(url, { timeout: 30000 }, (res: { statusCode?: number; headers: Record<string, string | undefined>; on: (event: string, cb: (chunk: string) => void) => void }) => {
            // 리다이렉트 처리
            if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
              const redirectMod = res.headers.location.startsWith('https')
                ? mod : (url.startsWith('https') ? mod : mod);
              const redirectReq = redirectMod.get(res.headers.location, { timeout: 30000 }, (res2: { on: (event: string, cb: (chunk: string) => void) => void }) => {
                let data = '';
                res2.on('data', (chunk: string) => { data += chunk; });
                res2.on('end', () => resolve(data));
              });
              redirectReq.on('error', () => resolve(null));
              return;
            }
            let data = '';
            res.on('data', (chunk: string) => { data += chunk; });
            res.on('end', () => resolve(data));
          });
          req.on('error', () => resolve(null));
        });
      } catch {
        return null;
      }
    },
  );

  // ─── forms:* 바이너리 IPC (서식관리 Phase 1) ───
  // 보안 가드: 모든 relPath 는 userData 경계 안쪽이어야 하며,
  // 파일 확장자는 화이트리스트(.hwpx/.pdf/.xlsx/.png)만 허용한다.
  const FORMS_ALLOWED_EXT = new Set(['.hwpx', '.pdf', '.xlsx', '.png']);

  function resolveFormsPath(relPath: string, requireFileExt: boolean): string {
    if (typeof relPath !== 'string' || relPath.length === 0) {
      throw new Error('forms: relPath 가 비어있습니다');
    }
    if (path.isAbsolute(relPath)) {
      throw new Error('forms: 절대 경로는 허용되지 않습니다');
    }
    const userData = app.getPath('userData');
    const absolute = path.resolve(userData, relPath);
    const rel = path.relative(userData, absolute);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('forms: userData 경계를 벗어난 경로 거부');
    }
    if (requireFileExt) {
      const ext = path.extname(absolute).toLowerCase();
      if (!FORMS_ALLOWED_EXT.has(ext)) {
        throw new Error(`forms: 허용되지 않은 확장자 ${ext || '(없음)'}`);
      }
    }
    return absolute;
  }

  ipcMain.handle(
    'forms:writeBinary',
    async (_event, args: { relPath: string; bytes: ArrayBuffer }): Promise<void> => {
      const abs = resolveFormsPath(args.relPath, true);
      await fs.promises.mkdir(path.dirname(abs), { recursive: true });
      await fs.promises.writeFile(abs, Buffer.from(args.bytes));
    },
  );

  ipcMain.handle(
    'forms:readBinary',
    async (_event, args: { relPath: string }): Promise<ArrayBuffer | null> => {
      const abs = resolveFormsPath(args.relPath, true);
      try {
        const buf = await fs.promises.readFile(abs);
        // Node Buffer 는 ArrayBuffer 뷰이므로 정확한 범위로 잘라 전달
        const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        return ab as ArrayBuffer;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          return null;
        }
        throw err;
      }
    },
  );

  ipcMain.handle(
    'forms:removeBinary',
    async (_event, args: { relPath: string }): Promise<void> => {
      const abs = resolveFormsPath(args.relPath, true);
      try {
        await fs.promises.unlink(abs);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return; // no-op
        throw err;
      }
    },
  );

  ipcMain.handle(
    'forms:openFile',
    async (_event, args: { relPath: string }): Promise<void> => {
      const abs = resolveFormsPath(args.relPath, true);
      try {
        await fs.promises.access(abs);
      } catch {
        throw new Error('forms: 파일이 존재하지 않습니다');
      }
      const err = await shell.openPath(abs);
      if (err) throw new Error(`forms: 기본 프로그램으로 열기 실패 — ${err}`);
    },
  );

  // forms:printPdf — PDF 서식 바로 인쇄.
  // Chromium 내장 PDF 뷰어로 로드 후 webContents.print({ silent: false }) 로 OS 인쇄 대화상자 표시.
  // OS 연결 프로그램(Acrobat/Edge 등) 의존 제거 — 어떤 환경에서도 일관된 인쇄 흐름 보장.
  ipcMain.handle(
    'forms:printPdf',
    async (_event, args: { relPath: string }): Promise<void> => {
      const abs = resolveFormsPath(args.relPath, true);
      const ext = path.extname(abs).toLowerCase();
      if (ext !== '.pdf') {
        throw new Error(`forms:printPdf 는 .pdf 전용입니다 (현재: ${ext})`);
      }
      try {
        await fs.promises.access(abs);
      } catch {
        throw new Error('forms: 파일이 존재하지 않습니다');
      }

      // hidden BrowserWindow — Chromium 에 PDF 뷰어 내장되어 있으므로 loadFile 로 직접 로드 가능
      const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
      const printWin = new BrowserWindow({
        show: false,
        width: 800,
        height: 1000,
        parent,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          // PDF 뷰어 플러그인 사용 허용
          plugins: true,
        },
      });

      try {
        await printWin.loadFile(abs);
        // PDF 렌더링은 did-finish-load 이후에도 약간의 시간이 필요 (Chromium 내장 뷰어)
        await new Promise<void>((r) => setTimeout(r, 600));

        await new Promise<void>((resolve, reject) => {
          printWin.webContents.print(
            { silent: false, printBackground: true },
            (success, failureReason) => {
              // 사용자 취소(cancelled)는 정상 흐름 — 에러로 취급하지 않음
              if (success) {
                resolve();
              } else if (!failureReason || failureReason === 'cancelled') {
                resolve();
              } else {
                reject(new Error(failureReason));
              }
            },
          );
        });
      } catch (err) {
        // 폴백: Chromium PDF 뷰어 실패(예: 잘못된 PDF, 플러그인 차단 등)
        // shell.openPath 로 OS 기본 뷰어에서 열도록 시도 → 사용자가 Ctrl+P 로 인쇄
        try {
          const openErr = await shell.openPath(abs);
          if (openErr) {
            throw new Error(
              `PDF 인쇄에 실패했습니다. (상세: ${err instanceof Error ? err.message : String(err)}) 폴백도 실패: ${openErr}`,
            );
          }
        } catch (fallbackErr) {
          throw new Error(
            `PDF 인쇄에 실패했습니다. (${err instanceof Error ? err.message : String(err)})`,
          );
        }
      } finally {
        if (!printWin.isDestroyed()) {
          printWin.destroy();
        }
      }
    },
  );

  ipcMain.handle(
    'forms:listBinary',
    async (_event, args: { dirRelPath: string }): Promise<string[]> => {
      // 디렉토리 경로는 확장자 체크 건너뜀 (ext 없음)
      const abs = resolveFormsPath(args.dirRelPath, false);
      try {
        const entries = await fs.promises.readdir(abs, { withFileTypes: true });
        return entries.filter((e) => e.isFile()).map((e) => e.name);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw err;
      }
    },
  );

  // update:check — 업데이트 확인
  ipcMain.handle('update:check', (): void => {
    autoUpdater.checkForUpdates().catch((err: Error) => {
      console.error('[autoUpdater] checkForUpdates error:', err);
    });
  });

  // update:download — 업데이트 다운로드
  // macOS: 코드서명 없이는 인앱 업데이트가 차단되므로 릴리즈 페이지로 안내
  ipcMain.handle('update:download', (): void => {
    if (process.platform === 'darwin') {
      shell.openExternal('https://github.com/pblsketch/ssampin/releases/latest');
      return;
    }
    autoUpdater.downloadUpdate().catch((err: Error) => {
      console.error('[autoUpdater] downloadUpdate error:', err);
    });
  });

  // update:install — 업데이트 설치 및 재시작
  ipcMain.handle('update:install', (): void => {
    if (process.platform === 'darwin') return;
    autoUpdater.quitAndInstall();
  });

  // ─── Sticker picker (내 이모티콘 / PRD §4.1) ───
  // 스티커 PNG 저장 디렉토리 — userData/data/stickers/
  function getStickerImageDir(): string {
    const dir = path.join(getDataDir(), 'stickers');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  // stickerId 검증 — 경로 인젝션 방지 (영숫자·하이픈·언더스코어만)
  function validateStickerId(stickerId: unknown): string {
    if (typeof stickerId !== 'string' || stickerId.length === 0 || stickerId.length > 64) {
      throw new Error('sticker: stickerId가 유효하지 않습니다');
    }
    if (!/^[A-Za-z0-9_-]+$/.test(stickerId)) {
      throw new Error('sticker: stickerId에 허용되지 않는 문자 포함');
    }
    return stickerId;
  }

  // sticker:select-image — PNG/WebP/JPEG/GIF/BMP 파일 다중 선택 (PRD §3.3.1)
  // 다중 선택 지원: 한 번에 여러 이미지를 골라 일괄 등록 가능
  ipcMain.handle(
    'sticker:select-image',
    async (): Promise<{ canceled: boolean; filePaths: string[] }> => {
      const win = mainWindow ?? BrowserWindow.getFocusedWindow();
      if (!win) return { canceled: true, filePaths: [] };
      const result = await dialog.showOpenDialog(win, {
        title: '이모티콘 이미지 선택 (여러 개 가능)',
        filters: [
          { name: '이미지 파일', extensions: ['png', 'webp', 'jpg', 'jpeg', 'gif', 'bmp'] },
        ],
        properties: ['openFile', 'multiSelections'],
      });
      return { canceled: result.canceled, filePaths: result.filePaths };
    },
  );

  // sourcePath 안전 검증 — path traversal/null-byte 차단 + 절대 경로 강제
  // 외부에서 들어오는 경로 인자(파일 시스템에 접근하는 모든 sticker 핸들러)에서 공통 사용
  function validateAbsoluteSourcePath(sourcePath: unknown): string {
    if (
      typeof sourcePath !== 'string' ||
      sourcePath.length === 0 ||
      sourcePath.includes('\0')
    ) {
      throw new Error('sticker: 잘못된 파일 경로입니다');
    }
    if (!path.isAbsolute(sourcePath)) {
      throw new Error('sticker: 절대 경로만 허용됩니다');
    }
    // path.resolve 결과가 입력과 다르면 ../ 등 정규화 대상이 포함된 것으로 간주
    return path.resolve(sourcePath);
  }

  // sticker:import-image — 입력 이미지를 360×360 PNG로 정규화 + 저장 + contentHash 반환
  // (PRD §4.3 이미지 변환 파이프라인. nativeImage 단독 사용, sharp 미사용)
  ipcMain.handle(
    'sticker:import-image',
    async (
      _event,
      args: { stickerId: string; sourcePath: string },
    ): Promise<{ contentHash: string }> => {
      const stickerId = validateStickerId(args.stickerId);
      const resolvedSourcePath = validateAbsoluteSourcePath(args.sourcePath);

      // nativeImage 디코딩
      const original = nativeImage.createFromPath(resolvedSourcePath);
      if (original.isEmpty()) {
        throw new Error('sticker: 이미지를 디코딩할 수 없습니다 (지원하지 않는 포맷이거나 손상)');
      }

      // 정사각형 크롭 (짧은 변 기준 중앙 크롭)
      const size = original.getSize();
      const minSide = Math.min(size.width, size.height);
      let squared = original;
      if (size.width !== size.height) {
        const cropX = Math.floor((size.width - minSide) / 2);
        const cropY = Math.floor((size.height - minSide) / 2);
        squared = original.crop({ x: cropX, y: cropY, width: minSide, height: minSide });
      }

      // 360×360 리사이즈
      const resized = squared.resize({ width: 360, height: 360, quality: 'best' });
      const pngBuffer = resized.toPNG();

      if (pngBuffer.length === 0) {
        throw new Error('sticker: PNG 인코딩 실패');
      }

      // 저장
      const targetDir = getStickerImageDir();
      const targetPath = path.join(targetDir, `${stickerId}.png`);
      await fs.promises.writeFile(targetPath, pngBuffer);

      // contentHash (SHA-256, 16자) — 중복 감지용 (PRD §3.3.2)
      const fullHash = crypto.createHash('sha256').update(pngBuffer).digest('hex');
      const contentHash = fullHash.slice(0, 16);

      return { contentHash };
    },
  );

  // sticker:get-image-data-url — 저장된 PNG를 data URL로 반환
  ipcMain.handle(
    'sticker:get-image-data-url',
    async (_event, stickerId: string): Promise<string | null> => {
      const id = validateStickerId(stickerId);
      const filePath = path.join(getStickerImageDir(), `${id}.png`);
      try {
        const buf = await fs.promises.readFile(filePath);
        return `data:image/png;base64,${buf.toString('base64')}`;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
    },
  );

  // sticker:delete-image — PNG 파일 삭제 (ENOENT 무시)
  ipcMain.handle(
    'sticker:delete-image',
    async (_event, stickerId: string): Promise<void> => {
      const id = validateStickerId(stickerId);
      const filePath = path.join(getStickerImageDir(), `${id}.png`);
      try {
        await fs.promises.unlink(filePath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw err;
      }
    },
  );

  // ─── 자동 붙여넣기 헬퍼 (Windows / macOS) ───
  // PRD §4.1.1 macOS Phase 2 — AppleScript via osascript로 Cmd+V 송신.
  // System Events 사용에는 접근성 권한이 필요 — systemPreferences로 사전 체크.

  /** macOS 접근성 권한 보유 여부 (best-effort, false = prompt 안 함) */
  function hasMacOSAccessibilityPermission(): boolean {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { systemPreferences } = require('electron') as {
        systemPreferences: {
          isTrustedAccessibilityClient?: (prompt: boolean) => boolean;
        };
      };
      if (typeof systemPreferences.isTrustedAccessibilityClient === 'function') {
        return systemPreferences.isTrustedAccessibilityClient(false);
      }
      // 알 수 없으면 일단 시도 (최악의 경우 osascript-failed 반환)
      return true;
    } catch {
      return true;
    }
  }

  /** osascript로 AppleScript 1줄 실행 — System Events 권한 필요 */
  function runAppleScript(script: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { exec } = require('child_process') as {
        exec: (
          cmd: string,
          cb: (error: Error | null) => void,
        ) => void;
      };
      // JSON.stringify로 quote escape — 공백/특수문자 안전
      exec(`osascript -e ${JSON.stringify(script)}`, (error: Error | null) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  /**
   * Windows 자동 붙여넣기 — @nut-tree-fork/nut-js로 Ctrl+V 시뮬레이션.
   * 원본 `@nut-tree/nut-js`는 2024년 npm에서 제거되어 현재 유지보수되는
   * 포크(`@nut-tree-fork/nut-js`)를 사용한다. require/dispatch 실패 시
   * autoPasted=false로 graceful fallback (클립보드는 이미 채워져 있어
   * 사용자가 수동 Ctrl+V로 붙여넣을 수 있다).
   */
  async function pasteOnWindows(
    restoreMode: boolean,
    prevImage: Electron.NativeImage | null,
    prevText: string,
    stickerImage: Electron.NativeImage,
  ): Promise<{ ok: boolean; autoPasted: boolean; reason?: string }> {
    let autoPasted = false;
    let pasteReason: string | undefined;
    try {
      // 포커스 전환 대기 — 80ms → 150ms로 늘려 OS가 이전 앱(카톡/스레드)에
      // 포커스를 자연스럽게 되돌릴 시간을 충분히 확보. 짧으면 nut-js Ctrl+V가
      // 아직 hide 처리중인 피커 윈도우 위에 떨어져 스크린샷 캡처처럼 보일 수 있다.
      await new Promise<void>((resolve) => setTimeout(resolve, 150));

      // ─── 진단: Ctrl+V 직전 클립보드 상태 재검증 ───
      // writeImage 이후 어떤 이유로든 클립보드가 비워졌다면 이 시점에서 포착된다.
      const beforePasteFormats = clipboard.availableFormats();
      const beforePasteImageSize = clipboard.readImage().getSize();
      stickerLog('[sticker:paste] clipboard right before Ctrl+V:', {
        formats: beforePasteFormats,
        size: beforePasteImageSize,
      });
      if (clipboard.readImage().isEmpty()) {
        stickerLog('[sticker:paste] CLIPBOARD WAS CLEARED before Ctrl+V dispatch — aborting');
        console.error('[sticker:paste] CLIPBOARD WAS CLEARED before Ctrl+V dispatch — aborting');
        return { ok: false, autoPasted: false, reason: 'clipboard-cleared-before-paste' };
      }

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nut = require('@nut-tree-fork/nut-js') as {
        keyboard: {
          pressKey: (...keys: number[]) => Promise<void>;
          releaseKey: (...keys: number[]) => Promise<void>;
        };
        Key: Record<string, number>;
      };
      const modKey = nut.Key['LeftControl'];
      const vKey = nut.Key['V'];
      if (modKey === undefined || vKey === undefined) {
        throw new Error('nut-js Key 매핑 없음');
      }
      stickerLog('[sticker:paste] dispatching Ctrl+V via nut-js');
      await nut.keyboard.pressKey(modKey, vKey);
      await nut.keyboard.releaseKey(vKey, modKey);
      autoPasted = true;
      stickerLog('[sticker:paste] nut-js dispatch complete, autoPasted=true');
    } catch (err) {
      autoPasted = false;
      pasteReason = err instanceof Error ? err.message : String(err);
      // 진단을 위해 stack까지 포함한 error 로그 — 사용자 환경에서 native binding 로드
      // 실패(libnut 미언팩 등) 원인을 추적하기 쉽도록 한다.
      stickerLog('[sticker:paste] nut-js require/dispatch failed:', err instanceof Error ? err.message : String(err));
      console.error(
        '[sticker:paste] nut-js require/dispatch failed:',
        err instanceof Error ? err.stack ?? err.message : err,
      );
    }

    // 클립보드 복원 — 1500ms로 충분한 시간 확보 (PRD §3.2.1)
    // 단, 이전 클립보드가 스티커와 동일/유사하면 복원 스킵 (스티커 자체가 이미 복원될 만한
    // 동일 이미지였거나, 스냅샷이 비정상적으로 비어있는 경우 polluted 상태로 덮어쓰기 방지).
    if (restoreMode) {
      const stickerSig = (() => {
        try {
          return stickerImage.toPNG().toString('base64').slice(0, 200);
        } catch {
          return '';
        }
      })();
      stickerLog('[sticker:paste] scheduled clipboard restore at +1500ms');
      setTimeout(() => {
        try {
          if (prevImage && !prevImage.isEmpty()) {
            const prevSig = (() => {
              try {
                return prevImage.toPNG().toString('base64').slice(0, 200);
              } catch {
                return '';
              }
            })();
            if (prevSig.length > 0 && prevSig === stickerSig) {
              stickerLog('[sticker:paste] skipping restore — prev image identical to sticker (polluted snapshot)');
              return;
            }
            clipboard.writeImage(prevImage);
            stickerLog('[sticker:paste] restored prev clipboard image');
          } else if (prevText.length > 0) {
            clipboard.writeText(prevText);
            stickerLog('[sticker:paste] restored prev clipboard text');
          }
        } catch (restoreErr) {
          stickerLog('[sticker:paste] 클립보드 복원 실패', restoreErr instanceof Error ? restoreErr.message : String(restoreErr));
        }
      }, 1500);
    }

    const result: { ok: boolean; autoPasted: boolean; reason?: string } = {
      ok: true,
      autoPasted,
    };
    if (!autoPasted && pasteReason !== undefined) {
      result.reason = pasteReason;
    }
    return result;
  }

  /**
   * macOS 자동 붙여넣기 — osascript로 System Events에게 Cmd+V keystroke 송신.
   * 접근성 권한이 없으면 reason: 'accessibility-denied'를 반환하여
   * 렌더러가 사용자에게 권한 안내 토스트를 띄울 수 있도록 한다.
   */
  async function pasteOnMacOS(
    restoreMode: boolean,
    prevImage: Electron.NativeImage | null,
    prevText: string,
    stickerImage: Electron.NativeImage,
  ): Promise<{ ok: boolean; autoPasted: boolean; reason?: string }> {
    // 1) 접근성 권한 체크 (best-effort)
    if (!hasMacOSAccessibilityPermission()) {
      // 클립보드는 이미 채워져 있으므로 사용자가 수동 Cmd+V로 붙여넣을 수 있다.
      return { ok: true, autoPasted: false, reason: 'accessibility-denied' };
    }

    // 2) 피커 윈도우가 포커스를 완전히 놓도록 짧게 대기 — 80ms → 150ms
    await new Promise<void>((resolve) => setTimeout(resolve, 150));

    // ─── 진단: Cmd+V 직전 클립보드 상태 재검증 ───
    const beforePasteFormats = clipboard.availableFormats();
    const beforePasteImageSize = clipboard.readImage().getSize();
    stickerLog('[sticker:paste] clipboard right before Cmd+V:', {
      formats: beforePasteFormats,
      size: beforePasteImageSize,
    });
    if (clipboard.readImage().isEmpty()) {
      stickerLog('[sticker:paste] CLIPBOARD WAS CLEARED before Cmd+V dispatch — aborting');
      console.error('[sticker:paste] CLIPBOARD WAS CLEARED before Cmd+V dispatch — aborting');
      return { ok: false, autoPasted: false, reason: 'clipboard-cleared-before-paste' };
    }

    // 3) Cmd+V keystroke 송신
    let autoPasted = false;
    let pasteReason: string | undefined;
    try {
      stickerLog('[sticker:paste] dispatching Cmd+V via osascript');
      await runAppleScript(
        'tell application "System Events" to keystroke "v" using command down',
      );
      autoPasted = true;
      stickerLog('[sticker:paste] osascript dispatch complete, autoPasted=true');
    } catch (err) {
      autoPasted = false;
      pasteReason = 'osascript-failed';
      stickerLog('[sticker:paste] macOS osascript 실패', err instanceof Error ? err.message : String(err));
      console.error(
        '[sticker:paste] macOS osascript 실패',
        err instanceof Error ? err.message : err,
      );
    }

    // 4) 클립보드 복원 (옵션) — Windows와 동일하게 1500ms + polluted snapshot 가드
    if (restoreMode) {
      const stickerSig = (() => {
        try {
          return stickerImage.toPNG().toString('base64').slice(0, 200);
        } catch {
          return '';
        }
      })();
      stickerLog('[sticker:paste] scheduled clipboard restore at +1500ms (macOS)');
      setTimeout(() => {
        try {
          if (prevImage && !prevImage.isEmpty()) {
            const prevSig = (() => {
              try {
                return prevImage.toPNG().toString('base64').slice(0, 200);
              } catch {
                return '';
              }
            })();
            if (prevSig.length > 0 && prevSig === stickerSig) {
              stickerLog('[sticker:paste] skipping restore (macOS) — prev image identical to sticker');
              return;
            }
            clipboard.writeImage(prevImage);
            stickerLog('[sticker:paste] restored prev clipboard image (macOS)');
          } else if (prevText.length > 0) {
            clipboard.writeText(prevText);
            stickerLog('[sticker:paste] restored prev clipboard text (macOS)');
          }
        } catch (restoreErr) {
          stickerLog('[sticker:paste] 클립보드 복원 실패 (macOS)', restoreErr instanceof Error ? restoreErr.message : String(restoreErr));
        }
      }, 1500);
    }

    const result: { ok: boolean; autoPasted: boolean; reason?: string } = {
      ok: true,
      autoPasted,
    };
    if (!autoPasted && pasteReason !== undefined) {
      result.reason = pasteReason;
    }
    return result;
  }

  // sticker:paste — 클립보드에 PNG 복사 + 피커 hide + (가능 시) 자동 Ctrl+V (PRD §3.2)
  // 플랫폼별 분기:
  //  - win32: pasteOnWindows (@nut-tree-fork/nut-js 사용 — 실패 시 graceful fallback)
  //  - darwin: pasteOnMacOS (AppleScript via osascript, 접근성 권한 필요)
  //  - 그 외(linux 등): 클립보드만 채우고 autoPasted=false 반환
  //
  // autoPasted=false인 경우 메인 윈도우에 `sticker:fallback-paste-needed` 이벤트를
  // 송신하여 사용자에게 "수동 Ctrl+V 안내" 토스트를 표시한다. 피커 윈도우는
  // 이 시점에 이미 hide되었으므로 피커 측 토스트는 사용자에게 보이지 않는다.
  ipcMain.handle(
    'sticker:paste',
    async (
      _event,
      args: { stickerId: string; restorePreviousClipboard: boolean },
    ): Promise<{ ok: boolean; autoPasted: boolean; reason?: string }> => {
      const id = validateStickerId(args.stickerId);
      // v2.0.x 핫픽스: 사용자 settings의 restorePreviousClipboard 옵션은 일시적으로
      // 강제 비활성화한다. 클립보드 복원 모드가 picker capture로 클립보드를
      // 덮어씌우는 회귀 이슈(수동 paste 시 picker 화면이 붙여넣어지는 버그)를
      // 차단하기 위함. nut-js 자동 붙여넣기 안정화 + prev 클립보드 오염 원인
      // 규명 후 다시 활성화 검토.
      // 원래 라인: const restoreMode = args.restorePreviousClipboard === true;
      const restoreMode = false;
      stickerLog('[sticker:paste] start', { id, restoreMode, requestedRestore: args.restorePreviousClipboard === true });

      // 1) 이전 클립보드 스냅샷 (복원 모드)
      let prevImage: Electron.NativeImage | null = null;
      let prevText = '';
      if (restoreMode) {
        try {
          prevImage = clipboard.readImage();
          prevText = clipboard.readText();
          stickerLog('[sticker:paste] prev clipboard formats:', {
            formats: clipboard.availableFormats(),
            prevImageSize: prevImage.getSize(),
          });
        } catch {
          // 스냅샷 실패는 치명적이지 않음 — 그대로 진행
        }
      }

      // 2) 디스크에서 PNG 로드
      const filePath = path.join(getStickerImageDir(), `${id}.png`);
      const image = nativeImage.createFromPath(filePath);
      if (image.isEmpty()) {
        stickerLog('[sticker:paste] sticker image not found at', filePath);
        console.error('[sticker:paste] sticker image not found at', filePath);
        return { ok: false, autoPasted: false, reason: '이모티콘 이미지를 찾을 수 없습니다' };
      }

      // 3) 클립보드에 이미지 쓰기
      try {
        clipboard.writeImage(image);
        stickerLog('[sticker:paste] wrote sticker image, size:', {
          size: image.getSize(),
          formats: clipboard.availableFormats(),
        });
      } catch (err) {
        return {
          ok: false,
          autoPasted: false,
          reason: `클립보드 쓰기 실패: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      // 4) 피커 숨기기 — 이전 앱이 포커스를 되찾도록.
      //    ★ 순서가 중요: alwaysOnTop을 먼저 해제해야 OS가 자연스럽게 이전 앱
      //    (카톡/스레드)에게 포커스를 돌려준다. alwaysOnTop이 살아있는 채로
      //    hide만 하면 일부 환경에서 포커스 복원 타이밍이 어긋나 nut-js Ctrl+V가
      //    엉뚱한 윈도우에 떨어져 "피커 스크린샷이 붙여넣어진 것처럼" 보이는
      //    증상이 발생할 수 있다.
      if (stickerPickerWindow && !stickerPickerWindow.isDestroyed()) {
        try {
          stickerPickerWindow.setAlwaysOnTop(false);
        } catch (topErr) {
          stickerLog('[sticker:paste] setAlwaysOnTop(false) 실패', topErr instanceof Error ? topErr.message : String(topErr));
        }
        stickerPickerWindow.hide();
        stickerPickerWindow.setOpacity(0);
        stickerLog('[sticker:paste] picker hidden (alwaysOnTop released)');
      }

      // 5) 플랫폼별 자동 붙여넣기 디스패치
      let result: { ok: boolean; autoPasted: boolean; reason?: string };
      if (process.platform === 'win32') {
        result = await pasteOnWindows(restoreMode, prevImage, prevText, image);
      } else if (process.platform === 'darwin') {
        result = await pasteOnMacOS(restoreMode, prevImage, prevText, image);
      } else {
        // Linux / 기타 — 클립보드만 채우고 사용자에게 수동 붙여넣기 안내
        result = { ok: true, autoPasted: false, reason: 'unsupported-platform' };
      }

      // 5-a) alwaysOnTop 재무장 — 다음 show()에서 다시 최상단에 떠야 하므로 복구.
      //    윈도우가 hide된 상태에서 setAlwaysOnTop(true)를 호출해도 안전하다.
      if (stickerPickerWindow && !stickerPickerWindow.isDestroyed()) {
        try {
          stickerPickerWindow.setAlwaysOnTop(true, 'screen-saver');
        } catch (topErr) {
          stickerLog('[sticker:paste] setAlwaysOnTop(true) 재무장 실패', topErr instanceof Error ? topErr.message : String(topErr));
        }
      }

      // 6) 자동 붙여넣기 실패 시 메인 윈도우에 폴백 안내 이벤트 송신.
      //    피커 윈도우는 이미 hide되어 있어 피커 측 토스트가 보이지 않으므로,
      //    메인 윈도우에서 "이모티콘이 클립보드에 복사됐어요. Ctrl+V로 붙여넣어 주세요." 토스트를 띄운다.
      if (
        result.ok &&
        !result.autoPasted &&
        mainWindow &&
        !mainWindow.isDestroyed()
      ) {
        try {
          mainWindow.webContents.send('sticker:fallback-paste-needed', {
            reason: result.reason ?? '',
          });
        } catch (sendErr) {
          stickerLog('[sticker:paste] fallback IPC 송신 실패', sendErr instanceof Error ? sendErr.message : String(sendErr));
          console.error('[sticker:paste] fallback IPC 송신 실패', sendErr);
        }
      }

      stickerLog('[sticker:paste] result:', result);
      return result;
    },
  );

  // sticker:request-accessibility-permission — macOS 전용.
  // PRD §4.1.1: accessibility-denied 토스트의 "권한 허용하기" 버튼이 호출.
  // - isTrustedAccessibilityClient(true)로 system 다이얼로그 표시
  // - 거부 시 시스템 환경설정 > 보안 및 개인정보 > 접근성 패널을 직접 연다.
  ipcMain.handle(
    'sticker:request-accessibility-permission',
    async (): Promise<{ granted: boolean; requested: boolean; reason?: string }> => {
      if (process.platform !== 'darwin') {
        return { granted: true, requested: false };
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { systemPreferences } = require('electron') as {
          systemPreferences: {
            isTrustedAccessibilityClient?: (prompt: boolean) => boolean;
          };
        };
        if (typeof systemPreferences.isTrustedAccessibilityClient === 'function') {
          // true = 시스템 권한 다이얼로그 prompt
          const granted = systemPreferences.isTrustedAccessibilityClient(true);
          if (!granted) {
            // 사용자가 곧장 패널을 열 수 있도록 보조 — 실패해도 silent
            try {
              await shell.openExternal(
                'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
              );
            } catch {
              /* silent */
            }
          }
          return { granted, requested: true };
        }
        return { granted: true, requested: false };
      } catch (error) {
        return {
          granted: false,
          requested: false,
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  // sticker:get-platform — 렌더러가 macOS 전용 UI(접근성 안내 등)를 조건부 렌더링.
  ipcMain.handle(
    'sticker:get-platform',
    (): { platform: 'win32' | 'darwin' | 'linux' } => {
      const p = process.platform;
      if (p === 'win32' || p === 'darwin' || p === 'linux') {
        return { platform: p };
      }
      // freebsd, openbsd 등 — UI상 linux 취급
      return { platform: 'linux' };
    },
  );

  // ─── 시트 분할 (Phase 2B / PRD §3.4.3) ───
  // SheetSplitter 클래스를 inline으로 보유 (tsconfig.electron rootDir=electron 한계).
  // 동일 로직이 src/infrastructure/sticker/SheetSplitter.ts에도 있음 (renderer 타입/테스트용).

  interface SplitCellResult {
    index: number;
    row: number;
    col: number;
    pngBuffer: Buffer;
    contentHash: string;
    isEmpty: boolean;
  }

  function detectEmptyCell(img: Electron.NativeImage): boolean {
    try {
      const bitmap = img.toBitmap();
      const size = img.getSize();
      const SAMPLES_PER_AXIS = 12;
      const stepX = Math.max(1, Math.floor(size.width / SAMPLES_PER_AXIS));
      const stepY = Math.max(1, Math.floor(size.height / SAMPLES_PER_AXIS));
      const colorCounts = new Map<string, number>();
      let total = 0;
      for (let y = 0; y < size.height; y += stepY) {
        for (let x = 0; x < size.width; x += stepX) {
          const offset = (y * size.width + x) * 4;
          const b = bitmap[offset] ?? 0;
          const g = bitmap[offset + 1] ?? 0;
          const r = bitmap[offset + 2] ?? 0;
          const a = bitmap[offset + 3] ?? 0;
          const key = a < 32 ? 'T' : `${r >> 4},${g >> 4},${b >> 4}`;
          colorCounts.set(key, (colorCounts.get(key) ?? 0) + 1);
          total++;
        }
      }
      if (total === 0) return false;
      let maxCount = 0;
      for (const v of colorCounts.values()) {
        if (v > maxCount) maxCount = v;
      }
      return maxCount / total >= 0.95;
    } catch {
      return false;
    }
  }

  function splitSheet(input: Buffer, gridSize: 2 | 3 | 4): SplitCellResult[] {
    const sheet = nativeImage.createFromBuffer(input);
    if (sheet.isEmpty()) {
      throw new Error('이미지를 읽을 수 없어요.');
    }
    const size = sheet.getSize();
    const sheetSize = Math.min(size.width, size.height);
    const cellSize = Math.floor(sheetSize / gridSize);
    const results: SplitCellResult[] = [];
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const cell = sheet.crop({
          x: col * cellSize,
          y: row * cellSize,
          width: cellSize,
          height: cellSize,
        });
        const normalized = cell.resize({
          width: 360,
          height: 360,
          quality: 'best',
        });
        const pngBuffer = normalized.toPNG();
        const isEmpty = detectEmptyCell(normalized);
        const contentHash = crypto
          .createHash('sha256')
          .update(pngBuffer)
          .digest('hex')
          .slice(0, 16);
        results.push({
          index: row * gridSize + col,
          row,
          col,
          pngBuffer,
          contentHash,
          isEmpty,
        });
      }
    }
    return results;
  }

  // 분할 세션 캐시 — buffers를 IPC payload로 매번 보내지 않도록 main에 보관.
  // 10분 후 자동 만료, sticker:commit-sheet-cells 또는 cancel 시 즉시 정리.
  const splitSessionCache = new Map<
    string,
    {
      cells: SplitCellResult[];
      sheetWidth: number;
      sheetHeight: number;
      expireTimer: ReturnType<typeof setTimeout>;
    }
  >();

  function clearSplitSession(sessionId: string): void {
    const session = splitSessionCache.get(sessionId);
    if (session) {
      clearTimeout(session.expireTimer);
      splitSessionCache.delete(sessionId);
    }
  }

  // sticker:validate-sheet — 시트 dimension 검증용 (renderer가 grid size 선택 전 호출)
  ipcMain.handle(
    'sticker:validate-sheet',
    async (
      _event,
      args: { sourcePath: string },
    ): Promise<{ width: number; height: number }> => {
      const resolved = validateAbsoluteSourcePath(args.sourcePath);
      const buffer = await fs.promises.readFile(resolved);
      const img = nativeImage.createFromBuffer(buffer);
      if (img.isEmpty()) {
        throw new Error('이미지를 읽을 수 없어요.');
      }
      const size = img.getSize();
      return { width: size.width, height: size.height };
    },
  );

  // sticker:split-sheet — 시트를 N×N으로 분할하고 미리보기 dataUrl + sessionId 반환
  ipcMain.handle(
    'sticker:split-sheet',
    async (
      _event,
      args: { sourcePath: string; gridSize: 2 | 3 | 4 },
    ): Promise<{
      sessionId: string;
      gridSize: 2 | 3 | 4;
      sheetWidth: number;
      sheetHeight: number;
      cells: Array<{
        index: number;
        row: number;
        col: number;
        contentHash: string;
        isEmpty: boolean;
        dataUrl: string;
      }>;
    }> => {
      const resolved = validateAbsoluteSourcePath(args.sourcePath);
      if (![2, 3, 4].includes(args.gridSize)) {
        throw new Error('지원하지 않는 격자 크기입니다.');
      }
      const buffer = await fs.promises.readFile(resolved);
      const cells = splitSheet(buffer, args.gridSize);
      const img = nativeImage.createFromBuffer(buffer);
      const size = img.getSize();

      const sessionId = crypto.randomBytes(16).toString('hex');
      const expireTimer = setTimeout(
        () => splitSessionCache.delete(sessionId),
        10 * 60 * 1000,
      );
      splitSessionCache.set(sessionId, {
        cells,
        sheetWidth: size.width,
        sheetHeight: size.height,
        expireTimer,
      });

      return {
        sessionId,
        gridSize: args.gridSize,
        sheetWidth: size.width,
        sheetHeight: size.height,
        cells: cells.map((c) => ({
          index: c.index,
          row: c.row,
          col: c.col,
          contentHash: c.contentHash,
          isEmpty: c.isEmpty,
          dataUrl: 'data:image/png;base64,' + c.pngBuffer.toString('base64'),
        })),
      };
    },
  );

  // sticker:commit-sheet-cells — 사용자가 선택한 셀들을 stickers/{id}.png로 저장
  ipcMain.handle(
    'sticker:commit-sheet-cells',
    async (
      _event,
      args: {
        sessionId: string;
        cells: Array<{ index: number; stickerId: string }>;
      },
    ): Promise<{
      committed: Array<{ index: number; stickerId: string; contentHash: string }>;
    }> => {
      const session = splitSessionCache.get(args.sessionId);
      if (!session) {
        throw new Error('분할 세션이 만료되었어요. 다시 시도해 주세요.');
      }

      const dir = getStickerImageDir();

      const committed: Array<{
        index: number;
        stickerId: string;
        contentHash: string;
      }> = [];
      for (const requested of args.cells) {
        const cell = session.cells.find((c) => c.index === requested.index);
        if (!cell) continue;
        const id = validateStickerId(requested.stickerId);
        const target = path.join(dir, `${id}.png`);
        await fs.promises.writeFile(target, cell.pngBuffer);
        committed.push({
          index: cell.index,
          stickerId: id,
          contentHash: cell.contentHash,
        });
      }

      clearSplitSession(args.sessionId);
      return { committed };
    },
  );

  // sticker:cancel-sheet-session — 사용자가 분할 모달을 닫았을 때 세션 정리
  ipcMain.handle(
    'sticker:cancel-sheet-session',
    async (_event, args: { sessionId: string }): Promise<{ ok: boolean }> => {
      clearSplitSession(args.sessionId);
      return { ok: true };
    },
  );

  // sticker:close-picker — 렌더러가 ESC/backdrop 클릭 시 호출
  ipcMain.handle('sticker:close-picker', (): void => {
    if (stickerPickerWindow && !stickerPickerWindow.isDestroyed()) {
      stickerPickerWindow.hide();
      stickerPickerWindow.setOpacity(0);
    }
  });

  // sticker:trigger-toggle — 글로벌 단축키 등록이 실패한 경우의 fallback.
  // 메인 윈도우 포커스 상태에서 keydown으로 잡힌 단축키가 이 IPC를 호출하면
  // main process가 정상적으로 picker 토글을 수행한다.
  ipcMain.handle('sticker:trigger-toggle', (): void => {
    triggerShortcut('sticker-picker:toggle');
  });

  // sticker:notify-data-changed — 메인 창의 관리 화면에서 metadata가 바뀌었을 때
  // 피커 윈도우(별도 BrowserWindow)에 broadcast하여 store cache를 무효화시킨다.
  // (피커는 자체 renderer process라 메인 store와 메모리 공유 X)
  ipcMain.handle('sticker:notify-data-changed', (): void => {
    if (stickerPickerWindow && !stickerPickerWindow.isDestroyed()) {
      stickerPickerWindow.webContents.send('sticker:data-changed');
    }
  });

  // sticker:open-manager — 피커 빈 상태에서 "쌤도구 열기" 클릭 시 호출.
  // 메인 창을 포커스하고 tool-sticker 페이지로 이동, 피커 윈도우는 hide.
  ipcMain.handle('sticker:open-manager', (): void => {
    ensureMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('navigate:to-page', 'tool-sticker');
    }
    if (stickerPickerWindow && !stickerPickerWindow.isDestroyed()) {
      stickerPickerWindow.hide();
      stickerPickerWindow.setOpacity(0);
    }
  });
}

/** 앱 시작 시 중요 데이터 파일 백업 생성 */
function createStartupBackups(): void {
  const dataDir = getDataDir();
  const criticalFiles = [
    'attendance', 'teaching-classes', 'curriculum-progress',
    'settings', 'memos', 'todos', 'events',
  ];

  for (const filename of criticalFiles) {
    const filePath = path.join(dataDir, `${filename}.json`);
    const backupPath = path.join(dataDir, `${filename}.backup.json`);
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        if (raw.length > 10) {
          JSON.parse(raw); // 유효한 JSON인지 확인
          fs.writeFileSync(backupPath, raw, 'utf-8');
        }
      }
    } catch {
      // 개별 파일 실패는 무시
    }
  }
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const fileArg = argv.find((arg) => arg.endsWith('.ssampin'));
    if (fileArg && fs.existsSync(fileArg)) {
      const content = fs.readFileSync(fileArg, 'utf-8');
      mainWindow?.webContents.send('share:file-opened', content);
    }
    if (mainWindow) {
      mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    applySystemSettings();
    createStartupBackups();
    checkInstallation();
    registerIpcHandlers();
    registerSecureStorageHandlers();
    createWindow();
    registerOAuthHandlers(mainWindow!);
    registerPKCEFallbackHandlers();
    registerLiveVoteHandlers(mainWindow!);
    registerLiveSurveyHandlers(mainWindow!);
    registerLiveWordCloudHandlers(mainWindow!);
    registerLiveMultiSurveyHandlers(mainWindow!);
    registerLiveDiscussionHandlers(mainWindow!);
    registerRealtimeWallHandlers(mainWindow!);
    registerRealtimeWallLinkPreviewHandler();
    registerRealtimeWallPdfHandlers();
    registerBoardHandlers(mainWindow!);
    registerRealtimeWallBoardHandlers();
    // 글로벌 퀵애드 단축키 IPC
    ipcMain.handle('shortcuts:sync', (_event, config: ShortcutSyncConfig) => {
      return applyGlobalShortcuts(config);
    });
    // QuickAdd 팝업 창 prewarm (앱 시작 5초 후) — 첫 단축키 latency 제거
    setTimeout(() => prewarmQuickAddWindow(), 5000);
    // Sticker picker prewarm (5.5초 — quickAdd와 약간 stagger)
    setTimeout(() => prewarmStickerPickerWindow(), 5500);
    createTray();
    setupAutoUpdater();

    // Auto-check for updates 5 seconds after app start (only in production)
    if (!process.env['VITE_DEV_SERVER_URL']) {
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch((e: Error) => {
          console.error('[autoUpdater] check failed:', e.message);
        });
      }, 5000);

      // 4시간마다 재체크
      setInterval(() => {
        autoUpdater.checkForUpdates().catch((e: Error) => {
          console.error('[autoUpdater] periodic check failed:', e.message);
        });
      }, 4 * 60 * 60 * 1000);
    }

    // 모니터 연결/해제/배율 변경 시 위젯 위치 보정
    screen.on('display-added', () => ensureWidgetOnScreen());
    screen.on('display-removed', () => ensureWidgetOnScreen());
    screen.on('display-metrics-changed', () => {
      setTimeout(() => {
        ensureWidgetOnScreen();
        // 절전 복귀로 인한 DPI 변경 시에도 위젯 리프레시
        if (widgetWindow && !widgetWindow.isDestroyed()) {
          widgetWindow.webContents.invalidate();
        }
      }, 500);
    });

    // Start in widget mode if the setting is enabled
    const widgetOptions = readSettingsWidgetOptions();
    if (widgetOptions.startInWidgetMode) {
      createWidgetWindow(widgetOptions, () => hideOrDestroyMainWindow(widgetOptions.memorySaverMode));
    }

    // Handle .ssampin file open from CLI args
    const fileArg = process.argv.find((arg) => arg.endsWith('.ssampin'));
    if (fileArg && fs.existsSync(fileArg)) {
      const content = fs.readFileSync(fileArg, 'utf-8');
      mainWindow?.webContents.once('did-finish-load', () => {
        mainWindow?.webContents.send('share:file-opened', content);
      });
    }

    // ─── 절전/화면보호기 복귀 시 위젯 복원 (Windows, macOS) ───
    powerMonitor.on('suspend', () => {
      console.log('[power] 시스템 suspend 감지');
      isSystemSuspending = true;
      widgetActiveBeforeSleep = widgetWasActive ||
        (widgetWindow !== null && !widgetWindow.isDestroyed());
    });

    powerMonitor.on('resume', () => {
      console.log('[power] 시스템 resume 감지');
      isSystemSuspending = false;
      setTimeout(() => restoreWidgetAfterSleep(), 1000);
    });

    // 화면 잠금(화면보호기 + "로그온 화면 표시" 옵션 포함) 감지
    powerMonitor.on('lock-screen', () => {
      console.log('[power] 화면 잠금 감지');
      isSystemSuspending = true;
      widgetActiveBeforeSleep = widgetWasActive ||
        (widgetWindow !== null && !widgetWindow.isDestroyed());
    });

    powerMonitor.on('unlock-screen', () => {
      console.log('[power] 화면 잠금 해제 감지');
      isSystemSuspending = false;
      setTimeout(() => restoreWidgetAfterSleep(), 500);
    });
  });
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  destroyQuickAddWindow();
  destroyStickerPickerWindow();
});

app.on('before-quit', () => {
  isQuitting = true;
  // 협업 보드 활성 세션이 있으면 동기 저장 (Design §3.2-bis)
  endActiveBoardSessionSync();
  // 실시간 담벼락 dirty WallBoard 동기 저장 (Design §3.3)
  saveDirtyWallBoardsSync();
  // Analytics flush 신호 전송
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('analytics:flush');
  }
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.webContents.send('analytics:flush');
  }
});

app.on('window-all-closed', () => {
  // Don't quit — app stays in system tray
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
