import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleSlidesApiClient } from './GoogleSlidesApiClient';
import type { IImageCachePort } from '@domain/ports/IImageCachePort';
import {
  SlidesNetworkError,
  SlidesNotPublicError,
  SlidesQuotaExceededError,
} from '@domain/ports/IGoogleSlidesPort';

const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

class FakeCache implements IImageCachePort {
  readonly stored: { presentationId: string; revisionId: string; pageId: string; bytes: Uint8Array }[] = [];
  exists(): Promise<boolean> {
    return Promise.resolve(false);
  }
  list(): Promise<readonly string[]> {
    return Promise.resolve([]);
  }
  invalidate(): Promise<void> {
    return Promise.resolve();
  }
  async store(
    presentationId: string,
    revisionId: string,
    pageId: string,
    bytes: Uint8Array,
  ): Promise<string> {
    this.stored.push({ presentationId, revisionId, pageId, bytes });
    return `file:///fake/${presentationId}/${revisionId}/${pageId}.png`;
  }
}

/** fetch 응답 mock */
function mockResponse(
  status: number,
  body: unknown,
  type: 'json' | 'bytes' = 'json',
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    arrayBuffer: () =>
      Promise.resolve(
        type === 'bytes' ? (body as Uint8Array).buffer : new ArrayBuffer(0),
      ),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

describe('GoogleSlidesApiClient', () => {
  let cache: FakeCache;
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: GoogleSlidesApiClient;

  beforeEach(() => {
    cache = new FakeCache();
    fetchMock = vi.fn();
    client = new GoogleSlidesApiClient('test-api-key', cache, {
      fetch: fetchMock as unknown as typeof fetch,
      downloadConcurrency: 2,
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('constructor', () => {
    it('빈 API 키는 throw', () => {
      expect(
        () =>
          new GoogleSlidesApiClient('', cache, {
            fetch: fetchMock as unknown as typeof fetch,
          }),
      ).toThrow(/API key is missing/);
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('getRevisionId', () => {
    it('revisionId 반환', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200, { revisionId: 'r-1' }));
      const r = await client.getRevisionId('pres-1');
      expect(r).toBe('r-1');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const url = fetchMock.mock.calls[0]![0] as string;
      expect(url).toContain('presentations/pres-1');
      expect(url).toContain('fields=revisionId');
      expect(url).toContain('key=test-api-key');
    });

    it('403 → SlidesNotPublicError', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(403, {}));
      await expect(client.getRevisionId('pres-1')).rejects.toBeInstanceOf(
        SlidesNotPublicError,
      );
    });

    it('404 → SlidesNotPublicError (URL 잘못 + 비공개 둘 다 같은 가이드 모달로)', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(404, {}));
      await expect(client.getRevisionId('pres-1')).rejects.toBeInstanceOf(
        SlidesNotPublicError,
      );
    });

    it('429 → SlidesQuotaExceededError', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(429, {}));
      await expect(client.getRevisionId('pres-1')).rejects.toBeInstanceOf(
        SlidesQuotaExceededError,
      );
    });

    it('500 → SlidesNetworkError', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(500, {}));
      await expect(client.getRevisionId('pres-1')).rejects.toBeInstanceOf(
        SlidesNetworkError,
      );
    });

    it('200이지만 revisionId 누락 시 SlidesNetworkError', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200, {}));
      await expect(client.getRevisionId('pres-1')).rejects.toBeInstanceOf(
        SlidesNetworkError,
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('getPageThumbnails', () => {
    it('페이지 목록 → 각 page contentUrl 조회', async () => {
      // 1) presentations.get → slides.objectId
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, { slides: [{ objectId: 'p1' }, { objectId: 'p2' }] }),
      );
      // 2,3) 각 page thumbnail
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, { contentUrl: 'https://googleusercontent.com/x1' }),
      );
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, { contentUrl: 'https://googleusercontent.com/x2' }),
      );

      const thumbs = await client.getPageThumbnails('pres-1');
      expect(thumbs).toEqual([
        { pageId: 'p1', contentUrl: 'https://googleusercontent.com/x1' },
        { pageId: 'p2', contentUrl: 'https://googleusercontent.com/x2' },
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('빈 슬라이드 덱은 빈 배열', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200, { slides: [] }));
      const thumbs = await client.getPageThumbnails('pres-1');
      expect(thumbs).toEqual([]);
      // page thumbnail 호출 없음
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('contentUrl 누락된 응답은 SlidesNetworkError', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, { slides: [{ objectId: 'p1' }] }),
      );
      fetchMock.mockResolvedValueOnce(mockResponse(200, {})); // contentUrl 빠짐
      await expect(client.getPageThumbnails('pres-1')).rejects.toBeInstanceOf(
        SlidesNetworkError,
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('downloadAndCache', () => {
    it('단명 contentUrl 즉시 다운로드 후 캐시 저장', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200, PNG_HEADER, 'bytes'));
      fetchMock.mockResolvedValueOnce(mockResponse(200, PNG_HEADER, 'bytes'));

      const result = await client.downloadAndCache('pres-1', 'rev-A', [
        { pageId: 'p1', contentUrl: 'https://gusercontent.com/x1' },
        { pageId: 'p2', contentUrl: 'https://gusercontent.com/x2' },
      ]);

      expect(result).toEqual([
        { pageId: 'p1', imagePath: 'file:///fake/pres-1/rev-A/p1.png' },
        { pageId: 'p2', imagePath: 'file:///fake/pres-1/rev-A/p2.png' },
      ]);
      expect(cache.stored).toHaveLength(2);
      expect(cache.stored[0]!.bytes).toEqual(PNG_HEADER);
    });

    it('단명 URL 만료 (403) → SlidesNetworkError', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(403, {}));
      await expect(
        client.downloadAndCache('pres-1', 'rev-A', [
          { pageId: 'p1', contentUrl: 'https://gusercontent.com/x1' },
        ]),
      ).rejects.toBeInstanceOf(SlidesNetworkError);
    });

    it('동시 다운로드 한도 준수 (concurrency=2 기준 batch 처리)', async () => {
      // 4개 page → 2개씩 batch로 처리
      for (let i = 0; i < 4; i++) {
        fetchMock.mockResolvedValueOnce(mockResponse(200, PNG_HEADER, 'bytes'));
      }
      const result = await client.downloadAndCache('pres-1', 'rev-A', [
        { pageId: 'p1', contentUrl: 'u1' },
        { pageId: 'p2', contentUrl: 'u2' },
        { pageId: 'p3', contentUrl: 'u3' },
        { pageId: 'p4', contentUrl: 'u4' },
      ]);
      expect(result).toHaveLength(4);
      expect(cache.stored).toHaveLength(4);
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('API 키 격리 (보안)', () => {
    it('모든 Slides API 호출 URL에 key 포함', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200, { revisionId: 'r' }));
      await client.getRevisionId('pres-1');
      const url = fetchMock.mock.calls[0]![0] as string;
      expect(url).toContain('key=test-api-key');
    });

    it('contentUrl 다운로드는 Slides API가 아니라 googleusercontent — key 미포함', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200, PNG_HEADER, 'bytes'));
      await client.downloadAndCache('pres-1', 'rev-A', [
        { pageId: 'p1', contentUrl: 'https://lh3.googleusercontent.com/x' },
      ]);
      const url = fetchMock.mock.calls[0]![0] as string;
      expect(url).toBe('https://lh3.googleusercontent.com/x');
      expect(url).not.toContain('test-api-key');
    });
  });
});
