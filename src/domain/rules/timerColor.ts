/**
 * 타이머 원의 '평소' 색 판정(ADR-139, spec 2-3).
 *
 * 경고색(sp-warning)·위험색(sp-error)은 테마의 밝기(라이트/다크)에 따라서만 바뀌고,
 * 테마 색(sp-accent)은 13개 테마마다 다르다. 테마 색이 주황 계열이거나 무채색이면
 * 평소 원과 경고 원이 구별되지 않으므로, 그때는 평소 색을 sp-info 로 바꾼다.
 *
 * 규칙(설계 docs/02-design/features/timer-uiux.design.md 3-3):
 * - 채도 12% 미만(흑백 테마) → 바꾼다.
 * - 테마 색의 색상각과 그 밝기의 경고색 색상각 사이가 35° 미만 → 바꾼다.
 */

/** 라이트 배경의 경고색(#c2410c) 색상각. */
const WARNING_HUE_LIGHT = 15;
/** 다크 배경의 경고색(#fbbf24) 색상각. */
const WARNING_HUE_DARK = 43;
const MIN_SATURATION = 0.12;
const MIN_HUE_DISTANCE = 35;

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let body = m[1]!;
  if (body.length === 3)
    body = body
      .split('')
      .map((c) => c + c)
      .join('');
  const n = parseInt(body, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** HSL 의 색상각(0~360)과 채도(0~1). */
export function hexHueSaturation(hex: string): { hue: number; saturation: number } | null {
  const rgb = parseHex(hex);
  if (rgb === null) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { hue: 0, saturation: 0 };
  const saturation = d / (1 - Math.abs(2 * l - 1));
  let hue: number;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { hue, saturation };
}

function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * 이 테마 색을 타이머 평소 색으로 쓰면 경고색과 헷갈리는가.
 * true 면 평소 색을 sp-info 로 바꾼다. 색을 읽을 수 없으면 false(테마 색 그대로).
 */
export function needsTimerRingOverride(accentHex: string, lightBackground: boolean): boolean {
  const hs = hexHueSaturation(accentHex);
  if (hs === null) return false;
  if (hs.saturation < MIN_SATURATION) return true;
  const warningHue = lightBackground ? WARNING_HUE_LIGHT : WARNING_HUE_DARK;
  return hueDistance(hs.hue, warningHue) < MIN_HUE_DISTANCE;
}
