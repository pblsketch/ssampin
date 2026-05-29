import type {
  RealtimeWallColumn,
  RealtimeWallComment,
  RealtimeWallLayoutMode,
  RealtimeWallPost,
} from '@domain/entities/RealtimeWall';
import type { RealtimeWallBoardSettings } from '@domain/entities/RealtimeWallBoardSettings';
import type { RealtimeWallTabConfig } from '@domain/entities/RealtimeWallTabConfig';
import {
  DEFAULT_WALL_BOARD_THEME,
  type WallBoardTheme,
} from '@domain/entities/RealtimeWallBoardTheme';
import { parseWallBoardThemeOrDefault } from './validation/WallBoardThemeSchema';

/**
 * 학생용 보드 스냅샷.
 * - hidden post 제외 (status === 'approved'만 / v2.1: 'hidden-by-author'는 placeholder로 포함)
 * - approvalMode/createdAt/updatedAt 등 교사 전용 메타 제외
 * - teacherHearts는 §12 Q1 확정대로 그대로 포함 (학생에게 read-only 노출)
 *
 * v2.1 신규 (Design v2.1 §4.3):
 * - settings: boardSettings 포함 (학생도 moderation 모드 인지)
 *
 * v1.16.x (Phase 1, Design §4.1):
 * - settings는 항상 정의 — `buildWallStateForStudents`가 default 자동 주입.
 *   학생 SPA가 `settings.theme` 분기 시 undefined 분기 불필요 (회귀 #8 mitigation).
 *
 * Design §4.3 WallBoardSnapshot 정의.
 */
export interface WallBoardSnapshotForStudent {
  readonly title: string;
  readonly layoutMode: RealtimeWallLayoutMode;
  readonly columns: readonly RealtimeWallColumn[];
  readonly posts: readonly RealtimeWallPost[];
  /** P3 학생 카드 추가 잠금 상태. P1 시점은 항상 false. */
  readonly studentFormLocked: boolean;
  /**
   * v2.1 신규 (Design v2.1 §4.3 Phase A) — 보드 설정 (moderation 모드 등).
   * v1.16.x 부터 항상 정의 — `buildWallStateForStudents`가 default 주입 보장.
   * `settings.theme`도 항상 정의 (DEFAULT_WALL_BOARD_THEME fallback).
   */
  readonly settings: RealtimeWallBoardSettings;
  /**
   * v2.0 (β-Step8) — 보드 내 탭 메타.
   *
   * - `permission='teacher-only'` 탭은 `buildWallStateForStudents`가 제외
   *   (학생 SPA 가 모르게 한다 — 회귀 #1 status filter 와 동일한 layered filter 원칙)
   * - `order` 오름차순으로 정렬됨 (학생 SPA 가 `parseTabAwareWallState` 로 추가 가공)
   * - 미존재 = legacy v1.15.x 보드 (스냅샷 생성기가 `DEFAULT_TAB_ID` 단일 탭 합성)
   *
   * Plan §2.2 Step 8: "학생 SPA: 탭 인지 + 인라인 컴포저 마운트 + tab strip".
   */
  readonly tabs?: readonly RealtimeWallTabConfig[];
}

/**
 * Main → 학생 클라이언트 broadcast 메시지 union.
 * Design §4.3 서버→클라이언트 메시지.
 *
 * - P1 6종: wall-state / post-added / post-updated / post-removed / closed / error
 * - P2 3종: like-toggled / comment-added / comment-removed
 * - P3 1종: student-form-locked (학생 카드 추가 잠금 브로드캐스트)
 * - v2.1 Phase A 1종: boardSettings-changed (boardSettings 토글 broadcast)
 * - v2.1 Phase D 1종: nickname-changed (교사 닉네임 변경 broadcast)
 *
 * 총 12종 (v2.1 누적).
 */
