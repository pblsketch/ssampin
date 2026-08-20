/**
 * @vitest-environment jsdom
 *
 * 얼굴 카드 연출 렌더 테스트.
 *
 * 실제 움직임은 jsdom에서 재현할 수 없으므로(`element.animate` 없음), 카드가 **어떤 연출을
 * 하기로 정했는지**를 `data-learning-motion` 으로 확인한다. 화면과 규칙이 갈라지지 않도록
 * 이 값은 `resolveLearningMotion` 이 그대로 내려 준 것이다.
 */
import { describe, expect, test, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LearningCard } from './LearningCard';

/** OS의 "동작 줄이기" 설정을 흉내 낸다 */
function stubReducedMotion(reduced: boolean): void {
  (window as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}

beforeEach(() => stubReducedMotion(false));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderCard(overrides: Partial<Parameters<typeof LearningCard>[0]> = {}) {
  render(
    <LearningCard
      studentNumber={3}
      studentName="김민수"
      revealed={false}
      highlighted={false}
      onClick={() => {}}
      {...overrides}
    />,
  );
  return screen.getByRole('button');
}

describe('카드가 고른 연출', () => {
  test('맞으면 커졌다 돌아온다', () => {
    expect(renderCard({ revealed: true, answerState: 'correct' })).toHaveProperty(
      'dataset.learningMotion',
      'pop',
    );
  });

  test('틀리면 흔든다', () => {
    expect(renderCard({ revealed: true, answerState: 'wrong' })).toHaveProperty(
      'dataset.learningMotion',
      'shake',
    );
  });

  test('공개만 되면 카드가 넘어간다', () => {
    expect(renderCard({ revealed: true })).toHaveProperty('dataset.learningMotion', 'reveal');
  });

  test('가려진 카드는 가만히 있는다', () => {
    expect(renderCard()).toHaveProperty('dataset.learningMotion', 'none');
  });
});

describe('동작 줄이기 설정에서는 아무것도 움직이지 않는다', () => {
  test('맞아도 움직이지 않는다', () => {
    stubReducedMotion(true);

    expect(renderCard({ revealed: true, answerState: 'correct' })).toHaveProperty(
      'dataset.learningMotion',
      'none',
    );
  });

  test('그래도 정답/오답 표시(테두리 색)는 그대로 남는다 — 연출만 빼고 정보는 남긴다', () => {
    stubReducedMotion(true);

    const card = renderCard({ revealed: true, answerState: 'correct' });

    expect(card.className).toContain('ring-green-400');
  });
});

describe('연출이 없어도 카드는 정상이다', () => {
  test('jsdom 처럼 animate 가 없는 환경에서도 이름이 보인다', () => {
    // 구형 환경에서 연출 코드가 터지면 카드 전체가 안 그려진다. 연출은 없어도 되지만
    // 이름은 반드시 보여야 한다.
    renderCard({ revealed: true, answerState: 'correct' });

    expect(screen.getByText('김민수')).toBeTruthy();
  });
});
