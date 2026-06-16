/**
 * SSRF-안전 HTTP(S) 텍스트 페치 — 메인 프로세스 전용.
 *
 * `realtimeWallLinkPreview.ts` 의 검증된 9중 방어를 그대로 추출한 범용 모듈.
 * 담벼락 OG 미리보기(`realtimeWallLinkPreview.ts`)와 캘린더 구독(`calendar:fetch-url`)이
 * 동일한 방어를 공유한다.
 *
 * 방어 레이어:
 *   1. 프로토콜 화이트리스트 (http/https 만)
 *   2. DNS lookup 결과의 모든 A/AAAA 가 공인 IP 인지 검증 → SSRF 차단
 *      (private / loopback / link-local / CGNAT / multicast / reserved 대역 거부)
 *   3. **undici Agent IP 핀** — lookup 단계의 vetted IP 를 connect 단계에 강제
 *      → DNS rebinding(TOCTOU) 공격 방어
 *   4. 수동 리다이렉트 — 매 hop 마다 hostname 재검증 + 새 dispatcher (최대 N hop)
 *   5. timeout
 *   6. 응답 크기 cap (초과 시 스트림 중단)
 *   7. (선택) Content-Type 화이트리스트
 *   8. 내부 호스트명(localhost/.internal/.local 등) 직접 차단
 */
import { lookup } from 'dns/promises';
import net from 'net';
import { Agent } from 'undici';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 1024 * 1024; // 1 MiB
const DEFAULT_MAX_REDIRECTS = 3;

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

export interface SafeFetchOptions {
  /** 응답 본문 최대 바이트. 기본 1 MiB. 초과분은 잘려 들어옴(스트림 중단). */
  maxBytes?: number;
  /** 최대 리다이렉트 hop. 기본 3. */
  maxRedirects?: number;
  /** 연결/헤더/본문 각 단계 timeout(ms). 기본 30_000. */
  timeoutMs?: number;
  /**
   * 허용 Content-Type prefix 목록 (소문자, `;` 앞부분 비교). 미지정 시 검사 안 함.
   * 예: ['text/calendar', 'text/plain', 'application/octet-stream']
   */
  allowedContentTypes?: string[];
}

export function isPrivateIP(ip: string): boolean {
  if (!net.isIP(ip)) return true; // 파싱 실패는 안전측으로 차단

  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    // 10.0.0.0/8
    if (a === 10) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 127.0.0.0/8 loopback
    if (a === 127) return true;
    // 169.254.0.0/16 link-local
    if (a === 169 && b === 254) return true;
    // 0.0.0.0/8
    if (a === 0) return true;
    // 100.64.0.0/10 CGNAT
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 224.0.0.0/4 multicast
    if (a >= 224 && a <= 239) return true;
    // 240.0.0.0/4 reserved
    if (a >= 240) return true;
    return false;
  }

  // IPv6
  const lower = ip.toLowerCase();
  if (lower === '::1') return true;
  if (lower === '::') return true;
  // fc00::/7 unique local
  if (/^f[cd][0-9a-f]{2}:/i.test(lower)) return true;
  // fe80::/10 link-local
  if (/^fe[89ab][0-9a-f]:/i.test(lower)) return true;
  // ff00::/8 multicast
  if (/^ff[0-9a-f]{2}:/i.test(lower)) return true;
  // ::ffff: IPv4-mapped → IPv4 재검증
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.slice(7);
    if (net.isIPv4(v4)) return isPrivateIP(v4);
    return true;
  }
  return false;
}

export function normalizeHostname(hostname: string): string {
  // trailing dot 제거(DNS 는 정상 처리하지만 문자열 비교 우회 방지)
  return hostname.toLowerCase().replace(/\.+$/, '');
}

export interface VettedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

/**
 * 호스트명 lookup + 모든 IP 를 public 검증 + 첫 IP 를 핀으로 반환.
 * 내부망·예약 대역 감지 시 throw.
 */
export async function resolveAndVetHost(hostname: string): Promise<VettedAddress> {
  const canonical = normalizeHostname(hostname);

  if (net.isIP(canonical)) {
    if (isPrivateIP(canonical)) {
      throw new Error('Blocked: private or reserved IP');
    }
    return {
      address: canonical,
      family: net.isIPv4(canonical) ? 4 : 6,
    };
  }

  if (
    canonical === 'localhost' ||
    canonical.endsWith('.localhost') ||
    canonical.endsWith('.internal') ||
    canonical.endsWith('.local')
  ) {
    throw new Error('Blocked: internal hostname');
  }

  const records = await lookup(canonical, { all: true });
  if (records.length === 0) {
    throw new Error('Blocked: no DNS records');
  }
  for (const rec of records) {
    if (isPrivateIP(rec.address)) {
      throw new Error('Blocked: resolves to private or reserved IP');
    }
  }
  const first = records[0];
  return {
    address: first.address,
    family: first.family === 6 ? 6 : 4,
  };
}

