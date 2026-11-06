/**
 * IComciganPort 구현 — 컴시간알리미 공개 데이터 어댑터.
 *
 * comci.net:4082 는 CORS 헤더가 없어 렌더러 직접 fetch 가 불가능하다.
 * 통신은 Electron 메인('comcigan:fetch' IPC, safeFetch 경유)에 위임하고,
 * 브라우저 dev 모드에서는 Vite '/comcigan-api' 프록시를 쓴다.
 * 라우트 코드는 /st 페이지에서 정규식으로 추출한다 — 컴시간이 구조를 바꾸면
 * SERVICE_CHANGED 에러로 표면화되고, 앱은 엑셀/수동 입력 폴백으로 안내한다.
 * (정규식·해석 공식 실측: 2026-07-02)
 *
 * 2026-11 변경(실측 2026-11-06): 페이지 스크립트가 난독화되고(comciganPage), 검색·시간표
 * 응답이 암호화되며(comciganCipher), 검색 결과의 학교 번호가 가짜 숫자 사이에 섞여 온다.
 * 라우트 코드는 시간마다 바뀌어 옛 코드로 부르면 "." 같은 빈 응답이 오므로, 캐시된 코드로
 * 실패하면 페이지를 다시 읽어 한 번 더 시도한다. 학교 번호 자체는 예전과 같다.
 */
import type { IComciganPort } from '@domain/ports/IComciganPort';
import {
  ComciganError,
  type ComciganGrid,
  type ComciganRawSchoolData,
  type ComciganSchool,
} from '@domain/entities/ComciganTimetable';
import { encodeEucKrPercent } from './eucKr';
import { revealComciganScripts } from './comciganPage';
import { decryptComciganText } from './comciganCipher';

/** 원본 바이트 fetch 계층 — 테스트에서 픽스처로 대체 */
export interface ComciganTransport {
  fetchRaw(path: string): Promise<ArrayBuffer>;
}

/** /st 페이지에서 추출하는 라우트·자료 키 코드 */
interface ComciganRouteCodes {
  readonly mainRoute: string;
  readonly searchRoute: string;
  readonly timetableRoute: string;
  readonly teacherCode: string;
  readonly subjectCode: string;
  readonly baseGridCode: string;
  /**
   * 이번 주 일일자료(보강·교체 반영) 키. 없어도 기본 편성표 기능은 그대로 돌아가야 하므로
   * 필수 코드와 달리 못 찾아도 에러를 내지 않는다(null).
   */
  readonly dailyGridCode: string | null;
  /** 요청 끝에 붙이는 암호화 표식(예: '_enc2'). 옛 형식 페이지면 null */
  readonly encSuffix: string | null;
  /** 응답 복호화 열쇠(16진수). 옛 형식 페이지면 null */
  readonly cipherKeyHex: string | null;
  /** 검색 결과 행에서 진짜 학교 번호 칸 = floor(행[0] / divisor) + offset. 옛 형식이면 null(3번 칸) */
  readonly schoolCodeColumn: { readonly divisor: number; readonly offset: number } | null;
}

type RequiredRouteCode = Exclude<
  keyof ComciganRouteCodes,
  'dailyGridCode' | 'encSuffix' | 'cipherKeyHex' | 'schoolCodeColumn'
>;

