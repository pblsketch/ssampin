export type ChalkboardMode = 'select' | 'pen' | 'text' | 'eraser' | 'pixelEraser';

export interface ChalkColor {
  name: string;
  value: string;
}

export const CHALK_COLORS: ChalkColor[] = [
  { name: '흰색', value: '#FFFFFF' },
  { name: '노랑', value: '#FFEB3B' },
  { name: '분홍', value: '#FF80AB' },
  { name: '하늘', value: '#80D8FF' },
  { name: '초록', value: '#B9F6CA' },
  { name: '주황', value: '#FFD180' },
];

export interface BoardBackground {
  name: string;
  value: string;
}

export const BOARD_BACKGROUNDS: BoardBackground[] = [
  { name: '초록', value: '#2d5a27' },
  { name: '검정', value: '#1a1a1a' },
  { name: '남색', value: '#1a2744' },
  { name: '갈색', value: '#3d2b1f' },
  { name: '회색', value: '#2d2d2d' },
];

/**
 * 칠판 배경 오버레이 모드. 이름은 하위 호환을 위해 GridMode로 유지하나 의미는 "배경 오버레이".
 * - canvas 경로: Fabric Line 객체로 렌더 (none/grid/lines/staff)
 * - cssImage 경로: 컨테이너 div의 CSS background-image로 렌더 (koreaMap/worldMap)
 *   → Fabric 캔버스 밖이라 pixelEraser의 destination-out 영향을 받지 않음.
 */
export type GridMode =
  | 'none'
  | 'grid'
  | 'lines'
  | 'staff'
  | 'koreaMap'
  | 'worldMap';

export const GRID_MODE_ORDER: readonly GridMode[] = [
  'none',
  'grid',
  'lines',
  'staff',
  'koreaMap',
  'worldMap',
] as const;

export const GRID_LABELS: Record<GridMode, string> = {
  none: '없음',
  grid: '모눈',
  lines: '줄선',
  staff: '오선지',
  koreaMap: '한반도',
  worldMap: '세계',
};

export const GRID_DESCRIPTIONS: Record<GridMode, string> = {
  none: '배경 없음',
  grid: '수학·도표',
  lines: '필기 줄선',
  staff: '음악·영어',
  koreaMap: '사회·한국사',
  worldMap: '세계사·지리',
};

/** 배경 모드의 렌더 경로 분류 */
export type BackgroundRenderKind = 'canvas' | 'cssImage';

export const BACKGROUND_RENDER_KIND: Record<GridMode, BackgroundRenderKind> = {
  none: 'canvas',
  grid: 'canvas',
  lines: 'canvas',
  staff: 'canvas',
  koreaMap: 'cssImage',
  worldMap: 'cssImage',
};

/** CSS 경로 에셋의 URL. canvas 경로는 null. */
export const BACKGROUND_ASSETS: Record<GridMode, string | null> = {
  none: null,
  grid: null,
  lines: null,
  staff: null,
  koreaMap: '/chalkboard/korea-map.png',
  worldMap: '/chalkboard/world-map.png',
};

/** 팝오버 썸네일용 작은 PNG (지도만). */
export const BACKGROUND_THUMBS: Record<GridMode, string | null> = {
  none: null,
  grid: null,
  lines: null,
  staff: null,
  koreaMap: '/chalkboard/korea-map-thumb.png',
  worldMap: '/chalkboard/world-map-thumb.png',
};

export function isGridMode(value: string): value is GridMode {
  return (GRID_MODE_ORDER as readonly string[]).includes(value);
}

export const PEN_SIZE_MIN = 2;
export const PEN_SIZE_MAX = 80;
export const PEN_SIZE_DEFAULT = 20;

export function clampPenSize(size: number): number {
  if (Number.isNaN(size)) return PEN_SIZE_DEFAULT;
  return Math.min(PEN_SIZE_MAX, Math.max(PEN_SIZE_MIN, Math.round(size)));
}

function stepDown(size: number): number {
  if (size <= 10) return 1;
  if (size <= 30) return 2;
  return 5;
}

function stepUp(size: number): number {
  if (size < 10) return 1;
  if (size < 30) return 2;
  return 5;
}

export function decrementPenSize(size: number): number {
  return clampPenSize(size - stepDown(size));
}

export function incrementPenSize(size: number): number {
  return clampPenSize(size + stepUp(size));
}

export const ERASER_SIZE_MIN = 8;
export const ERASER_SIZE_MAX = 120;
export const ERASER_SIZE_DEFAULT = 40;

export function clampEraserSize(size: number): number {
  if (Number.isNaN(size)) return ERASER_SIZE_DEFAULT;
  return Math.min(ERASER_SIZE_MAX, Math.max(ERASER_SIZE_MIN, Math.round(size)));
}
