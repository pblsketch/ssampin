/**
 * 옆핀 메모 편집기 — 메모 칸 전체를 차지하는 화면.
 *
 * 목록 안에서 펼치지 않고 화면을 통째로 바꾸는 이유는 폭이다. 옆핀은 400 안팎으로
 * 좁아서, 목록 사이에 편집기를 끼우면 쓰는 칸이 더 좁아지고 주변 메모가 계속 눈에 들어와
 * 산만해진다. 대신 **돌아가는 길을 항상 왼쪽 위에 두고**, Esc로도 돌아갈 수 있게 한다.
 *
 * 삭제는 별도 대화상자를 띄우지 않고 아래에 확인 줄을 편다. 옆핀 창은 좁고 항상 위에 떠
 * 있어서, 그 위에 창을 하나 더 띄우면 어디를 눌러야 할지 알기 어렵다. **글자 크기와
 * 이미지도 같은 규칙을 따른다** — 띄우지 않고 줄을 편다.
 *
 * 도구 줄을 한 줄로 유지하는 것도 제품 결정이다. 패널 최소 폭 360에서 고정 요소가
 * 170 안팎이라 아이콘 두 개를 더 넣을 자리가 남는다. 자리가 있는데도 팝오버로 접으면
 * 클릭이 한 번 늘고, "잠깐 적고 닫는" 자리에서는 그 한 번이 크다. 다만 글자 크기는
 * 고를 것이 넷이라 한 줄에 다 못 넣으므로 그것만 펼침 줄로 뺀다.
 */
import { useEffect, useRef, useState } from 'react';
import { MEMO_COLORS, type MemoColor } from '@domain/valueObjects/MemoColor';
import {
  MEMO_FONT_SIZES,
  MEMO_FONT_SIZE_CLASS,
  MEMO_FONT_SIZE_LABEL,
  type MemoFontSize,
} from '@domain/valueObjects/MemoFontSize';
import { MEMO_IMAGE_LIMITS, type MemoImage } from '@domain/valueObjects/MemoImage';
import { SIDE_PIN_MEMO_FOCUS } from './SidePinMemoList';

const COLOR_SWATCH: Record<MemoColor, string> = {
  yellow: 'bg-yellow-300',
  pink: 'bg-pink-300',
  green: 'bg-green-300',
  blue: 'bg-blue-300',
};

const COLOR_LABEL: Record<MemoColor, string> = {
  yellow: '노랑',
  pink: '분홍',
  green: '초록',
  blue: '파랑',
};

/** 첨부 이미지를 접어 둔 높이 (px) — 글 쓰는 칸을 너무 먹지 않는 선 */
export const SIDE_PIN_IMAGE_COLLAPSED_H = MEMO_IMAGE_LIMITS.THUMBNAIL_HEIGHT;

/** 이미지를 눌러 펼쳤을 때 높이 (px) — 좁은 패널이라 전체 화면 뷰어 대신 이만큼만 키운다 */
export const SIDE_PIN_IMAGE_EXPANDED_H = 260;

/** 이미지를 붙이지 못한 이유를 사람 말로 옮긴다 */
export const SIDE_PIN_IMAGE_ERROR_TEXT: Record<'size' | 'mime' | 'decode', string> = {
  size: '이미지가 너무 큽니다. 5MB까지 넣을 수 있어요.',
  mime: 'PNG·JPG·WebP 그림만 넣을 수 있어요.',
  decode: '이미지를 읽지 못했습니다. 다른 파일로 해 보세요.',
};

export type SidePinImageError = keyof typeof SIDE_PIN_IMAGE_ERROR_TEXT;

/** 파일 선택 창에 넘길 확장자 목록 — 허용 MIME과 같은 곳에서 가져온다 */
const IMAGE_ACCEPT = MEMO_IMAGE_LIMITS.ALLOWED_MIME.join(',');

export interface SidePinMemoEditorProps {
  readonly content: string;
  readonly color: MemoColor;
  readonly fontSize: MemoFontSize;
  /** 붙어 있는 이미지. 없으면 첨부 단추만 보인다 */
  readonly image?: MemoImage;
  /** 이미지를 붙이지 못한 이유. 있으면 안내 줄이 펴진다 */
  readonly imageError: SidePinImageError | null;
  /** 저장 중이면 사람에게 알린다 — 조용히 사라지는 저장은 믿기 어렵다 */
  readonly saving: boolean;
  /** 삭제 확인 줄이 펼쳐져 있는가 */
  readonly confirmingDelete: boolean;
  readonly onChange: (content: string) => void;
  readonly onColorChange: (color: MemoColor) => void;
  readonly onFontSizeChange: (fontSize: MemoFontSize) => void;
  /**
   * 파일 선택 창을 여는 순간 알린다. 이걸 안 하면 대화상자를 보는 동안
   * 마우스가 패널을 벗어나 옆핀이 접히고, 고른 그림이 붙을 자리가 사라진다.
   */
  readonly onImagePickStart: () => void;
  readonly onImagePicked: (file: File) => void;
  readonly onImagePickCancel: () => void;
  readonly onImageRemove: () => void;
  readonly onImageErrorDismiss: () => void;
  readonly onBack: () => void;
  readonly onAskDelete: () => void;
  readonly onCancelDelete: () => void;
  readonly onConfirmDelete: () => void;
}

