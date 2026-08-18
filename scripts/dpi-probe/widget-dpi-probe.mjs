/**
 * 위젯 크로스-모니터 DPI 계측 프로브 (2026-08-18 듀얼 모니터 신고)
 *
 * 목적 — "일반 위젯 모드에서 배율이 다른 모니터 경계를 넘으면 창이 다시 재어지는가?"
 * 를 사람 손 없이 확정한다. 실제 앱을 띄우지 않고, 위젯 창과 **같은 옵션**의 빈 창을
 * 만들어 프로그램으로 경계를 가로질러 옮기며 DIP/물리 크기를 매 단계 기록한다.
 *
 * 판독 —
 *   · DIP 크기 유지 + 물리 크기 변함  → Chromium이 DPI에 맞춰 창을 다시 잰다(가설 2 성립)
 *   · DIP 크기 변함 + 물리 크기 유지  → 물리 크기 고정(바탕화면 모드와 같은 성질)
 *   · 둘 다 유지                      → 경계 통과에 아무 일도 없다
 *
 * 실행: npx electron scripts/dpi-probe/widget-dpi-probe.mjs
 */
import { app, BrowserWindow, screen } from 'electron';

const lines = [];
function log(msg) {
  lines.push(msg);
  console.log(msg);
}

function describe(win, tag) {
  const b = win.getBounds();
  const phys = screen.dipToScreenRect(win, b);
  const d = screen.getDisplayMatching(b);
  log(
    `${tag.padEnd(22)} dip=(${b.x},${b.y},${b.width}x${b.height}) ` +
      `physical=(${phys.x},${phys.y},${phys.width}x${phys.height}) ` +
      `display=${d.id} scale=${d.scaleFactor}`,
  );
  return { b, phys, d };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const displays = screen.getAllDisplays();
  log('=== displays ===');
  for (const d of displays) {
    log(
      `id=${d.id} scale=${d.scaleFactor} bounds(dip)=(${d.bounds.x},${d.bounds.y},${d.bounds.width}x${d.bounds.height}) ` +
        `size(px)=${Math.round(d.bounds.width * d.scaleFactor)}x${Math.round(d.bounds.height * d.scaleFactor)} primary=${d.id === screen.getPrimaryDisplay().id}`,
    );
  }

  const primary = screen.getPrimaryDisplay();
  const secondary = displays.find((d) => d.id !== primary.id);
  if (!secondary) {
    log('보조 모니터 없음 — 이 프로브는 듀얼 모니터에서만 의미가 있다.');
    app.quit();
    return;
  }

  // 위젯 창과 동일한 옵션 (electron/main.ts createWidgetWindow)
  const win = new BrowserWindow({
    x: secondary.workArea.x + 40,
    y: secondary.workArea.y + 40,
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
  win.loadURL(
    'data:text/html,<body style="margin:0;background:rgba(30,30,40,0.9);color:#fff;font:14px sans-serif"><div style="padding:12px">DPI probe</div></body>',
  );

  win.on('resize', () => describe(win, '  !! RESIZE event'));
  win.on('move', () => {});

  await new Promise((r) => win.once('ready-to-show', r));
  win.showInactive();
  await sleep(500);

  log('');
  log('=== 보조 모니터에서 출발 ===');
  describe(win, 'start');

  // 보조 → 주 모니터 방향으로 DIP 좌표를 단계적으로 이동.
  // 경계는 secondary.bounds.x (DIP). 창 폭 700 DIP가 완전히 넘어갈 때까지.
  const startX = win.getBounds().x;
  const y = win.getBounds().y;
  const boundaryX = secondary.bounds.x;
  const endX = boundaryX - 760; // 완전히 주 모니터 쪽으로
  const steps = 12;
  log('');
  log(`=== 경계(x=${boundaryX} DIP)를 가로질러 이동: ${startX} → ${endX} (${steps}단계) ===`);
  for (let i = 1; i <= steps; i += 1) {
    const nx = Math.round(startX + ((endX - startX) * i) / steps);
    win.setPosition(nx, y);
    await sleep(220);
    describe(win, `step ${String(i).padStart(2)} setPos x=${nx}`);
  }

  log('');
  log('=== 반대 방향 (주 → 보조) ===');
  for (let i = steps - 1; i >= 0; i -= 1) {
    const nx = Math.round(startX + ((endX - startX) * i) / steps);
    win.setPosition(nx, y);
    await sleep(220);
    describe(win, `back ${String(i).padStart(2)} setPos x=${nx}`);
  }

  log('');
  log('=== setBounds(폭·높이 동시 지정)로도 같은지 ===');
  win.setBounds({ x: endX, y, width: 700, height: 520 });
  await sleep(400);
  describe(win, 'setBounds primary');
  win.setBounds({ x: startX, y, width: 700, height: 520 });
  await sleep(400);
  describe(win, 'setBounds secondary');

  await sleep(300);
  win.destroy();
  app.quit();
});

app.on('window-all-closed', () => app.quit());
