/**
 * 학교 평가 운영계획 불러오기 IPC — 메인 프로세스 전용.
 *
 * 학교알리미(schoolinfo.go.kr)에 공시된 "교과별(학년별) 교수·학습 및 평가계획" hwp 첨부파일을
 * 자동으로 찾아 다운로드하고, 기존 마크다운 변환기(kordoc)로 파싱해 renderer 에 markdown 만 돌려준다.
 * 평가영역명 추출·루브릭 초안화는 renderer 측 순수 도메인 서비스가 담당한다(여기선 안 함).
 *
 * 이식 원본(참조 전용, MIT): schoolinfo-mcp `src/evaluation.ts` + `src/client.ts`.
 * 데이터 출처: 학교알리미 공공누리 제1유형.
 *
 * 보안:
 *  - 모든 외부 통신은 `security/safeFetch` 의 SSRF 방어(공인 IP 검증 + DNS 핀)를 거친다.
 *  - 호스트 화이트리스트(`www.schoolinfo.go.kr`)로 통신 대상을 한정한다.
 *  - 다운로드 ≤50MB. 목록/검색 응답 ≤4MB.
 *  - renderer 에는 파일 경로/원본 bytes 를 노출하지 않는다(파싱된 markdown 만 반환).
 */
import { ipcMain } from 'electron';
import iconv from 'iconv-lite';
import { safeFetchBytes } from '../security/safeFetch';
import { parseArrayBuffer } from './markdownConvert';

const BASE = 'https://www.schoolinfo.go.kr';
/** 통신 허용 호스트 — 평가계획·학교검색 모두 이 단일 호스트만 사용 */
const ALLOWED_HOSTS = ['www.schoolinfo.go.kr'] as const;

/** 전국 학교명 자동완성(공시포털 내부 AJAX) — 인증키 불필요, SHL_IDF_CD 확보 */
const NAME_SEARCH_URL = `${BASE}/ei/ss/pneiss_a04_s0/getSchoolList.do`;
const NAME_SEARCH_REFERER = `${BASE}/ei/ss/pneiss_a03_s0.do`;

const EVAL_LIST_REFERER = `${BASE}/ei/ss/Pneiss_b01_s0.do`;
/** 첨부파일 다운로드(GET) 엔드포인트 */
const FILE_DOWNLOAD_URL = `${BASE}/servlets/EiFileDownLoad.do`;

const FETCH_TIMEOUT = 20_000;
const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024; // 50MB
const MAX_LIST_BYTES = 4 * 1024 * 1024; // 4MB
/** downloadParams 캐시 TTL — 목록 조회 후 다운로드까지의 짧은 윈도우만 유효 */
const PARAMS_CACHE_TTL_MS = 10 * 60 * 1000; // 10분

/**
 * 학교알리미 공시항목별 고정 코드세트 (모든 학교 공통).
 * b01 페이지(`Pneiss_b01_s0.do?SHL_IDF_CD=`)의 hanmok 객체에서 확인.
 *  - evaluation: 교과별(학년별) 교수ㆍ학습 및 평가계획 → Pneipp_b43, getEiFile43
 *  - curriculum: 학교교육과정 편성ㆍ운영 및 평가(편제표) → Pneipp_b14, getEiFile14
 */
export type DisclosureItemKey = 'evaluation' | 'curriculum';

interface DisclosureItemConfig {
  readonly listUrl: string;
  /** getEiFile{cd}( 의 코드 — 첨부 목록 파싱용 */
  readonly fileFnCd: string;
  readonly form: Record<string, string>;
}