/**
 * vetted IP 로 connect 를 강제하는 undici Agent. fetch() 가 내부적으로 재lookup 하더라도
 * 우리가 vetted 한 IP 로만 연결 (DNS rebinding 차단).
 *
 * undici@6 는 내부적으로 `lookup(host, { all: true }, cb)` 로 호출하므로 callback 에 array
 * 형태를 반환해야 함. opts.all 이 false 일 때는 single 시그니처 — 양쪽 모두 지원.
 */
export function pinDispatcher(vetted: VettedAddress, timeoutMs: number): Agent {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lookupFn = (_hostname: string, options: any, cb: any): void => {
    if (options && options.all) {
      cb(null, [{ address: vetted.address, family: vetted.family }]);
    } else {
      cb(null, vetted.address, vetted.family);
    }
  };
  return new Agent({
    connectTimeout: timeoutMs,
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connect: { lookup: lookupFn } as any,
  });
}

export interface SingleHopResult {
  status: number;
  location: string | null;
  contentType: string;
  /** 3xx / 비-2xx 면 null. */
  body: Uint8Array | null;
}

/**
 * 단일 hop fetch — vetted dispatcher 로 한 번만 GET. 리다이렉트는 호출자가 처리.
 * 각 hop 마다 새 hostname 재검증 + 새 dispatcher 로 SSRF 안전성 유지.
 *
 * @param acceptHeader Accept 헤더 (link-preview 와 캘린더가 다름)
 */
export async function fetchSingleHop(
  url: URL,
  timeoutMs: number,
  maxBytes: number,
  acceptHeader: string,
): Promise<SingleHopResult> {
  const vetted = await resolveAndVetHost(url.hostname);
  const dispatcher = pinDispatcher(vetted, timeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: acceptHeader,
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      // @ts-expect-error — undici dispatcher 는 Node fetch 확장 옵션
      dispatcher,
    });

    const contentType = response.headers.get('content-type') ?? '';
    const location = response.headers.get('location');

    // 3xx 는 본문 안 읽음 — 호출자가 location 따라감
    if (response.status >= 300 && response.status < 400) {
      return { status: response.status, location, contentType, body: null };
    }
    if (!response.ok) {
      return { status: response.status, location: null, contentType, body: null };
    }

    const reader = response.body?.getReader();
    if (!reader) return { status: response.status, location: null, contentType, body: null };

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
      if (total >= maxBytes) {
        await reader.cancel().catch(() => undefined);
        break;
      }
    }

    const buf = new Uint8Array(Math.min(total, maxBytes));
    let offset = 0;
    for (const c of chunks) {
      if (offset >= maxBytes) break;
      const slice = c.subarray(0, Math.min(c.byteLength, maxBytes - offset));
      buf.set(slice, offset);
      offset += slice.byteLength;
    }

    return { status: response.status, location: null, contentType, body: buf };
  } finally {
    clearTimeout(timer);
    dispatcher.close().catch(() => undefined);
  }
}

/**
 * 수동 리다이렉트를 따라가며 vetted dispatcher 로 GET. 본문(Uint8Array) + 최종 contentType 반환.
 * 3xx 가 maxRedirects 초과하거나 비-2xx 면 null.
 */
export async function fetchFollowingRedirects(
  rawUrl: string,
  opts: {
    timeoutMs: number;
    maxBytes: number;
    maxRedirects: number;
    acceptHeader: string;
  },
): Promise<{ body: Uint8Array; contentType: string; finalUrl: URL } | null> {
  let currentUrl: URL;
  try {
    currentUrl = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }
  if (currentUrl.protocol !== 'http:' && currentUrl.protocol !== 'https:') {
    throw new Error('Unsupported protocol');
  }

  let response: SingleHopResult | null = null;
  for (let hop = 0; hop <= opts.maxRedirects; hop++) {
    response = await fetchSingleHop(currentUrl, opts.timeoutMs, opts.maxBytes, opts.acceptHeader);
    if (response.status >= 300 && response.status < 400) {
      if (!response.location || hop === opts.maxRedirects) return null;
      let next: URL;
      try {
        next = new URL(response.location, currentUrl);
      } catch {
        return null;
      }
      if (next.protocol !== 'http:' && next.protocol !== 'https:') return null;
      currentUrl = next;
      continue;
    }
    break;
  }
  if (!response || !response.body) return null;
  return { body: response.body, contentType: response.contentType, finalUrl: currentUrl };
}

