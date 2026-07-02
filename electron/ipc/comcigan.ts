/**
 * 컴시간알리미 원본 fetch 위임 IPC — 메인 프로세스 전용.
 *
 * comci.net:4082 는 CORS 헤더가 없어 렌더러에서 직접 fetch 할 수 없다.
 * 메인이 바이트만 대신 받아 넘기고, EUC-KR 디코딩·라우트 추출·수업 코드 해석은
 * 전부 renderer(infrastructure/comcigan + domain/rules)가 담당한다.
 *
 * 보안: safeFetch 의 SSRF 방어(공인 IP 검증 + DNS 핀)를 거치고, 대상을
 * comci.net 호스트로 고정한다 — renderer 는 path 만 지정할 수 있다.
 */
import { ipcMain } from 'electron';
import { safeFetchBytes } from '../security/safeFetch';

const BASE = 'http://comci.net:4082';
const ALLOWED_HOSTS = ['comci.net'] as const;
const FETCH_TIMEOUT = 15_000;
const MAX_BYTES = 4 * 1024 * 1024; // 4MB — 학교 전체 시간표 JSON 상한

export type ComciganFetchResult =
  | { status: 'ok'; body: ArrayBuffer }
  | { status: 'error'; message: string };

export function registerComciganHandlers(): void {
  ipcMain.handle(
    'comcigan:fetch',
    async (_event, args: { path?: string }): Promise<ComciganFetchResult> => {
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
