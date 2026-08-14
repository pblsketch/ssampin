/**
 * 옆핀 메모 편집기 — 메모 칸 전체를 차지하는 화면.
 *
 * 목록 안에서 펼치지 않고 화면을 통째로 바꾸는 이유는 폭이다. 옆핀은 400 안팎으로
 * 좁아서, 목록 사이에 편집기를 끼우면 쓰는 칸이 더 좁아지고 주변 메모가 계속 눈에 들어와
 * 산만해진다. 대신 **돌아가는 길을 항상 왼쪽 위에 두고**, Esc로도 돌아갈 수 있게 한다.
 *
 * 삭제는 별도 대화상자를 띄우지 않고 아래에 확인 줄을 편다. 옆핀 창은 좁고 항상 위에 떠
 * 있어서, 그 위에 창을 하나 더 띄우면 어디를 눌러야 할지 알기 어렵다.
 */
import { useEffect, useRef } from 'react';
import { MEMO_COLORS, type MemoColor } from '@domain/valueObjects/MemoColor';
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

export interface SidePinMemoEditorProps {
  readonly content: string;
  readonly color: MemoColor;
  /** 저장 중이면 사람에게 알린다 — 조용히 사라지는 저장은 믿기 어렵다 */
  readonly saving: boolean;
  /** 삭제 확인 줄이 펼쳐져 있는가 */
  readonly confirmingDelete: boolean;
  readonly onChange: (content: string) => void;
  readonly onColorChange: (color: MemoColor) => void;
  readonly onBack: () => void;
  readonly onAskDelete: () => void;
  readonly onCancelDelete: () => void;
  readonly onConfirmDelete: () => void;
}

export function SidePinMemoEditor({
  content,
  color,
  saving,
  confirmingDelete,
  onChange,
  onColorChange,
  onBack,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: SidePinMemoEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 열자마자 바로 쓸 수 있어야 한다. 한 번 더 눌러야 커서가 생기면
  // "잠깐 적는다"는 목적이 무너진다.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

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
        <span aria-live="polite" className="flex-1 truncate px-1 text-caption text-sp-muted">
          {saving ? '저장 중…' : ''}
        </span>

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
          else onBack();
        }}
        placeholder="여기에 적으세요"
        aria-label="메모 내용"
        className="min-h-0 flex-1 resize-none bg-transparent px-3 pb-3 text-sm leading-relaxed text-sp-text outline-none placeholder:text-sp-muted"
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
