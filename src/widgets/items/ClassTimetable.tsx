import { Fragment, useEffect, useMemo } from 'react';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { getSubjectWidgetStyle } from '@adapters/presenters/timetablePresenter';
import { toLocalDateString } from '@shared/utils/localDate';
import type { ClassPeriod } from '@domain/entities/Timetable';

import type { DayOfWeek } from '@domain/valueObjects/DayOfWeek';

const DAYS: readonly { key: DayOfWeek; label: string }[] = [
  { key: '월', label: '월' },
  { key: '화', label: '화' },
  { key: '수', label: '수' },
  { key: '목', label: '목' },
  { key: '금', label: '금' },
];


/**
 * 학급 시간표 위젯 (초등 담임용)
 * 월~금 학급 시간표를 격자로 보여줌
 */
export function ClassTimetable() {
  const { classSchedule, overrides, getEffectiveClassSchedule, load: loadSchedule } = useScheduleStore();
  const { settings, load: loadSettings } = useSettingsStore();

  useEffect(() => {
    void loadSchedule();
    void loadSettings();
  }, [loadSchedule, loadSettings]);

  const maxPeriods = settings.maxPeriods;
  const weekendDays = settings.enableWeekendDays;

  const periods = useMemo(() => {
    return Array.from({ length: maxPeriods }, (_, i) => i + 1);
  }, [maxPeriods]);

  const isEmpty = useMemo(() => {
    return DAYS.every(({ key }) => {
      const dayData = classSchedule[key];
      return !dayData || dayData.length === 0;
    });
  }, [classSchedule]);

  // 이번 주 월~금 날짜 + override 병합된 유효 학급 시간표
  const effectiveByDay = useMemo(() => {
    const now = new Date();
    const result = new Map<DayOfWeek, readonly ClassPeriod[]>();
    const jsDay = now.getDay();
    const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    DAYS.forEach(({ key }, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      result.set(key, getEffectiveClassSchedule(toLocalDateString(d), weekendDays));
    });
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classSchedule, overrides, weekendDays]);

  if (isEmpty) {
    return (
      <div className="rounded-xl bg-sp-card p-4 h-full flex flex-col">
        <div className="py-6 text-center text-sm text-sp-muted">
          학급 시간표가 등록되지 않았습니다
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-sp-card p-4 h-full flex flex-col overflow-hidden">
      <div className="mb-3 flex items-center justify-between shrink-0">
        <h3 className="text-sm font-bold text-sp-text flex items-center gap-1.5"><span>📋</span>학급 시간표</h3>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <div
          className="grid gap-px bg-sp-border/20 h-full"
          style={{
            gridTemplateColumns: `2.5rem repeat(${DAYS.length}, 1fr)`,
            gridTemplateRows: `auto repeat(${periods.length}, 1fr)`,
          }}
        >
          {/* 헤더 행 */}
          <div className="bg-sp-card" />
          {DAYS.map(({ key, label }) => (
            <div key={key} className="bg-sp-card py-1 text-center text-sp-muted text-xs font-medium">
              {label}
            </div>
          ))}

          {/* 교시별 행 */}
          {periods.map((period) => (
            <Fragment key={period}>
              <div className="bg-sp-card flex items-center justify-center text-sp-muted text-xs">
                {period}
              </div>
              {DAYS.map(({ key }) => {
                const dayData = effectiveByDay.get(key);
                const cp = dayData?.[period - 1];
                const subject = cp?.subject ?? '';
                const colorClass = subject
                  ? getSubjectWidgetStyle(subject, settings.subjectColors)
                  : 'bg-sp-surface/50 text-sp-muted';

                return (
                  <div key={key} className="bg-sp-card p-0.5">
                    {subject ? (
                      <div className={`rounded h-full flex items-center justify-center text-xs font-medium ${colorClass}`}>
                        {subject}
                      </div>
                    ) : (
                      <div className="rounded h-full flex items-center justify-center text-xs text-sp-border">
                        -
                      </div>
                    )}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
