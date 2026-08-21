/**
 * 기록 → 하루치 출결 명부
 *
 * ★핵심 전제: 이 앱은 **결석·지각한 학생만** 기록으로 남긴다.
 * 기록이 없는 학생은 출석한 것이다. 그걸 여기서 채운다.
 */
import { describe, expect, it } from 'vitest';

import { toAttendanceRoll } from '../toAttendanceRoll';
import { summarizeAttendance } from '../summarizeAttendance';

const DATE = '2026-08-21';
const OPTS = { classId: 'homeroom', date: DATE, rosterSize: 28 };

function rec(studentId: string, subcategory: string, date = DATE) {
  return { studentId, category: 'attendance', subcategory, date };
}

describe('기록이 없는 학생은 출석으로 채운다', () => {
  it('아무 기록도 없는 날은 전원 출석이다', () => {
    const roll = toAttendanceRoll([], OPTS);
    expect(roll.students).toHaveLength(28);
    expect(roll.students.every((s) => s.status === 'present')).toBe(true);
  });

  it('결석 2명이면 나머지 26명이 출석이다', () => {
    const roll = toAttendanceRoll([rec('s1', '결석 (질병)'), rec('s2', '결석 (미인정)')], OPTS);
    const summary = summarizeAttendance([roll], {
      classId: 'homeroom',
      className: '우리 반',
      date: DATE,
    });

    expect(summary.absent).toBe(2);
    expect(summary.present).toBe(26);
  });
});

describe('소분류 형식', () => {
  it('★"유형 (사유)" 형식을 그대로 판정한다 — 화면 통계와 같은 함수를 쓴다', () => {
    const roll = toAttendanceRoll(
      [
        rec('s1', '결석 (질병)'),
        rec('s2', '지각 (인정)'),
        rec('s3', '조퇴 (기타)'),
        rec('s4', '결과 (미인정)'),
      ],
      OPTS,
    );
    const s = summarizeAttendance([roll], {
      classId: 'homeroom',
      className: '우리 반',
      date: DATE,
    });

    expect(s).toMatchObject({ absent: 1, late: 1, early: 1, classAbsence: 1, present: 24 });
  });

  it('구 형식(병결·무단결석)도 결석으로 센다', () => {
    const roll = toAttendanceRoll([rec('s1', '병결'), rec('s2', '무단결석')], OPTS);
    const s = summarizeAttendance([roll], {
      classId: 'homeroom',
      className: '우리 반',
      date: DATE,
    });
    expect(s.absent).toBe(2);
  });

  it('모르는 유형은 세지 않는다 (출석으로 남는다)', () => {
    const roll = toAttendanceRoll([rec('s1', '알수없는유형')], OPTS);
    expect(roll.students.every((s) => s.status === 'present')).toBe(true);
  });
});

describe('경계값', () => {
  it('다른 날짜 기록은 섞이지 않는다', () => {
    const roll = toAttendanceRoll([rec('s1', '결석 (질병)', '2026-08-20')], OPTS);
    expect(roll.students.filter((s) => s.status === 'absent')).toHaveLength(0);
  });

  it('출결이 아닌 기록은 무시한다', () => {
    const roll = toAttendanceRoll(
      [{ studentId: 's1', category: 'life', subcategory: '칭찬', date: DATE }],
      OPTS,
    );
    expect(roll.students.every((s) => s.status === 'present')).toBe(true);
  });

  it('★한 학생이 같은 날 여러 건이어도 한 번만 센다 — 합이 정원을 넘으면 안 된다', () => {
    const roll = toAttendanceRoll([rec('s1', '지각 (인정)'), rec('s1', '조퇴 (기타)')], OPTS);
    expect(roll.students).toHaveLength(28);
    expect(roll.students.filter((s) => s.status !== 'present')).toHaveLength(1);
  });

  it('명렬표가 비어 있으면 인원 0으로 나온다 (음수가 되지 않는다)', () => {
    const roll = toAttendanceRoll([rec('s1', '결석 (질병)')], { ...OPTS, rosterSize: 0 });
    expect(roll.students).toHaveLength(1);
    expect(roll.students[0]?.status).toBe('absent');
  });
});
