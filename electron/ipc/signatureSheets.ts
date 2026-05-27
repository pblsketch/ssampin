/**
 * 서명받기: 공개 Google 시트의 CSV export를 Electron net으로 직접 fetch한다.
 *
 * 브라우저에서는 CORS로 차단되는 `docs.google.com/.../export?format=csv` 요청을
 * Electron main process에서 redirect를 따라가며 가져와 렌더러에 그대로 돌려준다.
 * 인증/토큰 없이 사용 — 공개 시트(링크가 있는 모든 사용자에게 보기 권한) 한정.
 *
 * Phase 2 OAuth 통합 전까지는 비공개 시트는 명확한 안내로 거부.
 */
import { ipcMain, net } from 'electron';
import { extractGoogleFileId } from '../../src/infrastructure/google/SignatureGoogleTemplatePlanner';

const MAX_CSV_BYTES = 2 * 1024 * 1024; // 2MB — 일반 학교 명단 시트 대비 충분
const FETCH_TIMEOUT_MS = 15000;
// Google Sheets export가 따라가는 redirect 호스트만 허용한다 (SSRF 방어).
const ALLOWED_REDIRECT_HOST_SUFFIXES = ['.google.com', '.googleusercontent.com'];

export interface FetchPublicSheetCsvResult {
  readonly ok: boolean;
  readonly csv?: string;
  readonly error?: string;
}

function redirectHostIsAllowed(redirectUrl: string): boolean {
  try {
    const parsed = new URL(redirectUrl);
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_REDIRECT_HOST_SUFFIXES.some(
      (suffix) => host === suffix.replace(/^\./, '') || host.endsWith(suffix),
    );
  } catch {
    return false;
  }
}

function buildCsvExportUrl(fileId: string, gid: string | null): string {
  const base = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(fileId)}/export?format=csv`;
  return gid ? `${base}&gid=${encodeURIComponent(gid)}` : base;
}

function extractGidFromUrl(input: string): string | null {
  try {
    const parsed = new URL(input.trim());
    const fromQuery = parsed.searchParams.get('gid');
    if (fromQuery) return fromQuery;
    const hashMatch = parsed.hash.match(/gid=([0-9]+)/);
    return hashMatch?.[1] ?? null;
  } catch {
    return null;
  }
}

async function fetchCsvBody(initialUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Electron net이 redirect를 자동으로 follow하되, 'redirect' 이벤트에서 호스트를
    // 검증해 허용된 Google 도메인을 벗어나면 abort한다.
    const request = net.request({ method: 'GET', url: initialUrl, redirect: 'follow' });
    const timeout = setTimeout(() => {
      request.abort();
      reject(new Error('요청 시간이 초과됐습니다.'));
    }, FETCH_TIMEOUT_MS);

    request.on('redirect', (_status, _method, redirectUrl) => {
      if (!redirectHostIsAllowed(redirectUrl)) {
        request.abort();
        clearTimeout(timeout);
        reject(new Error('허용되지 않은 호스트로 redirect되어 요청을 중단했습니다.'));
        return;
      }
      request.followRedirect();
    });

    request.on('response', (response) => {
      const status = response.statusCode ?? 0;
      if (status === 401 || status === 403) {
        clearTimeout(timeout);
        request.abort();
        reject(
          new Error(
            '시트에 접근할 수 없습니다. Google 시트의 공유 설정을 "링크가 있는 모든 사용자에게 보기 권한"으로 바꾸거나, 다음 버전의 Google 로그인 연동을 기다려 주세요.',
          ),
        );
        return;
      }
      if (status === 404) {
        clearTimeout(timeout);
        request.abort();
        reject(new Error('해당 ID의 시트를 찾을 수 없습니다. URL을 다시 확인해 주세요.'));
        return;
      }
      if (status !== 200) {
        clearTimeout(timeout);
        request.abort();
        reject(new Error(`시트를 가져오지 못했습니다. (HTTP ${status})`));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      response.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_CSV_BYTES) {
          request.abort();
          clearTimeout(timeout);
          reject(new Error('시트 응답이 너무 큽니다 (2MB 초과).'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        clearTimeout(timeout);
        resolve(Buffer.concat(chunks).toString('utf-8'));
      });
      response.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    request.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    request.end();
  });
}

const ALLOWED_INPUT_HOSTS = new Set(['docs.google.com', 'drive.google.com']);

function inputUrlIsAllowedHost(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return ALLOWED_INPUT_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export async function fetchPublicSheetCsvImpl(url: string): Promise<FetchPublicSheetCsvResult> {
  if (!inputUrlIsAllowedHost(url)) {
    return {
      ok: false,
      error:
        'docs.google.com 또는 drive.google.com 호스트의 URL만 지원합니다. Google Sheets 공유 링크를 그대로 붙여 넣어 주세요.',
    };
  }
  const fileId = extractGoogleFileId(url);
  if (!fileId) {
    return {
      ok: false,
      error:
        'Google Sheets URL에서 시트 ID를 찾지 못했습니다. /d/{시트ID}/ 형식인지 확인해 주세요.',
    };
  }
  const gid = extractGidFromUrl(url);
  const csvUrl = buildCsvExportUrl(fileId, gid);
  try {
    const csv = await fetchCsvBody(csvUrl);
    return { ok: true, csv };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export function registerSignatureSheetsHandlers(): void {
  ipcMain.handle(
    'signature:fetch-public-sheet-csv',
    async (_event, payload: { url?: string }): Promise<FetchPublicSheetCsvResult> => {
      const url = typeof payload?.url === 'string' ? payload.url : '';
      if (!url.trim()) {
        return { ok: false, error: 'URL이 비어 있습니다.' };
      }
      return fetchPublicSheetCsvImpl(url);
    },
  );
}
