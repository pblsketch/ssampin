import { describe, expect, it } from 'vitest';
import {
  detectProhibitedTerms,
  hasProhibitedTerms,
  summarizeProhibited,
  substituteProhibited,
  summarizeSubstitutions,
  rewriteHintFor,
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

describe('대체어 — 낱말만 걸린 근거를 살린다 (2026-09-09)', () => {
  it('체육대회는 체육행사로 바뀌고, 바꾼 뒤에는 금지 항목이 남지 않는다', () => {
    const r = substituteProhibited(
      '체육대회 준비물이 부족하자 자기 것을 먼저 빌려주고 마지막에 챙김.',
    );
    expect(r.text).toContain('체육행사');
    expect(r.text).not.toContain('체육대회');
    expect(r.applied).toEqual([{ from: '체육대회', to: '체육행사' }]);
    expect(detectProhibitedTerms(r.text)).toEqual([]);
  });

  it('★일반 규칙(대회 → 행사)을 두지 않는다 — 경진대회가 경진행사가 되어 필터를 통과한다', () => {
    for (const t of [
      '경진대회에 참여함.',
      '공모전에 출품함.',
      '올림피아드를 준비함.',
      '교내 독서대회에 나감.',
    ]) {
      const r = substituteProhibited(t);
      expect(r.applied).toEqual([]);
      expect(detectProhibitedTerms(r.text).length).toBeGreaterThan(0);
    }
  });

  it("살릴 수 없는 '대회' 근거에는 선생님이 고쳐 적는 법을 알려 준다", () => {
    const hint = rewriteHintFor(detectProhibitedTerms('교내 독서대회에 나감.'));
    expect(hint).toContain('이름을 바꿔 적으시면');
    expect(rewriteHintFor(detectProhibitedTerms('토익 점수를 받음.'))).toBe('');
  });

  it('수상 결과가 함께 적혀 있으면 하나도 바꾸지 않는다 — 진짜 수상 기록이다', () => {
    for (const t of [
      '교내 체육대회에서 우승함.',
      '체육대회에 나가 최우수상을 받음.',
      '체육대회 1등으로 시상대에 오름.',
    ]) {
      const r = substituteProhibited(t);
      expect(r.applied).toEqual([]);
      expect(r.text).toBe(t);
      expect(detectProhibitedTerms(t).length).toBeGreaterThan(0);
    }
  });

  it('바꿀 것이 없으면 원문 그대로 돌려준다', () => {
    const t = '모둠 발표에서 자료 정리를 맡음.';
    const r = substituteProhibited(t);
    expect(r.text).toBe(t);
    expect(r.applied).toEqual([]);
  });

  it('무엇을 바꿨는지 한 줄로 요약한다', () => {
    const r = substituteProhibited('체육대회 준비물을 챙김.');
    expect(summarizeSubstitutions(r.applied)).toBe('바꿔 보낸 말 1건 (체육대회 → 체육행사)');
    expect(summarizeSubstitutions([])).toBe('');
  });
});
