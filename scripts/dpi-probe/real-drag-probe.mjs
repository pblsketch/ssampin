/**
 * 실제 드래그 재현 프로브 (2026-08-18 듀얼 모니터 신고 4차)
 *
 * 신고 그대로를 기계로 재현한다: 위젯과 같은 옵션의 창을 보조 모니터(100%)에 띄우고,
 * **헤더 우측 상단**을 잡아 주모니터(175%)로 끌면서 매 단계 창의 실제 위치·크기와
 * 커서 위치를 밖에서 관찰한다.
 *
 * 판정 —
 *   증상① "좌측 상단을 잡은 것처럼" → 잡은 지점 비율(커서가 창 폭의 몇 %에 있는가)이
 *          경계 통과 후 크게 줄어들면 확정.
 *   증상② "절반만 가고 멈춤"        → 커서는 움직이는데 창 left가 따라오지 않으면 확정.
 *
 * 실행: npx electron scripts/dpi-probe/real-drag-probe.mjs
 */
import { app, BrowserWindow, screen } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HTML = `data:text/html,<body style="margin:0;background:rgb(34,34,51);color:%23fff;font:13px sans-serif">
<div style="height:40px;-webkit-app-region:drag;background:rgb(55,55,80);padding:8px 12px">HEADER (drag)</div>
<div style="padding:12px">real drag probe</div></body>`;

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

  const win = new BrowserWindow({
    x: secondary.workArea.x + 60,
    y: secondary.workArea.y + 60,
    width: 700,
    height: 520,
    minWidth: 640,
    minHeight: 480,
    frame: false,
    transparent: true,
    thickFrame: false,
    alwaysOnTop: true, // 프로브 전용 — 주입한 클릭이 반드시 이 창에 닿게 한다
    resizable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadURL(HTML);
  await new Promise((r) => win.once('ready-to-show', r));
  win.showInactive();
  await new Promise((r) => setTimeout(r, 700));

  const hbuf = win.getNativeWindowHandle();
  const hwnd = hbuf.length === 8 ? hbuf.readBigUInt64LE(0) : BigInt(hbuf.readUInt32LE(0));

  const b = win.getBounds();
  const phys = screen.dipToScreenRect(win, b);
  // 헤더 우측 상단을 잡는다 (신고와 동일). 오른쪽 끝에서 30px 안쪽, 위에서 20px 아래.
  const grabX = phys.x + phys.width - 30;
  const grabY = phys.y + 20;
  // 주모니터 안쪽까지 (물리 좌표). 주모니터가 왼쪽이면 왼쪽으로 크게 이동.
  const endX = Math.round(primary.bounds.x * primary.scaleFactor + 400);

  console.log(
    `hwnd=0x${hwnd.toString(16)} physical=(${phys.x},${phys.y},${phys.width}x${phys.height})`,
  );
  console.log(`grab=(${grabX},${grabY}) → endX=${endX}  (커서 자동 이동 ~5초, 끝나면 원위치)`);

  const child = spawn(
    process.execPath,
    [
      path.join(__dirname, 'drag-sampler.mjs'),
      hwnd.toString(),
      String(grabX),
      String(grabY),
      String(endX),
    ],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } },
  );

  let out = '';
  child.stdout.on('data', (d) => {
    out += d.toString();
  });
  child.stderr.on('data', (d) => process.stderr.write(d));
  await new Promise((r) => child.on('close', r));

  let data;
  try {
    data = JSON.parse(out.trim().split('\n').pop());
  } catch {
    console.log('샘플러 출력 파싱 실패:\n' + out);
    win.destroy();
    app.quit();
    return;
  }

  const { before, after, samples } = data;
  console.log(
    `\n잡기 직전 창 physical=(${before.left},${before.top},${before.width}x${before.height})`,
  );
  const grabRatio0 = (data.grab.x - before.left) / before.width;
  console.log(`잡은 지점 = 창 폭의 ${(grabRatio0 * 100).toFixed(1)}% 지점 (우측 상단)\n`);

  console.log(' step  커서x   창left   창폭   커서-창left   폭대비%   비고');
  let prevLeft = before.left;
  let prevW = before.width;
  let stuckRun = 0;
  let maxStuck = 0;
  for (const s of samples) {
    const pct = ((s.off / s.w) * 100).toFixed(1);
    const notes = [];
    if (s.w !== prevW) notes.push(`폭변경 ${prevW}→${s.w}`);
    if (s.left === prevLeft) {
      stuckRun += 1;
      maxStuck = Math.max(maxStuck, stuckRun);
    } else stuckRun = 0;
    if (s.i % 2 === 1 || notes.length > 0) {
      console.log(
        `  ${String(s.i).padStart(3)} ${String(s.cx).padStart(6)} ${String(s.left).padStart(8)} ${String(s.w).padStart(6)} ` +
          `${String(s.off).padStart(12)} ${pct.padStart(8)}   ${notes.join(' ')}`,
      );
    }
    prevLeft = s.left;
    prevW = s.width ?? s.w;
  }

  const last = samples[samples.length - 1];
  const cursorTravel = last.cx - data.grab.x;
  const windowTravel = last.left - before.left;
  console.log(`\n=== 판정 ===`);
  console.log(
    `커서 이동량=${cursorTravel}  창 이동량=${windowTravel}  ratio=${(windowTravel / cursorTravel).toFixed(3)}`,
  );
  console.log(
    `잡은 지점 비율: 시작 ${(grabRatio0 * 100).toFixed(1)}% → 끝 ${((last.off / last.w) * 100).toFixed(1)}%`,
  );
  console.log(`창 폭: ${before.width} → ${last.w} (놓은 뒤 ${after ? after.width : 'n/a'})`);
  console.log(`창이 커서를 못 따라간 연속 구간 최대 ${maxStuck}단계`);

  win.destroy();
  app.quit();
});

app.on('window-all-closed', () => {});
