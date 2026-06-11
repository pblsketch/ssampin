/**
 * 서명받기 공개 페이지 URL — 단일 정의 소스(Single Source of Truth).
 *
 * 참석자 공개 페이지는 `/sign/{shortLinkCode}` 경로로 동작한다(student 번들).
 * 교사 도구가 만드는 공유 링크와 참석자 페이지가 동일 규약을 쓰도록 base URL을 한 곳에서 결정한다.
 *
 * base 결정 우선순위:
 *   1) VITE_SIGNATURE_PUBLIC_BASE_URL (배포 환경에서 student 번들이 호스팅되는 절대 URL)
 *   2) 현재 페이지 origin (window가 있을 때 — Electron http 서버/터널)
 *   3) 빈 문자열(상대 경로) — SSR/Node 컨텍스트 폴백
 *
 * 프레임워크/인프라 의존 없음 — teacher·student 양 번들에서 공용.
 */

/** 서명 공개 페이지 라우트 prefix */
export const SIGNATURE_PUBLIC_PATH_PREFIX = '/sign';

/** 환경변수에서 공개 base URL을 읽는다(없으면 빈 문자열). 끝 슬래시는 제거. */
function readConfiguredBaseUrl(): string {
  const raw = (import.meta.env.VITE_SIGNATURE_PUBLIC_BASE_URL as string | undefined) ?? '';
  return raw.replace(/\/+$/, '');
}

/**
 * 공개 base URL 해석. 인자로 origin을 주입할 수 있어 테스트/SSR에서 결정적으로 동작.
 */
export function resolveSignaturePublicBaseUrl(origin?: string): string {
  const configured = readConfiguredBaseUrl();
  if (configured) return configured;
  if (origin) return origin.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }
  return '';
}

/**
 * 단축 링크 코드(또는 세션 UUID)로 참석자 공개 페이지 절대/상대 URL을 만든다.
 * 교사 도구의 QR·공유 링크가 이 함수를 써서 참석자 페이지와 정합을 보장한다.
 */
export function buildSignaturePublicUrl(refOrShortCode: string, origin?: string): string {
  const base = resolveSignaturePublicBaseUrl(origin);
  const ref = encodeURIComponent(refOrShortCode.trim());
  return `${base}${SIGNATURE_PUBLIC_PATH_PREFIX}/${ref}`;
}
