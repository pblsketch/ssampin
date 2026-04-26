import type React from 'react';
import type {
  RealtimeWallFreeformPosition,
  RealtimeWallKanbanPosition,
  RealtimeWallPost,
  StudentCommentInput,
} from '@domain/entities/RealtimeWall';

/**
 * 카드/보드 컴포넌트 뷰어 역할.
 * - `teacher`: 풀 권한 (승인·고정·숨김·하트·드래그)
 * - `student`: 읽기 전용. P2부터 학생 좋아요/댓글 콜백 활용.
 *
 * 기본값은 'teacher'로 두어 v1.13 호출자(viewerRole 미전달) 동작 무회귀.
 */
export type RealtimeWallViewerRole = 'teacher' | 'student';

/**
 * Kanban·Freeform·Grid·Stream 4개 Board가 공유하는 공통 props.
 * 새 상호작용(댓글·공유 등) 추가 시 이 interface 한 곳만 수정하면
 * 4곳에 자동 전파된다.
 *
 * 특화 props:
 *   - Kanban: + columns, onChangePosts
 *   - Freeform: + onChangePosts (drag/resize로 freeform meta 갱신)
 *   - Grid/Stream: 이 공통 props 만
 *
 * v1.14 P1:
 *   - viewerRole='student'면 readOnly가 강제로 true가 된다 (학생 뷰 안전망).
 *   - currentSessionToken은 P2 학생 좋아요 like/unlike 판정용. P1에선 미사용.
 */
