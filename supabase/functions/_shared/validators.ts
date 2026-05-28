/**
 * 공용 입력 검증 패턴 — Phase 2C v2 보안 강화 (UltraQA Q1).
 *
 * 4개 Edge Function 이 서로 다른 정규식 / 검증 누락으로 path traversal · UUID 캐스팅
 * 우회 위험이 있었다. 본 모듈이 단일 진실 원천을 제공한다.
 */

/** UUID v4 (대소문자 무관) */
export const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** region.id — publish 단계에서 client 가 생성. 영숫자 + `-_` 만 허용, 80자 이하. */
export const REGION_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

/** signature-templates Storage path. `signature-templates/{teacherId or anon}/{filename}.pdf` */
export const TEMPLATE_STORAGE_PATH_PATTERN =
  /^signature-templates\/[A-Za-z0-9_.-]{1,80}\/[A-Za-z0-9_.-]{1,200}\.pdf$/;

/** signature-images Storage path. `{requestId}/{participantId}/{kind}-{submissionId}.{ext}` */
export const SIGNATURE_IMAGE_PATH_PATTERN =
  /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/(recipient|student|parent|guardian|teacher)-[0-9a-f-]{36}\.(png|webp)$/i;

/**
 * UUID 형식 검증 — false 반환 시 호출자가 errorResponse 로 400 처리.
 */
export function isValidRequestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value);
}

/**
 * region.id 형식 검증 — publish 단계와 upload-signature-preview 단계가 동일 패턴 사용.
 */
export function isValidRegionId(value: unknown): value is string {
  return typeof value === 'string' && REGION_ID_PATTERN.test(value);
}

/**
 * signature-templates Storage path 검증 — path traversal (`../`) + bucket 우회 차단.
 */
export function isValidTemplateStoragePath(value: unknown): value is string {
  return typeof value === 'string' && TEMPLATE_STORAGE_PATH_PATTERN.test(value);
}
