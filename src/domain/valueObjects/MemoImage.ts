export interface MemoImage {
  /** base64 dataURL (예: data:image/png;base64,...) */
  readonly dataUrl: string;
  readonly fileName: string;
  readonly mimeType: AllowedMemoImageMime;
  /** 리사이즈 후 너비 (px) */
  readonly width: number;
  /** 리사이즈 후 높이 (px) */
  readonly height: number;
  /** 원본 파일 크기 (bytes) - 참고용 */
  readonly originalSize: number;
}

export const MEMO_IMAGE_LIMITS = {
  /** 원본 최대 크기 (5MB) */
  MAX_SIZE_BYTES: 5 * 1024 * 1024,
  /** 리사이즈 시 긴 변 최대 길이 */
  MAX_DIMENSION: 800,
  /** MemoCard 썸네일 영역 높이 */
  THUMBNAIL_HEIGHT: 120,
  /** 허용 MIME 타입 */
  ALLOWED_MIME: ['image/png', 'image/jpeg', 'image/webp'] as const,
} as const;

export type AllowedMemoImageMime = typeof MEMO_IMAGE_LIMITS.ALLOWED_MIME[number];

export function isAllowedMemoImageMime(mime: string): mime is AllowedMemoImageMime {
  return (MEMO_IMAGE_LIMITS.ALLOWED_MIME as readonly string[]).includes(mime);
}
