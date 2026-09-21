import { describe, it, expect } from 'vitest';
import {
  normalizeWord,
  splitWordInput,
  tallyWords,
  countSubmittedWords,
  scaleFontSize,
} from './wordCloudTally';

describe('normalizeWord — 기존 도구와 동일 동작 보존', () => {
  it('앞뒤 공백을 없애고 소문자로 만든다', () => {
    expect(normalizeWord('  Apple ')).toBe('apple');
  });

  it('내부 연속 공백을 하나로 줄인다', () => {
    expect(normalizeWord('가을   하늘')).toBe('가을 하늘');
  });

  it('빈 문자열은 빈 문자열', () => {
    expect(normalizeWord('   ')).toBe('');
  });
});

describe('splitWordInput', () => {
  const opts = { maxWords: 3, maxWordLength: 10 };

  it('쉼표로 나눈다', () => {
    expect(splitWordInput('사과, 바나나, 포도', opts)).toEqual(['사과', '바나나', '포도']);
  });

  it('상한 개수를 넘으면 앞에서부터 상한만 받는다', () => {
    expect(splitWordInput('하나,둘,셋,넷,다섯', opts)).toEqual(['하나', '둘', '셋']);
  });

  it('글자 수 상한을 넘으면 잘라낸다', () => {
    expect(splitWordInput('열두글자가넘는단어입니다', opts)).toEqual(['열두글자가넘는단어입']);
  });

  it('같은 학생의 중복 단어는 한 번만 센다 (대소문자 무시)', () => {
    expect(splitWordInput('Apple, apple, APPLE', opts)).toEqual(['Apple']);
  });

  it('빈 조각과 공백만 있는 조각은 버린다', () => {
    expect(splitWordInput('사과,, ,포도', opts)).toEqual(['사과', '포도']);
  });

  it('원래 표기를 보존한다 (정규화된 값이 아니다)', () => {
    expect(splitWordInput('Apple', opts)).toEqual(['Apple']);
  });

  it('상한이 0 이하면 아무것도 받지 않는다', () => {
    expect(splitWordInput('사과', { maxWords: 0, maxWordLength: 10 })).toEqual([]);
    expect(splitWordInput('사과', { maxWords: 3, maxWordLength: 0 })).toEqual([]);
  });

  it('한글 쉼표도 구분자로 본다', () => {
    expect(splitWordInput('사과、포도', opts)).toEqual(['사과', '포도']);
  });
});

describe('tallyWords', () => {
  it('같은 단어를 합산하고 빈도 내림차순으로 정렬한다', () => {
    const result = tallyWords([['사과', '포도'], ['사과'], ['사과', '바나나']]);
    expect(result.map((e) => [e.word, e.count])).toEqual([
      ['사과', 3],
      ['포도', 1],
      ['바나나', 1],
    ]);
  });

  it('대소문자·공백 차이는 같은 단어로 묶고 첫 표기를 보여준다', () => {
    const result = tallyWords([['Apple'], ['apple'], ['  APPLE  ']]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ word: 'Apple', normalized: 'apple', count: 3 });
  });

  it('교사가 숨긴 단어는 집계에서 완전히 빠진다', () => {
    const result = tallyWords([['사과', '바보'], ['바보']], ['바보']);
    expect(result.map((e) => e.normalized)).toEqual(['사과']);
  });

  it('숨긴 단어 판정도 정규화 기준이다', () => {
    const result = tallyWords([['Bad'], ['bad']], ['  BAD ']);
    expect(result).toEqual([]);
  });

  it('문자열 하나로 온 응답도 받아들인다', () => {
    expect(tallyWords(['사과', ['사과']])).toEqual([
      { word: '사과', normalized: '사과', count: 2 },
    ]);
  });

  it('빈 응답은 무시한다', () => {
    expect(tallyWords([[''], ['   '], []])).toEqual([]);
  });

  it('같은 빈도면 처음 등장한 순서를 유지한다', () => {
    const result = tallyWords([['가'], ['나'], ['다']]);
    expect(result.map((e) => e.word)).toEqual(['가', '나', '다']);
  });
});

describe('countSubmittedWords', () => {
  it('숨긴 단어를 뺀 제출 단어 수를 센다', () => {
    expect(countSubmittedWords([['사과', '포도'], ['사과']])).toBe(3);
    expect(countSubmittedWords([['사과', '포도'], ['사과']], ['사과'])).toBe(1);
  });
});

describe('scaleFontSize — 기존 공식 보존', () => {
  const range = { minCount: 1, maxCount: 5, minFont: 14, maxFont: 64 };

  it('최소 빈도는 최소 크기', () => {
    expect(scaleFontSize(1, range)).toBe(14);
  });

  it('최대 빈도는 최대 크기', () => {
    expect(scaleFontSize(5, range)).toBe(64);
  });

  it('중간 빈도는 선형 보간', () => {
    expect(scaleFontSize(3, range)).toBe(39);
  });

  it('빈도 폭이 0이면 중간 크기로 고정', () => {
    expect(scaleFontSize(2, { minCount: 2, maxCount: 2, minFont: 14, maxFont: 64 })).toBe(39);
  });
});