const DISCLOSURE_ITEMS: Record<DisclosureItemKey, DisclosureItemConfig> = {
  evaluation: {
    listUrl: `${BASE}/ei/pp/Pneipp_b43_s0p.do`,
    fileFnCd: '43',
    form: {
      GS_HANGMOK_CD: '43',
      GS_HANGMOK_NO: '4-가',
      GS_HANGMOK_NM: '교과별(학년별) 교수ㆍ학습 및 평가계획에 관한 사항',
      GS_BURYU_CD: 'JG110',
      JG_BURYU_CD: 'JG040',
      JG_HANGMOK_CD: '14',
      JG_GUBUN: '1',
    },
  },
  curriculum: {
    listUrl: `${BASE}/ei/pp/Pneipp_b14_s0p.do`,
    fileFnCd: '14',
    form: {
      GS_HANGMOK_CD: '14',
      GS_HANGMOK_NO: '2-가',
      GS_HANGMOK_NM: '학교교육과정 편성ㆍ운영 및 평가에 관한 사항',
      GS_BURYU_CD: 'JG100',
      JG_BURYU_CD: 'JG020',
      JG_HANGMOK_CD: '05',
      JG_GUBUN: '1',
    },
  },
};

function resolveItem(item?: string): DisclosureItemConfig {
  return item === 'curriculum' ? DISCLOSURE_ITEMS.curriculum : DISCLOSURE_ITEMS.evaluation;
}

/* ──────────────── renderer 반환 타입 (preload/global.d.ts 와 일치) ──────────────── */

export interface SchoolinfoSchoolHit {
  readonly shlIdfCd: string;
  readonly name: string;
  readonly address: string;
  readonly kind: string;
}

export interface SchoolinfoEvaluationDoc {
  readonly seq: string;
  readonly filename: string;
  readonly sizeKB?: number;
}

export type SchoolinfoSearchResult =
  | { status: 'ok'; hits: SchoolinfoSchoolHit[] }
  | { status: 'error'; message: string };

export type SchoolinfoListResult =
  | { status: 'ok'; docs: SchoolinfoEvaluationDoc[] }
  | { status: 'error'; message: string };

export type SchoolinfoDownloadResult =
  | {
      status: 'ok';
      fileName: string;
      markdown: string;
      isImageBased: boolean;
      /** isImageBased 또는 추출 품질 저하(needsReview) — 뷰어 폴백 신호 */
      needsOcr: boolean;
    }
  | { status: 'error'; code: string; message: string };

/* ──────────────── 학교 검색 (인증키 불필요) ──────────────── */

/** 학교명 전국 검색 — SHL_IDF_CD 까지 확보. searchSchoolsByName(client.ts) 이식. */
async function searchSchoolsByName(word: string, limit = 30): Promise<SchoolinfoSchoolHit[]> {
  const q = (word ?? '').trim().slice(0, 40);
  if (q.length < 2) return []; // 자동완성 최소 2자 (단일 글자 전국검색 폭주 방지)

  const result = await safeFetchBytes(NAME_SEARCH_URL, {
    method: 'POST',
    body: new URLSearchParams({ SEARCH_WORD: q }).toString(),
    maxBytes: MAX_LIST_BYTES,
    timeoutMs: FETCH_TIMEOUT,
    allowedHosts: ALLOWED_HOSTS,
    extraHeaders: {
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: NAME_SEARCH_REFERER,
    },
  });

  let list: unknown;
  try {
    list = JSON.parse(new TextDecoder('utf-8').decode(result.body));
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];

  const hits: SchoolinfoSchoolHit[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    if (hits.length >= limit) break;
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const shlIdfCd = r.SHL_IDF_CD != null ? String(r.SHL_IDF_CD) : '';
    const name = r.SHL_NM != null ? String(r.SHL_NM) : '';
    if (!shlIdfCd || !name || seen.has(shlIdfCd)) continue;
    seen.add(shlIdfCd);
    // 학교급: 코드 매핑이 없으므로 학교명 접미사로 추정 (표시용)
    let kind = '';
    if (name.endsWith('초등학교')) kind = '초등학교';
    else if (name.endsWith('중학교')) kind = '중학교';
    else if (name.endsWith('고등학교')) kind = '고등학교';
    hits.push({
      shlIdfCd,
      name,
      address: r.FULL_ADDR != null ? String(r.FULL_ADDR) : '',
      kind,
    });
  }
  return hits;
}

