/**
 * Interactive Slides 도메인 ID 모음 (branded types).
 *
 * 단일 파일에 7개 ID를 모은 이유: 모두 한 feature에 묶여 있고
 * 외부 도메인에서 참조될 일이 없기 때문. (Board ID는 realtimeWall이 별도 도메인이라 분리.)
 *
 * Plan §3 §11.3 (shortCode entropy) + Design §2 매핑.
 */

export type LessonId = string & { readonly __brand: 'LessonId' };
export type SlideId = string & { readonly __brand: 'SlideId' };
export type OverlayId = string & { readonly __brand: 'OverlayId' };
export type SessionId = string & { readonly __brand: 'SessionId' };
export type StudentToken = string & { readonly __brand: 'StudentToken' };
export type ResponseId = string & { readonly __brand: 'ResponseId' };
export type ShortCode = string & { readonly __brand: 'ShortCode' };

/** UUID v4 형식 (8-4-4-4-12) */
export function isUuidV4(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
}

/**
 * ShortCode 정책 (PIPA §11.3 외부 노출 통제):
 * - 6자리 영숫자 대문자
 * - charset에서 헷갈리는 문자(B/I/O/S/Z, 0/1/2/5/6/8) 제거
 * - 약 244M 조합 (25^6)
 */
export const SHORT_CODE_CHARSET = 'ACDEFGHJKLMNPQRTUVWXY3479' as const;
export const SHORT_CODE_LENGTH = 6;

export function isShortCode(s: string): s is ShortCode {
  if (s.length !== SHORT_CODE_LENGTH) return false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (!SHORT_CODE_CHARSET.includes(ch)) return false;
  }
  return true;
}

/**
 * Raw string을 brand 적용된 ID로 변환 (검증 후 캐스트).
 *
 * 호출부 책임: UUID 형식 / ShortCode 형식이 맞는지 사전 검증.
 * 도메인은 외부 의존성(crypto, zod)을 갖지 않으므로 검증·생성은 어댑터·유스케이스가 담당한다.
 */
export const asLessonId = (s: string): LessonId => s as LessonId;
export const asSlideId = (s: string): SlideId => s as SlideId;
export const asOverlayId = (s: string): OverlayId => s as OverlayId;
export const asSessionId = (s: string): SessionId => s as SessionId;
export const asStudentToken = (s: string): StudentToken => s as StudentToken;
export const asResponseId = (s: string): ResponseId => s as ResponseId;
export const asShortCode = (s: string): ShortCode => s as ShortCode;
