import { describe, it, expect } from 'vitest';
import { parseAttendanceQuickText } from './attendanceQuickText';

/**
 * parseAttendanceQuickText 계약 테스트 (§3.10-3 표):
 * 정상 3형 + 순서 뒤섞기 + 교시 누락 + 동명이인 + 비고 예약어 포함 + 이름이 '조회'인 학생.
 */

const ROSTER = [
  { number: 1, name: '김정민' },
  { number: 2, name: '이서연' },
  { number: 3, name: '박철수' },
  { number: 4, name: '박철수' }, // 동명이인
  { number: 5, name: '김철수' },
  { number: 6, name: '조회' }, // 이름이 교시 예약어와 같은 학생
];
const P = 7;

const parse = (text: string) => parseAttendanceQuickText(text, ROSTER, P);
const one = (text: string) => parse(text)[0]!;

describe('parseAttendanceQuickText — 정상 3형', () => {
  it('지각 + 교시 + 사유 + 비고: "김정민 2교시 질병 지각 감기"', () => {
    const r = one('김정민 2교시 질병 지각 감기');
    expect(r.ok).toBe(true);
    expect(r.result).toMatchObject({
      studentNumber: 1,
      studentName: '김정민',
      status: 'late',
      reason: '질병',
      memo: '감기',
      periods: [0, 1, 2], // 조회~2교시
    });
    expect(r.result!.preview).toContain('지각(질병)');
    expect(r.result!.preview).toContain('감기');
  });

  it('조회 지각 + 사유: "이서연 조회 미인정 지각"', () => {
    const r = one('이서연 조회 미인정 지각');
    expect(r.ok).toBe(true);
    expect(r.result).toMatchObject({
      studentNumber: 2,
      status: 'late',
      reason: '미인정',
      periods: [0], // 조회만
    });
    expect(r.result!.memo).toBeUndefined();
  });

  it('번호로 지정 + 결과: "4 3교시 미인정 결과"', () => {
    const r = one('4 3교시 미인정 결과');
    expect(r.ok).toBe(true);
    expect(r.result).toMatchObject({
      studentNumber: 4,
      studentName: '박철수',
      status: 'classAbsence',
      reason: '미인정',
      periods: [3], // 결과=해당 교시만
    });
  });
});

describe('parseAttendanceQuickText — 순서 뒤섞기', () => {
  it('토큰 순서 무관: "김정민 지각 감기 질병 2교시" == 정상형1', () => {
    const r = one('김정민 지각 감기 질병 2교시');
    expect(r.ok).toBe(true);
    expect(r.result).toMatchObject({
      studentNumber: 1,
      status: 'late',
      reason: '질병',
      memo: '감기',
      periods: [0, 1, 2],
    });
  });
});

describe('parseAttendanceQuickText — 결석 교시 생략', () => {
  it('결석은 교시 생략 시 전 교시: "김정민 결석 질병"', () => {
    const r = one('김정민 결석 질병');
    expect(r.ok).toBe(true);
    expect(r.result).toMatchObject({ status: 'absent', reason: '질병' });
    expect(r.result!.periods).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 9]); // 조회~종례
  });
});

describe('parseAttendanceQuickText — 오류 케이스', () => {
  it('교시 누락(지각): "이서연 지각" → 오류', () => {
    const r = one('이서연 지각');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('교시');
  });

  it('종류 누락: "김정민 2교시 질병" → 오류', () => {
    const r = one('김정민 2교시 질병');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('종류');
  });

  it('동명이인 이름: "박철수 결석" → 번호로 입력 안내', () => {
    const r = one('박철수 결석');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('동명이인');
  });

  it('명단에 없는 번호: "99 결석" → 오류', () => {
    const r = one('99 결석');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('99번');
  });

  it('명단에 없는 이름: "홍길동 결석" → 오류', () => {
    const r = one('홍길동 결석');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('홍길동');
  });
});

describe('parseAttendanceQuickText — 예약어 비고 / 경계', () => {
  it('예약어 2번째 출현은 비고: "김철수 2교시 지각 지각계 제출"', () => {
    const r = one('김철수 2교시 지각 지각계 제출');
    expect(r.ok).toBe(true);
    expect(r.result).toMatchObject({
      studentNumber: 5,
      status: 'late',
      reason: '기타', // 사유 예약어 없음 → 기타
      memo: '지각계 제출', // '지각계'는 종류 예약어가 아님
      periods: [0, 1, 2],
    });
  });

  it('이름이 \'조회\'인 학생도 맨 앞은 학생으로 해석: "조회 결석"', () => {
    const r = one('조회 결석');
    expect(r.ok).toBe(true);
    expect(r.result).toMatchObject({ studentNumber: 6, studentName: '조회', status: 'absent' });
    expect(r.result!.periods).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 9]);
  });

  it('이름이 \'조회\'인 학생 + 실제 교시: "조회 3교시 조퇴"', () => {
    const r = one('조회 3교시 조퇴');
    expect(r.ok).toBe(true);
    expect(r.result).toMatchObject({
      studentNumber: 6,
      status: 'earlyLeave',
      periods: [3, 4, 5, 6, 7, 9], // 3교시~종례
    });
  });
});

describe('parseAttendanceQuickText — 여러 줄 / 빈 줄', () => {
  it('빈 줄은 결과에서 제외되고 줄 번호는 원본 기준', () => {
    const rows = parse('김정민 결석\n\n이서연 지각');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.lineNo).toBe(1);
    expect(rows[1]!.lineNo).toBe(3); // 빈 2행 건너뜀
    expect(rows[0]!.ok).toBe(true);
    expect(rows[1]!.ok).toBe(false); // 교시 누락
  });
});
