import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  describeFetchTarget,
  fetchWithTimeout,
  GOOGLE_TRANSFER_TIMEOUT_MS,
  GoogleFetchTimeoutError,
  readBodyWithTimeout,
  transferTimeoutForBytes,
} from '../fetchWithTimeout';

/** 실제 fetch 처럼 abort 신호에 AbortError 로 응답하되, 그 전에는 영영 끝나지 않는 요청. */
function hangingFetch(_input: string, init?: RequestInit): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      const err = new Error('The operation was aborted.');
      err.name = 'AbortError';
      reject(err);
    });
  });
}

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('제한시간이 지나면 응답 없는 요청을 끊고 한국어 오류로 알린다', async () => {
    vi.stubGlobal('fetch', vi.fn(hangingFetch));

    const pending = fetchWithTimeout('https://example.com/api', {}, 30_000);
    const asserted = expect(pending).rejects.toThrow(GoogleFetchTimeoutError);

    await vi.advanceTimersByTimeAsync(30_000);
    await asserted;
  });

  it('오류 메시지에 멈춘 주소와 제한시간을 초 단위로 담는다', async () => {
    vi.stubGlobal('fetch', vi.fn(hangingFetch));

    const pending = fetchWithTimeout('https://example.com/api', {}, 30_000);
    const asserted = expect(pending).rejects.toThrow(
      '응답 시간 초과 (30초): https://example.com/api',
    );

    await vi.advanceTimersByTimeAsync(30_000);
    await asserted;
  });

  it('정상 응답이면 그대로 돌려주고 타이머를 남기지 않는다', async () => {
    const response = new Response('ok');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response),
    );

    const result = await fetchWithTimeout('https://example.com/api', {}, 30_000);

    expect(result).toBe(response);
    // 타이머가 남으면 테스트/앱 모두에서 쓸데없이 살아 있는 핸들이 된다.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('호출자가 직접 취소한 것은 제한시간 초과로 둔갑시키지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(hangingFetch));
    const external = new AbortController();

    const pending = fetchWithTimeout(
      'https://example.com/api',
      { signal: external.signal },
      30_000,
    );
    const asserted = expect(pending).rejects.toThrow(/aborted/);
    external.abort();

    await asserted;
    await vi.advanceTimersByTimeAsync(30_000);
  });
});

describe('describeFetchTarget', () => {
  it('쿼리스트링을 떼어내 토큰이 오류 메시지로 새지 않게 한다', () => {
    // revoke 요청은 `?token=<액세스 토큰>` 형태다. 주소를 통째로 찍으면 그대로 유출된다.
    const target = describeFetchTarget(
      'https://oauth2.googleapis.com/revoke?token=ya29.SECRET_TOKEN_VALUE',
    );

    expect(target).toBe('https://oauth2.googleapis.com/revoke');
    expect(target).not.toContain('SECRET_TOKEN_VALUE');
  });

  it('주소 형식이 아니어도 물음표 뒤는 버린다', () => {
    expect(describeFetchTarget('/relative/path?token=SECRET')).toBe('/relative/path');
  });
});

describe('transferTimeoutForBytes', () => {
  it('작은 본문은 기본 상한을 그대로 쓴다', () => {
    expect(transferTimeoutForBytes(100_000)).toBe(GOOGLE_TRANSFER_TIMEOUT_MS);
  });

  it('큰 첨부는 상한을 늘려 정상 업로드가 잘리지 않게 한다', () => {
    // 관찰 첨부 상한 20MB → base64 래핑 후 약 26.7MB.
    // 고정 120초면 상향 1.8Mbps 가 꾸준히 나와야 성공한다(학교 와이파이에서 영구 실패).
    const wrapped = Math.ceil((20 * 1024 * 1024 * 4) / 3);
    const budget = transferTimeoutForBytes(wrapped);

    expect(budget).toBeGreaterThan(GOOGLE_TRANSFER_TIMEOUT_MS);
    // 20KB/s 만 나와도 끝낼 수 있어야 한다.
    expect(budget).toBeGreaterThanOrEqual((wrapped / 20_000) * 1_000);
  });

  it('상한이 무제한은 아니다', () => {
    expect(Number.isFinite(transferTimeoutForBytes(1_000_000_000))).toBe(true);
  });
});

describe('readBodyWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('본문이 오다 멈추면 끊는다 — 헤더만 지키면 다운로드는 무방비다', async () => {
    const stalled = (): Promise<string> => new Promise<string>(() => undefined);

    const pending = readBodyWithTimeout(stalled, 'https://example.com/files/abc', 30_000);
    const asserted = expect(pending).rejects.toThrow(GoogleFetchTimeoutError);

    await vi.advanceTimersByTimeAsync(30_000);
    await asserted;
  });

  it('정상적으로 읽히면 값을 그대로 주고 타이머를 남기지 않는다', async () => {
    const result = await readBodyWithTimeout(async () => ({ ok: true }), 'https://x/y', 30_000);

    expect(result).toEqual({ ok: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('본문 오류 메시지에도 쿼리스트링을 남기지 않는다', async () => {
    const stalled = (): Promise<string> => new Promise<string>(() => undefined);

    const pending = readBodyWithTimeout(stalled, 'https://x/y?token=SECRET', 1_000);
    const asserted = expect(pending).rejects.toThrow(/^(?!.*SECRET).*$/s);

    await vi.advanceTimersByTimeAsync(1_000);
    await asserted;
  });
});
