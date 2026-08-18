import type { CategoryItem } from '@domain/entities/SchoolEvent';
import { DEFAULT_CATEGORIES } from '@domain/entities/SchoolEvent';

export interface CategoryColors {
  readonly dot: string;
  readonly border: string;
  readonly text: string;
  readonly bg: string;
  readonly bar: string;
  /**
   * 달력 칩용 **옅은** 배경 (2026-08-18).
   *
   * `bar`(단색 80% 채움 + 흰 글자)로 칩을 그리면 한 달치가 색 벽이 된다. 특히 구글에서
   * 온 카테고리는 전부 파랑이라 화면이 통째로 파래졌다. 옅게 깔고 글자는 본문색을 쓰면
   * 일정 **제목이 먼저 읽히고** 색은 분류만 거든다 — "장식보다 데이터" 원칙에 맞는다.
   *
   * Tailwind 기본 색이라 `/15` 투명도 수식이 정상 동작한다(sp-* 토큰과 달리).
   */
  readonly chip: string;
}

const COLOR_MAP: Record<string, CategoryColors> = {
  blue: {
    dot: 'bg-blue-500',
    border: 'border-blue-500',
    text: 'text-blue-400',
    bg: 'bg-blue-900/50',
    bar: 'bg-blue-500/80',
    chip: 'bg-blue-500/15',
  },
  green: {
    dot: 'bg-green-500',
    border: 'border-green-500',
    text: 'text-green-400',
    bg: 'bg-green-900/50',
    bar: 'bg-green-500/80',
    chip: 'bg-green-500/15',
  },
  yellow: {
    dot: 'bg-yellow-500',
    border: 'border-yellow-500',
    text: 'text-yellow-500',
    bg: 'bg-yellow-900/50',
    bar: 'bg-yellow-500/80',
    chip: 'bg-yellow-500/15',
  },
  purple: {
    dot: 'bg-purple-500',
    border: 'border-purple-500',
    text: 'text-purple-400',
    bg: 'bg-purple-900/50',
    bar: 'bg-purple-500/80',
    chip: 'bg-purple-500/15',
  },
  red: {
    dot: 'bg-red-500',
    border: 'border-red-500',
    text: 'text-red-400',
    bg: 'bg-red-900/50',
    bar: 'bg-red-500/80',
    chip: 'bg-red-500/15',
  },
  pink: {
    dot: 'bg-pink-500',
    border: 'border-pink-500',
    text: 'text-pink-400',
    bg: 'bg-pink-900/50',
    bar: 'bg-pink-500/80',
    chip: 'bg-pink-500/15',
  },
  indigo: {
    dot: 'bg-indigo-500',
    border: 'border-indigo-500',
    text: 'text-indigo-400',
    bg: 'bg-indigo-900/50',
    bar: 'bg-indigo-500/80',
    chip: 'bg-indigo-500/15',
  },
  teal: {
    dot: 'bg-teal-500',
    border: 'border-teal-500',
    text: 'text-teal-400',
    bg: 'bg-teal-900/50',
    bar: 'bg-teal-500/80',
    chip: 'bg-teal-500/15',
  },
  gray: {
    dot: 'bg-slate-400',
    border: 'border-slate-400',
    text: 'text-slate-400',
    bg: 'bg-slate-700',
    bar: 'bg-slate-400/80',
    chip: 'bg-slate-400/15',
  },
};

const FALLBACK_COLORS: CategoryColors = {
  dot: 'bg-slate-400',
  border: 'border-slate-400',
  text: 'text-slate-400',
  bg: 'bg-slate-700',
  bar: 'bg-slate-400/80',
  chip: 'bg-slate-400/15',
};

/**
 * 구글 캘린더 ID 패턴 감지
 * 예: "cba4qi5i0qup1r4f01qkulh778@group.calendar.google.com"
 *     "xxxx@group.calendar"
 *     "someone@gmail.com"
 */
export function isGoogleCalendarId(id: string): boolean {
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
    DEFAULT_CATEGORIES.find((c) => c.id === categoryId) ?? {
      id: categoryId,
      name: isGoogleCalendarId(categoryId) ? '구글 캘린더' : categoryId,
      color: isGoogleCalendarId(categoryId) ? 'blue' : 'gray',
    }
  );
}

/** 이름이 이메일 주소 그 자체인가. */
function looksLikeEmail(name: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(name.trim());
}

/**
 * 화면에 보여 줄 짧은 이름.
 *
 * 왜 필요한가 (2026-08-18) — 구글 캘린더를 연동하면 그 캘린더가 자동으로 카테고리가 되는데,
 * 이름을 구글이 준 값(`summary`)을 그대로 쓴다(`SyncFromGoogle.ts`). 그런데 **구글 기본
 * 캘린더의 이름은 곧 계정 이메일**이라, 일정 화면 곳곳에 `someone@gmail.com` 이 그대로
 * 노출됐다. 보기 싫을 뿐 아니라 개인정보가 화면에 상시 떠 있는 문제이기도 하다.
 *
 * **저장값(`name`)은 건드리지 않는다.** 설정 → 캘린더에서는 어느 계정인지 확인해야 하므로
 * 전체 주소가 계속 보여야 하고, 저장값을 바꾸면 마이그레이션도 필요해진다. 표시 계층에서만
 * 줄인다.
 *
 * 사용자가 카테고리 관리에서 이름을 직접 바꿨다면(이메일 형태가 아니게 되면) 그 이름이
 * 그대로 이긴다 — 자동 축약은 어디까지나 기본값 역할이다.
 *
 * @param googleAccountCount 구글에서 온 카테고리 개수. 1개뿐이면 굳이 아이디를 보여 줄
 *   이유가 없어 `내 구글 캘린더` 로 부른다. 여러 개면 구분해야 하므로 아이디를 남긴다.
 */
export function getCategoryDisplayName(info: CategoryItem, googleAccountCount = 0): string {
  const name = info.name.trim();
  if (!looksLikeEmail(name)) return name;
  if (googleAccountCount <= 1) return '내 구글 캘린더';

  const localPart = name.slice(0, name.indexOf('@'));
  return localPart.length > 12 ? `${localPart.slice(0, 12)}…` : localPart;
}

/** 카테고리 목록에서 "구글이 만든 것"의 개수. `getCategoryDisplayName` 의 두 번째 인자용. */
export function countGoogleCategories(categories: readonly CategoryItem[]): number {
  return categories.filter((c) => isGoogleCalendarId(c.id)).length;
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
