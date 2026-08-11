/**
 * 학교별 개학일 규칙 테스트.
 *
 * 핵심 시나리오는 두 방향이다 — ①8월 중순 개학 학교가 9/1 전에 2학기로 보이는가
 * ②9월 초 개학 학교가 9/1~9/4에 성급히 2학기로 넘어가지 않는가. 둘 다 통과해야
 * "앱이 단정하지 않고 학교가 알려준 대로 답한다"가 성립한다.
 */
import { describe, it, expect } from 'vitest';
import {
  compareTerms,
  previousTerm,
  nominalTermStartDate,
  termFromStartDates,
  resolveCurrentTerm,
  resolveTermStartDate,
  toLocalIsoDate,
} from '../schoolTermStart';

describe('toLocalIsoDate — 로컬 기준(UTC 밀림 없음)', () => {
  it('자정 직후에도 그 날짜를 그대로 돌려준다', () => {
    expect(toLocalIsoDate(new Date(2026, 7, 18, 0, 5))).toBe('2026-08-18');
  });

  it('자정 직전에도 날짜가 넘어가지 않는다', () => {
    expect(toLocalIsoDate(new Date(2026, 7, 18, 23, 55))).toBe('2026-08-18');
  });
});

describe('compareTerms / previousTerm / nominalTermStartDate', () => {
  it('학기 순서를 비교한다', () => {
    expect(compareTerms('2026-2', '2026-1')).toBeGreaterThan(0);
    expect(compareTerms('2026-1', '2026-2')).toBeLessThan(0);
    expect(compareTerms('2027-1', '2026-2')).toBeGreaterThan(0);
    expect(compareTerms('2026-1', '2026-1')).toBe(0);
  });

  it('형식이 아닌 쪽은 뒤로 밀린다(판단 근거로 쓰지 않는다)', () => {
    expect(compareTerms(undefined, '2026-1')).toBeLessThan(0);
    expect(compareTerms('2026-1', undefined)).toBeGreaterThan(0);
    expect(compareTerms('이상한값', '2026-1')).toBeLessThan(0);
    expect(compareTerms(undefined, undefined)).toBe(0);
  });

  it('직전 학기를 돌려준다', () => {
    expect(previousTerm('2026-2')).toBe('2026-1');
    expect(previousTerm('2026-1')).toBe('2025-2');
    expect(previousTerm('엉터리')).toBeNull();
  });

  it('명목 시작일은 1학기 3/1, 2학기 8/1(달력 경계와 일치)', () => {
    expect(nominalTermStartDate('2026-1')).toBe('2026-03-01');
    expect(nominalTermStartDate('2026-2')).toBe('2026-08-01');
    expect(nominalTermStartDate('엉터리')).toBeNull();
  });
});

describe('termFromStartDates — 등록된 개학일만으로 파생', () => {
  it('등록이 없으면 null(달력 폴백은 호출자 몫)', () => {
    expect(termFromStartDates('2026-08-20', undefined)).toBeNull();
    expect(termFromStartDates('2026-08-20', {})).toBeNull();
  });

  it('개학일이 아직 미래면 그 직전 학기', () => {
    expect(termFromStartDates('2026-08-12', { '2026-2': '2026-08-18' })).toBe('2026-1');
  });

  it('개학일 당일부터 그 학기', () => {
    expect(termFromStartDates('2026-08-18', { '2026-2': '2026-08-18' })).toBe('2026-2');
    expect(termFromStartDates('2026-08-19', { '2026-2': '2026-08-18' })).toBe('2026-2');
  });

  it('여러 학기가 등록되면 지난 것 중 가장 나중 학기', () => {
    const map = { '2026-1': '2026-03-02', '2026-2': '2026-08-18' };
    expect(termFromStartDates('2026-05-01', map)).toBe('2026-1');
    expect(termFromStartDates('2026-08-20', map)).toBe('2026-2');
  });

  it('날짜를 거꾸로 잘못 넣어도 학기 라벨은 뒤로 가지 않는다', () => {
    // 2학기 개학일을 1학기보다 이르게 잘못 입력한 상태
    const map = { '2026-1': '2026-08-18', '2026-2': '2026-03-02' };
    expect(termFromStartDates('2026-09-01', map)).toBe('2026-2');
  });

  it('형식이 잘못된 항목은 조용히 버린다', () => {
    const map = { '2026-2': '2026/08/18', 엉터리: '2026-08-18', '2026-1': '2026-03-02' };
    expect(termFromStartDates('2026-08-20', map)).toBe('2026-1');
  });
});

