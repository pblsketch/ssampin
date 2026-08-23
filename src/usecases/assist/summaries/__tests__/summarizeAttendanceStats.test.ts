/**
 * 쌤핀 AI — 출결 기간 집계 두 갈래 (브릿지 동등화 Phase 2)
 *
 * ★담임과 수업반은 **저장 구조가 달라서 셀 수 있는 것도 다르다.**
 * - 담임: 이상이 있는 학생만 기록된다 → 결석·지각은 셀 수 있지만 **출석은 못 센다**
 *   (수업일이 며칠인지 앱이 모른다). 못 세는 것을 0 으로 내보내면 모델이 없는
 *   출석률을 지어낸다.
 * - 수업반: (반·날짜·교시)마다 전원 명부가 통째로 저장된다 → 출석도 사실로 셀 수 있다.
 *
 * 이 차이를 테스트로 못 박아 둔다. 나중에 "둘을 합치자"는 정리 유혹이 오면 여기서 걸린다.
 */
import { describe, expect, it } from 'vitest';

import { summarizeClassAttendance } from '../summarizeClassAttendance';
import { summarizeHomeroomAttendance } from '../summarizeHomeroomAttendance';
import { toAttendanceRoll } from '../toAttendanceRoll';
import { summarizeAttendance } from '../summarizeAttendance';

const HOMEROOM_RECORDS = [
  { studentId: 's1', category: 'attendance', subcategory: '결석 (질병)', date: '2026-08-03' },
  { studentId: 's2', category: 'attendance', subcategory: '지각 (인정)', date: '2026-08-03' },
  { studentId: 's1', category: 'attendance', subcategory: '조퇴 (기타)', date: '2026-08-17' },
  { studentId: 's3', category: 'attendance', subcategory: '결과 (미인정)', date: '2026-08-17' },
  // 출결이 아닌 기록은 세지 않는다
  { studentId: 's1', category: 'observation', subcategory: '학습', date: '2026-08-05' },
  // 기간 밖
  { studentId: 's2', category: 'attendance', subcategory: '결석 (질병)', date: '2026-07-30' },
];

const OPTS = { className: '우리 반', from: '2026-08-01', to: '2026-08-31', rosterSize: 30 };

describe('summarizeHomeroomAttendance', () => {
  it('기간 합계와 이상이 있었던 날만 돌려준다', () => {
    const out = summarizeHomeroomAttendance(HOMEROOM_RECORDS, OPTS);

    expect(out.absent).toBe(1);
    expect(out.late).toBe(1);
    expect(out.early).toBe(1);
    expect(out.classAbsence).toBe(1);
    expect(out.daysWithIssue).toBe(2);
    expect(out.days.map((d) => d.date)).toEqual(['2026-08-03', '2026-08-17']);
  });

  it('★출석 인원을 세지 않는다 — 수업일 수를 모르는 채 세면 지어낸 숫자가 된다', () => {
    const out = summarizeHomeroomAttendance(HOMEROOM_RECORDS, OPTS);
    expect(Object.keys(out)).not.toContain('present');
    for (const day of out.days) {
      expect(Object.keys(day).sort()).toEqual(
        ['absent', 'classAbsence', 'date', 'early', 'late'].sort(),
      );
    }
  });

  it('출결이 아닌 기록·기간 밖 기록은 세지 않는다', () => {
    const out = summarizeHomeroomAttendance(HOMEROOM_RECORDS, OPTS);
    expect(out.absent + out.late + out.early + out.classAbsence).toBe(4);
  });

  it('한 학생이 같은 날 여러 건이면 한 번만 센다 — 하루짜리 집계와 같은 규칙', () => {
    const dup = [
      { studentId: 's1', category: 'attendance', subcategory: '결석 (질병)', date: '2026-08-03' },
      { studentId: 's1', category: 'attendance', subcategory: '지각 (인정)', date: '2026-08-03' },
    ];
    const out = summarizeHomeroomAttendance(dup, OPTS);
    expect(out.absent + out.late).toBe(1);
  });

  it('★하루만 물었을 때 하루짜리 집계와 숫자가 같다 — 두 정본이면 여기서 갈린다', () => {
    const day = '2026-08-03';
    const range = summarizeHomeroomAttendance(HOMEROOM_RECORDS, {
      ...OPTS,
      from: day,
      to: day,
    });
    const single = summarizeAttendance(
      [toAttendanceRoll(HOMEROOM_RECORDS, { classId: 'homeroom', date: day, rosterSize: 30 })],
      { classId: 'homeroom', className: '우리 반', date: day },
    );

    expect(range.absent).toBe(single.absent);
    expect(range.late).toBe(single.late);
    expect(range.early).toBe(single.early);
    expect(range.classAbsence).toBe(single.classAbsence);
  });

  it('★날 수 상한을 넘겨도 합계는 잘리기 전 전체다', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      studentId: `s${i}`,
      category: 'attendance',
      subcategory: '결석 (질병)',
      date: `2026-08-0${i + 1}`,
    }));
    const out = summarizeHomeroomAttendance(many, { ...OPTS, maxDays: 2 });

    expect(out.days).toHaveLength(2);
    expect(out.absent).toBe(5);
    expect(out.daysWithIssue).toBe(5);
    expect(out.truncated).toBe(true);
  });

  it('기록이 하나도 없어도 죽지 않는다', () => {
    const out = summarizeHomeroomAttendance([], OPTS);
    expect(out.days).toEqual([]);
    expect(out.absent).toBe(0);
    expect(out.rosterSize).toBe(30);
  });
});

