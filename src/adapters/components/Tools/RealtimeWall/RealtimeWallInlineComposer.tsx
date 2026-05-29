import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeWallCardColor } from '@domain/entities/RealtimeWall';
import {
  validateInlineCompose,
  INLINE_COMPOSER_FONT_SIZES,
  INLINE_COMPOSER_DEFAULT_FONT_SIZE,
  type InlineComposerFontSize,
  type NormalizedInlineCompose,
} from '@usecases/realtimeWall/InlineComposeCard';
import { REALTIME_WALL_MAX_TEXT_LENGTH_V2 } from '@domain/rules/realtimeWallRules';
import { StudentColorPicker } from './StudentColorPicker';

/**
 * RealtimeWallInlineComposer — β-Step6 (v2.0 inline composer UI)
 *
 * Spec L188: `InlineComposer | UI state (NEW v2.0) | active, trigger(double-click
 * 좌표·플러스 버튼), textDraft, color, fontSize | scoped-to current layout view`.
 *
 * 모달 우회 단축 경로 — 4 레이아웃(Kanban/Freeform/Grid/Stream) 빈 영역 더블클릭
 * 또는 "카드 추가" 버튼 트리거 시 부모가 좌표·columnId·tabId 컨텍스트와 함께 mount.
 *
 * 책임 경계:
 *   - 텍스트 입력 + 8색 픽커 + 폰트크기 토글만 노출 (이미지/PDF/링크/닉네임 X)
 *   - 첨부 모달과 명확히 구분 — 본 컴포저는 텍스트 메모 단축 작성용
 *   - submit 직전 `validateInlineCompose` 호출 (use case 책임 위임)
 *   - 부모가 nickname + columnId + freeformPosition 등 컨텍스트 주입
 *   - viewerRole='student' 분기는 `StudentInlineComposer` 래퍼가 추가 가드
 *
 * 회귀 보호:
 *   - 회귀 #1 status filter 무관 (Composer는 published 전 단계)
 *   - 회귀 #3 teacherActions guard 무관 (Composer는 카드 외부 노출)
 *   - 회귀 #4 prevSubmittingRef 무관 (Composer는 store.submitCard 호출하지 않고 onSubmit
 *     prop 으로 부모에 위임 — 부모가 store 상호작용 담당)
 *   - 회귀 #11 viewerRole 비대칭 0 — viewerRole prop 받지 않음 (부모가 권한 판단 후 mount)
 *   - 폰트크기는 UI state only (도메인 미저장) — RealtimeWallPost.fontSize 필드 부재 유지
 */

export interface RealtimeWallInlineComposerSubmitInput {
  /** validateInlineCompose 통과한 정규화 도메인 페이로드 */
  readonly normalized: NormalizedInlineCompose;
  /** UI 표시 도구 — 도메인 미저장 (carrier 가 카드 표시에만 적용) */
  readonly fontSize: InlineComposerFontSize;
}

export interface RealtimeWallInlineComposerProps {
  readonly open: boolean;
  /** ESC/blur/취소 시 호출 */
  readonly onCancel: () => void;
  /** 검증 통과 후 호출. 부모가 store.submitCard 또는 teacher add 핸들러로 전파 */
  readonly onSubmit: (input: RealtimeWallInlineComposerSubmitInput) => void;
  /** 현재 활성 탭 식별자 (β-Step8 student SPA / β-Step13 teacher tab strip 에서 주입) */
  readonly tabId?: string;
  /** Freeform 더블클릭 좌표 — 모서리 popup 위치 결정 (절대 위치 px). 미지정 시 부모 보드 중앙 */
  readonly anchorPosition?: { readonly x: number; readonly y: number };
  /** placeholder 안내 문구 (역할별 미세 조정 — student/teacher) */
  readonly placeholder?: string;
  /** 제출 버튼 라벨 (기본: '카드 추가') */
  readonly submitLabel?: string;
  /** 외부 disabled 게이트 (예: studentFormLocked) */
  readonly disabled?: boolean;
}

const FONT_SIZE_TEXTAREA_CLASS: Record<InlineComposerFontSize, string> = {
  small: 'text-xs',
  medium: 'text-sm',
  large: 'text-base',
};

const FONT_SIZE_LABEL: Record<InlineComposerFontSize, string> = {
  small: '작게',
  medium: '보통',
  large: '크게',
};

