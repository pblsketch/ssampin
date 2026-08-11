import { describe, it, expect } from 'vitest';
import { reconstructNeisTeacherSchedule } from './ReconstructNeisTeacherSchedule';
import type { INeisPort } from '@domain/ports/INeisPort';
import type { NeisTimetableRow } from '@domain/entities/NeisTimetable';
import type { TeacherClassMapping } from '@domain/rules/neisTeacherReconstruct';

const BASE = {
  apiKey: 'k',
  officeCode: 'B10',
  schoolCode: '7010000',
  schoolLevel: 'his' as const,
  fromDate: '20260601',
  toDate: '20260605',
};

// 2026-06-01 = 월요일 → schedule['월'] 에 배치된다.
function row(perio: string, subject: string, ymd: string): NeisTimetableRow {
  return { PERIO: perio, ITRT_CNTNT: subject, ALL_TI_YMD: ymd, GRADE: '1', CLASS_NM: '1' };
}

/** getTimetable 호출을 '학년-반' 키로 세는 목 포트. throwFor 학급은 조회 실패 처리. */
function makePort(rowsByClass: Record<string, NeisTimetableRow[]>, throwFor: string[] = []) {
  const calls: string[] = [];
  const port = {
    getTimetable: async (p: { grade: string; className: string }) => {
      const key = `${p.grade}-${p.className}`;
      calls.push(key);
      if (throwFor.includes(key)) throw new Error('시간표 조회에 실패했어요.');
      return rowsByClass[key] ?? [];
    },
  } as unknown as INeisPort;
  return { port, calls };
}

describe('reconstructNeisTeacherSchedule', () => {
  it('한 반에서 여러 과목을 맡아도 학급 조회는 1회만(유니크 dedup)', async () => {
    const { port, calls } = makePort({
      '1-1': [row('1', '국어', '20260601'), row('2', '수학', '20260601')],
    });
    const mappings: TeacherClassMapping[] = [
      { classId: 'a', subject: '국어', grade: 1, classNum: 1 },
      { classId: 'b', subject: '수학', grade: 1, classNum: 1 },
    ];

    const r = await reconstructNeisTeacherSchedule(port, { ...BASE, mappings });

    expect(calls).toEqual(['1-1']); // 두 과목이지만 fetch 는 1회
    expect(r.fetchErrors).toEqual([]);
    expect(r.matchedCount).toBe(2);
    expect(r.schedule['월']?.[0]).toEqual({ subject: '국어', classroom: '1-1' });
    expect(r.schedule['월']?.[1]).toEqual({ subject: '수학', classroom: '1-1' });
  });

  it('학기 축은 첫 학급에서 한 번만 확정하고 나머지 학급에 재사용한다', async () => {
    // 8월 셋째 주 = 학사 달력상 2학기지만, 8월 말까지 1학기인 학교의 나이스에는 1학기로 등록돼 있다.
    const calls: { key: string; semester: string }[] = [];
    const port = {
      getTimetable: async (p: { grade: string; className: string; semester: string }) => {
        calls.push({ key: `${p.grade}-${p.className}`, semester: p.semester });
        if (p.semester !== '1') return []; // 2학기로 조회하면 비어 있는 학교(9월 개학)
        // 반마다 다른 교시 — 같은 교시면 합반으로 병합돼 매칭 수가 1로 접힌다.
        return [{ ...row(p.className, '국어', '20260817'), GRADE: p.grade, CLASS_NM: p.className }];
      },
    } as unknown as INeisPort;

    const r = await reconstructNeisTeacherSchedule(port, {
      ...BASE,
      fromDate: '20260817',
      toDate: '20260821',
      mappings: [
        { classId: 'a', subject: '국어', grade: 1, classNum: 1 },
        { classId: 'b', subject: '국어', grade: 1, classNum: 2 },
        { classId: 'c', subject: '국어', grade: 1, classNum: 3 },
      ],
    });

    expect(r.resolvedAxis).toEqual({ academicYear: '2026', semester: '1' });
    // 첫 학급만 2학기→1학기 폴백(2회), 나머지 두 학급은 확정된 1학기로 1회씩
    expect(calls).toEqual([
      { key: '1-1', semester: '2' },
      { key: '1-1', semester: '1' },
      { key: '1-2', semester: '1' },
      { key: '1-3', semester: '1' },
    ]);
    expect(r.matchedCount).toBe(3);
  });

  it('일부 학급 조회 실패는 전체를 막지 않고 fetchErrors 로 모은다', async () => {
    const { port } = makePort({ '1-1': [row('1', '국어', '20260601')] }, ['1-2']);
    const mappings: TeacherClassMapping[] = [
      { classId: 'a', subject: '국어', grade: 1, classNum: 1 },
      { classId: 'b', subject: '영어', grade: 1, classNum: 2 },
    ];

    const r = await reconstructNeisTeacherSchedule(port, { ...BASE, mappings });

    expect(r.fetchErrors).toHaveLength(1);
    expect(r.fetchErrors[0]).toMatchObject({ grade: 1, classNum: 2 });
    // 성공한 1-1 수업은 그대로 재조합됨
    expect(r.schedule['월']?.[0]).toEqual({ subject: '국어', classroom: '1-1' });
    // 조회 실패한 1-2 과목은 매칭 0 → unmatched
    expect(r.unmatched).toContainEqual({ grade: 1, classNum: 2, subject: '영어' });
  });
});
