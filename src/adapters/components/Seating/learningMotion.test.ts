/**
 * 이름 학습 연출 규칙 테스트.
 *
 * 실제 애니메이션은 jsdom에서 돌지 않으므로(`element.animate` 없음) 여기서 규칙을 지킨다.
 * 특히 **동작 줄이기 설정을 따르는지**는 접근성 문제라 반드시 그물이 있어야 한다.
 */
import { describe, expect, test } from 'vitest';
import { LEARNING_MOTION_MS, resolveLearningMotion, staggerDelayMs } from './learningMotion';

describe('무엇을 보여줄지 고른다', () => {
  test('맞으면 커졌다 돌아온다', () => {
    expect(
      resolveLearningMotion({ answerState: 'correct', revealed: true, reducedMotion: false }),
    ).toBe('pop');
  });

  test('틀리면 흔든다', () => {
    expect(
      resolveLearningMotion({ answerState: 'wrong', revealed: true, reducedMotion: false }),
    ).toBe('shake');
  });

  test('채점 결과가 공개보다 앞선다 — 둘을 같이 하면 서로 상쇄돼 아무 일도 없어 보인다', () => {
    // 채점된 카드는 언제나 공개 상태이기도 하다. 우선순위가 뒤집히면 정답 표시가 사라진다.
    expect(
      resolveLearningMotion({ answerState: 'correct', revealed: true, reducedMotion: false }),
    ).toBe('pop');
  });

  test('아직 안 풀었고 공개만 됐으면 카드가 넘어간다', () => {
    expect(resolveLearningMotion({ revealed: true, reducedMotion: false })).toBe('reveal');
  });

  test('가려진 카드는 아무 연출도 하지 않는다', () => {
    expect(resolveLearningMotion({ revealed: false, reducedMotion: false })).toBe('none');
  });
});

describe('동작 줄이기 설정을 따른다 (접근성)', () => {
  test.each([
    ['correct' as const, true],
    ['wrong' as const, true],
    [undefined, true],
  ])('answerState=%s revealed=%s 여도 아무 연출도 하지 않는다', (answerState, revealed) => {
    // 어지럼증 때문에 OS에서 동작을 끈 분에게 화면이 흔들리면 쓸 수 없는 기능이 된다.
    expect(resolveLearningMotion({ answerState, revealed, reducedMotion: true })).toBe('none');
  });
});

describe('연출 길이는 기존 모션 토큰에서 온다', () => {
  test('제멋대로인 숫자를 쓰지 않는다', () => {
    // 토큰 밖의 값이 섞이면 앱 전체의 리듬이 조금씩 어긋난다.
    const allowed = [120, 160, 200, 260, 500];
    for (const ms of Object.values(LEARNING_MOTION_MS)) {
      expect(allowed).toContain(ms);
    }
  });
});

describe('못 외운 이름이 차례로 나타나는 간격', () => {
  test('첫 번째는 기다리지 않는다', () => {
    expect(staggerDelayMs(0, 10)).toBe(0);
  });

  test('한 명뿐이면 간격이 없다', () => {
    expect(staggerDelayMs(0, 1)).toBe(0);
  });

  test('명수가 많아도 마지막 이름까지 400ms 안에 끝난다', () => {
    // 30명이 틀렸는데 40ms씩 밀리면 마지막 이름이 1.2초 뒤에 뜬다. 그건 기다림이다.
    const total = 30;
    expect(staggerDelayMs(total - 1, total)).toBeLessThanOrEqual(400);
  });

  test('명수가 적으면 한 명씩 또렷하게 (40ms)', () => {
    expect(staggerDelayMs(1, 4)).toBe(40);
  });
});
