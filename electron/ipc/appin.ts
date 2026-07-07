/**
 * 압핀(유원테크, www.sgpap.com) 원본 fetch 위임 IPC — 메인 프로세스 전용.
 *
 * sgpap.com 은 CORS 헤더가 없어 렌더러에서 직접 fetch 할 수 없다.
 * 메인이 바이트만 대신 받아 넘기고, EUC-KR 디코딩(정적 파일)·UTF-8 파싱(php 응답)·
 * 격자 해석은 전부 renderer(infrastructure/appin + domain/rules)가 담당한다.
 *
 * 보안: safeFetch 의 SSRF 방어(공인 IP 검증 + DNS 핀)를 거치고, 대상을
 * www.sgpap.com 호스트로 고정한다 — renderer 는 path/method/body 만 지정할 수 있다.
 * 정적 시간표 파일(GET)과 학교조회/원소표(POST form) 두 경로를 모두 지원한다.
 */
import { ipcMain } from 'electron';
import { safeFetchBytes } from '../security/safeFetch';

const BASE = 'http://www.sgpap.com';
const ALLOWED_HOSTS = ['www.sgpap.com'] as const;
const FETCH_TIMEOUT = 15_000;
const MAX_BYTES = 4 * 1024 * 1024; // 4MB — 시간표 파일/디렉터리 인덱스 상한

export type AppinFetchResult =
  | { status: 'ok'; body: ArrayBuffer }
  | { status: 'error'; message: string };

export function registerAppinHandlers(): void {
  ipcMain.handle(
    'appin:fetch',
    async (
      _event,
      args: { path?: string; method?: 'GET' | 'POST'; body?: string },
    ): Promise<AppinFetchResult> => {
      try {
        const path = args?.path;
        if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
          return { status: 'error', message: '잘못된 요청 경로예요.' };
        }

        const url = new URL(path, BASE);
        if (url.origin !== BASE || url.protocol !== 'http:') {
          return { status: 'error', message: '허용되지 않은 주소예요.' };
        }

        const method = args?.method === 'POST' ? 'POST' : 'GET';
        const result = await safeFetchBytes(url.toString(), {
          method,
          body: method === 'POST' ? (args?.body ?? '') : undefined,
          extraHeaders:
            method === 'POST'
              ? { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }
              : undefined,
          maxBytes: MAX_BYTES,
          timeoutMs: FETCH_TIMEOUT,
          allowedHosts: ALLOWED_HOSTS,
          acceptHeader: '*/*',
        });

        const u8 = result.body;
        const body = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
        return { status: 'ok', body };
      } catch (e) {
        return { status: 'error', message: e instanceof Error ? e.message : String(e) };
      }
    },
  );
}
