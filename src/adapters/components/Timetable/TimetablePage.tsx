import { useState, useEffect, useMemo } from 'react';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { getDayOfWeek, getCurrentPeriod } from '@domain/rules/periodRules';
import { DAYS_OF_WEEK } from '@domain/valueObjects/DayOfWeek';
import type { DayOfWeek } from '@domain/valueObjects/DayOfWeek';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import type { TeacherPeriod } from '@domain/entities/Timetable';
import {
  getSubjectStyle,
  getLunchBreakIndex,
  formatLunchBreakTime,
} from '@adapters/presenters/timetablePresenter';
import { TimetableEditor } from './TimetableEditor';

type TabType = 'class' | 'teacher';

export function TimetablePage() {
  const { classSchedule, teacherSchedule, load: loadSchedule } = useScheduleStore();
  const { settings, load: loadSettings } = useSettingsStore();
  const [tab, setTab] = useState<TabType>('class');
  const [isEditing, setIsEditing] = useState(false);
  const [now, setNow] = useState(new Date());

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

  const lunchIndex = useMemo(
    () => getLunchBreakIndex(settings.periodTimes),
    [settings.periodTimes],
  );
  const lunchTimeStr = useMemo(
    () => (lunchIndex >= 0 ? formatLunchBreakTime(settings.periodTimes, lunchIndex) : ''),
    [settings.periodTimes, lunchIndex],
  );

  const { className, teacherName } = settings;
  const yearStr = `${now.getFullYear()}학년도`;
  const semester = now.getMonth() < 8 ? '1학기' : '2학기';
  const infoLabel = className || teacherName
    ? `${className}  |  담임: ${teacherName}  |  ${yearStr} ${semester}`
    : `${yearStr} ${semester}`;

  if (isEditing) {
    return (
      <TimetableEditor
        tab={tab}
        onCancel={() => setIsEditing(false)}
        onSaved={() => setIsEditing(false)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 헤더 */}
      <header className="flex flex-shrink-0 items-center justify-between pb-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📅</span>
            <h2 className="text-3xl font-black text-sp-text tracking-tight">시간표</h2>
          </div>
          <p className="text-sp-muted text-sm font-medium pl-1">
            {yearStr} {semester} | 주간 시간표
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* 탭 토글 */}
          <div className="flex rounded-xl bg-sp-surface p-1 border border-sp-border">
            <TabButton active={tab === 'class'} onClick={() => setTab('class')} label="학급 시간표" />
            <TabButton active={tab === 'teacher'} onClick={() => setTab('teacher')} label="교사 시간표" />
          </div>
          {/* 편집 버튼 */}
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2 rounded-xl bg-sp-surface border border-sp-border px-4 py-2.5 text-sm font-bold text-sp-text hover:bg-sp-card transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-[20px]">edit</span>
            <span>편집</span>
          </button>
          {/* 내보내기 */}
          <button className="flex items-center gap-2 rounded-xl bg-sp-surface border border-sp-border px-4 py-2.5 text-sm font-bold text-sp-text hover:bg-sp-card transition-all active:scale-95">
            <span className="material-symbols-outlined text-[20px]">download</span>
            <span>내보내기</span>
          </button>
        </div>
      </header>

      {/* 시간표 그리드 */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl flex flex-col gap-6">
          <div className="rounded-2xl border border-sp-border bg-sp-card overflow-hidden shadow-2xl shadow-black/20">
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[800px] border-collapse">
                <TimetableHeader dayOfWeek={dayOfWeek} />
                <tbody className="divide-y divide-sp-border">
                  {settings.periodTimes.slice(0, settings.maxPeriods).map((pt, idx) => {
                    const periodNum = pt.period;
                    const isCurrent = currentPeriod === periodNum;

                    return (
                      <PeriodRow
                        key={periodNum}
                        periodTime={pt}
                        isCurrent={isCurrent}
                        dayOfWeek={dayOfWeek}
                        tab={tab}
                        classSubjects={DAYS_OF_WEEK.map(
                          (d) => (classSchedule[d] ?? [])[idx] ?? '',
                        )}
                        teacherPeriods={DAYS_OF_WEEK.map(
                          (d) => (teacherSchedule[d] ?? [])[idx] ?? null,
                        )}
                        lunchBefore={lunchIndex === idx}
                        lunchTimeStr={lunchTimeStr}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 하단 정보 */}
          <div className="flex items-center justify-center py-4 bg-sp-card/50 rounded-xl border border-sp-border border-dashed">
            <span className="text-sp-muted font-medium text-sm">{infoLabel}</span>
          </div>
        </div>
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
      className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
        active
          ? 'bg-sp-accent text-white shadow-md'
          : 'text-sp-muted hover:text-sp-text'
      }`}
    >
      {label}
    </button>
  );
}

interface TimetableHeaderProps {
  dayOfWeek: DayOfWeek | null;
}

function TimetableHeader({ dayOfWeek }: TimetableHeaderProps) {
  return (
    <thead>
      <tr className="bg-slate-700/50 border-b border-sp-border">
        <th className="px-4 py-4 text-center text-slate-200 font-bold text-sm w-20 border-r border-sp-border">
          교시
        </th>
        <th className="px-4 py-4 text-center text-slate-200 font-bold text-sm w-24 border-r border-sp-border">
          시간
        </th>
        {DAYS_OF_WEEK.map((day) => {
          const isToday = day === dayOfWeek;
          return (
            <th
              key={day}
              className={`px-4 py-4 text-center font-bold text-sm w-1/5 border-r border-sp-border relative ${
                isToday ? 'text-sp-accent bg-sp-accent/10' : 'text-slate-200'
              }`}
            >
              {isToday && (
                <div className="absolute top-0 left-0 w-full h-1 bg-sp-accent" />
              )}
              {day}
              {isToday && (
                <span className="ml-1 text-xs font-medium">(Today)</span>
              )}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

interface PeriodRowProps {
  periodTime: PeriodTime;
  isCurrent: boolean;
  dayOfWeek: DayOfWeek | null;
  tab: TabType;
  classSubjects: string[];
  teacherPeriods: (TeacherPeriod | null)[];
  lunchBefore: boolean;
  lunchTimeStr: string;
}

function PeriodRow({
  periodTime,
  isCurrent,
  dayOfWeek,
  tab,
  classSubjects,
  teacherPeriods,
  lunchBefore,
  lunchTimeStr,
}: PeriodRowProps) {
  return (
    <>
      {/* 점심시간 행 */}
      {lunchBefore && (
        <tr className="bg-slate-800/80">
          <td className="px-4 py-3 text-center text-sp-muted font-medium text-sm bg-slate-800 border-r border-sp-border">
            점심
          </td>
          <td className="px-4 py-3 text-center text-sp-muted text-sm border-r border-sp-border font-mono">
            {lunchTimeStr.split(' ~ ')[0]}
          </td>
          <td
            className="px-4 py-3 text-center text-slate-500 text-sm font-medium tracking-wide"
            colSpan={5}
          >
            🍽️ 점심시간 ({lunchTimeStr})
          </td>
        </tr>
      )}

      {/* 교시 행 */}
      <tr
        className={
          isCurrent
            ? 'relative z-10'
            : 'group hover:bg-slate-800/50 transition-colors'
        }
      >
        {/* 교시 셀 */}
        <td
          className={`px-4 py-4 text-center font-medium text-sm border-r border-sp-border ${
            isCurrent
              ? 'text-amber-400 font-bold border-l-4 border-l-amber-400 bg-sp-card'
              : 'text-sp-muted bg-sp-card'
          }`}
        >
          {periodTime.period}교시
        </td>

        {/* 시간 셀 */}
        <td
          className={`px-4 py-4 text-center text-sm border-r border-sp-border font-mono ${
            isCurrent ? 'text-amber-400 font-bold' : 'text-sp-muted'
          }`}
        >
          {periodTime.start}
        </td>

        {/* 요일별 과목 셀 */}
        {DAYS_OF_WEEK.map((day, dayIdx) => {
          const isToday = day === dayOfWeek;

          if (tab === 'class') {
            const subject = classSubjects[dayIdx] ?? '';
            return (
              <SubjectCell
                key={day}
                subject={subject}
                isToday={isToday}
                isCurrent={isCurrent && isToday}
                isLastCol={dayIdx === DAYS_OF_WEEK.length - 1}
              />
            );
          }

          const tp = teacherPeriods[dayIdx] ?? null;
          return (
            <TeacherCell
              key={day}
              period={tp}
              isToday={isToday}
              isCurrent={isCurrent && isToday}
              isLastCol={dayIdx === DAYS_OF_WEEK.length - 1}
            />
          );
        })}
      </tr>
    </>
  );
}

interface SubjectCellProps {
  subject: string;
  isToday: boolean;
  isCurrent: boolean;
  isLastCol: boolean;
}

function SubjectCell({ subject, isToday, isCurrent, isLastCol }: SubjectCellProps) {
  if (!subject) {
    return (
      <td
        className={`p-2 ${!isLastCol ? 'border-r border-sp-border' : ''} ${
          isToday ? 'bg-sp-accent/5' : ''
        }`}
      >
        <div className="h-14 w-full flex items-center justify-center text-sp-muted text-sm">
          —
        </div>
      </td>
    );
  }

  const style = getSubjectStyle(subject);

  if (isCurrent) {
    return (
      <td
        className={`p-2 relative ${!isLastCol ? 'border-r border-sp-border' : ''} ${
          isToday ? 'bg-sp-accent/5' : ''
        }`}
      >
        <div className="absolute inset-0 bg-amber-500/10 pointer-events-none animate-pulse" />
        <div
          className={`h-14 w-full rounded-lg ${style.bg} border-2 border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.3)] flex items-center justify-center ${style.text} font-bold text-sm relative z-20`}
        >
          <span>{subject}</span>
          <span className="block w-2 h-2 rounded-full bg-amber-400 animate-ping absolute -top-1 -right-1" />
        </div>
      </td>
    );
  }

  return (
    <td
      className={`p-2 ${!isLastCol ? 'border-r border-sp-border' : ''} ${
        isToday ? 'bg-sp-accent/5' : ''
      }`}
    >
      <div
        className={`h-14 w-full rounded-lg ${style.bg} border ${style.border} flex items-center justify-center ${style.text} font-bold text-sm`}
      >
        {subject}
      </div>
    </td>
  );
}

interface TeacherCellProps {
  period: TeacherPeriod | null;
  isToday: boolean;
  isCurrent: boolean;
  isLastCol: boolean;
}

function TeacherCell({ period, isToday, isCurrent, isLastCol }: TeacherCellProps) {
  if (!period) {
    return (
      <td
        className={`p-2 ${!isLastCol ? 'border-r border-sp-border' : ''} ${
          isToday ? 'bg-sp-accent/5' : ''
        }`}
      >
        <div className="h-14 w-full flex items-center justify-center text-sp-muted/50 text-xs">
          공강
        </div>
      </td>
    );
  }

  const style = getSubjectStyle(period.subject);

  const cellContent = (
    <div className="flex flex-col items-center justify-center gap-0.5">
      <span className={`${style.text} font-bold text-sm`}>{period.subject}</span>
      <span className="text-sp-muted text-xs">{period.classroom}</span>
    </div>
  );

  if (isCurrent) {
    return (
      <td
        className={`p-2 relative ${!isLastCol ? 'border-r border-sp-border' : ''} ${
          isToday ? 'bg-sp-accent/5' : ''
        }`}
      >
        <div className="absolute inset-0 bg-amber-500/10 pointer-events-none animate-pulse" />
        <div
          className={`h-14 w-full rounded-lg ${style.bg} border-2 border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.3)] flex items-center justify-center relative z-20`}
        >
          {cellContent}
          <span className="block w-2 h-2 rounded-full bg-amber-400 animate-ping absolute -top-1 -right-1" />
        </div>
      </td>
    );
  }

  return (
    <td
      className={`p-2 ${!isLastCol ? 'border-r border-sp-border' : ''} ${
        isToday ? 'bg-sp-accent/5' : ''
      }`}
    >
      <div
        className={`h-14 w-full rounded-lg ${style.bg} border ${style.border} flex items-center justify-center`}
      >
        {cellContent}
      </div>
    </td>
  );
}
