import { describe, it, expect } from 'vitest';
import { findRepeatedKeyword, type KeywordScanEntry } from './attendanceKeywordRules';

const entry = (date: string, studentNumber: number, text: string): KeywordScanEntry => ({
  date,
  studentNumber,
  text,
});

describe('findRepeatedKeyword (출결 사유 반복 경고, M2)', () => {
  const keywords = ['생리통', '병원'];

  it('같은 달·같은 학생의 선행 기록에 같은 키워드가 있으면 매치를 반환한다', () => {
    const hit = findRepeatedKeyword({
      entries: [entry('2026-07-03', 1, '생리통으로 결석')],
      keywords,
      studentNumber: 1,
      date: '2026-07-13',
      text: '생리통',
    });
    expect(hit).toEqual({ keyword: '생리통', priorDate: '2026-07-03' });
  });

  it('선행 기록이 여러 건이면 가장 최근 날짜를 반환한다', () => {
    const hit = findRepeatedKeyword({
      entries: [entry('2026-07-01', 1, '생리통'), entry('2026-07-08', 1, '생리통 재발')],
      keywords,
      studentNumber: 1,
      date: '2026-07-13',
      text: '생리통',
    });
    expect(hit?.priorDate).toBe('2026-07-08');
  });

  it('월 경계 — 전월 기록만 있으면 경고하지 않는다', () => {
    const hit = findRepeatedKeyword({
      entries: [entry('2026-06-30', 1, '생리통')],
      keywords,
      studentNumber: 1,
      date: '2026-07-01',
      text: '생리통',
    });
    expect(hit).toBeNull();
  });

  it('같은 날짜 엔트리(지금 편집 중인 기록)는 선행 기록으로 치지 않는다', () => {
    const hit = findRepeatedKeyword({
      entries: [entry('2026-07-13', 1, '생리통')],
      keywords,
      studentNumber: 1,
      date: '2026-07-13',
      text: '생리통',
    });
    expect(hit).toBeNull();
  });

  it('다른 학생의 기록은 보지 않는다', () => {
    const hit = findRepeatedKeyword({
      entries: [entry('2026-07-03', 2, '생리통')],
      keywords,
      studentNumber: 1,
      date: '2026-07-13',
      text: '생리통',
    });
    expect(hit).toBeNull();
  });

  it('substring 매치 — 키워드가 문장 일부여도 매치한다 (대소문자 무시)', () => {
    const hit = findRepeatedKeyword({
      entries: [entry('2026-07-03', 1, '오전 병원 진료 후 등교')],
      keywords: ['Hospital', '병원'],
      studentNumber: 1,
      date: '2026-07-13',
      text: '병원 예약',
    });
    expect(hit?.keyword).toBe('병원');

    const eng = findRepeatedKeyword({
      entries: [entry('2026-07-03', 1, 'HOSPITAL 방문')],
      keywords: ['hospital'],
      studentNumber: 1,
      date: '2026-07-13',
      text: 'Hospital 재방문',
    });
    expect(eng?.keyword).toBe('hospital');
  });

  it("오탐 경계 — '원' 등록 시 '병원'도 매치된다 (단어 경계 없음을 명세)", () => {
    const hit = findRepeatedKeyword({
      entries: [entry('2026-07-03', 1, '학원 상담')],
      keywords: ['원'],
      studentNumber: 1,
      date: '2026-07-13',
      text: '병원 진료',
    });
    // substring 정책상 매치되는 것이 명세된 동작이다 — 완화는 구체적 키워드 등록으로.
    expect(hit?.keyword).toBe('원');
  });

  it('저장 중인 텍스트에 키워드가 없으면 선행 기록과 무관하게 null', () => {
    const hit = findRepeatedKeyword({
      entries: [entry('2026-07-03', 1, '생리통')],
      keywords,
      studentNumber: 1,
      date: '2026-07-13',
      text: '감기',
    });
    expect(hit).toBeNull();
  });

  it('키워드 목록이 비어 있으면 항상 null (기본 제공 키워드 0개)', () => {
    const hit = findRepeatedKeyword({
      entries: [entry('2026-07-03', 1, '생리통')],
      keywords: [],
      studentNumber: 1,
      date: '2026-07-13',
      text: '생리통',
    });
    expect(hit).toBeNull();
  });

  it('공백뿐인 키워드는 무시한다', () => {
    const hit = findRepeatedKeyword({
      entries: [entry('2026-07-03', 1, '아무 내용')],
      keywords: ['  ', ''],
      studentNumber: 1,
      date: '2026-07-13',
      text: '아무 내용',
    });
    expect(hit).toBeNull();
  });
});
