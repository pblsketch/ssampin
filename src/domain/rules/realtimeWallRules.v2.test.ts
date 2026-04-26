/**
 * v2.1 (Phase B) 도메인 규칙 단위 테스트.
 *
 * Design v2.1 §10.1 / §13 Phase B 수용 기준:
 *   - validateImages (다중) 10+ 케이스
 *   - validatePdf 6+ 케이스
 *   - validateBoardSettings 5+ 케이스
 *   - normalizePostForPadletModeV2 idempotent 4+ 케이스
 *   - validateImageDataUrl 8+ 케이스
 *   - 카드 색상 enum 검증
 *
 * 순수 함수 검증 — UI/IPC 레이어와 독립.
 */
import { describe, expect, it } from 'vitest';
import type {
  RealtimeWallCardColor,
  RealtimeWallPost,
  WallBoard,
  WallBoardId,
} from '@domain/entities/RealtimeWall';
import { DEFAULT_REALTIME_WALL_BOARD_SETTINGS } from '@domain/entities/RealtimeWallBoardSettings';
import {
  REALTIME_WALL_CARD_COLORS,
  REALTIME_WALL_MAX_IMAGES_PER_POST,
  approvalModeFromModerationMode,
  isValidRealtimeWallCardColor,
  moderationModeFromApprovalMode,
  normalizeBoardForPadletModeV2,
  normalizePostForPadletModeV2,
  validateBoardSettings,
  validateImageDataUrl,
  validateImages,
  validatePdf,
} from './realtimeWallRules';

// ============================================================
// Helpers
// ============================================================

function pngDataUrl(): string {
  // 1x1 투명 PNG (RFC 2397 compliant base64)
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
}

function jpegDataUrl(): string {
  // SOI + APP0 marker (FF D8 FF E0)
  return 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wgARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQBAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhADEAAAAR//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAh//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AR//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AR//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Ah//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IR//2gAMAwEAAgADAAAAEB//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EB//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EB//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EB//2Q==';
}

function gifDataUrl(): string {
  // GIF89a header (47 49 46 38 39 61) — 1x1 transparent
  return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
}

function webpDataUrl(): string {
  // RIFF + WEBP header (52 49 46 46 .. .. .. .. 57 45 42 50)
  return 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaACdLoB+AAEAAA=';
}

function svgDataUrl(): string {
  return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=';
}

function postFactory(overrides?: Partial<RealtimeWallPost>): RealtimeWallPost {
  return {
    id: 'p1',
    nickname: '학생',
    text: 'hello',
    status: 'approved',
    pinned: false,
    submittedAt: 1_700_000_000_000,
    kanban: { columnId: 'column-1', order: 0 },
    freeform: { x: 0, y: 0, w: 260, h: 180, zIndex: 1 },
    ...overrides,
  };
}

// ============================================================
// validateImageDataUrl (8+ 케이스)
// ============================================================

describe('validateImageDataUrl', () => {
  it('정상 PNG → ok', () => {
    expect(validateImageDataUrl(pngDataUrl())).toEqual({ ok: true });
  });
  it('정상 JPEG → ok', () => {
    expect(validateImageDataUrl(jpegDataUrl())).toEqual({ ok: true });
  });
  it('정상 GIF → ok', () => {
    expect(validateImageDataUrl(gifDataUrl())).toEqual({ ok: true });
  });
  it('정상 WebP → ok', () => {
    expect(validateImageDataUrl(webpDataUrl())).toEqual({ ok: true });
  });
  it('SVG 차단 (svg-not-allowed)', () => {
    const result = validateImageDataUrl(svgDataUrl());
    expect(result).toEqual({ ok: false, reason: 'svg-not-allowed' });
  });
  it('data URL 아닌 입력 → invalid-data-url', () => {
    expect(validateImageDataUrl('not-a-data-url')).toEqual({
      ok: false,
      reason: 'invalid-data-url',
    });
  });
  it('PNG mime인데 magic byte JPEG → magic-byte-mismatch', () => {
    const fakeMime =
      'data:image/png;base64,/9j/4AAQSkZJRgABAQ==';
    expect(validateImageDataUrl(fakeMime)).toEqual({
      ok: false,
      reason: 'magic-byte-mismatch',
    });
  });
  it('빈 문자열 → invalid-data-url', () => {
    expect(validateImageDataUrl('')).toEqual({ ok: false, reason: 'invalid-data-url' });
  });
  it('mime이 image/bmp (whitelist 외) → invalid-format', () => {
    const bmp = 'data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABABgAAAAAAAYAAAATCwAAEwsAAAAAAAAAAAAA////AA==';
    expect(validateImageDataUrl(bmp)).toEqual({ ok: false, reason: 'invalid-format' });
  });
});

