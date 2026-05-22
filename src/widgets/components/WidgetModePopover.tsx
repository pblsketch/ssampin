import { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import type { WidgetDesktopMode } from '@domain/entities/Settings';
import { isWindows } from '@adapters/hooks/shortcut/keyNormalize';

/**
 * widget-mode-discovery (v2.1.x~) — 헤더 모드 칩 클릭 시 열리는 모드 미리보기 팝오버.
 *
 * 모드 3종 카드(썸네일 SVG + 라벨 + 설명 + 적용 버튼)를 한눈에 비교 가능하도록 노출.
 * 현재 모드는 강조 표시, native-desktop은 비-Windows에서 disabled.
 *
 * 호출자는 `anchorRect`(칩의 viewport rect)와 onSelect/onClose, onShowTour 콜백을 제공한다.
 * 적용 결정은 호출자가 처리(applyWidgetSettings IPC + analytics + settings store update).
 */

interface WidgetModePopoverProps {
  readonly anchorRect: DOMRect;
  readonly currentMode: WidgetDesktopMode;
  readonly onSelect: (mode: WidgetDesktopMode) => void;
  readonly onShowTour: () => void;
  readonly onClose: () => void;
}

interface ModeOption {
  readonly value: WidgetDesktopMode;
  readonly label: string;
  readonly desc: string;
  readonly preview: string; // svg URL (public 경로)
  readonly winOnly?: boolean;
}

const MODE_OPTIONS: readonly ModeOption[] = [
  {
    value: 'normal',
    label: '일반',
    desc: '평범한 창처럼 — 다른 창에 가려질 수 있어요.',
    preview: '/mode-preview/normal.svg',
  },
  {
    value: 'topmost',
    label: '항상 위에',
    desc: '다른 창 위에 고정 — 수업 중에도 안 가려져요.',
    preview: '/mode-preview/topmost.svg',
  },
  {
    value: 'native-desktop',
    label: '바탕화면 아이콘 아래',
    desc: '바탕화면 작업판처럼 깔리고, 아이콘은 위에서 그대로 클릭 가능. Windows 전용.',
    preview: '/mode-preview/native-desktop.svg',
    winOnly: true,
  },
];

export function WidgetModePopover({
  anchorRect,
  currentMode,
  onSelect,
  onShowTour,
  onClose,
}: WidgetModePopoverProps): JSX.Element {
  const popoverRef = useRef<HTMLDivElement>(null);
  const win = isWindows();

  // 외부 클릭 닫기
  useEffect(() => {
    const handle = (e: MouseEvent): void => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  // ESC 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 위치 계산: anchor 아래, 우측 정렬. 뷰포트 클램핑.
  const POPOVER_W = 320;
  const POPOVER_MAX_H = 480;
  const top = Math.min(anchorRect.bottom + 6, window.innerHeight - POPOVER_MAX_H - 8);
  const left = Math.min(
    Math.max(8, anchorRect.right - POPOVER_W),
    window.innerWidth - POPOVER_W - 8,
  );

  const content = (
    <div
      ref={popoverRef}
      className="fixed z-[9999] bg-sp-card/95 backdrop-blur-xl rounded-xl border border-sp-border shadow-2xl overflow-hidden"
      style={{ left, top, width: POPOVER_W }}
      role="dialog"
      aria-label="위젯 표시 모드 선택"
      data-testid="widget-mode-popover"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="px-3 pt-3 pb-2 border-b border-sp-border/50">
        <p className="text-xs uppercase tracking-wider text-sp-muted font-semibold">
          위젯 표시 모드
        </p>
        <p className="text-[11px] text-sp-muted mt-0.5">언제든 다시 바꿀 수 있어요</p>
      </div>

      <div className="p-2 space-y-1.5 max-h-[380px] overflow-y-auto">
        {MODE_OPTIONS.map((opt) => {
          const isActive = opt.value === currentMode;
          const disabled = opt.winOnly === true && !win;
          return (
            <button
              key={opt.value}
              type="button"
              className={[
                'w-full text-left rounded-lg border transition-colors p-2 flex gap-2.5 items-start',
                isActive
                  ? 'border-sp-accent bg-sp-accent/10'
                  : disabled
                    ? 'border-sp-border/50 opacity-50 cursor-not-allowed'
                    : 'border-sp-border/50 hover:border-sp-accent/60 hover:bg-sp-text/5',
              ].join(' ')}
              onClick={() => {
                if (disabled || isActive) return;
                onSelect(opt.value);
              }}
              disabled={disabled || isActive}
              title={disabled ? 'Windows에서만 사용할 수 있는 기능입니다' : undefined}
              data-testid={`mode-option-${opt.value}`}
            >
              <img
                src={opt.preview}
                alt=""
                width={72}
                height={48}
                className="flex-shrink-0 rounded text-sp-muted"
                style={{ color: 'currentColor' }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-sp-text">{opt.label}</span>
                  {opt.winOnly && (
                    <span className="px-1 py-0.5 rounded bg-sp-accent/15 text-sp-accent text-[9px] font-bold">
                      Windows
                    </span>
                  )}
                  {isActive && (
                    <span
                      className="material-symbols-outlined text-sp-accent"
                      style={{ fontSize: 14 }}
                    >
                      check_circle
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-sp-muted mt-0.5 leading-snug">{opt.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="border-t border-sp-border/50 px-3 py-2 flex justify-between items-center">
        <button
          type="button"
          className="text-[11px] text-sp-muted hover:text-sp-text underline-offset-2 hover:underline"
          onClick={() => {
            onShowTour();
            onClose();
          }}
        >
          모드 가이드 다시 보기
        </button>
        <button
          type="button"
          className="text-[11px] text-sp-muted hover:text-sp-text"
          onClick={onClose}
        >
          닫기
        </button>
      </div>
    </div>
  );

  return ReactDOM.createPortal(content, document.body);
}
