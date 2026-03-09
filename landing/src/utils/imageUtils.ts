/** 이미지 첨부 유틸리티 (랜딩 페이지용) */

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_WIDTH = 1920;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

interface ValidationResult {
  valid: boolean;
  error?: string;
}

/** 이미지 파일 유효성 검사 */
export function validateImage(file: File): ValidationResult {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: `지원하지 않는 형식이에요 (${file.type}). JPEG, PNG, GIF, WebP만 가능해요.` };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `파일이 너무 커요 (${(file.size / 1024 / 1024).toFixed(1)}MB). 최대 5MB까지 가능해요.` };
  }
  return { valid: true };
}

/** File → base64 data URL 변환 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('파일 읽기 실패'));
      }
    };
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.readAsDataURL(file);
  });
}

/** 이미지 리사이즈 (maxWidth 초과 시) */
export function resizeImage(dataUrl: string, maxWidth: number = MAX_WIDTH): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (img.width <= maxWidth) {
        resolve(dataUrl);
        return;
      }
      const ratio = maxWidth / img.width;
      const canvas = document.createElement('canvas');
      canvas.width = maxWidth;
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 생성 실패'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const mimeMatch = dataUrl.match(/^data:(image\/\w+);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const quality = mime === 'image/jpeg' ? 0.85 : undefined;
      resolve(canvas.toDataURL(mime, quality));
    };
    img.onerror = () => reject(new Error('이미지 로드 실패'));
    img.src = dataUrl;
  });
}

/** 클립보드 이벤트에서 이미지 파일 추출 */
export function getImageFromClipboard(e: ClipboardEvent): File | null {
  const items = e.clipboardData?.items;
  if (!items) return null;
  for (let i = 0; i < items.length; i++) {
    const item: DataTransferItem | undefined = items[i];
    if (item && item.type.startsWith('image/')) {
      return item.getAsFile();
    }
  }
  return null;
}
