/**
 * 온라인 교무실 — 부서 멤버 목록 (M1)
 *
 * 권한 변경·내보내기 버튼은 관리자에게만 그린다(일반 멤버에게는 아예 렌더하지 않는다).
 * 마지막 관리자 보호는 domain(`canChangeRole`/`canRemoveMember`)이 판정하고,
 * 화면은 그 결과에 따라 버튼을 비활성화 + 이유를 title 로 보여줄 뿐이다 — 버튼을
 * 숨기는 것 자체가 방어가 아니라는 게 domain 파일의 설계 전제다.
 */
import { useState } from 'react';
import { useStaffRoomStore } from '@adapters/stores/useStaffRoomStore';
import {
  canChangeRole,
  canRemoveMember,
  staffRoomDenialMessage,
  type StaffRoomDenialReason,
} from '@domain/rules/staffRoomPermission';
import type { StaffRoomMember, StaffRoomRole } from '@domain/entities/StaffRoom';

function formatJoinedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}

function denialTitle(reason: StaffRoomDenialReason | null): string | undefined {
  return reason === null ? undefined : staffRoomDenialMessage(reason);
}

export function MemberList() {
  const members = useStaffRoomStore((s) => s.members);
  const currentDepartment = useStaffRoomStore((s) => s.currentDepartment);
  const setMemberRole = useStaffRoomStore((s) => s.setMemberRole);
  const removeMember = useStaffRoomStore((s) => s.removeMember);

  const myRole: StaffRoomRole | null = currentDepartment?.myRole ?? null;
  const isAdmin = myRole === 'admin';
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  if (members.length === 0) {
    return <p className="py-8 text-center text-sm text-sp-muted">멤버 정보를 불러오는 중이에요.</p>;
  }

  return (
    <div className="space-y-2">
      {members.map((member: StaffRoomMember) => {
        const nextRole: StaffRoomRole = member.role === 'admin' ? 'member' : 'admin';
        const roleResult = canChangeRole(myRole, members, member.id, nextRole);
        const removeResult = canRemoveMember(myRole, members, member.id);
        const isConfirming = pendingRemoveId === member.id;

        return (
          <div
            key={member.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-sp-border bg-sp-card px-4 py-3"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sp-surface text-sp-muted">
              <span className="material-symbols-outlined text-icon-md">person</span>
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-sp-semibold text-sp-text">
                {member.displayName ?? member.email}
              </p>
              <p className="truncate text-xs text-sp-muted">{member.email}</p>
            </div>

            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-sp-medium ${
                member.role === 'admin'
                  ? 'bg-sp-accent text-white'
                  : 'border border-sp-border text-sp-muted'
              }`}
            >
              {member.role === 'admin' ? '관리자' : '일반'}
            </span>

            <span className="hidden shrink-0 text-xs text-sp-muted sm:block">
              {formatJoinedAt(member.joinedAt)} 참여
            </span>

            {isAdmin && (
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void setMemberRole(member.id, nextRole)}
                  disabled={!roleResult.allowed}
                  title={denialTitle(roleResult.reason)}
                  className="rounded-lg border border-sp-border px-2.5 py-1.5 text-xs font-sp-medium text-sp-muted transition-colors hover:text-sp-text disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-sp-muted"
                >
                  {member.role === 'admin' ? '일반으로' : '관리자로'}
                </button>

                {isConfirming ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-sp-muted">내보낼까요?</span>
                    <button
                      type="button"
                      onClick={() => {
                        void removeMember(member.id);
                        setPendingRemoveId(null);
                      }}
                      className="rounded-lg bg-red-500 px-2.5 py-1.5 text-xs font-sp-semibold text-white transition-colors hover:bg-red-600"
                    >
                      확인
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingRemoveId(null)}
                      className="rounded-lg border border-sp-border px-2.5 py-1.5 text-xs text-sp-muted transition-colors hover:text-sp-text"
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPendingRemoveId(member.id)}
                    disabled={!removeResult.allowed}
                    title={denialTitle(removeResult.reason)}
                    className="rounded-lg border border-sp-border px-2.5 py-1.5 text-xs font-sp-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:text-sp-muted disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    내보내기
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