const CLASS_RECORDS = [
  {
    classId: 'c1',
    date: '2026-08-03',
    period: 1,
    students: [{ status: 'present' as const }, { status: 'absent' as const }],
  },
  {
    classId: 'c1',
    date: '2026-08-03',
    period: 3,
    students: [{ status: 'present' as const }, { status: 'late' as const }],
  },
  {
    classId: 'c2',
    date: '2026-08-04',
    period: 2,
    students: [{ status: 'earlyLeave' as const }, { status: 'classAbsence' as const }],
  },
];

const NAMES = { c1: '3학년 2반', c2: '2학년 5반' };

describe('summarizeClassAttendance', () => {
  it('★출석을 센다 — 수업반은 명부가 통째로 저장되므로 사실이다', () => {
    const out = summarizeClassAttendance(CLASS_RECORDS, {
      from: '2026-08-01',
      to: '2026-08-31',
      classNames: NAMES,
    });

    expect(out.present).toBe(2);
    expect(out.absent).toBe(1);
    expect(out.late).toBe(1);
    expect(out.early).toBe(1);
    expect(out.classAbsence).toBe(1);
  });

  it('같은 날 여러 교시를 한 줄로 묶고 교시 수를 센다', () => {
    const out = summarizeClassAttendance(CLASS_RECORDS, {
      from: '2026-08-01',
      to: '2026-08-31',
      classNames: NAMES,
    });

    const first = out.days[0];
    expect(first?.date).toBe('2026-08-03');
    expect(first?.lessons).toBe(2);
    expect(out.lessons).toBe(3);
  });

  it('반을 좁히지 않으면 줄마다 반 이름이 붙는다', () => {
    const out = summarizeClassAttendance(CLASS_RECORDS, {
      from: '2026-08-01',
      to: '2026-08-31',
      classNames: NAMES,
    });
    expect(out.className).toBe('전체 수업반');
    expect(out.days.map((d) => d.className)).toEqual(['3학년 2반', '2학년 5반']);
  });

  it('반을 좁히면 그 반만 센다', () => {
    const out = summarizeClassAttendance(CLASS_RECORDS, {
      from: '2026-08-01',
      to: '2026-08-31',
      classNames: NAMES,
      className: '2학년 5반',
    });

    expect(out.days).toHaveLength(1);
    expect(out.present).toBe(0);
    expect(out.early).toBe(1);
  });

  it('★학생 번호·학년·반은 결과에 존재하지 않는다', () => {
    const out = summarizeClassAttendance(CLASS_RECORDS, {
      from: '2026-08-01',
      to: '2026-08-31',
      classNames: NAMES,
    });
    const text = JSON.stringify(out);
    expect(text).not.toContain('number');
    expect(text).not.toContain('studentId');
  });

  it('지워진 수업반의 기록도 버리지 않는다 — 건수가 틀어지면 답이 틀린다', () => {
    const out = summarizeClassAttendance([{ ...CLASS_RECORDS[0]!, classId: 'gone' }], {
      from: '2026-08-01',
      to: '2026-08-31',
      classNames: NAMES,
    });
    expect(out.days[0]?.className).toBe('(삭제된 수업반)');
  });
});
