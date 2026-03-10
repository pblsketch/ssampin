export interface DDayItem {
  readonly id: string;
  readonly title: string;
  readonly targetDate: string;   // "YYYY-MM-DD"
  readonly emoji: string;
  readonly color: DDayColor;
  readonly pinned: boolean;
  readonly createdAt: string;    // ISO 8601
}

export type DDayColor = 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'pink' | 'teal' | 'amber';

export interface DDayData {
  readonly items: readonly DDayItem[];
}

/** D-Day 색상 프리셋 (Tailwind 매핑) */
export const DDAY_COLOR_MAP: Record<DDayColor, { bg: string; text: string; border: string }> = {
  blue:   { bg: 'bg-blue-500/20',    text: 'text-blue-400',    border: 'border-blue-500/30' },
  green:  { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  purple: { bg: 'bg-violet-500/20',  text: 'text-violet-400',  border: 'border-violet-500/30' },
  orange: { bg: 'bg-orange-500/20',  text: 'text-orange-400',  border: 'border-orange-500/30' },
  red:    { bg: 'bg-red-500/20',     text: 'text-red-400',     border: 'border-red-500/30' },
  pink:   { bg: 'bg-pink-500/20',    text: 'text-pink-400',    border: 'border-pink-500/30' },
  teal:   { bg: 'bg-teal-500/20',    text: 'text-teal-400',    border: 'border-teal-500/30' },
  amber:  { bg: 'bg-amber-500/20',   text: 'text-amber-400',   border: 'border-amber-500/30' },
};

/** 이모지 프리셋 (빠른 선택용) */
export const DDAY_EMOJI_PRESETS = ['📌', '📝', '🎒', '✈️', '🎄', '🎉', '📚', '🏃', '🎵', '💼', '🏫', '⭐'] as const;
