/**
 * 온라인 교무실 — 부서 상세 화면 (M1 + M2)
 *
 * M1 은 부서를 만들고 사람을 모으는 화면이고, M2 는 그 부서의 게시판이다.
 * 게시판 탭 안에서 "목록 → 글 보기 → 글 쓰기/고치기"를 로컬 상태(`boardMode`)로만
 * 오간다 — 실제로 어떤 글이 열려 있는지는 스토어의 `currentPost` 가 정본이고,
 * 여기서는 그 위에 어떤 화면을 보여줄지만 결정한다.
 */
import { useEffect, useState } from 'react';
import { useStaffRoomStore } from '@adapters/stores/useStaffRoomStore';
import { useStaffRoomBoardStore } from '@adapters/stores/useStaffRoomBoardStore';
import { useGoogleAccountStore } from '@adapters/stores/useGoogleAccountStore';
import { isDepartmentAdmin } from '@domain/rules/staffRoomPermission';
import { MemberList } from './MemberList';
import { InvitePanel } from './InvitePanel';
import { BoardView } from './BoardView';
import { LibraryView } from './LibraryView';
import { DiscussionView } from './DiscussionView';
import { GalleryView } from './GalleryView';
import { MinutesView } from './MinutesView';
import { DepartmentBanner } from './DepartmentBanner';
import { ModuleTabs } from './ModuleTabs';
import { useStaffRoomRoomsStore } from '@adapters/stores/useStaffRoomRoomsStore';
import { useStaffRoomLibraryStore } from '@adapters/stores/useStaffRoomLibraryStore';
import { PostDetail } from './PostDetail';
import { PostEditor } from './PostEditor';
import { MyNameModal, hasSkippedNamePrompt } from './MyNameModal';

/**
 * 어느 탭을 보고 있는가.
 *
 * 계획서 §6 대로 공간(모듈)은 관리자가 만들고 이름을 붙이므로, 탭을 코드에 박아 두지 않고
 * **공간 목록에서 그린다.** 멤버·초대만 부서 자체의 것이라 고정이다.
 */
type DetailTab = { kind: 'module'; moduleId: string } | { kind: 'members' } | { kind: 'invites' };
type BoardMode = 'list' | 'write' | 'edit';

export function DepartmentDetail() {
  const currentDepartment = useStaffRoomStore((s) => s.currentDepartment);
  const members = useStaffRoomStore((s) => s.members);
  const closeDepartment = useStaffRoomStore((s) => s.closeDepartment);
  const myEmail = useGoogleAccountStore((s) => s.email);

  const currentPost = useStaffRoomBoardStore((s) => s.currentPost);
  const boardReset = useStaffRoomBoardStore((s) => s.reset);
  const libraryReset = useStaffRoomLibraryStore((s) => s.reset);
  const modules = useStaffRoomRoomsStore((s) => s.modules);
  const hasLoadedModules = useStaffRoomRoomsStore((s) => s.hasLoadedModules);
  const loadModules = useStaffRoomRoomsStore((s) => s.loadModules);
  const roomsReset = useStaffRoomRoomsStore((s) => s.reset);

  const [tab, setTab] = useState<DetailTab>({ kind: 'members' });
  const [boardMode, setBoardMode] = useState<BoardMode>('list');
  const [nameModalDismissed, setNameModalDismissed] = useState(false);

  const departmentId = currentDepartment?.id ?? null;

  // 공간 목록을 받아 탭을 그린다(§6). 코드에 박힌 탭이 없으므로 이게 없으면 화면이 빈다.
  useEffect(() => {
    if (departmentId) void loadModules(departmentId);
  }, [departmentId, loadModules]);

  // 처음 들어오면 첫 공간을 연다 — 보통 게시판이다
  useEffect(() => {
    if (!hasLoadedModules || modules.length === 0) return;
    const first = modules[0];
    if (!first) return;
    setTab((current) =>
      current.kind === 'module' && modules.some((m) => m.id === current.moduleId)
        ? current
        : { kind: 'module', moduleId: first.id },
    );
  }, [hasLoadedModules, modules]);

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
    roomsReset();
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
        {/* 배너 — 부서 이름·한 줄 소개가 여기 얹힌다 (계획서 §6) */}
        <DepartmentBanner
          departmentId={currentDepartment.id}
          name={currentDepartment.name}
          description={currentDepartment.description}
          memberCount={currentDepartment.memberCount}
          myRole={currentDepartment.myRole}
        />
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-8">
        <div
          className="mb-6 flex flex-wrap items-center gap-2 border-b border-sp-border"
          role="tablist"
          aria-label="부서 탭"
        >
          <ModuleTabs
            departmentId={currentDepartment.id}
            modules={modules}
            myRole={currentDepartment.myRole}
            activeModuleId={tab.kind === 'module' ? tab.moduleId : null}
            onSelect={(moduleId) => {
              setBoardMode('list');
              setTab({ kind: 'module', moduleId });
            }}
          />
          <button
            type="button"
            role="tab"
            aria-selected={tab.kind === 'members'}
            onClick={() => setTab({ kind: 'members' })}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-sp-medium transition-colors ${
              tab.kind === 'members'
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
              aria-selected={tab.kind === 'invites'}
              onClick={() => setTab({ kind: 'invites' })}
              className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-sp-medium transition-colors ${
                tab.kind === 'invites'
                  ? 'border-sp-accent text-sp-text'
                  : 'border-transparent text-sp-muted hover:text-sp-text'
              }`}
            >
              초대
            </button>
          )}
        </div>

        {tab.kind === 'module' &&
          (() => {
            const active = modules.find((m) => m.id === tab.moduleId);
            if (!active) return null;

            if (active.kind === 'board') {
              return boardMode === 'write' || boardMode === 'edit' ? (
                <PostEditor
                  departmentId={currentDepartment.id}
                  boardId={active.id}
                  mode={boardMode === 'write' ? 'create' : 'edit'}
                  onDone={() => setBoardMode('list')}
                  onCancel={() => setBoardMode('list')}
                />
              ) : currentPost ? (
                <PostDetail
                  departmentId={currentDepartment.id}
                  onEdit={() => setBoardMode('edit')}
                />
              ) : (
                <BoardView
                  departmentId={currentDepartment.id}
                  boardId={active.id}
                  onWriteNew={() => setBoardMode('write')}
                />
              );
            }

            if (active.kind === 'archive') {
              return <LibraryView departmentId={currentDepartment.id} moduleId={active.id} />;
            }

            if (active.kind === 'discussion') {
              return <DiscussionView departmentId={currentDepartment.id} moduleId={active.id} />;
            }

            if (active.kind === 'gallery') {
              return <GalleryView departmentId={currentDepartment.id} moduleId={active.id} />;
            }

            if (active.kind === 'minutes') {
              return <MinutesView departmentId={currentDepartment.id} moduleId={active.id} />;
            }

            // 여기 오면 모르는 종류다. 나중에 종류가 늘 때를 위해 남겨 둔다.
            return (
              <div className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-xl border border-dashed border-sp-border bg-sp-card px-8 py-14 text-center">
                <span className="material-symbols-outlined text-icon-xl text-sp-muted">
                  construction
                </span>
                <p className="text-sm leading-relaxed text-sp-muted">
                  이 공간은 아직 열 수 없습니다. 쌤핀을 최신 버전으로 올려주세요.
                </p>
              </div>
            );
          })()}
        {tab.kind === 'members' && <MemberList />}
        {tab.kind === 'invites' && isAdmin && <InvitePanel />}
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
