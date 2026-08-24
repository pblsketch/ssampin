/**
 * 진단 로그의 **개인정보 차단막** 테스트.
 *
 * ★이 파일이 없어서 실제로 사고가 났다 — `scrub()` 의 정규식이 한 글자 어긋나
 * 윈도우 경로를 하나도 못 지우는 상태로 잠깐 들어갔다. 로그는 아무도 안 보므로
 * **깨져도 티가 안 난다.** 그래서 여기서만은 눈이 아니라 테스트가 지킨다.
 *
 * 지워야 하는 것: 전체 경로(계정명이 들어 있다). 남겨야 하는 것: 오류의 뜻.
 */
import { describe, it, expect } from 'vitest';
import { scrub, describeError } from './coolMessengerDiag';

const WIN_PATH = String.raw`C:\Users\홍길동\AppData\Local\CoolMessenger\Memo\MyMemo.udb`;
const UNC_PATH = String.raw`\\학교서버\공유\memo.udb`;

describe('scrub — 로그에 전체 경로를 남기지 않는다', () => {
  it('★ 윈도우 경로가 통째로 지워진다 (계정명이 들어 있다)', () => {
    const line = `EBUSY: resource busy or locked, copyfile '${WIN_PATH}'`;
    const out = scrub(line);
    expect(out).not.toContain('홍길동');
    expect(out).not.toContain('Users');
    expect(out).toContain('<경로>');
    expect(out).toContain('EBUSY'); // 오류의 뜻은 남는다
  });

  it('슬래시 경로도 지운다', () => {
    expect(scrub("open 'C:/Users/홍길동/Memo/MyMemo.udb'")).not.toContain('홍길동');
  });

  it('네트워크 공유 경로도 지운다', () => {
    expect(scrub(`copy '${UNC_PATH}'`)).not.toContain('학교서버');
  });

  it('경로가 없는 문장은 그대로 둔다', () => {
    expect(scrub('tbl_recv 표가 없습니다')).toBe('tbl_recv 표가 없습니다');
  });
});

describe('describeError — 남겨도 되는 것만 뽑는다', () => {
  it('오류 코드와 뜻은 남기고 경로는 지운다', () => {
    const err = Object.assign(new Error(`EPERM: operation not permitted, stat '${WIN_PATH}'`), {
      code: 'EPERM',
    });
    const d = describeError(err);
    expect(d.코드).toBe('EPERM');
    expect(d.종류).toBe('Error');
    expect(d.내용).toContain('EPERM');
    expect(d.내용).not.toContain('홍길동');
  });

  it('Error 가 아닌 것도 안전하게 다룬다', () => {
    expect(describeError('그냥 문자열').코드).toBe('-');
  });
});
