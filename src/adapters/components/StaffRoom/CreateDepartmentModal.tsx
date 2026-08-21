/**
 * 온라인 교무실 — 부서 만들기 모달 (M1)
 *
 * 이름(필수) + 한 줄 소개(선택)만 받는다. 배너 꾸미기는 M4 범위라 여기 없다.
 */
import { useEffect, useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { useStaffRoomStore } from '@adapters/stores/useStaffRoomStore';
import {
  STAFFROOM_DESCRIPTION_MAX_LENGTH,
  STAFFROOM_NAME_MAX_LENGTH,
} from '@domain/entities/StaffRoom';

interface CreateDepartmentModalProps {
  onClose: () => void;
}

export function CreateDepartmentModal({ onClose }: CreateDepartmentModalProps) {
  const createDepartment = useStaffRoomStore((s) => s.createDepartment);
  const isLoading = useStaffRoomStore((s) => s.isLoading);
  const error = useStaffRoomStore((s) => s.error);
  const clearError = useStaffRoomStore((s) => s.clearError);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && !submitting;

  // 앞선 화면에서 남은 오류가 이 모달을 열자마자 뜨면 엉뚱한 안내가 된다
  useEffect(() => {
    clearError();
  }, [clearError]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const department = await createDepartment(name, description);
    setSubmitting(false);
    if (department) onClose();
  };

  return (
    <Modal isOpen onClose={onClose} title="부서 만들기" size="sm">
      <div className="flex flex-col gap-4 px-6 pb-6 pt-2">
        <div>
          <label
            htmlFor="staffroom-dept-name"
            className="mb-1.5 block text-sm font-sp-medium text-sp-text"
          >
            부서 이름
          </label>
          <input
            id="staffroom-dept-name"
            type="text"
            value={name}
            onChange={(e) => {
              if (e.target.value.length <= STAFFROOM_NAME_MAX_LENGTH) setName(e.target.value);
            }}
            placeholder="예: 2학년부, 정보부"
            autoFocus
            className="w-full rounded-lg border border-sp-border bg-sp-bg px-3.5 py-2.5 text-sm text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none"
          />
          <p className="mt-1 text-right text-xs text-sp-muted tabular-nums">
            {name.length}/{STAFFROOM_NAME_MAX_LENGTH}
          </p>
        </div>

        <div>
          <label
            htmlFor="staffroom-dept-desc"
            className="mb-1.5 block text-sm font-sp-medium text-sp-text"
          >
            한 줄 소개 <span className="font-normal text-sp-muted">(선택)</span>
          </label>
          <input
            id="staffroom-dept-desc"
            type="text"
            value={description}
            onChange={(e) => {
              if (e.target.value.length <= STAFFROOM_DESCRIPTION_MAX_LENGTH) {
                setDescription(e.target.value);
              }
            }}
            placeholder="이 부서를 한 줄로 소개해주세요"
            className="w-full rounded-lg border border-sp-border bg-sp-bg px-3.5 py-2.5 text-sm text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none"
          />
          <p className="mt-1 text-right text-xs text-sp-muted tabular-nums">
            {description.length}/{STAFFROOM_DESCRIPTION_MAX_LENGTH}
          </p>
        </div>

        {error && (
          <p className="flex items-start gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs leading-relaxed text-sp-text">
            <span className="material-symbols-outlined text-icon-sm shrink-0 text-red-400">
              error
            </span>
            {error}
          </p>
        )}

        <div className="mt-2 flex justify-end gap-2">
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
            {submitting || isLoading ? '만드는 중…' : '만들기'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
