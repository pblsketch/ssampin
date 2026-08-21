/**
 * 온라인 교무실 — 부서 상세 화면 (M1)
 *
 * M1 범위는 부서를 만들고 사람을 모으는 데까지다. 게시판·자료실은 아직
 * 없으므로, 빈 화면처럼 보이지 않게 "준비 중" 안내 카드를 항상 보여준다.
 */
import { useState } from 'react';
import { useStaffRoomStore } from '@adapters/stores/useStaffRoomStore';
import { isDepartmentAdmin } from '@domain/rules/staffRoomPermission';
import { MemberList } from './MemberList';
import { InvitePanel } from './InvitePanel';

type DetailTab = 'members' | 'invites';

export function DepartmentDetail() {
  const currentDepartment = useStaffRoomStore((s) => s.currentDepartment);
  const members = useStaffRoomStore((s) => s.members);
  const closeDepartment = useStaffRoomStore((s) => s.closeDepartment);
  const [tab, setTab] = useState<DetailTab>('members');

  if (!currentDepartment) return null;

  const isAdmin = isDepartmentAdmin(currentDepartment.myRole);

  return (
    <div className="-m-8 flex h-[calc(100%+4rem)] flex-col">
      <header className="shrink-0 border-b border-sp-border bg-sp-surface px-8 py-4">
        <button
          type="button"
          onClick={closeDepartment}
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
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-sp-border bg-sp-card px-4 py-3.5">
          <span className="material-symbols-outlined shrink-0 text-icon-md text-sp-accent">
            construction
          </span>
          <p className="text-sm leading-relaxed text-sp-text">
            게시판·자료실은 준비 중입니다. 지금은 부서를 만들고 함께할 선생님을 모으는 단계예요.
          </p>
        </div>

        <div
          className="mb-5 flex gap-2 border-b border-sp-border"
          role="tablist"
          aria-label="부서 탭"
        >
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

        {tab === 'members' && <MemberList />}
        {tab === 'invites' && isAdmin && <InvitePanel />}
      </div>
    </div>
  );
}
