import { useEffect, useMemo } from 'react';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { getCellWidgetStyle } from '@adapters/presenters/timetablePresenter';
import { useWidgetRefresh } from '../hooks/useWidgetRefresh';
import type { TeacherPeriod } from '@domain/entities/Timetable';

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

  const colorBy = settings.timetableColorBy ?? (settings.schoolLevel === 'elementary' ? 'subject' : 'classroom');
  const classroomColors = settings.classroomColors;
  const maxPeriods = settings.maxPeriods;

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
      <div className="flex-1 min-h-0 overflow-auto">
      <table className="w-full text-xs border-collapse timetable-grid">
        <thead>
          <tr>
            <th className="w-10 py-1 text-sp-muted font-medium border-b"></th>
            {DAYS.map(({ key, label }) => (
              <th key={key} className="py-1 text-center text-sp-muted font-medium border-b border-l">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => (
            <tr key={period}>
              <td className="py-1 text-center text-sp-muted text-[11px] border-b">{period}</td>
              {DAYS.map(({ key }) => {
                const dayData = teacherSchedule[key] as readonly (TeacherPeriod | null)[] | undefined;
                const tp = dayData?.[period - 1] ?? null;
                const subject = tp?.subject ?? '';
                const colorClass = subject ? getCellWidgetStyle(subject, tp?.classroom, colorBy, settings.subjectColors, classroomColors) : 'bg-sp-surface/50 text-sp-muted';

                return (
                  <td key={key} className="p-0.5 border-b border-l">
                    {tp ? (
                      <div className={`rounded px-1 py-1 text-center text-[11px] font-medium ${colorClass}`}>
                        <div>{tp.subject}</div>
                        {tp.classroom && (
                          <div className="text-[9px] opacity-60">{tp.classroom}</div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded px-1 py-1 text-center text-[11px] text-sp-border">
                        -
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