/* ──────────────── 평가계획 목록 (POST b43, EUC-KR) ──────────────── */

interface EvaluationListData {
  docs: SchoolinfoEvaluationDoc[];
  downloadParams: Record<string, string>;
}

async function fetchEvaluationList(
  shlIdfCd: string,
  schoolName: string,
  year: number,
  itemKey?: string,
): Promise<EvaluationListData> {
  if (!shlIdfCd) throw new Error('학교고유식별코드(SHL_IDF_CD)가 없습니다.');
  const item = resolveItem(itemKey);
  const body = new URLSearchParams({
    ...item.form,
    HG_NM: schoolName,
    SHL_IDF_CD: shlIdfCd,
    GS_TYPE: 'Y',
    JG_YEAR: String(year),
    SORT: 'BR',
    CHOSEN_JG_YEAR: String(year),
    PRE_JG_YEAR: String(year),
    LOAD_TYPE: 'single',
  });

  const result = await safeFetchBytes(item.listUrl, {
    method: 'POST',
    body: body.toString(),
    maxBytes: MAX_LIST_BYTES,
    timeoutMs: FETCH_TIMEOUT,
    allowedHosts: ALLOWED_HOSTS,
    extraHeaders: {
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: EVAL_LIST_REFERER,
    },
  });

  const html = iconv.decode(Buffer.from(result.body), 'euc-kr');
  const docs = sortDocs(parseFileList(html, item.fileFnCd));
  const downloadParams = parseDownloadParams(html, shlIdfCd, year, item);
  return { docs, downloadParams };
}

/** 첨부파일 목록 파싱: getEiFile{cd}('N') + 파일명.확장자(NN KB) */
function parseFileList(html: string, fileFnCd: string): SchoolinfoEvaluationDoc[] {
  const files: SchoolinfoEvaluationDoc[] = [];
  const seen = new Set<string>();
  const fn = `getEiFile${fileFnCd}`;
  const re = new RegExp(
    `onclick=["'][^"']*${fn}\\(\\s*['"]?(\\d+)['"]?\\s*\\)[^"']*["'][^>]*>\\s*([^<]*?\\.(?:hwpx|hwp|pdf|docx|xlsx))\\s*(?:\\(\\s*([\\d.,]+)\\s*([KM]B)\\s*\\))?`,
    'gi',
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (seen.has(m[1]!)) continue;
    seen.add(m[1]!);
    files.push({ seq: m[1]!, filename: m[2]!.trim(), sizeKB: toKB(m[3], m[4]) });
  }
  // 폴백: onclick 과 파일명이 분리된 비표준 구조 — 개수 일치 시에만 신뢰
  if (files.length === 0) {
    const seqs = [...html.matchAll(new RegExp(`${fn}\\(\\s*['"]?(\\d+)['"]?\\s*\\)`, 'g'))].map(
      (x) => x[1]!,
    );
    const names = [
      ...html.matchAll(
        /([^>\s][^<>]*?\.(?:hwpx|hwp|pdf|docx|xlsx))\s*(?:\(\s*([\d.,]+)\s*([KM]B)\s*\))?/gi,
      ),
    ];
    if (seqs.length > 0 && seqs.length === names.length) {
      seqs.forEach((seq, i) => {
        files.push({
          seq,
          filename: names[i]![1]!.trim(),
          sizeKB: toKB(names[i]![2], names[i]![3]),
        });
      });
    } else {
      // 최후 폴백: 파일명 없이 seq 만 (다운로드 후에도 표시 가능하도록 placeholder)
      seqs.forEach((seq) => {
        if (!seen.has(seq)) {
          seen.add(seq);
          files.push({ seq, filename: `첨부파일_${seq}` });
        }
      });
    }
  }
  return files;
}

