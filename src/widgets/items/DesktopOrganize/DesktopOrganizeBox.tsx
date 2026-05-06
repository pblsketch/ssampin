import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { MAX_BOX_TITLE_LENGTH } from '@domain/entities/DesktopOrganizeConfig';

interface DesktopOrganizeBoxProps {
  readonly index: number;
  readonly title: string;
  readonly isEditMode: boolean;
  /**
   * 박스 내부 투명 여부.
   * - true: 완전 투명 (native-desktop 모드에서 OS 바탕화면 그대로 보임)
   * - false: sp-card 반투명 배경 (라이트 톤 위젯에서 박스 영역 시각 강조)
   */
  readonly isTransparent: boolean;
  readonly onTitleChange: (index: number, title: string) => void;
}

/**
 * 카테고리 박스 1개.
 *
 * 시각적 영역만 — 박스 안에 어떤 아이콘이 있는지 추적하지 않는다.
 * native-desktop 모드에서 박스 빈 공간 클릭은 hook 라우팅으로 widget에 도달하지만,
 * 박스 자체는 onClick 핸들러를 두지 않아 NoOp으로 자연 통과.
 *
 * 편집 모드:
 * - 제목이 <span> → <input>으로 전환
 * - 박스 hover 시 펜 아이콘 표시 (인라인 편집 진입 안내)
 * - Enter/Blur로 저장, Escape로 이전 값 복원
 * - IME 조합 중 Enter는 무시 (한국어 입력 호환)
 */
export function DesktopOrganizeBox({
  index,
  title,
  isEditMode,
  isTransparent,
  onTitleChange,
}: DesktopOrganizeBoxProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [isComposing, setIsComposing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // title prop이 외부에서 바뀌면 draft 동기화 (편집 중이 아닐 때만)
  useEffect(() => {
    if (!isEditing) {
      setDraftTitle(title);
    }
  }, [title, isEditing]);

  // 편집 모드 빠지면 편집 종료
  useEffect(() => {
    if (!isEditMode && isEditing) {
      setIsEditing(false);
      setDraftTitle(title);
    }
  }, [isEditMode, isEditing, title]);

  // 인풋 활성 시 autoFocus + 텍스트 전체 선택
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const startEditing = () => {
    if (!isEditMode) return;
    setDraftTitle(title);
    setIsEditing(true);
  };

  const commit = () => {
    setIsEditing(false);
    if (draftTitle.trim() !== title) {
      onTitleChange(index, draftTitle);
    }
  };

  const cancel = () => {
    setDraftTitle(title);
    setIsEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // IME 조합 중 Enter는 IME가 처리 (한글 마침)
      if (isComposing || e.nativeEvent.isComposing) return;
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  const placeholder = `카테고리 ${index + 1}`;
  const displayTitle = title.length > 0 ? title : placeholder;

  return (
    <div
      className={[
        'group relative h-full rounded-xl border transition-colors motion-reduce:transition-none',
        // Tailwind alpha-suffix(/50)가 var-based sp-card 토큰에 적용되지 않으므로
        // 0% / 100% 두 상태로 명확히 구분.
        isTransparent ? 'bg-transparent' : 'bg-sp-card',
        isEditMode
          ? 'border-sp-border hover:border-sp-accent'
          : 'border-sp-border',
      ].join(' ')}
      role="region"
      aria-label={`카테고리 박스: ${displayTitle}`}
    >
      {/* 제목 영역 */}
      <div className="px-3 pt-2 pb-1 border-b border-sp-border/60">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={draftTitle}
            maxLength={MAX_BOX_TITLE_LENGTH}
            onChange={(e) => setDraftTitle(e.target.value)}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            aria-label={`박스 ${index + 1} 제목`}
            className="w-full bg-transparent border border-sp-accent/50 rounded-lg px-2 py-0.5 text-sm font-bold text-sp-text focus:outline-none focus:border-sp-accent"
          />
        ) : (
          <div className="flex items-center justify-between gap-1">
            <span
              className={[
                'truncate text-sm font-bold flex-1',
                title.length > 0 ? 'text-sp-text' : 'text-sp-muted/60',
              ].join(' ')}
              onDoubleClick={isEditMode ? startEditing : undefined}
              title={isEditMode ? '더블클릭하여 제목 수정' : undefined}
            >
              {displayTitle}
            </span>
            {isEditMode && (
              <button
                type="button"
                onClick={startEditing}
                aria-label={`박스 ${index + 1} 제목 편집`}
                className="opacity-0 group-hover:opacity-100 text-sp-muted hover:text-sp-accent transition-opacity transition-colors motion-reduce:transition-none"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  edit
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* 빈 영역 — view 모드에서 NoOp.
          중요: onClick / pointer-events:none 사용 금지 (native-desktop hook 라우팅 보존).
          박스 위로 OS 바탕화면 아이콘이 시각적으로 올라오는 영역. */}
      <div className="flex-1" />
    </div>
  );
}
