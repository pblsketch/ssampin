import type { Sticker, StickerPack } from '@domain/entities/Sticker';
import { DEFAULT_PACK_ID } from '@domain/entities/Sticker';

/**
 * 이름 부분 일치(대소문자 무시) + 태그 일치(대소문자 무시 부분/완전 매치)로 검색.
 * 빈 쿼리는 원본 그대로 반환한다.
 */
export function searchStickers(
  stickers: readonly Sticker[],
  query: string,
): Sticker[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [...stickers];

  const q = trimmed.toLowerCase();
  return stickers.filter((s) => {
    if (s.name.toLowerCase().includes(q)) return true;
    return s.tags.some((tag) => {
      const t = tag.toLowerCase();
      return t === q || t.includes(q);
    });
  });
}

/** 최근 사용 순(lastUsedAt desc, null은 마지막) */
export function sortByRecent(stickers: readonly Sticker[]): Sticker[] {
  return [...stickers].sort((a, b) => {
    if (a.lastUsedAt === null && b.lastUsedAt === null) return 0;
    if (a.lastUsedAt === null) return 1;
    if (b.lastUsedAt === null) return -1;
    return b.lastUsedAt.localeCompare(a.lastUsedAt);
  });
}

/** 자주 사용 순(usageCount desc, 동률 시 lastUsedAt desc) */
export function sortByMostUsed(stickers: readonly Sticker[]): Sticker[] {
  return [...stickers].sort((a, b) => {
    if (a.usageCount !== b.usageCount) return b.usageCount - a.usageCount;
    if (a.lastUsedAt === null && b.lastUsedAt === null) return 0;
    if (a.lastUsedAt === null) return 1;
    if (b.lastUsedAt === null) return -1;
    return b.lastUsedAt.localeCompare(a.lastUsedAt);
  });
}

/** 등록 순(createdAt desc, 최신이 앞) */
export function sortByCreated(stickers: readonly Sticker[]): Sticker[] {
  return [...stickers].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** 최근 사용한 이모티콘만 lastUsedAt desc로 maxCount까지 반환 */
export function getRecent(
  stickers: readonly Sticker[],
  maxCount: number,
): Sticker[] {
  if (maxCount <= 0) return [];
  return sortByRecent(stickers.filter((s) => s.lastUsedAt !== null)).slice(
    0,
    maxCount,
  );
}

/**
 * 팩별 그룹핑.
 * - pack.order 오름차순 유지
 * - 이모티콘이 1개 이상인 팩만 포함
 * - packId가 packs에 없는 orphan은 default 팩이 있으면 거기에 합산
 */
export function groupByPack(
  stickers: readonly Sticker[],
  packs: readonly StickerPack[],
): Array<{ pack: StickerPack; stickers: Sticker[] }> {
  const sortedPacks = [...packs].sort((a, b) => a.order - b.order);
  const packIds = new Set(sortedPacks.map((p) => p.id));
  const hasDefault = packIds.has(DEFAULT_PACK_ID);

  const buckets = new Map<string, Sticker[]>();
  for (const pack of sortedPacks) {
    buckets.set(pack.id, []);
  }

  for (const sticker of stickers) {
    if (packIds.has(sticker.packId)) {
      buckets.get(sticker.packId)!.push(sticker);
    } else if (hasDefault) {
      buckets.get(DEFAULT_PACK_ID)!.push(sticker);
    }
    // default 팩이 없으면 orphan은 결과에서 제외
  }

  const result: Array<{ pack: StickerPack; stickers: Sticker[] }> = [];
  for (const pack of sortedPacks) {
    const items = buckets.get(pack.id)!;
    if (items.length > 0) {
      result.push({ pack, stickers: items });
    }
  }
  return result;
}

/** 사용 시점에 호출: usageCount +1, lastUsedAt = now */
export function incrementUsage(sticker: Sticker, now: string): Sticker {
  return {
    ...sticker,
    usageCount: sticker.usageCount + 1,
    lastUsedAt: now,
  };
}

/**
 * contentHash로 동일 이미지 중복 검출.
 * contentHash가 비어있으면 null 반환(검사 불가).
 */
export function findDuplicate(
  stickers: readonly Sticker[],
  contentHash: string,
): Sticker | null {
  if (!contentHash) return null;
  return stickers.find((s) => s.contentHash === contentHash) ?? null;
}

/** 팩 이름 검증: 1~20자, 공백 외 문자, 대소문자 무시 중복 금지 */
export function validatePackName(
  name: string,
  existingPacks: readonly StickerPack[],
  excludeId?: string,
): { ok: true } | { ok: false; reason: string } {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: '팩 이름을 입력해주세요' };
  }
  if (trimmed.length > 20) {
    return { ok: false, reason: '팩 이름은 20자 이하여야 합니다' };
  }
  const lower = trimmed.toLowerCase();
  const dup = existingPacks.some(
    (p) => p.id !== excludeId && p.name.trim().toLowerCase() === lower,
  );
  if (dup) {
    return { ok: false, reason: '이미 같은 이름의 팩이 있어요' };
  }
  return { ok: true };
}

