/**
 * 바탕화면 모드 크로스-모니터 드래그 실측 (2026-08-18 신고 5차 — 가설 5 확정용)
 *
 * 앱 전체를 띄우지 않고, **빌드된 실제 매니저**(dist-electron/desktopWidgetManager.js)를 그대로
 * 불러 위젯과 같은 옵션의 창을 바탕화면(WorkerW) 자식으로 붙인 뒤, 실제 마우스 드래그를 주입해
 * 배율이 다른 모니터로 넘긴다.
 *
 * 확인하려는 단 하나 —
 *   목적지 모니터로 넘어간 뒤 **Chromium이 그 모니터의 배율로 다시 그리는가?**
 *     · getBounds()(DIP) == 물리 크기  → 목적지 배율(1.0)로 인식 → 창 크기만 고치면 됨
 *     · getBounds()(DIP) != 물리 크기  → 출발 배율을 붙들고 있음 → 크기만 고치면 내용이 깨짐
 *
 * 실행: node scripts/build-electron.mjs && npx electron scripts/dpi-probe/desktop-mode-drag-probe.mjs
 */
import { app, BrowserWindow, screen } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const repoRoot = path.resolve(__dirname, '../..');

const HTML = `data:text/html,<body style="margin:0;background:rgb(20,24,40);color:%23fff;font:13px sans-serif">
<div style="height:40px;background:rgb(60,64,100);padding:8px 12px">HEADER</div>
<div style="padding:12px">desktop-mode probe — 30px 격자로 배율을 눈으로도 본다</div>
<div style="height:200px;background:repeating-linear-gradient(90deg,%23334 0 30px,%23445 30px 60px)"></div>
</body>`;

function snap(win, tag) {
  const b = win.getBounds();
  const phys = screen.dipToScreenRect(win, b);
  const d = screen.getDisplayMatching(b);
  console.log(
    `${tag.padEnd(26)} getBounds(DIP)=(${b.x},${b.y},${b.width}x${b.height}) ` +
      `dipToScreen=(${phys.x},${phys.y},${phys.width}x${phys.height}) ` +
      `display=${d.id} scale=${d.scaleFactor}`,
  );
  return { b, phys, d };
}

