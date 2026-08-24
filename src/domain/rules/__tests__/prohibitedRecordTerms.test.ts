import { describe, expect, it } from 'vitest';
import {
  detectProhibitedTerms,
  hasProhibitedTerms,
  summarizeProhibited,
  PROHIBITED_CATEGORY_LABELS,
} from '@domain/rules/prohibitedRecordTerms';

/**
 * 이 규칙의 목적은 "AI 에 보내기 전에 거른다"이다(ADR-072 결정 5).
 * 실측에서 프롬프트로는 못 막힌 항목들이 여기서 잡혀야 한다.
 */
describe('detectProhibitedTerms — 기재 금지 항목 탐지', () => {
  it('실측 C 사례에서 모델이 세특 본문에 옮겨 적은 항목을 전부 잡는다', () => {
    // docs/03-analysis/record-draft-solar-quality.analysis.md §3-2 의 실제 실패 문장 구성.
    const text =
      '교내 영어 에세이 대회에서 최우수상을 받음. 토익 850점을 취득함. ' +
      '한빛어학원에서 주말마다 첨삭을 받음. 6월 모의고사 영어 1등급을 받음. ' +
      '아버지가 무역회사 임원이라 해외 사례를 자주 접한다고 함.';
    const cats = new Set(detectProhibitedTerms(text).map((h) => h.category));
    expect(cats.has('award')).toBe(true);
    expect(cats.has('language')).toBe(true);
    expect(cats.has('institute')).toBe(true);
    expect(cats.has('examScore')).toBe(true);
    expect(cats.has('family')).toBe(true);
  });

  it.each([
    ['교내 백일장에서 장려상을 받음', 'award'],
    ['정보처리기능사 자격증을 취득함', 'certificate'],
    ['학회에서 논문을 발표함', 'academic'],
    ['특허를 출원함', 'academic'],
    ['교내 장학금을 받음', 'scholarship'],
    ['방과후학교 심화반을 수강함', 'afterSchool'],
    ['여름에 해외연수를 다녀옴', 'overseas'],
  ])('%s → %s 로 잡는다', (text, category) => {
    expect(detectProhibitedTerms(text).some((h) => h.category === category)).toBe(true);
  });

  it('상으로서의 대상은 문맥이 있을 때만 잡는다 — "분석 대상"은 통과시킨다', () => {
    expect(hasProhibitedTerms('분석 대상 자료를 스스로 골라 정리함')).toBe(false);
    expect(hasProhibitedTerms('지원 대상 학생을 먼저 챙김')).toBe(false);
    expect(
      detectProhibitedTerms('교내 대회에서 대상을 수상함').some((h) => h.term === '대상'),
    ).toBe(true);
  });

  it('대학원은 학원으로 잡지 않는다(취소 접두사)', () => {
    expect(hasProhibitedTerms('대학원 진학을 희망한다고 밝힘')).toBe(false);
    expect(
      detectProhibitedTerms('학원에서 배운 내용을 언급함').some((h) => h.term === '학원'),
    ).toBe(true);
  });

  it('부모 지칭어 단독은 잡지 않는다 — 직업어가 함께 있을 때만', () => {
    expect(hasProhibitedTerms('어머니와 상담을 진행함')).toBe(false);
    expect(hasProhibitedTerms('아버지가 회사에 근무한다고 함')).toBe(true);
  });

  it('정상 업무어를 막지 않는다 — 진단평가·성취도 등급', () => {
    // 진단/등급을 사전에 넣으면 정상 근거가 통째로 잘린다(오탐이 기능을 죽인다).
    expect(hasProhibitedTerms('진단평가 결과를 스스로 분석해 오답 노트를 만듦')).toBe(false);
    expect(hasProhibitedTerms('성취도 등급 A 에 해당하는 과제 수행을 보임')).toBe(false);
  });

  it('빈 입력과 비문자열을 안전하게 다룬다', () => {
    expect(detectProhibitedTerms('')).toEqual([]);
    expect(detectProhibitedTerms(undefined as unknown as string)).toEqual([]);
  });

  it('같은 표현이 여러 번 나와도 한 번만 보고한다', () => {
    const hits = detectProhibitedTerms('수상 경력과 수상 소감을 적음');
    expect(hits.filter((h) => h.term === '수상')).toHaveLength(1);
  });

  it('summarizeProhibited 는 갈래를 한국어 라벨로 중복 없이 돌려준다', () => {
    const hits = detectProhibitedTerms('토익 점수와 토플 점수를 밝힘');
    expect(summarizeProhibited(hits)).toEqual([PROHIBITED_CATEGORY_LABELS.language]);
  });
});
