import { describe, expect, it } from 'vitest';
import { questionCatalog, createParticipationQuestion } from '../questionCatalog';
import {
  QUESTION_GROUPS,
  groupOfFormat,
  groupOfQuestion,
  hasStyleFor,
  iconOfFormat,
  iconOfQuestion,
} from '../questionTypeStyle';
import { KNOWN_QUESTION_TYPES } from '@domain/entities/multiSurvey/Question';

describe('문항 유형의 시각 언어', () => {
  it('목록에 있는 유형에는 색과 아이콘이 모두 있다', () => {
    for (const item of questionCatalog) {
      expect(hasStyleFor(item.type), item.type).toBe(true);
      expect(iconOfFormat(item.type)).not.toBe('help');
    }
  });

  it('저장된 옛 유형도 빠짐없이 표에 있다 — 목록에서 뺀 유형까지', () => {
    for (const type of KNOWN_QUESTION_TYPES) expect(hasStyleFor(type), type).toBe(true);
  });

  it('무리는 퀴즈·토론·설문 셋이고 서로 다른 색을 쓴다', () => {
    const groups = Object.values(QUESTION_GROUPS);
    expect(groups.map((g) => g.label)).toEqual(['퀴즈', '토론', '설문']);
    expect(new Set(groups.map((g) => g.text)).size).toBe(3);
    // 파괴적 액션(빨강)과 비활성(회색)의 뜻을 침범하지 않는다.
    for (const g of groups) {
      expect(g.text).not.toContain('sp-error');
      expect(g.text).not.toContain('sp-muted');
    }
  });

  it('돌려받고 싶은 것이 같으면 같은 무리에 들어간다', () => {
    // 정답을 맞히는 것
    for (const format of ['multiple', 'ox', 'short', 'blank', 'order', 'pin', 'numeric'] as const)
      expect(groupOfFormat(format).key, format).toBe('quiz');
    // 입장·글을 나누는 것
    for (const format of ['valueline', 'trafficlight', 'brainstorm', 'text', 'wordcloud'] as const)
      expect(groupOfFormat(format).key, format).toBe('debate');
    // 분포를 보는 것
    for (const format of ['single-choice', 'multi-choice', 'ranking', 'allocation'] as const)
      expect(groupOfFormat(format).key, format).toBe('survey');
  });

  it('같은 객관식이라도 정답을 쓰면 퀴즈, 쓰지 않으면 설문이다', () => {
    expect(groupOfFormat('multiple').key).toBe('quiz');
    expect(groupOfFormat('single-choice').key).toBe('survey');
  });

  it('신호등은 단일 선택으로 저장되지만 제 아이콘을 유지한다', () => {
    const traffic = createParticipationQuestion('trafficlight', '찬반', 't');
    expect(traffic.type).toBe('single-choice');
    expect(iconOfQuestion(traffic)).toBe(iconOfFormat('trafficlight'));
    // single-choice 로 저장되지만 본래 무리는 토론이다.
    expect(groupOfQuestion(traffic).key).toBe('debate');
  });

  it('투명도 수식이 섞이지 않는다 — 이 저장소에서는 클래스가 생성되지 않는다', () => {
    for (const g of Object.values(QUESTION_GROUPS))
      for (const value of [g.text, g.fill, g.border]) expect(value).not.toMatch(/\/\d/);
  });
});
