/**
 * GoogleSlidesApiClient — IGoogleSlidesPort 구현체.
 *
 * Google Slides API v1 + API 키 방식 (OAuth 불필요).
 * 공유 설정이 "뷰어"인 프레젠테이션만 접근 가능 (Plan §11.6).
 *
 * **메인 프로세스 전용**:
 * - API 키 노출 차단을 위해 렌더러는 IPC로만 호출
 * - DevTools/Network 탭에 키가 보이지 않음
 *
 * 단명 contentUrl(~30분 TTL)을 즉시 다운로드해 캐시에 저장 — 만료 시 404 회피.
 */

import {
  type IGoogleSlidesPort,
  type GoogleSlidesPageThumbnail,
  type GoogleSlidesCachedPage,
  SlidesNetworkError,
  SlidesNotPublicError,
  SlidesQuotaExceededError,
} from '@domain/ports/IGoogleSlidesPort';
import type { IImageCachePort } from '@domain/ports/IImageCachePort';

const BASE_URL = 'https://slides.googleapis.com/v1';

/** Slides API getThumbnail 옵션 (PNG, 1600px 폭 기준) */
const THUMBNAIL_PROPERTIES = {
  thumbnailSize: 'LARGE', // 1600x900 정도
  mimeType: 'PNG',
};

/** 동시 다운로드 한도 (Google rate limit 회피) */
const DEFAULT_DOWNLOAD_CONCURRENCY = 4;

interface SlidesGetResponse {
  readonly revisionId?: string;
  readonly slides?: readonly { readonly objectId?: string }[];
}

interface SlidesThumbnailResponse {
  readonly contentUrl?: string;
}

export interface GoogleSlidesApiClientDeps {
  /** 테스트용 fetch 주입. 미지정 시 globalThis.fetch */
  readonly fetch?: typeof fetch;
  /** 다운로드 동시 한도 (기본 4) */
  readonly downloadConcurrency?: number;
}

export class GoogleSlidesApiClient implements IGoogleSlidesPort {
  private readonly fetchFn: typeof fetch;
  private readonly downloadConcurrency: number;

  constructor(
    private readonly apiKey: string,
    private readonly cache: IImageCachePort,
    deps: GoogleSlidesApiClientDeps = {},
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error('Google Slides API key is missing');
    }
    this.fetchFn = deps.fetch ?? globalThis.fetch.bind(globalThis);
    this.downloadConcurrency =
      deps.downloadConcurrency ?? DEFAULT_DOWNLOAD_CONCURRENCY;
  }

  // ─────────────────────────────────────────────────────────────
  // revisionId 조회 (캐시 무효화 키)
  // ─────────────────────────────────────────────────────────────
  async getRevisionId(presentationId: string): Promise<string> {
    const url = `${BASE_URL}/presentations/${encodeURIComponent(presentationId)}?fields=revisionId&key=${encodeURIComponent(this.apiKey)}`;
    const res = await this.fetchOrThrow(url, presentationId);
    const data = (await res.json()) as SlidesGetResponse;
    if (!data.revisionId) {
      throw new SlidesNetworkError(res.status);
    }
    return data.revisionId;
  }

  // ─────────────────────────────────────────────────────────────
  // 페이지별 단명 contentUrl 조회
  // ─────────────────────────────────────────────────────────────
  async getPageThumbnails(
    presentationId: string,
  ): Promise<readonly GoogleSlidesPageThumbnail[]> {
    // 1) presentations.get → page list
    const url = `${BASE_URL}/presentations/${encodeURIComponent(presentationId)}?fields=slides.objectId&key=${encodeURIComponent(this.apiKey)}`;
    const res = await this.fetchOrThrow(url, presentationId);
    const data = (await res.json()) as SlidesGetResponse;
    const pageIds = (data.slides ?? [])
      .map((s) => s.objectId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (pageIds.length === 0) return [];

    // 2) 각 page → getThumbnail
    const thumbs: GoogleSlidesPageThumbnail[] = [];
    const concurrency = this.downloadConcurrency;
    for (let i = 0; i < pageIds.length; i += concurrency) {
      const batch = pageIds.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map((pageId) =>
          this.fetchPageThumbnail(presentationId, pageId),
        ),
      );
      thumbs.push(...results);
    }
    return thumbs;
  }

  private async fetchPageThumbnail(
    presentationId: string,
    pageId: string,
  ): Promise<GoogleSlidesPageThumbnail> {
    const params = new URLSearchParams({
      'thumbnailProperties.thumbnailSize': THUMBNAIL_PROPERTIES.thumbnailSize,
      'thumbnailProperties.mimeType': THUMBNAIL_PROPERTIES.mimeType,
      key: this.apiKey,
    });
    const url = `${BASE_URL}/presentations/${encodeURIComponent(presentationId)}/pages/${encodeURIComponent(pageId)}/thumbnail?${params.toString()}`;
    const res = await this.fetchOrThrow(url, presentationId);
    const data = (await res.json()) as SlidesThumbnailResponse;
    if (!data.contentUrl) {
      throw new SlidesNetworkError(res.status);
    }
    return { pageId, contentUrl: data.contentUrl };
  }

  // ─────────────────────────────────────────────────────────────
  // 단명 contentUrl 즉시 다운로드 + 캐시 저장
  // ─────────────────────────────────────────────────────────────
  async downloadAndCache(
    presentationId: string,
    revisionId: string,
    pages: readonly GoogleSlidesPageThumbnail[],
  ): Promise<readonly GoogleSlidesCachedPage[]> {
    const out: GoogleSlidesCachedPage[] = [];
    const concurrency = this.downloadConcurrency;

    for (let i = 0; i < pages.length; i += concurrency) {
      const batch = pages.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map(async (page) => {
          const bytes = await this.downloadPng(page.contentUrl);
          const imagePath = await this.cache.store(
            presentationId,
            revisionId,
            page.pageId,
            bytes,
          );
          return { pageId: page.pageId, imagePath };
        }),
      );
      out.push(...results);
    }

    return out;
  }

  private async downloadPng(contentUrl: string): Promise<Uint8Array> {
    const res = await this.fetchFn(contentUrl);
    if (!res.ok) {
      // 단명 URL 만료 → 보통 403/404. 호출자에게 재시도 책임 위임.
      throw new SlidesNetworkError(res.status);
    }
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }

  // ─────────────────────────────────────────────────────────────
  // HTTP 응답 → 도메인 에러 매핑
  // ─────────────────────────────────────────────────────────────
  private async fetchOrThrow(
    url: string,
    presentationId: string,
  ): Promise<Response> {
    const res = await this.fetchFn(url);
    if (res.ok) return res;
    if (res.status === 403 || res.status === 404) {
      throw new SlidesNotPublicError(presentationId);
    }
    if (res.status === 429) {
      throw new SlidesQuotaExceededError();
    }
    throw new SlidesNetworkError(res.status);
  }
}
