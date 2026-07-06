import { describe, it, expect } from 'vitest';
import { MAX_DRIVE_RETRIES, isRetryableDriveStatus, computeDriveRetryDelayMs } from '../driveRetry';

describe('driveRetry — Drive API 일시 오류 재시도 정책', () => {
  it('429와 5xx만 재시도 대상이다', () => {
    expect(isRetryableDriveStatus(429)).toBe(true);
    expect(isRetryableDriveStatus(500)).toBe(true);
    expect(isRetryableDriveStatus(502)).toBe(true);
    expect(isRetryableDriveStatus(503)).toBe(true);
    // 인증/권한/클라이언트 오류는 재시도해도 소용없다
    expect(isRetryableDriveStatus(400)).toBe(false);
    expect(isRetryableDriveStatus(401)).toBe(false);
    expect(isRetryableDriveStatus(403)).toBe(false);
    expect(isRetryableDriveStatus(404)).toBe(false);
    expect(isRetryableDriveStatus(200)).toBe(false);
  });

  it('Retry-After 헤더가 없으면 지수 백오프 (500ms → 1s → 2s, 8초 상한)', () => {
    expect(computeDriveRetryDelayMs(0)).toBe(500);
    expect(computeDriveRetryDelayMs(1)).toBe(1000);
    expect(computeDriveRetryDelayMs(2)).toBe(2000);
    expect(computeDriveRetryDelayMs(10)).toBe(8000); // 상한
  });

  it('Retry-After 헤더(초)를 존중하되 30초로 상한한다', () => {
    expect(computeDriveRetryDelayMs(0, '2')).toBe(2000);
    expect(computeDriveRetryDelayMs(0, '120')).toBe(30_000);
    expect(computeDriveRetryDelayMs(0, '0')).toBe(0);
  });

  it('Retry-After가 숫자가 아니면(HTTP-date 등) 지수 백오프로 폴백한다', () => {
    expect(computeDriveRetryDelayMs(1, 'Wed, 21 Oct 2026 07:28:00 GMT')).toBe(1000);
    expect(computeDriveRetryDelayMs(0, '-5')).toBe(500);
  });

  it('최대 재시도 횟수는 3회다', () => {
    expect(MAX_DRIVE_RETRIES).toBe(3);
  });
});