export function SidePinMemoEditor({
  content,
  color,
  fontSize,
  image,
  imageError,
  saving,
  confirmingDelete,
  onChange,
  onColorChange,
  onFontSizeChange,
  onImagePickStart,
  onImagePicked,
  onImagePickCancel,
  onImageRemove,
  onImageErrorDismiss,
  onBack,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: SidePinMemoEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [sizeRowOpen, setSizeRowOpen] = useState(false);
  const [imageExpanded, setImageExpanded] = useState(false);

  // 열자마자 바로 쓸 수 있어야 한다. 한 번 더 눌러야 커서가 생기면
  // "잠깐 적는다"는 목적이 무너진다.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // 이미지가 떨어져 나가면 펼친 상태도 함께 접는다.
  // 안 그러면 다음 이미지를 붙였을 때 난데없이 커진 채로 나온다.
  useEffect(() => {
    if (image === undefined) setImageExpanded(false);
  }, [image]);

  const pickImage = (): void => {
    onImagePickStart();
    fileRef.current?.click();
  };

  return (
    <section aria-label="메모 편집" className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-1 px-2 pb-1 pt-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="메모 목록으로"
          className={`flex h-7 items-center gap-1 rounded-lg px-1.5 text-caption font-medium text-sp-muted transition-colors duration-sp-quick hover:bg-sp-surface hover:text-sp-text ${SIDE_PIN_MEMO_FOCUS}`}
        >
          <span aria-hidden className="material-symbols-outlined text-icon-sm leading-none">
            arrow_back
          </span>
          목록
        </button>

        {/* 저장은 자동이라 눈에 보이는 신호가 없으면 "저장됐나?"가 남는다 */}
        <span
          aria-live="polite"
          className="min-w-0 flex-1 truncate px-1 text-caption text-sp-muted"
        >
          {saving ? '저장 중…' : ''}
        </span>

        <button
          type="button"
          onClick={() => setSizeRowOpen((open) => !open)}
          aria-label="글자 크기"
          aria-expanded={sizeRowOpen}
          title={`글자 크기: ${MEMO_FONT_SIZE_LABEL[fontSize]}`}
          className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-sp-quick hover:bg-sp-surface hover:text-sp-text ${
            sizeRowOpen ? 'bg-sp-surface text-sp-accent' : 'text-sp-muted'
          } ${SIDE_PIN_MEMO_FOCUS}`}
        >
          <span aria-hidden className="material-symbols-outlined text-icon-sm leading-none">
            format_size
          </span>
        </button>

        <button
          type="button"
          onClick={pickImage}
          aria-label={image === undefined ? '이미지 넣기' : '이미지 바꾸기'}
          className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-sp-quick hover:bg-sp-surface hover:text-sp-text ${
            image === undefined ? 'text-sp-muted' : 'text-sp-accent'
          } ${SIDE_PIN_MEMO_FOCUS}`}
        >
          <span aria-hidden className="material-symbols-outlined text-icon-sm leading-none">
            image
          </span>
        </button>

        {/*
          파일 선택 창을 닫는 방법은 둘이다 — 고르거나, 취소하거나. 취소에는 이벤트가
          없으므로 창이 포커스를 되찾는 것으로 알아채야 한다. 그 판단은 이 화면이 아니라
          "쓰는 중"을 관리하는 메모 칸이 한다.
        */}
        <input
          ref={fileRef}
          type="file"
          accept={IMAGE_ACCEPT}
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            // 같은 파일을 두 번 고를 수 있어야 한다. 값을 비우지 않으면
            // 두 번째 선택에서 change가 오지 않는다.
            e.target.value = '';
            if (file === undefined) onImagePickCancel();
            else onImagePicked(file);
          }}
        />

        <div className="flex items-center gap-1" role="group" aria-label="메모 색">
          {MEMO_COLORS.map((option) => (
            <button
              key={option}
              type="button"
              aria-label={COLOR_LABEL[option]}
              aria-pressed={option === color}
              onClick={() => onColorChange(option)}
              className={`h-4 w-4 rounded-full transition-transform duration-sp-quick ${
                COLOR_SWATCH[option]
              } ${
                option === color
                  ? 'outline outline-2 outline-offset-2 outline-sp-accent'
                  : 'opacity-60 hover:opacity-100'
              } ${SIDE_PIN_MEMO_FOCUS}`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={onAskDelete}
          aria-label="메모 삭제"
          className={`ml-1 flex h-7 w-7 items-center justify-center rounded-lg text-sp-muted transition-colors duration-sp-quick hover:bg-sp-surface hover:text-sp-text ${SIDE_PIN_MEMO_FOCUS}`}
        >
          <span aria-hidden className="material-symbols-outlined text-icon-sm leading-none">
            delete
          </span>
        </button>
      </header>

      {sizeRowOpen && (
        <div
          className="flex shrink-0 items-center gap-1 border-b border-sp-border px-3 pb-2"
          role="group"
          aria-label="글자 크기"
        >
          {MEMO_FONT_SIZES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === fontSize}
              onClick={() => onFontSizeChange(option)}
              className={`rounded-lg px-2 py-1 text-caption font-medium transition-colors duration-sp-quick ${
                option === fontSize
                  ? 'bg-sp-accent text-sp-accent-fg'
                  : 'text-sp-muted hover:bg-sp-surface hover:text-sp-text'
              } ${SIDE_PIN_MEMO_FOCUS}`}
            >
              {MEMO_FONT_SIZE_LABEL[option]}
            </button>
          ))}
        </div>
      )}

      {imageError !== null && (
        <div className="flex shrink-0 items-center gap-2 border-b border-sp-border px-3 py-2">
          <span
            aria-hidden
            className="material-symbols-outlined text-icon-sm leading-none text-sp-muted"
          >
            error
          </span>
          <span role="alert" className="flex-1 text-caption text-sp-text">
            {SIDE_PIN_IMAGE_ERROR_TEXT[imageError]}
          </span>
          <button
            type="button"
            onClick={onImageErrorDismiss}
            aria-label="안내 닫기"
            className={`flex h-6 w-6 items-center justify-center rounded-lg text-sp-muted transition-colors duration-sp-quick hover:bg-sp-surface hover:text-sp-text ${SIDE_PIN_MEMO_FOCUS}`}
          >
            <span aria-hidden className="material-symbols-outlined text-icon-sm leading-none">
              close
            </span>
          </button>
        </div>
      )}

      {image !== undefined && (
        <div className="shrink-0 px-3 pb-2 pt-1">
          <div
            className="relative overflow-hidden rounded-lg bg-sp-surface"
            style={{
              height: `${imageExpanded ? SIDE_PIN_IMAGE_EXPANDED_H : SIDE_PIN_IMAGE_COLLAPSED_H}px`,
            }}
          >
            {/*
              본체 메모는 눌러서 원본 크기 뷰어를 띄운다. 옆핀은 좁고 항상 위에 떠 있어
              그 위에 창을 더 얹으면 삭제 확인과 같은 문제가 생긴다. 대신 제자리에서 키운다.
            */}
            <button
              type="button"
              onClick={() => setImageExpanded((expanded) => !expanded)}
              aria-label={imageExpanded ? '이미지 접기' : '이미지 크게 보기'}
              aria-expanded={imageExpanded}
              className={`h-full w-full ${SIDE_PIN_MEMO_FOCUS}`}
            >
              <img
                src={image.dataUrl}
                alt={image.fileName}
                draggable={false}
                className={`h-full w-full transition-opacity duration-sp-quick hover:opacity-90 ${
                  imageExpanded ? 'object-contain' : 'object-cover'
                }`}
              />
            </button>
            <button
              type="button"
              onClick={onImageRemove}
              aria-label="이미지 빼기"
              className={`absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-sp-bg/80 text-sp-text transition-colors duration-sp-quick hover:bg-sp-bg ${SIDE_PIN_MEMO_FOCUS}`}
            >
              <span aria-hidden className="material-symbols-outlined text-icon-sm leading-none">
                close
              </span>
            </button>
          </div>
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Esc는 목록으로 돌아간다. 여기서 멈추지 않으면 패널 자체가 닫혀
          // 쓰던 메모에서 그대로 튕겨 나간다.
          if (e.key !== 'Escape') return;
          e.preventDefault();
          e.stopPropagation();
          if (confirmingDelete) onCancelDelete();
          else if (sizeRowOpen) setSizeRowOpen(false);
          else onBack();
        }}
        placeholder="여기에 적으세요"
        aria-label="메모 내용"
        className={`min-h-0 flex-1 resize-none bg-transparent px-3 pb-3 leading-relaxed text-sp-text outline-none placeholder:text-sp-muted ${MEMO_FONT_SIZE_CLASS[fontSize]}`}
      />

      {confirmingDelete && (
        <div className="flex shrink-0 items-center gap-2 border-t border-sp-border px-3 py-2">
          <span className="flex-1 text-caption text-sp-text">이 메모를 지울까요?</span>
          <button
            type="button"
            onClick={onCancelDelete}
            className={`rounded-lg px-2 py-1 text-caption font-medium text-sp-muted transition-colors duration-sp-quick hover:bg-sp-surface hover:text-sp-text ${SIDE_PIN_MEMO_FOCUS}`}
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirmDelete}
            className={`rounded-lg bg-sp-accent px-2 py-1 text-caption font-medium text-sp-accent-fg transition-colors duration-sp-quick ${SIDE_PIN_MEMO_FOCUS}`}
          >
            삭제
          </button>
        </div>
      )}
    </section>
  );
}
