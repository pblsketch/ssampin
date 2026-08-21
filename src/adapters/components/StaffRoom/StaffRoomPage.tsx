/**
 * 온라인 교무실 — 진입 화면 (M1)
 *
 * 계획서: docs/01-plan/features/online-staffroom.plan.md §9(M1) · §10.2
 *
 * 이 탭은 온라인 전용이다(구글 로그인 필요). §10.2 의 원칙대로 "조용히 빈 화면"을
 * 절대 띄우지 않는다 — 구글 미연결·로딩·빈 상태·오류를 각각 눈에 띄게 구분해 보여준다.
 */
import { useEffect, useState } from 'react';
import { PageHeader } from '@adapters/components/common/PageHeader';
import { useStaffRoomStore } from '@adapters/stores/useStaffRoomStore';
import type { StaffRoomDepartment } from '@domain/entities/StaffRoom';
import { CreateDepartmentModal } from './CreateDepartmentModal';
import { JoinByCodeModal } from './JoinByCodeModal';
import { DepartmentDetail } from './DepartmentDetail';

const PRIMARY_BTN =
  'flex items-center gap-1.5 rounded-xl bg-sp-accent px-3 py-2 text-xs font-sp-semibold text-white transition-all duration-sp-base ease-sp-out active:scale-95 xl:px-4 xl:py-2.5 xl:text-sm';
const SECONDARY_BTN =
  'flex items-center gap-1.5 rounded-xl border border-sp-border px-3 py-2 text-xs font-sp-semibold text-sp-muted transition-all duration-sp-base ease-sp-out hover:bg-sp-surface hover:text-sp-text active:scale-95 xl:px-4 xl:py-2.5 xl:text-sm';

function GoogleConnectNotice() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-xl border border-sp-border bg-sp-card px-8 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sp-surface text-sp-accent">
        <span className="material-symbols-outlined text-icon-xl">account_circle</span>
      </div>
      <h2 className="text-lg font-sp-bold text-sp-text">
        온라인 교무실은 구글 로그인이 필요합니다
      </h2>
      <p className="max-w-sm text-sm leading-relaxed text-sp-muted">
        여러 선생님이 함께 쓰는 부서·초대·멤버 정보는 쌤핀 서버가 대신 지켜줘요. 그 신원을 확인하는
        유일한 방법이 구글 계정이라, 다른 기능과 달리 이 탭만은 로그인 없이 열 수 없어요.
      </p>
      <p className="text-xs text-sp-muted">
        설정 &gt; 구글 계정에서 연결하면 바로 이용할 수 있어요.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center gap-2 py-24 text-sm text-sp-muted">
      <span className="material-symbols-outlined animate-spin text-icon-md">progress_activity</span>
      부서 목록을 불러오는 중이에요…
    </div>
  );
}

function EmptyState({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-xl border border-dashed border-sp-border bg-sp-card px-8 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sp-surface text-sp-accent">
        <span className="material-symbols-outlined text-icon-xl">groups</span>
      </div>
      <h2 className="text-lg font-sp-bold text-sp-text">아직 참여 중인 부서가 없어요</h2>
      <p className="max-w-sm text-sm leading-relaxed text-sp-muted">
        온라인 교무실은 학년부·업무부처럼 함께 일하는 선생님들을 모아 자료와 소식을 나누는
        공간이에요. 부서를 새로 만들거나, 동료 선생님께 받은 초대 코드로 들어가보세요.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={onCreate} className={PRIMARY_BTN}>
          <span className="material-symbols-outlined text-icon">add</span>
          부서 만들기
        </button>
        <button type="button" onClick={onJoin} className={SECONDARY_BTN}>
          <span className="material-symbols-outlined text-icon">qr_code_scanner</span>
          초대 코드로 참여
        </button>
      </div>
    </div>
  );
}

