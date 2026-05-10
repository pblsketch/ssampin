/**
 * 슬라이드 이미지 캐시 추상화 (Plan §3 + Design §5.4).
 *
 * 구현체(`LocalImageCacheRepository`)는 메인 프로세스에서 디스크 R/W.
 * 캐시 경로 정책: `userData/cache/slides/{presentationId}/{revisionId}/{pageId}.png`.
 */

export interface IImageCachePort {
  /** (presentationId, revisionId) 조합으로 캐시 존재 여부 확인 */
  exists(presentationId: string, revisionId: string): Promise<boolean>;

  /** 캐시된 페이지 파일 경로 목록 (file://) */
  list(
    presentationId: string,
    revisionId: string,
  ): Promise<readonly string[]>;

  /**
   * 다른 revisionId 폴더 정리. exceptRevisionId가 주어지면 그것만 보존.
   * (revisionId 변경 감지 시 호출 — 디스크 누적 방지)
   */
  invalidate(
    presentationId: string,
    exceptRevisionId?: string,
  ): Promise<void>;

  /**
   * PNG 바이트를 캐시 경로에 저장.
   * @returns 저장된 영구 file:// 경로
   * @throws DiskFullError
   */
  store(
    presentationId: string,
    revisionId: string,
    pageId: string,
    pngBytes: Uint8Array,
  ): Promise<string>;
}

/** 디스크 공간 부족 (ENOSPC) */
export class DiskFullError extends Error {
  readonly code = 'disk-full' as const;
  constructor() {
    super('Disk full while caching slide image');
  }
}
