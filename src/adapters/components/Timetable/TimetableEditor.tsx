import { useState, useEffect, useMemo, useCallback } from 'react';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { DAYS_OF_WEEK } from '@domain/valueObjects/DayOfWeek';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import type { ClassScheduleData, TeacherScheduleData, TeacherPeriod } from '@domain/entities/Timetable';
import {
  getLunchBreakIndex,
  formatLunchBreakTime,
} from '@adapters/presenters/timetablePresenter';

type TabType = 'class' | 'teacher';

interface TimetableEditorProps {
  tab: TabType;
  onCancel: () => void;
  onSaved: () => void;
}

export function TimetableEditor({ tab, onCancel, onSaved }: TimetableEditorProps) {
  const { classSchedule, teacherSchedule, updateClassSchedule, updateTeacherSchedule } =
    useScheduleStore();
  const { settings } = useSettingsStore();

  // 편집용 로컬 상태 — 문자열 2D 배열 [periodIdx][dayIdx]
  const [classGrid, setClassGrid] = useState<string[][]>([]);
  const [teacherSubjectGrid, setTeacherSubjectGrid] = useState<string[][]>([]);
  const [teacherClassroomGrid, setTeacherClassroomGrid] = useState<string[][]>([]);
  const [saving, setSaving] = useState(false);

  const maxPeriods = settings.maxPeriods;

  // 초기 데이터 → 편집 그리드로 복사
  useEffect(() => {
    const cGrid: string[][] = [];
    const tSubGrid: string[][] = [];
    const tClsGrid: string[][] = [];

    for (let p = 0; p < maxPeriods; p++) {
      const cRow: string[] = [];
      const tSubRow: string[] = [];
      const tClsRow: string[] = [];

      for (const day of DAYS_OF_WEEK) {
        cRow.push((classSchedule[day] ?? [])[p] ?? '');
        const tp = (teacherSchedule[day] ?? [])[p] ?? null;
        tSubRow.push(tp?.subject ?? '');
        tClsRow.push(tp?.classroom ?? '');
      }

      cGrid.push(cRow);
      tSubGrid.push(tSubRow);
      tClsGrid.push(tClsRow);
    }

    setClassGrid(cGrid);
    setTeacherSubjectGrid(tSubGrid);
    setTeacherClassroomGrid(tClsGrid);
  }, [classSchedule, teacherSchedule, maxPeriods]);

  const lunchIndex = useMemo(
    () => getLunchBreakIndex(settings.periodTimes),
    [settings.periodTimes],
  );
  const lunchTimeStr = useMemo(
    () => (lunchIndex >= 0 ? formatLunchBreakTime(settings.periodTimes, lunchIndex) : ''),
    [settings.periodTimes, lunchIndex],
  );

  const updateClassCell = useCallback(
    (periodIdx: number, dayIdx: number, value: string) => {
      setClassGrid((prev) => {
        const next = prev.map((row) => [...row]);
        if (next[periodIdx]) {
          next[periodIdx]![dayIdx] = value;
        }
        return next;
      });
    },
    [],
  );

  const updateTeacherSubjectCell = useCallback(
    (periodIdx: number, dayIdx: number, value: string) => {
      setTeacherSubjectGrid((prev) => {
        const next = prev.map((row) => [...row]);
        if (next[periodIdx]) {
          next[periodIdx]![dayIdx] = value;
        }
        return next;
      });
    },
    [],
  );

  const updateTeacherClassroomCell = useCallback(
    (periodIdx: number, dayIdx: number, value: string) => {
      setTeacherClassroomGrid((prev) => {
        const next = prev.map((row) => [...row]);
        if (next[periodIdx]) {
          next[periodIdx]![dayIdx] = value;
        }
        return next;
      });
    },
    [],
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      if (tab === 'class') {
        const data: Record<string, string[]> = {};
        for (let d = 0; d < DAYS_OF_WEEK.length; d++) {
          const day = DAYS_OF_WEEK[d]!;
          data[day] = classGrid.map((row) => row[d] ?? '');
        }
        await updateClassSchedule(data as ClassScheduleData);
      } else {
        const data: Record<string, (TeacherPeriod | null)[]> = {};
        for (let d = 0; d < DAYS_OF_WEEK.length; d++) {
          const day = DAYS_OF_WEEK[d]!;
          data[day] = teacherSubjectGrid.map((row, p) => {
            const subject = row[d] ?? '';
            const classroom = (teacherClassroomGrid[p] ?? [])[d] ?? '';
            if (!subject) return null;
            return { subject, classroom };
          });
        }
        await updateTeacherSchedule(data as TeacherScheduleData);
      }
      onSaved();
    } catch {
      // 에러 처리 (향후 Toast 등)
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 헤더 */}
      <header className="flex flex-shrink-0 items-center justify-between pb-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <span className="text-3xl">✏️</span>
            <h2 className="text-3xl font-black text-sp-text tracking-tight">
              시간표 편집
            </h2>
          </div>
          <p className="text-sp-muted text-sm font-medium pl-1">
            {tab === 'class' ? '학급 시간표' : '교사 시간표'} 수정 중
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="rounded-xl bg-sp-surface border border-sp-border px-5 py-2.5 text-sm font-bold text-sp-muted hover:text-sp-text transition-all"
          >
            취소
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-xl bg-sp-accent px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-sp-accent/20 hover:bg-blue-600 transition-all active:scale-95 disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </header>

      {/* 편집 그리드 */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-2xl border border-sp-border bg-sp-card overflow-hidden">
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[800px] border-collapse">
                <thead>
                  <tr className="bg-slate-700/50 border-b border-sp-border">
                    <th className="px-4 py-3 text-center text-slate-200 font-bold text-sm w-20 border-r border-sp-border">
                      교시
                    </th>
                    <th className="px-4 py-3 text-center text-slate-200 font-bold text-sm w-24 border-r border-sp-border">
                      시간
                    </th>
                    {DAYS_OF_WEEK.map((day) => (
                      <th
                        key={day}
                        className="px-4 py-3 text-center text-slate-200 font-bold text-sm w-1/5 border-r border-sp-border"
                      >
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-sp-border">
                  {settings.periodTimes.slice(0, maxPeriods).map((pt, periodIdx) => (
                    <EditorPeriodRow
                      key={pt.period}
                      periodTime={pt}
                      periodIdx={periodIdx}
                      tab={tab}
                      classRow={classGrid[periodIdx] ?? []}
                      teacherSubjectRow={teacherSubjectGrid[periodIdx] ?? []}
                      teacherClassroomRow={teacherClassroomGrid[periodIdx] ?? []}
                      onClassChange={updateClassCell}
                      onTeacherSubjectChange={updateTeacherSubjectCell}
                      onTeacherClassroomChange={updateTeacherClassroomCell}
                      lunchBefore={lunchIndex === periodIdx}
                      lunchTimeStr={lunchTimeStr}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── 서브 컴포넌트 ─── */

interface EditorPeriodRowProps {
  periodTime: PeriodTime;
  periodIdx: number;
  tab: TabType;
  classRow: string[];
  teacherSubjectRow: string[];
  teacherClassroomRow: string[];
  onClassChange: (periodIdx: number, dayIdx: number, value: string) => void;
  onTeacherSubjectChange: (periodIdx: number, dayIdx: number, value: string) => void;
  onTeacherClassroomChange: (periodIdx: number, dayIdx: number, value: string) => void;
  lunchBefore: boolean;
  lunchTimeStr: string;
}

function EditorPeriodRow({
  periodTime,
  periodIdx,
  tab,
  classRow,
  teacherSubjectRow,
  teacherClassroomRow,
  onClassChange,
  onTeacherSubjectChange,
  onTeacherClassroomChange,
  lunchBefore,
  lunchTimeStr,
}: EditorPeriodRowProps) {
  return (
    <>
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

      <tr className="hover:bg-slate-800/30 transition-colors">
        <td className="px-4 py-3 text-center text-sp-muted font-medium text-sm bg-sp-card border-r border-sp-border">
          {periodTime.period}교시
        </td>
        <td className="px-4 py-3 text-center text-sp-muted text-sm border-r border-sp-border font-mono">
          {periodTime.start}
        </td>
        {DAYS_OF_WEEK.map((_, dayIdx) => (
          <td
            key={dayIdx}
            className={`p-1.5 ${dayIdx < DAYS_OF_WEEK.length - 1 ? 'border-r border-sp-border' : ''}`}
          >
            {tab === 'class' ? (
              <input
                type="text"
                value={classRow[dayIdx] ?? ''}
                onChange={(e) => onClassChange(periodIdx, dayIdx, e.target.value)}
                placeholder="과목"
                className="h-14 w-full rounded-lg bg-sp-surface border border-sp-border px-3 text-center text-sm font-medium text-sp-text placeholder:text-sp-muted/40 focus:border-sp-accent focus:outline-none focus:ring-1 focus:ring-sp-accent/50 transition-colors"
              />
            ) : (
              <div className="flex flex-col gap-1">
                <input
                  type="text"
                  value={teacherSubjectRow[dayIdx] ?? ''}
                  onChange={(e) =>
                    onTeacherSubjectChange(periodIdx, dayIdx, e.target.value)
                  }
                  placeholder="과목"
                  className="h-8 w-full rounded-md bg-sp-surface border border-sp-border px-2 text-center text-xs font-medium text-sp-text placeholder:text-sp-muted/40 focus:border-sp-accent focus:outline-none focus:ring-1 focus:ring-sp-accent/50 transition-colors"
                />
                <input
                  type="text"
                  value={teacherClassroomRow[dayIdx] ?? ''}
                  onChange={(e) =>
                    onTeacherClassroomChange(periodIdx, dayIdx, e.target.value)
                  }
                  placeholder="학급"
                  className="h-6 w-full rounded-md bg-sp-surface border border-sp-border px-2 text-center text-xs text-sp-muted placeholder:text-sp-muted/40 focus:border-sp-accent focus:outline-none focus:ring-1 focus:ring-sp-accent/50 transition-colors"
                />
              </div>
            )}
          </td>
        ))}
      </tr>
    </>
  );
}

