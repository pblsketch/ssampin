import { Fragment, useEffect, useMemo, useState } from 'react';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { getCellWidgetStyle } from '@adapters/presenters/timetablePresenter';
import { useWidgetRefresh } from '../hooks/useWidgetRefresh';
import type { TeacherPeriod } from '@domain/entities/Timetable';
import { getDayOfWeek, getCurrentPeriod } from '@domain/rules/periodRules';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';

import type { DayOfWeek } from '@domain/valueObjects/DayOfWeek';

const DAYS: readonly { key: DayOfWeek; label: string }[] = [
  { key: '월', label: '월' },
  { key: '화', label: '화' },
  { key: '수', label: '수' },
  { key: '목', label: '목' },
  { key: '금', label: '금' },
];


/**
 * 교사 주간시간표 위젯
 * 월~금 전체를 격자로 보여줌
 */
export function WeeklyTimetable() {
  const { teacherSchedule, load: loadSchedule } = useScheduleStore();
  const { settings, load: loadSettings } = useSettingsStore();

  useEffect(() => {
    void loadSchedule();
    void loadSettings();
  }, [loadSchedule, loadSettings]);

  useWidgetRefresh(loadSchedule, { intervalMs: 60 * 60 * 1000 });

  const [now, setNow] = useState(new Date());

  // 1분마다 현재 시각 갱신
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const colorBy = settings.timetableColorBy ?? (settings.schoolLevel === 'elementary' ? 'subject' : 'classroom');
  const classroomColors = settings.classroomColors;
  const maxPeriods = settings.maxPeriods;

  const weekendDays = settings.enableWeekendDays;
  const dayOfWeek = useMemo(() => getDayOfWeek(now, weekendDays), [now, weekendDays]);
  const currentPeriod = useMemo(
    () => (dayOfWeek ? getCurrentPeriod(settings.periodTimes, now) : null),
    [dayOfWeek, settings.periodTimes, now],
  );

  // periodTimes를 Map으로 변환
  const periodTimeMap = useMemo(() => {
    const map = new Map<number, PeriodTime>();
    for (const pt of settings.periodTimes) map.set(pt.period, pt);
    return map;
  }, [settings.periodTimes]);

  const periods = useMemo(() => {
    return Array.from({ length: maxPeriods }, (_, i) => i + 1);
  }, [maxPeriods]);

  const isEmpty = useMemo(() => {
    return DAYS.every(({ key }) => {
      const dayData = teacherSchedule[key];
      return !dayData || dayData.length === 0;
    });
  }, [teacherSchedule]);

  if (isEmpty) {
    return (
      <div className="rounded-xl bg-sp-card p-4 h-full flex flex-col">
        <div className="py-6 text-center text-sm text-sp-muted">
          시간표가 등록되지 않았습니다
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-sp-card p-4 h-full flex flex-col overflow-hidden">
      <div className="mb-3 flex items-center justify-between shrink-0">
        <h3 className="text-sm font-bold text-sp-text flex items-center gap-1.5"><span>📅</span>교사 주간시간표</h3>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <div
          className="grid border border-sp-border/40 h-full"
          style={{
            gridTemplateColumns: `4.5rem repeat(${DAYS.length}, 1fr)`,
            gridTemplateRows: `auto repeat(${periods.length}, 1fr)`,
          }}
        >
          {/* 헤더 행 */}
          <div className="bg-sp-card border-b border-r border-sp-border/30" />
          {DAYS.map(({ key, label }, i) => {
            const isToday = dayOfWeek === key;
            const isLast = i === DAYS.length - 1;
            return (
              <div key={key} className={`bg-sp-card py-1 text-center text-xs font-medium border-b border-sp-border/30 ${!isLast ? 'border-r' : ''} ${isToday ? 'text-sp-highlight font-bold' : 'text-sp-muted'}`}>
                {label}
              </div>
            );
          })}

          {/* 교시별 행 */}
          {periods.map((period, rowIdx) => {
            const isCurrent = currentPeriod === period;
            const pt = periodTimeMap.get(period);
            const isLastRow = rowIdx === periods.length - 1;
            return (
              <Fragment key={period}>
                <div className={`bg-sp-card flex flex-col items-center justify-center border-r border-sp-border/30 ${!isLastRow ? 'border-b' : ''} ${isCurrent ? 'text-sp-highlight font-bold' : 'text-sp-muted'}`}>
                  <span className="text-detail">{period}</span>
                  {pt && (
                    <span className="text-tiny opacity-60 whitespace-nowrap">
                      {pt.start}
                    </span>
                  )}
                </div>
                {DAYS.map(({ key }, colIdx) => {
                  const dayData = teacherSchedule[key] as readonly (TeacherPeriod | null)[] | undefined;
                  const tp = dayData?.[period - 1] ?? null;
                  const subject = tp?.subject ?? '';
                  const colorClass = subject
                    ? getCellWidgetStyle(subject, tp?.classroom, colorBy, settings.subjectColors, classroomColors)
                    : 'bg-sp-surface/50 text-sp-muted';
                  const isCurrentCell = isCurrent && dayOfWeek === key;
                  const isLastCol = colIdx === DAYS.length - 1;
                  const cellBorder = `${!isLastRow ? 'border-b' : ''} ${!isLastCol ? 'border-r' : ''} border-sp-border/30`;

                  return (
                    <div key={key} className={`bg-sp-card p-0.5 ${cellBorder}`}>
                      {tp ? (
                        <div className={`rounded h-full flex flex-col items-center justify-center text-detail font-medium ${colorClass} ${isCurrentCell ? 'ring-2 ring-sp-highlight shadow-sm shadow-sp-highlight/20' : ''}`}>
                          <span>{tp.subject}</span>
                          {tp.classroom && (
                            <span className="text-tiny opacity-60">{tp.classroom}</span>
                          )}
                          {isCurrentCell && (
                            <span className="w-1 h-1 rounded-full bg-sp-highlight animate-pulse mt-0.5" />
                          )}
                        </div>
                      ) : (
                        <div className={`rounded h-full flex items-center justify-center text-tiny text-sp-muted/40 ${isCurrentCell ? 'ring-2 ring-sp-highlight/50' : ''}`}>
                          공강
                        </div>
                      )}
                    </div>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
