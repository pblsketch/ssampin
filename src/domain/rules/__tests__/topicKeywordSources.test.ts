import { describe, it, expect } from 'vitest';
import { matchedKeywords, topicMatchKeywords, topicTitleCandidates } from '../topicKeywordSources';

describe('topicTitleCandidates — 주제 이름 후보', () => {
  it('★수행평가 이름이 1순위, 그다음 과제 제목, 성취기준 키워드 순이다(오너 결정)', () => {
    const out = topicTitleCandidates({
      assessmentTitles: ['논설문 쓰기', '탐구 보고서'],
      assignmentTitles: ['프레이밍 설문 보고서'],
      standardKeywords: ['일차함수', '그래프'],
    });
    expect(out.map((c) => c.source)).toEqual([
      'assessment',
      'assessment',
      'assignment',
      'standard',
      'standard',
    ]);
    expect(out[0]).toEqual({ title: '논설문 쓰기', source: 'assessment' });
  });

  it('같은 이름이 여러 출처에 있으면 앞 출처(수행평가)를 남긴다', () => {
    const out = topicTitleCandidates({
      assessmentTitles: ['탐구 보고서'],
      assignmentTitles: [' 탐구 보고서 '],
    });
    expect(out).toEqual([{ title: '탐구 보고서', source: 'assessment' }]);
  });

  it('빈 값·공백은 버리고, 아무 원천이 없으면 빈 배열이다', () => {
    expect(topicTitleCandidates({ assessmentTitles: ['', '  '] })).toEqual([]);
    expect(topicTitleCandidates({})).toEqual([]);
  });
});

describe('topicMatchKeywords — 매칭 키워드', () => {
  it('교사 직접 입력 → 루브릭 요소 → 성취기준 순으로 합치고 중복은 제거한다', () => {
    expect(
      topicMatchKeywords({
        manual: ['프레이밍'],
        rubricCriterionNames: ['자료 해석', '프레이밍'],
        standardKeywords: ['합리적 선택'],
      }),
    ).toEqual(['프레이밍', '자료 해석', '합리적 선택']);
  });
});

describe('matchedKeywords — "이것도 이 주제?" 의 근거', () => {
  it('본문에 든 키워드만 돌려준다(공백 차이는 무시)', () => {
    expect(
      matchedKeywords('설문 결과를 자료해석 관점에서 정리함', ['자료 해석', '실험', '설문']),
    ).toEqual(['자료 해석', '설문']);
  });

  it('두 글자 미만 키워드는 아무 데나 걸리므로 제외한다', () => {
    expect(matchedKeywords('수학 수업', ['수', '수학'])).toEqual(['수학']);
  });

  it('본문이 비면 빈 배열이다', () => {
    expect(matchedKeywords('   ', ['수학'])).toEqual([]);
  });
});
