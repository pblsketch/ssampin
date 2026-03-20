import { app, BrowserWindow, ipcMain, screen, dialog, shell, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import { autoUpdater } from 'electron-updater';
import { registerOAuthHandlers } from './ipc/oauth';
import { registerPKCEFallbackHandlers } from './ipc/oauthPKCEFallback';
import { registerSecureStorageHandlers } from './ipc/secureStorage';
import { registerLiveVoteHandlers } from './ipc/liveVote';
import { registerLiveSurveyHandlers } from './ipc/liveSurvey';
import { registerLiveWordCloudHandlers } from './ipc/liveWordCloud';

declare const __dirname: string;

let mainWindow: BrowserWindow | null = null;
let widgetWindow: BrowserWindow | null = null;
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
  const candidates = [
    path.join(__dirname, '../build/icon.ico'),
    path.join(__dirname, '../public/favicon.ico'),
    path.join(process.resourcesPath || '', 'icon.ico'),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  return found ? nativeImage.createFromPath(found) : nativeImage.createEmpty();
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
      if (opts.closeToWidget) {
        // X 버튼 → 위젯 모드로 전환
        if (!widgetWindow || widgetWindow.isDestroyed()) {
          // 위젯이 실제로 표시된 뒤 메인 창을 숨겨 "아무것도 안 보이는" gap 방지
          createWidgetWindow(opts, () => mainWindow?.hide());
        } else {
          widgetWindow.show();
          mainWindow?.hide();
        }
      } else {
        // 위젯 전환 없이 트레이로만 숨김
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
    const trayIcon = getAppIcon().resize({ width: 16, height: 16 });
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
            mainWindow?.hide();
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
      app.setLoginItemSettings({
        openAtLogin: autoLaunch,
        name: '쌤핀',
        enabled: autoLaunch,
      });
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
    if (!isQuitting) {
      e.preventDefault();
      stopWinDRecovery();
      widgetWindow?.hide();
      mainWindow?.show();
    }
  });

  widgetWindow.on('closed', () => {
    stopWinDRecovery();
    widgetWindow = null;
    currentDesktopMode = 'normal';
  });
}

function readSettingsWidgetOptions(): { width: number; height: number; startInWidgetMode: boolean; closeToWidget: boolean; desktopMode: string } {
  try {
    const filePath = path.join(getDataDir(), 'settings.json');
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const settings = JSON.parse(raw) as {
        widget?: { width?: number; height?: number; transparent?: boolean; closeToWidget?: boolean; desktopMode?: string };
      };
      const rawMode = settings.widget?.desktopMode ?? 'normal';
      // 마이그레이션: 이전 모드 → normal/topmost
      const desktopMode = rawMode === 'floating' ? 'topmost'
        : (rawMode === 'auto' || rawMode === 'desktop' || rawMode === 'behind' || rawMode === 'above') ? 'normal'
        : rawMode;
      return {
        width: settings.widget?.width ?? 920,
        height: settings.widget?.height ?? 700,
        startInWidgetMode: settings.widget?.transparent ?? false,
        closeToWidget: settings.widget?.closeToWidget ?? true,
        desktopMode,
      };
    }
  } catch {
    // fall through to defaults
  }
  return { width: 920, height: 700, startInWidgetMode: false, closeToWidget: true, desktopMode: 'normal' };
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
  // data:read — userData/data/{filename}.json 읽기
  ipcMain.handle('data:read', (_event, filename: string): string | null => {
    const filePath = path.join(getDataDir(), `${filename}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return fs.readFileSync(filePath, 'utf-8');
  });

  // data:write — JSON 파일 쓰기
  ipcMain.handle(
    'data:write',
    (_event, filename: string, data: string): void => {
      const filePath = path.join(getDataDir(), `${filename}.json`);
      fs.writeFileSync(filePath, data, 'utf-8');

      if (filename === 'settings' && !process.env['VITE_DEV_SERVER_URL']) {
        try {
          const settings = JSON.parse(data);
          const autoLaunch = settings.system?.autoLaunch ?? false;
          app.setLoginItemSettings({
            openAtLogin: autoLaunch,
            name: '쌤핀',
            enabled: autoLaunch,
          });
        } catch {
          // ignore parsing error
        }
      }
    },
  );

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
      // 위젯이 열려있으면 닫고 메인창 복원
      stopWinDRecovery();
      widgetWindow.destroy();
      widgetWindow = null;
      currentDesktopMode = 'normal';
      mainWindow?.show();
    } else {
      // 위젯이 없으면 생성하고, 표시된 뒤 메인창 숨김
      const widgetOptions = readSettingsWidgetOptions();
      createWidgetWindow(widgetOptions, () => mainWindow?.hide());
    }
  });

  // window:navigateToPage — 메인 창으로 포커스 이동 + 페이지 이동 + 위젯 닫기
  ipcMain.handle('window:navigateToPage', (_event, page: string) => {
    // Send navigation event to main window
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
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
      if (typeof data === 'string') {
        fs.writeFileSync(filePath, data, 'utf-8');
      } else {
        fs.writeFileSync(filePath, Buffer.from(data));
      }
    },
  );

  // export:printToPDF — 현재 윈도우 PDF 출력
  ipcMain.handle(
    'export:printToPDF',
    async (): Promise<ArrayBuffer | null> => {
      if (!mainWindow) return null;
      const data = await mainWindow.webContents.printToPDF({
        printBackground: true,
        landscape: false,
        pageSize: 'A4',
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

  // update:check — 업데이트 확인
  ipcMain.handle('update:check', (): void => {
    autoUpdater.checkForUpdates().catch((err: Error) => {
      console.error('[autoUpdater] checkForUpdates error:', err);
    });
  });

  // update:download — 업데이트 다운로드
  ipcMain.handle('update:download', (): void => {
    autoUpdater.downloadUpdate().catch((err: Error) => {
      console.error('[autoUpdater] downloadUpdate error:', err);
    });
  });

  // update:install — 업데이트 설치 및 재시작
  ipcMain.handle('update:install', (): void => {
    autoUpdater.quitAndInstall();
  });
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
    registerIpcHandlers();
    registerSecureStorageHandlers();
    createWindow();
    registerOAuthHandlers(mainWindow!);
    registerPKCEFallbackHandlers();
    registerLiveVoteHandlers(mainWindow!);
    registerLiveSurveyHandlers(mainWindow!);
    registerLiveWordCloudHandlers(mainWindow!);
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
      setTimeout(() => ensureWidgetOnScreen(), 500);
    });

    // Start in widget mode if the setting is enabled
    const widgetOptions = readSettingsWidgetOptions();
    if (widgetOptions.startInWidgetMode) {
      createWidgetWindow(widgetOptions, () => mainWindow?.hide());
    }

    // Handle .ssampin file open from CLI args
    const fileArg = process.argv.find((arg) => arg.endsWith('.ssampin'));
    if (fileArg && fs.existsSync(fileArg)) {
      const content = fs.readFileSync(fileArg, 'utf-8');
      mainWindow?.webContents.once('did-finish-load', () => {
        mainWindow?.webContents.send('share:file-opened', content);
      });
    }
  });
}

app.on('before-quit', () => {
  isQuitting = true;
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
