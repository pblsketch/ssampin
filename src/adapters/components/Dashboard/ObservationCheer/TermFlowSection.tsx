/**
 * 관찰 기록 응원 2·3차(ADR-137, 설계 §6) — 통계 화면의 '반 흐름'.
 *
 * 줄 = 그 카드의 학생 칸(1차 칸 규칙 — 재학 중, 명렬표 번호순, 섞인 반은 "반-번호", 빠진 학생도
 * 그대로), 열 = 이번 학기 주. 칸은 그 주에 관찰 기록(출결 제외)이 있으면 칠하고 없으면 비운다.
 * **건수·정렬·누르기는 없다.** 쉬는 주·아직 오지 않은 주는 옅게, 쉬는 주라도 기록이 있으면 칠한다.
 * 통계 화면의 기간 선택과 상관없이 늘 이번 학기다. 응원·잔디를 끄면 이 칸이 없다.
 */
import { useMemo } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import {
  useObservationCheerAvailable,
  useObservationTermWindow,
  useSchoolCalendarDays,
} from '@adapters/hooks/useObservationCheerContext';
import { DEFAULT_REMINDER_SETTINGS } from '@domain/entities/RecordReminder';
import { homeroomEntries, subjectCard, subjectEntries } from '@domain/rules/observationEntries';
import { homeroomTiles, subjectTiles } from '@domain/rules/observationCardRoster';
import {
  buildClassFlowGrid,
  type ClassFlowCellState,
  type ClassFlowWeek,
} from '@domain/rules/observationClassFlow';
import { maskName } from '@domain/rules/recordReminderRules';

type TermFlowSectionProps =
  | { readonly kind: 'homeroom' }
  | { readonly kind: 'teaching'; readonly classId: string };

function md(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${m ?? ''}월 ${d ?? ''}일`;
}

const STATE_LABEL: Record<ClassFlowCellState, string> = {
  recorded: '기록 있음',
  empty: '기록 없음',
  rest: '쉬는 주',
  future: '아직',
};

function FlowCell({
  state,
  week,
  who,
}: {
  readonly state: ClassFlowCellState;
  readonly week: ClassFlowWeek;
  readonly who: string;
}): JSX.Element {
  const label = `${who} · ${md(week.weekStart)}~${md(week.weekEnd)} · ${STATE_LABEL[state]}`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`block h-3.5 w-3.5 rounded-sm ${
        state === 'recorded'
          ? 'bg-sp-accent'
          : state === 'empty'
            ? 'border border-sp-border'
            : 'border border-sp-border opacity-40'
      }`}
    />
  );
}

export function TermFlowSection(props: TermFlowSectionProps): JSX.Element | null {
  const available = useObservationCheerAvailable();
  const rr = useSettingsStore((s) => s.settings.recordReminder) ?? DEFAULT_REMINDER_SETTINGS;
  const students = useStudentStore((s) => s.students);
  const classes = useTeachingClassStore((s) => s.classes);
  const homeroomRecords = useStudentRecordsStore((s) => s.records);
  const observationRecords = useObservationStore((s) => s.records);
  const termWindow = useObservationTermWindow();
  const calendar = useSchoolCalendarDays();
  const classId = props.kind === 'teaching' ? props.classId : null;

  const view = useMemo(() => {
    let tiles;
    let entries;
    if (classId === null) {
      tiles = homeroomTiles(students);
      entries = homeroomEntries(homeroomRecords);
    } else {
      const cls = classes.find((c) => c.id === classId);
      if (cls === undefined) return null;
      tiles = subjectTiles(cls.students);
      const card = subjectCard(cls.id);
      entries = subjectEntries(observationRecords).filter((e) => e.card === card);
    }
    if (tiles.length === 0) return null;
    const grid = buildClassFlowGrid({
      refs: tiles.map((t) => t.ref),
      entries,
      termStart: termWindow.termStart,
      termEnd: termWindow.termEnd,
      today: termWindow.today,
      cal: calendar,
    });
    return {
      grid,
      rows: tiles.map((t) => ({
        ref: t.ref,
        label: t.label,
        displayName: maskName(t.name, rr.nameExposure),
      })),
    };
  }, [classId, students, classes, homeroomRecords, observationRecords, termWindow, calendar, rr]);

  if (!available || view === null) return null;

  return (
    <section className="rounded-xl bg-sp-card p-4" aria-label="반 흐름">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-sp-text">반 흐름</h3>
        <span className="text-caption text-sp-muted">이번 학기 기준</span>
      </div>
      <div className="max-h-[420px] overflow-auto rounded-lg border border-sp-border">
        <table className="border-collapse text-sm">
          <tbody>
            {view.rows.map((row) => {
              const who =
                row.displayName.length > 0
                  ? `${row.label}번 ${row.displayName}`
                  : `${row.label}번 학생`;
              const cells = view.grid.rows.get(row.ref) ?? [];
              return (
                <tr key={row.ref}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 whitespace-nowrap bg-sp-card px-2 py-1 text-left text-xs font-normal text-sp-muted"
                  >
                    {/* 이름은 마우스를 올리거나 키보드 초점을 옮길 때만(spec 1-3) — 칸마다 초점을 두면 수백 번 눌러야 한다. */}
                    <span
                      tabIndex={0}
                      aria-label={who}
                      className="group relative rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-sp-accent"
                    >
                      {row.label}
                      {row.displayName.length > 0 && (
                        <span
                          role="tooltip"
                          data-sp-floating
                          className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-sp-border bg-sp-card px-2 py-0.5 text-caption text-sp-text opacity-0 shadow-sp-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
                        >
                          {row.displayName}
                        </span>
                      )}
                    </span>
                  </th>
                  {view.grid.weeks.map((w, i) => (
                    <td key={w.weekStart} className="px-0.5 py-0.5">
                      <FlowCell state={cells[i] ?? 'empty'} week={w} who={who} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-caption text-sp-muted">
        <span className="flex items-center gap-1">
          <span aria-hidden className="inline-block h-3 w-3 rounded-sm bg-sp-accent" /> 기록 있음
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden className="inline-block h-3 w-3 rounded-sm border border-sp-border" />{' '}
          기록 없음
        </span>
        <span className="flex items-center gap-1">
          <span
            aria-hidden
            className="inline-block h-3 w-3 rounded-sm border border-sp-border opacity-40"
          />{' '}
          쉬는 주 · 아직
        </span>
      </div>
    </section>
  );
}
