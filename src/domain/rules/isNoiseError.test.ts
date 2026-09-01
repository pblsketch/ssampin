import { describe, it, expect } from 'vitest';
import { isNoiseError } from './isNoiseError';

describe('isNoiseError — 통계를 덮는 잡음만 걸러 낸다', () => {
  it('ResizeObserver 알림은 잡음이다 — 8월 오류 5,888건 중 5,715건이 이 한 줄이었다', () => {
    expect(isNoiseError('ResizeObserver loop completed with undelivered notifications.')).toBe(
      true,
    );
    expect(isNoiseError('ResizeObserver loop limit exceeded')).toBe(true);
  });

  it('앞에 다른 말이 붙어 와도 알아본다', () => {
    expect(isNoiseError('Uncaught ResizeObserver loop limit exceeded')).toBe(true);
  });

  it('★진짜 결함은 절대 거르지 않는다 — 거르면 조용히 숨기게 된다', () => {
    // 이건 실제로 버튼이 아무 동작도 안 하던 결함이었다(168건·18명).
    expect(isNoiseError('prompt() is not supported.')).toBe(false);
    expect(
      isNoiseError("Uncaught TypeError: Cannot read properties of undefined (reading 'members')"),
    ).toBe(false);
    expect(isNoiseError('Unhandled rejection')).toBe(false);
    expect(isNoiseError('')).toBe(false);
  });

  it('"Observer" 가 들어갔다고 무조건 거르지 않는다', () => {
    expect(isNoiseError('IntersectionObserver callback threw')).toBe(false);
  });
});