/** "89","1,234"(KB) / "1.2"(MB) → KB 숫자 */
function toKB(num?: string, unit?: string): number | undefined {
  if (!num) return undefined;
  const n = parseFloat(num.replace(/,/g, ''));
  if (!isFinite(n)) return undefined;
  return /MB/i.test(unit ?? '') ? Math.round(n * 1024) : n;
}

/** 다운로드 폼 파라미터(eiFileDownForm hidden) 추출 + 필수값 보강 */
function parseDownloadParams(
  html: string,
  shlIdfCd: string,
  year: number,
  item: DisclosureItemConfig,
): Record<string, string> {
  const params: Record<string, string> = {};
  const formIdx = html.indexOf('eiFileDownForm');
  let seg = html;
  if (formIdx >= 0) {
    const end = html.indexOf('</form>', formIdx);
    seg = html.slice(formIdx, end >= 0 ? end : formIdx + 4096);
  }
  const re = /name="([A-Za-z_][A-Za-z0-9_]*)"[^>]*?value="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(seg))) {
    // 외부 HTML 추출 → 단순 토큰(코드/연도)만 신뢰
    if (!(m[1]! in params) && /^[\w.-]*$/.test(m[2]!)) params[m[1]!] = m[2]!;
  }
  params.SHL_IDF_CD ??= shlIdfCd;
  params.JG_BURYU_CD ??= item.form.JG_BURYU_CD!;
  params.JG_HANGMOK_CD ??= item.form.JG_HANGMOK_CD!;
  params.JG_GUBUN ??= item.form.JG_GUBUN!;
  params.JG_YEAR ??= String(year);
  params.JG_CHASU ??= '1';
  params.PRE_JG_YEAR ??= String(year);
  return params;
}

/** 파일명 기반 관련성 점수 (낮을수록 우선) — 편제표/평가계획 본문을 맨 앞으로 */
function evalScore(filename: string): number {
  if (/편제표|교육과정\s*편성/.test(filename)) return 0; // 편제표 항목
  if (/교수.?학습|평가\s*계획|평가\s*운영/.test(filename)) return 0; // 평가계획 항목
  if (/학업성적관리/.test(filename)) return 2;
  return 1;
}

/** 변환 가능한 문서만 남기고 수행평가 관련성 순으로 정렬 */
function sortDocs(files: SchoolinfoEvaluationDoc[]): SchoolinfoEvaluationDoc[] {
  const parseable = files.filter((f) => /\.(hwpx|hwp|pdf|docx)$/i.test(f.filename));
  const target = parseable.length ? parseable : files;
  return [...target].sort((a, b) => evalScore(a.filename) - evalScore(b.filename));
}

/* ──────────────── 첨부파일 다운로드 (GET, ≤50MB) ──────────────── */

async function downloadEvaluationFile(
  downloadParams: Record<string, string>,
  seq: string,
  refererUrl: string,
): Promise<{ buffer: ArrayBuffer; filename: string }> {
  if (!/^\d+$/.test(seq)) throw new Error('잘못된 파일 식별자입니다.');
  const qs = new URLSearchParams({ ...downloadParams, FILE_SEQ: seq });
  const result = await safeFetchBytes(`${FILE_DOWNLOAD_URL}?${qs.toString()}`, {
    method: 'GET',
    maxBytes: MAX_DOWNLOAD_BYTES,
    timeoutMs: FETCH_TIMEOUT,
    allowedHosts: ALLOWED_HOSTS,
    extraHeaders: { Referer: refererUrl },
  });

  const bytes = result.body;
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

  // Content-Disposition 에서 파일명(있으면)
  let filename = `evaluation_${seq}`;
  const cd = result.contentDisposition ?? '';
  const fm = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i);
  if (fm) {
    try {
      filename = decodeURIComponent(fm[1]!.trim());
    } catch {
      filename = fm[1]!.trim();
    }
  }
  return { buffer, filename };
}

