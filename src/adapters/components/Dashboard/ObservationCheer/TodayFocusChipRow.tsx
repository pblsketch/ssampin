/**
 * 관찰 기록 응원 2·3차(ADR-137, 설계 §2) — 핀 줄 바로 아래 '오늘 챙길 학생' 칩 줄.
 *
 * - 기록 알림과 같은 기준으로 그날 처음 고른 몇 명(알림 강도의 인원). 하루 동안 고정이다.
 * - 칩에는 **번호만**(수업반은 반 이름을 짧게 붙인다) — 대시보드는 교실 TV·빔에 띄워질 수 있다.
 *   이름은 마우스·키보드 초점에서만, 기록 알림의 이름 표시 설정대로 보인다.
 * - 오늘 기록이 생기면 ✓ 만 붙이고 새로 채우지 않는다.
 * - 누르면 칸 누르기와 똑같이 그 학생·그 반으로 글쓰기가 바로 열린다(ADR-122 결정 2의 두 번째 예외).
 * - 명단이 비면 이 줄을 그리지 않는다.
 */
import { useTodayStudentsView, type TodayStudentChip } from '@adapters/hooks/useObservationDaily';
import { openQuickRecordDirect } from '../studentRecordNavigation';

export function TodayFocusChipRow(): JSX.Element | null {
  const chips = useTodayStudentsView();
  if (chips.length === 0) return null;
  return (
    <div className="mb-2 flex shrink-0 flex-wrap items-center gap-1.5">
      <span className="shrink-0 text-[10px] font-medium text-sp-muted">오늘 챙길 학생</span>
      {chips.map((c) => (
        <TodayFocusChip key={`${c.card}:${c.ref}`} chip={c} />
      ))}
    </div>
  );
}

function chipText(c: TodayStudentChip): string {
  return c.classShort !== null ? `${c.classShort}·${c.label}` : c.label;
}

/** 이름표 — 수업반은 전체 반 이름을 앞에 둔다(칩에는 짧은 이름뿐이라 같은 반 두 과목을 가를 곳). */
function tooltipText(c: TodayStudentChip): string {
  return [c.classLabel ?? '', c.displayName].filter((t) => t.length > 0).join(' · ');
}

export function todayChipAriaLabel(c: TodayStudentChip): string {
  const who = c.displayName.length > 0 ? `${c.label}번 ${c.displayName}` : `${c.label}번 학생`;
  const where = c.classLabel !== null ? `${c.classLabel} ` : '';
  return c.done
    ? `${where}${who}, 오늘 챙길 학생 · 오늘 기록 완료`
    : `${where}${who}, 오늘 챙길 학생`;
}

function TodayFocusChip({ chip }: { chip: TodayStudentChip }): JSX.Element {
  return (
    <button
      type="button"
      onClick={() =>
        openQuickRecordDirect({
          contextKind: chip.contextKind,
          contextId: chip.contextId,
          studentRef: chip.ref,
        })
      }
      aria-label={todayChipAriaLabel(chip)}
      className={`group relative whitespace-nowrap rounded-full border border-sp-border bg-sp-surface px-2 py-0.5 text-caption transition-colors hover:border-sp-accent ${
        chip.done ? 'text-sp-muted' : 'text-sp-text'
      }`}
    >
      {chipText(chip)}
      {chip.done && (
        <span aria-hidden className="ml-1 text-sp-accent">
          ✓
        </span>
      )}
      {tooltipText(chip).length > 0 && (
        <span
          role="tooltip"
          data-sp-floating
          className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-sp-border bg-sp-card px-2 py-0.5 text-caption text-sp-text opacity-0 shadow-sp-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
        >
          {tooltipText(chip)}
        </span>
      )}
    </button>
  );
}
