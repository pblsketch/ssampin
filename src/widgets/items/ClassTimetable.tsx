import { Fragment, useEffect, useMemo } from 'react';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { getSubjectWidgetStyle } from '@adapters/presenters/timetablePresenter';

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
  const { classSchedule, load: loadSchedule } = useScheduleStore();
  const { settings, load: loadSettings } = useSettingsStore();

  useEffect(() => {
    void loadSchedule();
    void loadSettings();
  }, [loadSchedule, loadSettings]);

  const maxPeriods = settings.maxPeriods;

  const periods = useMemo(() => {
    return Array.from({ length: maxPeriods }, (_, i) => i + 1);
  }, [maxPeriods]);

  const isEmpty = useMemo(() => {
    return DAYS.every(({ key }) => {
      const dayData = classSchedule[key];
      return !dayData || dayData.length === 0;
    });
  }, [classSchedule]);

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
              <div className="bg-sp-card flex items-center justify-center text-sp-muted text-[11px]">
                {period}
              </div>
              {DAYS.map(({ key }) => {
                const dayData = classSchedule[key];
                const cp = dayData?.[period - 1];
                const subject = cp?.subject ?? '';
                const colorClass = subject
                  ? getSubjectWidgetStyle(subject, settings.subjectColors)
                  : 'bg-sp-surface/50 text-sp-muted';

                return (
                  <div key={key} className="bg-sp-card p-0.5">
                    {subject ? (
                      <div className={`rounded h-full flex items-center justify-center text-[11px] font-medium ${colorClass}`}>
                        {subject}
                      </div>
                    ) : (
                      <div className="rounded h-full flex items-center justify-center text-[11px] text-sp-border">
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
