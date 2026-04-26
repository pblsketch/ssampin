/**
 * v1.16.x Phase 2 (Design §5.3) — 보드 호스트 wrapper.
 *
 * 책임:
 *   - `WallBoardTheme` 입력 → `resolveBoardThemeVariant` 호출 후 wrapper에 inline style + className spread.
 *   - 4개 보드 컴포넌트(Kanban / Freeform / Grid / Stream) 자체는 수정 X — 본 wrapper로 한 번에 적용.
 *   - 교사 측(ToolRealtimeWall) + 학생 측(StudentBoardView) 동일 사용 — 픽셀 일치 보장.
 *
 * 카드는 보드와 독립 (회귀 #7):
 *   - 본 wrapper는 보드 배경에만 영향. RealtimeWallCard의 bg-sp-card / 8색 alpha 80% 매핑은 그대로.
 *   - colorScheme이 dark일 때 카드의 dark 변형(이미 RealtimeWallCardColors에 정의)이 자동 적용됨.
 *
 * 회귀 위험 mitigation:
 *   - #10 (CSS injection): style은 카탈로그 hardcoded만 — 외부 입력 보간 0.
 *   - D-2 (style 객체 매 render 새 생성): useMemo로 안정화 → 자식 board 컴포넌트 useMemo deps에서 안정.
 */

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import {
  DEFAULT_WALL_BOARD_THEME,
  type WallBoardTheme,
} from '@domain/entities/RealtimeWallBoardTheme';
import { resolveBoardThemeVariant } from './RealtimeWallBoardThemePresets';

interface RealtimeWallBoardThemeWrapperProps {
  /** 적용할 보드 테마. undefined면 default(light + paper) 적용. */
  readonly theme: WallBoardTheme | undefined;
  /** 추가 className (보드별 height/scroll 등). */
  readonly className?: string;
  /** 보드 컴포넌트 (Kanban/Freeform/Grid/Stream 중 하나). */
  readonly children: ReactNode;
}

/**
 * 보드 호스트 wrapper — 교사/학생 양쪽에서 동일하게 사용.
 *
 * 사용 예:
 * ```tsx
 * <RealtimeWallBoardThemeWrapper theme={board?.settings?.theme} className="h-full min-h-0">
 *   <RealtimeWallKanbanBoard ... />
 * </RealtimeWallBoardThemeWrapper>
 * ```
 */
export function RealtimeWallBoardThemeWrapper({
  theme,
  className = '',
  children,
}: RealtimeWallBoardThemeWrapperProps) {
  const resolved = theme ?? DEFAULT_WALL_BOARD_THEME;
  const variant = useMemo(
    () => resolveBoardThemeVariant(resolved.background.presetId, resolved.colorScheme),
    [resolved.background.presetId, resolved.colorScheme],
  );

  // Memoize style object — 카드 컴포넌트가 useMemo deps에서 안정 (D-2 mitigation)
  const mergedStyle = useMemo<CSSProperties>(
    () => ({ ...(variant.style ?? {}) }),
    [variant.style],
  );

  const mergedClassName = [variant.className ?? '', className]
    .filter(Boolean)
    .join(' ')
    .trim();

  return (
    <div className={mergedClassName} style={mergedStyle}>
      {children}
    </div>
  );
}
