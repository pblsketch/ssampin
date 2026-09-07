/**
 * 온라인 교무실 — 부서 일정 표 붙여넣기로 올리기 (066 후속)
 *
 * 계획서: .omc/plans/staffroom-submission-plan.md (D4 · S6-2)
 * 파서: domain/rules/staffRoomSchedulePaste.ts — 순수 함수라 왕복 없이 즉시 미리보기를 그린다.
 *
 * 흐름은 하나의 화면 안에서 붙여넣기 → 미리보기 → 올리기로 이어진다. 글자를 고칠 때마다
 * `parsePastedSchedule` 을 다시 부르기만 하면 되므로 "다음" 버튼으로 화면을 나누지 않았다 —
 * 표를 고쳐 붙이면서 바로 아래 미리보기가 따라 바뀌는 편이 학교 표의 들쭉날쭉한 모양을
 * 맞춰 나가기에 더 낫다.
 */
import { useMemo, useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { useStaffRoomPlanStore } from '@adapters/stores/useStaffRoomPlanStore';
import { academicTerm, schoolYearOf } from '@domain/rules/academicCalendar';
import {
  parsePastedSchedule,
  STAFFROOM_PASTE_MAX_ROWS,
  type PastedScheduleRow,
} from '@domain/rules/staffRoomSchedulePaste';

interface SchedulePasteModalProps {
  departmentId: string;
  onClose: () => void;
}

const EXAMPLE = '3월 2일\t입학식\t체육관\n2026-03-04\t학부모총회\t강당\t오후 2시';

/**
 * 오늘이 속한 학년도.
 *
 * "3월 2일"처럼 연도 없는 표기를 채울 기준이다(파서가 인자로 받는다 — domain 은 오늘이
 * 몇 학년도인지 스스로 알 수 없어서다). 학기 정본(ADR-046)에서 그대로 끌어온다.
 */
function currentSchoolYear(): number {
  return schoolYearOf(academicTerm()) ?? new Date().getFullYear();
}

function PreviewTable({ rows }: { rows: readonly PastedScheduleRow[] }) {
  return (
    <div className="max-h-64 overflow-y-auto rounded-xl border border-sp-border">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-sp-surface text-sp-muted">
          <tr>
            <th className="px-3 py-2 font-sp-medium">날짜</th>
            <th className="px-3 py-2 font-sp-medium">제목</th>
            <th className="px-3 py-2 font-sp-medium">장소</th>
            <th className="px-3 py-2 font-sp-medium">메모</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sp-border">
          {rows.map((row, i) => (
            <tr key={`${row.startsOn}-${row.title}-${i}`} className="bg-sp-card">
              <td className="whitespace-nowrap px-3 py-2 text-sp-text">{row.startsOn}</td>
              <td className="px-3 py-2 text-sp-text">{row.title}</td>
              <td className="px-3 py-2 text-sp-muted">{row.place || '—'}</td>
              <td className="px-3 py-2 text-sp-muted">{row.memo || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SchedulePasteModal({ departmentId, onClose }: SchedulePasteModalProps) {
  const addEventsFromPaste = useStaffRoomPlanStore((s) => s.addEventsFromPaste);
  const error = useStaffRoomPlanStore((s) => s.error);
  const clearError = useStaffRoomPlanStore((s) => s.clearError);

  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ added: number; rejected: number } | null>(null);

  // 모달이 떠 있는 동안 학년도가 바뀔 일은 없다 — 한 번만 구한다.
  const [schoolYear] = useState(currentSchoolYear);

  const { rows, droppedLines } = useMemo(
    () => parsePastedSchedule(text, schoolYear),
    [text, schoolYear],
  );

  const canSubmit = rows.length > 0 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const res = await addEventsFromPaste(departmentId, rows);
    setSubmitting(false);
    if (res) {
      setResult(res);
      setText('');
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="표 붙여넣기로 일정 올리기" size="lg">
      <div className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto px-6 pb-6 pt-2">
        {error && (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-sp-error bg-sp-surface p-4">
            <p className="text-sm leading-relaxed text-sp-error">{error}</p>
            <button
              type="button"
              onClick={clearError}
              aria-label="안내 닫기"
              className="shrink-0 rounded-lg p-1 text-sp-muted hover:text-sp-text"
            >
              <span className="material-symbols-outlined text-icon-sm">close</span>
            </button>
          </div>
        )}

        {result ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-sp-border bg-sp-card px-6 py-10 text-center">
            <span className="material-symbols-outlined text-icon-xl text-sp-success">
              check_circle
            </span>
            <p className="text-sm font-sp-medium text-sp-text">
              일정 {result.added}건을 올렸습니다.
            </p>
            {result.rejected > 0 && (
              <p className="max-w-sm text-xs leading-relaxed text-sp-warning">
                {result.rejected}건은 서버에서 반영되지 않았습니다. 날짜와 제목을 확인한 뒤 다시
                붙여넣어 주세요.
              </p>
            )}
            <button
              type="button"
              onClick={onClose}
              className="mt-1 rounded-xl bg-sp-accent px-4 py-2 text-sm font-sp-semibold text-white transition-all duration-sp-base ease-sp-out hover:shadow-sp-md"
            >
              닫기
            </button>
          </div>
        ) : (
          <>
            <div>
              <p className="text-sm leading-relaxed text-sp-text">
                한글·엑셀·구글시트에서 표를 복사해 아래에 붙여넣으세요.
              </p>
              <p className="mt-1 text-xs leading-relaxed text-sp-muted">
                칸 수로 뜻이 정해집니다 — 2칸(날짜·제목) · 3칸(+장소) · 4칸 이상(+메모)
              </p>
              <pre className="mt-2 overflow-x-auto rounded-lg border border-sp-border bg-sp-surface px-3 py-2 font-mono text-xs leading-relaxed text-sp-muted">
                {EXAMPLE}
              </pre>
            </div>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              placeholder={EXAMPLE}
              aria-label="붙여넣을 표"
              className="w-full resize-y rounded-xl border border-sp-border bg-sp-surface px-3 py-2.5 font-mono text-xs text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
            />

            {text.trim() !== '' && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="font-sp-medium text-sp-text">읽어낸 일정 {rows.length}건</span>
                  {droppedLines > 0 && (
                    <span className="font-sp-medium text-sp-warning">
                      읽지 못한 줄 {droppedLines}개
                    </span>
                  )}
                </div>
                {droppedLines > 0 && (
                  <p className="text-[11px] leading-relaxed text-sp-muted">
                    표 머리글처럼 날짜가 아닌 줄이 걸리는 건 정상입니다. 건수가 생각보다 많이
                    줄었다면 붙여넣은 표를 다시 확인해 주세요.
                  </p>
                )}
                {rows.length === STAFFROOM_PASTE_MAX_ROWS && (
                  <p className="text-[11px] leading-relaxed text-sp-muted">
                    한 번에 최대 {STAFFROOM_PASTE_MAX_ROWS}건까지 올릴 수 있어요. 더 있다면 나눠서
                    붙여넣어 주세요.
                  </p>
                )}
                {rows.length > 0 ? (
                  <PreviewTable rows={rows} />
                ) : (
                  <p className="rounded-xl border border-dashed border-sp-border bg-sp-card px-4 py-6 text-center text-xs text-sp-muted">
                    읽어낸 일정이 없습니다. 날짜가 맨 앞 칸에 있는지 확인해 주세요.
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-sp-border pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-sp-border px-4 py-2 text-sm font-sp-medium text-sp-text transition-colors hover:bg-sp-surface"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!canSubmit}
                className="rounded-xl bg-sp-accent px-4 py-2 text-sm font-sp-semibold text-white transition-all duration-sp-base ease-sp-out hover:shadow-sp-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? '올리는 중…' : rows.length > 0 ? `${rows.length}건 올리기` : '올리기'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
