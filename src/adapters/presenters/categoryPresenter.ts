import type { CategoryItem } from '@domain/entities/SchoolEvent';
import { DEFAULT_CATEGORIES } from '@domain/entities/SchoolEvent';

export interface CategoryColors {
  readonly dot: string;
  readonly border: string;
  readonly text: string;
  readonly bg: string;
}

const COLOR_MAP: Record<string, CategoryColors> = {
  blue: { dot: 'bg-blue-500', border: 'border-blue-500', text: 'text-blue-400', bg: 'bg-blue-900/50' },
  green: { dot: 'bg-green-500', border: 'border-green-500', text: 'text-green-400', bg: 'bg-green-900/50' },
  yellow: { dot: 'bg-yellow-500', border: 'border-yellow-500', text: 'text-yellow-500', bg: 'bg-yellow-900/50' },
  purple: { dot: 'bg-purple-500', border: 'border-purple-500', text: 'text-purple-400', bg: 'bg-purple-900/50' },
  red: { dot: 'bg-red-500', border: 'border-red-500', text: 'text-red-400', bg: 'bg-red-900/50' },
  pink: { dot: 'bg-pink-500', border: 'border-pink-500', text: 'text-pink-400', bg: 'bg-pink-900/50' },
  indigo: { dot: 'bg-indigo-500', border: 'border-indigo-500', text: 'text-indigo-400', bg: 'bg-indigo-900/50' },
  teal: { dot: 'bg-teal-500', border: 'border-teal-500', text: 'text-teal-400', bg: 'bg-teal-900/50' },
  gray: { dot: 'bg-slate-400', border: 'border-slate-400', text: 'text-slate-400', bg: 'bg-slate-700' },
};

const FALLBACK_COLORS: CategoryColors = {
  dot: 'bg-slate-400',
  border: 'border-slate-400',
  text: 'text-slate-400',
  bg: 'bg-slate-700',
};

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
    { id: categoryId, name: categoryId, color: 'gray' }
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
