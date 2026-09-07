import { describe, it, expect } from 'vitest';
import { autoSyncComciganTimetable } from './AutoSyncComciganTimetable';
import type { IComciganPort } from '@domain/ports/IComciganPort';
import type { ComciganRawSchoolData } from '@domain/entities/ComciganTimetable';
import type { TeacherScheduleData } from '@domain/entities/Timetable';

const code = (s: number, t: number) => s * 1000 + t;

/** 백순*(idx1)이 월 1·2교시에 국어·문학을 가르치는 최소 학교 데이터 */
function fixture(): ComciganRawSchoolData {
  return {
    schoolName: '테스트고',
    teachers: ['', '백순*'],
    subjects: ['', '국어', '문학'],
    separator: 1000,
    baseGrid: [[], [[], [[], [2, code(1, 1), code(2, 1)]]]],
  };
}

function port(result: ComciganRawSchoolData | Error): IComciganPort {
  return {
    searchSchools: async () => [],
    getSchoolData: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

const EMPTY: TeacherScheduleData = {};
const FP = { schoolCode: 123, maskedName: '백순*', subjects: ['국어'] };

describe('autoSyncComciganTimetable', () => {
  it('지문이 없으면 skipped (no-fingerprint)', async () => {
    const r = await autoSyncComciganTimetable(port(fixture()), undefined, EMPTY);
    expect(r).toMatchObject({ skipped: true, matched: false, reason: 'no-fingerprint' });
  });

  it('fetch 실패 시 skipped (fetch-failed) — 조용히 중단', async () => {
    const r = await autoSyncComciganTimetable(port(new Error('net')), FP, EMPTY);
    expect(r).toMatchObject({ skipped: true, matched: false, reason: 'fetch-failed' });
  });

  it('매칭 + 현재와 다르면 matched·changed·data', async () => {
    const r = await autoSyncComciganTimetable(port(fixture()), FP, EMPTY);
    expect(r.matched).toBe(true);
    expect(r.changed).toBe(true);
    expect(r.data?.['월']?.[0]).toEqual({ subject: '국어', classroom: '1-1' });
  });

  it('매칭됐지만 현재와 같으면 changed:false (쓰기 불필요 신호)', async () => {
    const first = await autoSyncComciganTimetable(port(fixture()), FP, EMPTY);
    const r = await autoSyncComciganTimetable(port(fixture()), FP, first.data!);
    expect(r.matched).toBe(true);
    expect(r.changed).toBe(false);
  });

  it('일일자료가 없는 학교는 weekly 를 주지 않는다(이번 주 변경 판단 불가)', async () => {
    const r = await autoSyncComciganTimetable(port(fixture()), FP, EMPTY);
    expect(r.matched).toBe(true);
    expect(r.weekly).toBeUndefined();
  });

  it('일일자료가 있으면 기본 편성표와 견준 이번 주 변경(weekly)을 함께 돌려준다', async () => {
    // 이번 주: 월 2교시 문학이 빠지고(보강으로 다른 교사) 월 3교시 국어가 생김
    const withDaily: ComciganRawSchoolData = {
      ...fixture(),
      dailyGrid: [[], [[], [[], [3, code(1, 1), 0, `>${code(1, 1)}`]]]],
    };
    const base = await autoSyncComciganTimetable(port(fixture()), FP, EMPTY);
    const r = await autoSyncComciganTimetable(port(withDaily), FP, base.data!);

    // 기본 편성표는 저장본과 같다 — 예전엔 여기서 "변동 없음"으로 끝났다
    expect(r.changed).toBe(false);
    expect(r.weekly?.diff.changed).toBe(true);
    expect(r.weekly?.diff.changes).toEqual([
      { day: '월', period: 2, before: '문학@1-1', after: '' },
      { day: '월', period: 3, before: '', after: '국어@1-1' },
    ]);
    expect(r.weekly?.schedule['월']?.[2]).toEqual({ subject: '국어', classroom: '1-1' });
  });

  it('일일자료가 기본 편성표와 같으면 weekly.diff.changed 는 false', async () => {
    const same: ComciganRawSchoolData = { ...fixture(), dailyGrid: fixture().baseGrid };
    const r = await autoSyncComciganTimetable(port(same), FP, EMPTY);
    expect(r.weekly?.diff.changed).toBe(false);
    expect(r.weekly?.diff.changes).toEqual([]);
  });

  it('지문 이름을 못 찾으면 matched:false + no-match (적용 0)', async () => {
    const r = await autoSyncComciganTimetable(
      port(fixture()),
      { ...FP, maskedName: '없음*' },
      EMPTY,
    );
    expect(r).toMatchObject({ skipped: false, matched: false, changed: false, reason: 'no-match' });
    expect(r.data).toBeUndefined();
  });
});
