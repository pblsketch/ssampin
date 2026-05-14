import { ipcMain } from 'electron';
import ogs from 'open-graph-scraper';
import type { RealtimeWallLinkPreviewOgMeta } from '../../src/domain/entities/RealtimeWall';
import { fetchSingleHop, resolveAndVetHost } from '../security/safeFetch';

/**
 * 실시간 담벼락 학생 제출 링크의 OG 메타를 Main에서 서버사이드 fetch.
 *
 * 보안 방어 레이어:
 *   1~5. http/https 화이트리스트 · SSRF IP 검증 · undici IP 핀(DNS rebinding 차단) ·
 *        수동 리다이렉트(매 hop 재검증) · timeout — 전부 `../security/safeFetch.ts` 에서 공유
 *   6. 응답 크기 256KB cap (head만 파싱)
 *   7. Content-Type 화이트리스트 (text/html, application/xhtml+xml)
 *   8. 파싱 결과 길이 제한 + bidi/제어 문자 제거
 *   9. og:image 절대 URL 변환 후 **호스트명 재검증** — renderer `<img>`가
 *      내부망 IP에 연결하는 secondary SSRF 차단
 *
 * 네트워크 fetch 부분(1~5, 256KB cap)은 `safeFetch.ts` 의 `fetchSingleHop` 을 재사용한다.
 * link-preview 전용(OG/charset/이미지 sanitize)은 이 파일에 잔류.
 */

const FETCH_TIMEOUT_MS = 3000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_TITLE_LEN = 200;
const MAX_DESCRIPTION_LEN = 500;
const MAX_REDIRECTS = 3;
const HTML_ACCEPT =
  'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

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

/**
 * Content-Type 헤더와 HTML `<meta charset>`에서 인코딩 추출.
 * 한국어 사이트(EUC-KR, CP949 등) 대응.
 */
function detectCharset(contentType: string, htmlHead: Uint8Array): string {
  const ctMatch = contentType.match(/charset\s*=\s*"?([^\s;"]+)/i);
  if (ctMatch && ctMatch[1]) return ctMatch[1].toLowerCase();
  // <meta charset="..."> or <meta http-equiv="Content-Type" content="text/html;charset=...">
  const head = new TextDecoder('utf-8', { fatal: false }).decode(htmlHead.subarray(0, 2048));
  const metaCharset = head.match(/<meta[^>]+charset\s*=\s*["']?([^"'\s>]+)/i);
  if (metaCharset && metaCharset[1]) return metaCharset[1].toLowerCase();
  return 'utf-8';
}

function safeDecode(buf: Uint8Array, charset: string): string {
  // Node의 TextDecoder는 ICU를 통해 euc-kr/cp949 등 다수 인코딩 지원.
  // 실패 시 UTF-8 폴백.
  try {
    return new TextDecoder(charset, { fatal: false }).decode(buf);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(buf);
  }
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
  let currentUrl: URL;
  try {
    currentUrl = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }
  if (currentUrl.protocol !== 'http:' && currentUrl.protocol !== 'https:') {
    throw new Error('Unsupported protocol');
  }

  // 수동 리다이렉트 — 각 hop마다 신규 hostname 재검증 (SSRF 방어 유지, safeFetch.fetchSingleHop)
  let response: Awaited<ReturnType<typeof fetchSingleHop>> | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    response = await fetchSingleHop(currentUrl, FETCH_TIMEOUT_MS, MAX_RESPONSE_BYTES, HTML_ACCEPT);
    if (response.status >= 300 && response.status < 400) {
      if (!response.location || hop === MAX_REDIRECTS) return {};
      let next: URL;
      try {
        next = new URL(response.location, currentUrl);
      } catch {
        return {};
      }
      if (next.protocol !== 'http:' && next.protocol !== 'https:') return {};
      currentUrl = next;
      continue;
    }
    break;
  }
  if (!response || !response.body) return {};

  if (!/^(text\/html|application\/xhtml\+xml)/i.test(response.contentType)) return {};

  const charset = detectCharset(response.contentType, response.body);
  const html = safeDecode(response.body, charset);

  // open-graph-scraper로 HTML 파싱 — og/twitter/dc/jsonld/<title> 모든 fallback 자동
  // (97k+ weekly DL · 10년 maintenance, 우리 자체 정규식보다 훨씬 견고)
  let parsed: Awaited<ReturnType<typeof ogs>>;
  try {
    parsed = await ogs({ html });
  } catch {
    return {};
  }
  if (parsed.error) return {};
  const result = parsed.result;

  // 우선순위: ogTitle → twitterTitle → dcTitle → <title> (ogs가 .ogTitle에 fallback 채워줌)
  const rawTitle =
    result.ogTitle ||
    result.twitterTitle ||
    result.dcTitle ||
    (result as { title?: string }).title;
  const ogTitle = truncate(rawTitle ? sanitizeText(rawTitle) : undefined, MAX_TITLE_LEN);

  const rawDesc =
    result.ogDescription ||
    result.twitterDescription ||
    result.dcDescription ||
    (result as { description?: string }).description;
  const ogDescription = truncate(
    rawDesc ? sanitizeText(rawDesc) : undefined,
    MAX_DESCRIPTION_LEN,
  );

  // ogImage / twitterImage는 배열 형태 ({ url, width?, height?, type? }[])
  const firstImage =
    result.ogImage?.[0]?.url ||
    result.twitterImage?.[0]?.url;
  const ogImageUrl = await sanitizeImageUrl(firstImage, currentUrl.toString());

  return {
    ...(ogTitle ? { ogTitle } : {}),
    ...(ogDescription ? { ogDescription } : {}),
    ...(ogImageUrl ? { ogImageUrl } : {}),
  };
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
