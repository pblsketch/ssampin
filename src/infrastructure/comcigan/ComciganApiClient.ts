/**
 * IComciganPort 구현 — 컴시간알리미 공개 데이터 어댑터.
 *
 * comci.net:4082 는 CORS 헤더가 없어 렌더러 직접 fetch 가 불가능하다.
 * 통신은 Electron 메인('comcigan:fetch' IPC, safeFetch 경유)에 위임하고,
 * 브라우저 dev 모드에서는 Vite '/comcigan-api' 프록시를 쓴다.
 * 라우트 코드는 /st 페이지에서 정규식으로 추출한다 — 컴시간이 구조를 바꾸면
 * SERVICE_CHANGED 에러로 표면화되고, 앱은 엑셀/수동 입력 폴백으로 안내한다.
 * (정규식·해석 공식 실측: 2026-07-02)
 */
import type { IComciganPort } from '@domain/ports/IComciganPort';
import {
  ComciganError,
  type ComciganGrid,
  type ComciganRawSchoolData,
  type ComciganSchool,
} from '@domain/entities/ComciganTimetable';
import { encodeEucKrPercent } from './eucKr';

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
}

const ROUTE_REGEXES: Record<keyof ComciganRouteCodes, RegExp> = {
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
    const page = new TextDecoder('euc-kr').decode(buf);

    const extracted: Partial<Record<keyof ComciganRouteCodes, string>> = {};
    for (const key of Object.keys(ROUTE_REGEXES) as (keyof ComciganRouteCodes)[]) {
      const match = ROUTE_REGEXES[key].exec(page);
      if (!match) {
        throw new ComciganError(
          'SERVICE_CHANGED',
          `컴시간 페이지에서 ${key} 코드를 찾지 못했어요.`,
        );
      }
      extracted[key] = match[0];
    }

    const codes = extracted as ComciganRouteCodes;
    this.routeCache = { codes, at: Date.now() };
    return codes;
  }

  private async fetchJson(path: string): Promise<Record<string, unknown>> {
    const buf = await this.transport.fetchRaw(path);
    const text = stripNullPadding(new TextDecoder('utf-8').decode(buf));
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new ComciganError('SERVICE_CHANGED', '컴시간 응답을 해석하지 못했어요.');
    }
  }

  async searchSchools(name: string): Promise<readonly ComciganSchool[]> {
    const trimmed = name.trim();
    if (!trimmed) return [];

    const { mainRoute, searchRoute } = await this.getRouteCodes();
    const json = await this.fetchJson(
      `/${mainRoute}?${searchRoute}l${encodeEucKrPercent(trimmed)}`,
    );

    const rows = json['학교검색'];
    if (!Array.isArray(rows)) return [];

    return rows
      .filter((row): row is unknown[] => Array.isArray(row) && row.length >= 4)
      .map((row) => ({
        regionName: String(row[1] ?? ''),
        name: String(row[2] ?? ''),
        code: Number(row[3]),
      }))
      .filter((school) => school.name !== '' && Number.isFinite(school.code) && school.code > 0);
  }

  async getSchoolData(schoolCode: number): Promise<ComciganRawSchoolData> {
    const { mainRoute, timetableRoute, teacherCode, subjectCode, baseGridCode } =
      await this.getRouteCodes();

    // 쿼리는 "{라우트}_{학교코드}_0_1" 의 base64 (ASCII 전용이라 btoa 안전)
    const query = btoa(`${timetableRoute}_${schoolCode}_0_1`);
    const json = await this.fetchJson(`/${mainRoute}_T?${query}`);

    const teachers = json[`자료${teacherCode}`];
    const subjects = json[`자료${subjectCode}`];
    const baseGrid = json[`자료${baseGridCode}`];
    if (!Array.isArray(teachers) || !Array.isArray(subjects) || !Array.isArray(baseGrid)) {
      throw new ComciganError('SERVICE_CHANGED', '컴시간 시간표 데이터 구조가 예상과 달라요.');
    }

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
      ...(dayTimes && dayTimes.length > 0 ? { dayTimes } : {}),
    };
  }
}
