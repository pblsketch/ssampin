/**
 * 위젯 창 크기의 "의도값"을 단일 진실 원천으로 유지한다.
 *
 * ## 왜 필요한가 (2026-08-19 실측)
 *
 * 소수 배율(175%) 화면에서 `BrowserWindow.getBounds()` 는 `setBounds()` 의 역함수가 아니다.
 * 요청한 크기를 그대로 다시 읽으면 1px 커져 있고, 그 값을 다시 지정하면 또 1px 커진다:
 *
 *   요구 1646x981 -> 1647x982 -> 1648x983 -> 1649x984 -> ... (멈추지 않음)
 *   요구  700x500 ->  701x500 ->  702x500 -> ...            (폭만 계속)
 *
 * 100% 배율 모니터에서는 오차가 0이다. 메시지 루프 대기(150ms)·`resizable`·`transparent`·
 * `thickFrame` 과 모두 무관하다 — 넷 다 바꿔 가며 재봤고 결과가 완전히 동일했다.
 *
 * 그래서 **"현재 크기를 재서 → 고쳐서 → 다시 지정하는" 코드는 부를 때마다 위젯을 키운다.**
 * 실측에서 드래그 한 번에 +4 DIP 씩 자랐고(한 번의 드래그가 이런 경로를 여러 개 지난다),
 * 커진 값이 `widget-bounds.json` 에 저장돼 재시작 후에도 이어졌다. 결국 위젯 오른쪽이
 * 화면 밖으로 밀려났다.
 *
 * ## 해결
 *
 * 잰 값을 믿지 않는다. 우리가 **요청한** 크기를 기억해 두고, 잰 값이 그것과 잡음 범위
 * (±`WIDGET_MEASUREMENT_NOISE`) 안이면 요청값을 돌려준다. 범위를 벗어나면 사용자가 진짜로
 * 크기를 바꾼 것이므로 의도를 갱신한다.
 *
 * ★위치(x·y)는 보정하지 않는다. 드리프트가 관측된 것은 크기뿐이고, 위치는 네이티브
 *   드래그가 물리 좌표로 직접 옮기므로 잰 값이 진실이다.
 */

export interface WidgetRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface WidgetSize {
  readonly width: number;
  readonly height: number;
}

/**
 * `BrowserWindow` 중 이 모듈이 쓰는 부분만. 테스트에서 가짜 창을 물릴 수 있도록 좁게 잡는다.
 * 실제 `BrowserWindow` 는 이 모양을 그대로 만족한다.
 */
export interface WidgetBoundsWindow {
  isDestroyed(): boolean;
  getBounds(): WidgetRect;
  setBounds(bounds: WidgetRect): void;
}

/**
 * 잰 값과 의도값의 차이를 "측정 잡음"으로 볼 한계(DIP).
 *
 * 실측 드리프트는 한 왕복당 1px 이다. 2 로 두면 왕복 한 번의 오차를 확실히 흡수하면서도,
 * 사용자가 손잡이로 3px 이상 줄이는 실제 조작은 의도 변경으로 인식한다.
 */
export const WIDGET_MEASUREMENT_NOISE = 2;

/**
 * 잰 크기를 의도값과 대조해 "진짜 크기"를 정한다 (순수 함수).
 *
 * - 의도값이 없으면 잰 값이 곧 의도다 (창을 막 만든 직후 등).
 * - 잰 값이 의도와 잡음 범위 안이면 **의도값**을 돌려준다 — 이게 래칫을 끊는 지점이다.
 * - 한 축이라도 범위를 벗어나면 사용자가 실제로 크기를 바꾼 것이므로 잰 값이 새 의도다.
 *
 * ★축을 따로 판정하지 않고 "한 축이라도 벗어나면 통째로 갱신"하는 이유: 손잡이 하나를 끌면
 *   한 축만 변한다. 축별로 섞으면 폭은 새 값, 높이는 옛 값인 잡종이 만들어진다.
 */
export function reconcileMeasuredSize(
  measured: WidgetSize,
  intended: WidgetSize | null,
  noise: number = WIDGET_MEASUREMENT_NOISE,
): WidgetSize {
  if (intended === null) return { width: measured.width, height: measured.height };

  const widthDrift = Math.abs(measured.width - intended.width);
  const heightDrift = Math.abs(measured.height - intended.height);
  if (widthDrift <= noise && heightDrift <= noise) {
    return { width: intended.width, height: intended.height };
  }
  return { width: measured.width, height: measured.height };
}

let intendedSize: WidgetSize | null = null;

/** 위젯 창이 새로 만들어졌거나 사라졌을 때 — 다음 측정이 곧 의도가 된다. */
export function resetWidgetSizeIntent(): void {
  intendedSize = null;
}

/** 현재 기억하고 있는 의도 크기 (없으면 null). 진단·테스트용. */
export function readWidgetSizeIntent(): WidgetSize | null {
  return intendedSize === null ? null : { ...intendedSize };
}

/** 의도 크기를 직접 지정한다 — 창을 만들 때처럼 setBounds 를 거치지 않는 경로용. */
export function rememberWidgetSizeIntent(size: WidgetSize): void {
  intendedSize = { width: size.width, height: size.height };
}

/**
 * 위젯 창의 현재 영역을 읽는다. **크기는 의도값으로 보정해서 돌려준다.**
 *
 * 보정 판단 결과는 그대로 기억에 반영된다 — 사용자가 실제로 크기를 바꿨으면 그게 새 의도다.
 * 창이 없으면 null.
 */
export function readWidgetWindowBounds(win: WidgetBoundsWindow | null): WidgetRect | null {
  if (!win || win.isDestroyed()) return null;

  const measured = win.getBounds();
  const size = reconcileMeasuredSize(measured, intendedSize);
  intendedSize = { width: size.width, height: size.height };

  return { x: measured.x, y: measured.y, width: size.width, height: size.height };
}

/**
 * 위젯 창 영역을 지정하고, 그 크기를 의도로 기록한다.
 *
 * ★위젯 창 크기를 바꾸는 곳은 전부 이 함수를 거쳐야 한다. `setBounds` 를 직접 부르면
 *   그 크기가 의도로 기록되지 않아, 다음 측정에서 "사용자가 크기를 바꿨다"로 오인되고
 *   래칫이 되살아난다. `main.helpers.meta.test.ts` 가 이를 정적으로 강제한다.
 */
export function applyWidgetWindowBounds(win: WidgetBoundsWindow | null, bounds: WidgetRect): void {
  if (!win || win.isDestroyed()) return;

  win.setBounds(bounds);
  intendedSize = { width: bounds.width, height: bounds.height };
}
