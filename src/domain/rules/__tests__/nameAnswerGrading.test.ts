/**
 * "이름 쓰기" 채점 규칙.
 *
 * 여기서 지키는 핵심: **한 글자만 달라도 오답이다.**
 * `김민수`/`김민서`가 같은 반에 있을 수 있고, 그 둘을 구분하는 게 이 기능의 목적이라
 * 비슷하면 맞다고 봐주는 규칙은 학습 자체를 망친다. (오너 확정: 재시도·부분점수 없음)
 */
import { describe, it, expect } from 'vitest';
import {
  acceptedNamesFor,
  gradeNameAnswer,
  normalizeNameAnswer,
  toChosungHint,
} from '@domain/rules/nameAnswerGrading';

describe('normalizeNameAnswer', () => {
  it('공백을 모두 없앤다', () => {
    expect(normalizeNameAnswer(' 남궁 민수 ')).toBe('남궁민수');
    expect(normalizeNameAnswer('강\t나\n영')).toBe('강나영');
  });
});

describe('gradeNameAnswer — 정답', () => {
  it('정확히 같으면 정답', () => {
    expect(gradeNameAnswer('강나영', '강나영')).toBe('correct');
  });

  it('띄어쓰기 차이는 무시한다 (복성 대응)', () => {
    expect(gradeNameAnswer('남궁 민수', '남궁민수')).toBe('correct');
    expect(gradeNameAnswer('남궁민수', '남궁 민수')).toBe('correct');
    expect(gradeNameAnswer('  강나영  ', '강나영')).toBe('correct');
  });

  it('★같은 반 동명이인은 어느 쪽을 떠올렸든 정답', () => {
    // 이름만으로는 구분할 방법이 없으므로 틀렸다고 하면 안 된다
    expect(gradeNameAnswer('김민수', '김민수', ['김민수'])).toBe('correct');
  });
});

describe('gradeNameAnswer — 오답 (여기가 핵심)', () => {
  it('★한 글자만 달라도 오답이다', () => {
    expect(gradeNameAnswer('김민서', '김민수')).toBe('wrong');
    expect(gradeNameAnswer('김민수', '김민서')).toBe('wrong');
  });

  it('성만 맞거나 이름만 맞아도 오답', () => {
    expect(gradeNameAnswer('김', '김민수')).toBe('wrong');
    expect(gradeNameAnswer('민수', '김민수')).toBe('wrong');
  });

  it('글자 순서가 다르면 오답', () => {
    expect(gradeNameAnswer('수민김', '김민수')).toBe('wrong');
  });

  it('빈 답은 오답 (모르겠어요·그냥 Enter)', () => {
    expect(gradeNameAnswer('', '강나영')).toBe('wrong');
    expect(gradeNameAnswer('   ', '강나영')).toBe('wrong');
  });

  it('초성만 쓰면 오답 (힌트를 그대로 옮겨 적어도 정답이 아니다)', () => {
    expect(gradeNameAnswer('ㄱㄴㅇ', '강나영')).toBe('wrong');
  });
});

describe('toChosungHint', () => {
  it('이름을 초성으로 바꾼다', () => {
    expect(toChosungHint('강나영')).toBe('ㄱㄴㅇ');
    expect(toChosungHint('김드보라')).toBe('ㄱㄷㅂㄹ');
  });

  it('쌍자음 초성도 정확히 뽑는다', () => {
    expect(toChosungHint('빵떡')).toBe('ㅃㄸ');
    expect(toChosungHint('쌤핀')).toBe('ㅆㅍ');
  });

  it('받침이 있어도 초성만 뽑는다', () => {
    expect(toChosungHint('홍길동')).toBe('ㅎㄱㄷ');
  });

  it('공백은 없애고, 한글이 아닌 글자는 그대로 둔다', () => {
    expect(toChosungHint('남궁 민수')).toBe('ㄴㄱㅁㅅ');
    expect(toChosungHint('John')).toBe('John');
  });

  it('빈 문자열도 안전하다', () => {
    expect(toChosungHint('')).toBe('');
  });
});

describe('acceptedNamesFor', () => {
  it('글자가 완전히 같은 동명이인은 목록이 늘어나지 않는다 (같은 문자열을 또 넣어야 의미가 없다)', () => {
    const names = ['강나영', '김민수', '김민수', '한지우'];
    expect(acceptedNamesFor('김민수', names)).toEqual(['김민수']);
  });

  it('동명이인이 없으면 자기 이름만', () => {
    expect(acceptedNamesFor('강나영', ['강나영', '김민수'])).toEqual(['강나영']);
  });

  it('띄어쓰기만 다른 동명이인도 같은 이름으로 본다', () => {
    expect(acceptedNamesFor('남궁민수', ['남궁민수', '남궁 민수'])).toEqual([
      '남궁민수',
      '남궁 민수',
    ]);
  });
});
