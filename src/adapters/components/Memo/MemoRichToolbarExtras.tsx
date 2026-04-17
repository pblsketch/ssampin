import { useRef, useCallback } from 'react';
import type { MemoFontSize } from '@domain/valueObjects/MemoFontSize';
import { clampFontSizeStep, MEMO_FONT_SIZE_LABEL } from '@domain/valueObjects/MemoFontSize';
import { isAllowedMemoImageMime } from '@domain/valueObjects/MemoImage';

interface MemoRichToolbarExtrasProps {
  fontSize: MemoFontSize;
  onFontSizeChange: (fontSize: MemoFontSize) => void;
  hasImage: boolean;
  onAttachImage: (blob: Blob, fileName: string) => void;
  onDetachImage: () => void;
}

/**
 * MemoRichEditor 내부 툴바의 FORMAT 버튼 뒤에 붙는 확장 도구 모음.
 * 글자 크기 증감(A- / 라벨 / A+) + 이미지 첨부/제거 버튼.
 *
 * 모든 버튼은 onMouseDown preventDefault로 contentEditable의 focus를 유지한다.
 * (편집 모드에서 도구를 눌러도 blur로 빠져나가지 않도록)
 */
export function MemoRichToolbarExtras({
  fontSize,
  onFontSizeChange,
  hasImage,
  onAttachImage,
  onDetachImage,
}: MemoRichToolbarExtrasProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFontSizeStep = useCallback(
    (delta: 1 | -1) => {
      const next = clampFontSizeStep(fontSize, delta);
      if (next !== fontSize) {
        onFontSizeChange(next);
      }
    },
    [fontSize, onFontSizeChange],
  );

  const handleImageButton = useCallback(() => {
    if (hasImage) {
      onDetachImage();
    } else {
      fileInputRef.current?.click();
    }
  }, [hasImage, onDetachImage]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file !== undefined && isAllowedMemoImageMime(file.type)) {
        onAttachImage(file, file.name);
      }
      e.target.value = '';
    },
    [onAttachImage],
  );

  const preventBlur = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return (
    <>
      <span className="mx-0.5 h-5 w-px bg-black/10" aria-hidden />
      <button
        type="button"
        onMouseDown={preventBlur}
        onClick={() => handleFontSizeStep(-1)}
        disabled={fontSize === 'sm'}
        className="flex h-7 w-7 items-center justify-center rounded text-sp-muted transition-colors hover:bg-black/10 hover:text-sp-text disabled:opacity-40"
        aria-label="글자 작게"
        title="글자 작게"
      >
        <span className="material-symbols-outlined text-icon">text_decrease</span>
      </button>
      <span className="min-w-[32px] text-center text-xs text-sp-muted select-none">
        {MEMO_FONT_SIZE_LABEL[fontSize]}
      </span>
      <button
        type="button"
        onMouseDown={preventBlur}
        onClick={() => handleFontSizeStep(1)}
        disabled={fontSize === 'xl'}
        className="flex h-7 w-7 items-center justify-center rounded text-sp-muted transition-colors hover:bg-black/10 hover:text-sp-text disabled:opacity-40"
        aria-label="글자 크게"
        title="글자 크게"
      >
        <span className="material-symbols-outlined text-icon">text_increase</span>
      </button>
      <span className="mx-0.5 h-5 w-px bg-black/10" aria-hidden />
      <button
        type="button"
        onMouseDown={preventBlur}
        onClick={handleImageButton}
        className="flex h-7 w-7 items-center justify-center rounded text-sp-muted transition-colors hover:bg-black/10 hover:text-sp-text"
        aria-label={hasImage ? '이미지 제거' : '이미지 첨부'}
        title={hasImage ? '이미지 제거' : '이미지 첨부'}
      >
        <span className="material-symbols-outlined text-icon">
          {hasImage ? 'hide_image' : 'add_photo_alternate'}
        </span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
    </>
  );
}
