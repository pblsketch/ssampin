/**
 * 남은 수업일에 **'예정' 진도를 한 번에 깔아 두는** 창.
 *
 * 학기 계획을 세울 때 선생님이 하는 일은 "언제 수업이 있는지 세어서 그 칸을 만드는 것"과
 * "각 칸에 무엇을 할지 적는 것" 두 가지다. 앞쪽은 앱이 이미 알고 있으므로 대신 만들고,
 * 선생님은 뒤쪽만 채우면 된다.
 *
 * ## 대량 생성이라 안전장치를 넷 건다
 *
 * 1. **미리보기 없이는 한 건도 만들지 않는다.** 무엇이 만들어질지 전부 보여주고 확인을 받는다.
 * 2. **이미 있는 자리는 건너뛴다.** 같은 (날짜, 교시)에 기록이 있으면 만들지 않고, 몇 건을
 *    건너뛰었는지 알려준다. 안 그러면 두 번 누른 선생님의 진도표가 두 배가 된다.
 * 3. **되돌리기.** 방금 만든 항목의 id를 화면이 들고 있다가 한 번에 지운다. 엔티티에 배치
 *    표시를 새로 넣지 않는다 — 되돌리기 하나 때문에 저장 스키마를 늘리면 그 필드는 영원히 남는다.
 * 4. **한 번에 60건까지.** 주 4회 × 15주 = 60. 한 학기 한 반을 겨우 덮는 수치이고, 그보다
 *    많이 만들려는 건 대개 기간을 잘못 잡은 것이다.
 *
 * **지난 날짜에는 만들지 않는다.** 이미 지나간 수업에 '예정'을 세우는 건 계획이 아니라 잡음이다.
 */

import { useMemo, useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { resolvePeriodLabel } from '@domain/rules/periodLabel';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import type { ProgressEntry } from '@domain/entities/CurriculumProgress';
import type { LessonCountView } from '@adapters/hooks/useLessonCountEstimate';

/** 한 번에 만들 수 있는 최대 건수. */
export const BULK_FILL_MAX = 60;

export interface BulkFillTarget {
  readonly date: string;
  readonly period: number;
}

interface PlannedBulkFillModalProps {
  readonly view: LessonCountView;
  readonly existingEntries: readonly ProgressEntry[];
  readonly todayIso: string;
  readonly periodTimes?: readonly PeriodTime[];
  readonly onClose: () => void;
  /** 실제 생성 — 만들어진 항목들을 돌려준다(되돌리기용). */
  readonly onCreate: (
    targets: readonly BulkFillTarget[],
    unit: string,
  ) => Promise<readonly ProgressEntry[]>;
  readonly onUndo: (ids: readonly string[]) => Promise<void>;
}

export interface BulkFillPlan {
  readonly targets: readonly BulkFillTarget[];
  /** 이미 기록이 있어 건너뛴 자리 수. */
  readonly skipped: number;
}

/**
 * 만들 자리와 건너뛸 자리를 가른다 — 렌더 없이 검증할 수 있도록 컴포넌트 밖에 둔다.
 *
 * 규칙 두 가지:
 *  - **지난 날짜는 만들지 않는다.** 이미 지나간 수업에 '예정'을 세우는 건 계획이 아니라 잡음이다.
 *  - **같은 (날짜, 교시)에 기록이 있으면 건너뛴다.** 두 번 눌러도 진도표가 두 배가 되지 않는다.
 */
export function computeBulkFillTargets(
  lessonDays: readonly { date: string; periods: readonly number[] }[],
  existingEntries: readonly Pick<ProgressEntry, 'date' | 'period'>[],
  todayIso: string,
): BulkFillPlan {
  const taken = new Set(existingEntries.map((e) => `${e.date}|${e.period}`));
  const targets: BulkFillTarget[] = [];
  let skipped = 0;
  for (const day of lessonDays) {
    if (day.date <= todayIso) continue;
    for (const period of day.periods) {
      if (taken.has(`${day.date}|${period}`)) {
        skipped += 1;
        continue;
      }
      targets.push({ date: day.date, period });
    }
  }
  return { targets, skipped };
}

/** '2026-09-07' → '9/7' */
function shortDate(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso);
  return m === null ? iso : `${Number(m[1])}/${Number(m[2])}`;
}

