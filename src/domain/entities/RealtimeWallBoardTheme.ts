/**
 * v1.16.x 신규 — 보드 단위 디자인 테마 도메인 엔티티 (Design §3.1).
 *
 * 책임:
 *   - 보드 색상 스킴(light/dark)과 배경 프리셋 ID, 선택적 accent override 보유.
 *   - CSS 매핑(className/inline style)은 보유 X — adapters 레이어 (`RealtimeWallBoardThemePresets.ts`)가 책임.
 *   - 외부 의존 0 (순수 TypeScript) — Clean Architecture 도메인 레이어 규칙 준수.
 *
 * 핵심 정책 (Plan §1.1 + Design §0.2):
 *   - 프리셋만 (이미지 업로드 v2 후속).
 *   - light / dark 2개만 (system 자동 감지 OOS).
 *   - 학생 자동 추종 (학생 개별 토글 X).
 *
 * 보안:
 *   - presetId는 화이트리스트 enum 12종만 허용 — Zod 검증은 usecases 레이어에서.
 *   - accent는 hex 6자리만 (`/^#[0-9a-fA-F]{6}$/`) — CSS injection 차단.
 */

/**
 * 보드 색상 스킴 — light / dark 2개만 (Plan 결정 #3).
 * system 자동 감지는 OOS — 학생 화면 일관성 우선.
 */
export type WallBoardColorScheme = 'light' | 'dark';

/**
 * 보드 배경 타입.
 * - solid: 단색 4종
 * - gradient: 약한 그라디언트 4종 (카드 융합 위험 mitigation)
 * - pattern: CSS background-image 패턴 4종 (SVG 외부 파일 X)
 */
export type WallBoardBackgroundType = 'solid' | 'gradient' | 'pattern';

/**
 * 12 프리셋 ID 화이트리스트 (Plan 결정 #8 / Design §결정 8).
 * Zod enum으로 strict 검증 — 임의 ID는 CSS injection 차단.
 *
 * 카탈로그 본체(라벨/CSS 매핑)는 `adapters/components/Tools/RealtimeWall/RealtimeWallBoardThemePresets.ts`.
 */
export const WALL_BOARD_BACKGROUND_PRESET_IDS = [
  // solid 4 (단색)
  'solid-neutral-paper',  // 기본
  'solid-cream',
  'solid-slate',
  'solid-charcoal',
  // gradient 4 (그라디언트, 약한 채도만)
  'gradient-sunrise',
  'gradient-ocean',
  'gradient-forest',
  'gradient-lavender',
  // pattern 4 (CSS gradient만 — SVG 외부 파일 X)
  'pattern-dot-grid',
  'pattern-diagonal-lines',
  'pattern-notebook',
  'pattern-grid',
] as const;

export type WallBoardBackgroundPresetId =
  (typeof WALL_BOARD_BACKGROUND_PRESET_IDS)[number];

const WALL_BOARD_BACKGROUND_PRESET_ID_SET = new Set<string>(
  WALL_BOARD_BACKGROUND_PRESET_IDS as readonly string[],
);

const WALL_BOARD_BACKGROUND_TYPES: readonly WallBoardBackgroundType[] = [
  'solid',
  'gradient',
  'pattern',
] as const;

const WALL_BOARD_BACKGROUND_TYPE_SET = new Set<string>(WALL_BOARD_BACKGROUND_TYPES);

export interface WallBoardBackground {
  readonly type: WallBoardBackgroundType;
  readonly presetId: WallBoardBackgroundPresetId;
}

/**
 * 보드 단위 디자인 테마. `RealtimeWallBoardSettings.theme`로 부착.
 *
 * Phase 1: colorScheme + background 신설.
 * Phase 2: UI 변경 시 broadcast.
 * accent는 도메인만 보유 — UI 픽커는 v2 후속 (Plan 결정 #4).
 */
export interface WallBoardTheme {
  readonly colorScheme: WallBoardColorScheme;
  readonly background: WallBoardBackground;
  /**
   * accent CSS variable (`--sp-accent`) inline override — hex 6자리만.
   * - 프리셋이 명시하지 않으면 undefined → 기본 sp-accent 유지
   * - UI 노출은 v2 후속 (사용자 픽커 X)
   * - Zod 정규식: /^#[0-9a-fA-F]{6}$/
   */
  readonly accent?: string;
}

