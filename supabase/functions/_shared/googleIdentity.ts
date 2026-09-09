/**
 * 구글 신원 확인 — 온라인 교무실 공용
 *
 * 계획서 §7: "링크·코드는 초대장일 뿐 열쇠가 아니다. 실제 입장은 구글 계정으로 확인."
 *
 * 클라이언트가 보낸 access token 을 **구글에 되물어** 이메일을 받는다.
 * 클라이언트가 자기 이메일을 문자열로 주장하는 것은 절대 믿지 않는다 —
 * 그러면 남의 지메일을 적어 넣는 것만으로 남의 부서에 들어갈 수 있다.
 *
 * save-teacher-token 이 이미 쓰던 방식(userinfo 로 교사 이메일 검증)과 같다.
 * **새 구글 권한(scope)을 요구하지 않는다** — userinfo.email 은 쌤핀이 이미 받아 둔 것이라
 * OAuth 재심사 대상이 아니다(§3.2).
 */

import {
  isAudienceAllowed,
  isCacheFresh,
  parseAllowedAudiences,
  readTokenInfo,
  type IdentityCacheEntry,
} from './googleAudience.ts';

const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

/** 구글이 확인해 준 신원 */
export interface GoogleIdentity {
  /** 소문자로 정규화한 지메일 — 부서 멤버십의 정본 */
  readonly email: string;
  /** 구글 프로필 이름. 없을 수 있다 */
  readonly name: string | null;
}

/** userinfo 응답 중 우리가 쓰는 필드 */
interface UserInfoResponse {
  email?: string;
  name?: string;
  email_verified?: boolean;
}

/**
 * access token 으로 신원을 확인한다.
 *
 * @returns 확인된 신원. 토큰이 잘못됐거나 이메일을 못 얻으면 null.
 */
export async function verifyGoogleIdentity(accessToken: string): Promise<GoogleIdentity | null> {
  if (!accessToken || typeof accessToken !== 'string') return null;

  let res: Response;
  try {
    res = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (err) {
    console.error('[googleIdentity] userinfo 요청 실패:', err);
    return null;
  }

  if (!res.ok) return null;

  const info = (await res.json().catch(() => null)) as UserInfoResponse | null;
  const email = info?.email?.trim().toLowerCase();
  if (!email) return null;

  // 구글이 "확인되지 않은 이메일"이라고 표시하면 신원으로 쓰지 않는다
  if (info?.email_verified === false) return null;

  return { email, name: info?.name?.trim() || null };
}

/** 지메일 정규화 — 비교는 항상 이 함수를 거친다 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ─────────────────────────────────────────────────────────────────────────
// 상담·설문(ADR-095)용 — 발급 앱(aud) 확인 + 5분 신원 캐시
//
// 위의 verifyGoogleIdentity 는 **그대로 둔다.** 온라인 교무실 엣지 함수 8종이 쓰고
// 있어서, 여기에 검사를 더하면 그쪽 동작까지 같이 바뀐다. 새 확인은 더해서 쓴다.
// ─────────────────────────────────────────────────────────────────────────

const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

/** sha256(토큰) → 이메일. **토큰 자체는 담지 않는다** — 지문만 열쇠로 쓴다. */
const identityCache = new Map<string, IdentityCacheEntry>();

/**
 * 관측 모드에서 이미 로그에 남긴 발급처. 같은 값을 계속 찍지 않으려는 용도다.
 * 값 자체는 비밀이 아니다 — 앱을 구분하는 일련번호이고 설치파일 안에 들어 있다.
 */
const seenAudiences = new Set<string>();

async function fingerprint(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 상담·설문용 신원 확인.
 *
 * tokeninfo 를 먼저 부른다 — 한 번의 호출로 **발급 앱(aud)과 이메일을 함께** 받는다.
 * 토큰에 이메일 권한이 없어 이메일이 빠져 오면 기존 userinfo 로 한 번 더 묻는다.
 *
 * @returns 확인된 이메일(소문자). 실패하면 null — 부르는 쪽은 이것을 `not_connected` 로 읽는다.
 */
export async function verifyGoogleIdentityForConsultation(
  accessToken: string,
  opts: { cacheTtlMs?: number; now?: number } = {},
): Promise<GoogleIdentity | null> {
  if (!accessToken || typeof accessToken !== 'string') return null;

  const ttl = opts.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const now = opts.now ?? Date.now();
  const key = await fingerprint(accessToken);

  const cached = identityCache.get(key);
  if (cached && isCacheFresh(cached, now, ttl)) {
    // ★ 이 창(5분) 안에서는 **이미 철회된 토큰도 통과한다.** 구글 호출을 줄이려고
    //   감수하는 값이다. 계획서 §9.5 는 "캐시 적중 통과 건수"를 관측 지표로 두자고
    //   했는데, 지금은 그 숫자를 받아 갈 곳이 없다. 읽는 데가 생길 때 함께 만든다.
    return { email: cached.email, name: null };
  }

  const allowed = parseAllowedAudiences(Deno.env.get('GOOGLE_ALLOWED_AUDIENCES'));

  let info: { aud: string | null; email: string | null } | null = null;
  try {
    const res = await fetch(
      `${GOOGLE_TOKENINFO_URL}?access_token=${encodeURIComponent(accessToken)}`,
    );
    if (res.ok) info = readTokenInfo(await res.json().catch(() => null));
  } catch (err) {
    console.error('[googleIdentity] tokeninfo 요청 실패:', err);
  }
  if (!info) return null;

  if (allowed.length === 0) {
    // ── 관측 모드 ──────────────────────────────────────────────────────
    // 허용 목록이 비어 있으면 **막지 않고 기록만** 한다.
    //
    // 왜 이렇게 두나: 출시본이 어떤 발급처(클라이언트 ID)를 쓰는지 확신이 없는 채로
    // 목록을 채우면 **선생님 전원이 거부된다.** 며칠 이 로그를 모아 실제로 오는 값을
    // 확인한 뒤 목록에 넣으면 그 위험이 사라진다.
    //
    // 같은 값을 매 호출마다 남기면 로그가 묻히므로, 인스턴스마다 처음 본 값만 남긴다.
    if (info.aud && !seenAudiences.has(info.aud)) {
      seenAudiences.add(info.aud);
      console.warn(`[googleIdentity] aud 관측(막지 않음): ${info.aud}`);
    }
  } else if (!isAudienceAllowed(info.aud, allowed)) {
    console.warn('[googleIdentity] 허용 목록에 없는 앱이 발급한 토큰 — 거부');
    return null;
  }

  let email = info.email;
  if (!email) {
    const fallback = await verifyGoogleIdentity(accessToken);
    email = fallback?.email ?? null;
  }
  if (!email) return null;

  // 만료된 항목을 함께 걷어낸다. 안 걷으면 인스턴스가 살아 있는 동안 맵이 계속 커진다.
  // 항목이 얼마 안 되므로 전부 훑어도 부담이 없다.
  for (const [k, v] of identityCache) {
    if (!isCacheFresh(v, now, ttl)) identityCache.delete(k);
  }
  identityCache.set(key, { email, storedAt: now });
  return { email, name: null };
}
