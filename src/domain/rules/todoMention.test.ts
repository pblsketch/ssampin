import { describe, it, expect } from 'vitest';
import { extractMentionQuery, applyMention } from './todoMention';

describe('extractMentionQuery — 멘션으로 인정하는 경우', () => {
  it('@ 뒤에 아무것도 없어도 빈 검색어로 인정한다 (막 @ 를 친 순간)', () => {
    expect(extractMentionQuery('@', 1)).toEqual({ atIndex: 0, query: '' });
  });

  it('@ 뒤 글자를 검색어로 돌려준다', () => {
    expect(extractMentionQuery('@김민', 3)).toEqual({ atIndex: 0, query: '김민' });
  });

  it('문장 중간의 @ 도 인정한다 (앞이 공백)', () => {
    expect(extractMentionQuery('회신 확인 @김민', 9)).toEqual({ atIndex: 6, query: '김민' });
  });

  it('한글 초성 한 글자도 검색어가 된다 (판정 6)', () => {
    expect(extractMentionQuery('@ㄱ', 2)).toEqual({ atIndex: 0, query: 'ㄱ' });
  });

  it('초성 여러 글자도 그대로 돌려준다', () => {
    expect(extractMentionQuery('@ㄱㅁㅎ', 4)).toEqual({ atIndex: 0, query: 'ㄱㅁㅎ' });
  });

  it('줄바꿈 뒤의 @ 도 인정한다', () => {
    expect(extractMentionQuery('첫 줄\n@박', 6)).toEqual({ atIndex: 4, query: '박' });
  });

  it('커서가 @ 바로 뒤가 아니라 이름 중간이어도 그 자리까지를 검색어로 본다', () => {
    expect(extractMentionQuery('@김민호', 3)).toEqual({ atIndex: 0, query: '김민' });
  });
});

describe('extractMentionQuery — 멘션이 아닌 경우', () => {
  it('이메일에는 팝오버가 뜨지 않는다 (판정 5)', () => {
    expect(extractMentionQuery('a@b.com', 7)).toBeNull();
  });

  it('이메일 중간 커서에서도 뜨지 않는다', () => {
    expect(extractMentionQuery('a@b.com', 3)).toBeNull();
  });

  it('앞에 글자가 붙은 @ 는 멘션이 아니다', () => {
    expect(extractMentionQuery('teacher@school', 10)).toBeNull();
  });

  it('@ 와 커서 사이에 공백이 있으면 끝난 것으로 본다', () => {
    expect(extractMentionQuery('@김민호 회신', 7)).toBeNull();
  });

  it('@ 가 아예 없으면 null', () => {
    expect(extractMentionQuery('공문 회신 확인', 7)).toBeNull();
  });

  it('빈 문자열이면 null', () => {
    expect(extractMentionQuery('', 0)).toBeNull();
  });

  it('너무 멀리 떨어진 @ 는 찾지 않는다 (20자 한도)', () => {
    const text = `@${'가'.repeat(30)}`;
    expect(extractMentionQuery(text, text.length)).toBeNull();
  });

  it('커서 위치가 범위를 벗어나면 null', () => {
    expect(extractMentionQuery('@김', 99)).toBeNull();
    expect(extractMentionQuery('@김', -1)).toBeNull();
  });

  it('커서 앞이 공백이면 null — 방금 띄어쓴 상태', () => {
    expect(extractMentionQuery('@김 ', 3)).toBeNull();
  });
});

describe('applyMention', () => {
  it('검색어 자리를 고른 이름으로 바꾸고 공백을 붙인다', () => {
    expect(applyMention('@김민', 3, '김민호')).toEqual({
      text: '@김민호 ',
      caretIndex: 5,
    });
  });

  it('문장 중간에서도 그 멘션만 바꾼다', () => {
    expect(applyMention('회신 확인 @김민', 9, '김민호')).toEqual({
      text: '회신 확인 @김민호 ',
      caretIndex: 11,
    });
  });

  it('뒤에 남은 글자를 보존한다', () => {
    const result = applyMention('@김 회신', 2, '김민호');
    expect(result.text).toBe('@김민호  회신');
  });

  it('막 @ 만 친 상태에서도 넣을 수 있다', () => {
    expect(applyMention('@', 1, '박서준')).toEqual({ text: '@박서준 ', caretIndex: 5 });
  });

  it('멘션 자리가 아니면 원본을 그대로 돌려준다', () => {
    expect(applyMention('a@b.com', 7, '김민호')).toEqual({ text: 'a@b.com', caretIndex: 7 });
  });

  it('넣은 뒤 커서 자리에서 다시 검색어가 잡히지 않는다 — 공백이 끊어 준다', () => {
    const result = applyMention('@김', 2, '김민호');
    expect(extractMentionQuery(result.text, result.caretIndex)).toBeNull();
  });
});
