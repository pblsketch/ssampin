/**
 * BoardAuthToken — WebSocket 입장 인증 토큰
 *
 * 32자리 hex (128비트 엔트로피). 세션 시작 시 infrastructure 레이어에서
 * `crypto.randomBytes(16).toString('hex')`로 생성한다. 도메인에서는
 * 형식 검증만 수행.
 */
export type BoardAuthToken = string & { readonly __brand: 'BoardAuthToken' };

/** 32자 소문자 hex 여부 */
export function isAuthToken(s: string): s is BoardAuthToken {
  return /^[a-f0-9]{32}$/.test(s);
}
