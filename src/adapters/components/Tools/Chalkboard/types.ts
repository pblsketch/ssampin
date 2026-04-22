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

export type GridMode = 'none' | 'grid' | 'lines';

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