// ============================================================
// validateImages (10+ 케이스)
// ============================================================

describe('validateImages', () => {
  it('빈 배열 → ok', () => {
    expect(validateImages([])).toEqual({ ok: true });
  });
  it('PNG 1장 → ok', () => {
    expect(validateImages([pngDataUrl()])).toEqual({ ok: true });
  });
  it('PNG 3장 → ok', () => {
    expect(validateImages([pngDataUrl(), pngDataUrl(), pngDataUrl()])).toEqual({
      ok: true,
    });
  });
  // v2.1 student-ux 회귀 fix (2026-04-24): 3 → 5장 cap 상향
  it('PNG 5장 → ok (회귀 fix: cap 5)', () => {
    expect(
      validateImages([
        pngDataUrl(),
        pngDataUrl(),
        pngDataUrl(),
        pngDataUrl(),
        pngDataUrl(),
      ]),
    ).toEqual({ ok: true });
  });
  it('PNG 6장 → too-many-images (cap 5 초과)', () => {
    expect(
      validateImages([
        pngDataUrl(),
        pngDataUrl(),
        pngDataUrl(),
        pngDataUrl(),
        pngDataUrl(),
        pngDataUrl(),
      ]),
    ).toEqual({ ok: false, reason: 'too-many-images' });
  });
  it('SVG 1장 포함 → svg-not-allowed (index 0)', () => {
    const result = validateImages([svgDataUrl()]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('svg-not-allowed');
      expect(result.index).toBe(0);
    }
  });
  it('PNG + SVG → svg-not-allowed (index 1)', () => {
    const result = validateImages([pngDataUrl(), svgDataUrl()]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('svg-not-allowed');
      expect(result.index).toBe(1);
    }
  });
  it('JPEG/PNG/GIF 혼합 3장 → ok', () => {
    expect(validateImages([jpegDataUrl(), pngDataUrl(), gifDataUrl()])).toEqual({
      ok: true,
    });
  });
  it('maxImages 옵션 1로 2장 → too-many-images', () => {
    const result = validateImages([pngDataUrl(), pngDataUrl()], { maxImages: 1 });
    expect(result).toEqual({ ok: false, reason: 'too-many-images' });
  });
  it('maxTotalBytes 매우 작게 → total-too-large', () => {
    const result = validateImages([pngDataUrl()], { maxTotalBytes: 10 });
    expect(result).toEqual({ ok: false, reason: 'total-too-large' });
  });
  it('non-string 요소 → invalid-data-url', () => {
    const result = validateImages([null as unknown as string]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid-data-url');
      expect(result.index).toBe(0);
    }
  });
});

// ============================================================
// validatePdf (6+ 케이스)
// ============================================================

