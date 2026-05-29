/**
 * v2.0 (β-Step2) — 실시간 담벼락 보드 v1.15.x → v2.0 마이그레이션 normalizer.
 *
 * Plan §4 β-Step2 / Parent v3 Step 2 / Delta v3.1 §2 Step 2.
 *
 * 책임:
 *   - `posts[].tabId` 미존재 → `DEFAULT_TAB_ID` 백필
 *   - `tabs` 미존재/빈 배열 → default 탭 1개 주입 (`{ id: DEFAULT_TAB_ID, title, permission, order: 0 }`)
 *   - `schemaVersion` → '2.0' 설정 (Repository load 시 idempotent 보장)
 *
 * 무손실 정책:
 *   - 기존 카드/좋아요/댓글/하트/색상/PDF/이미지 100% 보존
 *   - PIN 옵션→필수 강제는 **신규 v2.0 보드만** (legacy v1.x 보드는 미변경 — release-checklist E-2)
 *
 * Clean Architecture 4-layer:
 *   - 도메인 레이어 — 외부 의존성 0 (UI 문자열 import 안함)
 *   - default tab title 은 caller(adapter) 가 옵션으로 전달
 *     → 미지정 시 `DEFAULT_TAB_ID` 자체를 fallback ('default')
 *     → 어댑터 layer 가 `DEFAULT_TAB_TITLE = '전체'` 를 명시적으로 전달
 *
 * Idempotent — 두 번 호출해도 동일 결과 (회귀 보호).
 */

import type { RealtimeWallBoard, RealtimeWallPost, WallBoard } from '@domain/entities/RealtimeWall';
import { DEFAULT_TAB_ID, type RealtimeWallTabConfig } from '@domain/entities/RealtimeWallTabConfig';

/**
 * v2.0 normalizer 옵션.
 */
export interface RealtimeWallV2NormalizeOptions {
  /**
   * 새로 주입되는 default 탭의 title.
   *
   * 미지정 시 `DEFAULT_TAB_ID`(='default') 를 그대로 사용 (도메인-안전 fallback).
   * 어댑터 레이어가 `DEFAULT_TAB_TITLE`(='전체') 를 명시적으로 전달해야 사용자 라벨이 적용된다.
   */
  readonly defaultTabTitle?: string;
}

/**
 * v2.0 default 탭 메타데이터 생성.
 *
 * - id: `DEFAULT_TAB_ID` 고정
 * - permission: 'all' (학생 카드 읽기·쓰기 허용)
 * - order: 0 (첫 번째 탭)
 */
function makeDefaultTab(title: string): RealtimeWallTabConfig {
  return {
    id: DEFAULT_TAB_ID,
    title,
    permission: 'all',
    order: 0,
  };
}

/**
 * 단일 post 에 `tabId` 를 백필 (idempotent).
 *
 * - 기존 `tabId` 가 있으면 그대로 반환 (idempotent)
 * - 없으면 `DEFAULT_TAB_ID` 주입
 */
export function normalizePostForRealtimeWallV2(post: RealtimeWallPost): RealtimeWallPost {
  if (post.tabId !== undefined) return post;
  return { ...post, tabId: DEFAULT_TAB_ID };
}

/**
 * `RealtimeWallBoard` 또는 `WallBoard` 에 v2.0 탭 도메인 마이그레이션 적용.
 *
 * - posts: 각 카드에 `tabId` 백필
 * - tabs: 미존재/빈 배열 시 default 탭 1개 주입; 이미 존재하면 그대로 보존
 *
 * 제네릭 T 는 `RealtimeWallBoard`(라이브) / `WallBoard`(영속) 모두 수용.
 * `schemaVersion: '2.0'` 부여는 `normalizeWallBoardForV2`(영속 전용) 에서만 수행.
 */
export function normalizeBoardForRealtimeWallV2<
  T extends {
    readonly posts: readonly RealtimeWallPost[];
    readonly tabs?: readonly RealtimeWallTabConfig[];
  },
>(board: T, options: RealtimeWallV2NormalizeOptions = {}): T {
  const defaultTitle = options.defaultTabTitle ?? DEFAULT_TAB_ID;

  // 1. posts: tabId 백필
  const normalizedPosts = board.posts.map(normalizePostForRealtimeWallV2);

  // 2. tabs: 미존재 또는 빈 배열 → default 탭 주입
  const existingTabs = board.tabs;
  const normalizedTabs: readonly RealtimeWallTabConfig[] =
    existingTabs === undefined || existingTabs.length === 0
      ? [makeDefaultTab(defaultTitle)]
      : existingTabs;

  return {
    ...board,
    posts: normalizedPosts,
    tabs: normalizedTabs,
  };
}

/**
 * 영속 보드(`WallBoard`) v1.15.x → v2.0 마이그레이션 (idempotent).
 *
 * `normalizeBoardForRealtimeWallV2` 의 모든 동작 + `schemaVersion: '2.0'` 부여.
 *
 * Repository(`JsonWallBoardRepository.load`) 에서 `schemaVersion !== '2.0'` 인 보드 발견 시
 * 자동 호출 후 즉시 저장 (β-Step4 wiring).
 *
 * 무손실:
 *   - 기존 모든 필드 그대로 (createdAt/updatedAt/shortCode/settings/columns 등)
 *   - 두 번 호출해도 동일 결과 (회귀 보호)
 */
export function normalizeWallBoardForV2(
  board: WallBoard,
  options: RealtimeWallV2NormalizeOptions = {},
): WallBoard {
  const base = normalizeBoardForRealtimeWallV2(board, options);
  if (base.schemaVersion === '2.0') return base;
  // β-Step11 (Plan §2.2 Step 11 / G012-C):
  //   신규 v2.0 보드(schemaVersion 부재) 에만 `requirePin: true` 강제 (release-checklist E-2).
  //   legacy v1.x 보드 = 이미 schemaVersion !== '2.0' 인 보드 중에서도 settings.requirePin 이
  //   명시적으로 정의돼 있으면 그 값을 존중 (사용자가 끄려고 의도한 false 도 보존).
  //   settings 자체가 부재인 경우만 requirePin=true 주입 (Padlet 동일뷰 정합).
  const nextSettings =
    base.settings === undefined
      ? { version: 1 as const, moderation: 'off' as const, requirePin: true }
      : base.settings.requirePin === undefined
        ? { ...base.settings, requirePin: true }
        : base.settings;
  return {
    ...base,
    settings: nextSettings,
    schemaVersion: '2.0',
  };
}

/**
 * 라이브 보드(`RealtimeWallBoard`) v2.0 정규화 (idempotent).
 *
 * WebSocket broadcast(`buildWallStateForStudents`) 가 호출 전 정규화 보장.
 * `schemaVersion` 은 부여하지 않음 (라이브 entity 에 해당 필드 없음).
 */
export function normalizeRealtimeWallBoardForV2(
  board: RealtimeWallBoard,
  options: RealtimeWallV2NormalizeOptions = {},
): RealtimeWallBoard {
  return normalizeBoardForRealtimeWallV2(board, options);
}