export type BroadcastableServerMessage =
  | { readonly type: 'wall-state'; readonly board: WallBoardSnapshotForStudent }
  | { readonly type: 'post-added'; readonly post: RealtimeWallPost }
  | {
      readonly type: 'post-updated';
      readonly postId: string;
      readonly patch: Partial<RealtimeWallPost>;
    }
  | { readonly type: 'post-removed'; readonly postId: string }
  | { readonly type: 'closed' }
  | { readonly type: 'error'; readonly message: string }
  // ============ v1.14 Phase P2 (padlet mode) ============
  | {
      readonly type: 'like-toggled';
      readonly postId: string;
      readonly likes: number;
      readonly likedBy: readonly string[];
    }
  | {
      readonly type: 'comment-added';
      readonly postId: string;
      readonly comment: RealtimeWallComment;
    }
  | {
      readonly type: 'comment-removed';
      readonly postId: string;
      readonly commentId: string;
    }
  // ============ v1.14 Phase P3 (padlet mode — student card add) ============
  | {
      readonly type: 'student-form-locked';
      readonly locked: boolean;
    }
  // ============ v1.15.x Phase B 도메인 선언 (Phase A에서 활용) ============
  | {
      readonly type: 'boardSettings-changed';
      readonly settings: RealtimeWallBoardSettings;
    }
  // ============ v1.15.x Phase B 도메인 선언 (Phase D에서 활용) ============
  | {
      readonly type: 'nickname-changed';
      readonly postIds: readonly string[];
      readonly newNickname: string;
    }
  // ============ v2.0 신규 5종 (β-Step12 / G012-D) — 탭 CRUD broadcast ============
  //
  // SERVER_TRUSTED_BROADCAST 정합:
  //   - 본 union 의 각 메시지는 서버(electron/ipc/realtimeWall.ts) 가 권위 있게 broadcast.
  //   - 학생 SPA 는 수신 검증으로 `RealtimeWallServerMessageSchema` (shared/wsProtocol) 통과한
  //     payload 만 store 에 반영 — 위조된 broadcast 차단.
  //   - 추가 메시지를 도입할 때 본 union + Zod schema 둘 다 갱신 필수 (회귀 #2).
  | {
      readonly type: 'tab-added';
      readonly tab: RealtimeWallTabConfig;
    }
  | {
      readonly type: 'tab-deleted';
      readonly tabId: string;
      /** 삭제된 탭에서 default 로 이동된 카드 id 목록 (학생 측 즉시 UI 갱신용) */
      readonly orphanedPostIds: readonly string[];
    }
  | {
      readonly type: 'tab-renamed';
      readonly tabId: string;
      readonly newTitle: string;
    }
  | {
      readonly type: 'tab-permission-changed';
      readonly tabId: string;
      readonly permission: RealtimeWallTabConfig['permission'];
    }
  | {
      readonly type: 'post-tab-moved';
      readonly postId: string;
      readonly newTabId: string;
    };

export interface BuildWallStateForStudentsArgs {
  readonly title: string;
  readonly layoutMode: RealtimeWallLayoutMode;
  readonly columns: readonly RealtimeWallColumn[];
  readonly posts: readonly RealtimeWallPost[];
  /** P3 잠금 상태. 미전달 시 false. */
  readonly studentFormLocked?: boolean;
  /**
   * v2.1 — 보드 설정 (Design v2.1 §4.3 Phase A 토대).
   * 미전달 시 학생 측 default 적용.
   */
  readonly settings?: RealtimeWallBoardSettings;
  /**
   * v2.0 (β-Step8) — 보드 탭 메타 (BoardNormalizer 통과 후 형태).
   *
   * - 미전달/빈 배열 = legacy v1.15.x 보드 → 학생 SPA 에서 `parseTabAwareWallState`
   *   가 `DEFAULT_TAB_ID` 단일 탭 합성 (서버 측 broadcast 도 동일 fallback 가능)
   * - `permission='teacher-only'` 탭은 본 함수가 제외
   * - posts 의 `tabId` 가 제외된 탭을 참조해도 학생 측은 본문에 표시 안 함
   *   (teacher-only 탭 카드는 학생에게 숨김 — 회귀 #1 status filter 와 같은 결의 보호)
   */
  readonly tabs?: readonly RealtimeWallTabConfig[];
}

