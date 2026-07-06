/**
 * Drive API 일시 오류(429 레이트리밋, 5xx 서버 오류) 재시도 정책.
 * DriveSyncAdapter가 사용하며, 판정 로직은 순수 함수로 분리해 단위 테스트한다.
 */

/** 최대 재시도 횟수 (최초 시도 제외) */
export const MAX_DRIVE_RETRIES = 3;

/** 재시도해 볼 가치가 있는 일시 오류인가 (429 / 5xx) */
export function isRetryableDriveStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * 재시도 대기 시간(ms).
 * - Retry-After 헤더(초)가 유효하면 그 값을 따르되 30초로 상한
 * - 없으면 지수 백오프: 500ms → 1s → 2s (8초 상한)
 */
export function computeDriveRetryDelayMs(
  attempt: number,
  retryAfterHeader?: string | null,
): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, 30_000);
    }
  }
  return Math.min(500 * 2 ** attempt, 8_000);
}
