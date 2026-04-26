import { useCallback, useState } from 'react';
import {
  REALTIME_WALL_MAX_IMAGES_PER_POST,
  REALTIME_WALL_MAX_IMAGES_TOTAL_BYTES,
  REALTIME_WALL_MAX_SINGLE_IMAGE_BYTES,
  validateImageDataUrl,
} from '@domain/rules/realtimeWallRules';

/**
 * v2.1 신규 — 학생 이미지 다중 업로드 훅 (Design v2.1 §5.16 / §9.2).
 *
 * 책임:
 *   - drop / paste / 파일 picker 3 진입점 통합
 *   - canvas 리사이즈 (max width 1280px, JPEG quality 0.8)
 *     - EXIF GPS 좌표 자동 제거 (canvas 거치면 EXIF 손실)
 *   - 다중 검증 (max 3장 / 합계 5MB / magic byte / SVG 차단)
 *   - 도메인 규칙 `validateImageDataUrl`로 정밀 검증
 *
 * 보안 (Design §9.2):
 *   - 알파 투명도 손실 (PNG → JPEG) — v2.1 트레이드오프
 *   - 정적 GIF만 보존 (애니메이션 손실)
 *   - SVG는 도메인에서 차단
 */

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.8;
const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];

interface UseStudentImageMultiUploadParams {
  readonly currentImages: readonly string[];
  readonly onAdd: (dataUrl: string) => void;
  readonly maxImages?: number;
  readonly maxTotalBytes?: number;
}

interface UseStudentImageMultiUploadResult {
  readonly onDrop: (e: React.DragEvent<HTMLElement>) => void;
  readonly onPaste: (e: React.ClipboardEvent<HTMLElement>) => void;
  readonly onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  readonly isDragOver: boolean;
  readonly error: string | null;
  readonly clearError: () => void;
}

export function useStudentImageMultiUpload({
  currentImages,
  onAdd,
  maxImages = REALTIME_WALL_MAX_IMAGES_PER_POST,
  maxTotalBytes = REALTIME_WALL_MAX_IMAGES_TOTAL_BYTES,
}: UseStudentImageMultiUploadParams): UseStudentImageMultiUploadResult {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files) return;
      const list = Array.from(files);

      const remaining = maxImages - currentImages.length;
      if (remaining <= 0) {
        setError(`이미지는 최대 ${maxImages}장까지 첨부할 수 있어요.`);
        return;
      }
      if (list.length > remaining) {
        setError(`이미지 ${remaining}장만 더 첨부할 수 있어요.`);
        // 잘라서 진행
        list.length = remaining;
      } else {
        setError(null);
      }

      let runningTotalBytes = currentImages.reduce(
        (sum, dataUrl) => sum + approximateRawBytes(dataUrl),
        0,
      );

      for (const file of list) {
        if (!ALLOWED_MIMES.includes(file.type)) {
          setError('PNG / JPEG / GIF / WebP 이미지만 업로드할 수 있어요.');
          continue;
        }
        if (file.size > REALTIME_WALL_MAX_SINGLE_IMAGE_BYTES) {
          setError(`이미지 한 장은 최대 ${(REALTIME_WALL_MAX_SINGLE_IMAGE_BYTES / 1024 / 1024).toFixed(0)}MB까지 가능해요.`);
          continue;
        }
        try {
          const resized = await resizeImageToDataUrl(file);
          // 도메인 규칙 검증 (magic byte / SVG / size)
          const validation = validateImageDataUrl(resized);
          if (!validation.ok) {
            setError(translateImageError(validation.reason));
            continue;
          }
          const newBytes = approximateRawBytes(resized);
          if (runningTotalBytes + newBytes > maxTotalBytes) {
            setError(`이미지 합계 용량이 ${(maxTotalBytes / 1024 / 1024).toFixed(0)}MB를 넘어요.`);
            continue;
          }
          runningTotalBytes += newBytes;
          onAdd(resized);
        } catch (e) {
          setError('이미지 처리 중 문제가 생겼어요.');
        }
      }
    },
    [currentImages, maxImages, maxTotalBytes, onAdd],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      handleFiles(e.dataTransfer?.files ?? null);
    },
    [handleFiles],
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item && item.kind === 'file') {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        handleFiles(files);
      }
    },
    [handleFiles],
  );

  const onFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
      // input value reset (같은 파일 다시 선택 가능)
      e.target.value = '';
    },
    [handleFiles],
  );

  const clearError = useCallback(() => setError(null), []);

  // dragOver / dragLeave 이벤트 처리 (시각 피드백) — 부모가 onDragOver 부착
  // (단순화 — drop zone 컴포넌트가 onDragOver/Leave 처리, 훅은 boolean만 노출)
  void setIsDragOver;

  return { onDrop, onPaste, onFileSelect, isDragOver, error, clearError };
}

/**
 * canvas 리사이즈 + JPEG 인코딩.
 * - max width/height: 1280px
 * - quality: 0.8
 * - alpha 투명도 손실 (JPEG)
 * - EXIF 자동 제거 (canvas 거치면 손실)
 */
async function resizeImageToDataUrl(file: File): Promise<string> {
  const img = await loadImageFromFile(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
  const w = Math.max(1, Math.floor(img.width * scale));
  const h = Math.max(1, Math.floor(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2D context unavailable');
  // GIF는 첫 프레임만 보존 (애니메이션 손실)
  ctx.drawImage(img, 0, 0, w, h);

  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  // 메모리 cleanup
  URL.revokeObjectURL(img.src);
  return dataUrl;
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = URL.createObjectURL(file);
  });
}

function approximateRawBytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return 0;
  const base64Len = dataUrl.length - commaIdx - 1;
  const padding = dataUrl.endsWith('==') ? 2 : dataUrl.endsWith('=') ? 1 : 0;
  return Math.floor((base64Len * 3) / 4) - padding;
}

function translateImageError(reason: string): string {
  switch (reason) {
    case 'too-large':
      return '이미지가 너무 커요. 더 작은 이미지로 시도해주세요.';
    case 'svg-not-allowed':
      return 'SVG 이미지는 업로드할 수 없어요.';
    case 'invalid-format':
      return 'PNG / JPEG / GIF / WebP 이미지만 업로드할 수 있어요.';
    case 'magic-byte-mismatch':
      return '올바른 이미지 파일이 아니에요.';
    case 'invalid-data-url':
      return '이미지를 읽지 못했어요.';
    default:
      return '이미지를 추가하지 못했어요.';
  }
}
