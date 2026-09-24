import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TimerDisplayStyle } from '@domain/entities/Settings';
import { DualToolContext } from '../DualToolContext';
import { CLASSROOM_MAX_DIAMETER, type TimerGeometry } from './timerGeometry';
import { useTimerStageSize } from './useTimerStageSize';

/**
 * 교실 화면 모드 — TV·빔에 시간만 크게(ADR-139, spec 5-5, 설계 9장).
 *
 * - 프리셋·± 단추·설정·탭·도구 머리글을 숨기고 화면 전체를 쓴다.
 * - 마우스를 움직이거나 화면을 한 번 누르면 [멈춤/재개]·(다음 동작)·[나가기]가 3초간 보인다.
 *   화면을 누르는 것만으로는 멈추지 않는다(전자칠판 터치).
 * - Esc·[나가기]는 교실 화면만 나간다(도구를 나가지 않는다). 도구 머리글의 Esc 보다 먼저 가로챈다.
 * - 들어갈 때 그 창의 전체화면을 켜고, 나갈 때는 **교실 화면이 켠 전체화면만** 끈다.
 *   사용자가 전체화면을 먼저 풀면 교실 화면도 함께 나간다. 병렬 칸에서는 그 칸만 채운다.
 */

/** 단추가 보였다가 사라지기까지(ms, 조정 가능). */
export const CLASSROOM_CONTROLS_VISIBLE_MS = 3000;

export interface ClassroomNextAction {
  readonly label: string;
  readonly icon: string;
  readonly onClick: () => void;
}

interface ClassroomOverlayProps {
  readonly onExit: () => void;
  readonly displayStyle: TimerDisplayStyle;
  /** 원 위의 줄들(활동 이름·단계 이름·발표자 등). */
  readonly top?: React.ReactNode;
  /** 원 아래 줄(끝나는 시각 등). */
  readonly bottom?: React.ReactNode;
  /** 스테이지 안에 그릴 원·숫자. */
  readonly renderStage: (
    geometry: TimerGeometry,
    stageSize: { readonly width: number; readonly height: number },
  ) => React.ReactNode;
  /** null 이면 멈춤 단추를 두지 않는다(끝난 뒤 등). */
  readonly pause: { readonly paused: boolean; readonly onToggle: () => void } | null;
  readonly nextAction?: ClassroomNextAction | null;
  /** 교실 화면 위에 덮는 것(시간 종료 화면 등). */
  readonly overlay?: React.ReactNode;
}

function cardBackground(): React.CSSProperties {
  // sp-* 토큰에 Tailwind 투명도 수식은 규칙이 만들어지지 않는다 — 인라인 color-mix 로 섞는다.
  return { backgroundColor: 'color-mix(in srgb, var(--sp-card) 92%, transparent)' };
}

export function ClassroomOverlay({
  onExit,
  displayStyle,
  top,
  bottom,
  renderStage,
  pause,
  nextAction,
  overlay,
}: ClassroomOverlayProps): JSX.Element {
  const inSlot = useContext(DualToolContext) !== null;
  const { stageRef, geometry, stageSize } = useTimerStageSize(displayStyle, CLASSROOM_MAX_DIAMETER);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enteredFullscreenRef = useRef(false);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(
      () => setControlsVisible(false),
      CLASSROOM_CONTROLS_VISIBLE_MS,
    );
  }, []);

  useEffect(() => {
    revealControls();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [revealControls]);

  // Esc 는 교실 화면만 나간다 — 도구 머리글(뒤로·칸 닫기)보다 먼저 가로챈다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onExitRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // 전체화면: 교실 화면이 켠 것만 끄고, 사용자가 먼저 풀면 교실 화면도 나간다.
  useEffect(() => {
    if (inSlot || typeof document === 'undefined') return;
    const root = document.documentElement;
    if (document.fullscreenElement === null && typeof root.requestFullscreen === 'function') {
      root
        .requestFullscreen()
        .then(() => {
          enteredFullscreenRef.current = true;
        })
        .catch(() => undefined);
    }
    const onChange = (): void => {
      if (enteredFullscreenRef.current && document.fullscreenElement === null) {
        enteredFullscreenRef.current = false;
        onExitRef.current();
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (enteredFullscreenRef.current && document.fullscreenElement !== null) {
        enteredFullscreenRef.current = false;
        void document.exitFullscreen().catch(() => undefined);
      }
    };
  }, [inSlot]);

  const body = (
    <div
      data-sp-overlay-surface
      data-testid="classroom-overlay"
      role="region"
      aria-label="교실 화면"
      className={`${inSlot ? 'absolute' : 'fixed'} inset-0 z-sp-modal bg-sp-bg text-sp-text flex flex-col items-center px-8 pt-10 pb-28 ${
        controlsVisible ? '' : 'cursor-none'
      }`}
      style={{ backgroundColor: 'var(--sp-bg)' }}
      onMouseMove={revealControls}
      onPointerDown={revealControls}
    >
      {top !== undefined && (
        <div className="flex flex-col items-center gap-2 text-center shrink-0">{top}</div>
      )}
      <div ref={stageRef} className="flex-1 min-h-0 w-full flex items-center justify-center">
        {renderStage(geometry, stageSize)}
      </div>
      {/* 아래 단추 줄(bottom-8, 높이 56px)과 겹치지 않게 전체 아래 여백(pb-28)을 남겨 둔다. */}
      {bottom !== undefined && (
        <div className="shrink-0 text-lg md:text-2xl text-sp-muted text-center">{bottom}</div>
      )}

      <div
        className={`${inSlot ? 'absolute' : 'fixed'} bottom-8 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 transition-opacity duration-300 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {pause !== null && (
          <button
            type="button"
            onClick={pause.onToggle}
            aria-label={pause.paused ? '다시 시작' : '잠시 멈춤'}
            title={pause.paused ? '다시 시작 (Space)' : '잠시 멈춤 (Space)'}
            className="w-14 h-14 rounded-full border border-sp-border text-sp-text flex items-center justify-center hover:border-sp-accent transition-colors"
            style={cardBackground()}
          >
            <span className="material-symbols-outlined text-2xl">
              {pause.paused ? 'play_arrow' : 'pause'}
            </span>
          </button>
        )}
        {nextAction && (
          <button
            type="button"
            onClick={nextAction.onClick}
            className="h-14 px-6 rounded-full bg-sp-accent text-sp-accent-fg font-bold flex items-center gap-2 hover:brightness-110 transition"
          >
            <span className="material-symbols-outlined text-2xl">{nextAction.icon}</span>
            {nextAction.label}
          </button>
        )}
        <button
          type="button"
          onClick={onExit}
          aria-label="교실 화면 나가기"
          title="교실 화면 나가기 (Esc)"
          className="w-14 h-14 rounded-full border border-sp-border text-sp-muted flex items-center justify-center hover:text-sp-text transition-colors"
          style={cardBackground()}
        >
          <span className="material-symbols-outlined text-2xl">close</span>
        </button>
      </div>
      {overlay}
    </div>
  );

  if (inSlot || typeof document === 'undefined') return body;
  return createPortal(body, document.body);
}
