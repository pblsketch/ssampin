import { useEffect, useMemo } from 'react';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import type { TeacherPeriod } from '@domain/entities/Timetable';

import type { DayOfWeek } from '@domain/valueObjects/DayOfWeek';

const DAYS: readonly { key: DayOfWeek; label: string }[] = [
  { key: '월', label: '월' },
  { key: '화', label: '화' },
  { key: '수', label: '수' },
  { key: '목', label: '목' },
  { key: '금', label: '금' },
];

const SUBJECT_BG: Record<string, string> = {
  '국어': 'bg-yellow-500/20 text-yellow-300',
  '영어': 'bg-green-500/20 text-green-300',
  '수학': 'bg-blue-500/20 text-blue-300',
  '과학': 'bg-purple-500/20 text-purple-300',
  '사회': 'bg-orange-500/20 text-orange-300',
  '체육': 'bg-red-500/20 text-red-300',
  '음악': 'bg-pink-500/20 text-pink-300',
  '미술': 'bg-indigo-500/20 text-indigo-300',
  '창체': 'bg-teal-500/20 text-teal-300',
};

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
      <div className="rounded-xl bg-sp-card p-4">
        <div className="py-6 text-center text-sm text-sp-muted">
          시간표가 등록되지 않았습니다
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-sp-card p-4 overflow-x-auto">
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
                const colorClass = SUBJECT_BG[subject] ?? 'bg-sp-surface/50 text-sp-muted';

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
  );
}
