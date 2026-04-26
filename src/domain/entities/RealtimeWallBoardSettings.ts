/**
 * v2.1 신규 — 보드 단위 설정 (Plan §7.2 결정 #8 / Design v2.1 §2.6).
 *
 * WallBoard 엔티티에 `settings?: RealtimeWallBoardSettings` 필드로 부착.
 * Phase B에서는 도메인 선언만 (Phase A에서 실제 UI 토글 + WebSocket broadcast 활용).
 */

/**
 * 카드 승인 모드.
 *
 * - `'off'`     : 즉시 공개 (Padlet 기본값 정합 — Plan §7.2 결정 #8). 학생 카드 = 교사 화면
 *                  즉시 표시 + broadcast 즉시 student approved
 * - `'manual'`  : 교사 승인 큐 활성. 학생 카드 = pending status로 큐 진입 → 교사가 approve/reject
 *
 * 기존 v1.14.x의 `approvalMode: 'auto' | 'on'`과 통합 매핑 (Phase A에서 마이그레이션):
 * - moderation='off'    ↔ approvalMode='auto'
 * - moderation='manual' ↔ approvalMode='manual' (또는 'on')
 *
 * 기본값 (Plan §7.2 결정 #8): 'off'
 */
export type RealtimeWallModerationMode = 'off' | 'manual';

export interface RealtimeWallBoardSettings {
  readonly version: 1;
  readonly moderation: RealtimeWallModerationMode;
}

export const REALTIME_WALL_BOARD_SETTINGS_VERSION = 1 as const;

/**
 * 기본 보드 설정 — `normalizeBoardForPadletModeV2`가 v1.14.x 보드에 자동 주입.
 */
export const DEFAULT_REALTIME_WALL_BOARD_SETTINGS: RealtimeWallBoardSettings = {
  version: 1,
  moderation: 'off',
};
