/**
 * 컴시간알리미 원본 fetch 위임 IPC — 메인 프로세스 전용.
 *
 * comci.net:4082 는 CORS 헤더가 없어 렌더러에서 직접 fetch 할 수 없다.
 * 메인이 바이트만 대신 받아 넘기고, EUC-KR 디코딩·라우트 추출·수업 코드 해석은
 * 전부 renderer(infrastructure/comcigan + domain/rules)가 담당한다.
 *
 * 보안: safeFetch 의 SSRF 방어(공인 IP 검증 + DNS 핀)를 거치고, 대상을
 * comci.net 호스트로 고정한다 — renderer 는 path 와 요청 토큰만 지정할 수 있다.
 *
 * 2026-11-09 무렵부터 컴시간은 /st 페이지가 내려 준 **세션 쿠키**와 페이지에 심어 둔
 * **요청 토큰**(`X-Hour-Token`)을 검색·시간표 요청에 함께 받는다(브라우저가 하는 일 그대로).
 *  - 쿠키: /st 응답의 Set-Cookie 를 여기 메모리에만 들고 있다가 뒤이은 요청에 붙인다.
 *    디스크에 쓰지 않고, 다른 호스트로 나가지도 않는다(대상이 comci.net 고정).
 *  - 토큰: renderer 가 페이지에서 읽어 넘긴다. 형식(영숫자)만 확인해 머리말로 싣는다.
 */
import { ipcMain } from 'electron';
import { safeFetchBytes } from '../security/safeFetch';

const BASE = 'http://comci.net:4082';
const ALLOWED_HOSTS = ['comci.net'] as const;
const FETCH_TIMEOUT = 15_000;
const MAX_BYTES = 4 * 1024 * 1024; // 4MB — 학교 전체 시간표 JSON 상한
/** 세션을 여는 페이지 — 이 응답의 쿠키를 받아 둔다 */
const SESSION_PAGE_PATH = '/st';

const HOUR_TOKEN_REGEX = /^[0-9A-Za-z]{16,128}$/;
/** 쿠키 한 쌍(`이름=값`) — 머리말에 줄바꿈·구분자가 끼어들지 못하게 글자를 좁힌다 */
const COOKIE_PAIR_REGEX = /^[A-Za-z0-9_.-]{1,64}=[A-Za-z0-9_.%+/=-]{1,512}$/;
const MAX_COOKIES = 8;

export type ComciganFetchResult =
  | { status: 'ok'; body: ArrayBuffer }
  | { status: 'error'; message: string };

/** Set-Cookie 원문들에서 `이름=값` 쌍만 뽑는다(속성은 버린다). 형식이 어긋난 것은 버린다. */
export function parseSessionCookies(setCookie: readonly string[]): string[] {
  const pairs: string[] = [];
  for (const line of setCookie) {
    const pair = line.split(';')[0]?.trim() ?? '';
    if (COOKIE_PAIR_REGEX.test(pair)) pairs.push(pair);
    if (pairs.length >= MAX_COOKIES) break;
  }
  return pairs;
}

/** 요청에 덧붙일 머리말 — 세션 쿠키와 요청 토큰. /st 자체를 받을 때는 아무것도 붙이지 않는다. */
export function buildComciganHeaders(
  path: string,
  hourToken: unknown,
  sessionCookies: readonly string[],
): Record<string, string> {
  if (path === SESSION_PAGE_PATH) return {};
  const headers: Record<string, string> = { Referer: `${BASE}${SESSION_PAGE_PATH}` };
  if (sessionCookies.length > 0) headers['Cookie'] = sessionCookies.join('; ');
  if (typeof hourToken === 'string' && HOUR_TOKEN_REGEX.test(hourToken)) {
    headers['X-Hour-Token'] = hourToken;
  }
  return headers;
}

export function registerComciganHandlers(): void {
  /** /st 가 마지막으로 내려 준 세션 쿠키 — 메모리에만 둔다 */
  let sessionCookies: string[] = [];

  ipcMain.handle(
    'comcigan:fetch',
    async (_event, args: { path?: string; hourToken?: unknown }): Promise<ComciganFetchResult> => {
      try {
        const path = args?.path;
        if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
          return { status: 'error', message: '잘못된 요청 경로예요.' };
        }

        const url = new URL(path, BASE);
        if (url.origin !== BASE || url.protocol !== 'http:') {
          return { status: 'error', message: '허용되지 않은 주소예요.' };
        }

        const result = await safeFetchBytes(url.toString(), {
          method: 'GET',
          maxBytes: MAX_BYTES,
          timeoutMs: FETCH_TIMEOUT,
          allowedHosts: ALLOWED_HOSTS,
          acceptHeader: '*/*',
          extraHeaders: buildComciganHeaders(path, args?.hourToken, sessionCookies),
        });

        if (path === SESSION_PAGE_PATH) {
          // 새 페이지를 받았으면 세션도 새것이다 — 쿠키를 안 주는 옛 형식이면 비운다.
          sessionCookies = parseSessionCookies(result.setCookie);
        }

        const u8 = result.body;
        const body = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
        return { status: 'ok', body };
      } catch (e) {
        return { status: 'error', message: e instanceof Error ? e.message : String(e) };
      }
    },
  );
}