/** 이모티콘 이름 검증: 1~30자 */
export function validateStickerName(
  name: string,
): { ok: true } | { ok: false; reason: string } {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: '이모티콘 이름을 입력해주세요' };
  }
  if (trimmed.length > 30) {
    return { ok: false, reason: '이모티콘 이름은 30자 이하여야 합니다' };
  }
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// 시트 분할 (Phase 2B / PRD §3.4.3)
// ────────────────────────────────────────────────────────────

/** 시트 입력 검증 결과 */
export interface SheetValidation {
  ok: boolean;
  reason?: string;
  width?: number;
  height?: number;
}

/** 시트 한 변 최소 길이 (px) — 4×4 분할 시 셀당 250px 이상 확보 */
export const MIN_SHEET_SIZE = 1000;
/** 정사각형 허용 비율 (±3%) */
export const ASPECT_TOLERANCE = 0.03;

/**
 * 시트 이미지 dimension 검증.
 * - 정사각형(±3% 허용)
 * - 짧은 변 1000px 이상
 */
export function validateSheetDimensions(
  width: number,
  height: number,
): SheetValidation {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return { ok: false, reason: '이미지 크기를 확인할 수 없어요.' };
  }
  const shorter = Math.min(width, height);
  if (shorter < MIN_SHEET_SIZE) {
    return {
      ok: false,
      reason: `시트 분할은 1000px 이상의 정사각형 이미지에서만 동작해요. (현재 ${width}×${height})`,
    };
  }
  const ratio = Math.max(width, height) / shorter;
  if (ratio > 1 + ASPECT_TOLERANCE) {
    return {
      ok: false,
      reason: `정사각형(±3%) 이미지여야 해요. (현재 비율 ${ratio.toFixed(2)})`,
    };
  }
  return { ok: true, width, height };
}

/** 지원하는 격자 크기 */
export type GridSize = 2 | 3 | 4;

/** 시트 셀 하나의 좌표/크기 (모두 픽셀 단위, row-major index) */
export interface SheetCell {
  /** row-major 0-based 인덱스 */
  index: number;
  /** 0..gridSize-1 */
  row: number;
  /** 0..gridSize-1 */
  col: number;
  /** 픽셀 x (소스 이미지 기준) */
  x: number;
  /** 픽셀 y (소스 이미지 기준) */
  y: number;
  /** 정사각형 한 변 (px) */
  size: number;
}

/**
 * 정사각형 시트를 N×N 격자로 분할한 셀 좌표를 row-major 순서로 반환한다.
 *
 * - cellSize는 floor(sheetSize / gridSize)로 계산 (소수점 절사로 픽셀 보정).
 * - sheetSize % gridSize ≠ 0 인 경우 마지막 행/열에 1~2px 잔여가 생길 수 있으나,
 *   이는 분할 후 360×360으로 리사이즈되므로 시각적 영향은 무시 가능.
 */
export function computeSheetCells(
  sheetSize: number,
  gridSize: GridSize,
): SheetCell[] {
  const cellSize = Math.floor(sheetSize / gridSize);
  const cells: SheetCell[] = [];
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      cells.push({
        index: row * gridSize + col,
        row,
        col,
        x: col * cellSize,
        y: row * cellSize,
        size: cellSize,
      });
    }
  }
  return cells;
}

/**
 * 태그 입력 파싱.
 * - 쉼표(,) 또는 공백(스페이스/탭/줄바꿈)으로 분리
 * - 좌우 공백 제거
 * - 대소문자 무시 중복 제거(처음 등장한 케이스 유지)
 * - 빈 문자열 제거
 * - 각 태그 12자 이하만 통과
 * - 최대 10개까지
 */
export function parseTags(input: string): string[] {
  const parts = input.split(/[\s,]+/);
  const result: string[] = [];
  const seen = new Set<string>();

  for (const raw of parts) {
    const tag = raw.trim();
    if (tag.length === 0) continue;
    if (tag.length > 12) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
    if (result.length >= 10) break;
  }

  return result;
}
