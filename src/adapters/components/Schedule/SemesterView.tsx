import { useMemo } from 'react';
import type { SchoolEvent, CategoryItem } from '@domain/entities/SchoolEvent';
import { sortByDate } from '@domain/rules/eventRules';
import { getColorsForCategory } from '@adapters/presenters/categoryPresenter';
import { MiniMonth } from './MiniMonth';

type Semester = 'first' | 'second';

const SEMESTER_INFO: Record<Semester, { label: string; months: number[] }> = {
  first: { label: '1학기', months: [2, 3, 4, 5, 6, 7] },   // 3~8월
  second: { label: '2학기', months: [8, 9, 10, 11, 0, 1] }, // 9~2월
};

interface SemesterViewProps {
  year: number;
  semester: Semester;
  events: readonly SchoolEvent[];
  categories: readonly CategoryItem[];
  onNavigateToMonth: (month: number) => void;
  onToggleSemester: () => void;
}

/** 학기 내 이벤트 필터 */
function getSemesterEvents(
  events: readonly SchoolEvent[],
  year: number,
  semester: Semester,
): readonly SchoolEvent[] {
  const months = SEMESTER_INFO[semester].months;
  return events.filter((e) => {
    const [ey, em] = e.date.split('-').map(Number) as [number, number];
    const eventMonth = em - 1; // 0-based
    if (semester === 'second' && (eventMonth === 0 || eventMonth === 1)) {
      // 2학기의 1,2월은 다음해
      return ey === year + 1 && months.includes(eventMonth);
    }
    return ey === year && months.includes(eventMonth);
  });
}

/** 학기 타임라인 */
function SemesterTimeline({
  events,
  categories,
}: {
  events: readonly SchoolEvent[];
  categories: readonly CategoryItem[];
}) {
  const sorted = useMemo(() => sortByDate(events), [events]);

  if (sorted.length === 0) {
    return (
      <div className="bg-sp-card rounded-3xl p-6 border border-sp-border h-full flex items-center justify-center">
        <p className="text-sp-muted text-sm">등록된 일정이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="bg-sp-card rounded-3xl p-6 border border-sp-border shadow-xl h-full overflow-y-auto">
      <h4 className="text-sm font-bold text-sp-text mb-4">주요 일정</h4>
      <div className="space-y-2">
        {sorted.slice(0, 50).map((event) => {
          const colors = getColorsForCategory(event.category, categories);
          const [, m, d] = event.date.split('-') as [string, string, string];
          const dateLabel = `${parseInt(m, 10)}/${parseInt(d, 10)}`;
          const endLabel = event.endDate ? (() => {
            const [, em, ed] = event.endDate.split('-') as [string, string, string];
            return ` ~ ${parseInt(em, 10)}/${parseInt(ed, 10)}`;
          })() : '';

          return (
            <div key={event.id} className="flex items-start gap-2.5 py-1.5">
              <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${colors.dot}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-sp-text truncate">{event.title}</p>
                <p className="text-[11px] text-sp-muted">{dateLabel}{endLabel}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SemesterView({
  year,
  semester,
  events,
  categories,
  onNavigateToMonth,
  onToggleSemester,
}: SemesterViewProps) {
  const semesterInfo = SEMESTER_INFO[semester];

  const semesterEvents = useMemo(
    () => getSemesterEvents(events, year, semester),
    [events, year, semester],
  );

  // MiniMonth에 전달할 연도 계산 (2학기 1,2월은 다음해)
  function getYearForMonth(m: number): number {
    if (semester === 'second' && (m === 0 || m === 1)) {
      return year + 1;
    }
    return year;
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* 좌측: 미니 캘린더 6개 */}
      <div className="lg:w-[55%]">
        <div className="bg-sp-card rounded-3xl p-6 border border-sp-border shadow-xl">
          <div className="flex items-center justify-between mb-4 px-2">
            <h3 className="text-lg font-bold text-sp-text">
              {year}년 {semesterInfo.label}
            </h3>
            <button
              type="button"
              onClick={onToggleSemester}
              className="text-sm text-sp-accent hover:text-blue-400 transition-colors"
            >
              {semester === 'first' ? '2학기 보기 →' : '← 1학기 보기'}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {semesterInfo.months.map((m) => (
              <MiniMonth
                key={m}
                year={getYearForMonth(m)}
                month={m}
                events={events}
                categories={categories}
                onClick={() => onNavigateToMonth(m)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 우측: 학기 타임라인 */}
      <div className="lg:w-[45%] min-h-0">
        <SemesterTimeline events={semesterEvents} categories={categories} />
      </div>
    </div>
  );
}
