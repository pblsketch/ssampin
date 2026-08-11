import { describe, it, expect } from 'vitest';
import * as academicCalendar from '../academicCalendar';
import {
  academicTerm,
  parseTerm,
  schoolYearOf,
  formatSchoolYearKo,
  formatTermKo,
} from '../academicCalendar';

describe('academicTerm — 12개월 전부', () => {
  // [월, 기대 라벨] — 2026년 기준. 1~2월은 직전 학년도(2025) 2학기.
  // 8월은 2학기 — 대부분의 중·고가 8월 중순에 2학기를 개학한다(경계 근거는 academicCalendar 주석).
  const CASES: Array<[number, string]> = [
    [1, '2025-2'],
    [2, '2025-2'],
    [3, '2026-1'],
    [4, '2026-1'],
    [5, '2026-1'],
    [6, '2026-1'],
    [7, '2026-1'],
    [8, '2026-2'],
    [9, '2026-2'],
    [10, '2026-2'],
    [11, '2026-2'],
    [12, '2026-2'],
  ];

  it.each(CASES)('2026년 %i월 → %s', (month, expected) => {
    expect(academicTerm(new Date(2026, month - 1, 15))).toBe(expected);
  });
});

describe('academicTerm — 연말연시·학년도 경계', () => {
  it('12/31은 그 해 2학기', () => {
    expect(academicTerm(new Date(2026, 11, 31))).toBe('2026-2');
  });

  it('1/1은 직전 학년도 2학기', () => {
    expect(academicTerm(new Date(2027, 0, 1))).toBe('2026-2');
  });

  it('2/28은 직전 학년도 2학기', () => {
    expect(academicTerm(new Date(2027, 1, 28))).toBe('2026-2');
  });

  it('윤년 2/29도 직전 학년도 2학기', () => {
    expect(academicTerm(new Date(2028, 1, 29))).toBe('2027-2');
  });

  it('3/1부터 새 학년도 1학기', () => {
    expect(academicTerm(new Date(2027, 2, 1))).toBe('2027-1');
  });

  it('7/31은 1학기, 8/1부터 2학기', () => {
    expect(academicTerm(new Date(2026, 6, 31))).toBe('2026-1');
    expect(academicTerm(new Date(2026, 7, 1))).toBe('2026-2');
  });
});

describe('parseTerm / schoolYearOf', () => {
  it('정상 라벨을 분해한다', () => {
    expect(parseTerm('2026-1')).toEqual({ year: 2026, semester: 1 });
    expect(parseTerm('2026-2')).toEqual({ year: 2026, semester: 2 });
  });

  it('형식이 아니면 null', () => {
    for (const bad of ['2026', '2026-3', '2026-0', '26-1', 'abcd-1', '', '2026-1-1']) {
      expect(parseTerm(bad)).toBeNull();
    }
  });

  it('schoolYearOf는 학년도 숫자를 돌려준다', () => {
    expect(schoolYearOf('2026-2')).toBe(2026);
    expect(schoolYearOf('2025-1')).toBe(2025);
    expect(schoolYearOf('nope')).toBeNull();
  });
});

describe('표시 문자열', () => {
  it('formatSchoolYearKo', () => {
    expect(formatSchoolYearKo(2026)).toBe('2026학년도');
  });

  it('formatTermKo', () => {
    expect(formatTermKo('2026-1')).toBe('2026학년도 1학기');
    expect(formatTermKo('2025-2')).toBe('2025학년도 2학기');
  });

  it('형식이 아니면 원문 그대로', () => {
    expect(formatTermKo('학기 미상')).toBe('학기 미상');
  });
});

describe('모듈 표면 계약 — 시즌 판정 함수를 두지 않는다 (ADR-037)', () => {
  it('export 목록이 라벨 계산·표시 5종 + term 스탬프 파생 2종(S2.2)뿐이다', () => {
    // academicTermForDate/withDerivedTerm은 레코드 date(사건 발생일) → 학기 파생(ADR-034 epoch
    // 스탬프)이다 — 날짜 "구간" 판정(시즌 배너류)이 아니므로 ADR-037 금지 대상이 아니다.
    // 시즌 판정류(isXxxSeason)가 추가되면 이 목록 갱신 전에 ADR-037부터 재검토할 것.
    expect(Object.keys(academicCalendar).sort()).toEqual([
      'academicTerm',
      'academicTermForDate',
      'formatSchoolYearKo',
      'formatTermKo',
      'parseTerm',
      'schoolYearOf',
      'withDerivedTerm',
    ]);
  });
});
