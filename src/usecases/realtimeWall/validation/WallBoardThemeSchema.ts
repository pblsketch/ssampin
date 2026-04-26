/**
 * v1.16.x 신규 (Phase 1, Design §3.5) — `WallBoardTheme` Zod 검증 스키마.
 *
 * 책임:
 *   - 외부 페이로드(IPC / WebSocket / 직렬화 복원) 화이트리스트 검증.
 *   - presetId enum 12종만 허용 — 임의 문자열 거부 (CSS injection 차단).
 *   - accent는 hex 6자리 정규식만 — `url()` / `expression()` / `javascript:` / `var(--evil)` 모두 차단.
 *   - 검증 실패 시 도메인 default fallback 헬퍼(`parseWallBoardThemeOrDefault`) 제공.
 *
 * 회귀 위험 mitigation (Design §6.1):
 *   - #10 (accent CSS injection): hex 정규식 단일 통과 게이트.
 *   - #8 (학생 SPA 첫 페인트 빈 화면): 검증 실패도 항상 default fallback 반환 — UI는 절대 깨지지 않음.
 *
 * 사용 위치:
 *   - `usecases/realtimeWall/BroadcastWallState.ts` (학생 broadcast 페이로드 정규화)
 *   - `electron/ipc/realtimeWall.ts` (IPC `update-board-settings` 메시지 검증)
 */

import { z } from 'zod';
import {
  DEFAULT_WALL_BOARD_THEME,
  WALL_BOARD_BACKGROUND_PRESET_IDS,
  type WallBoardBackgroundPresetId,
  type WallBoardTheme,
} from '@domain/entities/RealtimeWallBoardTheme';

/**
 * presetId enum — 12종 화이트리스트.
 * z.enum은 readonly tuple을 받지 못하므로 runtime spread.
 */
const PresetIdSchema = z.enum(
  WALL_BOARD_BACKGROUND_PRESET_IDS as unknown as readonly [string, ...string[]],
);

const ColorSchemeSchema = z.enum(['light', 'dark']);
const BackgroundTypeSchema = z.enum(['solid', 'gradient', 'pattern']);

/**
 * accent override — hex 6자리만 (CSS injection 차단).
 * `url(...)`, `expression(...)`, `javascript:`, `var(...)` 모두 차단됨.
 */
const AccentHexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/**
 * `WallBoardTheme` Zod 스키마.
 *
 * 검증 항목:
 *   - colorScheme: 'light' | 'dark'
 *   - background.type: 'solid' | 'gradient' | 'pattern'
 *   - background.presetId: 화이트리스트 12종 enum
 *   - accent (옵션): hex 6자리만
 */
export const WallBoardThemeSchema = z.object({
  colorScheme: ColorSchemeSchema,
  background: z.object({
    type: BackgroundTypeSchema,
    presetId: PresetIdSchema,
  }),
  accent: AccentHexSchema.optional(),
});

/**
 * `RealtimeWallBoardSettings` 확장 스키마 — Phase 1에서 theme optional 추가.
 * 기존 boardSettings 검증과 통합 시 사용 (electron/ipc/realtimeWall.ts).
 */
export const RealtimeWallBoardSettingsSchema = z.object({
  version: z.literal(1),
  moderation: z.enum(['off', 'manual']),
  theme: WallBoardThemeSchema.optional(),
});

/**
 * 안전 파서 — 검증 실패 시 `DEFAULT_WALL_BOARD_THEME` fallback 반환.
 *
 * 사용 의도:
 *   - 외부 페이로드(IPC/WebSocket) 검증 후 broadcast/UI에 전달할 때 절대 throw 하지 않음.
 *   - "보드 화면이 깨지느니 default라도 표시" — 회귀 #8 정신.
 *
 * 정상 페이로드는 검증 통과한 그대로 반환. 잘못된 필드만 default로 fallback하지 않고
 * 객체 전체를 default로 교체 (부분 fallback은 예측 불가능한 시각 결과 우려).
 */
export function parseWallBoardThemeOrDefault(input: unknown): WallBoardTheme {
  const result = WallBoardThemeSchema.safeParse(input);
  if (result.success) {
    // Zod의 z.enum은 readonly tuple cast 때문에 result.data.background.presetId가 string으로 추론됨.
    // 화이트리스트 통과는 보장됐으므로 안전 cast (회귀 #10 mitigation 유지).
    const data = result.data;
    const presetId = data.background.presetId as WallBoardBackgroundPresetId;
    if (data.accent === undefined) {
      return {
        colorScheme: data.colorScheme,
        background: { type: data.background.type, presetId },
      };
    }
    return {
      colorScheme: data.colorScheme,
      background: { type: data.background.type, presetId },
      accent: data.accent,
    };
  }
  return DEFAULT_WALL_BOARD_THEME;
}

/**
 * Zod safeParse 래퍼 — `success` boolean으로 검증만 필요할 때.
 * 실제 데이터 사용 시는 `parseWallBoardThemeOrDefault`.
 */
export function isValidWallBoardTheme(input: unknown): boolean {
  return WallBoardThemeSchema.safeParse(input).success;
}
