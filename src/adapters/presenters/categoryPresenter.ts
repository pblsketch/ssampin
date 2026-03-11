import type { CategoryItem } from '@domain/entities/SchoolEvent';
import { DEFAULT_CATEGORIES } from '@domain/entities/SchoolEvent';

export interface CategoryColors {
  readonly dot: string;
  readonly border: string;
  readonly text: string;
  readonly bg: string;
  readonly bar: string;
}

const COLOR_MAP: Record<string, CategoryColors> = {
  blue: { dot: 'bg-blue-500', border: 'border-blue-500', text: 'text-blue-400', bg: 'bg-blue-900/50', bar: 'bg-blue-500/80' },
  green: { dot: 'bg-green-500', border: 'border-green-500', text: 'text-green-400', bg: 'bg-green-900/50', bar: 'bg-green-500/80' },
  yellow: { dot: 'bg-yellow-500', border: 'border-yellow-500', text: 'text-yellow-500', bg: 'bg-yellow-900/50', bar: 'bg-yellow-500/80' },
  purple: { dot: 'bg-purple-500', border: 'border-purple-500', text: 'text-purple-400', bg: 'bg-purple-900/50', bar: 'bg-purple-500/80' },
  red: { dot: 'bg-red-500', border: 'border-red-500', text: 'text-red-400', bg: 'bg-red-900/50', bar: 'bg-red-500/80' },
  pink: { dot: 'bg-pink-500', border: 'border-pink-500', text: 'text-pink-400', bg: 'bg-pink-900/50', bar: 'bg-pink-500/80' },
  indigo: { dot: 'bg-indigo-500', border: 'border-indigo-500', text: 'text-indigo-400', bg: 'bg-indigo-900/50', bar: 'bg-indigo-500/80' },
  teal: { dot: 'bg-teal-500', border: 'border-teal-500', text: 'text-teal-400', bg: 'bg-teal-900/50', bar: 'bg-teal-500/80' },
  gray: { dot: 'bg-slate-400', border: 'border-slate-400', text: 'text-slate-400', bg: 'bg-slate-700', bar: 'bg-slate-400/80' },
};

const FALLBACK_COLORS: CategoryColors = {
  dot: 'bg-slate-400',
  border: 'border-slate-400',
  text: 'text-slate-400',
  bg: 'bg-slate-700',
  bar: 'bg-slate-400/80',
};

/**
 * 구글 캘린더 ID 패턴 감지
 * 예: "cba4qi5i0qup1r4f01qkulh778@group.calendar.google.com"
 *     "xxxx@group.calendar"
 *     "someone@gmail.com"
 */
function isGoogleCalendarId(id: string): boolean {
  return (
    id.includes('@group.calendar') ||
    id.includes('@gmail.com') ||
    id.includes('calendar.google.com') ||
    (id.includes('@') && id.length > 30)
  );
}

/**
 * 카테고리 ID로 CategoryItem 조회
 */
export function getCategoryInfo(
  categoryId: string,
  categories: readonly CategoryItem[],
): CategoryItem {
  return (
    categories.find((c) => c.id === categoryId) ??
    DEFAULT_CATEGORIES.find((c) => c.id === categoryId) ??
    {
      id: categoryId,
      name: isGoogleCalendarId(categoryId) ? '구글 캘린더' : categoryId,
      color: isGoogleCalendarId(categoryId) ? 'blue' : 'gray',
    }
  );
}

/**
 * 카테고리 컬러 코드 → Tailwind 클래스 조회
 */
export function getCategoryColors(colorKey: string): CategoryColors {
  return COLOR_MAP[colorKey] ?? FALLBACK_COLORS;
}

/**
 * 카테고리 ID에서 바로 컬러 조회
 */
export function getColorsForCategory(
  categoryId: string,
  categories: readonly CategoryItem[],
): CategoryColors {
  const info = getCategoryInfo(categoryId, categories);
  return getCategoryColors(info.color);
}