export interface RealtimeWallBoardCommonProps {
  readonly posts: readonly RealtimeWallPost[];
  readonly readOnly?: boolean;
  readonly onTogglePin?: (postId: string) => void;
  readonly onHidePost?: (postId: string) => void;
  readonly onOpenLink?: (url: string) => void;
  readonly onHeart?: (postId: string) => void;
  /** 'student' 시 readOnly가 강제로 true가 됨. P2에서 학생 좋아요/댓글 콜백 활용. */
  readonly viewerRole?: RealtimeWallViewerRole;
  /** P2 학생 좋아요 like/unlike 판정용 (P1에선 미사용). */
  readonly currentSessionToken?: string;
  /**
   * v2.1 Phase D — 학생 PIN hash (PIN 설정 학생만, undefined = 익명 모드).
   * isOwnCard 양방향 매칭 둘째 항.
   */
  readonly currentPinHash?: string;
  /**
   * v1.14 P2 — 학생 좋아요 토글 콜백 (viewerRole='student' 전용).
   * Board → Card 전파 사슬: StudentBoardView → Board → RealtimeWallCard.
   * 교사 화면에서는 미전달 (Card에서 viewerRole 체크로 이중 방어).
   */
  readonly onStudentLike?: (postId: string) => void;
  /**
   * v1.14 P2 — 교사 댓글 삭제 콜백 (viewerRole='teacher' 전용).
   * Board → Card 전파 사슬: ToolRealtimeWall → Board → RealtimeWallCard.
   * readOnly 또는 viewerRole='student'일 때는 미전달.
   */
  readonly onRemoveComment?: (postId: string, commentId: string) => void;
  /**
   * v2.1 Phase B — 학생 댓글 입력 슬롯 렌더 팩토리.
   * Board → Card 전파 사슬: StudentBoardView → Board → RealtimeWallCard(commentInputSlot).
   * 미전달 시(교사 측) 기존 RealtimeWallCommentInput 폴백 (무회귀).
   */
  readonly renderCommentInput?: (postId: string) => React.ReactNode;
  /**
   * v2.1 Phase D — 학생 자기 카드 수정 메뉴 클릭 시 호출.
   * 부모(StudentBoardView)가 StudentSubmitForm을 mode='edit'로 열어줌.
   */
  readonly onOwnCardEdit?: (postId: string) => void;
  /**
   * v2.1 Phase D — 학생 자기 카드 삭제 확인 후 호출.
   * 부모가 useRealtimeWallSyncStore.submitOwnCardDelete 호출.
   * 회귀 위험 #8: hard delete 절대 X — soft delete (status='hidden-by-author' 갱신만)
   */
  readonly onOwnCardDelete?: (postId: string) => void;
  /**
   * v2.1 Phase D — 교사가 placeholder 카드 "복원" 클릭 시 호출.
   */
  readonly onRestoreCard?: (postId: string) => void;
  /**
   * v2.1 Phase D — 교사가 카드 우클릭 → 작성자 추적 메뉴 트리거 시 호출.
   * 부모는 sessionToken/pinHash 기준 같은 작성자 카드 강조.
   */
  readonly onTeacherTrackAuthor?: (postId: string) => void;
  /**
   * v2.1 Phase D — 교사가 닉네임 변경 메뉴 트리거 시 호출.
   * 부모는 prompt 또는 모달로 newNickname 입력 → submitNicknameUpdate 호출.
   */
  readonly onTeacherUpdateNickname?: (postId: string) => void;
  /**
   * v2.1 Phase D — 교사가 "이 학생 카드 모두 숨김" 트리거 시 호출.
   * 부모는 카드의 ownerSessionToken/studentPinHash 기준 일괄 hidden.
   */
  readonly onTeacherBulkHideStudent?: (postId: string) => void;
  /**
   * v2.1 Phase D — 교사 작성자 추적 결과: 강조해야 할 postId 집합.
   * 부모(ToolRealtimeWall)가 trackedAuthorCriteria 따라 계산해 전달.
   * 카드 컴포넌트는 이 set에 자기 id가 있으면 sky ring 강조.
   */
  readonly highlightedPostIds?: ReadonlySet<string>;
  /**
   * v2.1 Phase C — 학생 자기 카드 위치 변경 콜백 (Design v2.1 §5.2 / Plan FR-C5).
   *
   * - Freeform: 드래그/리사이즈 종료 시 호출 (freeform: { x, y, w, h, zIndex? })
   * - Kanban: 자기 카드 컬럼 이동 시 호출 (kanban: { columnId, order })
   * - viewerRole='student' && isOwnCard 매칭 시에만 활성
   * - 호출자 책임: useRealtimeWallSyncStore.submitOwnCardMove → WebSocket send
   * - 회귀 위험 #8 무관 — patch만 (hard delete X)
   */
  readonly onOwnCardMove?: (
    postId: string,
    position: {
      freeform?: RealtimeWallFreeformPosition;
      kanban?: RealtimeWallKanbanPosition;
    },
  ) => void;
  /**
   * v2.1 Phase C-C1 — 모바일 viewport 강제 readOnly (Design v2.1 §5.3 / Plan FR-C1).
   *
   * true이면 Freeform/Kanban 학생 자기 카드도 readOnly (드래그 차단).
   * useIsMobile 훅으로 부모(StudentBoardView)가 결정.
   * 페2 high-2 — 작은 화면에서 위치 조정 실수 방지.
   */
  readonly isMobile?: boolean;
  /**
   * v2.1 Phase C-C5 — Freeform 자기 카드 잠금 토글 상태 (Plan FR-C8 / Design v2.1 §5.1).
   *
   * - Freeform 학생 자기 카드는 기본 locked
   * - true이면 react-rnd 활성 (드래그 가능)
   * - false이면 절대위치 div만 (드래그 차단 — 페1 critical 실수 방지)
   * - 교사 화면에서는 무시 (교사는 항상 unlock)
   * - Kanban/Grid/Stream에서는 무시 (Freeform 전용)
   */
  readonly freeformLockEnabled?: boolean;
  /**
   * v2.1 student-ux — Kanban 컬럼별 "+" 카드 추가 버튼 콜백 (Padlet 패턴).
   *
   * - viewerRole='student' && Kanban 레이아웃에서만 컬럼 헤더에 "+" 버튼 노출
   * - 클릭 시 부모(StudentBoardView)가 columnId를 기억하고 카드 추가 모달을 연다
   * - 모달 제출 시 해당 컬럼에 카드가 들어간다
   * - 교사 모드에서는 미렌더 (회귀 위험 #3 보존 — 학생 entry 한정)
   * - studentFormLocked=true 시 부모가 콜백 무시
   */
  readonly onAddCardToColumn?: (columnId: string) => void;
  /**
   * 2026-04-26 결함 fix — 카드 더블클릭 시 부모가 상세 모달을 여는 콜백.
   *
   * - 학생/교사 양쪽 동일 시그니처 (Padlet 동일뷰).
   * - RealtimeWallCard가 카드 article 위 더블클릭(인터랙티브 자식 제외)에서 호출.
   * - 미전달 시 카드 더블클릭 무동작 (기존 호출자 무회귀).
   * - 빈 영역 더블클릭(useStudentDoubleClick) 경로와 충돌 방지: 카드는 data-card-root="true" +
   *   handleCardDoubleClick에서 e.stopPropagation()으로 부모 main까지 버블 차단.
   */
  readonly onCardDetail?: (postId: string) => void;
  /**
   * Step 2 — 교사 좋아요 토글 콜백 (viewerRole='teacher' 전용).
   * Board → Card 전파: ToolRealtimeWall → Board → RealtimeWallCard.
   * 학생 화면에서는 미전달.
   */
  readonly onTeacherLike?: (postId: string) => void;
  /**
   * Step 2 — 교사 댓글 추가 콜백 (viewerRole='teacher' 전용).
   * nickname='선생님' 강제. Board → Card 전파.
   * 학생 화면에서는 미전달.
   */
  readonly onTeacherAddComment?: (
    postId: string,
    input: Omit<StudentCommentInput, 'sessionToken'>,
  ) => void;
  /**
   * Step 3 — 교사 전용 컬럼 헤더 "+" 버튼 콜백 (Kanban 전용, 교사 모드).
   * 학생의 onAddCardToColumn과 별도 경로라 회귀 위험 #3 완전 격리.
   * 미전달 시 버튼 미렌더. Freeform/Grid/Stream에서는 무시.
   */
  readonly onTeacherAddCardToColumn?: (columnId: string) => void;
  /**
   * Step 3 — 교사 Freeform 보드 빈 영역 더블클릭 콜백.
   * 더블클릭 좌표를 캡처해 부모가 카드 추가 모달을 연다.
   * Kanban/Grid/Stream에서는 무시.
   */
  readonly onTeacherFreeformAddCard?: (x: number, y: number) => void;
}
