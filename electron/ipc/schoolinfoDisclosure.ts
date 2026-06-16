/**
 * 학교알리미 공시(OpenAPI) 조회 IPC — 메인 프로세스 전용.
 *
 * GET https://www.schoolinfo.go.kr/openApi.do
 *   (apiKey · apiType · schulKndCode · sidoCode · sggCode · pbanYr) → { resultCode, resultMsg, list }
 * list 는 해당 시·군·구 학교 전체 행 — 우리 학교 필터/옆학교 비교는 renderer(도메인)에서 처리.
 *
 * 보안: 모든 통신은 `security/safeFetch` 의 SSRF 방어(공인 IP 검증 + DNS 핀)를 거치고
 *       호스트 화이트리스트(www.schoolinfo.go.kr)로 대상을 한정한다.
 * 캐시: (항목·지역·학교급·연도) 단위 메모리 캐시(TTL) — 공시는 연 1회라 적중률 높음.
 *
 * 이식 참조(MIT): schoolinfo-mcp `src/client.ts`(`request`/`getAreaDisclosure`).
 * 데이터 출처: 학교알리미 공공누리 제1유형.
 */
import { ipcMain } from 'electron';
import { safeFetchBytes } from '../security/safeFetch';

const BASE = 'https://www.schoolinfo.go.kr/openApi.do';
const ALLOWED_HOSTS = ['www.schoolinfo.go.kr'] as const;
const FETCH_TIMEOUT = 15_000;
const MAX_BYTES = 8 * 1024 * 1024; // 8MB — 시군구 전체 학교 1개 항목 응답 상한
const CACHE_TTL_MS = 30 * 60 * 1000; // 30분

interface DisclosureArgs {
  apiKey: string;
  apiType: string;
  schulKndCode: string;
  sidoCode: string;
  sggCode: string;
  pbanYr: string;
}

export type SchoolinfoDisclosureResult =
  | { status: 'ok'; list: Record<string, unknown>[] }
  | { status: 'error'; message: string };

interface CachedList {
  at: number;
  list: Record<string, unknown>[];
}
const listCache = new Map<string, CachedList>();

function cacheKey(a: DisclosureArgs): string {
  return `${a.apiType}:${a.sidoCode}:${a.sggCode}:${a.schulKndCode}:${a.pbanYr}`;
}

async function fetchDisclosure(a: DisclosureArgs): Promise<Record<string, unknown>[]> {
  const url = new URL(BASE);
  url.searchParams.set('apiKey', a.apiKey);
  url.searchParams.set('apiType', a.apiType);
  url.searchParams.set('schulKndCode', a.schulKndCode);
  url.searchParams.set('sidoCode', a.sidoCode);
  url.searchParams.set('sggCode', a.sggCode);
  url.searchParams.set('pbanYr', a.pbanYr);

  const result = await safeFetchBytes(url.toString(), {
    method: 'GET',
    maxBytes: MAX_BYTES,
    timeoutMs: FETCH_TIMEOUT,
    allowedHosts: ALLOWED_HOSTS,
    acceptHeader: 'application/json,text/plain,*/*',
  });

  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder('utf-8').decode(result.body));
  } catch {
    throw new Error('학교알리미 응답을 해석하지 못했어요.');
  }
  const obj = json as { resultCode?: string; resultMsg?: string; list?: unknown };
  if (obj.resultCode !== 'success') {
    throw new Error(obj.resultMsg || '학교알리미 조회에 실패했어요.');
  }
  return Array.isArray(obj.list) ? (obj.list as Record<string, unknown>[]) : [];
}

export function registerSchoolinfoDisclosureHandlers(): void {
  ipcMain.handle(
    'schoolinfo-disclosure:get-area',
    async (_event, args: DisclosureArgs): Promise<SchoolinfoDisclosureResult> => {
      try {
        if (!args?.apiKey) {
          return { status: 'error', message: '학교알리미 인증키가 설정되지 않았어요.' };
        }
        if (
          !args.sidoCode ||
          !args.sggCode ||
          !args.schulKndCode ||
          !args.apiType ||
          !args.pbanYr
        ) {
          return { status: 'error', message: '조회에 필요한 지역·항목 정보가 부족해요.' };
        }
        const key = cacheKey(args);
        const cached = listCache.get(key);
        if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
          return { status: 'ok', list: cached.list };
        }
        const list = await fetchDisclosure(args);
        listCache.set(key, { at: Date.now(), list });
        return { status: 'ok', list };
      } catch (e) {
        return { status: 'error', message: e instanceof Error ? e.message : String(e) };
      }
    },
  );
}
