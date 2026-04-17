export type MemoFontSize = 'sm' | 'base' | 'lg' | 'xl';

export const MEMO_FONT_SIZES: readonly MemoFontSize[] = ['sm', 'base', 'lg', 'xl'] as const;

export const DEFAULT_MEMO_FONT_SIZE: MemoFontSize = 'base';

/** Tailwind 클래스 매핑 */
export const MEMO_FONT_SIZE_CLASS: Record<MemoFontSize, string> = {
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
};

/** 한국어 라벨 (UI 표시용) */
export const MEMO_FONT_SIZE_LABEL: Record<MemoFontSize, string> = {
  sm: '작게',
  base: '기본',
  lg: '크게',
  xl: '아주 크게',
};

/** 현재 크기에서 한 단계 증가/감소 (경계값 clamp) */
export function clampFontSizeStep(current: MemoFontSize, delta: 1 | -1): MemoFontSize {
  const idx = MEMO_FONT_SIZES.indexOf(current);
  const nextIdx = Math.max(0, Math.min(MEMO_FONT_SIZES.length - 1, idx + delta));
  return MEMO_FONT_SIZES[nextIdx]!;
}