const ENC_SUFFIX_REGEX = /(?<=\+')_enc\d+(?=')/;
const CIPHER_KEY_REGEX = /(?<=CryptoJS\.enc\.Hex\.parse\(')[0-9a-f]{64}(?=')/i;
const SCHOOL_CODE_COLUMN_REGEX = /Math\.floor\(학교명단\[i\]\[0\]\/(\d+)\)\+(\d+)/;
const LEGACY_SCHOOL_CODE_COLUMN = 3;

/** 선택 코드 — 2026-09-08 실측: `원자료=…자료481…;일일자료=…자료147…` */
const DAILY_GRID_REGEX = /(?<=일일자료=Q자료\(자료\.자료)\d+/;

const ROUTE_REGEXES: Record<RequiredRouteCode, RegExp> = {
  mainRoute: /(?<=\.\/)\d+(?=\?\d+l)/,
  searchRoute: /(?<=\?)\d+(?=l)/,
  timetableRoute: /(?<=')\d+(?=_')/,
  teacherCode: /(?<=Q성명\(자료\.자료)\d+/,
  subjectCode: /(?<=Q과목명\(자료\.자료)\d+/,
  baseGridCode: /(?<=원자료=Q자료\(자료\.자료)\d+/,
};

const ROUTE_CACHE_TTL_MS = 10 * 60 * 1000;

function createDefaultTransport(): ComciganTransport {
  return {
    async fetchRaw(path: string): Promise<ArrayBuffer> {
      const ipc = typeof window !== 'undefined' ? window.electronAPI?.comcigan : undefined;
      if (ipc) {
        const r = await ipc.fetchRaw(path);
        if (r.status === 'error') {
          throw new ComciganError('NETWORK_ERROR', r.message);
        }
        return r.body;
      }
      // 브라우저 dev 모드 — vite.config.ts 의 '/comcigan-api' 프록시 경유
      const res = await fetch(`/comcigan-api${path}`);
      if (!res.ok) {
        throw new ComciganError('NETWORK_ERROR', `HTTP ${res.status}`);
      }
      return res.arrayBuffer();
    },
  };
}

/** 컴시간 JSON 응답 끝의 \0 패딩 제거 */
function stripNullPadding(text: string): string {
  return text.replace(/\0+$/, '');
}

function parseSchoolCodeColumn(page: string): ComciganRouteCodes['schoolCodeColumn'] {
  const match = SCHOOL_CODE_COLUMN_REGEX.exec(page);
  const divisor = Number(match?.[1]);
  const offset = Number(match?.[2]);
  return match && divisor > 0 && Number.isInteger(offset) ? { divisor, offset } : null;
}

/** 검색 결과 한 행에서 진짜 학교 번호가 든 칸 위치 */
function schoolCodeIndex(
  row: readonly unknown[],
  column: ComciganRouteCodes['schoolCodeColumn'],
): number {
  if (!column) return LEGACY_SCHOOL_CODE_COLUMN;
  return Math.floor(Number(row[0]) / column.divisor) + column.offset;
}

export class ComciganApiClient implements IComciganPort {
  private readonly transport: ComciganTransport;
  private routeCache: { codes: ComciganRouteCodes; at: number } | null = null;

  constructor(transport?: ComciganTransport) {
    this.transport = transport ?? createDefaultTransport();
  }

  /** /st 페이지(EUC-KR)에서 라우트 코드 추출 (10분 캐시) */
  private async getRouteCodes(): Promise<ComciganRouteCodes> {
    if (this.routeCache && Date.now() - this.routeCache.at < ROUTE_CACHE_TTL_MS) {
      return this.routeCache.codes;
    }

    const buf = await this.transport.fetchRaw('/st');
    const rawPage = new TextDecoder('euc-kr').decode(buf);
    // 난독화된 스크립트를 풀어 앞에 두고, 옛 형식(평문 스크립트)도 그대로 읽히게 원문을 뒤에 둔다.
    const page = `${revealComciganScripts(rawPage)}\n${rawPage}`;

    const extracted: Partial<Record<RequiredRouteCode, string>> = {};
    for (const key of Object.keys(ROUTE_REGEXES) as RequiredRouteCode[]) {
      const match = ROUTE_REGEXES[key].exec(page);
      if (!match) {
        throw new ComciganError(
          'SERVICE_CHANGED',
          `컴시간 페이지에서 ${key} 코드를 찾지 못했어요.`,
        );
      }
      extracted[key] = match[0];
    }

    const codes: ComciganRouteCodes = {
      ...(extracted as Record<RequiredRouteCode, string>),
      dailyGridCode: DAILY_GRID_REGEX.exec(page)?.[0] ?? null,
      encSuffix: ENC_SUFFIX_REGEX.exec(page)?.[0] ?? null,
      cipherKeyHex: CIPHER_KEY_REGEX.exec(page)?.[0] ?? null,
      schoolCodeColumn: parseSchoolCodeColumn(page),
    };
    this.routeCache = { codes, at: Date.now() };
    return codes;
  }

  /**
   * 라우트 코드로 요청을 실행한다. 캐시된 코드로 응답 해석에 실패하면(컴시간이 코드를 바꾼 경우)
   * 페이지를 다시 읽어 한 번만 더 시도한다. 방금 읽은 코드로 실패하면 그대로 던진다.
   */
  private async withRouteCodes<T>(run: (codes: ComciganRouteCodes) => Promise<T>): Promise<T> {
    const fromCache =
      this.routeCache !== null && Date.now() - this.routeCache.at < ROUTE_CACHE_TTL_MS;
    try {
      return await run(await this.getRouteCodes());
    } catch (e) {
      if (!fromCache || !(e instanceof ComciganError) || e.errorType !== 'SERVICE_CHANGED') {
        throw e;
      }
      this.routeCache = null;
      return run(await this.getRouteCodes());
    }
  }

  private async fetchJson(
    path: string,
    codes: ComciganRouteCodes,
  ): Promise<Record<string, unknown>> {
    const buf = await this.transport.fetchRaw(path);
    const decoded = stripNullPadding(new TextDecoder('utf-8').decode(buf));
    const text = await decryptComciganText(decoded, codes.cipherKeyHex);
    // 페이지와 같이 마지막 '}' 뒤의 찌꺼기는 버린다
    const end = text.lastIndexOf('}');
    try {
      return JSON.parse(end > 0 ? text.slice(0, end + 1) : text) as Record<string, unknown>;
    } catch {
      throw new ComciganError('SERVICE_CHANGED', '컴시간 응답을 해석하지 못했어요.');
    }
  }

  async searchSchools(name: string): Promise<readonly ComciganSchool[]> {
    const trimmed = name.trim();
    if (!trimmed) return [];

    return this.withRouteCodes(async (codes) => {
      const { mainRoute, searchRoute, encSuffix, schoolCodeColumn } = codes;
      const json = await this.fetchJson(
        `/${mainRoute}?${searchRoute}l${encodeEucKrPercent(trimmed)}${encSuffix ?? ''}`,
        codes,
      );

      const rows = json['학교검색'];
      if (!Array.isArray(rows)) return [];

      return rows
        .filter((row): row is unknown[] => Array.isArray(row) && row.length >= 4)
        .map((row) => ({
          regionName: String(row[1] ?? ''),
          name: String(row[2] ?? ''),
          code: Number(row[schoolCodeIndex(row, schoolCodeColumn)]),
        }))
        .filter((school) => school.name !== '' && Number.isFinite(school.code) && school.code > 0);
    });
  }

  async getSchoolData(schoolCode: number): Promise<ComciganRawSchoolData> {
    return this.withRouteCodes((codes) => this.fetchSchoolData(schoolCode, codes));
  }

  private async fetchSchoolData(
    schoolCode: number,
    codes: ComciganRouteCodes,
  ): Promise<ComciganRawSchoolData> {
    const { mainRoute, timetableRoute, teacherCode, subjectCode, baseGridCode, dailyGridCode } =
      codes;

    // 쿼리는 "{라우트}_{학교코드}_0_1" 의 base64 (ASCII 전용이라 btoa 안전).
    // 암호화 형식은 끝에 표식('_enc2')을 붙이고 경로에서 '_T' 를 뺀다.
    const path = codes.encSuffix
      ? `/${mainRoute}?${btoa(`${timetableRoute}_${schoolCode}_0_1${codes.encSuffix}`)}`
      : `/${mainRoute}_T?${btoa(`${timetableRoute}_${schoolCode}_0_1`)}`;
    const json = await this.fetchJson(path, codes);

    const teachers = json[`자료${teacherCode}`];
    const subjects = json[`자료${subjectCode}`];
    const baseGrid = json[`자료${baseGridCode}`];
    if (!Array.isArray(teachers) || !Array.isArray(subjects) || !Array.isArray(baseGrid)) {
      throw new ComciganError('SERVICE_CHANGED', '컴시간 시간표 데이터 구조가 예상과 달라요.');
    }

    // 이번 주 일일자료 — 보강·교체가 반영된 격자. 원자료와 같은 좌표계([학년][반][요일][교시])이며
    // 바뀐 칸은 '>' 접두 코드로 온다. 없으면(코드 미발견·응답 누락) 기본 편성표만으로 진행한다.
    const dailyGridRaw = dailyGridCode ? json[`자료${dailyGridCode}`] : undefined;
    const dailyGrid = Array.isArray(dailyGridRaw) ? (dailyGridRaw as ComciganGrid) : undefined;

    const separatorRaw = json['분리'];
    // 교시별 시각(일과시간)은 학교가 입력하지 않았으면 미제공 — 있을 때만 통과시킨다.
    const dayTimesRaw = json['일과시간'];
    const dayTimes = Array.isArray(dayTimesRaw)
      ? dayTimesRaw.filter((t): t is string => typeof t === 'string')
      : undefined;
    return {
      schoolName: typeof json['학교명'] === 'string' ? json['학교명'] : '',
      teachers: teachers.map((t) => (typeof t === 'string' ? t : '')),
      subjects: subjects.map((s) => (typeof s === 'string' ? s : '')),
      separator: typeof separatorRaw === 'number' && separatorRaw > 0 ? separatorRaw : 100,
      baseGrid: baseGrid as ComciganGrid,
      ...(dailyGrid ? { dailyGrid } : {}),
      ...(dayTimes && dayTimes.length > 0 ? { dayTimes } : {}),
    };
  }
}
