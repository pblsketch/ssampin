import { MEMO_IMAGE_LIMITS, type AllowedMemoImageMime } from '../valueObjects/MemoImage';

export interface ResizedImage {
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
  readonly mimeType: AllowedMemoImageMime;
}

export interface ResizeOptions {
  /** 긴 변 최대 길이 (기본 MEMO_IMAGE_LIMITS.MAX_DIMENSION) */
  readonly maxDimension?: number;
  /** JPEG/WebP 품질 (0~1), 기본 0.85. PNG는 무시. */
  readonly quality?: number;
}

/**
 * Blob을 리사이즈된 dataURL로 변환한다.
 * 긴 변이 maxDimension을 넘으면 비율 유지하며 축소.
 * PNG는 PNG로, JPEG/WebP는 지정 품질로 인코딩.
 */
export async function resizeImageBlob(
  blob: Blob,
  mimeType: AllowedMemoImageMime,
  options: ResizeOptions = {},
): Promise<ResizedImage> {
  const maxDim = options.maxDimension ?? MEMO_IMAGE_LIMITS.MAX_DIMENSION;
  const quality = options.quality ?? 0.85;

  const bitmap = await createImageBitmap(blob);
  const { width: originalWidth, height: originalHeight } = bitmap;

  let targetWidth = originalWidth;
  let targetHeight = originalHeight;

  if (Math.max(originalWidth, originalHeight) > maxDim) {
    if (originalWidth >= originalHeight) {
      targetWidth = maxDim;
      targetHeight = Math.round((originalHeight / originalWidth) * maxDim);
    } else {
      targetHeight = maxDim;
      targetWidth = Math.round((originalWidth / originalHeight) * maxDim);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    bitmap.close?.();
    throw new Error('Canvas 2D context를 얻지 못했습니다');
  }

  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close?.();

  const dataUrl =
    mimeType === 'image/png'
      ? canvas.toDataURL('image/png')
      : canvas.toDataURL(mimeType, quality);

  return {
    dataUrl,
    width: targetWidth,
    height: targetHeight,
    mimeType,
  };
}
