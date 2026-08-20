/**
 * 진도 여러 건을 지우기 전 확인 창.
 *
 * ## 왜 개수만 보여주면 안 되나
 *
 * 진도 목록에는 성격이 전혀 다른 두 가지가 섞여 있다.
 *
 * - **'예정'** — 계획을 깔아 둔 빈 칸. 잘못 만들었으면 지우는 게 정상이고, 지워도 잃는 게 없다.
 * - **'완료'·'미실시'** — **실제로 한 수업의 기록**이다. 지우면 그날 무엇을 했는지가 사라지고,
 *   되돌릴 방법이 없다.
 *
 * "35건을 지울까요?"만 물으면 이 둘이 구분되지 않는다. 계획을 정리하려다 학기 내내 적어 둔
 * 기록을 함께 날리는 일이 벌어진다. 그래서 **상태별로 나눠 보여주고, 실제 기록이 섞여 있으면
 * 그 사실을 눈에 띄게 말한다.**
 *
 * 되돌리기는 없다(파일에서 지워진다). 그래서 확인 단계가 유일한 방어선이다.
 */

import { useMemo } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import type { ProgressEntry, ProgressStatus } from '@domain/entities/CurriculumProgress';

interface ProgressBulkDeleteConfirmProps {
  readonly entries: readonly ProgressEntry[];
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly busy?: boolean;
}

const STATUS_LABEL: Record<ProgressStatus, string> = {
  planned: '예정',
  completed: '완료',
  skipped: '미실시',
};

/** 실제로 한 수업의 기록 — 지우면 되돌릴 수 없다. */
const RECORD_STATUSES: readonly ProgressStatus[] = ['completed', 'skipped'];

export function ProgressBulkDeleteConfirm({
  entries,
  onCancel,
  onConfirm,
  busy = false,
}: ProgressBulkDeleteConfirmProps) {
  const counts = useMemo(() => {
    const map: Record<ProgressStatus, number> = { planned: 0, completed: 0, skipped: 0 };
    for (const e of entries) map[e.status] += 1;
    return map;
  }, [entries]);

  const recordCount = RECORD_STATUSES.reduce((sum, s) => sum + counts[s], 0);
  const dateRange = useMemo(() => {
    if (entries.length === 0) return null;
    const dates = entries.map((e) => e.date).sort();
    return { first: dates[0]!, last: dates[dates.length - 1]! };
  }, [entries]);

  return (
    <Modal isOpen onClose={onCancel} title="진도 삭제 확인" size="sm" srOnlyTitle>
      <div className="p-6">
        <h2 className="text-lg font-bold text-sp-text">
          진도 <span className="tabular-nums">{entries.length}</span>건을 지울까요?
        </h2>

        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-sp-muted">
          {(Object.keys(STATUS_LABEL) as ProgressStatus[])
            .filter((s) => counts[s] > 0)
            .map((s) => (
              <span key={s}>
                {STATUS_LABEL[s]}{' '}
                <b className="font-semibold text-sp-text tabular-nums">{counts[s]}</b>
              </span>
            ))}
        </div>

        {dateRange !== null && (
          <p className="mt-1 text-xs text-sp-muted tabular-nums">
            {dateRange.first === dateRange.last
              ? dateRange.first
              : `${dateRange.first} ~ ${dateRange.last}`}
          </p>
        )}

        {recordCount > 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-sp-border px-3 py-2.5">
            <p className="flex items-start gap-1.5 text-sm leading-relaxed text-sp-text">
              <span aria-hidden className="material-symbols-outlined text-base text-sp-accent">
                warning
              </span>
              <span>
                <b className="font-semibold">실제로 하신 수업 기록 {recordCount}건</b>이 함께
                지워져요. 그날 무엇을 했는지가 사라지고 되돌릴 수 없어요.
              </span>
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm leading-relaxed text-sp-muted">
            모두 &lsquo;예정&rsquo; 칸이라 지워도 기록은 사라지지 않아요.
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-sp-border px-4 py-2 text-sm font-sp-medium text-sp-muted transition-all duration-sp-base ease-sp-out hover:text-sp-text active:scale-95"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || entries.length === 0}
            className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-all duration-sp-base ease-sp-out hover:brightness-110 active:scale-95 disabled:opacity-40"
          >
            {busy ? '지우는 중…' : `${entries.length}건 지우기`}
          </button>
        </div>

        <p className="mt-3 text-xs text-sp-muted">
          되돌리기는 없어요. 지운 뒤에는 복구할 수 없어요.
        </p>
      </div>
    </Modal>
  );
}
