/**
 * 온라인 교무실 — 부서에서 쓸 이름 정하기 (M2)
 *
 * 쌤핀은 이메일 권한만 받고 `profile` 권한을 요청하지 않아서, 구글이 이름을 주지
 * 않는다. 그래서 지금은 지메일 주소가 그대로 보인다 — 이 모달은 그걸 "3학년부
 * 김철수"처럼 학교에서 쓰는 이름으로 바꿀 수 있다고 안내한다.
 *
 * [나중에]를 누르면 다시 조르지 않는다. `localStorage`에 부서별로 한 번 넘긴
 * 기록을 남긴다 — 매번 부서를 열 때마다 뜨면 그 자체가 방해가 된다.
 */
import { useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { useStaffRoomStore } from '@adapters/stores/useStaffRoomStore';
import { checkDisplayName } from '@domain/rules/staffRoomBoardPermission';
import { STAFFROOM_DISPLAY_NAME_MAX_LENGTH } from '@domain/entities/StaffRoomBoard';

interface MyNameModalProps {
  departmentId: string;
  onClose: () => void;
}

function skipNamePromptKey(departmentId: string): string {
  return `ssampin:staffroom:name-prompt-skipped:${departmentId}`;
}

/** [나중에]로 넘긴 적이 있는 부서인지 — DepartmentDetail 이 모달을 다시 띄울지 판단할 때 쓴다 */
export function hasSkippedNamePrompt(departmentId: string): boolean {
  try {
    return localStorage.getItem(skipNamePromptKey(departmentId)) === '1';
  } catch {
    // 저장소를 못 읽어도(사생활 보호 모드 등) 화면은 그냥 동작해야 한다
    return false;
  }
}

export function MyNameModal({ departmentId, onClose }: MyNameModalProps) {
  const setMyName = useStaffRoomStore((s) => s.setMyName);
  const isLoading = useStaffRoomStore((s) => s.isLoading);
  const [name, setName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSkip = () => {
    try {
      localStorage.setItem(skipNamePromptKey(departmentId), '1');
    } catch {
      // 이번 세션에서만 다시 못 물어보는 정도라 조용히 넘어간다
    }
    onClose();
  };

  const handleSubmit = async () => {
    const check = checkDisplayName(name);
    if (!check.ok) {
      setLocalError(check.message);
      return;
    }
    setLocalError(null);
    setSubmitting(true);
    const ok = await setMyName(check.value);
    setSubmitting(false);
    if (ok) onClose();
  };

  return (
    <Modal isOpen onClose={handleSkip} title="이 부서에서 쓸 이름" size="sm">
      <div className="flex flex-col gap-4 px-6 pb-6 pt-2">
        <p className="flex items-start gap-1.5 rounded-lg bg-sp-surface px-3 py-2.5 text-xs leading-relaxed text-sp-muted">
          <span className="material-symbols-outlined text-icon-sm shrink-0">info</span>
          구글이 이름을 알려주지 않아서 지금은 지메일 주소가 그대로 보여요. &quot;3학년부
          김철수&quot;처럼 학교에서 쓰는 이름을 정해두면 게시판에서 훨씬 알아보기 쉬워요.
        </p>

        <div>
          <label
            htmlFor="staffroom-my-name"
            className="mb-1.5 block text-sm font-sp-medium text-sp-text"
          >
            표시 이름
          </label>
          <input
            id="staffroom-my-name"
            type="text"
            value={name}
            onChange={(e) => {
              if (e.target.value.length <= STAFFROOM_DISPLAY_NAME_MAX_LENGTH)
                setName(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSubmit();
            }}
            placeholder="예: 3학년부 김철수"
            autoFocus
            className="w-full rounded-lg border border-sp-border bg-sp-bg px-3.5 py-2.5 text-sm text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none"
          />
          <p className="mt-1 text-right text-xs text-sp-muted tabular-nums">
            {name.length}/{STAFFROOM_DISPLAY_NAME_MAX_LENGTH}
          </p>
        </div>

        {localError && (
          <p className="flex items-start gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs leading-relaxed text-sp-text">
            <span className="material-symbols-outlined text-icon-sm shrink-0 text-red-400">
              error
            </span>
            {localError}
          </p>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={handleSkip}
            className="rounded-lg border border-sp-border px-4 py-2 text-sm font-sp-medium text-sp-muted transition-colors hover:text-sp-text"
          >
            나중에
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-sp-semibold text-white transition-all duration-sp-base ease-sp-out active:scale-95 disabled:opacity-40"
          >
            {submitting || isLoading ? '저장하는 중…' : '정하기'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