export function RealtimeWallInlineComposer({
  open,
  onCancel,
  onSubmit,
  tabId,
  anchorPosition,
  placeholder = '내용을 입력하고 Enter 또는 추가 버튼을 누르세요',
  submitLabel = '카드 추가',
  disabled = false,
}: RealtimeWallInlineComposerProps) {
  const [text, setText] = useState('');
  const [color, setColor] = useState<RealtimeWallCardColor | undefined>(undefined);
  const [fontSize, setFontSize] = useState<InlineComposerFontSize>(
    INLINE_COMPOSER_DEFAULT_FONT_SIZE,
  );
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // open 진입 시 초기화 + autofocus
  useEffect(() => {
    if (!open) return;
    setText('');
    setColor(undefined);
    setFontSize(INLINE_COMPOSER_DEFAULT_FONT_SIZE);
    setError(null);
    // microtask 후 focus — popup mount 완료 보장
    queueMicrotask(() => textareaRef.current?.focus());
  }, [open]);

  // ESC 키 닫기
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  const handleSubmit = useCallback(() => {
    if (disabled) return;
    const result = validateInlineCompose({ text, color, tabId });
    if (!result.ok) {
      // 사용자 친화 한국어 메시지
      const messages = {
        'text-empty': '내용을 입력해 주세요',
        'text-overflow': `${REALTIME_WALL_MAX_TEXT_LENGTH_V2}자 이내로 입력해 주세요`,
        'invalid-color': '색상이 올바르지 않아요',
      } as const;
      setError(messages[result.reason]);
      return;
    }
    setError(null);
    onSubmit({ normalized: result.value, fontSize });
  }, [disabled, text, color, tabId, fontSize, onSubmit]);

  // Enter 단축 (Shift+Enter 는 줄바꿈)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  if (!open) return null;

  const remaining = REALTIME_WALL_MAX_TEXT_LENGTH_V2 - text.length;
  const overflow = remaining < 0;
  const canSubmit = !disabled && text.trim().length > 0 && !overflow;

  // anchorPosition 가 있으면 절대 위치 popup, 없으면 부모가 wrap 한 위치 사용
  const positionStyle: React.CSSProperties = anchorPosition
    ? {
        position: 'absolute',
        left: Math.max(0, anchorPosition.x),
        top: Math.max(0, anchorPosition.y),
        zIndex: 40,
      }
    : {};

  return (
    <div
      style={positionStyle}
      className="w-[280px] rounded-xl border border-sp-border bg-sp-card p-3 shadow-2xl"
      role="dialog"
      aria-label="간단 카드 추가"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={4}
        disabled={disabled}
        aria-label="카드 내용"
        className={`w-full resize-none rounded-lg border border-sp-border/50 bg-sp-bg px-2.5 py-2 text-sp-text placeholder:text-sp-muted/60 focus:border-sp-accent focus:outline-none disabled:opacity-50 ${FONT_SIZE_TEXTAREA_CLASS[fontSize]}`}
      />
      <div className="mt-2 flex items-center justify-between text-detail">
        <span className={overflow ? 'text-rose-400' : 'text-sp-muted'}>
          {text.length}/{REALTIME_WALL_MAX_TEXT_LENGTH_V2}
        </span>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="글자 크기">
          {INLINE_COMPOSER_FONT_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              role="radio"
              aria-checked={fontSize === size}
              onClick={() => setFontSize(size)}
              disabled={disabled}
              className={`rounded-md border px-1.5 py-0.5 transition disabled:opacity-50 ${
                fontSize === size
                  ? 'border-sp-accent bg-sp-accent/15 text-sp-accent'
                  : 'border-sp-border text-sp-muted hover:border-sp-accent/40'
              }`}
              title={`글자 크기 ${FONT_SIZE_LABEL[size]}`}
            >
              {FONT_SIZE_LABEL[size]}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2">
        <StudentColorPicker value={color} onChange={setColor} disabled={disabled} />
      </div>
      {error && (
        <p className="mt-2 text-detail text-rose-400" role="alert">
          {error}
        </p>
      )}
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-sp-border bg-sp-surface px-3 py-1.5 text-xs text-sp-muted transition hover:border-sp-accent/40 hover:text-sp-text"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded-lg bg-sp-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sp-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