function contentTypeAllowed(contentType: string, allowed?: string[]): boolean {
  if (!allowed || allowed.length === 0) return true;
  const ct = contentType.toLowerCase().split(';')[0]!.trim();
  return allowed.some((a) => ct === a.toLowerCase());
}

/**
 * SSRF-안전 GET → UTF-8 텍스트 반환.
 *
 * - http/https 만, hostname → DNS resolve → 모든 A/AAAA 공인 IP 검증 → 그 IP 로 핀(DNS rebinding 차단)
 * - 최대 N hop(매 hop 재검증) → 응답 maxBytes 초과 시 중단 → (선택) content-type 화이트리스트
 * - 실패(차단·네트워크 에러·content-type 불일치·빈 응답) 시 throw — 호출부가 catch 해서 null 반환하는 식.
 */
export async function safeFetchText(rawUrl: string, opts?: SafeFetchOptions): Promise<string> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = opts?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > 4096) {
    throw new Error('Invalid URL');
  }

  const result = await fetchFollowingRedirects(rawUrl, {
    timeoutMs,
    maxBytes,
    maxRedirects,
    acceptHeader: 'text/calendar,text/plain,application/octet-stream,text/*;q=0.9,*/*;q=0.5',
  });
  if (!result) throw new Error('Empty or non-2xx response');
  if (!contentTypeAllowed(result.contentType, opts?.allowedContentTypes)) {
    throw new Error(`Disallowed content-type: ${result.contentType}`);
  }
  // ICS/텍스트는 UTF-8 가정 (한국 캘린더 서버 포함 — RFC 5545 권장 인코딩이 UTF-8).
  return new TextDecoder('utf-8', { fatal: false }).decode(result.body);
}

/* ──────────────── 바이너리/POST 페치 (safeFetchBytes) ──────────────── */

export interface SafeFetchBytesOptions {
  /** HTTP 메서드. 기본 GET. (POST 는 학교알리미 목록/검색 AJAX 용) */
  method?: 'GET' | 'POST';
  /** 요청 본문(POST 전용). x-www-form-urlencoded 등은 extraHeaders 로 Content-Type 지정. */
  body?: string | Uint8Array;
  /** 응답 본문 최대 바이트. 기본 1 MiB. 초과분은 잘려 들어옴(스트림 중단). */
  maxBytes?: number;
  /** 최대 리다이렉트 hop. 기본 3. */
  maxRedirects?: number;
  /** 연결/헤더/본문 각 단계 timeout(ms). 기본 30_000. */
  timeoutMs?: number;
  /** Accept 헤더. 기본 '*&#47;*'. */
  acceptHeader?: string;
  /** 추가 요청 헤더(Referer / X-Requested-With / Content-Type 등). */
  extraHeaders?: Record<string, string>;
  /**
   * 호스트 화이트리스트(소문자 정확 일치). 지정 시 매 hop 의 hostname 이 목록에 없으면 차단.
   * SSRF 방어(공인 IP 검증)에 더해, 외부 통신 대상을 알려진 호스트로 한정한다.
   */
  allowedHosts?: readonly string[];
  /** 허용 Content-Type prefix(소문자, `;` 앞 비교). 미지정 시 검사 안 함. */
  allowedContentTypes?: string[];
}

export interface SafeFetchBytesResult {
  readonly body: Uint8Array;
  readonly contentType: string;
  /** Content-Disposition 헤더 원문(있으면). 다운로드 파일명 추출용. */
  readonly contentDisposition: string | null;
  readonly finalUrl: string;
  readonly status: number;
}

