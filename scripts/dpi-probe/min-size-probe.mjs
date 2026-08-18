/**
 * `getMinimumSize()`가 무엇을 돌려주는가 — 축소 보정이 무력화된 원인 추적
 * (2026-08-18 듀얼 모니터 신고 후속)
 *
 * ## 왜 이걸 재는가
 *
 * 실기기 로그에서 숫자가 안 맞았다.
 *
 * ```
 * [dpi-refit] before=(890,35,839x985) after=(890,35,839x984) workArea=(1646x981)
 * ```
 *
 * 코드는 `max(minHeight, min(985, 981))`이므로 minHeight가 480이면 결과는 **981**이어야 한다.
 * 그런데 **984**가 나왔다. minHeight가 480이 아니라 984에 가깝다는 뜻이다.
 *
 * 유력한 설명 — 위젯 창은 `resizable: false`로 만들어진다. 크기 조절 불가 창은
 * OS/Chromium이 최소 크기를 **현재 크기**로 보고할 수 있다. 그렇다면
 * `fitWidgetSizeToWorkArea(bounds, workArea, minSize)`의 `minSize`가 사실상 현재 크기라
 * **"화면에 맞게 줄이기"가 원리적으로 불가능**하다. 축소가 한 번도 일어나지 않은 채
 * 1px 차이만 반복해서 다듬고 있었던 것이 된다.
 *
 * ## 무엇을 확인하는가
 *
 *   1. 위젯과 같은 옵션(`resizable: false`, `minWidth/minHeight` 지정) 창의 `getMinimumSize()`
 *   2. `setBounds`로 크기를 바꾼 뒤 `getMinimumSize()`가 따라 변하는가
 *   3. `resizable: true`인 대조군은 어떻게 나오는가
 *   4. 실제로 작업 영역보다 크게 만든 뒤 작업 영역 크기로 줄이는 `setBounds`가 먹히는가
 *
 * 실행: npx electron scripts/dpi-probe/min-size-probe.mjs
 */
import { app, BrowserWindow, screen } from 'electron';

const out = [];
function log(msg) {
  out.push(msg);
  console.log(msg);
}

/** 위젯 창(main.ts createWidgetWindow)과 같은 옵션 — resizable/최소크기만 대조군에서 바꾼다. */
function makeWindow({ resizable }) {
  return new BrowserWindow({
    x: 100,
    y: 100,
    width: 900,
    height: 700,
    minWidth: 640,
    minHeight: 480,
    frame: false,
    transparent: true,
    thickFrame: false,
    alwaysOnTop: false,
    resizable,
    skipTaskbar: true,
    show: false,
  });
}

function report(label, win) {
  const [minW, minH] = win.getMinimumSize();
  const b = win.getBounds();
  log(
    `${label.padEnd(34)} getMinimumSize=(${minW}x${minH})  getBounds=(${b.width}x${b.height})  resizable=${win.isResizable()}`,
  );
  return { minW, minH, b };
}

app.whenReady().then(async () => {
  const displays = screen.getAllDisplays();
  log('=== 모니터 ===');
  for (const d of displays) {
    log(
      `  id=${d.id} scale=${d.scaleFactor} bounds=(${d.bounds.width}x${d.bounds.height}) workArea=(${d.workArea.width}x${d.workArea.height}) primary=${d.id === screen.getPrimaryDisplay().id}`,
    );
  }

  const primary = screen.getPrimaryDisplay();
  const wa = primary.workArea;

  log('');
  log('=== ① 위젯과 같은 옵션 (resizable: false) ===');
  const w = makeWindow({ resizable: false });
  report('생성 직후', w);

  w.setBounds({ x: wa.x + 20, y: wa.y + 20, width: 839, height: 985 });
  report('setBounds 839x985 후', w);

  w.setBounds({ x: wa.x + 20, y: wa.y + 20, width: 700, height: 600 });
  report('setBounds 700x600 후', w);

  log('');
  log('=== ② 대조군 (resizable: true) ===');
  const w2 = makeWindow({ resizable: true });
  report('생성 직후', w2);
  w2.setBounds({ x: wa.x + 20, y: wa.y + 20, width: 839, height: 985 });
  report('setBounds 839x985 후', w2);

  log('');
  log('=== ③ 작업 영역보다 큰 창을 작업 영역 크기로 줄일 수 있는가 (resizable:false) ===');
  const big = { width: wa.width + 400, height: wa.height + 400 };
  w.setBounds({ x: wa.x, y: wa.y, width: big.width, height: big.height });
  const beforeShrink = report(`작업영역+400 (${big.width}x${big.height})`, w);

  w.setBounds({ x: wa.x, y: wa.y, width: wa.width, height: wa.height });
  const afterShrink = report(`작업영역 크기로 축소 시도`, w);

  log('');
  log('=== 판독 ===');
  log(
    `  · resizable:false 창의 최소 크기가 현재 크기를 따라가는가 → ${
      beforeShrink.minH >= big.height - 2 ? '예 (따라간다 — 축소 보정이 무력화된다)' : '아니오'
    }`,
  );
  log(
    `  · 작업 영역 크기로 축소가 실제로 먹혔는가 → ${
      afterShrink.b.height <= wa.height + 2 ? '예' : `아니오 (${afterShrink.b.height} 로 남음)`
    }`,
  );

  w.destroy();
  w2.destroy();
  app.quit();
});
