// PoC #1 + #3 통합 spike
// - PoC #1: Windows 풀스크린 위 56×56 transparent BrowserWindow 가시성
// - PoC #3: opacity 0→1 fade 220ms 체감
//
// 실행: npx electron spikes/icon-mode/fullscreen-fade-spike/main.js
// 단축키: Ctrl+Shift+F (fade toggle), Ctrl+Shift+S (즉시 토글), Ctrl+Shift+Q (종료)

const { app, BrowserWindow, screen, globalShortcut } = require('electron');
const path = require('path');

let iconWindow = null;
let isVisible = true;

function createIconWindow() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;
  const ICON_SIZE = 56;
  const MARGIN = 24;

  iconWindow = new BrowserWindow({
    width: ICON_SIZE,
    height: ICON_SIZE,
    x: x + width - ICON_SIZE - MARGIN,
    y: y + height - ICON_SIZE - MARGIN,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: true,
    hasShadow: false,
    opacity: 0,
    title: 'Icon Mode PoC',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 핵심: 풀스크린 위에 보이는지 검증할 옵션들
  iconWindow.setAlwaysOnTop(true, 'screen-saver');
  iconWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  iconWindow.loadFile(path.join(__dirname, 'index.html'));

  // 시작 시 fade-in
  fadeIn(220);
}

// fadeInQuickAddWindow 패턴 복제 (electron/main.ts:108-125)
function fadeIn(duration = 220) {
  if (!iconWindow || iconWindow.isDestroyed()) return;
  const startTime = Date.now();
  iconWindow.setOpacity(0);
  iconWindow.show();
  const interval = setInterval(() => {
    if (!iconWindow || iconWindow.isDestroyed()) {
      clearInterval(interval);
      return;
    }
    const elapsed = Date.now() - startTime;
    const t = Math.min(1, elapsed / duration);
    // ease-out cubic
    const opacity = 1 - Math.pow(1 - t, 3);
    iconWindow.setOpacity(opacity);
    if (t >= 1) clearInterval(interval);
  }, 16);
  isVisible = true;
}

function fadeOut(duration = 180) {
  return new Promise((resolve) => {
    if (!iconWindow || iconWindow.isDestroyed()) return resolve();
    const startTime = Date.now();
    iconWindow.setOpacity(1);
    const interval = setInterval(() => {
      if (!iconWindow || iconWindow.isDestroyed()) {
        clearInterval(interval);
        resolve();
        return;
      }
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / duration);
      // ease-in cubic
      const opacity = 1 - Math.pow(t, 3);
      iconWindow.setOpacity(opacity);
      if (t >= 1) {
        clearInterval(interval);
        resolve();
      }
    }, 16);
  });
}

async function fadeToggle() {
  if (isVisible) {
    console.log('[poc] fade out (180ms)');
    await fadeOut(180);
    isVisible = false;
    setTimeout(() => {
      console.log('[poc] fade in (220ms)');
      fadeIn(220);
    }, 600); // 잠깐 안 보이는 시간 두고 다시 fade-in (확장 느낌 비교)
  } else {
    console.log('[poc] fade in (220ms)');
    fadeIn(220);
  }
}

function instantToggle() {
  if (!iconWindow || iconWindow.isDestroyed()) return;
  if (isVisible) {
    console.log('[poc] instant hide');
    iconWindow.setOpacity(0);
    isVisible = false;
  } else {
    console.log('[poc] instant show');
    iconWindow.setOpacity(1);
    isVisible = true;
  }
}

app.whenReady().then(() => {
  createIconWindow();

  // 글로벌 단축키 등록 (포커스와 무관)
  const fadeKey = globalShortcut.register('Control+Shift+F', () => {
    void fadeToggle();
  });
  const instantKey = globalShortcut.register('Control+Shift+S', () => {
    instantToggle();
  });
  const quitKey = globalShortcut.register('Control+Shift+Q', () => {
    console.log('[poc] quit shortcut');
    app.quit();
  });

  console.log('[poc] icon mode spike ready');
  console.log('[poc] shortcuts:');
  console.log('  Ctrl+Shift+F = fade toggle (out 180 → wait 600 → in 220)');
  console.log('  Ctrl+Shift+S = instant toggle (no fade, for comparison)');
  console.log('  Ctrl+Shift+Q = quit');
  console.log(`[poc] fade=${fadeKey ? 'OK' : 'FAIL'}, instant=${instantKey ? 'OK' : 'FAIL'}, quit=${quitKey ? 'OK' : 'FAIL'}`);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  app.quit();
});
