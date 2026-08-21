/**
 * 온라인 교무실 — 초대 코드로 참여 모달 (M1)
 *
 * 코드는 초대장일 뿐이다(§7). 입력 형식이 맞아도 실제 입장은 구글 로그인으로
 * 확인한 지메일이 있어야 하므로, 그 사실을 화면에 항상 함께 보여준다.
 */
import { useEffect, useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { useStaffRoomStore } from '@adapters/stores/useStaffRoomStore';
import { isInviteCode, normalizeInviteCode } from '@domain/valueObjects/StaffRoomInviteCode';

interface JoinByCodeModalProps {
  onClose: () => void;
}

export function JoinByCodeModal({ onClose }: JoinByCodeModalProps) {
  const joinByCode = useStaffRoomStore((s) => s.joinByCode);
  const isLoading = useStaffRoomStore((s) => s.isLoading);
  const error = useStaffRoomStore((s) => s.error);
  const clearError = useStaffRoomStore((s) => s.clearError);
  const [rawCode, setRawCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const normalized = normalizeInviteCode(rawCode);
  const isValid = isInviteCode(normalized);
  const showFormatHint = normalized.length > 0 && !isValid;
  const canSubmit = isValid && !submitting;

  // 앞선 화면에서 남은 오류가 이 모달을 열자마자 뜨면 엉뚱한 안내가 된다
  useEffect(() => {
    clearError();
  }, [clearError]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const ok = await joinByCode(normalized);
    setSubmitting(false);
    if (ok) onClose();
  };

  return (
    <Modal isOpen onClose={onClose} title="초대 코드로 참여" size="sm">
      <div className="flex flex-col gap-4 px-6 pb-6 pt-2">
        <div>
          <label
            htmlFor="staffroom-invite-code"
            className="mb-1.5 block text-sm font-sp-medium text-sp-text"
          >
            초대 코드
          </label>
          <input
            id="staffroom-invite-code"
            type="text"
            value={rawCode}
            onChange={(e) => setRawCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSubmit();
            }}
            placeholder="예: 3F7KQD"
            autoFocus
            maxLength={12}
            className="w-full rounded-lg border border-sp-border bg-sp-bg px-3.5 py-3 text-center font-mono text-xl font-bold tracking-[0.3em] text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none"
          />
          {showFormatHint && (
            <p className="mt-1.5 text-xs text-amber-400">초대 코드는 영문·숫자 6자리입니다.</p>
          )}
        </div>

        {error && (
          <p className="flex items-start gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs leading-relaxed text-sp-text">
            <span className="material-symbols-outlined text-icon-sm shrink-0 text-red-400">
              error
            </span>
            {error}
          </p>
        )}
        <p className="flex items-start gap-1.5 rounded-lg bg-sp-surface px-3 py-2.5 text-xs leading-relaxed text-sp-muted">
          <span className="material-symbols-outlined text-icon-sm shrink-0">verified_user</span>
          코드를 넣으면 구글 계정으로 본인 확인을 합니다. 코드만으로 바로 들어가지는 않아요.
        </p>

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-sp-border px-4 py-2 text-sm font-sp-medium text-sp-muted transition-colors hover:text-sp-text"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-sp-semibold text-white transition-all duration-sp-base ease-sp-out active:scale-95 disabled:opacity-40"
          >
            {submitting || isLoading ? '확인하는 중…' : '참여하기'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
