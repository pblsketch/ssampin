import { ipcMain } from 'electron';
import { lookup } from 'dns/promises';
import net from 'net';

/**
 * 실시간 담벼락 학생 제출 링크의 OG 메타를 Main에서 서버사이드 fetch.
 *
 * 보안 방어 레이어:
 *   1. 프로토콜 화이트리스트 (http/https만)
 *   2. DNS lookup 결과의 IP를 private/loopback/link-local/reserved 대역 체크 → SSRF 차단
 *   3. 리다이렉트 비허용 (redirect chain을 통한 내부망 우회 방지)
 *   4. 3초 timeout
 *   5. 응답 크기 256KB cap (head만 파싱)
 *   6. Content-Type 화이트리스트 (text/html, application/xhtml+xml)
 *   7. 파싱 결과 길이 제한 (title 200자, description 500자)
 *   8. og:image는 URL 재검증 (http/https만) 후 반환
 */

const FETCH_TIMEOUT_MS = 3000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_TITLE_LEN = 200;
const MAX_DESCRIPTION_LEN = 500;

interface LinkPreviewResult {
  readonly ogTitle?: string;
  readonly ogDescription?: string;
  readonly ogImageUrl?: string;
}

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
  // ::1 loopback
  if (lower === '::1') return true;
  // ::
  if (lower === '::') return true;
  // fc00::/7 unique local
  if (/^f[cd][0-9a-f]{2}:/i.test(lower)) return true;
  // fe80::/10 link-local
  if (/^fe[89ab][0-9a-f]:/i.test(lower)) return true;
  // ff00::/8 multicast
  if (/^ff[0-9a-f]{2}:/i.test(lower)) return true;
  // ::ffff: IPv4-mapped → 해당 IPv4 재검증
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.slice(7);
    if (net.isIPv4(v4)) return isPrivateIP(v4);
    return true;
  }
  return false;
}

async function assertPublicHost(hostname: string): Promise<void> {
  // 호스트명 자체가 IP인 경우
  if (net.isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      throw new Error(`Blocked: private/reserved IP ${hostname}`);
    }
    return;
  }
  // .internal / localhost 등 명시적 내부 호스트 차단
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.internal') || lower.endsWith('.local')) {
    throw new Error(`Blocked: internal hostname ${hostname}`);
  }
  const records = await lookup(hostname, { all: true });
  for (const rec of records) {
    if (isPrivateIP(rec.address)) {
      throw new Error(`Blocked: resolves to private/reserved IP ${rec.address}`);
    }
  }
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

function extractMetaContent(html: string, property: string): string | undefined {
  // <meta property="og:title" content="..."> 또는 name="og:title" 지원
  // property/name 순서 무관, 속성 사이에 다른 속성 허용
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${property}["'][^>]*content\\s*=\\s*["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${property}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      return decodeHtmlEntities(m[1]).trim();
    }
  }
  return undefined;
}

function sanitizeImageUrl(raw: string | undefined, baseUrl: string): string | undefined {
  if (!raw) return undefined;
  try {
    const abs = new URL(raw, baseUrl);
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return undefined;
    return abs.toString();
  } catch {
    return undefined;
  }
}

function truncate(s: string | undefined, max: number): string | undefined {
  if (!s) return undefined;
  if (s.length <= max) return s;
  return s.slice(0, max);
}

async function fetchWebPagePreview(rawUrl: string): Promise<LinkPreviewResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Unsupported protocol');
  }

  await assertPublicHost(url.hostname);

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
    });

    // 리다이렉트 응답은 따라가지 않고 종료 — 프리뷰 없음으로 반환
    if (response.status >= 300 && response.status < 400) {
      return {};
    }
    if (!response.ok) {
      return {};
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!/^(text\/html|application\/xhtml\+xml)/i.test(contentType)) {
      return {};
    }

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

    // <head>까지만 파싱
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const scope = headMatch ? headMatch[1] : html.slice(0, MAX_RESPONSE_BYTES);

    const ogTitle = truncate(extractMetaContent(scope, 'og:title'), MAX_TITLE_LEN);
    const ogDescription = truncate(extractMetaContent(scope, 'og:description'), MAX_DESCRIPTION_LEN);
    const ogImageRaw = extractMetaContent(scope, 'og:image');
    const ogImageUrl = sanitizeImageUrl(ogImageRaw, url.toString());

    return {
      ...(ogTitle ? { ogTitle } : {}),
      ...(ogDescription ? { ogDescription } : {}),
      ...(ogImageUrl ? { ogImageUrl } : {}),
    };
  } finally {
    clearTimeout(timer);
  }
}

export function registerRealtimeWallLinkPreviewHandler(): void {
  ipcMain.handle(
    'realtime-wall:fetch-link-preview',
    async (_event, url: unknown): Promise<LinkPreviewResult | null> => {
      if (typeof url !== 'string' || url.length === 0 || url.length > 2048) return null;
      try {
        return await fetchWebPagePreview(url);
      } catch (error) {
        // 에러는 renderer에 노출하지 않음 (정보 누설 최소화). 단 Main 콘솔에는 기록.
        console.warn('[realtime-wall:fetch-link-preview] failed:', (error as Error).message);
        return null;
      }
    },
  );
}
