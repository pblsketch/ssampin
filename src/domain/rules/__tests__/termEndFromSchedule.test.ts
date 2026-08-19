import { describe, it, expect } from 'vitest';
import {
  findTermEndCandidates,
  findTermEndCandidate,
  type ScheduleEventLike,
} from '../termEndFromSchedule';

function ev(date: string, title: string, neisEventName?: string): ScheduleEventLike {
  return neisEventName === undefined ? { date, title } : { date, title, neisEventName };
}

describe('findTermEndCandidates — 학기 종료일 후보 찾기', () => {
  it('B-b1: 겨울방학식이 있으면 그 날짜가 2학기 종료일 후보로 나온다', () => {
    const got = findTermEndCandidates([ev('2026-12-31', '겨울방학식')]);
    expect(got).toEqual([{ term: '2026-2', endIso: '2026-12-31', sourceLabel: '겨울방학식' }]);
  });

  it('여름방학식은 1학기 종료일 후보가 된다', () => {
    const got = findTermEndCandidates([ev('2026-07-18', '여름방학식')]);
    expect(got).toEqual([{ term: '2026-1', endIso: '2026-07-18', sourceLabel: '여름방학식' }]);
  });

  it('종업식도 인식한다', () => {
    const got = findTermEndCandidates([ev('2027-01-05', '종업식')]);
    // 1월 행사는 직전 학년도(2026학년도) 2학기 소속이다
    expect(got).toEqual([{ term: '2026-2', endIso: '2027-01-05', sourceLabel: '종업식' }]);
  });

  it('2월 종업식도 직전 학년도 2학기로 붙는다', () => {
    const got = findTermEndCandidates([ev('2027-02-12', '종업식')]);
    expect(got[0]?.term).toBe('2026-2');
  });

  it('B-b2: 개학이 함께 적힌 모호한 항목은 버린다', () => {
    // '방학'이 들어 있지만 시작인지 끝인지 이름만으로 갈리지 않는다 → 추측 금지
    expect(findTermEndCandidates([ev('2026-08-01', '방학·개학 안내')])).toEqual([]);
    expect(findTermEndCandidates([ev('2026-08-17', '여름방학 종료 및 개학')])).toEqual([]);
  });

  it('학기 끝과 무관한 행사는 후보가 아니다', () => {
    const got = findTermEndCandidates([
      ev('2026-10-09', '한글날'),
      ev('2026-10-15', '중간고사'),
      ev('2026-09-25', '체육대회'),
    ]);
    expect(got).toEqual([]);
  });

  it('졸업식은 받지 않는다 — 3학년만 해당하는 행사라 학기 종료일과 다를 수 있다', () => {
    expect(findTermEndCandidates([ev('2027-01-08', '졸업식')])).toEqual([]);
  });

  it('8월 항목은 받지 않는다 — 대부분 2학기 개학이 있는 달이라 끝이 아니다', () => {
    expect(findTermEndCandidates([ev('2026-08-14', '여름방학')])).toEqual([]);
  });

  it('이름에 학기가 적혀 있으면 달보다 그 표기를 믿는다', () => {
    const got = findTermEndCandidates([ev('2026-12-24', '1학기 방학식')]);
    expect(got[0]?.term).toBe('2026-1');
  });

  it('나이스 원본 행사명이 있으면 그쪽을 우선한다', () => {
    const got = findTermEndCandidates([ev('2026-12-31', '내가 고친 제목', '겨울방학식')]);
    expect(got[0]?.sourceLabel).toBe('겨울방학식');
  });

  it('같은 학기에 여러 후보가 있으면 가장 이른 날짜를 택한다', () => {
    // 겨울방학식(12/31) 뒤의 종업식(1/5)은 수업이 없는 하루짜리 등교일이다.
    // 우리가 원하는 건 "정규 수업이 멈추는 날"이므로 이른 쪽이 맞다.
    const got = findTermEndCandidates([ev('2027-01-05', '종업식'), ev('2026-12-31', '겨울방학식')]);
    expect(got).toHaveLength(1);
    expect(got[0]?.endIso).toBe('2026-12-31');
  });

  it('onlyTerms로 관심 학기만 추린다', () => {
    const events = [ev('2026-07-18', '여름방학식'), ev('2026-12-31', '겨울방학식')];
    expect(findTermEndCandidates(events, ['2026-2'])).toHaveLength(1);
    expect(findTermEndCandidates(events, ['2026-2'])[0]?.term).toBe('2026-2');
  });

  it('날짜 형식이 틀린 항목은 조용히 버린다 (예외를 던지지 않는다)', () => {
    expect(findTermEndCandidates([ev('2026/12/31', '겨울방학식'), ev('', '종업식')])).toEqual([]);
  });

  it('결과는 학기 라벨 순으로 정렬된다', () => {
    const got = findTermEndCandidates([
      ev('2026-12-31', '겨울방학식'),
      ev('2026-07-18', '여름방학식'),
    ]);
    expect(got.map((c) => c.term)).toEqual(['2026-1', '2026-2']);
  });
});

describe('findTermEndCandidate — 단일 학기 후보', () => {
  it('이미 등록된 학기는 다시 제안하지 않는다', () => {
    const events = [ev('2026-12-31', '겨울방학식')];
    expect(findTermEndCandidate(events, '2026-2', { '2026-2': '2026-12-24' })).toBeNull();
  });

  it('등록되지 않은 학기는 후보를 준다', () => {
    const events = [ev('2026-12-31', '겨울방학식')];
    expect(findTermEndCandidate(events, '2026-2', {})?.endIso).toBe('2026-12-31');
    expect(findTermEndCandidate(events, '2026-2', undefined)?.endIso).toBe('2026-12-31');
  });

  it('후보가 없으면 null', () => {
    expect(findTermEndCandidate([ev('2026-10-09', '한글날')], '2026-2', {})).toBeNull();
  });
});
