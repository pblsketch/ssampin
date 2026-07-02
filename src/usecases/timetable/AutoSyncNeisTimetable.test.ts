import { describe, it, expect } from 'vitest';
import { autoSyncNeisTimetable } from './AutoSyncNeisTimetable';
import { transformToClassSchedule, getMaxPeriod } from '@domain/rules/neisTransformRules';
import type { INeisPort } from '@domain/ports/INeisPort';
import type { NeisTimetableRow } from '@domain/entities/NeisTimetable';

// 2024-09-02 = 월요일. 1·2교시 국어·수학.
const ROWS = [
  { ALL_TI_YMD: '20240902', PERIO: '1', ITRT_CNTNT: '국어' },
  { ALL_TI_YMD: '20240902', PERIO: '2', ITRT_CNTNT: '수학' },
] as unknown as NeisTimetableRow[];

function makeNeisPort(rows: readonly NeisTimetableRow[]): INeisPort {
  return {
    searchSchool: async () => [],
    getMeals: async () => [],
    getMealsRange: async () => [],
    getClassList: async () => [],
    getTimetable: async () => rows,
    getSchoolSchedule: async () => [],
  };
}

const AUTO = {
  enabled: true,
  grade: '1',
  className: '1',
  lastSyncDate: '',
  lastSyncWeek: '',
  syncTarget: 'class' as const,
};
const NEIS = { schoolCode: 'S1', atptCode: 'A1' };

describe('autoSyncNeisTimetable — 변경 감지(changed)', () => {
  it('현재 저장본이 비어 있으면 changed:true', async () => {
    const r = await autoSyncNeisTimetable(makeNeisPort(ROWS), 'key', NEIS, AUTO, 'high', {}, {});
    expect(r.success).toBe(true);
    expect(r.changed).toBe(true);
    // 픽스처가 실제 수업을 만들었는지(월요일 매핑) 셀프 검증 — 날짜 오지정 시 여기서 실패
    const built = transformToClassSchedule(ROWS, getMaxPeriod(ROWS));
    expect(built['월']?.some((c) => c.subject !== '')).toBe(true);
  });

  it('현재 저장본이 나이스 결과와 같으면 changed:false (쓰기 스킵 신호)', async () => {
    const built = transformToClassSchedule(ROWS, getMaxPeriod(ROWS));
    const r = await autoSyncNeisTimetable(makeNeisPort(ROWS), 'key', NEIS, AUTO, 'high', {}, built);
    expect(r.success).toBe(true);
    expect(r.changed).toBe(false);
  });

  it('현재 저장본 미제공(구버전 호출)은 안전하게 changed:true (변경 간주)', async () => {
    const r = await autoSyncNeisTimetable(makeNeisPort(ROWS), 'key', NEIS, AUTO, 'high', {});
    expect(r.success).toBe(true);
    expect(r.changed).toBe(true);
  });
});
