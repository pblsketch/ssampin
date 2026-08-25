/**
 * 조사 고르기 (2026-08-25 실사용)
 *
 * 루브릭 채점 요청에서 선생님이 본 문구가 "어느 평가 요소**을(를)** 알 수 없어서" 였다.
 * 쓰기 도구가 거절할 때 화면에 남는 것은 이 한 줄뿐이라, 여기가 깨지면 안내가 아니라
 * 흠집으로 읽힌다.
 */
import { describe, expect, it } from 'vitest';

import { endsWithJongsung, particle } from '../koreanParticle';

describe('받침 판정', () => {
  it.each([
    ['수준', true],
    ['할 일', true],
    ['학생', true],
    ['수업반', true],
    ['평가 기준표', false],
    ['평가 요소', false],
    ['메모', false],
    ['즐겨찾기', false],
  ])('%s -> 받침 %s', (word, expected) => {
    expect(endsWithJongsung(word)).toBe(expected);
  });

  it('한글이 아닌 글자로 끝나면 받침 없음으로 본다', () => {
    expect(endsWithJongsung('todo')).toBe(false);
    expect(endsWithJongsung('3-1')).toBe(false);
    expect(endsWithJongsung('')).toBe(false);
  });

  it('꼬리 공백은 무시한다 — 앞말의 마지막 글자로 판단한다', () => {
    expect(endsWithJongsung('수준  ')).toBe(true);
  });
});

describe('★실제 문구가 자연스럽게 나온다', () => {
  it.each([
    ['평가 요소', '를'],
    ['수준', '을'],
    ['평가 기준표', '를'],
    ['할 일', '을'],
  ])('%s%s', (what, expected) => {
    expect(particle(what, '을', '를')).toBe(expected);
  });

  it('신고된 문구가 더는 "요소을(를)" 이 아니다', () => {
    const what = '어느 평가 요소';
    expect(`${what}${particle(what, '을', '를')} 알 수 없어서 만들지 않았어요.`).toBe(
      '어느 평가 요소를 알 수 없어서 만들지 않았어요.',
    );
  });

  it('은/는, 이/가도 같은 규칙이다', () => {
    expect(particle('장보기', '은', '는')).toBe('는');
    expect(particle('결석', '은', '는')).toBe('은');
    expect(particle('만점', '이', '가')).toBe('이');
    expect(particle('비평', '이', '가')).toBe('이');
  });
});
