/**
 * Google Slides API 추상화 (Plan §3 + Design §3, §5.1).
 *
 * 구현체(`GoogleSlidesApiClient`)는 메인 프로세스에 위치 (API 키 격리).
 * 도메인은 fetch/Buffer 어떤 외부 API도 알지 않는다.
 */

export interface GoogleSlidesPageThumbnail {
  /** Slides API에서 식별하는 page ID (예: "p1") */
  readonly pageId: string;
  /**
   * `pages.getThumbnail`이 반환하는 단명 contentUrl (~30분 TTL).
   * 즉시 다운로드해야 함 — 캐시에 그대로 저장하면 만료 시 404.
   */
  readonly contentUrl: string;
}

export interface GoogleSlidesCachedPage {
  readonly pageId: string;
  /** 다운로드 후 영구 file:// 경로 (LocalImageCacheRepository가 부여) */
  readonly imagePath: string;
}

export interface IGoogleSlidesPort {
  /**
   * 캐시 무효화 키. revisionId가 바뀌면 슬라이드 내용이 변경된 것 (Plan §3 F1-1).
   * @throws SlidesNotPublicError | SlidesQuotaExceededError | SlidesNetworkError
   */
  getRevisionId(presentationId: string): Promise<string>;

  /** 페이지별 단명 contentUrl 목록 조회 */
  getPageThumbnails(
    presentationId: string,
  ): Promise<readonly GoogleSlidesPageThumbnail[]>;

  /**
   * 단명 contentUrl을 즉시 다운로드해 영구 파일로 저장.
   * (revisionId, presentationId)를 캐시 키로 사용.
   *
   * 동시 다운로드 한도는 구현체 정책 (현재 max 4 권장).
   */
  downloadAndCache(
    presentationId: string,
    revisionId: string,
    pages: readonly GoogleSlidesPageThumbnail[],
  ): Promise<readonly GoogleSlidesCachedPage[]>;
}

// ─────────────────────────────────────────────────────────────
// Domain-level error types
// ─────────────────────────────────────────────────────────────

/** 공유 설정이 "뷰어"가 아니거나 비공개 프레젠테이션 */
export class SlidesNotPublicError extends Error {
  readonly code = 'slides-not-public' as const;
  constructor(public readonly presentationId: string) {
    super(`Google Slides not publicly shared: ${presentationId}`);
  }
}

/** API quota / rate limit 초과 */
export class SlidesQuotaExceededError extends Error {
  readonly code = 'slides-quota-exceeded' as const;
  constructor() {
    super('Google Slides API quota exceeded');
  }
}

/** 네트워크 오류 / 5xx */
export class SlidesNetworkError extends Error {
  readonly code = 'slides-network' as const;
  constructor(public readonly statusCode: number) {
    super(`Google Slides API network error (${statusCode})`);
  }
}
