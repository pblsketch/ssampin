export type ChalkboardMode = 'select' | 'pen' | 'text' | 'eraser';

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
