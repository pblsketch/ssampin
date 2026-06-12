/**
 * ConsoleHeader — 콘솔 상단 고정 헤더.
 *
 * - 세션 제목 + 입장 코드 + 컨트롤(일시정지·종료).
 * - 일시정지는 phase=open 일 때만 활성.
 * - lobby/end phase에는 종료 버튼 라벨이 "세션 종료" 그대로 유지.
 *
 * sp-* 토큰: sp-surface / sp-border / sp-text / sp-muted
 */

import { memo } from 'react';
import type { LivePhase } from '@domain/entities/multiSurvey/LiveSession';

interface ConsoleHeaderProps {
  readonly surveyTitle: string;
  readonly phase: LivePhase;
  readonly onPause?: () => void;
  readonly onEnd?: () => void;
  /** DN-06: 집중 모드 현재 활성 상태 */
  readonly focusModeActive?: boolean;
  /** DN-06: 집중 모드 토글 콜백 */
  readonly onToggleFocusMode?: (active: boolean) => void;
  /** DN-06: displayOpts.teacherFocusMode 토글 ON 시에만 버튼 노출 */
  readonly showFocusModeButton?: boolean;
  /** 작업 1: [교실 화면 열기] 버튼 콜백 */
  readonly onOpenShareWindow?: () => void;
}

function ConsoleHeaderImpl({
  surveyTitle,
  phase,
  onPause,
  onEnd,
  focusModeActive = false,
  onToggleFocusMode,
  showFocusModeButton = false,
  onOpenShareWindow,
}: ConsoleHeaderProps): JSX.Element {
  const canPause = phase === 'open';
  return (
    <header
      className="flex items-center justify-between border-b border-sp-border bg-sp-surface px-8 py-4 text-sp-text"
      role="banner"
      aria-label="콘솔 헤더"
    >
      <div className="flex items-baseline gap-6">
        <span className="font-sp-bold text-sp-text" style={{ fontSize: 22 }}>
          {surveyTitle}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {/* 작업 1: 교실 화면 열기 버튼 */}
        {onOpenShareWindow && (
          <button
            type="button"
            onClick={onOpenShareWindow}
            className="rounded-lg border border-sp-border bg-sp-surface px-4 py-2 font-sp-medium text-sp-text hover:border-sp-muted transition-colors duration-sp-base"
            style={{ fontSize: 14 }}
            aria-label="교실 화면 열기"
          >
            교실 화면 열기
          </button>
        )}
        {/* DN-06: 집중 모드 버튼 — displayOpts.teacherFocusMode ON 시만 노출 */}
        {showFocusModeButton && onToggleFocusMode && (
          <button
            type="button"
            onClick={() => onToggleFocusMode(!focusModeActive)}
            className={
              focusModeActive
                ? 'rounded-lg border border-sp-accent bg-sp-accent px-4 py-2 font-sp-semibold text-[color:var(--sp-accent-fg)] transition-colors duration-sp-base'
                : 'rounded-lg border border-sp-border bg-sp-surface px-4 py-2 font-sp-medium text-sp-text hover:border-sp-muted transition-colors duration-sp-base'
            }
            style={{ fontSize: 14 }}
            aria-label={focusModeActive ? '집중 모드 끄기' : '집중 모드 켜기'}
            aria-pressed={focusModeActive}
          >
            👀 집중 모드
          </button>
        )}
        {onPause && (
          <button
            type="button"
            onClick={onPause}
            disabled={!canPause}
            className="rounded-lg border border-sp-border bg-sp-surface px-4 py-2 font-sp-medium text-sp-text hover:border-sp-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-sp-base"
            style={{ fontSize: 14 }}
            aria-label="일시정지"
          >
            일시정지
          </button>
        )}
        <button
          type="button"
          onClick={onEnd}
          className="rounded-lg border border-sp-border bg-sp-surface px-4 py-2 font-sp-medium text-sp-text hover:border-sp-muted transition-colors duration-sp-base"
          style={{ fontSize: 14 }}
          aria-label="세션 종료"
        >
          세션 종료
        </button>
      </div>
    </header>
  );
}

export const ConsoleHeader = memo(ConsoleHeaderImpl);
