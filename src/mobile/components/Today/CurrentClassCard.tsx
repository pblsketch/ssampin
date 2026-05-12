import { useState } from 'react';
import type { CurrentPeriodInfo } from '@mobile/hooks/useCurrentPeriod';
import type { TeacherScheduleData } from '@domain/entities/Timetable';
import { CollapsibleCard } from '@mobile/components/common/CollapsibleCard';
import { MobileProgressLogModal } from './MobileProgressLogModal';

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

function DayScheduleOverview({
  daySchedule,
  currentPeriod,
  nextPeriod,
  isBreak,
}: DayScheduleOverviewProps) {
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
          const isPast =
            currentPeriod !== null
              ? period < currentPeriod
              : nextPeriod !== null
                ? period < nextPeriod
                : false;

          let pillClass =
            'flex-shrink-0 flex flex-col items-center px-2.5 py-1.5 rounded-xl text-xs transition-all ';
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
                  <span
                    className="material-symbols-outlined text-sp-accent"
                    style={{ fontSize: '10px' }}
                  >
                    radio_button_checked
                  </span>
                )}
                {isNext && !isCurrent && (
                  <span
                    className="material-symbols-outlined text-green-400"
                    style={{ fontSize: '10px' }}
                  >
                    arrow_right
                  </span>
                )}
                <span
                  className={`font-semibold ${isCurrent ? 'text-sp-accent' : isNext ? 'text-green-300' : ''}`}
                >
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
  const {
    currentPeriod,
    nextPeriod,
    progress,
    remainingMinutes,
    isBreak,
    isBeforeSchool,
    isAfterSchool,
    dayOfWeek,
  } = periodInfo;
  const daySchedule = teacherSchedule[dayOfWeek] ?? null;
  const [progressModalOpen, setProgressModalOpen] = useState(false);

  // 상태별 헤더(아이콘·제목·요약·강조) + 본문 계산
  let icon: string;
  let iconClass: string;
  let title: string;
  let summary: string;
  let variant: 'default' | 'accent';
  let body: React.ReactNode;
  let classInfo: { subject: string; classroom: string } | null = null;

  if (isBeforeSchool) {
    const firstClassInfo = daySchedule ? (daySchedule[0] ?? null) : null;
    icon = 'wb_sunny';
    iconClass = 'text-amber-500';
    title = '등교 전';
    variant = 'accent';
    summary = nextPeriod ? `${formatMinutes(remainingMinutes)} 후 1교시 시작` : '오늘 일과 준비 중';
    body = (
      <>
        <p className="text-sp-text font-bold text-lg">{summary}</p>
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
      </>
    );
  } else if (isAfterSchool) {
    icon = 'nightlight';
    iconClass = 'text-amber-500';
    title = '일과 종료';
    variant = 'default';
    summary = '오늘 수고하셨습니다';
    body = (
      <>
        <p className="text-sp-text font-bold text-lg">오늘 수고하셨습니다!</p>
        {daySchedule && (
          <DayScheduleOverview
            daySchedule={daySchedule}
            currentPeriod={null}
            nextPeriod={null}
            isBreak={false}
          />
        )}
      </>
    );
  } else if (isBreak) {
    icon = 'coffee';
    iconClass = 'text-green-500';
    title = '쉬는 시간';
    variant = 'default';
    summary = nextPeriod ? `${formatMinutes(remainingMinutes)} 후 ${nextPeriod}교시` : '쉬는 시간';
    body = (
      <>
        <p className="text-sp-text font-bold text-lg">{summary}</p>
        {daySchedule && (
          <DayScheduleOverview
            daySchedule={daySchedule}
            currentPeriod={null}
            nextPeriod={nextPeriod}
            isBreak={true}
          />
        )}
      </>
    );
  } else {
    // 수업 중
    classInfo = currentPeriod && daySchedule ? (daySchedule[currentPeriod - 1] ?? null) : null;
    icon = 'school';
    iconClass = 'text-sp-accent';
    title = `${currentPeriod}교시`;
    variant = 'accent';
    summary = classInfo
      ? `${classInfo.subject} · ${classInfo.classroom}`
      : `${formatMinutes(remainingMinutes)} 남음`;
    body = (
      <>
        <div className="flex items-center justify-between mb-2">
          {classInfo ? (
            <p className="text-sp-text font-bold text-lg">
              {classInfo.subject} · {classInfo.classroom}
            </p>
          ) : (
            <span />
          )}
          <span className="text-sp-muted text-sm shrink-0">
            {formatMinutes(remainingMinutes)} 남음
          </span>
        </div>
        <div className="h-1.5 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-sp-accent rounded-full transition-all duration-1000"
            style={{ width: `${progress}%` }}
          />
        </div>
        {classInfo && currentPeriod && (
          <button
            type="button"
            onClick={() => setProgressModalOpen(true)}
            className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-sp-accent/15 text-sp-accent rounded-xl hover:bg-sp-accent/25 active:bg-sp-accent/30 transition-colors text-sm font-medium"
          >
            <span className="material-symbols-outlined text-base">trending_up</span>
            오늘 진도 기록
          </button>
        )}
        {daySchedule && (
          <DayScheduleOverview
            daySchedule={daySchedule}
            currentPeriod={currentPeriod}
            nextPeriod={nextPeriod}
            isBreak={false}
          />
        )}
      </>
    );
  }

  return (
    <>
      <CollapsibleCard
        cardId="currentClass"
        title={title}
        icon={icon}
        iconClass={iconClass}
        variant={variant}
        summary={summary}
      >
        {body}
      </CollapsibleCard>
      {classInfo && currentPeriod && (
        <MobileProgressLogModal
          isOpen={progressModalOpen}
          onClose={() => setProgressModalOpen(false)}
          defaultPeriod={currentPeriod}
          subject={classInfo.subject}
          classroom={classInfo.classroom}
        />
      )}
    </>
  );
}
