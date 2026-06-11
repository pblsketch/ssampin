/**
 * 서명받기 공개 페이지(`/sign/{shortLinkCode}`) 라우트 감지 — 공용 util.
 *
 * student 번들(`StudentApp`)과 mobile 번들(`main.tsx`) 모두 동일 규칙으로
 * `/sign/...` 경로를 감지하기 위한 단일 정의 소스(Single Source of Truth).
 * pathname 우선, hash 폴백(`#/sign/{ref}`) — base './' 정적 호스팅 환경 대비.
 *
 * 프레임워크/인프라 의존 없음.
 */

export interface SignatureLocationLike {
  readonly pathname?: string;
  readonly hash?: string;
}

/** `/sign/{ref}` 경로를 매칭하는 정규식 — ref는 `/?#` 제외 1글자 이상. */
const SIGN_PATTERN = /\/sign\/[^/?#]+/;
/** ref 추출용(캡처 그룹 포함). */
const SIGN_REF_PATTERN = /\/sign\/([^/?#]+)/;

function getBrowserLocation(): SignatureLocationLike {
  if (typeof window === 'undefined') return {};
  return window.location;
}

/** 현재 위치가 서명받기 공개 페이지(`/sign/...`)인지 판별. pathname 우선, 해시 폴백. */
export function isSignatureRoute(location?: SignatureLocationLike): boolean {
  const target = location ?? getBrowserLocation();
  return SIGN_PATTERN.test(target.pathname ?? '') || SIGN_PATTERN.test(target.hash ?? '');
}

/** `/sign/{ref}` 경로 또는 해시에서 ref 추출. 없으면 null. */
export function extractSignatureRef(location?: SignatureLocationLike): string | null {
  const target = location ?? getBrowserLocation();
  const fromPath = matchSignRef(target.pathname ?? '');
  if (fromPath) return fromPath;
  // 해시 라우팅(`#/sign/{ref}`) 폴백.
  const hash = (target.hash ?? '').replace(/^#/, '');
  return matchSignRef(hash);
}

function matchSignRef(path: string): string | null {
  const m = path.match(SIGN_REF_PATTERN);
  if (!m) return null;
  const ref = decodeURIComponent(m[1] ?? '').trim();
  return ref.length > 0 ? ref : null;
}
