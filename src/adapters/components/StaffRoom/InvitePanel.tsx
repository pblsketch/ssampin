/**
 * 온라인 교무실 — 초대 패널 (M1, 관리자 전용)
 *
 * 초대 발급·QR·복사·해지를 다룬다. QR 은 `ToolQRCode.tsx` 와 같은 방식
 * (`qrcode` 패키지로 canvas 에 직접 그린다)을 재사용한다.
 *
 * 초대의 "유효함" 판정은 domain(`isInviteAcceptable`)을 그대로 쓴다 — 화면이
 * 따로 판단하면 서버 판정과 어긋날 수 있다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useStaffRoomStore } from '@adapters/stores/useStaffRoomStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { STAFFROOM_INVITE_EXPIRY_OPTIONS } from '@domain/entities/StaffRoom';
import type { StaffRoomInvite } from '@domain/entities/StaffRoom';
import { isInviteAcceptable } from '@domain/rules/staffRoomPermission';

const INVITE_LINK_BASE = 'https://www.ssampin.com/staffroom/join';

function inviteLink(code: string): string {
  return `${INVITE_LINK_BASE}?code=${code}`;
}

function isInviteLive(invite: StaffRoomInvite): boolean {
  return isInviteAcceptable(invite, Date.now()).allowed;
}

/** 관리자 화면용 상태 문구 — 초대를 받는 쪽 안내 문구(denial message)와는 결이 달라 따로 둔다 */
function formatInviteStatus(invite: StaffRoomInvite): string {
  if (invite.revokedAt !== null) return '해지됨';
  if (invite.expiresAt !== null && new Date(invite.expiresAt).getTime() <= Date.now()) {
    return '만료됨';
  }
  if (invite.maxUses !== null && invite.useCount >= invite.maxUses) return '정원 마감';
  if (invite.expiresAt === null) return '무기한';
  return `${new Date(invite.expiresAt).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
  })}까지`;
}

function InviteQRCode({ value }: { value: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    void QRCode.toCanvas(canvas, value, {
      width: 112,
      margin: 1,
      // QR코드는 테마와 무관하게 항상 검정/흰색이어야 스캔이 안정적이라 sp-* 토큰을 쓰지 않는다.
      color: { dark: 'rgb(0, 0, 0)', light: 'rgb(255, 255, 255)' },
    });
  }, [value]);

  return (
    <div className="shrink-0 rounded-lg bg-white p-2">
      <canvas ref={canvasRef} />
    </div>
  );
}

export function InvitePanel() {
  const invites = useStaffRoomStore((s) => s.invites);
  const createInvite = useStaffRoomStore((s) => s.createInvite);
  const revokeInvite = useStaffRoomStore((s) => s.revokeInvite);
  const isLoading = useStaffRoomStore((s) => s.isLoading);
  const showToast = useToastStore((s) => s.show);

  const defaultExpiry = STAFFROOM_INVITE_EXPIRY_OPTIONS[0]?.days ?? 7;
  const [expiryDays, setExpiryDays] = useState<number | null>(defaultExpiry);
  const [pendingRevokeId, setPendingRevokeId] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    const invite = await createInvite(expiryDays);
    if (invite) showToast('초대를 만들었어요.', 'success');
  }, [createInvite, expiryDays, showToast]);

  const handleCopy = useCallback(
    async (text: string, label: string) => {
      try {
        await navigator.clipboard.writeText(text);
        showToast(`${label} 복사했어요`, 'success');
      } catch {
        showToast('복사에 실패했어요. 직접 선택해 복사해주세요.', 'error');
      }
    },
    [showToast],
  );

  const handleRevokeConfirm = useCallback(
    async (inviteId: string) => {
      await revokeInvite(inviteId);
      setPendingRevokeId(null);
    },
    [revokeInvite],
  );

  return (
    <div className="space-y-6">
      {/* 발급 폼 */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-sp-border bg-sp-card p-4">
        <div>
          <p className="mb-1.5 text-xs text-sp-muted">유효 기간</p>
          <div className="flex gap-1.5">
            {STAFFROOM_INVITE_EXPIRY_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => setExpiryDays(opt.days)}
                className={`rounded-lg px-3 py-1.5 text-sm font-sp-medium transition-colors ${
                  expiryDays === opt.days
                    ? 'bg-sp-accent text-white'
                    : 'border border-sp-border text-sp-muted hover:text-sp-text'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={isLoading}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-sp-accent px-4 py-2 text-sm font-sp-semibold text-white transition-all duration-sp-base ease-sp-out active:scale-95 disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-icon">add_link</span>
          초대 만들기
        </button>
      </div>

      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-sp-muted">
        <span className="material-symbols-outlined text-icon-sm shrink-0">info</span>
        링크와 코드는 초대장일 뿐이에요. 실제 입장은 상대방의 구글 로그인으로 다시 확인해요.
      </p>

      {/* 발급된 초대 목록 */}
      {invites.length === 0 ? (
        <p className="rounded-xl border border-dashed border-sp-border px-4 py-10 text-center text-sm text-sp-muted">
          아직 발급한 초대가 없어요. 위에서 초대를 만들어보세요.
        </p>
      ) : (
        <div className="space-y-3">
          {invites.map((invite) => {
            const live = isInviteLive(invite);
            const link = inviteLink(invite.code);
            const isConfirming = pendingRevokeId === invite.id;

            return (
              <div
                key={invite.id}
                className={`flex flex-wrap items-center gap-4 rounded-xl border border-sp-border bg-sp-card p-4 ${
                  live ? '' : 'opacity-50'
                }`}
              >
                <InviteQRCode value={link} />

                <div className="min-w-[200px] flex-1">
                  <p className="font-mono text-2xl font-bold tracking-[0.35em] text-sp-text">
                    {invite.code}
                  </p>
                  <p className="mt-1 truncate text-xs text-sp-muted">{link}</p>
                  <p className="mt-1.5 text-xs text-sp-muted tabular-nums">
                    {formatInviteStatus(invite)} · {invite.useCount}
                    {invite.maxUses !== null ? `/${invite.maxUses}` : ''}명 참여
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleCopy(invite.code, '코드를')}
                    disabled={!live}
                    className="flex items-center gap-1 rounded-lg border border-sp-border px-2.5 py-1.5 text-xs font-sp-medium text-sp-muted transition-colors hover:text-sp-text disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined text-icon-sm">content_copy</span>
                    코드
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopy(link, '링크를')}
                    disabled={!live}
                    className="flex items-center gap-1 rounded-lg border border-sp-border px-2.5 py-1.5 text-xs font-sp-medium text-sp-muted transition-colors hover:text-sp-text disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined text-icon-sm">link</span>
                    링크
                  </button>

                  {live &&
                    (isConfirming ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-sp-muted">해지할까요?</span>
                        <button
                          type="button"
                          onClick={() => void handleRevokeConfirm(invite.id)}
                          className="rounded-lg bg-red-500 px-2.5 py-1.5 text-xs font-sp-semibold text-white transition-colors hover:bg-red-600"
                        >
                          확인
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingRevokeId(null)}
                          className="rounded-lg border border-sp-border px-2.5 py-1.5 text-xs text-sp-muted transition-colors hover:text-sp-text"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPendingRevokeId(invite.id)}
                        className="rounded-lg border border-sp-border px-2.5 py-1.5 text-xs font-sp-medium text-red-400 transition-colors hover:bg-red-500/10"
                      >
                        해지
                      </button>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
