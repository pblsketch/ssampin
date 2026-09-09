/**
 * 구글 토큰의 "발급받은 앱(aud)" 확인 + 신원 캐시 — 순수 부분만 (ADR-095, 계획서 §6 S2)
 *
 * 왜 필요한가: `verifyGoogleIdentity` 는 userinfo 로 이메일만 받아 온다. 그러면
 * **다른 앱이 발급받은 구글 토큰도 그대로 통과한다** — 어떤 앱이든 사용자에게
 * 구글 로그인을 시켜 얻은 토큰을 쌤핀 서버에 그대로 내밀 수 있기 때문이다.
 * 토큰이 우리 앱에 발급된 것인지까지 봐야 신분증 구실을 한다.
 *
 * 왜 `googleIdentity.ts` 가 아니라 여기인가: 그 파일은 Deno 전용(fetch·env)이라
 * vitest 에서 못 부른다. 판단에 해당하는 부분만 순수 함수로 빼서 테스트한다.
 *
 * 🔴 운영 주의 (2026-09-09 실측): 서버 시크릿 `GOOGLE_CLIENT_ID` 는 데스크톱 앱·모바일
 *   앱이 쓰는 클라이언트 ID 어느 쪽과도 값이 다르다. 그래서 그 값 하나로 aud 를
 *   강제하면 **선생님 전원이 거부된다.** 허용 목록은 `GOOGLE_ALLOWED_AUDIENCES`
 *   (쉼표로 구분)로 따로 받고, **설정되지 않았으면 검사하지 않는다.** 검사를 켜기
 *   전에는 반드시 실제 토큰으로 aud 를 확인해 목록을 채운다(계획서 §6 S3).
 */

/** `GOOGLE_ALLOWED_AUDIENCES` 문자열을 목록으로. 빈 값·미설정은 빈 목록이다. */
export function parseAllowedAudiences(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * 이 토큰이 우리 앱에 발급된 것인가.
 *
 * ★ 허용 목록이 비어 있으면 **통과시킨다.** 설정을 안 한 상태에서 전부 막아 버리면
 *   배포하는 순간 명단이 통째로 안 보인다. 그 상태를 "관측 모드"라고 부르고,
 *   부르는 쪽이 실제로 들어온 발급처를 로그에 남긴다. 며칠 모아 실제 값을 확인한 뒤
 *   목록을 채우면, 잘못 넣어 선생님 전원이 막히는 사고를 피할 수 있다.
 */
export function isAudienceAllowed(
  aud: string | null | undefined,
  allowed: readonly string[],
): boolean {
  if (allowed.length === 0) return true;
  if (!aud) return false;
  return allowed.includes(aud);
}

/** tokeninfo 응답 중 우리가 쓰는 것 */
export interface TokenInfoFields {
  readonly aud: string | null;
  readonly email: string | null;
}

/**
 * tokeninfo 응답을 읽는다.
 *
 * ★ tokeninfo 의 `email_verified` 는 **문자열 "true"/"false"** 로 온다(userinfo 는
 *   불리언이다). `if (!json.email_verified)` 로 쓰면 문자열 "false" 가 참이 되어
 *   확인되지 않은 이메일을 통과시킨다. 그래서 두 형태를 모두 본다.
 */
export function readTokenInfo(json: unknown): TokenInfoFields | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  const verified = o['email_verified'];
  if (verified === false || verified === 'false') return null;
  const aud = typeof o['aud'] === 'string' && o['aud'] ? o['aud'] : null;
  const rawEmail = typeof o['email'] === 'string' ? o['email'].trim().toLowerCase() : '';
  return { aud, email: rawEmail || null };
}

/** 캐시 한 칸 */
export interface IdentityCacheEntry {
  readonly email: string;
  readonly storedAt: number;
}

/**
 * 캐시가 아직 쓸 만한가.
 *
 * ★ 이 창(기본 5분) 동안은 **이미 철회된 토큰도 통과한다.** 구글 호출을 줄이려고
 *   감수하는 값이고, 창을 넓히면 그만큼 길어진다. 관측 지표로 "캐시 적중 통과 건수"를
 *   세기로 한 이유가 이것이다(계획서 §9.5).
 */
export function isCacheFresh(entry: IdentityCacheEntry, now: number, ttlMs: number): boolean {
  if (ttlMs <= 0) return false;
  const age = now - entry.storedAt;
  return age >= 0 && age < ttlMs;
}
