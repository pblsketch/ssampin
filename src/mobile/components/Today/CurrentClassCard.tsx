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

export function CurrentClassCard({ periodInfo, teacherSchedule }: Props) {
  const { currentPeriod, nextPeriod, progress, remainingMinutes, isBreak, isBeforeSchool, isAfterSchool, dayOfWeek } = periodInfo;
  const daySchedule = teacherSchedule[dayOfWeek];

  if (isBeforeSchool) {
    const firstClassInfo = daySchedule ? daySchedule[0] ?? null : null;
    return (
      <div className="bg-gradient-to-r from-blue-900/40 to-sp-card rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-sp-accent">wb_sunny</span>
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
      </div>
    );
  }

  if (isAfterSchool) {
    return (
      <div className="bg-gradient-to-r from-amber-900/40 to-sp-card rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-sp-highlight">nightlight</span>
          <span className="text-sp-muted text-sm">일과 종료</span>
        </div>
        <p className="text-sp-text font-bold text-lg">오늘 수고하셨습니다!</p>
      </div>
    );
  }

  if (isBreak) {
    return (
      <div className="bg-gradient-to-r from-green-900/40 to-sp-card rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-green-400">coffee</span>
          <span className="text-sp-muted text-sm">쉬는 시간</span>
        </div>
        <p className="text-sp-text font-bold text-lg">
          {nextPeriod ? `${formatMinutes(remainingMinutes)} 후 ${nextPeriod}교시` : '쉬는 시간'}
        </p>
      </div>
    );
  }

  // 수업 중
  const classInfo = currentPeriod && daySchedule
    ? daySchedule[currentPeriod - 1] ?? null
    : null;

  return (
    <div className="bg-gradient-to-r from-blue-900/40 to-sp-card rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-sp-accent">school</span>
          <span className="text-sp-accent font-bold">{currentPeriod}교시</span>
        </div>
        <span className="text-sp-muted text-sm">{formatMinutes(remainingMinutes)} 남음</span>
      </div>
      {classInfo && (
        <p className="text-sp-text font-bold text-lg mb-2">
          {classInfo.subject} · {classInfo.classroom}
        </p>
      )}
      <div className="h-1.5 bg-sp-border rounded-full overflow-hidden">
        <div
          className="h-full bg-sp-accent rounded-full transition-all duration-1000"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
