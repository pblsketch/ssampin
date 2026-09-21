/**
 * @vitest-environment jsdom
 *
 * QuestionTypeChip — 유형 라벨 + 알 수 없는 유형 관용 처리.
 *
 * 알 수 없는 유형(더 새 버전에서 만든 문항)을 만나도 예외 없이 안내로 대체해야 한다.
 * 이 성질이 깨지면 옛 버전에서 만들기 화면 전체가 흰 화면이 된다.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuestionTypeChip, questionTypeLabel, QUESTION_TYPE_LABELS } from '../QuestionTypeChip';
import { KNOWN_QUESTION_TYPES } from '@domain/entities/multiSurvey/Question';

describe('QuestionTypeChip', () => {
  it('의견 수집 2종 라벨을 보여준다', () => {
    render(<QuestionTypeChip type="wordcloud" />);
    expect(screen.getByText('워드클라우드')).toBeTruthy();
  });

  it('질문받기 라벨을 보여준다', () => {
    render(<QuestionTypeChip type="qna" />);
    expect(screen.getByText('질문받기')).toBeTruthy();
  });

  it('알 수 없는 유형에도 예외 없이 안내를 보여준다', () => {
    expect(() => render(<QuestionTypeChip type="future-type" />)).not.toThrow();
    expect(screen.getByText('알 수 없는 유형')).toBeTruthy();
  });

  it('아는 유형 전부에 라벨이 등록되어 있다', () => {
    // 개수를 숫자로 박아 두면 유형이 늘 때마다 여기부터 깨진다.
    // 실제로 지켜야 할 성질은 "아는 유형에 라벨이 빠지지 않는다"이다.
    expect(Object.keys(QUESTION_TYPE_LABELS).sort()).toEqual([...KNOWN_QUESTION_TYPES].sort());
  });

  it('가치수직선 라벨을 보여준다', () => {
    render(<QuestionTypeChip type="valueline" />);
    expect(screen.getByText('가치수직선')).toBeTruthy();
  });

  it('라벨 조회는 알 수 없는 유형에도 값을 돌려준다', () => {
    expect(questionTypeLabel('wordcloud')).toBe('워드클라우드');
    expect(questionTypeLabel('future-type')).toBe('알 수 없는 유형');
  });
});
