/**
 * fetchFromGoogleWithDeps unit tests.
 *
 * 실제 Electron app/ipcMain은 mock 어렵기 때문에, IPC 등록(production wrapper) 자체는
 * 통합 테스트(qa-monitor) 대상. 여기서는 핵심 orchestration 로직만 fake 의존성으로 검증.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchFromGoogleWithDeps } from './slidesSource';
import {
  SlidesNotPublicError,
  SlidesQuotaExceededError,
  type IGoogleSlidesPort,
} from '../../src/domain/ports/IGoogleSlidesPort';
import type { IImageCachePort } from '../../src/domain/ports/IImageCachePort';

const VALID_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_abcdefg';
const VALID_URL = `https://docs.google.com/presentation/d/${VALID_ID}/edit`;

class FakeClient implements IGoogleSlidesPort {
  getRevisionId = vi.fn();
  getPageThumbnails = vi.fn();
  downloadAndCache = vi.fn();
}

class FakeCache implements IImageCachePort {
  exists = vi.fn();
  list = vi.fn();
  invalidate = vi.fn();
  store = vi.fn();
}

describe('fetchFromGoogleWithDeps', () => {
  let client: FakeClient;
  let cache: FakeCache;

  beforeEach(() => {
    client = new FakeClient();
    cache = new FakeCache();
  });

  // ─────────────────────────────────────────────────────────────
  describe('URL 검증', () => {
    it('빈 URL 거부', async () => {
      await expect(
        fetchFromGoogleWithDeps({ client, cache }, ''),
      ).rejects.toThrow(/비어/);
    });

    it('잘못된 호스트 거부', async () => {
      await expect(
        fetchFromGoogleWithDeps(
          { client, cache },
          `https://evil.example.com/presentation/d/${VALID_ID}/edit`,
        ),
      ).rejects.toThrow(/docs\.google\.com/);
    });

    it('형식 오류 거부', async () => {
      await expect(
        fetchFromGoogleWithDeps({ client, cache }, 'not-a-url'),
      ).rejects.toThrow(/형식/);
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('캐시 히트', () => {
    it('exists=true면 다운로드 스킵하고 list 결과 반환', async () => {
      client.getRevisionId.mockResolvedValueOnce('rev-A');
      cache.exists.mockResolvedValueOnce(true);
      cache.list.mockResolvedValueOnce([
        'file:///cache/pres/rev-A/p1.png',
        'file:///cache/pres/rev-A/p2.png',
      ]);

      const result = await fetchFromGoogleWithDeps({ client, cache }, VALID_URL);

      expect(result.revisionId).toBe('rev-A');
      expect(result.slides).toHaveLength(2);
      expect(result.slides[0]!.pageNumber).toBe(1);
      expect(result.slides[0]!.pageId).toBe('p1');
      expect(client.getPageThumbnails).not.toHaveBeenCalled();
      expect(client.downloadAndCache).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('캐시 미스 → fetch + download + 이전 revision 정리', () => {
    it('정상 흐름', async () => {
      client.getRevisionId.mockResolvedValueOnce('rev-B');
      cache.exists.mockResolvedValueOnce(false);
      cache.invalidate.mockResolvedValueOnce(undefined);
      client.getPageThumbnails.mockResolvedValueOnce([
        { pageId: 'p1', contentUrl: 'https://gusercontent.com/x1' },
        { pageId: 'p2', contentUrl: 'https://gusercontent.com/x2' },
      ]);
      client.downloadAndCache.mockResolvedValueOnce([
        { pageId: 'p1', imagePath: 'file:///cache/pres/rev-B/p1.png' },
        { pageId: 'p2', imagePath: 'file:///cache/pres/rev-B/p2.png' },
      ]);

      const result = await fetchFromGoogleWithDeps({ client, cache }, VALID_URL);

      expect(result.revisionId).toBe('rev-B');
      expect(result.slides).toHaveLength(2);
      // 이전 revision 정리 호출 (현재 revision은 except)
      expect(cache.invalidate).toHaveBeenCalledWith(VALID_ID, 'rev-B');
    });

    it('빈 프레젠테이션 (슬라이드 0장) 거부', async () => {
      client.getRevisionId.mockResolvedValueOnce('rev-empty');
      cache.exists.mockResolvedValueOnce(false);
      cache.invalidate.mockResolvedValueOnce(undefined);
      client.getPageThumbnails.mockResolvedValueOnce([]);

      await expect(
        fetchFromGoogleWithDeps({ client, cache }, VALID_URL),
      ).rejects.toThrow(/빈 프레젠테이션/);
      expect(client.downloadAndCache).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('도메인 에러 → 사용자 친화적 메시지 매핑', () => {
    it('SlidesNotPublicError → 공유 설정 안내', async () => {
      client.getRevisionId.mockRejectedValueOnce(
        new SlidesNotPublicError(VALID_ID),
      );

      await expect(
        fetchFromGoogleWithDeps({ client, cache }, VALID_URL),
      ).rejects.toThrow(/공유 설정/);
    });

    it('SlidesQuotaExceededError → 한도 도달 안내 + PDF 대안', async () => {
      client.getRevisionId.mockRejectedValueOnce(new SlidesQuotaExceededError());

      await expect(
        fetchFromGoogleWithDeps({ client, cache }, VALID_URL),
      ).rejects.toThrow(/한도|PDF/);
    });

    it('downloadAndCache 단계 에러도 매핑됨', async () => {
      client.getRevisionId.mockResolvedValueOnce('rev-A');
      cache.exists.mockResolvedValueOnce(false);
      cache.invalidate.mockResolvedValueOnce(undefined);
      client.getPageThumbnails.mockResolvedValueOnce([
        { pageId: 'p1', contentUrl: 'u1' },
      ]);
      client.downloadAndCache.mockRejectedValueOnce(
        new SlidesNotPublicError(VALID_ID),
      );

      await expect(
        fetchFromGoogleWithDeps({ client, cache }, VALID_URL),
      ).rejects.toThrow(/공유 설정/);
    });
  });
});
