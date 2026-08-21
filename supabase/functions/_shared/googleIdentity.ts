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
