import { useState, useEffect, useMemo } from 'react';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { getDayOfWeek, getCurrentPeriod } from '@domain/rules/periodRules';
import type { TeacherPeriod, ClassPeriod } from '@domain/entities/Timetable';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';

/** 과목별 컬러 맵 */
const SUBJECT_COLORS: Record<string, string> = {
  '국어': 'text-yellow-400',
  '영어': 'text-green-400',
  '수학': 'text-blue-400',
  '과학': 'text-purple-400',
  '사회': 'text-orange-400',
  '체육': 'text-red-400',
  '음악': 'text-pink-400',
  '미술': 'text-indigo-400',
  '창체': 'text-teal-400',
};

/** 과목별 배경 도트 컬러 */
const SUBJECT_DOT_COLORS: Record<string, string> = {
  '국어': 'bg-yellow-400',
  '영어': 'bg-green-400',
  '수학': 'bg-blue-400',
  '과학': 'bg-purple-400',
  '사회': 'bg-orange-400',
  '체육': 'bg-red-400',
  '음악': 'bg-pink-400',
  '미술': 'bg-indigo-400',
  '창체': 'bg-teal-400',
};

type TabType = 'class' | 'teacher';

export function DashboardTimetable() {
  const { classSchedule, teacherSchedule, load: loadSchedule } = useScheduleStore();
  const { settings, load: loadSettings } = useSettingsStore();
  const [tab, setTab] = useState<TabType>('teacher');
  const [now, setNow] = useState(new Date());

  // 초기 데이터 로드
  useEffect(() => {
    void loadSchedule();
    void loadSettings();
  }, [loadSchedule, loadSettings]);

  // 1분마다 현재 시각 갱신
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const dayOfWeek = useMemo(() => getDayOfWeek(now), [now]);
  const currentPeriod = useMemo(
    () => (dayOfWeek ? getCurrentPeriod(settings.periodTimes, now) : null),
    [dayOfWeek, settings.periodTimes, now],
  );

  const isWeekend = dayOfWeek === null;

  // 교시 시간 맵 (period → PeriodTime)
  const periodTimeMap = useMemo(() => {
    const map = new Map<number, PeriodTime>();
    for (const pt of settings.periodTimes) {
      map.set(pt.period, pt);
    }
    return map;
  }, [settings.periodTimes]);

  // 오늘의 학급 시간표
  const todayClassPeriods: readonly ClassPeriod[] = useMemo(() => {
    if (!dayOfWeek) return [];
    return classSchedule[dayOfWeek] ?? [];
  }, [dayOfWeek, classSchedule]);

  // 오늘의 교사 시간표
  const todayTeacherPeriods: readonly (TeacherPeriod | null)[] = useMemo(() => {
    if (!dayOfWeek) return [];
    return teacherSchedule[dayOfWeek] ?? [];
  }, [dayOfWeek, teacherSchedule]);

  return (
    <div className="rounded-xl bg-sp-card p-4 h-full flex flex-col">
      {/* 헤더 */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-sp-text">
          오늘의 시간표
        </h3>
        <div className="flex rounded-lg bg-sp-surface p-0.5">
          <TabButton
            active={tab === 'teacher'}
            onClick={() => setTab('teacher')}
            label="교사"
          />
          <TabButton
            active={tab === 'class'}
            onClick={() => setTab('class')}
            label="학급"
          />
        </div>
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 min-h-0 overflow-auto">
        {isWeekend ? (
          <WeekendMessage />
        ) : tab === 'class' ? (
          <ClassTimetableList
            periods={todayClassPeriods}
            periodTimeMap={periodTimeMap}
            currentPeriod={currentPeriod}
            maxPeriods={settings.maxPeriods}
          />
        ) : (
          <TeacherTimetableList
            periods={todayTeacherPeriods}
            periodTimeMap={periodTimeMap}
            currentPeriod={currentPeriod}
            maxPeriods={settings.maxPeriods}
          />
        )}
      </div>
    </div>
  );
}

/* ─── 서브 컴포넌트 ─── */

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
}

