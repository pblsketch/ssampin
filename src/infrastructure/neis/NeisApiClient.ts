import type { MealInfo, MealDish, SchoolSearchResult } from '@domain/entities/Meal';
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
}
