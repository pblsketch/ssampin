import type { CurrentPeriodInfo } from '@mobile/hooks/useCurrentPeriod';
import type { TeacherScheduleData } from '@domain/entities/Timetable';

function formatMinutes(min: number): string {
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

interface Props {
  periodInfo: CurrentPeriodInfo;
  teacherSchedule: TeacherScheduleData;
}

interface DayScheduleOverviewProps {
  daySchedule: readonly ({ subject: string; classroom: string } | null)[];
  currentPeriod: number | null;
  nextPeriod: number | null;
  isBreak: boolean;
}

function DayScheduleOverview({ daySchedule, currentPeriod, nextPeriod, isBreak }: DayScheduleOverviewProps) {
  const entries = daySchedule
    .map((entry, idx) => ({ period: idx + 1, entry }))
    .filter(({ entry }) => entry !== null && entry.subject.trim() !== '');

  if (entries.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-white/10">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="material-symbols-outlined text-sp-muted" style={{ fontSize: '14px' }}>
          calendar_today
        </span>
        <span className="text-sp-muted text-xs font-medium">오늘 일정</span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {entries.map(({ period, entry }) => {
          const isCurrent = currentPeriod === period;
          const isNext = isBreak && nextPeriod === period;
          const isPast = currentPeriod !== null
            ? period < currentPeriod
            : nextPeriod !== null
              ? period < nextPeriod
              : false;

          let pillClass = 'flex-shrink-0 flex flex-col items-center px-2.5 py-1.5 rounded-xl text-xs transition-all ';
          if (isCurrent) {
            pillClass += 'bg-sp-accent/30 border border-sp-accent/60 text-sp-accent/70';
          } else if (isNext) {
            pillClass += 'bg-green-500/20 border border-green-500/40 text-green-200';
          } else if (isPast) {
            pillClass += 'bg-white/5 border border-white/10 text-sp-muted opacity-50';
          } else {
            pillClass += 'bg-white/10 border border-white/15 text-sp-text';
          }

          return (
            <div key={period} className={pillClass}>
              <div className="flex items-center gap-1 mb-0.5">
                {isCurrent && (
                  <span className="material-symbols-outlined text-sp-accent" style={{ fontSize: '10px' }}>
                    radio_button_checked
                  </span>
                )}
                {isNext && !isCurrent && (
                  <span className="material-symbols-outlined text-green-400" style={{ fontSize: '10px' }}>
                    arrow_right
                  </span>
                )}
                <span className={`font-semibold ${isCurrent ? 'text-sp-accent' : isNext ? 'text-green-300' : ''}`}>
                  {period}교시
                </span>
              </div>
              <span className="font-medium leading-tight text-center" style={{ fontSize: '11px' }}>
                {entry!.subject}
              </span>
              {entry!.classroom && (
                <span className="text-sp-muted leading-tight" style={{ fontSize: '10px' }}>
                  {entry!.classroom}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CurrentClassCard({ periodInfo, teacherSchedule }: Props) {
  const { currentPeriod, nextPeriod, progress, remainingMinutes, isBreak, isBeforeSchool, isAfterSchool, dayOfWeek } = periodInfo;
  const daySchedule = teacherSchedule[dayOfWeek] ?? null;

  if (isBeforeSchool) {
    const firstClassInfo = daySchedule ? daySchedule[0] ?? null : null;
    return (
      <div className="glass-card-accent p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-amber-500">wb_sunny</span>
          <span className="text-sp-muted text-sm">등교 전</span>
        </div>
        <p className="text-sp-text font-bold text-lg">
          {nextPeriod ? `${formatMinutes(remainingMinutes)} 후 1교시 시작` : '오늘 일과 준비 중'}
        </p>
        {firstClassInfo && (
          <p className="text-sp-muted text-sm mt-1">
            {firstClassInfo.subject} · {firstClassInfo.classroom}
          </p>
        )}
        {daySchedule && (
          <DayScheduleOverview
            daySchedule={daySchedule}
            currentPeriod={null}
            nextPeriod={nextPeriod}
            isBreak={false}
          />
        )}
      </div>
    );
  }

  if (isAfterSchool) {
    return (
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-amber-500">nightlight</span>
          <span className="text-sp-muted text-sm">일과 종료</span>
        </div>
        <p className="text-sp-text font-bold text-lg">오늘 수고하셨습니다!</p>
        {daySchedule && (
          <DayScheduleOverview
            daySchedule={daySchedule}
            currentPeriod={null}
            nextPeriod={null}
            isBreak={false}
          />
        )}
      </div>
    );
  }

  if (isBreak) {
    return (
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-green-500">coffee</span>
          <span className="text-sp-muted text-sm">쉬는 시간</span>
        </div>
        <p className="text-sp-text font-bold text-lg">
          {nextPeriod ? `${formatMinutes(remainingMinutes)} 후 ${nextPeriod}교시` : '쉬는 시간'}
        </p>
        {daySchedule && (
          <DayScheduleOverview
            daySchedule={daySchedule}
            currentPeriod={null}
            nextPeriod={nextPeriod}
            isBreak={true}
          />
        )}
      </div>
    );
  }

  // 수업 중
  const classInfo = currentPeriod && daySchedule
    ? daySchedule[currentPeriod - 1] ?? null
    : null;

  return (
    <div className="glass-card-accent p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-sp-accent">school</span>
          <span className="pill-badge bg-sp-accent text-sp-accent-fg">{currentPeriod}교시</span>
        </div>
        <span className="text-sp-muted text-sm">{formatMinutes(remainingMinutes)} 남음</span>
      </div>
      {classInfo && (
        <p className="text-sp-text font-bold text-lg mb-2">
          {classInfo.subject} · {classInfo.classroom}
        </p>
      )}
      <div className="h-1.5 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full bg-sp-accent rounded-full transition-all duration-1000"
          style={{ width: `${progress}%` }}
        />
      </div>
      {daySchedule && (
        <DayScheduleOverview
          daySchedule={daySchedule}
          currentPeriod={currentPeriod}
          nextPeriod={nextPeriod}
          isBreak={false}
        />
      )}
    </div>
  );
}