function DepartmentCard({
  department,
  onOpen,
}: {
  department: StaffRoomDepartment;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col items-start gap-3 rounded-xl border border-sp-border bg-sp-card p-5 text-left transition-all duration-sp-base ease-sp-out hover:border-sp-accent hover:shadow-sp-md"
    >
      <div className="flex w-full items-start justify-between gap-2">
        <h3 className="truncate text-base font-sp-bold text-sp-text">{department.name}</h3>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-sp-medium ${
            department.myRole === 'admin'
              ? 'bg-sp-accent text-white'
              : 'border border-sp-border text-sp-muted'
          }`}
        >
          {department.myRole === 'admin' ? '관리자' : '일반'}
        </span>
      </div>
      {department.description && (
        <p className="line-clamp-2 text-sm text-sp-muted">{department.description}</p>
      )}
      <div className="mt-auto flex items-center gap-1.5 text-xs text-sp-muted">
        <span className="material-symbols-outlined text-icon-sm">group</span>
        멤버 {department.memberCount}명
      </div>
    </button>
  );
}

export function StaffRoomPage() {
  const departments = useStaffRoomStore((s) => s.departments);
  const currentDepartment = useStaffRoomStore((s) => s.currentDepartment);
  const isLoading = useStaffRoomStore((s) => s.isLoading);
  const hasLoadedDepartments = useStaffRoomStore((s) => s.hasLoadedDepartments);
  const error = useStaffRoomStore((s) => s.error);
  const needsGoogleConnect = useStaffRoomStore((s) => s.needsGoogleConnect);
  const loadDepartments = useStaffRoomStore((s) => s.loadDepartments);
  const openDepartment = useStaffRoomStore((s) => s.openDepartment);
  const clearError = useStaffRoomStore((s) => s.clearError);

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  useEffect(() => {
    void loadDepartments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (currentDepartment) {
    return <DepartmentDetail />;
  }

  const isEmpty = hasLoadedDepartments && !needsGoogleConnect && departments.length === 0;
  const isInitialLoading = isLoading && !hasLoadedDepartments && !needsGoogleConnect;

  return (
    <div className="-m-8 flex h-[calc(100%+4rem)] flex-col">
      <PageHeader
        icon="groups"
        iconIsMaterial
        title="온라인 교무실"
        rightActions={
          <>
            <button type="button" onClick={() => setCreateOpen(true)} className={PRIMARY_BTN}>
              <span className="material-symbols-outlined text-icon">add</span>
              <span className="hidden sm:inline">부서 만들기</span>
            </button>
            <button type="button" onClick={() => setJoinOpen(true)} className={SECONDARY_BTN}>
              <span className="material-symbols-outlined text-icon">qr_code_scanner</span>
              <span className="hidden sm:inline">초대 코드로 참여</span>
            </button>
          </>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto p-8">
        {error && !needsGoogleConnect && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
            <span className="material-symbols-outlined shrink-0 text-icon-md text-red-400">
              error
            </span>
            <p className="flex-1 text-sm text-sp-text">{error}</p>
            <button
              type="button"
              onClick={clearError}
              aria-label="오류 닫기"
              className="shrink-0 text-sp-muted transition-colors hover:text-sp-text"
            >
              <span className="material-symbols-outlined text-icon">close</span>
            </button>
          </div>
        )}

        {needsGoogleConnect ? (
          <GoogleConnectNotice />
        ) : isInitialLoading ? (
          <LoadingState />
        ) : isEmpty ? (
          <EmptyState onCreate={() => setCreateOpen(true)} onJoin={() => setJoinOpen(true)} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {departments.map((department) => (
              <DepartmentCard
                key={department.id}
                department={department}
                onOpen={() => void openDepartment(department.id)}
              />
            ))}
          </div>
        )}
      </div>

      {createOpen && <CreateDepartmentModal onClose={() => setCreateOpen(false)} />}
      {joinOpen && <JoinByCodeModal onClose={() => setJoinOpen(false)} />}
    </div>
  );
}