app.whenReady().then(async () => {
  const { createDesktopWidgetManager } = require(
    path.join(repoRoot, 'dist-electron/desktopWidgetManager.js'),
  );
  const primary = screen.getPrimaryDisplay();
  const secondary = screen.getAllDisplays().find((d) => d.id !== primary.id);
  if (!secondary) {
    console.log('보조 모니터 없음 — 중단');
    app.quit();
    return;
  }
  console.log(
    `주=${primary.id} scale=${primary.scaleFactor} / 보조=${secondary.id} scale=${secondary.scaleFactor}`,
  );

  const win = new BrowserWindow({
    x: primary.workArea.x + 80,
    y: primary.workArea.y + 80,
    width: 700,
    height: 520,
    minWidth: 640,
    minHeight: 480,
    frame: false,
    transparent: true,
    thickFrame: false,
    alwaysOnTop: false,
    resizable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadURL(HTML);
  await new Promise((r) => win.once('ready-to-show', r));
  win.showInactive();
  await new Promise((r) => setTimeout(r, 600));

  const manager = createDesktopWidgetManager();
  const status = await manager.enable(win);
  console.log(
    `manager.enable → ok=${status.ok} mode=${status.mode} reason=${status.reason ?? '-'}`,
  );
  if (!status.ok) {
    console.log('바탕화면 모드 진입 실패 — 중단');
    win.destroy();
    app.quit();
    return;
  }
  manager.updateWidgetBounds(win);
  // 헤더 전체 폭 40 DIP를 drag 영역으로 등록 (renderer가 하는 일을 대신)
  manager.setHeaderRegions([{ x: 0, y: 0, width: 700, height: 40 }], win);
  await new Promise((r) => setTimeout(r, 400));

  console.log('');
  const start = snap(win, '① 175% 모니터 부착 직후');
  const cached = manager.getCachedPhysicalBounds();
  console.log(
    `   manager cachedPhysicalBounds=(${cached?.x},${cached?.y},${cached?.width}x${cached?.height})`,
  );

  const hbuf = win.getNativeWindowHandle();
  const hwnd = hbuf.length === 8 ? hbuf.readBigUInt64LE(0) : BigInt(hbuf.readUInt32LE(0));

  // ── 마우스 주입 대신 창을 직접 옮긴다 ──
  // 이유: 바탕화면 모드의 drag는 z-order 검증(WindowFromPoint)을 통과해야 시작되는데,
  // 그 지점 위에 다른 창(터미널 등)이 있으면 클릭이 위젯으로 라우팅되지 않는다.
  // 우리가 알고 싶은 것은 "옮겨진 뒤 Chromium이 어떤 배율로 그리는가"이므로,
  // drag가 하는 일(= win32.moveWidget)을 그대로 호출해 같은 상태를 만든다.
  // win32Desktop 모듈을 두 번 불러오면 koffi 타입 중복 등록으로 바인딩이 죽는다
  // (매니저가 이미 로드해 두었다). 프로브는 user32를 직접 얇게 바인딩한다.
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const SetWindowPos = user32.func(
    'int __stdcall SetWindowPos(void*, void*, int, int, int, int, uint32)',
  );
  const GetWindowRectRaw = user32.func('int __stdcall GetWindowRect(void*, void*)');
  const rectBuf = Buffer.alloc(16);
  const readRect = () => {
    if (GetWindowRectRaw(hwnd, rectBuf) === 0) return null;
    return {
      x: rectBuf.readInt32LE(0),
      y: rectBuf.readInt32LE(4),
      width: rectBuf.readInt32LE(8) - rectBuf.readInt32LE(0),
      height: rectBuf.readInt32LE(12) - rectBuf.readInt32LE(4),
    };
  };
  const SWP_NOZORDER_NOACTIVATE = 0x0004 | 0x0010;
  const win32 = {
    moveWidget: (h, x, y, w2, h2) =>
      SetWindowPos(h, null, x, y, w2, h2, SWP_NOZORDER_NOACTIVATE) !== 0,
    getWindowRect: () => readRect(),
  };
  const secPhysX = Math.round(primary.bounds.width * primary.scaleFactor);
  const w = cached.width;
  const h = cached.height;
  const y = cached.y;

  async function renderInfo() {
    try {
      return await win.webContents.executeJavaScript(
        '({dpr: window.devicePixelRatio, iw: window.innerWidth, ih: window.innerHeight})',
      );
    } catch (e) {
      return { dpr: 'err', iw: 'err', ih: 'err' };
    }
  }

  console.log('');
  console.log('=== win32.moveWidget으로 경계를 가로질러 이동 ===');
  const xs = [cached.x, 1500, 2400, secPhysX - 200, secPhysX + 100, secPhysX + 400, secPhysX + 700];
  for (const x of xs) {
    const moveOk = win32.moveWidget(hwnd, x, y, w, h);
    await new Promise((r) => setTimeout(r, 500));
    manager.updateWidgetBounds(win);
    await new Promise((r) => setTimeout(r, 200));
    const b = win.getBounds();
    const phys = screen.dipToScreenRect(win, b);
    const d = screen.getDisplayMatching(b);
    const ri = await renderInfo();
    const rect = manager.getCachedPhysicalBounds();
    const truth = win32.getWindowRect(hwnd);
    console.log(
      `  moveWidget x=${String(x).padStart(5)} ok=${moveOk} GetWindowRect=${typeof truth === 'string' ? truth : JSON.stringify(truth)} cached=(${rect?.x},${rect?.y},${rect?.width}x${rect?.height}) ` +
        `getBounds(DIP)=(${b.x},${b.y},${b.width}x${b.height}) display=${d.id} scale=${d.scaleFactor} ` +
        `devicePixelRatio=${ri.dpr} innerSize=${ri.iw}x${ri.ih}`,
    );
  }

  // ── 도착 후 충분히 기다렸다가 다시 읽는다 (레이아웃 지연 배제) ──
  await new Promise((r) => setTimeout(r, 2000));
  const settled = await renderInfo();
  const truthSettled = win32.getWindowRect();
  console.log('');
  console.log(
    `  [2초 후 재측정] devicePixelRatio=${settled.dpr} innerSize=${settled.iw}x${settled.ih} ` +
      `실제 창=${JSON.stringify(truthSettled)}`,
  );
  const shot = await win.webContents.capturePage();
  const shotSize = shot.getSize();
  console.log(`  [실제로 그려진 영역] capturePage=${shotSize.width}x${shotSize.height}`);

  // ── 고칠 수 있는가: Electron에 DIP 크기를 다시 알려주면 내용이 창을 채우는가 ──
  console.log('');
  console.log('=== 수정안 검증: 드래그 시작 시점의 DIP 크기를 다시 지정 ===');
  const b0 = win.getBounds();
  // 실제 수정(desktopWidgetDpiRestore)이 계산하는 값과 같다:
  //   x,y = 도착 위치를 DIP로 환산 / width,height = 드래그 시작 시점의 DIP 크기
  const restore = { x: b0.x, y: b0.y, width: start.b.width, height: start.b.height };
  win.setBounds(restore);
  await new Promise((r) => setTimeout(r, 1200));
  const fixed = await renderInfo();
  console.log(
    `  setBounds(${restore.width}x${restore.height} DIP) → innerSize=${fixed.iw}x${fixed.ih} dpr=${fixed.dpr} ` +
      `실제 창=${JSON.stringify(win32.getWindowRect())}`,
  );
  const shot2 = await win.webContents.capturePage();
  console.log(
    `  [실제로 그려진 영역] capturePage=${shot2.getSize().width}x${shot2.getSize().height}`,
  );

  const end = snap(win, '② 100% 모니터 도착 후');
  const cached2 = manager.getCachedPhysicalBounds();
  console.log(
    `   manager cachedPhysicalBounds=(${cached2?.x},${cached2?.y},${cached2?.width}x${cached2?.height})`,
  );
  console.log('');
  console.log('=== 판정 ===');
  console.log(`  DIP 크기 ${start.b.width}x${start.b.height} → ${end.b.width}x${end.b.height}`);
  console.log(
    `  물리 크기 ${start.phys.width}x${start.phys.height} → ${end.phys.width}x${end.phys.height}`,
  );
  console.log(`  Chromium이 인식한 배율 ${start.d.scaleFactor} → ${end.d.scaleFactor}`);
  console.log(
    `  보조 모니터(${Math.round(secondary.bounds.width)}x${Math.round(secondary.bounds.height)} 물리)에 대해 ` +
      `위젯이 차지하는 비율 = ${((end.phys.width / secondary.bounds.width) * 100).toFixed(0)}% x ${((end.phys.height / secondary.bounds.height) * 100).toFixed(0)}%`,
  );

  manager.disable();
  await new Promise((r) => setTimeout(r, 300));
  win.destroy();
  app.quit();
});

app.on('window-all-closed', () => {});
