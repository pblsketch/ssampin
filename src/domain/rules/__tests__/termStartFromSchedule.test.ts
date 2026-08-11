/**
 * 학사일정 개학일 추출 테스트.
 *
 * 실제 제보 사례: 어느 학교 학사일정에 '2026-08-11 개학식'이 그대로 들어 있다.
 * 그 학교는 나이스에 시간표를 올리지 않아 시간표 신호가 아예 나오지 않으므로,
 * 이 경로가 실질적으로 더 넓게 먹힌다.
 */
import { describe, it, expect } from 'vitest';
import {
  findTermStartCandidates,
  findTermStartCandidate,
  type ScheduleEventLike,
} from '../termStartFromSchedule';

const ev = (date: string, title: string, neisEventName?: string): ScheduleEventLike => ({
  date,
  title,
  ...(neisEventName === undefined ? {} : { neisEventName }),
});

describe('findTermStartCandidates — 찾아내야 하는 경우', () => {
  it('8월 개학식을 그 학년도 2학기 시작으로 잡는다(제보 사례)', () => {
    expect(findTermStartCandidates([ev('2026-08-11', '개학식')])).toEqual([
      { term: '2026-2', startIso: '2026-08-11', sourceLabel: '개학식' },
    ]);
  });

  it('행사명에 학기가 적혀 있으면 그대로 믿는다', () => {
    expect(findTermStartCandidates([ev('2026-08-18', '2학기 개학')])[0]?.term).toBe('2026-2');
    expect(findTermStartCandidates([ev('2026-03-02', '1학기 개학식')])[0]?.term).toBe('2026-1');
  });

  it("'등교개시일' 표기도 받는다", () => {
    expect(findTermStartCandidates([ev('2026-08-17', '등교개시일')])[0]?.startIso).toBe(
      '2026-08-17',
    );
  });

  it('나이스 원본 행사명이 있으면 그쪽을 쓴다(사용자가 제목을 바꿔도 안전)', () => {
    expect(findTermStartCandidates([ev('2026-08-11', '우리 반 첫 만남', '개학식')])[0]?.term).toBe(
      '2026-2',
    );
  });

  it('3월 개학식은 1학기 시작', () => {
    expect(findTermStartCandidates([ev('2026-03-02', '개학식')])).toEqual([
      { term: '2026-1', startIso: '2026-03-02', sourceLabel: '개학식' },
    ]);
  });

  it('같은 학기에 여러 건이면 가장 이른 날짜를 택한다', () => {
    const events = [ev('2026-08-20', '개학식 후속'), ev('2026-08-11', '개학식')];
    expect(findTermStartCandidates(events)[0]?.startIso).toBe('2026-08-11');
  });

  it('1·2학기가 모두 있으면 둘 다 학기순으로 돌려준다', () => {
    const found = findTermStartCandidates([ev('2026-08-11', '개학식'), ev('2026-03-02', '개학식')]);
    expect(found.map((c) => c.term)).toEqual(['2026-1', '2026-2']);
  });

  it('onlyTerms로 관심 학기만 추린다', () => {
    const events = [ev('2026-08-11', '개학식'), ev('2026-03-02', '개학식')];
    expect(findTermStartCandidates(events, ['2026-2']).map((c) => c.term)).toEqual(['2026-2']);
  });
});

describe('findTermStartCandidates — 잡으면 안 되는 경우', () => {
  it('방학식은 개학이 아니다', () => {
    expect(findTermStartCandidates([ev('2026-07-20', '여름방학식')])).toEqual([]);
  });

  it("'방학·개학'이 함께 적힌 모호한 항목은 판단을 보류한다", () => {
    expect(findTermStartCandidates([ev('2026-07-20', '여름방학 및 개학 안내')])).toEqual([]);
  });

  it('2월 개학은 학기 시작이 아니다(겨울방학 뒤 2학기 재개)', () => {
    expect(findTermStartCandidates([ev('2027-02-02', '개학식')])).toEqual([]);
  });

  it('개학과 무관한 행사는 무시한다', () => {
    expect(
      findTermStartCandidates([ev('2026-08-11', '전교조회'), ev('2026-09-01', '체육대회')]),
    ).toEqual([]);
  });

  it('날짜 형식이 깨지면 버린다(추측 금지)', () => {
    expect(findTermStartCandidates([ev('20260811', '개학식')])).toEqual([]);
  });
});

describe('findTermStartCandidate — 이미 등록했으면 다시 제안하지 않는다', () => {
  const events = [ev('2026-08-11', '개학식')];

  it('등록 전에는 후보를 준다', () => {
    expect(findTermStartCandidate(events, '2026-2', undefined)?.startIso).toBe('2026-08-11');
  });

  it('그 학기가 등록돼 있으면 null', () => {
    expect(findTermStartCandidate(events, '2026-2', { '2026-2': '2026-08-18' })).toBeNull();
  });

  it('다른 학기 등록은 방해하지 않는다', () => {
    expect(findTermStartCandidate(events, '2026-2', { '2026-1': '2026-03-02' })?.startIso).toBe(
      '2026-08-11',
    );
  });
});
