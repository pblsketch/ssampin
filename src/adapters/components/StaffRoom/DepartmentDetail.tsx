/**
 * 온라인 교무실 — 부서 상세 화면 (M1 + M2)
 *
 * M1 은 부서를 만들고 사람을 모으는 화면이고, M2 는 그 부서의 게시판이다.
 * 게시판 탭 안에서 "목록 → 글 보기 → 글 쓰기/고치기"를 로컬 상태(`boardMode`)로만
 * 오간다 — 실제로 어떤 글이 열려 있는지는 스토어의 `currentPost` 가 정본이고,
 * 여기서는 그 위에 어떤 화면을 보여줄지만 결정한다.
 */
import { useState } from 'react';
import { useStaffRoomStore } from '@adapters/stores/useStaffRoomStore';
import { useStaffRoomBoardStore } from '@adapters/stores/useStaffRoomBoardStore';
import { useGoogleAccountStore } from '@adapters/stores/useGoogleAccountStore';
import { isDepartmentAdmin } from '@domain/rules/staffRoomPermission';
import { MemberList } from './MemberList';
import { InvitePanel } from './InvitePanel';
import { BoardView } from './BoardView';
import { LibraryView } from './LibraryView';
import { useStaffRoomLibraryStore } from '@adapters/stores/useStaffRoomLibraryStore';
import { PostDetail } from './PostDetail';
import { PostEditor } from './PostEditor';
import { MyNameModal, hasSkippedNamePrompt } from './MyNameModal';

type DetailTab = 'board' | 'library' | 'members' | 'invites';
type BoardMode = 'list' | 'write' | 'edit';

export function DepartmentDetail() {
  const currentDepartment = useStaffRoomStore((s) => s.currentDepartment);
  const currentBoard = useStaffRoomStore((s) => s.currentBoard);
  const members = useStaffRoomStore((s) => s.members);
  const closeDepartment = useStaffRoomStore((s) => s.closeDepartment);
  const myEmail = useGoogleAccountStore((s) => s.email);

  const currentPost = useStaffRoomBoardStore((s) => s.currentPost);
  const boardReset = useStaffRoomBoardStore((s) => s.reset);
  const libraryReset = useStaffRoomLibraryStore((s) => s.reset);

  const [tab, setTab] = useState<DetailTab>('board');
  const [boardMode, setBoardMode] = useState<BoardMode>('list');
  const [nameModalDismissed, setNameModalDismissed] = useState(false);

  if (!currentDepartment) return null;

  const isAdmin = isDepartmentAdmin(currentDepartment.myRole);

  const myMember = myEmail
    ? members.find((m) => m.email.toLowerCase() === myEmail.toLowerCase())
    : undefined;
  const showNameModal =
    !nameModalDismissed &&
    myMember !== undefined &&
    myMember.displayName === null &&
    !hasSkippedNamePrompt(currentDepartment.id);

  const handleBack = () => {
    boardReset();
    libraryReset();
    closeDepartment();
  };

  return (
    <div className="-m-8 flex h-[calc(100%+4rem)] flex-col">
      <header className="shrink-0 border-b border-sp-border bg-sp-surface px-8 py-4">
        <button
          type="button"
          onClick={handleBack}
          className="mb-3 flex items-center gap-1.5 text-sm text-sp-muted transition-colors hover:text-sp-text"
        >
          <span className="material-symbols-outlined text-icon">arrow_back</span>
          목록으로
        </button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-sp-bold text-sp-text">{currentDepartment.name}</h1>
            {currentDepartment.description && (
              <p className="mt-1 text-sm text-sp-muted">{currentDepartment.description}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5 text-sm text-sp-muted">
            <span className="material-symbols-outlined text-icon-md">group</span>
            멤버 {currentDepartment.memberCount}명
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-8">
        <div
          className="mb-6 flex gap-2 border-b border-sp-border"
          role="tablist"
          aria-label="부서 탭"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'board'}
            onClick={() => setTab('board')}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-sp-medium transition-colors ${
              tab === 'board'
                ? 'border-sp-accent text-sp-text'
                : 'border-transparent text-sp-muted hover:text-sp-text'
            }`}
          >
            게시판
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'library'}
            onClick={() => setTab('library')}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-sp-medium transition-colors ${
              tab === 'library'
                ? 'border-sp-accent text-sp-text'
                : 'border-transparent text-sp-muted hover:text-sp-text'
            }`}
          >
            자료실
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'members'}
            onClick={() => setTab('members')}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-sp-medium transition-colors ${
              tab === 'members'
                ? 'border-sp-accent text-sp-text'
                : 'border-transparent text-sp-muted hover:text-sp-text'
            }`}
          >
            멤버 {members.length}
          </button>
          {isAdmin && (
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'invites'}
              onClick={() => setTab('invites')}
              className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-sp-medium transition-colors ${
                tab === 'invites'
                  ? 'border-sp-accent text-sp-text'
                  : 'border-transparent text-sp-muted hover:text-sp-text'
              }`}
            >
              초대
            </button>
          )}
        </div>

        {tab === 'board' &&
          (currentBoard === null ? (
            <div className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-xl border border-dashed border-sp-border bg-sp-card px-8 py-14 text-center">
              <span className="material-symbols-outlined text-icon-xl text-sp-accent">
                construction
              </span>
              <p className="text-sm leading-relaxed text-sp-muted">
                이 부서는 게시판을 준비하는 중이에요. 잠시 후 다시 열어봐 주세요.
              </p>
            </div>
          ) : boardMode === 'write' || boardMode === 'edit' ? (
            <PostEditor
              departmentId={currentDepartment.id}
              boardId={currentBoard.id}
              mode={boardMode === 'write' ? 'create' : 'edit'}
              onDone={() => setBoardMode('list')}
              onCancel={() => setBoardMode('list')}
            />
          ) : currentPost ? (
            <PostDetail departmentId={currentDepartment.id} onEdit={() => setBoardMode('edit')} />
          ) : (
            <BoardView
              departmentId={currentDepartment.id}
              boardId={currentBoard.id}
              onWriteNew={() => setBoardMode('write')}
            />
          ))}
        {tab === 'library' && <LibraryView departmentId={currentDepartment.id} />}
        {tab === 'members' && <MemberList />}
        {tab === 'invites' && isAdmin && <InvitePanel />}
      </div>

      {showNameModal && (
        <MyNameModal
          departmentId={currentDepartment.id}
          onClose={() => setNameModalDismissed(true)}
        />
      )}
    </div>
  );
}
