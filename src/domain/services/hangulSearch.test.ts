import { describe, expect, it } from 'vitest';
import { toChosungString, isChosungQuery } from './hangulSearch';

describe('toChosungString', () => {
  it('완성형 한글을 초성으로 변환', () => {
    expect(toChosungString('시간표')).toBe('ㅅㄱㅍ');
    expect(toChosungString('안녕하세요')).toBe('ㅇㄴㅎㅅㅇ');
    expect(toChosungString('한국')).toBe('ㅎㄱ');
  });

  it('쌍자음 초성도 정확히', () => {
    expect(toChosungString('빠른')).toBe('ㅃㄹ');
    expect(toChosungString('따옴표')).toBe('ㄸㅇㅍ');
  });

  it('비한글 문자(영문·숫자·기호)는 그대로 통과', () => {
    expect(toChosungString('todo')).toBe('todo');
    expect(toChosungString('할일 todo 2개')).toBe('ㅎㅇ todo 2ㄱ');
  });

  it('이미 초성인 문자는 그대로 통과', () => {
    expect(toChosungString('ㅅㄱㅍ')).toBe('ㅅㄱㅍ');
  });

  it('빈 문자열은 빈 문자열', () => {
    expect(toChosungString('')).toBe('');
  });
});

describe('isChosungQuery', () => {
  it('전부 초성이면 true', () => {
    expect(isChosungQuery('ㅅㄱㅍ')).toBe(true);
    expect(isChosungQuery('ㅎ')).toBe(true);
    expect(isChosungQuery('ㄲㅃ')).toBe(true);
  });

  it('완성형 한글이 섞이면 false', () => {
    expect(isChosungQuery('시간표')).toBe(false);
    expect(isChosungQuery('ㅅ간')).toBe(false);
  });

  it('영문·숫자가 섞이면 false', () => {
    expect(isChosungQuery('ㅅk')).toBe(false);
    expect(isChosungQuery('todo')).toBe(false);
  });

  it('모음만 있으면 false (초성 목록에 없음)', () => {
    expect(isChosungQuery('ㅏ')).toBe(false);
  });

  it('빈 문자열은 false', () => {
    expect(isChosungQuery('')).toBe(false);
  });
});
