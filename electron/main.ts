import { app, BrowserWindow, ipcMain, screen, dialog, shell, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import { attachToDesktop, attachToDesktopAsync } from './workerw';

declare const __dirname: string;

let mainWindow: BrowserWindow | null = null;
let widgetWindow: BrowserWindow | null = null;
let savePositionTimer: ReturnType<typeof setTimeout> | null = null;
let widgetHeartbeat: ReturnType<typeof setInterval> | null = null;
let tray: Tray | null = null;
let isQuitting = false;

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

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: '쌤핀',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
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
  const iconCandidates = [
    path.join(__dirname, '../build/icon.ico'),
    path.join(__dirname, '../public/favicon.ico'),
    path.join(process.resourcesPath || '', 'build/icon.ico'),
  ];
  try {
    const iconFile = iconCandidates.find((p) => fs.existsSync(p));
    const trayIcon = iconFile
      ? nativeImage.createFromPath(iconFile).resize({ width: 16, height: 16 })
      : nativeImage.createEmpty();
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
      { type: 'separator' },
      {
        label: '항상 위에 표시',
        type: 'checkbox',
        checked: false,
        click: (menuItem) => {
          mainWindow?.setAlwaysOnTop(menuItem.checked);
          if (widgetWindow && !widgetWindow.isDestroyed()) {
            widgetWindow.setAlwaysOnTop(menuItem.checked);
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
  try {
    const filePath = path.join(getDataDir(), 'settings.json');
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const settings = JSON.parse(raw);
      const autoLaunch = settings.system?.autoLaunch ?? false;
      app.setLoginItemSettings({
        openAtLogin: autoLaunch,
        path: app.getPath('exe'),
      });
    }
  } catch {
    // fall through
  }
}

function startWidgetHeartbeat(): void {
  // 30초마다 WorkerW 연결 상태 재확인 (Explorer 재시작 등 대비)
  if (widgetHeartbeat) clearInterval(widgetHeartbeat);
  widgetHeartbeat = setInterval(() => {
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      const hwndBuf = widgetWindow.getNativeWindowHandle();
      attachToDesktopAsync(hwndBuf).catch(() => {/* ignore heartbeat errors */});
    } else {
      if (widgetHeartbeat) clearInterval(widgetHeartbeat);
      widgetHeartbeat = null;
    }
  }, 30_000);
}

function stopWidgetHeartbeat(): void {
  if (widgetHeartbeat) {
    clearInterval(widgetHeartbeat);
    widgetHeartbeat = null;
  }
}

function createWidgetWindow(
  options: { width: number; height: number; alwaysOnTop: boolean },
  onReady?: () => void,
): void {
  const savedBounds = readWidgetBounds();
  const defaultPos = getDefaultWidgetBounds(options.width);

  const x = savedBounds?.x ?? defaultPos.x;
  const y = savedBounds?.y ?? defaultPos.y;
  const width = savedBounds?.width ?? options.width;
  const height = savedBounds?.height ?? options.height;

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
    alwaysOnTop: true,
    resizable: true,
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
    widgetWindow.show();
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

  widgetWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      stopWidgetHeartbeat();
      widgetWindow?.hide();
      // 위젯 닫힐 때 메인 창 복원
      mainWindow?.show();
    }
  });

  widgetWindow.on('closed', () => {
    stopWidgetHeartbeat();
    widgetWindow = null;
  });
}

function readSettingsWidgetOptions(): { width: number; height: number; alwaysOnTop: boolean; startInWidgetMode: boolean; closeToWidget: boolean } {
  try {
    const filePath = path.join(getDataDir(), 'settings.json');
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const settings = JSON.parse(raw) as {
        widget?: { width?: number; height?: number; alwaysOnTop?: boolean; transparent?: boolean; closeToWidget?: boolean };
      };
      return {
        width: settings.widget?.width ?? 920,
        height: settings.widget?.height ?? 700,
        alwaysOnTop: settings.widget?.alwaysOnTop ?? true,
        startInWidgetMode: settings.widget?.transparent ?? false,
        closeToWidget: settings.widget?.closeToWidget ?? true,
      };
    }
  } catch {
    // fall through to defaults
  }
  return { width: 920, height: 700, alwaysOnTop: true, startInWidgetMode: false, closeToWidget: true };
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

      if (filename === 'settings') {
        try {
          const settings = JSON.parse(data);
          app.setLoginItemSettings({
            openAtLogin: settings.system?.autoLaunch ?? false,
            path: app.getPath('exe'),
          });
        } catch {
          // ignore parsing error
        }
      }
    },
  );

  // window:setAlwaysOnTop
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
      widgetWindow.destroy();
      widgetWindow = null;
      mainWindow?.show();
    } else {
      // 위젯이 없으면 생성하고, 표시된 뒤 메인창 숨김
      const widgetOptions = readSettingsWidgetOptions();
      createWidgetWindow(widgetOptions, () => mainWindow?.hide());
    }
  });

  // window:setOpacity — 위젯 투명도 설정
  ipcMain.handle('window:setOpacity', (_event, value: number): void => {
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.setOpacity(Math.max(0, Math.min(1, value)));
    }
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
    createWindow();
    createTray();

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
});

app.on('window-all-closed', () => {
  // Don't quit — app stays in system tray
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
