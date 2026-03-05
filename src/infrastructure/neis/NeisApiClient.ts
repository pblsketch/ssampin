import type { MealInfo, MealDish, SchoolSearchResult } from '@domain/entities/Meal';
import type { NeisClassInfo, NeisTimetableRow, SchoolLevel } from '@domain/entities/NeisTimetable';
import { NeisApiError, mapNeisErrorCode } from '@domain/entities/NeisTimetable';
import type { NeisScheduleRow } from '@domain/entities/NeisSchedule';
import type { INeisPort } from '@domain/ports/INeisPort';

/**
 * 요리명에서 알레르기 번호를 파싱
 * "카레라이스(2.5.6.10.13)" → { name: "카레라이스", allergens: [2,5,6,10,13] }
 */
function parseDish(raw: string): MealDish {
  const match = raw.match(/^(.+?)\(([0-9.]+)\)\s*$/);
  if (match) {
    const name = match[1]!.trim();
    const allergens = match[2]!
      .split('.')
      .map(Number)
      .filter((n) => n > 0);
    return { name, allergens };
  }
  return { name: raw.trim(), allergens: [] };
}

/**
 * DDISH_NM 필드를 파싱하여 MealDish 배열로 변환
 * "<br/>" 구분자로 분리
 */
function parseDishes(ddishNm: string): readonly MealDish[] {
  return ddishNm
    .split(/<br\s*\/?>/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseDish);
}

interface NeisApiResponse {
  readonly [key: string]: readonly [
    { readonly head: readonly [{ readonly list_total_count: number }, { readonly RESULT: { readonly CODE: string; readonly MESSAGE: string } }] },
    { readonly row: readonly Record<string, string>[] }?,
  ];
}

const isElectron = typeof window !== 'undefined' && window.electronAPI != null;

export class NeisApiClient implements INeisPort {
  /** Electron → 직접 호출, 브라우저 dev → Vite 프록시 경유 */
  private readonly baseUrl = isElectron
    ? 'https://open.neis.go.kr/hub'
    : '/neis-api/hub';