export function PlannedBulkFillModal({
  view,
  existingEntries,
  todayIso,
  periodTimes,
  onClose,
  onCreate,
  onUndo,
}: PlannedBulkFillModalProps) {
  const [unit, setUnit] = useState('');
  const [busy, setBusy] = useState(false);
  const [createdIds, setCreatedIds] = useState<readonly string[] | null>(null);

  const { targets, skipped } = useMemo(
    () => computeBulkFillTargets(view.lessonDays, existingEntries, todayIso),
    [view.lessonDays, existingEntries, todayIso],
  );

  const overLimit = targets.length > BULK_FILL_MAX;

  const handleCreate = async () => {
    if (overLimit || targets.length === 0) return;
    setBusy(true);
    try {
      const created = await onCreate(targets, unit.trim());
      setCreatedIds(created.map((e) => e.id));
    } finally {
      setBusy(false);
    }
  };

  const handleUndo = async () => {
    if (createdIds === null) return;
    setBusy(true);
    try {
      await onUndo(createdIds);
      setCreatedIds(null);
    } finally {
      setBusy(false);
    }
  };

  // ── 생성 완료 화면 ──
  if (createdIds !== null) {
    return (
      <Modal isOpen onClose={onClose} title="진도 계획 만들기" size="sm" srOnlyTitle>
        <div className="p-6">
          <h2 className="text-lg font-bold text-sp-text">
            {createdIds.length}개의 수업 칸을 만들었어요
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-sp-muted">
            각 칸에 무엇을 할지 적어 주시면 돼요. 잘못 만들었다면 지금 한 번에 되돌릴 수 있어요.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-semibold text-sp-accent-fg transition-all duration-sp-base ease-sp-out hover:brightness-110 active:scale-95"
            >
              확인
            </button>
            <button
              type="button"
              onClick={() => void handleUndo()}
              disabled={busy}
              className="rounded-lg border border-sp-border px-4 py-2 text-sm font-sp-medium text-sp-muted transition-all duration-sp-base ease-sp-out hover:text-sp-text active:scale-95 disabled:opacity-40"
            >
              {busy ? '되돌리는 중…' : '되돌리기'}
            </button>
          </div>
          <p className="mt-3 text-xs text-sp-muted">
            창을 닫으면 되돌리기는 사라져요. 그 뒤에는 항목을 하나씩 지우셔야 해요.
          </p>
        </div>
      </Modal>
    );
  }

  // ── 미리보기 화면 ──
  return (
    <Modal isOpen onClose={onClose} title="진도 계획 만들기" size="md" srOnlyTitle>
      <div className="p-6">
        <h2 className="text-lg font-bold text-sp-text">남은 수업일에 계획을 깔아 둘까요?</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-sp-muted">
          오늘 이후 수업일마다 &lsquo;예정&rsquo; 칸을 만들어 둬요. 무엇을 할지는 나중에 채우시면
          돼요.
        </p>

        <div className="mt-4">
          <label htmlFor="bulk-fill-unit" className="mb-1 block text-xs text-sp-muted">
            단원 (선택 — 전부 같은 값으로 채워요)
          </label>
          <input
            id="bulk-fill-unit"
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="예: 2단원 - 현대시"
            className="w-full rounded-lg border border-sp-border bg-sp-card px-3 py-1.5 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="text-sp-text">
            만들 칸 <b className="font-semibold tabular-nums">{targets.length}</b>개
          </span>
          {skipped > 0 && (
            <span className="text-sp-muted">
              이미 있는 <b className="font-semibold tabular-nums">{skipped}</b>개는 건너뛰어요
            </span>
          )}
        </div>

        {overLimit && (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-dashed border-sp-border px-3 py-2 text-xs leading-relaxed text-sp-muted">
            <span aria-hidden className="material-symbols-outlined text-sm">
              info
            </span>
            <span>
              한 번에 {BULK_FILL_MAX}개까지 만들 수 있어요. 지금은 {targets.length}개라 학기 마지막
              수업일을 다시 확인해 주세요.
            </span>
          </p>
        )}

        {targets.length === 0 && (
          <p className="mt-2 rounded-lg border border-dashed border-sp-border px-3 py-2 text-xs text-sp-muted">
            만들 칸이 없어요. 남은 수업일이 없거나, 이미 모두 적어 두셨어요.
          </p>
        )}

        {targets.length > 0 && (
          <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-sp-border p-2">
            <ul className="flex flex-wrap gap-1">
              {targets.map((t) => (
                <li
                  key={`${t.date}|${t.period}`}
                  className="rounded-lg border border-sp-border px-1.5 py-0.5 text-[11px] text-sp-muted tabular-nums"
                >
                  {shortDate(t.date)} {resolvePeriodLabel(t.period, periodTimes)}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-sp-border px-4 py-2 text-sm font-sp-medium text-sp-muted transition-all duration-sp-base ease-sp-out hover:text-sp-text active:scale-95"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={busy || overLimit || targets.length === 0}
            className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-semibold text-sp-accent-fg transition-all duration-sp-base ease-sp-out hover:brightness-110 active:scale-95 disabled:opacity-40"
          >
            {busy ? '만드는 중…' : `${targets.length}개 만들기`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
