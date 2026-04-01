import { useState, useEffect, useMemo } from 'react';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { getDayOfWeek, getCurrentPeriod } from '@domain/rules/periodRules';
import type { TeacherPeriod, ClassPeriod } from '@domain/entities/Timetable';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import type { SubjectColorMap } from '@domain/valueObjects/SubjectColor';
import { getSubjectTextColor, getSubjectDotColor, getCellStyle, getCellDotColor } from '@adapters/presenters/timetablePresenter';
import { toLocalDateString } from '@shared/utils/localDate';

type TabType = 'class' | 'teacher';

export function DashboardTimetable() {
  const { classSchedule, teacherSchedule, overrides, getEffectiveTeacherSchedule, load: loadSchedule } = useScheduleStore();
  const { settings, load: loadSettings } = useSettingsStore();
  const [tab, setTab] = useState<TabType>(() => {
    try {
      const saved = localStorage.getItem('ssampin:timetable-tab');
      if (saved === 'class' || saved === 'teacher') return saved;
    } catch { /* ignore */ }
    return 'teacher';
  });

  const handleTabChange = (newTab: TabType) => {
    setTab(newTab);
    try { localStorage.setItem('ssampin:timetable-tab', newTab); } catch { /* ignore */ }
  };
  const [now, setNow] = useState(new Date());

  // 초기 데이터 로드
  useEffect(() => {
    void loadSchedule();
    void loadSettings();
  }, [loadSchedule, loadSettings]);

  // data:changed 이벤트 직접 구독 (위젯 창에서 즉시 반영)
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onDataChanged) return;
    const unsub = api.onDataChanged((filename: string) => {
      if (
        filename === 'teacher-schedule' ||
        filename === 'class-schedule' ||
        filename === 'settings'
      ) {
        useScheduleStore.setState({ loaded: false });
        void loadSchedule();
        if (filename === 'settings') {
          useSettingsStore.setState({ loaded: false });
          void loadSettings();
        }
      }
    });
    return unsub;
  }, [loadSchedule, loadSettings]);

  // 1분마다 현재 시각 갱신 + Electron 절전 복귀 시 즉시 갱신
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);

    // Electron 절전 복귀 시 즉시 갱신 (위젯 창에서 visibilitychange가 안 발동하므로)
    const unsubResume = window.electronAPI?.onSystemResume?.(() => {
      setNow(new Date());
      void loadSchedule();
      void loadSettings();
    });

    return () => {
      clearInterval(timer);
      unsubResume?.();
    };
  }, [loadSchedule, loadSettings]);

  const weekendDays = settings.enableWeekendDays;
  const dayOfWeek = useMemo(() => getDayOfWeek(now, weekendDays), [now, weekendDays]);
  const currentPeriod = useMemo(
    () => (dayOfWeek ? getCurrentPeriod(settings.periodTimes, now) : null),
    [dayOfWeek, settings.periodTimes, now],
  );

  const colorBy = settings.timetableColorBy ?? (settings.schoolLevel === 'elementary' ? 'subject' : 'classroom');
  const classroomColors = settings.classroomColors;
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

  // 오늘의 교사 시간표 (오버라이드 적용)
  const todayStr = useMemo(() => toLocalDateString(now), [now]);
  const todayTeacherPeriods: readonly (TeacherPeriod | null)[] = useMemo(() => {
    if (!dayOfWeek) return [];
    return getEffectiveTeacherSchedule(todayStr, weekendDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayOfWeek, todayStr, teacherSchedule, overrides]);

  return (
    <div className="rounded-xl bg-sp-card p-4 h-full flex flex-col">
      {/* 헤더 */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-sp-text flex items-center gap-1.5">
          <span>🕐</span>
          오늘의 시간표
        </h3>
        <div className="flex rounded-lg bg-sp-surface p-0.5">
          <TabButton
            active={tab === 'teacher'}
            onClick={() => handleTabChange('teacher')}
            label="교사"
          />
          <TabButton
            active={tab === 'class'}
            onClick={() => handleTabChange('class')}
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
            subjectColors={settings.subjectColors}
          />
        ) : (
          <TeacherTimetableList
            periods={todayTeacherPeriods}
            periodTimeMap={periodTimeMap}
            currentPeriod={currentPeriod}
            maxPeriods={settings.maxPeriods}
            subjectColors={settings.subjectColors}
            classroomColors={classroomColors}
            colorBy={colorBy}
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
          ? 'bg-sp-accent text-sp-accent-fg'
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
  subjectColors?: SubjectColorMap;
}

function ClassTimetableList({
  periods,
  periodTimeMap,
  currentPeriod,
  maxPeriods,
  subjectColors,
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
      {periods.slice(0, Math.max(periods.length, maxPeriods)).map((cp, idx) => {
        const period = idx + 1;
        const pt = periodTimeMap.get(period);
        const isCurrent = currentPeriod === period;
        const subject = cp.subject;
        const colorClass = getSubjectTextColor(subject, subjectColors) ?? 'text-sp-text';
        const dotClass = getSubjectDotColor(subject, subjectColors) ?? 'bg-sp-muted';

        return (
          <div
            key={period}
            className={`flex items-center rounded-lg px-3 py-2 transition-colors ${
              isCurrent
                ? 'border-l-[3px] border-sp-highlight bg-sp-highlight/15 ring-1 ring-sp-highlight/20 shadow-sm shadow-sp-highlight/10'
                : 'hover:bg-sp-surface/50'
            }`}
          >
            <span className={`w-12 text-xs ${isCurrent ? 'text-sp-highlight font-bold' : 'text-sp-muted font-medium'}`}>
              {period}교시
            </span>
            {isCurrent && (
              <span className="w-1.5 h-1.5 rounded-full bg-sp-highlight animate-pulse mr-1.5 shrink-0" />
            )}
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
  subjectColors?: SubjectColorMap;
  classroomColors?: SubjectColorMap;
  colorBy: 'subject' | 'classroom';
}

function TeacherTimetableList({
  periods,
  periodTimeMap,
  currentPeriod,
  maxPeriods,
  subjectColors,
  classroomColors,
  colorBy,
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
      {periods.slice(0, Math.max(periods.length, maxPeriods)).map((tp, idx) => {
        const period = idx + 1;
        const pt = periodTimeMap.get(period);
        const isCurrent = currentPeriod === period;
        const subject = tp?.subject ?? '';
        const cellStyle = tp ? getCellStyle(subject, tp.classroom, colorBy, subjectColors, classroomColors) : null;
        const dotClass = tp ? getCellDotColor(subject, tp.classroom, colorBy, subjectColors, classroomColors) : 'bg-sp-muted';

        return (
          <div
            key={period}
            className={`flex items-center rounded-lg px-3 py-2 transition-colors ${
              isCurrent
                ? 'border-l-[3px] border-sp-highlight bg-sp-highlight/15 ring-1 ring-sp-highlight/20 shadow-sm shadow-sp-highlight/10'
                : 'hover:bg-sp-surface/50'
            }`}
          >
            <span className={`w-12 text-xs ${isCurrent ? 'text-sp-highlight font-bold' : 'text-sp-muted font-medium'}`}>
              {period}교시
            </span>
            {isCurrent && (
              <span className="w-1.5 h-1.5 rounded-full bg-sp-highlight animate-pulse mr-1.5 shrink-0" />
            )}
            {tp ? (
              <>
                <span className={`mr-1.5 h-2 w-2 rounded-full ${dotClass}`} />
                <span className={`flex-1 text-sm font-medium ${cellStyle?.text ?? 'text-sp-text'}`}>
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