describe('validatePdf', () => {
  const validUrl = 'file:///tmp/test.pdf';
  const validHead = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4

  it('정상 PDF (magic byte + file://) → ok', () => {
    expect(validatePdf(validHead, validUrl)).toEqual({ ok: true });
  });
  it('http:// URL → invalid-url', () => {
    expect(validatePdf(validHead, 'http://example.com/foo.pdf')).toEqual({
      ok: false,
      reason: 'invalid-url',
    });
  });
  it('https:// URL → invalid-url', () => {
    expect(validatePdf(validHead, 'https://example.com/foo.pdf')).toEqual({
      ok: false,
      reason: 'invalid-url',
    });
  });
  it('SVG magic byte (3C 3F 78 6D 6C) → magic-byte-mismatch', () => {
    const svgHead = new Uint8Array([0x3c, 0x3f, 0x78, 0x6d, 0x6c]);
    expect(validatePdf(svgHead, validUrl)).toEqual({
      ok: false,
      reason: 'magic-byte-mismatch',
    });
  });
  it('exe magic byte (4D 5A) → magic-byte-mismatch', () => {
    const exeHead = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]);
    expect(validatePdf(exeHead, validUrl)).toEqual({
      ok: false,
      reason: 'magic-byte-mismatch',
    });
  });
  it('11MB 초과 → too-large', () => {
    const big = new Uint8Array(11 * 1024 * 1024);
    big[0] = 0x25;
    big[1] = 0x50;
    big[2] = 0x44;
    big[3] = 0x46;
    big[4] = 0x2d;
    expect(validatePdf(big, validUrl)).toEqual({ ok: false, reason: 'too-large' });
  });
  it('5바이트 미만 → magic-byte-mismatch', () => {
    expect(validatePdf(new Uint8Array([0x25]), validUrl)).toEqual({
      ok: false,
      reason: 'magic-byte-mismatch',
    });
  });
});

// ============================================================
// validateBoardSettings (5+ 케이스)
// ============================================================

describe('validateBoardSettings', () => {
  it('정상 off → ok', () => {
    expect(
      validateBoardSettings({ version: 1, moderation: 'off' }),
    ).toEqual({ ok: true });
  });
  it('정상 manual → ok', () => {
    expect(
      validateBoardSettings({ version: 1, moderation: 'manual' }),
    ).toEqual({ ok: true });
  });
  it('moderation auto (deprecated) → invalid-moderation', () => {
    expect(
      validateBoardSettings({ version: 1, moderation: 'auto' }),
    ).toEqual({ ok: false, reason: 'invalid-moderation' });
  });
  it('version 2 → unknown-version', () => {
    expect(
      validateBoardSettings({ version: 2, moderation: 'off' }),
    ).toEqual({ ok: false, reason: 'unknown-version' });
  });
  it('null → invalid-shape', () => {
    expect(validateBoardSettings(null)).toEqual({
      ok: false,
      reason: 'invalid-shape',
    });
  });
  it('객체 아님 → invalid-shape', () => {
    expect(validateBoardSettings('off')).toEqual({
      ok: false,
      reason: 'invalid-shape',
    });
  });
});

// ============================================================
// normalizePostForPadletModeV2 (4+ 케이스 — idempotent)
// ============================================================

describe('normalizePostForPadletModeV2', () => {
  it('v1.14.x post (color/edited 없음) → color="white", edited=false 주입', () => {
    const post = postFactory();
    const normalized = normalizePostForPadletModeV2(post);
    expect(normalized.color).toBe('white');
    expect(normalized.edited).toBe(false);
    // v1 normalizer가 likes/likedBy/comments default 주입
    expect(normalized.likes).toBe(0);
    expect(normalized.likedBy).toEqual([]);
    expect(normalized.comments).toEqual([]);
  });
  it('color="yellow" 보존', () => {
    const post = postFactory({ color: 'yellow' });
    expect(normalizePostForPadletModeV2(post).color).toBe('yellow');
  });
  it('edited=true 보존', () => {
    const post = postFactory({ edited: true });
    expect(normalizePostForPadletModeV2(post).edited).toBe(true);
  });
  it('idempotent — 두 번 호출해도 동일 결과', () => {
    const post = postFactory();
    const once = normalizePostForPadletModeV2(post);
    const twice = normalizePostForPadletModeV2(once);
    expect(twice).toEqual(once);
  });
  it('ownerSessionToken / studentPinHash / images / pdfUrl는 default 주입 X (undefined 유지)', () => {
    const post = postFactory();
    const normalized = normalizePostForPadletModeV2(post);
    expect(normalized.ownerSessionToken).toBeUndefined();
    expect(normalized.studentPinHash).toBeUndefined();
    expect(normalized.images).toBeUndefined();
    expect(normalized.pdfUrl).toBeUndefined();
  });
  it("status='hidden-by-author' 카드는 status 보존", () => {
    const post = postFactory({ status: 'hidden-by-author' });
    expect(normalizePostForPadletModeV2(post).status).toBe('hidden-by-author');
  });
});