/* ──────────────── downloadParams 캐시 (목록→다운로드 연결) ──────────────── */

interface CachedParams {
  params: Record<string, string>;
  at: number;
}
const paramsCache = new Map<string, CachedParams>();

function paramsKey(shlIdfCd: string, year: number, itemKey: string): string {
  return `${itemKey}:${shlIdfCd}:${year}`;
}

async function getDownloadParams(
  shlIdfCd: string,
  schoolName: string,
  year: number,
  itemKey: string,
): Promise<Record<string, string>> {
  const key = paramsKey(shlIdfCd, year, itemKey);
  const cached = paramsCache.get(key);
  if (cached && Date.now() - cached.at < PARAMS_CACHE_TTL_MS) {
    return cached.params;
  }
  const { downloadParams } = await fetchEvaluationList(shlIdfCd, schoolName, year, itemKey);
  paramsCache.set(key, { params: downloadParams, at: Date.now() });
  return downloadParams;
}

/* ──────────────── IPC 등록 ──────────────── */

export function registerSchoolinfoEvaluationHandlers(): void {
  // 학교명 전국 검색 → SHL_IDF_CD 확보
  ipcMain.handle(
    'schoolinfo-evaluation:search-schools',
    async (_event, args: { word: string }): Promise<SchoolinfoSearchResult> => {
      try {
        const hits = await searchSchoolsByName(args?.word ?? '');
        return { status: 'ok', hits };
      } catch (e) {
        return { status: 'error', message: e instanceof Error ? e.message : String(e) };
      }
    },
  );

  // 연도별 평가계획 첨부파일 목록 (downloadParams 는 main 캐시에 보관)
  ipcMain.handle(
    'schoolinfo-evaluation:list-docs',
    async (
      _event,
      args: { shlIdfCd: string; schoolName: string; year: number; item?: string },
    ): Promise<SchoolinfoListResult> => {
      try {
        const { docs, downloadParams } = await fetchEvaluationList(
          args.shlIdfCd,
          args.schoolName,
          args.year,
          args.item,
        );
        paramsCache.set(paramsKey(args.shlIdfCd, args.year, args.item ?? 'evaluation'), {
          params: downloadParams,
          at: Date.now(),
        });
        return { status: 'ok', docs };
      } catch (e) {
        return { status: 'error', message: e instanceof Error ? e.message : String(e) };
      }
    },
  );

  // 특정 첨부파일 다운로드 + kordoc 파싱 → markdown 반환
  ipcMain.handle(
    'schoolinfo-evaluation:download-doc',
    async (
      _event,
      args: { shlIdfCd: string; schoolName: string; year: number; seq: string; item?: string },
    ): Promise<SchoolinfoDownloadResult> => {
      try {
        const itemKey = args.item ?? 'evaluation';
        const params = await getDownloadParams(args.shlIdfCd, args.schoolName, args.year, itemKey);
        const { buffer, filename } = await downloadEvaluationFile(
          params,
          args.seq,
          resolveItem(itemKey).listUrl,
        );
        const parsed = await parseArrayBuffer(buffer, filename);
        if (parsed.status === 'canceled') {
          return { status: 'error', code: 'CANCELED', message: '다운로드가 취소되었습니다.' };
        }
        if (parsed.status === 'error') {
          return { status: 'error', code: parsed.code, message: parsed.message };
        }
        return {
          status: 'ok',
          fileName: parsed.fileName,
          markdown: parsed.markdown,
          isImageBased: parsed.isImageBased,
          needsOcr: parsed.isImageBased || parsed.textQuality?.needsReview === true,
        };
      } catch (e) {
        return {
          status: 'error',
          code: 'DOWNLOAD_FAILED',
          message: e instanceof Error ? e.message : String(e),
        };
      }
    },
  );
}