  async searchSchool(
    apiKey: string,
    schoolName: string,
  ): Promise<readonly SchoolSearchResult[]> {
    const params = new URLSearchParams({
      KEY: apiKey,
      Type: 'json',
      pIndex: '1',
      pSize: '20',
      SCHUL_NM: schoolName,
    });

    const url = `${this.baseUrl}/schoolInfo?${params.toString()}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json() as NeisApiResponse;
      const data = json['schoolInfo'];
      if (!data || data.length < 2) return [];

      const head = data[0]?.head;
      if (!head) return [];
      const result = head[1]?.RESULT;
      if (result?.CODE !== 'INFO-000') return [];

      const rows = data[1]?.row;
      if (!rows) return [];

      return rows.map((row) => ({
        schoolName: row['SCHUL_NM'] ?? '',
        schoolCode: row['SD_SCHUL_CODE'] ?? '',
        atptCode: row['ATPT_OFCDC_SC_CODE'] ?? '',
        address: row['ORG_RDNMA'] ?? row['ORG_RDNDA'] ?? '',
        schoolType: row['SCHUL_KND_SC_NM'] ?? '',
      }));
    } catch {
      return [];
    }
  }

  async getMeals(
    apiKey: string,
    atptCode: string,
    schoolCode: string,
    date: string,
  ): Promise<readonly MealInfo[]> {
    const params = new URLSearchParams({
      KEY: apiKey,
      Type: 'json',
      pIndex: '1',
      pSize: '10',
      ATPT_OFCDC_SC_CODE: atptCode,
      SD_SCHUL_CODE: schoolCode,
      MLSV_YMD: date,
    });

    return this.fetchMeals(params);
  }

  async getMealsRange(
    apiKey: string,
    atptCode: string,
    schoolCode: string,
    startDate: string,
    endDate: string,
  ): Promise<readonly MealInfo[]> {
    const params = new URLSearchParams({
      KEY: apiKey,
      Type: 'json',
      pIndex: '1',
      pSize: '100',
      ATPT_OFCDC_SC_CODE: atptCode,
      SD_SCHUL_CODE: schoolCode,
      MLSV_FROM_YMD: startDate,
      MLSV_TO_YMD: endDate,
    });

    return this.fetchMeals(params);
  }

  private async fetchMeals(params: URLSearchParams): Promise<readonly MealInfo[]> {
    const url = `${this.baseUrl}/mealServiceDietInfo?${params.toString()}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json() as NeisApiResponse;
      const data = json['mealServiceDietInfo'];
      if (!data || data.length < 2) return [];

      const head = data[0]?.head;
      if (!head) return [];
      const result = head[1]?.RESULT;
      if (result?.CODE !== 'INFO-000') return [];

      const rows = data[1]?.row;
      if (!rows) return [];

      return rows.map((row) => ({
        date: row['MLSV_YMD'] ?? '',
        mealType: row['MMEAL_SC_NM'] ?? '',
        dishes: parseDishes(row['DDISH_NM'] ?? ''),
        calorie: row['CAL_INFO'] ?? '',
      }));
    } catch {
      return [];
    }
  }

  /* ── 학급 목록 조회 ── */

  async getClassList(params: {
    apiKey: string;
    officeCode: string;
    schoolCode: string;
    academicYear: string;
    grade: string;
  }): Promise<readonly NeisClassInfo[]> {
    const qs = new URLSearchParams({
      KEY: params.apiKey,
      Type: 'json',
      pIndex: '1',
      pSize: '100',
      ATPT_OFCDC_SC_CODE: params.officeCode,
      SD_SCHUL_CODE: params.schoolCode,
      AY: params.academicYear,
      GRADE: params.grade,
    });

    const url = `${this.baseUrl}/classInfo?${qs.toString()}`;

    try {
      const res = await this.fetchWithTimeout(url);
      const json = await res.json() as NeisApiResponse;
      const data = json['classInfo'];
      if (!data || data.length < 2) {
        this.checkNeisError(json);
        return [];
      }

      const head = data[0]?.head;
      if (!head) return [];
      const result = head[1]?.RESULT;
      if (result?.CODE !== 'INFO-000') {
        throw new NeisApiError(mapNeisErrorCode(result?.CODE ?? ''), result?.MESSAGE ?? '');
      }

      const rows = data[1]?.row;
      if (!rows) return [];

      return rows
        .map((row) => ({
          CLASS_NM: row['CLASS_NM'] ?? '',
          GRADE: row['GRADE'] ?? '',
        }))
        .sort((a, b) => {
          const numA = parseInt(a.CLASS_NM, 10);
          const numB = parseInt(b.CLASS_NM, 10);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return a.CLASS_NM.localeCompare(b.CLASS_NM);
        });
    } catch (e) {
      if (e instanceof NeisApiError) throw e;
      throw new NeisApiError('NETWORK_ERROR', (e as Error).message);
    }
  }

  /* ── 시간표 조회 ── */

  async getTimetable(params: {
    apiKey: string;
    officeCode: string;
    schoolCode: string;
    schoolLevel: SchoolLevel;
    academicYear: string;
    semester: string;
    grade: string;
    className: string;
    fromDate: string;
    toDate: string;
  }): Promise<readonly NeisTimetableRow[]> {
    const endpointMap: Record<SchoolLevel, string> = {
      els: 'elsTimetable',
      mis: 'misTimetable',
      his: 'hisTimetable',
    };
    const endpoint = endpointMap[params.schoolLevel];

    const qs = new URLSearchParams({
      KEY: params.apiKey,
      Type: 'json',
      pIndex: '1',
      pSize: '1000',
      ATPT_OFCDC_SC_CODE: params.officeCode,
      SD_SCHUL_CODE: params.schoolCode,
      AY: params.academicYear,
      SEM: params.semester,
      GRADE: params.grade,
      CLASS_NM: params.className,
      TI_FROM_YMD: params.fromDate,
      TI_TO_YMD: params.toDate,
    });

    const url = `${this.baseUrl}/${endpoint}?${qs.toString()}`;

    try {
      const res = await this.fetchWithTimeout(url);
      const json = await res.json() as NeisApiResponse;
      const data = json[endpoint];
      if (!data || data.length < 2) {
        this.checkNeisError(json);
        return [];
      }

      const head = data[0]?.head;
      if (!head) return [];
      const result = head[1]?.RESULT;
      if (result?.CODE !== 'INFO-000') {
        throw new NeisApiError(mapNeisErrorCode(result?.CODE ?? ''), result?.MESSAGE ?? '');
      }

      const rows = data[1]?.row;
      if (!rows) return [];

      return rows.map((row) => ({
        PERIO: row['PERIO'] ?? '',
        ITRT_CNTNT: row['ITRT_CNTNT'] ?? '',
        ALL_TI_YMD: row['ALL_TI_YMD'] ?? '',
        GRADE: row['GRADE'] ?? '',
        CLASS_NM: row['CLASS_NM'] ?? '',
      }));
    } catch (e) {
      if (e instanceof NeisApiError) throw e;
      throw new NeisApiError('NETWORK_ERROR', (e as Error).message);
    }
  }

  /* ── 학사일정 조회 ── */

  async getSchoolSchedule(params: {
    apiKey: string;
    officeCode: string;
    schoolCode: string;
    fromDate: string;
    toDate: string;
  }): Promise<readonly NeisScheduleRow[]> {
    const allRows: NeisScheduleRow[] = [];
    let pIndex = 1;
    const pSize = 1000;

    // 페이지네이션 자동 처리
    while (true) {
      const qs = new URLSearchParams({
        KEY: params.apiKey,
        Type: 'json',
        pIndex: String(pIndex),
        pSize: String(pSize),
        ATPT_OFCDC_SC_CODE: params.officeCode,
        SD_SCHUL_CODE: params.schoolCode,
        AA_FROM_YMD: params.fromDate,
        AA_TO_YMD: params.toDate,
      });

      const url = `${this.baseUrl}/SchoolSchedule?${qs.toString()}`;

      try {
        const res = await this.fetchWithTimeout(url);
        const json = await res.json() as NeisApiResponse;
        const data = json['SchoolSchedule'];

        if (!data || data.length < 2) {
          // 첫 페이지에서 데이터 없음 → 빈 결과
          if (pIndex === 1) {
            this.checkNeisError(json);
            return [];
          }
          break;
        }

        const head = data[0]?.head;
        if (!head) break;

        const result = head[1]?.RESULT;
        if (result?.CODE === 'INFO-200') {
          // 데이터 없음 (정상 응답)
          return [];
        }
        if (result?.CODE !== 'INFO-000') {
          throw new NeisApiError(mapNeisErrorCode(result?.CODE ?? ''), result?.MESSAGE ?? '');
        }

        const totalCount = head[0]?.list_total_count ?? 0;
        const rows = data[1]?.row;
        if (!rows) break;

        for (const row of rows) {
          allRows.push({
            AA_YMD: row['AA_YMD'] ?? '',
            EVENT_NM: row['EVENT_NM'] ?? '',
            EVENT_CNTNT: row['EVENT_CNTNT'] ?? '',
            ONE_GRADE_EVENT_YN: row['ONE_GRADE_EVENT_YN'] ?? 'N',
            TW_GRADE_EVENT_YN: row['TW_GRADE_EVENT_YN'] ?? 'N',
            THREE_GRADE_EVENT_YN: row['THREE_GRADE_EVENT_YN'] ?? 'N',
            SBTR_DD_SC_NM: row['SBTR_DD_SC_NM'] ?? '',
            AY: row['AY'] ?? '',
            LOAD_DTM: row['LOAD_DTM'] ?? '',
          });
        }

        // 모든 데이터를 가져왔으면 종료
        if (allRows.length >= totalCount) break;
        pIndex++;
      } catch (e) {
        if (e instanceof NeisApiError) throw e;
        throw new NeisApiError('NETWORK_ERROR', (e as Error).message);
      }
    }

    return allRows;
  }

  /* ── 공통 유틸리티 ── */

  /** 타임아웃 있는 fetch (10초) */
  private async fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        throw new NeisApiError('NETWORK_ERROR', '나이스 서버 응답이 느립니다. 잠시 후 다시 시도해주세요.');
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /** JSON 응답에서 NEIS 에러 구조 확인 — INFO-200(데이터 없음)은 정상 처리 */
  private checkNeisError(json: Record<string, unknown>): void {
    const resultObj = json as { RESULT?: { CODE?: string; MESSAGE?: string } };
    const result = resultObj.RESULT;
    if (result?.CODE && result.CODE !== 'INFO-000' && result.CODE !== 'INFO-200') {
      throw new NeisApiError(mapNeisErrorCode(result.CODE), result.MESSAGE ?? '');
    }
  }
}