/** 단일 hop — vetted dispatcher 로 method/body 를 보낸다. 리다이렉트는 호출자가 처리. */
async function fetchSingleHopBytes(
  url: URL,
  opts: {
    method: 'GET' | 'POST';
    body?: string | Uint8Array;
    timeoutMs: number;
    maxBytes: number;
    acceptHeader: string;
    extraHeaders?: Record<string, string>;
    allowedHosts?: readonly string[];
  },
): Promise<{
  status: number;
  location: string | null;
  contentType: string;
  contentDisposition: string | null;
  body: Uint8Array | null;
}> {
  // 호스트 화이트리스트 — DNS 조회/연결 전에 먼저 차단.
  if (opts.allowedHosts && opts.allowedHosts.length > 0) {
    const host = normalizeHostname(url.hostname);
    if (!opts.allowedHosts.some((h) => normalizeHostname(h) === host)) {
      throw new Error('Blocked: host not in allowlist');
    }
  }
  const vetted = await resolveAndVetHost(url.hostname);
  const dispatcher = pinDispatcher(vetted, opts.timeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    const headers: Record<string, string> = {
      'User-Agent': BROWSER_UA,
      Accept: opts.acceptHeader,
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      ...(opts.extraHeaders ?? {}),
    };
    const response = await fetch(url.toString(), {
      method: opts.method,
      redirect: 'manual',
      signal: controller.signal,
      headers,
      ...(opts.method === 'POST' && opts.body !== undefined ? { body: opts.body } : {}),
      // @ts-expect-error — undici dispatcher 는 Node fetch 확장 옵션
      dispatcher,
    });

    const contentType = response.headers.get('content-type') ?? '';
    const contentDisposition = response.headers.get('content-disposition');
    const location = response.headers.get('location');

    if (response.status >= 300 && response.status < 400) {
      return {
        status: response.status,
        location,
        contentType,
        contentDisposition: null,
        body: null,
      };
    }
    if (!response.ok) {
      return {
        status: response.status,
        location: null,
        contentType,
        contentDisposition: null,
        body: null,
      };
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return {
        status: response.status,
        location: null,
        contentType,
        contentDisposition,
        body: new Uint8Array(0),
      };
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < opts.maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
      if (total >= opts.maxBytes) {
        await reader.cancel().catch(() => undefined);
        break;
      }
    }

    const buf = new Uint8Array(Math.min(total, opts.maxBytes));
    let offset = 0;
    for (const c of chunks) {
      if (offset >= opts.maxBytes) break;
      const slice = c.subarray(0, Math.min(c.byteLength, opts.maxBytes - offset));
      buf.set(slice, offset);
      offset += slice.byteLength;
    }

    return { status: response.status, location: null, contentType, contentDisposition, body: buf };
  } finally {
    clearTimeout(timer);
    dispatcher.close().catch(() => undefined);
  }
}

/**
 * SSRF-안전 바이너리/POST 페치 — 메인 프로세스 전용.
 *
 * `safeFetchText` 와 동일한 SSRF 코어(`resolveAndVetHost`/`pinDispatcher`)를 재사용하되,
 * (1) GET 외 POST + body, (2) 호스트 화이트리스트, (3) 바이너리(Uint8Array) 반환,
 * (4) Content-Disposition 노출을 지원한다. 학교알리미 평가계획 목록(POST·EUC-KR HTML)과
 * 첨부파일 다운로드(GET·바이너리 ≤50MB)에 쓰인다.
 *
 * - http/https 만, 매 hop hostname 화이트리스트 + DNS resolve → 모든 A/AAAA 공인 IP 검증 → 핀(rebinding 차단)
 * - 최대 N hop(303/POST 리다이렉트는 GET 으로 전환), 응답 maxBytes 초과 시 중단
 * - 실패(차단·비-2xx·네트워크 에러) 시 throw — 호출부가 catch.
 */
export async function safeFetchBytes(
  rawUrl: string,
  opts?: SafeFetchBytesOptions,
): Promise<SafeFetchBytesResult> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = opts?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const acceptHeader = opts?.acceptHeader ?? '*/*';

  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > 4096) {
    throw new Error('Invalid URL');
  }

  let currentUrl: URL;
  try {
    currentUrl = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }
  if (currentUrl.protocol !== 'http:' && currentUrl.protocol !== 'https:') {
    throw new Error('Unsupported protocol');
  }

  let method: 'GET' | 'POST' = opts?.method ?? 'GET';
  let body = opts?.body;

  let hop = 0;
  for (;;) {
    const result = await fetchSingleHopBytes(currentUrl, {
      method,
      body,
      timeoutMs,
      maxBytes,
      acceptHeader,
      extraHeaders: opts?.extraHeaders,
      allowedHosts: opts?.allowedHosts,
    });

    if (result.status >= 300 && result.status < 400) {
      if (!result.location || hop >= maxRedirects) {
        throw new Error('Too many redirects or missing Location');
      }
      let next: URL;
      try {
        next = new URL(result.location, currentUrl);
      } catch {
        throw new Error('Invalid redirect target');
      }
      if (next.protocol !== 'http:' && next.protocol !== 'https:') {
        throw new Error('Unsupported redirect protocol');
      }
      // 303(See Other) 또는 POST 의 301/302 → GET 으로 전환하고 body 제거 (브라우저/HTTP 표준 동작)
      if (
        result.status === 303 ||
        (method === 'POST' && (result.status === 301 || result.status === 302))
      ) {
        method = 'GET';
        body = undefined;
      }
      currentUrl = next;
      hop++;
      continue;
    }

    if (result.status < 200 || result.status >= 300 || result.body === null) {
      throw new Error(`HTTP ${result.status}`);
    }
    if (!contentTypeAllowed(result.contentType, opts?.allowedContentTypes)) {
      throw new Error(`Disallowed content-type: ${result.contentType}`);
    }
    return {
      body: result.body,
      contentType: result.contentType,
      contentDisposition: result.contentDisposition,
      finalUrl: currentUrl.toString(),
      status: result.status,
    };
  }
}
