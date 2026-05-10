/**
 * Google Slides URL 파싱 유틸.
 *
 * 교사가 붙여넣는 다양한 형태의 URL에서 `presentationId`를 추출.
 * 메인 프로세스 + 렌더러 양쪽이 import — 입력 검증은 동일해야 함.
 *
 * 지원 형태:
 *   https://docs.google.com/presentation/d/{id}/edit
 *   https://docs.google.com/presentation/d/{id}/edit#slide=id.X
 *   https://docs.google.com/presentation/d/{id}/edit?usp=sharing
 *   https://docs.google.com/presentation/d/{id}/preview
 *   https://docs.google.com/presentation/d/{id}/   (trailing slash)
 *   https://docs.google.com/presentation/d/{id}    (trailing 없음)
 *
 * Google presentationId 형식: 영숫자 + `_-`, 보통 40~50자.
 */

/** Google presentationId 형식 정규식 (URL-safe 영숫자 + _ + -) */
const PRESENTATION_ID_REGEX = /^[A-Za-z0-9_-]{20,80}$/;

const SUPPORTED_HOSTS = ['docs.google.com'] as const;

export interface GoogleSlidesUrlParseResult {
  readonly ok: true;
  readonly presentationId: string;
}

export interface GoogleSlidesUrlParseError {
  readonly ok: false;
  readonly reason:
    | 'empty'
    | 'invalid-url'
    | 'wrong-host'
    | 'wrong-path'
    | 'invalid-id';
}

export type GoogleSlidesUrlResult =
  | GoogleSlidesUrlParseResult
  | GoogleSlidesUrlParseError;

/**
 * Google Slides URL → presentationId 추출.
 *
 * @param raw 사용자 입력 (URL 또는 presentationId만 직접 입력)
 *            presentationId가 직접 들어오면 그대로 검증 후 반환 (가운데 단계 생략)
 */
export function parseGoogleSlidesUrl(raw: string): GoogleSlidesUrlResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'empty' };

  // 사용자가 presentationId만 직접 붙여넣은 경우
  if (PRESENTATION_ID_REGEX.test(trimmed)) {
    return { ok: true, presentationId: trimmed };
  }

  // URL 파싱 시도
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'invalid-url' };
  }

  if (!isSupportedHost(url.hostname)) {
    return { ok: false, reason: 'wrong-host' };
  }

  // pathname: /presentation/d/{id}/edit 또는 /presentation/d/{id}
  const segments = url.pathname.split('/').filter((s) => s.length > 0);
  if (segments.length < 3) return { ok: false, reason: 'wrong-path' };
  if (segments[0] !== 'presentation' || segments[1] !== 'd') {
    return { ok: false, reason: 'wrong-path' };
  }

  const id = segments[2]!;
  if (!PRESENTATION_ID_REGEX.test(id)) {
    return { ok: false, reason: 'invalid-id' };
  }

  return { ok: true, presentationId: id };
}

function isSupportedHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (SUPPORTED_HOSTS as readonly string[]).includes(normalized);
}

/**
 * 사용자 입력이 presentationId 형식과 일치하는지 verify (URL 없이).
 * UI 측 즉시 검증용.
 */
export function isLikelyPresentationId(s: string): boolean {
  return PRESENTATION_ID_REGEX.test(s.trim());
}