// ============================================================
// normalizeBoardForPadletModeV2 (3+ 케이스)
// ============================================================

describe('normalizeBoardForPadletModeV2', () => {
  function boardFactory(): WallBoard {
    return {
      id: 'b1' as WallBoardId,
      title: '보드',
      layoutMode: 'kanban',
      columns: [{ id: 'column-1', title: '생각', order: 0 }],
      approvalMode: 'auto',
      posts: [postFactory()],
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    };
  }

  it('settings 미존재 → DEFAULT_REALTIME_WALL_BOARD_SETTINGS 주입', () => {
    const board = boardFactory();
    const normalized = normalizeBoardForPadletModeV2(board);
    expect(normalized.settings).toEqual(DEFAULT_REALTIME_WALL_BOARD_SETTINGS);
    expect(normalized.settings?.moderation).toBe('off');
  });
  it('settings 존재 시 보존', () => {
    const board: WallBoard = {
      ...boardFactory(),
      settings: { version: 1, moderation: 'manual' },
    };
    expect(normalizeBoardForPadletModeV2(board).settings?.moderation).toBe('manual');
  });
  it('idempotent', () => {
    const board = boardFactory();
    const once = normalizeBoardForPadletModeV2(board);
    const twice = normalizeBoardForPadletModeV2(once);
    expect(twice).toEqual(once);
  });
  it('posts 각각에 v2.1 normalizer 적용', () => {
    const board: WallBoard = {
      ...boardFactory(),
      posts: [postFactory(), postFactory({ color: 'pink' })],
    };
    const normalized = normalizeBoardForPadletModeV2(board);
    expect(normalized.posts[0]?.color).toBe('white');
    expect(normalized.posts[1]?.color).toBe('pink');
  });
});

// ============================================================
// 카드 색상 enum 검증
// ============================================================

describe('isValidRealtimeWallCardColor', () => {
  it('8색 모두 valid', () => {
    REALTIME_WALL_CARD_COLORS.forEach((color: RealtimeWallCardColor) => {
      expect(isValidRealtimeWallCardColor(color)).toBe(true);
    });
  });
  it('알 수 없는 색상 → false', () => {
    expect(isValidRealtimeWallCardColor('rainbow')).toBe(false);
  });
  it('null / undefined → false', () => {
    expect(isValidRealtimeWallCardColor(null)).toBe(false);
    expect(isValidRealtimeWallCardColor(undefined)).toBe(false);
  });
  it('REALTIME_WALL_MAX_IMAGES_PER_POST 상수 = 5 (v2.1 student-ux 회귀 fix 2026-04-24)', () => {
    expect(REALTIME_WALL_MAX_IMAGES_PER_POST).toBe(5);
  });
});

// ============================================================
// approvalMode ↔ moderationMode 매핑
// ============================================================

describe('approvalMode ↔ moderationMode 매핑', () => {
  it("approvalMode='auto' ↔ moderation='off'", () => {
    expect(moderationModeFromApprovalMode('auto')).toBe('off');
    expect(approvalModeFromModerationMode('off')).toBe('auto');
  });
  it("approvalMode='manual' ↔ moderation='manual'", () => {
    expect(moderationModeFromApprovalMode('manual')).toBe('manual');
    expect(approvalModeFromModerationMode('manual')).toBe('manual');
  });
  it("approvalMode='filter' (legacy) → moderation='manual'", () => {
    expect(moderationModeFromApprovalMode('filter')).toBe('manual');
  });
});
