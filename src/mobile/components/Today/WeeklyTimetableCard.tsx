import type { ClassScheduleData, TeacherScheduleData } from '@domain/entities/Timetable';
import type { DayOfWeekFull } from '@domain/valueObjects/DayOfWeek';

const DOW_ORDER: readonly DayOfWeekFull[] = ['월', '화', '수', '목', '금', '토', '일'];

interface Cell {
  /** 과목명 (빈 문자열 = 공강/자습) */
  subject: string;
  /** 보조 정보 — 교사 시간표면 교실, 학급 시간표면 담당 교사 */
  sub: string;
}

interface Props {
  variant: 'teacher' | 'class';
  teacherSchedule: TeacherScheduleData;
  classSchedule: ClassScheduleData | null;
  /** 오늘 요일 — 해당 열을 강조 */
  todayDow: DayOfWeekFull;
  /** 현재 교시 (수업 중일 때만) — 오늘 열의 해당 칸을 강조 */
  currentPeriod: number | null;
}

/** 요일별 셀 배열로 정규화. teacher/class 두 포맷을 {subject, sub} 통일 형태로 변환. */
function toCells(
  variant: 'teacher' | 'class',
  teacherSchedule: TeacherScheduleData,
  classSchedule: ClassScheduleData | null,
): Record<string, Cell[]> {
  const out: Record<string, Cell[]> = {};
  if (variant === 'teacher') {
    for (const day of DOW_ORDER) {
      const arr = teacherSchedule[day];
      if (!arr) continue;
      out[day] = arr.map((p) => ({ subject: p?.subject ?? '', sub: p?.classroom ?? '' }));
    }
  } else {
    const cls = classSchedule ?? {};
    for (const day of DOW_ORDER) {
      const arr = cls[day];
      if (!arr) continue;
      out[day] = arr.map((p) => ({ subject: p?.subject ?? '', sub: p?.teacher ?? '' }));
    }
  }
  return out;
}

export function WeeklyTimetableCard({
  variant,
  teacherSchedule,
  classSchedule,
  todayDow,
  currentPeriod,
}: Props) {
  const cells = toCells(variant, teacherSchedule, classSchedule);
  const days = DOW_ORDER.filter((d) => (cells[d]?.length ?? 0) > 0);

  const title = variant === 'teacher' ? '주간 시간표 · 교사' : '주간 시간표 · 우리 반';
  const icon = variant === 'teacher' ? 'person' : 'groups';
  const iconClass = variant === 'teacher' ? 'text-sp-accent' : 'text-amber-500';

  // 마지막으로 내용이 있는 교시까지만 표시 (뒤쪽 빈 교시 잘라내기)
  let maxPeriods = 0;
  for (const d of days) maxPeriods = Math.max(maxPeriods, cells[d]!.length);
  let lastNonEmpty = 0;
  for (let p = 0; p < maxPeriods; p++) {
    const anyContent = days.some((d) => (cells[d]![p]?.subject ?? '').trim() !== '');
    if (anyContent) lastNonEmpty = p + 1;
  }
  const periodCount = lastNonEmpty;

  const isEmpty = days.length === 0 || periodCount === 0;

  return (
    <div className="glass-card p-4">
      {/* 헤더 — CollapsibleCard 헤더와 동일한 시각 위계 */}
      <div className="flex items-center gap-2 min-h-[28px]">
        <span className={`material-symbols-outlined shrink-0 ${iconClass}`}>{icon}</span>
        <span className="text-sp-text font-bold">{title}</span>
      </div>

      {isEmpty ? (
        <div className="mt-3 flex flex-col items-center justify-center py-8 text-center">
          <span className="material-symbols-outlined text-sp-muted text-3xl mb-1">
            calendar_month
          </span>
          <p className="text-sp-muted text-sm">
            {variant === 'class' ? '우리 반 시간표가 없습니다' : '시간표가 없습니다'}
          </p>
          <p className="text-sp-muted text-xs mt-1">PC 앱에서 시간표를 등록하면 여기에 표시돼요</p>
        </div>
      ) : (
        <div className="mt-3 -mx-1 overflow-x-auto scrollbar-hide">
          <table className="w-full border-separate border-spacing-1 text-center">
            <thead>
              <tr>
                <th className="w-6" aria-hidden="true" />
                {days.map((d) => {
                  const isToday = d === todayDow;
                  return (
                    <th key={d} className="p-0">
                      <div
                        className={`mx-auto flex h-6 items-center justify-center rounded-md text-xs font-bold ${
                          isToday ? 'bg-sp-accent text-sp-accent-fg' : 'text-sp-muted'
                        }`}
                      >
                        {d}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: periodCount }, (_, p) => {
                const periodNo = p + 1;
                return (
                  <tr key={periodNo}>
                    <td className="p-0 align-middle">
                      <span className="text-tiny font-semibold text-sp-muted">{periodNo}</span>
                    </td>
                    {days.map((d) => {
                      const cell = cells[d]![p];
                      const subject = (cell?.subject ?? '').trim();
                      const sub = (cell?.sub ?? '').trim();
                      const isTodayCol = d === todayDow;
                      const isCurrentCell = isTodayCol && currentPeriod === periodNo;

                      let cls =
                        'flex flex-col items-center justify-center rounded-lg px-1 py-1.5 min-h-[38px] leading-tight ';
                      if (isCurrentCell) {
                        cls += 'bg-sp-accent text-sp-accent-fg font-semibold';
                      } else if (subject) {
                        // 오늘 열은 헤더 강조 + 현재 교시 채움으로 이미 식별되므로
                        // 셀마다 링을 두르지 않고 배경 톤만 한 단계 진하게 둔다.
                        cls += isTodayCol
                          ? 'bg-black/[0.06] dark:bg-white/[0.08] text-sp-text'
                          : 'bg-black/[0.04] dark:bg-white/[0.05] text-sp-text';
                      } else {
                        cls += 'text-sp-muted opacity-60';
                      }

                      return (
                        <td key={d} className="p-0">
                          <div className={cls}>
                            {subject ? (
                              <>
                                <span className="block w-full truncate text-center text-detail font-medium">
                                  {subject}
                                </span>
                                {sub && (
                                  <span
                                    className={`block w-full truncate text-center text-tiny ${
                                      isCurrentCell
                                        ? 'text-sp-accent-fg opacity-80'
                                        : 'text-sp-muted'
                                    }`}
                                  >
                                    {sub}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-detail">·</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
