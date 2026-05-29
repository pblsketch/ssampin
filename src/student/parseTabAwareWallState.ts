/**
 * parseTabAwareWallState — β-Step8 (v2.0 student SPA tab-aware filter)
 *
 * Plan §2.2 Step 8: "학생 SPA: 탭 인지 + 인라인 컴포저 마운트 + tab strip:
 * `posts.tabId` 메모이즈드 필터, parseTabAwareWallState.ts 사용.
 * boardSettings.studentInlineComposerEnabled & tab.permission='write' 조건".
 *
 * 책임:
 *   - WallBoardSnapshotForStudent + activeTabId → derive 가공된 보드 뷰
 *   - 탭 부재 (legacy v1.15.x 보드) 시 `DEFAULT_TAB_ID` 단일 탭 합성
 *   - active 탭 미선택/유효하지 않음 → 첫 visible 탭으로 정정
 *   - posts 메모이즈드 필터링 (activeTab 의 카드만)
 *   - canCompose 계산: settings.studentInlineComposerEnabled & active tab.permission='all'
 *
 * 출력은 student SPA 가 한 번에 unpack 해 TabBar/Board/InlineComposer 를 분기 렌더.
 *
 * 도메인+usecase 의존만 사용 (어댑터/인프라 import 금지). React 비의존 — 순수 함수로
 * 호출자 컴포넌트의 useMemo 안에서 호출 가능.
 *
 * 회귀 보호:
 *   - #1 status filter — 본 함수는 status 무관, BroadcastWallState 에서 이미 필터링됨
 *   - #11 viewerRole 비대칭 — 본 함수는 학생 SPA 전용 (교사 측 G013 별도 경로)
 *   - "schemaVersion 누락 v1.15.x 보드" 무손실 — tabs 미지정 시 default 단일 탭 합성
 */
import type { WallBoardSnapshotForStudent } from '@usecases/realtimeWall/BroadcastWallState';
import type { RealtimeWallPost } from '@domain/entities/RealtimeWall';
import type { RealtimeWallBoardSettings } from '@domain/entities/RealtimeWallBoardSettings';
import { DEFAULT_TAB_ID, type RealtimeWallTabConfig } from '@domain/entities/RealtimeWallTabConfig';

/**
 * v2.0 student SPA 가 사용하는 정규화 뷰.
 *
 * `board.tabs` 가 undefined 인 legacy 보드는 본 함수가 `defaultTabTitle` 로 단일 탭을
 * 합성한다 (Adapter 레이어가 '전체' 한국어 라벨 주입 — 도메인 의존성 0 유지).
 */
export interface TabAwareWallState {
  /** 학생에게 노출되는 탭 (teacher-only 는 이미 BroadcastWallState 에서 제외됨). order asc */
  readonly visibleTabs: readonly RealtimeWallTabConfig[];
  /** 정정된 활성 탭 ID (입력 activeTabId 가 유효하지 않으면 첫 visible 탭으로 fallback) */
  readonly activeTabId: string;
  /** 정정된 활성 탭의 메타 (visibleTabs.find(t => t.id === activeTabId)) */
  readonly activeTab: RealtimeWallTabConfig;
  /** activeTab 의 카드 (post.tabId === activeTabId). legacy 보드는 모든 카드 통과. */
  readonly postsForActiveTab: readonly RealtimeWallPost[];
  /**
   * 인라인 컴포저 마운트 조건 (Plan §2.2 Step 8):
   *   - boardSettings.studentInlineComposerEnabled 가 false 가 아니어야 함
   *     (undefined = 기본 활성 — G012/β-Step11 에서 settings 에 필드 추가될 때까지 default true)
   *   - activeTab.permission === 'all' (학생이 쓸 수 있는 권한 — 'teacher-only' 는 이미 제외됨,
   *     'role-gated' 는 v2.1+ 미구현이라 본 단계에서 비활성)
   *   - studentFormLocked === false (교사의 일시 잠금 신호 존중 — 회귀 #1 결의 보호)
   */
  readonly canCompose: boolean;
}

