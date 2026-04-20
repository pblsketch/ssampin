/**
 * BoardSessionCode — 6자리 세션 코드
 *
 * 학생이 QR 없이 URL만 전달받았을 때 교사가 구두로 전달하는 보조 코드.
 * 혼동하기 쉬운 문자(0/O, 1/I/L)는 alphabet에서 제외한다.
 */
export type BoardSessionCode = string & { readonly __brand: 'BoardSessionCode' };

/** 6자리 대문자 영숫자 (혼동 문자 제외, 31자) */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** 6자리 랜덤 세션 코드 생성 */
export function generateSessionCode(rand: () => number = Math.random): BoardSessionCode {
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  }
  return out as BoardSessionCode;
}

/** 포맷 검증 */
export function isSessionCode(s: string): s is BoardSessionCode {
  return new RegExp(`^[${ALPHABET}]{6}$`).test(s);
}

export { ALPHABET as SESSION_CODE_ALPHABET };
