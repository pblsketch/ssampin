import type {
  RealtimeBulletinColumn,
  RealtimeBulletinFreeformPosition,
  RealtimeBulletinPost,
} from '@domain/entities/RealtimeBulletin';

export const DEFAULT_REALTIME_BULLETIN_COLUMNS = [
  '생각',
  '질문',
  '정리',
] as const;

export const REALTIME_BULLETIN_MIN_COLUMNS = 2;
export const REALTIME_BULLETIN_MAX_COLUMNS = 6;
export const REALTIME_BULLETIN_MAX_NICKNAME_LENGTH = 20;
export const REALTIME_BULLETIN_MAX_TEXT_LENGTH = 280;

const FREEFORM_COLUMN_COUNT = 3;
const FREEFORM_CARD_WIDTH = 260;
const FREEFORM_CARD_HEIGHT = 180;
const FREEFORM_X_GAP = 32;
const FREEFORM_Y_GAP = 28;
const FREEFORM_START_X = 24;
const FREEFORM_START_Y = 24;

export function buildRealtimeBulletinColumns(
  titles: readonly string[],
): RealtimeBulletinColumn[] {
  const normalized = titles
    .map((title) => title.trim())
    .filter((title, index, arr) => title.length > 0 && arr.indexOf(title) === index)
    .slice(0, REALTIME_BULLETIN_MAX_COLUMNS);

  const safeTitles = normalized.length >= REALTIME_BULLETIN_MIN_COLUMNS
    ? normalized
    : [...DEFAULT_REALTIME_BULLETIN_COLUMNS];

  return safeTitles.map((title, index) => ({
    id: `column-${index + 1}`,
    title,
    order: index,
  }));
}

export function normalizeRealtimeBulletinLink(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

export function createDefaultFreeformPosition(index: number): RealtimeBulletinFreeformPosition {
  const safeIndex = Math.max(0, index);
  const column = safeIndex % FREEFORM_COLUMN_COUNT;
  const row = Math.floor(safeIndex / FREEFORM_COLUMN_COUNT);

  return {
    x: FREEFORM_START_X + column * (FREEFORM_CARD_WIDTH + FREEFORM_X_GAP),
    y: FREEFORM_START_Y + row * (FREEFORM_CARD_HEIGHT + FREEFORM_Y_GAP),
    w: FREEFORM_CARD_WIDTH,
    h: FREEFORM_CARD_HEIGHT,
    zIndex: safeIndex + 1,
  };
}

export function sortRealtimeBulletinPostsForBoard(
  posts: readonly RealtimeBulletinPost[],
): RealtimeBulletinPost[] {
  return [...posts].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.submittedAt - a.submittedAt;
  });
}
