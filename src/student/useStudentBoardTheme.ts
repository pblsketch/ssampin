/**
 * v1.16.x 신규 (Phase 1, Design §5.5) — 학생 SPA 보드 테마 동적 토글 훅.
 *
 * 책임:
 *   - `boardSettings.theme` 입력 → `<html>` 클래스 + `--sp-accent` CSS variable 동적 토글.
 *   - colorScheme 'light' | 'dark' 변화 시 `theme-light` / `theme-dark` + Tailwind `dark` 클래스 토글.
 *   - accent (옵션) 변화 시 `<html>.style.setProperty('--sp-accent', accent)` 또는 removeProperty.
 *   - effect 내부 직접 DOM 조작 — React tree는 unaware (모든 컴포넌트 re-render 회피).
 *
 * 회귀 위험 mitigation:
 *   - #8 (학생 SPA 첫 페인트 빈 화면): `applyDefaultBoardTheme()` 모듈 top-level에서 즉시 호출 가능.
 *     mount 이전 첫 페인트가 default(light + paper)로 이루어져 dark→light 깜빡임 0.
 *   - #10 (accent CSS injection): 입력 theme.accent는 Zod 검증 통과 hex 6자리만 — 본 훅은 신뢰.
 *
 * 보드 wrapper 배경(inline style)은 별도 — `StudentBoardView.tsx`가 같은 theme를 prop으로 받아 처리.
 *
 * StrictMode 안전성: classList.add/remove는 idempotent — 이중 mount 시에도 결과 동일.
 */

import { useEffect } from 'react';
import {
  DEFAULT_WALL_BOARD_THEME,
  type WallBoardTheme,
} from '@domain/entities/RealtimeWallBoardTheme';
import { resolveBoardThemeVariant } from '@adapters/components/Tools/RealtimeWall/RealtimeWallBoardThemePresets';

const THEME_LIGHT_CLASS = 'theme-light';
const THEME_DARK_CLASS = 'theme-dark';
const TAILWIND_DARK_CLASS = 'dark';
const ACCENT_CSS_VAR = '--sp-accent';

/**
 * `<html>`에 colorScheme 클래스를 적용하고 accent CSS variable을 set/remove.
 * 모듈 top-level (mount 이전) + effect 양쪽에서 호출 가능 — 동일 동작.
 *
 * 외부 의존: `document.documentElement` — DOM 환경 가정. SSR/노드 환경 호출 금지.
 */
function applyBoardThemeToDocument(theme: WallBoardTheme): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  if (!html) return;

  if (theme.colorScheme === 'dark') {
    html.classList.add(THEME_DARK_CLASS);
    html.classList.add(TAILWIND_DARK_CLASS);
    html.classList.remove(THEME_LIGHT_CLASS);
  } else {
    html.classList.add(THEME_LIGHT_CLASS);
    html.classList.remove(THEME_DARK_CLASS);
    html.classList.remove(TAILWIND_DARK_CLASS);
  }

  if (theme.accent) {
    html.style.setProperty(ACCENT_CSS_VAR, theme.accent);
  } else {
    html.style.removeProperty(ACCENT_CSS_VAR);
  }
}

/**
 * 모듈 top-level / mount 이전에서 호출 — 첫 페인트 시 default theme 즉시 주입.
 *
 * 회귀 위험 #8 핵심 mitigation:
 *   - `src/student/main.tsx`에서 `theme-dark` 강제 두 줄을 제거하면, wall-state 도착 전
 *     (~0.3~1초) 빈 화면 또는 잘못된 색상이 보일 위험.
 *   - 본 헬퍼를 main.tsx mount 이전 module top-level에서 호출하면 첫 페인트가 default(light + paper)로 보장됨.
 *   - body의 background도 default 단색으로 즉시 채워 cloudflared 터널 latency 사이의 빈 화면을 가린다.
 *
 * 이 함수는 useEffect 내부가 아닌 main.tsx top-level에서 즉시 호출하는 것을 의도한다.
 */
export function applyDefaultBoardTheme(): void {
  if (typeof document === 'undefined') return;
  applyBoardThemeToDocument(DEFAULT_WALL_BOARD_THEME);

  // Default 배경(solid-neutral-paper)도 body에 즉시 깔아둔다 — wall-state 도착 전 빈 화면 방지.
  const variant = resolveBoardThemeVariant(
    DEFAULT_WALL_BOARD_THEME.background.presetId,
    DEFAULT_WALL_BOARD_THEME.colorScheme,
  );
  if (variant.style && document.body) {
    const style = variant.style;
    if (style.backgroundColor !== undefined) {
      document.body.style.backgroundColor = String(style.backgroundColor);
    }
    if (style.background !== undefined) {
      document.body.style.background = String(style.background);
    }
  }
}

/**
 * 학생 SPA — `boardSettings.theme`를 `<html>` 클래스 + accent CSS variable로 동적 토글.
 *
 * 사용 위치:
 *   - `StudentRealtimeWallApp.tsx` 최상위에서 호출.
 *   - `board?.settings?.theme` 변화 시 자동 trigger.
 *
 * 입력:
 *   - `theme: WallBoardTheme | undefined`
 *     - undefined (구버전 서버 호환 / wall-state 도착 전) → DEFAULT_WALL_BOARD_THEME 적용.
 *     - 정의 → 해당 colorScheme + accent 적용.
 *
 * cleanup: 페이지 unmount 시 별도 정리 X — 학생 SPA는 단일 페이지 앱이므로
 * unmount 시점은 페이지 종료와 같다. 다음 mount 시 effect가 다시 동기화.
 */
export function useStudentBoardTheme(theme: WallBoardTheme | undefined): void {
  const colorScheme = theme?.colorScheme ?? DEFAULT_WALL_BOARD_THEME.colorScheme;
  const accent = theme?.accent;

  useEffect(() => {
    // 본 훅은 colorScheme + accent 변화만 추적 — background는 wrapper inline style 책임.
    // theme 객체가 매번 새로 만들어져도 primitive deps만으로 효과 한 번씩만 실행됨.
    applyBoardThemeToDocument({
      colorScheme,
      background: DEFAULT_WALL_BOARD_THEME.background, // background는 무시되는 placeholder
      ...(accent !== undefined ? { accent } : {}),
    });
  }, [colorScheme, accent]);
}
