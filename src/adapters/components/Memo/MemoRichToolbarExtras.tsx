import { useCallback } from 'react';
import type { MemoFontSize } from '@domain/valueObjects/MemoFontSize';
import { clampFontSizeStep, MEMO_FONT_SIZE_LABEL } from '@domain/valueObjects/MemoFontSize';

interface MemoRichToolbarExtrasProps {
  fontSize: MemoFontSize;
  onFontSizeChange: (fontSize: MemoFontSize) => void;
  hasImage: boolean;
  /** 이미지 첨부 요청 — 외부 file input을 트리거해야 한다.
   *  파일 다이얼로그는 편집 모드 blur를 일으킬 수 있으므로,
   *  file input 자체는 이 컴포넌트 밖(편집 상태와 무관한 위치)에 두어야 한다. */
  onAttachRequest: () => void;
  onDetachImage: () => void;
}

/**
 * MemoRichEditor 내부 툴바의 FORMAT 버튼 뒤에 붙는 확장 도구 모음.
 * 글자 크기 증감(A- / 라벨 / A+) + 이미지 첨부/제거 버튼.
 *
 * B/U/S 버튼과 동일하게 모든 클릭 로직을 onMouseDown에서 실행한다.
 * preventDefault로 contentEditable focus를 유지하고, mousedown 직후 즉시
 * 핸들러를 실행하므로 click 이벤트 의존성이 없다.
 */
export function MemoRichToolbarExtras({
  fontSize,
  onFontSizeChange,
  hasImage,
  onAttachRequest,
  onDetachImage,
}: MemoRichToolbarExtrasProps) {
  const handleFontSizeStep = useCallback(
    (delta: 1 | -1) => {
      const next = clampFontSizeStep(fontSize, delta);
      if (next !== fontSize) {
        onFontSizeChange(next);
      }
    },
    [fontSize, onFontSizeChange],
  );

  const handleImageMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (hasImage) {
        onDetachImage();
      } else {
        onAttachRequest();
      }
    },
    [hasImage, onAttachRequest, onDetachImage],
  );

  return (
    <>
      <span className="mx-0.5 h-5 w-px bg-black/10" aria-hidden />
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          handleFontSizeStep(-1);
        }}
        disabled={fontSize === 'sm'}
        className="flex h-7 w-7 items-center justify-center rounded text-sp-muted transition-colors hover:bg-black/10 hover:text-sp-text disabled:cursor-not-allowed disabled:opacity-40"
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
        onMouseDown={(e) => {
          e.preventDefault();
          handleFontSizeStep(1);
        }}
        disabled={fontSize === 'xl'}
        className="flex h-7 w-7 items-center justify-center rounded text-sp-muted transition-colors hover:bg-black/10 hover:text-sp-text disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="글자 크게"
        title="글자 크게"
      >
        <span className="material-symbols-outlined text-icon">text_increase</span>
      </button>
      <span className="mx-0.5 h-5 w-px bg-black/10" aria-hidden />
      <button
        type="button"
        onMouseDown={handleImageMouseDown}
        className="flex h-7 w-7 items-center justify-center rounded text-sp-muted transition-colors hover:bg-black/10 hover:text-sp-text"
        aria-label={hasImage ? '이미지 제거' : '이미지 첨부'}
        title={hasImage ? '이미지 제거' : '이미지 첨부'}
      >
        <span className="material-symbols-outlined text-icon">
          {hasImage ? 'hide_image' : 'add_photo_alternate'}
        </span>
      </button>
    </>
  );
}