function TabButton({ active, onClick, label }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-sp-accent text-white'
          : 'text-sp-muted hover:text-sp-text'
      }`}
    >
      {label}
    </button>
  );
}

function WeekendMessage() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-sp-muted">
      <span className="mb-2 text-3xl">🎉</span>
      <p className="text-sm">주말입니다</p>
    </div>
  );
}

interface ClassTimetableListProps {
  periods: readonly ClassPeriod[];
  periodTimeMap: Map<number, PeriodTime>;
  currentPeriod: number | null;
  maxPeriods: number;
}

function ClassTimetableList({
  periods,
  periodTimeMap,
  currentPeriod,
  maxPeriods,
}: ClassTimetableListProps) {
  if (periods.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-sp-muted">
        시간표가 등록되지 않았습니다
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {periods.slice(0, maxPeriods).map((cp, idx) => {
        const period = idx + 1;
        const pt = periodTimeMap.get(period);
        const isCurrent = currentPeriod === period;
        const subject = cp.subject;
        const colorClass = SUBJECT_COLORS[subject] ?? 'text-sp-text';
        const dotClass = SUBJECT_DOT_COLORS[subject] ?? 'bg-sp-muted';

        return (
          <div
            key={period}
            className={`flex items-center rounded-lg px-3 py-2 transition-colors ${
              isCurrent
                ? 'border-l-2 border-sp-highlight bg-sp-highlight/10'
                : 'hover:bg-sp-surface/50'
            }`}
          >
            <span className={`w-12 text-xs font-medium ${isCurrent ? 'text-sp-highlight' : 'text-sp-muted'}`}>
              {period}교시
            </span>
            <span className={`mr-1.5 h-2 w-2 rounded-full ${dotClass}`} />
            <span className={`flex-1 text-sm font-medium ${colorClass}`}>
              {subject}
            </span>
            {cp.teacher && (
              <span className="text-xs text-sp-muted mr-1">
                {cp.teacher}
              </span>
            )}
            {pt && (
              <span className="text-xs text-sp-muted">
                {pt.start}~{pt.end}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface TeacherTimetableListProps {
  periods: readonly (TeacherPeriod | null)[];
  periodTimeMap: Map<number, PeriodTime>;
  currentPeriod: number | null;
  maxPeriods: number;
}

function TeacherTimetableList({
  periods,
  periodTimeMap,
  currentPeriod,
  maxPeriods,
}: TeacherTimetableListProps) {
  if (periods.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-sp-muted">
        시간표가 등록되지 않았습니다
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {periods.slice(0, maxPeriods).map((tp, idx) => {
        const period = idx + 1;
        const pt = periodTimeMap.get(period);
        const isCurrent = currentPeriod === period;
        const subject = tp?.subject ?? '';
        const colorClass = SUBJECT_COLORS[subject] ?? 'text-sp-text';
        const dotClass = SUBJECT_DOT_COLORS[subject] ?? 'bg-sp-muted';

        return (
          <div
            key={period}
            className={`flex items-center rounded-lg px-3 py-2 transition-colors ${
              isCurrent
                ? 'border-l-2 border-sp-highlight bg-sp-highlight/10'
                : 'hover:bg-sp-surface/50'
            }`}
          >
            <span className={`w-12 text-xs font-medium ${isCurrent ? 'text-sp-highlight' : 'text-sp-muted'}`}>
              {period}교시
            </span>
            {tp ? (
              <>
                <span className={`mr-1.5 h-2 w-2 rounded-full ${dotClass}`} />
                <span className={`flex-1 text-sm font-medium ${colorClass}`}>
                  {tp.subject}
                </span>
                <span className="text-xs text-sp-muted">
                  {tp.classroom}
                </span>
              </>
            ) : (
              <span className="flex-1 text-xs text-sp-muted">공강</span>
            )}
            {pt && tp && (
              <span className="ml-2 text-xs text-sp-muted">
                {pt.start}~{pt.end}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
