/**
 * 온라인 교무실 — 제출 과제 안 낸 분 명단 (066)
 *
 * 만든이·관리자만 연다 — `SubmissionView` 가 이미 `canSeeUnsubmittedList` 로 걸러
 * 이 모달을 열 수 있는 사람에게만 단추를 보여준다.
 *
 * 세 구역으로 나눠 그린다:
 *  - `pending` 안 낸 분 — 진행률 분모에 든다.
 *  - `done` 낸 분 — 취합자가 실수로 켠 칸을 되돌릴 수 있어야 해서 보여준다.
 *  - `excluded` 부서를 나간 분 — 분모에서 빠진다. 왜 빠졌는지 안 보이면
 *    진행률 숫자가 갑자기 줄어든 것처럼 보인다.
 *
 * 이름이 없는 사람(구글이 이름을 안 줘서 본인이 아직 안 정한 경우)은
 * "이름 없는 선생님"으로 그린다 — 그 자리에 지메일을 그대로 보여주는
 * `displayNameOf` 와는 다르게, 이 화면은 지메일을 이름 아래 따로 보여준다.
 */
import { useEffect, useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { useStaffRoomSubmissionStore } from '@adapters/stores/useStaffRoomSubmissionStore';
import type {
  StaffRoomSubmission,
  StaffRoomSubmissionTarget,
} from '@domain/entities/StaffRoomSubmission';

interface UnsubmittedModalProps {
  departmentId: string;
  submission: StaffRoomSubmission;
  onClose: () => void;
}

/** 화면에 보일 이름 — 아무도 안 정했으면 지메일이 아니라 이렇게 그린다 */
function targetLabel(target: StaffRoomSubmissionTarget): string {
  const name = target.name?.trim();
  return name && name.length > 0 ? name : '이름 없는 선생님';
}

function TargetRow({
  target,
  action,
  muted = false,
  icon = 'person',
}: {
  target: StaffRoomSubmissionTarget;
  /** 없으면 단추 없이 이름·지메일만 그린다 (나간 분 구역) */
  action?: {
    readonly label: string;
    readonly icon: string;
    readonly busy: boolean;
    readonly onClick: () => void;
  };
  muted?: boolean;
  icon?: string;
}) {
  return (
    <li className="flex items-center gap-3 px-1 py-2">
      <span
        className={`material-symbols-outlined shrink-0 text-icon-sm ${muted ? 'text-sp-muted' : 'text-sp-text'}`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-sp-medium ${muted ? 'text-sp-muted' : 'text-sp-text'}`}
        >
          {targetLabel(target)}
        </p>
        <p className="truncate text-xs text-sp-muted">{target.email}</p>
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          disabled={action.busy}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-sp-border px-2.5 py-1.5 text-xs font-sp-medium text-sp-text transition-colors hover:bg-sp-surface disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-icon-sm">{action.icon}</span>
          {action.label}
        </button>
      )}
    </li>
  );
}

export function UnsubmittedModal({ departmentId, submission, onClose }: UnsubmittedModalProps) {
  const targets = useStaffRoomSubmissionStore((s) => s.targets);
  const error = useStaffRoomSubmissionStore((s) => s.error);
  const loadTargets = useStaffRoomSubmissionStore((s) => s.loadTargets);
  const clearTargets = useStaffRoomSubmissionStore((s) => s.clearTargets);
  const toggleDone = useStaffRoomSubmissionStore((s) => s.toggleDone);

  const [loading, setLoading] = useState(true);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void loadTargets(departmentId, submission.id).then(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
      clearTargets();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, submission.id]);

  const handleToggle = async (email: string, done: boolean) => {
    setBusyEmail(email);
    await toggleDone(departmentId, submission.id, done, email);
    setBusyEmail(null);
  };

  return (
    <Modal isOpen onClose={onClose} title={`"${submission.title}" 제출 현황`} size="md">
      <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto px-6 pb-6 pt-2">
        {loading && <p className="py-8 text-center text-sm text-sp-muted">불러오는 중…</p>}

        {!loading && !targets && (
          <p className="py-8 text-center text-sm text-sp-error">
            {error ?? '명단을 불러오지 못했습니다.'}
          </p>
        )}

        {!loading && targets && (
          <>
            <section>
              <h3 className="text-sm font-sp-semibold text-sp-text">
                안 낸 분 {targets.pending.length}명
              </h3>
              {targets.pending.length === 0 ? (
                <p className="mt-2 text-xs text-sp-muted">모두 냈습니다.</p>
              ) : (
                <ul className="mt-1 divide-y divide-sp-border">
                  {targets.pending.map((t) => (
                    <TargetRow
                      key={t.email}
                      target={t}
                      action={{
                        label: '냈음으로 표시',
                        icon: 'check',
                        busy: busyEmail === t.email,
                        onClick: () => void handleToggle(t.email, true),
                      }}
                    />
                  ))}
                </ul>
              )}
            </section>

            {targets.done.length > 0 && (
              <section>
                <h3 className="text-sm font-sp-semibold text-sp-text">
                  낸 분 {targets.done.length}명
                </h3>
                <p className="mt-0.5 text-xs text-sp-muted">
                  잘못 눌렀다면 여기서 되돌릴 수 있습니다.
                </p>
                <ul className="mt-1 divide-y divide-sp-border">
                  {targets.done.map((t) => (
                    <TargetRow
                      key={t.email}
                      target={t}
                      action={{
                        label: '되돌리기',
                        icon: 'undo',
                        busy: busyEmail === t.email,
                        onClick: () => void handleToggle(t.email, false),
                      }}
                    />
                  ))}
                </ul>
              </section>
            )}

            {targets.excluded.length > 0 && (
              <section>
                <h3 className="text-sm font-sp-semibold text-sp-muted">
                  부서를 나간 분 {targets.excluded.length}명
                </h3>
                <p className="mt-0.5 text-xs leading-relaxed text-sp-muted">
                  진행률 계산에서는 빠집니다.
                </p>
                <ul className="mt-1 divide-y divide-sp-border">
                  {targets.excluded.map((t) => (
                    <TargetRow key={t.email} target={t} muted icon="person_off" />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
