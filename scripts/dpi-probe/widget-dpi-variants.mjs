/**
 * 창 옵션별 크로스-모니터 DPI 거동 비교 (2026-08-18 듀얼 모니터 신고 3차)
 *
 * 1차 프로브(widget-dpi-probe.mjs)에서 확인된 두 가지를 옵션별로 갈라 본다:
 *   ① 경계 통과 시 RESIZE — DIP 크기 유지, 물리 크기가 배율비만큼 커짐
 *   ② 크기 래칫 — 175% 모니터 위에서 위치만 바꿔도 DIP 폭이 1~2씩 계속 커짐 (되돌아오지 않음)
 *
 * 어떤 옵션 조합에서 ②가 사라지는지 찾으면 그게 곧 수정 후보다.
 * 실행: npx electron scripts/dpi-probe/widget-dpi-variants.mjs
 */
import { app, BrowserWindow, screen } from 'electron';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VARIANTS = [
  {
    name: 'widget 현행 (transparent+thickFrame:false+resizable:false)',
    transparent: true,
    thickFrame: false,
    resizable: false,
  },
  { name: 'thickFrame:true 만 바꿈', transparent: true, thickFrame: true, resizable: false },
  { name: 'resizable:true 만 바꿈', transparent: true, thickFrame: false, resizable: true },
  { name: 'transparent:false 만 바꿈', transparent: false, thickFrame: false, resizable: false },
  {
    name: '기본 frameless (transparent:false+thickFrame:true+resizable:true)',
    transparent: false,
    thickFrame: true,
    resizable: true,
  },
];

async function runVariant(v, primary, secondary) {
  const startX = secondary.workArea.x + 40;
  const y = secondary.workArea.y + 40;
  const win = new BrowserWindow({
    x: startX,
    y,
    width: 700,
    height: 520,
    minWidth: 640,
    minHeight: 480,
    frame: false,
    transparent: v.transparent,
    thickFrame: v.thickFrame,
    alwaysOnTop: false,
    resizable: v.resizable,
    skipTaskbar: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadURL('data:text/html,<body style="margin:0;background:#223"></body>');

  let resizeCount = 0;
  let minDipW = Infinity;
  win.on('resize', () => {
    resizeCount += 1;
    const b = win.getBounds();
    if (b.width < minDipW) minDipW = b.width;
  });

  await new Promise((r) => win.once('ready-to-show', r));
  win.showInactive();
  await sleep(400);

  const before = win.getBounds();
  const endX = secondary.bounds.x - 760; // 주 모니터 안쪽까지
  const steps = 8;
  // 왕복 2회 — 래칫이면 왕복할수록 누적된다.
  for (let round = 0; round < 2; round += 1) {
    for (let i = 1; i <= steps; i += 1) {
      win.setPosition(Math.round(before.x + ((endX - before.x) * i) / steps), y);
      await sleep(140);
    }
    for (let i = steps - 1; i >= 0; i -= 1) {
      win.setPosition(Math.round(before.x + ((endX - before.x) * i) / steps), y);
      await sleep(140);
    }
  }
  await sleep(300);
  const after = win.getBounds();
  const afterPhys = screen.dipToScreenRect(win, after);
  win.destroy();
  await sleep(200);

  console.log(
    `\n■ ${v.name}\n` +
      `   시작 dip=${before.width}x${before.height} → 왕복 2회 뒤 dip=${after.width}x${after.height} ` +
      `(폭 증가 ${after.width - before.width})\n` +
      `   최종 physical=${afterPhys.width}x${afterPhys.height}  resize이벤트=${resizeCount}회  ` +
      `경계통과 순간 최소 DIP폭=${minDipW === Infinity ? 'n/a' : minDipW} (minWidth=640 위반 ${minDipW < 640 ? '예' : '아니오'})`,
  );
  return { name: v.name, drift: after.width - before.width, resizeCount, minDipW };
}

app.whenReady().then(async () => {
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
  const results = [];
  for (const v of VARIANTS) results.push(await runVariant(v, primary, secondary));

  console.log('\n=== 요약 (폭 누적 증가가 0이면 래칫 없음) ===');
  for (const r of results) {
    console.log(
      `  drift=${String(r.drift).padStart(4)}  resize=${String(r.resizeCount).padStart(3)}  최소DIP폭=${r.minDipW}  ${r.name}`,
    );
  }
  app.quit();
});

// 창을 하나씩 만들고 부수며 도는 구조라 window-all-closed로 quit하면 첫 변형에서 앱이 죽는다.
app.on('window-all-closed', () => {});
