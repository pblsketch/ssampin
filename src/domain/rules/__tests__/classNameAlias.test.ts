/**
 * 반 이름 견주기 (2026-08-25 오너 신고)
 *
 * "1학년 7반 구예찬 학생 내일 2교시 결석처리 해줘" 가 수업반 "1-7" 을 못 찾고 되물었다.
 * 선생님은 말로 하고, 앱에는 줄임꼴로 저장돼 있다.
 */
import { describe, expect, it } from 'vitest';

import { classAlias } from '../classNameAlias';

describe('말로 한 반 이름과 저장된 반 이름이 만난다', () => {
  it.each([
    ['1학년 7반', '1-7'],
    ['1학년7반', '1-7'],
    ['3학년 1반', '3-1'],
    ['10학년 12반', '10-12'],
  ])('%s -> %s', (spoken, stored) => {
    expect(classAlias(spoken)).toBe(classAlias(stored));
  });

  it('★다른 반은 여전히 다르다 — 뭉치면 엉뚱한 반에 적힌다', () => {
    expect(classAlias('1학년 7반')).not.toBe(classAlias('1-8'));
    expect(classAlias('1학년 7반')).not.toBe(classAlias('2-7'));
  });

  it('★학년-반 꼴이 아닌 이름은 손대지 않는다 — 선생님이 붙인 이름이다', () => {
    expect(classAlias('공국2')).toBe('공국2');
    expect(classAlias('3반 심국')).toBe('3반심국');
    expect(classAlias('언매')).toBe('언매');
  });

  it('자릿수를 열어 두지 않는다 — "2026학년도1반" 이 반 이름으로 접히면 안 된다', () => {
    expect(classAlias('2026학년도1반')).toBe('2026학년도1반');
  });
});
