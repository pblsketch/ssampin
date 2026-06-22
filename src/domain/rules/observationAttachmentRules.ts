import type { ObservationAttachmentKind } from '../entities/ObservationAttachment';
import { FILE_TYPE_EXTENSIONS, BLOCKED_EXTENSIONS } from '../valueObjects/FileTypeRestriction';

/** 관찰 첨부 한도 (제품 오너 확정값). */
export const OBSERVATION_ATTACHMENT_LIMITS = {
  /** 이미지 원본 최대 크기 (5MB) */
  IMAGE_MAX_BYTES: 5 * 1024 * 1024,
  /** 문서 원본 최대 크기 (20MB) */
  DOC_MAX_BYTES: 20 * 1024 * 1024,
  /** 관찰 1건당 첨부 최대 개수 */
  MAX_PER_OBSERVATION: 10,
  /** 추출 텍스트 최대 길이 (Phase 2 — 초과 시 truncate) */
  EXTRACTED_TEXT_MAX: 10_000,
} as const;

const IMAGE_EXTS: readonly string[] = FILE_TYPE_EXTENSIONS.image;
const DOC_EXTS: readonly string[] = FILE_TYPE_EXTENSIONS.document;

/** 파일명에서 소문자 확장자 추출(점 제외). 점이 없거나 점 뒤가 비면 빈 문자열. */
export function extensionOf(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot < 0) return '';
  return fileName.slice(lastDot + 1).toLowerCase();
}

/** 확장자로 첨부 종류 판정. 이미지·문서 어디에도 없으면 null(미지원). */
export function attachmentKindOf(fileName: string): ObservationAttachmentKind | null {
  const ext = extensionOf(fileName);
  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (DOC_EXTS.includes(ext)) return 'document';
  return null;
}

export type AttachmentValidation =
  | { readonly ok: true; readonly kind: ObservationAttachmentKind }
  | { readonly ok: false; readonly reason: string };

/**
 * 단일 파일이 첨부 가능한지 검증한다(확장자 화이트리스트 + 보안 차단 + 종류별 크기 한도).
 * 개수 한도는 호출 측에서 canAddAttachment 로 별도 검사한다.
 */
export function validateAttachmentFile(fileName: string, byteSize: number): AttachmentValidation {
  const ext = extensionOf(fileName);
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return { ok: false, reason: '보안상 첨부할 수 없는 파일 형식입니다.' };
  }
  const kind = attachmentKindOf(fileName);
  if (kind === null) {
    return {
      ok: false,
      reason: '지원하지 않는 파일 형식입니다. 이미지 또는 문서만 첨부할 수 있습니다.',
    };
  }
  const max =
    kind === 'image'
      ? OBSERVATION_ATTACHMENT_LIMITS.IMAGE_MAX_BYTES
      : OBSERVATION_ATTACHMENT_LIMITS.DOC_MAX_BYTES;
  if (byteSize > max) {
    const mb = Math.round(max / (1024 * 1024));
    const label = kind === 'image' ? '이미지' : '문서';
    return {
      ok: false,
      reason: `파일이 너무 큽니다. ${label}는 최대 ${mb}MB까지 첨부할 수 있습니다.`,
    };
  }
  return { ok: true, kind };
}

/** 현재 첨부 개수에서 더 추가할 수 있는지. */
export function canAddAttachment(currentCount: number): boolean {
  return currentCount < OBSERVATION_ATTACHMENT_LIMITS.MAX_PER_OBSERVATION;
}

/** 바이너리 스토어 상대경로 생성: "obs-attachments/{id}.{ext}". 확장자 없으면 "bin". */
export function storageRefFor(id: string, fileName: string): string {
  const ext = extensionOf(fileName) || 'bin';
  return `obs-attachments/${id}.${ext}`;
}

/** 추출 텍스트를 한도 길이로 자른다(초과 시 truncate, 이하면 원본 반환). */
export function truncateExtractedText(text: string): string {
  return text.length > OBSERVATION_ATTACHMENT_LIMITS.EXTRACTED_TEXT_MAX
    ? text.slice(0, OBSERVATION_ATTACHMENT_LIMITS.EXTRACTED_TEXT_MAX)
    : text;
}
