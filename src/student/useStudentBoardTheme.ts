/**
 * v1.16.x 신규 (Phase 1, Design §5.5) — 학생 SPA 보드 테마 동적 토글 훅.
 *
 * 책임:
 *   - `boardSettings.theme` 입력 → `<html>` 클래스 + `--sp-accent` CSS variable 동적 토글.
 *   - colorScheme 'light' | 'dark' 변화 시 `theme-light` / `theme-dark` + Tailwind `dark` 클래스 토글.
 *   - accent (옵션) 변화 시 `<html>.style.setProperty('--sp-accent', accent)` 또는 removeProperty.
 *   - 2026-04-26: boardTheme.background를 `<body>`에 풀스크린으로 적용 → 헤더/PIN 칩/빈 영역까지
 *     하나의 일관된 배경으로 채움 (Padlet 동일 immersion). 단순 wrapper 적용 시 sp-bg 회색 영역
 *     남음 결함 fix.
 *   - effect 내부 직접 DOM 조작 — React tree는 unaware (모든 컴포넌트 re-render 회피).
 *
 * 회귀 위험 mitigation:
 *   - #8 (학생 SPA 첫 페인트 빈 화면): `applyDefaultBoardTheme()` 모듈 top-level에서 즉시 호출 가능.
 *     mount 이전 첫 페인트가 default(light + paper)로 이루어져 dark→light 깜빡임 0.
 *   - #10 (accent CSS injection): 입력 theme.accent는 Zod 검증 통과 hex 6자리만 — 본 훅은 신뢰.
 *   - #11 (body style 메모리 누수): 학생 SPA는 단일 페이지 앱이지만 안전을 위해 unmount 시 reset.
 *
 * 보드 wrapper 배경(inline style)도 별도 유지 — 보드 영역 자체에 동일 테마가 깔리므로 솔리드는
 * 완전 일치, 그라디언트/패턴은 약간의 시각 seam이 있을 수 있으나 Padlet 룩 정합.
 *
 * StrictMode 안전성: classList.add/remove + style.setProperty는 idempotent — 이중 mount 시에도 결과 동일.
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
 * 2026-04-26 신설 — boardTheme.background를 `<body>`에 풀스크린으로 적용.
 *
 * 결함 fix: 기존 wrapper 적용은 보드 컨텐츠 영역만 채워서 좌우/상단 헤더/하단 PIN 영역이
 * sp-bg(회색)로 남았음. body 전역 적용으로 Padlet 동일 풀-immersion 보장.
 *
 * 적용 필드:
 *   - backgroundColor: solid + pattern 의 baseline 색
 *   - background: gradient의 linear-gradient 문자열 (단축형이 backgroundColor도 reset함)
 *   - backgroundImage + backgroundSize: pattern의 dot/line/grid CSS image
 *
 * 이전 inline style은 매번 reset 후 재설정 — 다른 preset으로 전환 시 잔재 0.
 */
function applyBoardThemeBackgroundToBody(theme: WallBoardTheme): void {
  if (typeof document === 'undefined' || !document.body) return;
  const body = document.body;
  const variant = resolveBoardThemeVariant(theme.background.presetId, theme.colorScheme);
  // 매 적용 시 4종 필드 reset → 새 preset에 잔재 누적 0
  body.style.backgroundColor = '';
  body.style.background = '';
  body.style.backgroundImage = '';
  body.style.backgroundSize = '';
  if (!variant.style) return;
  const style = variant.style;
  if (style.background !== undefined) {
    body.style.background = String(style.background);
  }
  if (style.backgroundColor !== undefined) {
    body.style.backgroundColor = String(style.backgroundColor);
  }
  if (style.backgroundImage !== undefined) {
    body.style.backgroundImage = String(style.backgroundImage);
  }
  if (style.backgroundSize !== undefined) {
    body.style.backgroundSize = String(style.backgroundSize);
  }
}

/**
 * 2026-04-26 신설 — body inline style 4종 reset (cleanup 헬퍼).
 * 학생 SPA는 단일 페이지 앱이라 unmount 경로가 거의 없지만, 안전망으로 제공.
 */
function clearBoardThemeBackgroundFromBody(): void {
  if (typeof document === 'undefined' || !document.body) return;
  const body = document.body;
  body.style.backgroundColor = '';
  body.style.background = '';
  body.style.backgroundImage = '';
  body.style.backgroundSize = '';
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
  // 2026-04-26 — 4종 필드 모두 적용해 첫 페인트가 default(light + paper) 풀스크린.
  applyBoardThemeBackgroundToBody(DEFAULT_WALL_BOARD_THEME);
}

/**
 * 학생 SPA — `boardSettings.theme`를 `<html>` 클래스 + accent CSS variable + `<body>` background로 동적 토글.
 *
 * 사용 위치:
 *   - `StudentRealtimeWallApp.tsx` 최상위에서 호출.
 *   - `board?.settings?.theme` 변화 시 자동 trigger.
 *
 * 입력:
 *   - `theme: WallBoardTheme | undefined`
 *     - undefined (구버전 서버 호환 / wall-state 도착 전) → DEFAULT_WALL_BOARD_THEME 적용.
 *     - 정의 → 해당 colorScheme + accent + background 적용.
 *
 * cleanup:
 *   - colorScheme/accent 변화는 다음 effect가 덮어씀.
 *   - body background는 unmount 시 reset (다른 페이지 진입 / SPA 재초기화 시 회색으로 복귀).
 */
export function useStudentBoardTheme(theme: WallBoardTheme | undefined): void {
  const colorScheme = theme?.colorScheme ?? DEFAULT_WALL_BOARD_THEME.colorScheme;
  const accent = theme?.accent;
  // background는 객체 deps라 primitive로 분해해 안정성 보장.
  const presetId =
    theme?.background.presetId ?? DEFAULT_WALL_BOARD_THEME.background.presetId;
  const backgroundType =
    theme?.background.type ?? DEFAULT_WALL_BOARD_THEME.background.type;

  useEffect(() => {
    // <html> 클래스 + accent CSS variable
    applyBoardThemeToDocument({
      colorScheme,
      background: DEFAULT_WALL_BOARD_THEME.background, // background는 colorScheme/accent 적용에서 무시됨
      ...(accent !== undefined ? { accent } : {}),
    });
    // <body> 배경 — 풀스크린 Padlet immersion (2026-04-26 결함 fix)
    applyBoardThemeBackgroundToBody({
      colorScheme,
      background: { type: backgroundType, presetId },
      ...(accent !== undefined ? { accent } : {}),
    });
    return () => {
      // unmount 시 body 배경만 cleanup. <html> 클래스는 다음 mount의 effect가 재동기화.
      clearBoardThemeBackgroundFromBody();
    };
  }, [colorScheme, accent, presetId, backgroundType]);
}
