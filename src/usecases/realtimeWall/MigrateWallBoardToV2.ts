/**
 * v2.0 (β-Step4) — 영속 보드 v1.15.x → v2.0 마이그레이션 use case.
 *
 * Plan §4 β-Step4 / Delta v3.1 §2 Step 4 / Parent v3 Step 4.
 *
 * 책임:
 *   - 보드의 `schemaVersion !== '2.0'` 감지 (migrated 플래그 반환)
 *   - `normalizeWallBoardForV2` (도메인 서비스) 호출로 정규화
 *   - idempotent — 이미 v2.0 인 보드는 그대로 통과 (migrated=false)
 *
 * Caller wiring (β-Step4 후속):
 *   - `JsonWallBoardRepository.load(id)` 에서 호출 → 결과 migrated=true 면 즉시 save
 *     (다음 load 는 no-op — schemaVersion='2.0' 매칭).
 *
 * Clean Architecture:
 *   - 도메인 서비스(`normalizeWallBoardForV2`) 위에 얹은 얇은 use case 래퍼
 *   - UI 문자열은 caller (어댑터) 가 옵션으로 전달 — 외부 의존성 0 유지.
 */

import type { WallBoard } from '@domain/entities/RealtimeWall';
import {
  normalizeWallBoardForV2,
  type RealtimeWallV2NormalizeOptions,
} from '@domain/services/RealtimeWallBoardNormalizer';

/**
 * v2.0 — 마이그레이션 결과.
 *
 * - `migrated: true` → schemaVersion 변경됨 → caller 가 save 필수
 * - `migrated: false` → 이미 v2.0 → save 불필요 (idempotent fast-path)
 */
export interface MigrateWallBoardResult {
  readonly migrated: boolean;
  readonly board: WallBoard;
}

/**
 * v1.15.x → v2.0 영속 보드 마이그레이션.
 *
 * - schemaVersion 검사 → 변경 필요 여부 보고 (migrated 플래그)
 * - normalizer 통과 후 보드 반환 (idempotent — 두 번 호출해도 동일)
 *
 * @param board 입력 보드 (v1.15.x 또는 v2.0)
 * @param options.defaultTabTitle 어댑터에서 `DEFAULT_TAB_TITLE = '전체'` 전달
 *   미지정 시 도메인-안전 fallback (`DEFAULT_TAB_ID` 자체).
 */
export function migrateWallBoardToV2(
  board: WallBoard,
  options: RealtimeWallV2NormalizeOptions = {},
): MigrateWallBoardResult {
  const needsMigration = board.schemaVersion !== '2.0';
  const normalized = normalizeWallBoardForV2(board, options);
  return {
    migrated: needsMigration,
    board: normalized,
  };
}
