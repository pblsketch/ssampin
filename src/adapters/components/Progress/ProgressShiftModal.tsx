/**
 * 진도 **밀기** 확인 창 — "이 차시부터 뒤로 한 칸씩".
 *
 * 한 시간을 못 나가면 그 뒤가 통째로 밀린다. 끌어다 놓기로 하면 스무 번을 끌어야 하고
 * 뒤에서부터 끌지 않으면 자리가 겹치므로, 한 번에 미는 길을 따로 둔다.
 *
 * ## 대량 변경이라 안전장치를 셋 건다
 *
 * 1. **미리보기 없이는 한 건도 바꾸지 않는다.** 어느 차시가 어디로 가는지 전부 보여주고
 *    확인을 받는다(계획 일괄 생성 `PlannedBulkFillModal` 이 쓰는 관례 그대로).
 * 2. **밀려나는 건을 숨기지 않는다.** 학기 밖으로 나가는 차시는 옮기지 않고, 몇 건인지
 *    눈에 띄게 알린다. 조용히 버리면 선생님은 사라진 줄도 모른다.
 * 3. **되돌리기.** 원본을 화면이 들고 있다가 한 번에 되돌린다. 밀기는 만들거나 지우지
 *    않고 날짜·교시만 바꾸므로 원본을 그대로 다시 저장하면 끝이다.
 *
 * 계산은 전부 도메인 순수 함수(`planProgressShift`)가 한다 — 이 창은 그 결과를 그리고
 * 확인을 받는 일만 한다.
 */

import { useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { resolvePeriodLabel } from '@domain/rules/periodLabel';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import type { ProgressEntry } from '@domain/entities/CurriculumProgress';
import type { ProgressShiftPlan } from '@domain/rules/progressShift';

export interface ProgressShiftModalProps {
  /** 도메인이 계산한 밀기 계획 */
  plan: ProgressShiftPlan;
  /** "1-7 · 공국2" 같은 반 이름 */
  className: string;
  periodTimes?: readonly PeriodTime[];
  /** 확인 — 저장할 항목들을 넘긴다 */
  onConfirm: (moved: readonly ProgressEntry[]) => Promise<void>;
  /** 되돌리기 — 원본 항목들을 넘긴다 */
  onUndo: (originals: readonly ProgressEntry[]) => Promise<void>;
  onClose: () => void;
}

/** '2026-08-17' → '8/17' */
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

export function ProgressShiftModal({
  plan,
  className,
  periodTimes,
  onConfirm,
  onUndo,
  onClose,
}: ProgressShiftModalProps) {
  const [busy, setBusy] = useState(false);
  /** null 이면 아직 미리보기 단계. 채워지면 이미 민 뒤(되돌리기 가능). */
  const [originals, setOriginals] = useState<readonly ProgressEntry[] | null>(null);

  const movable = plan.moved.length;

  const handleConfirm = async () => {
    if (movable === 0) return;
    setBusy(true);
    try {
      // 되돌리기용 원본은 바꾸기 전에 붙잡아 둔다
      const snapshot = plan.rows.filter((r) => r.to !== null).map((r) => r.entry);
      await onConfirm(plan.moved);
      setOriginals(snapshot);
    } finally {
      setBusy(false);
    }
  };

  const handleUndo = async () => {
    if (originals === null) return;
    setBusy(true);
    try {
      await onUndo(originals);
      setOriginals(null);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  // ── 민 뒤 화면 ──
  if (originals !== null) {
    return (
      <Modal isOpen onClose={onClose} title="진도 밀기" size="sm" srOnlyTitle>
        <div className="p-6">
          <h2 className="text-lg font-bold text-sp-text">{originals.length}개 차시를 밀었어요</h2>
          <p className="mt-2 text-sm leading-relaxed text-sp-muted">
            잘못 밀었다면 지금 한 번에 되돌릴 수 있어요.
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
            창을 닫으면 되돌리기는 사라져요. 그 뒤에는 차시를 하나씩 옮기셔야 해요.
          </p>
        </div>
      </Modal>
    );
  }

  // ── 미리보기 화면 ──
  return (
    <Modal isOpen onClose={onClose} title="진도 밀기" size="md" srOnlyTitle>
      <div className="p-6">
        <h2 className="text-lg font-bold text-sp-text">이 차시부터 뒤로 한 칸씩 밀까요?</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-sp-muted">
          <b className="font-semibold text-sp-text">{className}</b>의 &lsquo;예정&rsquo; 차시가 각각
          다음 수업일로 옮겨져요. 이미 <b className="font-semibold text-sp-text">완료</b>·
          <b className="font-semibold text-sp-text">미실시</b>로 적어 둔 차시는 그날 있었던 일의
          기록이라 그대로 둬요.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="text-sp-text">
            옮길 차시 <b className="font-semibold tabular-nums">{movable}</b>개
          </span>
          {plan.overflowCount > 0 && (
            <span className="text-sp-muted">
              학기 밖으로 <b className="font-semibold tabular-nums">{plan.overflowCount}</b>개
            </span>
          )}
          {plan.collisions.length > 0 && (
            <span className="text-sp-muted">
              겹치는 칸 <b className="font-semibold tabular-nums">{plan.collisions.length}</b>개
            </span>
          )}
        </div>

        {plan.overflowCount > 0 && (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-dashed border-sp-border px-3 py-2 text-xs leading-relaxed text-sp-muted">
            <span aria-hidden className="material-symbols-outlined text-sm">
              info
            </span>
            <span>
              학기 마지막 수업일 뒤에는 놓을 자리가 없어서{' '}
              <b className="font-semibold text-sp-text">{plan.overflowCount}개는 옮기지 않아요.</b>{' '}
              그대로 두거나, 학기 종료일을 늘린 뒤 다시 밀어 주세요.
            </span>
          </p>
        )}

        {/*
          겹침은 막지 않되 숨기지도 않는다. 학기 끝까지 계획이 찬 반에서는 마지막 자리가
          겹치는 것이 정상적인 결과이고, 그 칸은 캘린더에 '+N' 으로 드러난다.
        */}
        {plan.collisions.length > 0 && (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-dashed border-sp-border px-3 py-2 text-xs leading-relaxed text-sp-muted">
            <span aria-hidden className="material-symbols-outlined text-sm">
              layers
            </span>
            <span>
              민 뒤에{' '}
              <b className="font-semibold text-sp-text">
                {plan.collisions
                  .map((c) => `${shortDate(c.date)} ${resolvePeriodLabel(c.period, periodTimes)}`)
                  .join(', ')}
              </b>
              에 진도가 <b className="font-semibold text-sp-text">2개 이상 겹쳐요.</b> 캘린더에서 그
              칸에 &lsquo;+1&rsquo; 로 보이니 합치거나 지워 주세요.
            </span>
          </p>
        )}

        {/*
          여러 반 동시 기록(팬아웃)의 사본은 반마다 시간표가 달라 같이 밀 수 없다.
          말없이 이 반만 밀면 "다른 반도 밀렸겠지"라는 기대와 어긋나므로 미리 알린다.
        */}
        {plan.otherClassCopyCount > 0 && (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-dashed border-sp-border px-3 py-2 text-xs leading-relaxed text-sp-muted">
            <span aria-hidden className="material-symbols-outlined text-sm">
              groups
            </span>
            <span>
              다른 반에도 함께 기록한 차시가 있어요.{' '}
              <b className="font-semibold text-sp-text">밀기는 이 반만 밀려요</b> — 다른 반도 밀어야
              하면 그 반 칸에서 따로 밀어 주세요.
            </span>
          </p>
        )}

        {movable === 0 && (
          <p className="mt-2 rounded-lg border border-dashed border-sp-border px-3 py-2 text-xs text-sp-muted">
            옮길 차시가 없어요. 이 차시 뒤에 &lsquo;예정&rsquo;이 없거나, 남은 수업일이 없어요.
          </p>
        )}

        {plan.rows.length > 0 && (
          <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-sp-border p-2">
            {plan.rows.map((row) => (
              <li
                key={row.entry.id}
                className={`flex items-center gap-2 rounded-lg px-2 py-1 text-xs ${
                  row.to === null ? 'opacity-60' : ''
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-sp-text">
                  {row.entry.lesson || row.entry.unit || '(내용 없음)'}
                </span>
                <span className="shrink-0 tabular-nums text-sp-muted">
                  {shortDate(row.from.date)} {resolvePeriodLabel(row.from.period, periodTimes)}
                </span>
                <span aria-hidden className="shrink-0 text-sp-muted">
                  →
                </span>
                {row.to ? (
                  <span className="shrink-0 font-semibold tabular-nums text-sp-accent">
                    {shortDate(row.to.date)} {resolvePeriodLabel(row.to.period, periodTimes)}
                  </span>
                ) : (
                  <span className="shrink-0 text-sp-muted">
                    {row.blocked === 'noSlot' ? '수업일 아님' : '학기 밖'}
                  </span>
                )}
              </li>
            ))}
          </ul>
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
            onClick={() => void handleConfirm()}
            disabled={busy || movable === 0}
            className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-semibold text-sp-accent-fg transition-all duration-sp-base ease-sp-out hover:brightness-110 active:scale-95 disabled:opacity-40"
          >
            {busy ? '미는 중…' : `${movable}개 밀기`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