/**
 * Default theme — main.tsx mount 직후 즉시 주입(첫 페인트 회귀 mitigation #8).
 * normalizeBoardForPadletModeV2가 v1.14~v2.1 보드 로드 시 자동 부착.
 */
export const DEFAULT_WALL_BOARD_THEME: WallBoardTheme = {
  colorScheme: 'light',
  background: {
    type: 'solid',
    presetId: 'solid-neutral-paper',
  },
};

/** accent hex 6자리 정규식 (CSS injection 차단). */
const ACCENT_HEX_REGEX = /^#[0-9a-fA-F]{6}$/;

/**
 * 도메인 정규화 함수 — 외부 페이로드(unknown)를 안전한 WallBoardTheme로 변환.
 *
 * 동작:
 *   - 입력이 객체가 아니거나 null이면 `DEFAULT_WALL_BOARD_THEME` 반환.
 *   - colorScheme이 'dark' 외 모든 값은 'light'로 fallback.
 *   - background.presetId가 화이트리스트 외이면 default presetId 사용.
 *   - background.type이 enum 외이면 default type 사용.
 *   - accent는 hex 6자리 정규식 통과 값만 보존, 그 외 undefined.
 *
 * 회귀 위험 mitigation:
 *   - #8 (강제 dark 제거 후 빈 화면): 잘못된 페이로드도 default fallback으로 학생 화면 깨짐 0.
 *   - #10 (accent CSS injection): hex 정규식 미통과 값 차단.
 */
export function normalizeWallBoardTheme(input: unknown): WallBoardTheme {
  if (!input || typeof input !== 'object') {
    return DEFAULT_WALL_BOARD_THEME;
  }
  const obj = input as Record<string, unknown>;

  const colorScheme: WallBoardColorScheme =
    obj['colorScheme'] === 'dark' ? 'dark' : 'light';

  const bgRaw = obj['background'];
  const bg = bgRaw && typeof bgRaw === 'object'
    ? (bgRaw as Record<string, unknown>)
    : null;

  const presetIdRaw = bg?.['presetId'];
  const presetId: WallBoardBackgroundPresetId =
    typeof presetIdRaw === 'string' && WALL_BOARD_BACKGROUND_PRESET_ID_SET.has(presetIdRaw)
      ? (presetIdRaw as WallBoardBackgroundPresetId)
      : DEFAULT_WALL_BOARD_THEME.background.presetId;

  const typeRaw = bg?.['type'];
  const type: WallBoardBackgroundType =
    typeof typeRaw === 'string' && WALL_BOARD_BACKGROUND_TYPE_SET.has(typeRaw)
      ? (typeRaw as WallBoardBackgroundType)
      : DEFAULT_WALL_BOARD_THEME.background.type;

  const accentRaw = obj['accent'];
  const accent =
    typeof accentRaw === 'string' && ACCENT_HEX_REGEX.test(accentRaw)
      ? accentRaw
      : undefined;

  if (accent !== undefined) {
    return { colorScheme, background: { type, presetId }, accent };
  }
  return { colorScheme, background: { type, presetId } };
}

/**
 * 화이트리스트 검증 헬퍼 (단순 boolean — Zod 통합 전 light validation).
 */
export function isWallBoardBackgroundPresetId(
  value: unknown,
): value is WallBoardBackgroundPresetId {
  return typeof value === 'string' && WALL_BOARD_BACKGROUND_PRESET_ID_SET.has(value);
}

/**
 * 두 theme이 의미상 동일한지 비교 (broadcast 디바운스 / no-op 감지용).
 */
export function isSameWallBoardTheme(a: WallBoardTheme, b: WallBoardTheme): boolean {
  if (a.colorScheme !== b.colorScheme) return false;
  if (a.background.type !== b.background.type) return false;
  if (a.background.presetId !== b.background.presetId) return false;
  if ((a.accent ?? null) !== (b.accent ?? null)) return false;
  return true;
}