/**
 * 학생 broadcast용 보드 스냅샷 빌더.
 *
 * 책임:
 * - hidden / pending 카드 제외 (학생은 'approved' / 'hidden-by-author' 만)
 *   - 'hidden-by-author' (v2.1 신규)는 placeholder로 표시되므로 포함
 *     (단 Phase B에서는 status='hidden-by-author'를 broadcast하지 않음 — Phase D에서 본격 활용)
 * - approvalMode / createdAt 등 교사 전용 메타 절단
 * - 그 외 카드 데이터는 그대로 통과 (Padlet 동일 뷰 원칙 — Design §0.1)
 *
 * 회귀 위험 #1: `posts.filter(p => p.status === 'approved')` 패턴 보존 (Design v2.1 §10.6).
 *
 * v1.16.x (Phase 1, Design §4.1):
 * - settings.theme: undefined 또는 잘못된 페이로드면 `DEFAULT_WALL_BOARD_THEME` 주입.
 *   Zod 검증(`parseWallBoardThemeOrDefault`) 통과한 값만 broadcast — CSS injection 차단(#10).
 * - settings 자체가 undefined면 `{ version: 1, moderation: 'off', theme: DEFAULT }` 주입.
 *
 * 순수 함수 — 외부 의존 없음 (Zod 스키마 import는 같은 usecases 레이어). 테스트 가능.
 */
export function buildWallStateForStudents(
  args: BuildWallStateForStudentsArgs,
): WallBoardSnapshotForStudent {
  const sanitizedSettings = sanitizeBoardSettingsForStudents(args.settings);
  // β-Step8: teacher-only 탭 필터링 + 정렬 보존. tabs 미지정/빈 = 학생 SPA 가
  // parseTabAwareWallState 에서 단일 default 탭으로 합성하므로 그대로 통과.
  const visibleTabs =
    args.tabs && args.tabs.length > 0
      ? [...args.tabs]
          .filter((tab) => tab.permission !== 'teacher-only')
          .sort((a, b) => a.order - b.order)
      : undefined;
  // teacher-only 탭의 카드는 학생에게 숨김 (회귀 #1 status filter 와 동일 결).
  // visibleTabs 미정의 → 모든 카드 통과 (legacy v1.15.x 보드).
  const hiddenTabIds =
    visibleTabs !== undefined
      ? new Set(
          (args.tabs ?? []).filter((tab) => tab.permission === 'teacher-only').map((tab) => tab.id),
        )
      : null;
  return {
    title: args.title,
    layoutMode: args.layoutMode,
    columns: args.columns,
    posts: args.posts.filter((post) => {
      if (post.status !== 'approved') return false;
      if (hiddenTabIds && post.tabId !== undefined && hiddenTabIds.has(post.tabId)) {
        return false;
      }
      return true;
    }),
    studentFormLocked: args.studentFormLocked ?? false,
    settings: sanitizedSettings,
    ...(visibleTabs !== undefined ? { tabs: visibleTabs } : {}),
  };
}

/**
 * 학생 broadcast용 settings 정규화.
 *
 * 동작:
 *   - settings 자체가 undefined → `{ version: 1, moderation: 'off', theme: DEFAULT_WALL_BOARD_THEME }` 주입.
 *   - settings.theme이 undefined → DEFAULT 주입.
 *   - settings.theme이 정의 → Zod 검증 통과한 값만 보존, 실패 시 DEFAULT fallback.
 *
 * 회귀 위험:
 *   - #8 (학생 SPA 첫 페인트): theme이 항상 정의되도록 보장 — `useStudentBoardTheme`가 undefined 분기 타지 않도록.
 *   - #10 (CSS injection): Zod 화이트리스트 단일 게이트.
 */
export function sanitizeBoardSettingsForStudents(
  settings: RealtimeWallBoardSettings | undefined,
): RealtimeWallBoardSettings {
  if (!settings) {
    return {
      version: 1,
      moderation: 'off',
      theme: DEFAULT_WALL_BOARD_THEME,
    };
  }
  const theme: WallBoardTheme =
    settings.theme === undefined
      ? DEFAULT_WALL_BOARD_THEME
      : parseWallBoardThemeOrDefault(settings.theme);
  return {
    ...settings,
    theme,
  };
}
