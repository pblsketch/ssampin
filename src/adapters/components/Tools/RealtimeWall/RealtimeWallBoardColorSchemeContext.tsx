/**
 * 2026-04-26 신설 — 보드 colorScheme React Context.
 *
 * 결함 #2 fix (교사 카드 글쓴이/제목/본문 invisible):
 *   교사 main app은 `<html class="dark">` 강제이므로 Tailwind `dark:` variant가 항상 활성화됨.
 *   그러나 boardTheme.colorScheme는 기본 'light' → 보드 배경은 light beige인데 카드 클래스는
 *   `dark:bg-amber-900/30` + `dark:text-slate-100`으로 렌더되어 light 보드 위에 흰 글씨 invisible.
 *
 *   학생 SPA는 `useStudentBoardTheme`가 html.dark를 boardTheme.colorScheme과 동기화하므로 OK.
 *
 *   해결책: 카드/상세모달이 `dark:` variant 의존을 버리고 본 Context에서 colorScheme를 받아
 *   `getCardColorClass(color, scheme)` 등 헬퍼로 명시적 분기. html.dark 클래스 무관 동작.
 *
 * 사용처:
 *   - `RealtimeWallBoardThemeWrapper`가 자동 provider로 동작 — 보드 영역 내 모든 카드 자동 적용.
 *   - `RealtimeWallCardDetailModal`은 wrapper 외부에 렌더되므로 부모(ToolRealtimeWall /
 *     StudentBoardView)가 명시적으로 provider로 감싸 동일 colorScheme 주입.
 *
 * 회귀 위험:
 *   - #11 (viewerRole 비대칭): 본 context는 viewerRole 무관 — 학생/교사 양쪽 동일 적용. PASS.
 *   - 기본값 'light': context provider 부재 시(테스트/스토리북) DEFAULT_WALL_BOARD_THEME과 동일. PASS.
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { WallBoardColorScheme } from '@domain/entities/RealtimeWallBoardTheme';

const BoardColorSchemeContext = createContext<WallBoardColorScheme>('light');

export interface RealtimeWallBoardColorSchemeProviderProps {
  readonly value: WallBoardColorScheme;
  readonly children: ReactNode;
}

export function RealtimeWallBoardColorSchemeProvider({
  value,
  children,
}: RealtimeWallBoardColorSchemeProviderProps) {
  return (
    <BoardColorSchemeContext.Provider value={value}>
      {children}
    </BoardColorSchemeContext.Provider>
  );
}

/**
 * 보드 colorScheme 조회. provider 부재 시 'light' 반환 (DEFAULT_WALL_BOARD_THEME 기본).
 */
export function useRealtimeWallBoardColorScheme(): WallBoardColorScheme {
  return useContext(BoardColorSchemeContext);
}