describe('resolveCurrentTerm — 개학일 미등록이면 달력 그대로', () => {
  const CASES: Array<[number, number, string]> = [
    [3, 2, '2026-1'],
    [6, 15, '2026-1'],
    [7, 31, '2026-1'],
    [8, 1, '2026-2'],
    [9, 1, '2026-2'],
    [12, 31, '2026-2'],
  ];

  it.each(CASES)('2026-%i-%i → %s', (month, day, expected) => {
    expect(resolveCurrentTerm({ today: new Date(2026, month - 1, day) })).toBe(expected);
  });

  it('1~2월은 직전 학년도 2학기(기존 규칙 유지)', () => {
    expect(resolveCurrentTerm({ today: new Date(2027, 0, 10) })).toBe('2026-2');
  });
});

describe('resolveCurrentTerm — 8월 중순 개학 학교(이번 문제의 본체)', () => {
  const map = { '2026-2': '2026-08-18' };

  it('개학 전(8/12)에는 아직 1학기', () => {
    expect(resolveCurrentTerm({ today: new Date(2026, 7, 12), termStartDates: map })).toBe(
      '2026-1',
    );
  });

  it('개학 당일(8/18)부터 2학기 — 9/1을 기다리지 않는다', () => {
    expect(resolveCurrentTerm({ today: new Date(2026, 7, 18), termStartDates: map })).toBe(
      '2026-2',
    );
  });

  it('개학 이후(8/25)도 2학기', () => {
    expect(resolveCurrentTerm({ today: new Date(2026, 7, 25), termStartDates: map })).toBe(
      '2026-2',
    );
  });

  it('9월 이후에도 2학기 그대로', () => {
    expect(resolveCurrentTerm({ today: new Date(2026, 9, 1), termStartDates: map })).toBe('2026-2');
  });
});

describe('resolveCurrentTerm — 9월 초 개학 학교(반대 방향)', () => {
  const map = { '2026-2': '2026-09-05' };

  it('달력은 2학기지만 개학 전(9/3)이면 1학기로 답한다', () => {
    expect(resolveCurrentTerm({ today: new Date(2026, 8, 3), termStartDates: map })).toBe('2026-1');
  });

  it('개학일(9/5)부터 2학기', () => {
    expect(resolveCurrentTerm({ today: new Date(2026, 8, 5), termStartDates: map })).toBe('2026-2');
  });
});

describe('resolveCurrentTerm — 낡은 등록이 새 학년도를 막지 않는다', () => {
  it('작년 개학일만 남아 있어도 새 학년도 3월이면 달력이 이긴다', () => {
    const map = { '2026-2': '2026-08-18' };
    expect(resolveCurrentTerm({ today: new Date(2027, 2, 10), termStartDates: map })).toBe(
      '2027-1',
    );
  });

  it('겨울방학(1월)은 직전 학년도 2학기 그대로', () => {
    const map = { '2026-2': '2026-08-18' };
    expect(resolveCurrentTerm({ today: new Date(2027, 0, 10), termStartDates: map })).toBe(
      '2026-2',
    );
  });
});

describe('resolveCurrentTerm — 마무리 마법사 기록은 뒤로 가지 않는다', () => {
  it('currentTerm이 더 뒤면 그것이 이긴다', () => {
    expect(resolveCurrentTerm({ today: new Date(2026, 7, 12), currentTerm: '2026-2' })).toBe(
      '2026-2',
    );
  });

  it('currentTerm이 더 앞이면 무시한다(달력·개학일이 앞선 경우)', () => {
    expect(resolveCurrentTerm({ today: new Date(2026, 9, 1), currentTerm: '2026-1' })).toBe(
      '2026-2',
    );
  });

  it('개학일 파생과 currentTerm이 겹쳐도 더 뒤가 이긴다', () => {
    expect(
      resolveCurrentTerm({
        today: new Date(2026, 7, 12),
        termStartDates: { '2026-2': '2026-08-18' },
        currentTerm: '2026-2',
      }),
    ).toBe('2026-2');
  });

  it('형식이 아닌 currentTerm은 무시한다', () => {
    expect(resolveCurrentTerm({ today: new Date(2026, 5, 1), currentTerm: '이상한값' })).toBe(
      '2026-1',
    );
  });
});

describe('resolveTermStartDate — "이번 학기" 필터 시작일', () => {
  it('등록된 개학일이 있으면 그 날', () => {
    expect(resolveTermStartDate('2026-2', { '2026-2': '2026-08-18' })).toBe('2026-08-18');
  });

  it('등록이 없으면 명목 시작일', () => {
    expect(resolveTermStartDate('2026-2', undefined)).toBe('2026-08-01');
    expect(resolveTermStartDate('2026-1', {})).toBe('2026-03-01');
  });

  it('다른 학기 등록은 끌어오지 않는다', () => {
    expect(resolveTermStartDate('2026-1', { '2026-2': '2026-08-18' })).toBe('2026-03-01');
  });

  it('형식이 잘못된 등록은 명목으로 폴백', () => {
    expect(resolveTermStartDate('2026-2', { '2026-2': '8월 18일' })).toBe('2026-08-01');
  });

  it('형식이 아닌 학기는 null', () => {
    expect(resolveTermStartDate('엉터리', undefined)).toBeNull();
  });
});
