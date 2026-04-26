import { useCallback, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { RealtimeWallKanbanBoard } from '@adapters/components/Tools/RealtimeWall/RealtimeWallKanbanBoard';
import { RealtimeWallFreeformBoard } from '@adapters/components/Tools/RealtimeWall/RealtimeWallFreeformBoard';
import { RealtimeWallGridBoard } from '@adapters/components/Tools/RealtimeWall/RealtimeWallGridBoard';
import { RealtimeWallStreamBoard } from '@adapters/components/Tools/RealtimeWall/RealtimeWallStreamBoard';
import { RealtimeWallFreeformLockToggle } from '@adapters/components/Tools/RealtimeWall/RealtimeWallFreeformLockToggle';
import { StudentDraftChip } from '@adapters/components/Tools/RealtimeWall/StudentDraftChip';
import { useRealtimeWallSyncStore } from '@adapters/stores/useRealtimeWallSyncStore';
import type { WallBoardSnapshotForStudent } from '@usecases/realtimeWall/BroadcastWallState';
import type {
  RealtimeWallFreeformPosition,
  RealtimeWallKanbanPosition,
  RealtimeWallPost,
} from '@domain/entities/RealtimeWall';
import { isOwnCard } from '@domain/rules/realtimeWallRules';
import { StudentCommentForm } from './StudentCommentForm';
import { StudentSubmitForm } from './StudentSubmitForm';
import { StudentDeleteConfirmDialog } from './StudentDeleteConfirmDialog';
import { StudentPinSetupModal } from './StudentPinSetupModal';
import { StudentNicknameChangedToast } from './StudentNicknameChangedToast';
import { useStudentDraft } from './useStudentDraft';
import { useStudentLongPress } from './useStudentLongPress';
import { useStudentDoubleClick } from './useStudentDoubleClick';
import { useStudentPin } from './useStudentPin';
import { useIsMobile } from './useIsMobile';
import { useStudentFreeformLockState } from './useStudentFreeformLockState';
import { RealtimeWallBoardThemeWrapper } from '@adapters/components/Tools/RealtimeWall/RealtimeWallBoardThemeWrapper';

const STUDENT_NICKNAME_STORAGE_KEY = 'ssampin-realtime-wall-nickname';

function readStudentNickname(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.sessionStorage.getItem(STUDENT_NICKNAME_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * 학생 보드 본체.
 *
 * Padlet 동일 뷰 원칙(Design §0.1) — 교사가 쓰는 4 보드 컴포넌트를 그대로 재사용하되
 * viewerRole='student'로 읽기 전용 강제. onTogglePin/onHidePost/onHeart/onChangePosts
 * 콜백은 **절대 전달 X** — Padlet 교사 권한 8종(Design §5.4)이 DOM 단위로 부재하게 함.
 *
 * v1.14 P3 — FAB + StudentSubmitForm 모달을 통해 학생이 직접 카드를 추가.
 * studentFormLocked=true면 FAB 비활성 + 클릭 불가.
 *
 * v2.1 (Phase A) 추가 (Plan FR-A1/A2/A3/A5 / Design v2.1 §5.1):
 *   - FAB 잠금 시 비활성 톤 + 호버 진동 애니메이션 + 한국어 tooltip 강화
 *   - 빈 영역 long-press(모바일 600ms) + 더블클릭(데스크톱) 진입 (`C` 단축키 절대 X — 회귀 위험 #6)
 *   - useStudentDraft 보드+세션 단위 localStorage 드래프트
 *   - StudentDraftChip 좌하단 작성 중 카드 칩
 */

interface StudentBoardViewProps {
  readonly board: WallBoardSnapshotForStudent;
}

export function StudentBoardView({ board }: StudentBoardViewProps) {
  const { title, layoutMode, columns, posts, studentFormLocked, settings } = board;
  // v1.16.x Phase 2 (Design §5.3) — 보드 wrapper에 적용할 theme.
  // settings.theme이 broadcast로 도착하지 않았다면 default 적용 (sanitizeBoardSettingsForStudents가 보장).
  const boardTheme = settings?.theme;
  const [submitOpen, setSubmitOpen] = useState(false);
  const [resumeRequested, setResumeRequested] = useState(false);
  // v2.1 student-ux — Padlet 컬럼별 + 버튼: 클릭 시 columnId를 기억해 모달 제출에 전달
  const [pendingColumnId, setPendingColumnId] = useState<string | null>(null);
  const submitCommentV2 = useRealtimeWallSyncStore((s) => s.submitCommentV2);
  const submitOwnCardDelete = useRealtimeWallSyncStore((s) => s.submitOwnCardDelete);
  const submitOwnCardMove = useRealtimeWallSyncStore((s) => s.submitOwnCardMove);
  const toggleLike = useRealtimeWallSyncStore((s) => s.toggleLike);
  const currentSessionToken = useRealtimeWallSyncStore((s) => s.currentSessionToken);
  const currentPinHash = useRealtimeWallSyncStore((s) => s.currentPinHash);

  // v2.1 Phase C — 모바일 viewport 감지 + Freeform 잠금 토글
  const isMobile = useIsMobile();

  // 보드 단위 드래프트 — 다보드 동시 작성 지원 (Plan FR-A3)
  // 현재 boardShortCode는 broadcast되지 않으므로 title을 보드 키로 사용.
  // (Phase D에서 boardShortCode broadcast 추가되면 교체 — 그때 마이그레이션)
  const draftBoardKey = title || 'realtime-wall';
  const { draft, clearDraft } = useStudentDraft({
    boardKey: draftBoardKey,
    sessionToken: currentSessionToken,
    autoLoad: true,
  });

  // v2.1 Phase D — PIN 훅 (boardKey 단위 localStorage 영속)
  useStudentPin({ boardKey: draftBoardKey, autoLoad: true });

  // v2.1 Phase C-C5 — Freeform 자기 카드 잠금 토글 (보드 단위 sessionStorage)
  // 기본 false (locked) — 학생이 명시적으로 ON 했을 때만 react-rnd 활성
  const freeformLock = useStudentFreeformLockState({ boardKey: draftBoardKey });

  // v2.1 Phase D — 자기 카드 수정/삭제/PIN UI 상태
  const [editingPost, setEditingPost] = useState<RealtimeWallPost | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [pinSetupOpen, setPinSetupOpen] = useState(false);
  const [nicknameToast, setNicknameToast] = useState<string | null>(null);

  const handleOwnCardEdit = useCallback(
    (postId: string) => {
      const target = posts.find((p) => p.id === postId);
      if (!target) return;
      setEditingPost(target);
    },
    [posts],
  );

  const handleOwnCardDelete = useCallback((postId: string) => {
    setDeletingPostId(postId);
  }, []);

  // v2.1 Phase C — 학생 자기 카드 위치 변경 (Freeform 또는 Kanban)
  const handleOwnCardMove = useCallback(
    (
      postId: string,
      position: {
        freeform?: RealtimeWallFreeformPosition;
        kanban?: RealtimeWallKanbanPosition;
      },
    ) => {
      // 디버그 로그(production 유지) — 학교 환경 진단용.
      // eslint-disable-next-line no-console
      console.log('[StudentBoardView] handleOwnCardMove', {
        postId,
        kanban: position.kanban,
        freeform: position.freeform,
      });
      submitOwnCardMove(postId, position);
    },
    [submitOwnCardMove],
  );

  const handleConfirmDelete = useCallback(() => {
    if (!deletingPostId) return;
    submitOwnCardDelete(deletingPostId);
    setDeletingPostId(null);
  }, [deletingPostId, submitOwnCardDelete]);

  const handleCloseEdit = useCallback(() => {
    setEditingPost(null);
  }, []);

  // v2.1 Phase D — 자기 카드 닉네임 변경 broadcast 감지 (broadcast는 store에서 처리되지만 본인 카드면 토스트)
  // 직전 posts 스냅샷의 자기 카드 닉네임이 바뀌면 toast 트리거
  const ownNickname = useMemo(() => {
    const ownerCtx = { currentSessionToken, currentPinHash };
    const myCard = posts.find((p) => isOwnCard(p, ownerCtx));
    return myCard?.nickname ?? null;
  }, [posts, currentSessionToken, currentPinHash]);

  // 닉네임 변화 감지 (마운트 후 첫 변화는 무시)
  const [lastSeenNickname, setLastSeenNickname] = useState<string | null>(null);
  useEffect(() => {
    if (ownNickname === null) return;
    if (lastSeenNickname === null) {
      setLastSeenNickname(ownNickname);
      return;
    }
    if (lastSeenNickname !== ownNickname) {
      setNicknameToast(ownNickname);
      setLastSeenNickname(ownNickname);
    }
  }, [ownNickname, lastSeenNickname]);

  const handleOpenSubmit = useCallback(() => {
    if (studentFormLocked) return;
    // FAB 클릭은 컬럼 선택 없이 — 첫 컬럼(또는 모달 default) 사용
    setPendingColumnId(null);
    setSubmitOpen(true);
  }, [studentFormLocked]);

  const handleResumeFromChip = useCallback(() => {
    if (studentFormLocked) return;
    setResumeRequested(true);
    setSubmitOpen(true);
  }, [studentFormLocked]);

  // v2.1 student-ux — Padlet 컬럼별 + 버튼 클릭 (Kanban 학생 모드 한정)
  const handleAddCardToColumn = useCallback(
    (columnId: string) => {
      if (studentFormLocked) return;
      setPendingColumnId(columnId);
      setResumeRequested(false);
      setSubmitOpen(true);
    },
    [studentFormLocked],
  );

  const handleCloseSubmit = useCallback((opts?: { submitted?: boolean }) => {
    setSubmitOpen(false);
    setResumeRequested(false);
    setPendingColumnId(null);
    if (opts?.submitted) {
      // 제출 성공 시 드래프트 삭제 (Plan FR-A6)
      clearDraft();
    }
  }, [clearDraft]);

  // long-press / double-click 진입 (`C` 단축키 절대 X)
  const longPressHandlers = useStudentLongPress({
    onLongPress: handleOpenSubmit,
    enabled: !studentFormLocked && !submitOpen,
  });
  const doubleClickHandlers = useStudentDoubleClick({
    onDoubleClick: handleOpenSubmit,
    enabled: !studentFormLocked && !submitOpen,
  });

  const renderCommentInput = useCallback(
    (postId: string) => (
      <StudentCommentForm
        postId={postId}
        nicknameDefault={readStudentNickname()}
        onSubmit={(input) => submitCommentV2(postId, input)}
      />
    ),
    [submitCommentV2],
  );

  return (
    <div className="flex min-h-screen flex-col bg-sp-bg text-sp-text">
      <StudentBoardHeader title={title} postCount={posts.length} />

      <main
        className="relative flex-1 px-3 pb-24 pt-3 sm:px-6"
        data-empty-area="true"
        onTouchStart={longPressHandlers.onTouchStart}
        onTouchMove={longPressHandlers.onTouchMove}
        onTouchEnd={longPressHandlers.onTouchEnd}
        onTouchCancel={longPressHandlers.onTouchCancel}
        onDoubleClick={doubleClickHandlers.onDoubleClick}
      >
        {/* v2.1 Phase C-C5 — Freeform 잠금 토글 (Freeform 레이아웃에서만 노출) */}
        {layoutMode === 'freeform' && (
          <div className="mb-2 flex justify-end">
            <RealtimeWallFreeformLockToggle
              enabled={freeformLock.enabled}
              onToggle={freeformLock.toggle}
              disabled={isMobile}
            />
          </div>
        )}

        <RealtimeWallBoardThemeWrapper
          theme={boardTheme}
          className="rounded-xl"
        >
          <BoardRouter
            layoutMode={layoutMode}
            columns={columns}
            posts={posts}
            renderCommentInput={renderCommentInput}
            currentSessionToken={currentSessionToken}
            currentPinHash={currentPinHash}
            onStudentLike={toggleLike}
            onOwnCardEdit={handleOwnCardEdit}
            onOwnCardDelete={handleOwnCardDelete}
            onOwnCardMove={handleOwnCardMove}
            isMobile={isMobile}
            freeformLockEnabled={freeformLock.enabled}
            onAddCardToColumn={handleAddCardToColumn}
            studentFormLocked={studentFormLocked}
          />
        </RealtimeWallBoardThemeWrapper>
      </main>

      {/* P3 — 학생 카드 추가 FAB */}
      <StudentAddFab
        locked={studentFormLocked}
        onClick={handleOpenSubmit}
      />

      {/* Phase A-A4 — 작성 중인 카드 칩 (모달 닫혀있을 때만) */}
      {!submitOpen && (
        <StudentDraftChip draft={draft} onResume={handleResumeFromChip} />
      )}

      {/* P3 — 카드 추가 모달 */}
      <StudentSubmitForm
        open={submitOpen}
        onClose={handleCloseSubmit}
        boardKey={draftBoardKey}
        sessionToken={currentSessionToken}
        resumeFromDraft={resumeRequested}
        defaultColumnId={pendingColumnId ?? undefined}
      />

      {/* v2.1 Phase D — 자기 카드 수정 모달 (mode='edit') */}
      <StudentSubmitForm
        open={editingPost !== null}
        onClose={handleCloseEdit}
        boardKey={draftBoardKey}
        sessionToken={currentSessionToken}
        mode="edit"
        editingPost={editingPost ?? undefined}
      />

      {/* v2.1 Phase D — 자기 카드 삭제 확인 다이얼로그 */}
      <StudentDeleteConfirmDialog
        open={deletingPostId !== null}
        onClose={() => setDeletingPostId(null)}
        onConfirm={handleConfirmDelete}
      />

      {/* v2.1 Phase D — PIN 설정 모달 */}
      <PinMenuButton
        currentPinHash={currentPinHash}
        onOpen={() => setPinSetupOpen(true)}
      />
      <StudentPinSetupModalWithHook
        open={pinSetupOpen}
        onClose={() => setPinSetupOpen(false)}
        boardKey={draftBoardKey}
      />

      {/* v2.1 Phase D — 닉네임 변경 토스트 */}
      <StudentNicknameChangedToast
        newNickname={nicknameToast}
        visible={nicknameToast !== null}
        onDismiss={() => setNicknameToast(null)}
      />
    </div>
  );
}

/**
 * v2.1 Phase D — PIN 설정 메뉴 버튼 (좌하단 고정).
 * PIN 설정 시 sky 아이콘, 미설정 시 회색.
 */
function PinMenuButton({
  currentPinHash,
  onOpen,
}: {
  currentPinHash: string | undefined;
  onOpen: () => void;
}) {
  const hasSetPin = Boolean(currentPinHash);
  return (
    <button
      type="button"
      onClick={onOpen}
      title={hasSetPin ? 'PIN 설정됨 — 다시 설정' : 'PIN 설정 (선택, 학기 영속)'}
      aria-label="PIN 설정"
      className={[
        'fixed bottom-5 left-5 z-30 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition shadow-sp-md sm:bottom-8',
        hasSetPin
          ? 'border-sky-400/40 bg-sp-card text-sky-300 hover:border-sky-400/60'
          : 'border-sp-border bg-sp-card text-sp-muted hover:border-sky-400/40 hover:text-sky-300',
      ].join(' ')}
    >
      <span className="material-symbols-outlined text-[14px]">
        {hasSetPin ? 'lock' : 'lock_open'}
      </span>
      PIN
    </button>
  );
}

/**
 * v2.1 Phase D — useStudentPin 훅과 StudentPinSetupModal을 연결하는 wrapper.
 */
function StudentPinSetupModalWithHook({
  open,
  onClose,
  boardKey,
}: {
  open: boolean;
  onClose: () => void;
  boardKey: string;
}) {
  const { setPin, error } = useStudentPin({ boardKey, autoLoad: false });
  return (
    <StudentPinSetupModal
      open={open}
      onClose={onClose}
      mode="setup"
      onSubmit={setPin}
      externalError={error}
    />
  );
}

interface StudentBoardHeaderProps {
  readonly title: string;
  readonly postCount: number;
}

function StudentBoardHeader({ title, postCount }: StudentBoardHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-sp-border bg-sp-bg/95 px-4 py-3 backdrop-blur sm:px-6">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold text-sp-text sm:text-lg">{title}</h1>
          <p className="text-xs text-sp-muted">
            카드 {postCount}장
          </p>
        </div>
      </div>
    </header>
  );
}

interface StudentAddFabProps {
  readonly locked: boolean;
  readonly onClick: () => void;
}

/**
 * v2.1 (Phase A-A1 / Plan FR-A1) — FAB 잠금 시각 강화.
 *
 * - lock 아이콘 + 비활성 톤 + 한국어 tooltip "선생님이 카드 추가를 잠시 멈췄어요"
 * - 호버 시 진동 애니메이션 (group-hover:animate-jiggle)
 *
 * Design v2.1 §13 Phase A 수용 기준 #1.
 */
function StudentAddFab({ locked, onClick }: StudentAddFabProps) {
  const title = locked
    ? '선생님이 카드 추가를 잠시 멈췄어요'
    : '카드 추가';

  return (
    <button
      type="button"
      onClick={locked ? undefined : onClick}
      disabled={locked}
      aria-label={title}
      title={title}
      aria-disabled={locked}
      className={[
        'group fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition sm:bottom-8 sm:right-8',
        locked
          ? 'cursor-not-allowed border border-sp-border bg-sp-surface text-sp-muted opacity-70 hover:opacity-90'
          : 'bg-sp-accent text-white hover:bg-sp-accent/85',
      ].join(' ')}
    >
      <span
        className={[
          'material-symbols-outlined text-[24px] transition-transform',
          locked ? 'group-hover:animate-fab-jiggle' : '',
        ].join(' ')}
      >
        {locked ? 'lock' : 'add'}
      </span>
    </button>
  );
}

interface BoardRouterProps {
  readonly layoutMode: WallBoardSnapshotForStudent['layoutMode'];
  readonly columns: WallBoardSnapshotForStudent['columns'];
  readonly posts: WallBoardSnapshotForStudent['posts'];
  readonly renderCommentInput: (postId: string) => React.ReactNode;
  readonly currentSessionToken: string;
  readonly currentPinHash: string | undefined;
  /** Fix v2-student-ux: 학생 좋아요 콜백 — store.toggleLike 연결 */
  readonly onStudentLike: (postId: string) => void;
  readonly onOwnCardEdit: (postId: string) => void;
  readonly onOwnCardDelete: (postId: string) => void;
  // v2.1 Phase C
  readonly onOwnCardMove: (
    postId: string,
    position: {
      freeform?: RealtimeWallFreeformPosition;
      kanban?: RealtimeWallKanbanPosition;
    },
  ) => void;
  readonly isMobile: boolean;
  readonly freeformLockEnabled: boolean;
  // v2.1 student-ux — Padlet 컬럼별 + 버튼
  readonly onAddCardToColumn: (columnId: string) => void;
  /**
   * v1.16.x Phase 3 — 학생 카드 추가 잠금 상태.
   * 칸반 컬럼별 풀-와이드 "+ 카드 추가" 버튼이 disabled + lock 아이콘으로 전환.
   */
  readonly studentFormLocked: boolean;
}

function BoardRouter({
  layoutMode,
  columns,
  posts,
  renderCommentInput,
  currentSessionToken,
  currentPinHash,
  onStudentLike,
  onOwnCardEdit,
  onOwnCardDelete,
  onOwnCardMove,
  isMobile,
  freeformLockEnabled,
  onAddCardToColumn,
  studentFormLocked,
}: BoardRouterProps) {
  const handleOpenLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const sharedProps = {
    viewerRole: 'student' as const,
    onOpenLink: handleOpenLink,
    renderCommentInput,
    currentSessionToken,
    currentPinHash,
    // Fix v2-student-ux: 학생 좋아요 콜백 연결 (props에서 전달된 onStudentLike = store.toggleLike)
    onStudentLike,
    onOwnCardEdit,
    onOwnCardDelete,
    // v2.1 Phase C
    onOwnCardMove,
    isMobile,
    freeformLockEnabled,
  };

  switch (layoutMode) {
    case 'kanban':
      return (
        <RealtimeWallKanbanBoard
          {...sharedProps}
          columns={columns}
          posts={posts}
          onAddCardToColumn={onAddCardToColumn}
          studentFormLocked={studentFormLocked}
        />
      );
    case 'freeform':
      return <RealtimeWallFreeformBoard {...sharedProps} posts={posts} />;
    case 'grid':
      return <RealtimeWallGridBoard {...sharedProps} posts={posts} />;
    case 'stream':
      return <RealtimeWallStreamBoard {...sharedProps} posts={posts} />;
    default: {
      // exhaustive check — 새 레이아웃 추가 시 컴파일 에러로 감지
      const _exhaustive: never = layoutMode;
      return _exhaustive;
    }
  }
}
