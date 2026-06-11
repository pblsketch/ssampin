import { describe, expect, it } from 'vitest';
import { matchesSignatureName } from './signatureNameSearch';

describe('matchesSignatureName — 서명 페이지 이름 검색', () => {
  it('빈 검색어는 모두 일치한다', () => {
    expect(matchesSignatureName('홍길동', '')).toBe(true);
    expect(matchesSignatureName('홍길동', '  ')).toBe(true);
  });

  it('부분 일치: 이름의 일부로 찾는다', () => {
    expect(matchesSignatureName('홍길동', '길동')).toBe(true);
    expect(matchesSignatureName('홍길동', '홍')).toBe(true);
    expect(matchesSignatureName('홍길동', '김')).toBe(false);
  });

  it('초성 검색: ㅎㄱㄷ → 홍길동', () => {
    expect(matchesSignatureName('홍길동', 'ㅎㄱㄷ')).toBe(true);
    expect(matchesSignatureName('홍길동', 'ㄱㄷ')).toBe(true); // 부분 초성
    expect(matchesSignatureName('김영희', 'ㅎㄱㄷ')).toBe(false);
  });

  it('초성+완성형 혼합 검색어는 초성 매칭을 적용하지 않는다 (오탐 방지)', () => {
    expect(matchesSignatureName('홍길동', '홍ㄱ')).toBe(false);
  });

  it('이름 안 공백과 영문 대소문자를 무시한다', () => {
    expect(matchesSignatureName('John Smith', 'john')).toBe(true);
    expect(matchesSignatureName('남궁 민수', '궁민')).toBe(true);
  });
});
