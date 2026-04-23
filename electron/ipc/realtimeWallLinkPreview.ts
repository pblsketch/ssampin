import { ipcMain } from 'electron';
import { lookup } from 'dns/promises';
import net from 'net';
import { Agent } from 'undici';
import type { RealtimeWallLinkPreviewOgMeta } from '../../src/domain/entities/RealtimeWall';

/**
 * 실시간 담벼락 학생 제출 링크의 OG 메타를 Main에서 서버사이드 fetch.
 *
 * 보안 방어 레이어:
 *   1. 프로토콜 화이트리스트 (http/https만)
 *   2. DNS lookup 결과 IP를 private/loopback/link-local/reserved 대역 체크 → SSRF 차단
 *   3. **undici Agent IP 핀** — lookup 단계의 vetted IP를 connect 단계에 강제
 *      → DNS rebinding(TOCTOU) 공격 방어
 *   4. Redirect 비허용 (redirect chain을 통한 내부망 우회 방지)
 *   5. 3초 timeout
 *   6. 응답 크기 256KB cap (head만 파싱)
 *   7. Content-Type 화이트리스트 (text/html, application/xhtml+xml)
 *   8. 파싱 결과 길이 제한 + bidi/제어 문자 제거
 *   9. og:image 절대 URL 변환 후 **호스트명 재검증** — renderer `<img>`가
 *      내부망 IP에 연결하는 secondary SSRF 차단
 */

const FETCH_TIMEOUT_MS = 3000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_TITLE_LEN = 200;
const MAX_DESCRIPTION_LEN = 500;

function isPrivateIP(ip: string): boolean {
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

function normalizeHostname(hostname: string): string {
  // trailing dot 제거(DNS는 정상 처리하지만 문자열 비교 우회 방지)
  return hostname.toLowerCase().replace(/\.+$/, '');
}

interface VettedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

/**
 * 호스트명 lookup + 모든 IP를 public 검증 + 첫 IP를 핀으로 반환.
 * 내부망·예약 대역 감지 시 throw.
 */
async function resolveAndVetHost(hostname: string): Promise<VettedAddress> {
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
 * vetted IP로 connect를 강제하는 undici Agent. fetch()가 내부적으로
 * 재lookup하더라도 우리가 vetted한 IP로만 연결.
 */
function pinDispatcher(vetted: VettedAddress): Agent {
  return new Agent({
    connectTimeout: FETCH_TIMEOUT_MS,
    headersTimeout: FETCH_TIMEOUT_MS,
    bodyTimeout: FETCH_TIMEOUT_MS,
    connect: {
      lookup: (_hostname, _options, cb) => {
        cb(null, vetted.address, vetted.family);
      },
    },
  });
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCharCode(parseInt(hex as string, 16)));
}

/**
 * 파싱된 OG 문자열에서 bidi override / zero-width / 제어문자 제거.
 * UI에서 텍스트 주입 혼란 방지.
 */
function sanitizeText(s: string): string {
  return s
    // C0/C1 제어 문자 (탭·개행 제외)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
    // bidi override: LRO, RLO, PDF, LRI, RLI, FSI, PDI
    .replace(/[‪-‮⁦-⁩]/g, '')
    // zero-width
    .replace(/[​-‏﻿]/g, '')
    .trim();
}

function extractMetaContent(html: string, property: string): string | undefined {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)\\s*=\\s*["']${property}["'][^>]*content\\s*=\\s*["']([^"']*)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${property}["']`,
      'i',
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      return sanitizeText(decodeHtmlEntities(m[1]));
    }
  }
  return undefined;
}

async function sanitizeImageUrl(
  raw: string | undefined,
  baseUrl: string,
): Promise<string | undefined> {
  if (!raw) return undefined;
  let abs: URL;
  try {
    abs = new URL(raw, baseUrl);
  } catch {
    return undefined;
  }
  if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return undefined;
  // og:image 호스트도 private/내부망이면 거부 — renderer <img>가 내부 IP로
  // 연결하는 secondary SSRF 차단.
  try {
    await resolveAndVetHost(abs.hostname);
  } catch {
    return undefined;
  }
  return abs.toString();
}

function truncate(s: string | undefined, max: number): string | undefined {
  if (!s) return undefined;
  if (s.length <= max) return s;
  return s.slice(0, max);
}

async function fetchWebPagePreview(rawUrl: string): Promise<RealtimeWallLinkPreviewOgMeta> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Unsupported protocol');
  }

  const vetted = await resolveAndVetHost(url.hostname);
  const dispatcher = pinDispatcher(vetted);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'User-Agent': 'SsamPin Link Preview',
        Accept: 'text/html,application/xhtml+xml',
      },
      // @ts-expect-error — undici dispatcher는 Node fetch 확장 옵션
      dispatcher,
    });

    if (response.status >= 300 && response.status < 400) return {};
    if (!response.ok) return {};

    const contentType = response.headers.get('content-type') ?? '';
    if (!/^(text\/html|application\/xhtml\+xml)/i.test(contentType)) return {};

    const reader = response.body?.getReader();
    if (!reader) return {};

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_RESPONSE_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
      if (total >= MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        break;
      }
    }

    const buf = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      buf.set(c.subarray(0, Math.min(c.byteLength, MAX_RESPONSE_BYTES - offset)), offset);
      offset += c.byteLength;
      if (offset >= MAX_RESPONSE_BYTES) break;
    }
    const html = new TextDecoder('utf-8', { fatal: false }).decode(buf);

    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const scope = headMatch ? headMatch[1] : html.slice(0, MAX_RESPONSE_BYTES);

    const ogTitle = truncate(extractMetaContent(scope, 'og:title'), MAX_TITLE_LEN);
    const ogDescription = truncate(extractMetaContent(scope, 'og:description'), MAX_DESCRIPTION_LEN);
    const ogImageRaw = extractMetaContent(scope, 'og:image');
    const ogImageUrl = await sanitizeImageUrl(ogImageRaw, url.toString());

    return {
      ...(ogTitle ? { ogTitle } : {}),
      ...(ogDescription ? { ogDescription } : {}),
      ...(ogImageUrl ? { ogImageUrl } : {}),
    };
  } finally {
    clearTimeout(timer);
    dispatcher.close().catch(() => undefined);
  }
}

export function registerRealtimeWallLinkPreviewHandler(): void {
  ipcMain.handle(
    'realtime-wall:fetch-link-preview',
    async (_event, url: unknown): Promise<RealtimeWallLinkPreviewOgMeta | null> => {
      if (typeof url !== 'string' || url.length === 0 || url.length > 2048) return null;
      try {
        return await fetchWebPagePreview(url);
      } catch {
        // 에러 내용은 renderer·콘솔 어디에도 남기지 않음 — SSRF 정탐 타이밍
        // 오라클 + 내부 호스트명 로그 누설 방지.
        return null;
      }
    },
  );
}
