import { useEffect, useState } from 'react';
import type { WidgetDesktopMode, WidgetLayoutMode } from '@domain/entities/Settings';

/**
 * widget-mode-discovery (v2.1.x~) — 위젯 헤더 우상단의 작은 모드 인디케이터 칩.
 *
 * 캡스락 인디케이터 패러다임 — 알약 모양, 색·아이콘으로 상태만 표시, 라벨은 좁은 폭에서
 * 자동 숨김 + 호버 시 툴팁. 클릭 시 onClick(WidgetModePopover 또는 FallbackModal 트리거).
 *
 * 상태 매핑:
 *   - normal           : 회색  + desktop_windows
 *   - topmost          : 파랑  + push_pin
 *   - native-desktop   : amber + dashboard
 *   - fallback         : 빨강  + error (currentMode 위에 우선 표시)
 *
 * 좁은 폭(컨테이너 < 720px 또는 layoutMode='sidebar-right')일 때 라벨 숨김 → 아이콘만.
 */

export interface ModeFallbackInfo {
  readonly reason: string;
  readonly fallbackMode: 'normal' | 'topmost';
}

interface WidgetModeIndicatorProps {
  readonly currentMode: WidgetDesktopMode;
  readonly fallback: ModeFallbackInfo | null;
  readonly onClick: () => void;
  /**
   * 현재 위젯 레이아웃 모드. 'sidebar-right'는 좁은 1열 폭이라 라벨을 항상 숨김.
   * 그 외 모드는 window.innerWidth < 720px일 때만 라벨 숨김.
   */
  readonly layoutMode: WidgetLayoutMode;
}

interface ModeVisual {
  readonly icon: string;
  readonly label: string;
  readonly tone: 'gray' | 'blue' | 'amber' | 'red';
}

const MODE_VISUAL: Record<WidgetDesktopMode, ModeVisual> = {
  normal: { icon: 'desktop_windows', label: '일반', tone: 'gray' },
  topmost: { icon: 'push_pin', label: '항상 위', tone: 'blue' },
  'native-desktop': { icon: 'dashboard', label: '바탕화면', tone: 'amber' },
};

const FALLBACK_VISUAL: ModeVisual = {
  icon: 'error',
  label: '적용 실패',
  tone: 'red',
};

function toneClasses(tone: ModeVisual['tone']): string {
  switch (tone) {
    case 'gray':
      return 'bg-sp-border/40 text-sp-text hover:bg-sp-border/60';
    case 'blue':
      return 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30';
    case 'amber':
      return 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30';
    case 'red':
      return 'bg-red-500/25 text-red-400 hover:bg-red-500/35 animate-pulse';
  }
}

const NARROW_THRESHOLD_PX = 720;

export function WidgetModeIndicator({
  currentMode,
  fallback,
  onClick,
  layoutMode,
}: WidgetModeIndicatorProps): JSX.Element {
  // 화면 폭 < 임계치이면 라벨 숨김(아이콘만).
  const [narrowByWidth, setNarrowByWidth] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < NARROW_THRESHOLD_PX;
  });

  useEffect(() => {
    const onResize = (): void => setNarrowByWidth(window.innerWidth < NARROW_THRESHOLD_PX);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // sidebar-right 레이아웃은 위젯 폭이 1/4로 좁아 헤더에 라벨까지 노출하면 다른 버튼이 잘림.
  // narrowByWidth || sidebar-right 둘 중 하나라도 참이면 라벨 숨김.
  const narrow = narrowByWidth || layoutMode === 'sidebar-right';

  const visual = fallback ? FALLBACK_VISUAL : MODE_VISUAL[currentMode];
  const tooltip = fallback
    ? `모드 적용 실패 — 클릭해서 진단 보기 (사유: ${fallback.reason})`
    : `현재 모드: ${visual.label} — 클릭해서 다른 모드 보기`;

  return (
    <button
      type="button"
      className={[
        'inline-flex items-center gap-1.5 px-2 py-1 rounded-full transition-colors text-xs font-medium',
        toneClasses(visual.tone),
      ].join(' ')}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      title={tooltip}
      aria-label={tooltip}
      data-testid="widget-mode-indicator"
      data-mode={fallback ? 'fallback' : currentMode}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
        {visual.icon}
      </span>
      {!narrow && <span className="leading-none">{visual.label}</span>}
    </button>
  );
}