export interface ParseTabAwareWallStateOptions {
  /**
   * 사용자 (StudentBoardView) 가 보유한 현재 활성 탭 ID. 미지정/유효하지 않음 →
   * 첫 visible 탭으로 fallback.
   */
  readonly activeTabId?: string;
  /**
   * legacy 보드(tabs 미정의) 에서 합성할 단일 탭의 한국어 라벨.
   * 어댑터 레이어(`realtimeWallConstants.DEFAULT_TAB_TITLE = '전체'`) 가 주입.
   * 미전달 시 도메인 식별자 'default' 가 라벨로 fallback.
   */
  readonly defaultTabTitle?: string;
}

/**
 * v2.0 student SPA 의 tab-aware 가공 함수.
 *
 * @param board - WebSocket sync store 가 보유한 학생용 스냅샷
 * @param options - activeTabId + defaultTabTitle (어댑터 라벨)
 * @returns 정규화된 탭 뷰 — TabBar/BoardRouter/InlineComposer 분기에 사용
 */
export function parseTabAwareWallState(
  board: WallBoardSnapshotForStudent,
  options: ParseTabAwareWallStateOptions = {},
): TabAwareWallState {
  const { activeTabId: requestedTabId, defaultTabTitle } = options;

  // 1. visibleTabs 결정: 보드에 tabs 가 있으면 그대로 (BroadcastWallState 가 이미
  //    teacher-only 제외 + order sort 적용). 미정의 = legacy → 단일 default 탭 합성.
  const visibleTabs: readonly RealtimeWallTabConfig[] =
    board.tabs && board.tabs.length > 0
      ? board.tabs
      : [
          {
            id: DEFAULT_TAB_ID,
            title: defaultTabTitle ?? DEFAULT_TAB_ID,
            permission: 'all',
            order: 0,
          },
        ];

  // 2. activeTabId 정정: 요청한 탭이 visibleTabs 에 없으면 첫 visible 탭으로 fallback.
  //    visibleTabs.length >= 1 보장 (위 단일-탭 합성).
  const firstTab = visibleTabs[0] as RealtimeWallTabConfig;
  const activeTab: RealtimeWallTabConfig =
    visibleTabs.find((tab) => tab.id === requestedTabId) ?? firstTab;
  const activeTabId = activeTab.id;

  // 3. posts 필터: post.tabId 가 activeTabId 와 같으면 포함.
  //    - legacy 보드(`board.tabs` 미정의) → 모든 카드를 default 탭에 노출. tabId 가
  //      'something' 처럼 임의 값이어도 orphan auto-move 정책 정합 (Plan §3 OC Q2 RESOLVED:
  //      탭 삭제 시 orphan posts 는 DEFAULT_TAB_ID 로 자동 이동 — 보드 자체에 탭이 없으면
  //      모든 카드를 orphan 으로 간주). 무손실 마이그레이션 보장.
  //    - v2.0 보드(`board.tabs` 정의) → post.tabId 일치 검사. tabId 미존재 카드는
  //      activeTabId === DEFAULT_TAB_ID 일 때만 표시 (BoardNormalizer 미통과 broadcast 방어).
  const isLegacyBoard = board.tabs === undefined || board.tabs.length === 0;
  const postsForActiveTab = board.posts.filter((post) => {
    if (isLegacyBoard) return true;
    if (post.tabId === undefined && activeTabId === DEFAULT_TAB_ID) return true;
    return post.tabId === activeTabId;
  });

  // 4. canCompose 계산.
  //    `studentInlineComposerEnabled` 는 G012/β-Step11 에서 settings 에 추가 예정.
  //    그 전까지 undefined → 기본 활성 (false 명시 시에만 비활성).
  const settingsEnabled = (
    board.settings as RealtimeWallBoardSettings & { studentInlineComposerEnabled?: boolean }
  ).studentInlineComposerEnabled;
  const composerEnabled = settingsEnabled !== false;
  const canCompose = composerEnabled && activeTab.permission === 'all' && !board.studentFormLocked;

  return {
    visibleTabs,
    activeTabId,
    activeTab,
    postsForActiveTab,
    canCompose,
  };
}
