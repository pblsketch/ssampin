import { useState, useEffect, useMemo, useCallback } from 'react';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { DAYS_OF_WEEK } from '@domain/valueObjects/DayOfWeek';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import type { ClassScheduleData, TeacherScheduleData, TeacherPeriod, ClassPeriod } from '@domain/entities/Timetable';
import { parseMinutes } from '@domain/rules/periodRules';
import {
  getLunchBreakIndex,
  formatLunchBreakTime,
} from '@adapters/presenters/timetablePresenter';
import { NeisImportModal } from './NeisImportModal';

type TabType = 'class' | 'teacher';

interface TimetableEditorProps {
  tab: TabType;
  onCancel: () => void;
  onSaved: () => void;
}

const MAX_PERIODS_LIMIT = 10;
const MIN_PERIODS_LIMIT = 1;

const PERIOD_DURATION_MAP: Record<string, number> = {
  elementary: 40,
  middle: 45,
  high: 50,
};

function formatTimeFromMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function TimetableEditor({ tab, onCancel, onSaved }: TimetableEditorProps) {
  const {
    classSchedule, teacherSchedule, updateClassSchedule, updateTeacherSchedule,
    undo, redo, clearAll, canUndo, canRedo,
  } = useScheduleStore();
  const { settings, update: updateSettings } = useSettingsStore();

  // 편집용 로컬 상태 — 문자열 2D 배열 [periodIdx][dayIdx]
  const [classGrid, setClassGrid] = useState<string[][]>([]);          // 학급: 과목
  const [classTeacherGrid, setClassTeacherGrid] = useState<string[][]>([]); // 학급: 담당 교사
  const [teacherSubjectGrid, setTeacherSubjectGrid] = useState<string[][]>([]);
  const [teacherClassroomGrid, setTeacherClassroomGrid] = useState<string[][]>([]);
  const [saving, setSaving] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showNeisImport, setShowNeisImport] = useState(false);

  const maxPeriods = settings.maxPeriods;

  // 로컬 교시 관리 상태
  const [localMaxPeriods, setLocalMaxPeriods] = useState(maxPeriods);
  const [localPeriodTimes, setLocalPeriodTimes] = useState<PeriodTime[]>(
    () => [...settings.periodTimes],
  );

  // 초기 데이터 → 편집 그리드로 복사
  useEffect(() => {
    const cGrid: string[][] = [];
    const cTchGrid: string[][] = [];
    const tSubGrid: string[][] = [];
    const tClsGrid: string[][] = [];

    for (let p = 0; p < maxPeriods; p++) {
      const cRow: string[] = [];
      const cTchRow: string[] = [];
      const tSubRow: string[] = [];
      const tClsRow: string[] = [];

      for (const day of DAYS_OF_WEEK) {
        const cp = (classSchedule[day] ?? [])[p];
        cRow.push(cp?.subject ?? '');
        cTchRow.push(cp?.teacher ?? '');
        const tp = (teacherSchedule[day] ?? [])[p] ?? null;
        tSubRow.push(tp?.subject ?? '');
        tClsRow.push(tp?.classroom ?? '');
      }

      cGrid.push(cRow);
      cTchGrid.push(cTchRow);
      tSubGrid.push(tSubRow);
      tClsGrid.push(tClsRow);
    }

    setClassGrid(cGrid);
    setClassTeacherGrid(cTchGrid);
    setTeacherSubjectGrid(tSubGrid);
    setTeacherClassroomGrid(tClsGrid);
  }, [classSchedule, teacherSchedule, maxPeriods]);

  // Ctrl+Z / Ctrl+Shift+Z 키보드 단축키 (input 포커스 시 제외)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (canUndo()) { e.preventDefault(); void undo(); }
      }
      if (
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') ||
        ((e.ctrlKey || e.metaKey) && e.key === 'y')
      ) {
        if (canRedo()) { e.preventDefault(); void redo(); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, canUndo, canRedo]);

  const visiblePeriodTimes = useMemo(
    () => localPeriodTimes.slice(0, localMaxPeriods),
    [localPeriodTimes, localMaxPeriods],
  );

  const lunchIndex = useMemo(
    () => getLunchBreakIndex(visiblePeriodTimes),
    [visiblePeriodTimes],
  );
  const lunchTimeStr = useMemo(
    () => (lunchIndex >= 0 ? formatLunchBreakTime(visiblePeriodTimes, lunchIndex) : ''),
    [visiblePeriodTimes, lunchIndex],
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

  const updateClassTeacherCell = useCallback(
    (periodIdx: number, dayIdx: number, value: string) => {
      setClassTeacherGrid((prev) => {
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

  // 교시 추가
  const addPeriod = useCallback(() => {
    if (localMaxPeriods >= MAX_PERIODS_LIMIT) return;
    const newCount = localMaxPeriods + 1;

    // 새 교시의 PeriodTime이 없으면 생성
    if (localPeriodTimes.length < newCount) {
      const dur = PERIOD_DURATION_MAP[settings.schoolLevel] ?? 45;
      const breakMin = 10;
      const lastPt = localPeriodTimes[localPeriodTimes.length - 1];
      const startMin = lastPt ? parseMinutes(lastPt.end) + breakMin : parseMinutes('08:50');
      const endMin = startMin + dur;

      setLocalPeriodTimes((prev) => [
        ...prev,
        { period: newCount, start: formatTimeFromMinutes(startMin), end: formatTimeFromMinutes(endMin) },
      ]);
    }

    // 그리드 행이 부족하면 추가
    if (classGrid.length < newCount) {
      setClassGrid((prev) => [...prev, DAYS_OF_WEEK.map(() => '')]);
      setClassTeacherGrid((prev) => [...prev, DAYS_OF_WEEK.map(() => '')]);
      setTeacherSubjectGrid((prev) => [...prev, DAYS_OF_WEEK.map(() => '')]);
      setTeacherClassroomGrid((prev) => [...prev, DAYS_OF_WEEK.map(() => '')]);
    }

    setLocalMaxPeriods(newCount);
  }, [localMaxPeriods, localPeriodTimes, classGrid.length, settings.schoolLevel]);

  // 교시 삭제
  const removePeriod = useCallback(() => {
    if (localMaxPeriods <= MIN_PERIODS_LIMIT) return;
    setLocalMaxPeriods((prev) => prev - 1);
  }, [localMaxPeriods]);

  /* ── 나이스 불러오기 핸들러 ── */
  const hasExistingData = useMemo(() => {
    return DAYS_OF_WEEK.some((day) =>
      (classSchedule[day] ?? []).some((cp) => cp.subject.trim() !== ''),
    );
  }, [classSchedule]);

  const handleNeisImport = useCallback(
    async (data: ClassScheduleData, maxPeriods: number) => {
      await updateClassSchedule(data);

      // 교시 수가 다르면 설정도 업데이트
      if (maxPeriods !== settings.maxPeriods) {
        await updateSettings({ maxPeriods });
      }

      useToastStore.getState().show('시간표를 성공적으로 불러왔습니다!', 'success');
      setShowNeisImport(false);
      onSaved();
    },
    [updateClassSchedule, settings.maxPeriods, updateSettings, onSaved],
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      if (tab === 'class') {
        const data: Record<string, ClassPeriod[]> = {};
        for (let d = 0; d < DAYS_OF_WEEK.length; d++) {
          const day = DAYS_OF_WEEK[d]!;
          data[day] = classGrid.slice(0, localMaxPeriods).map((row, p) => ({
            subject: row[d] ?? '',
            teacher: (classTeacherGrid[p] ?? [])[d] ?? '',
          }));
        }
        await updateClassSchedule(data as ClassScheduleData);
      } else {
        const data: Record<string, (TeacherPeriod | null)[]> = {};
        for (let d = 0; d < DAYS_OF_WEEK.length; d++) {
          const day = DAYS_OF_WEEK[d]!;
          data[day] = teacherSubjectGrid.slice(0, localMaxPeriods).map((row, p) => {
            const subject = row[d] ?? '';
            const classroom = (teacherClassroomGrid[p] ?? [])[d] ?? '';
            if (!subject) return null;
            return { subject, classroom };
          });
        }
        await updateTeacherSchedule(data as TeacherScheduleData);
      }

      // 교시 수가 변경된 경우 설정도 업데이트
      if (localMaxPeriods !== maxPeriods) {
        await updateSettings({
          maxPeriods: localMaxPeriods,
          periodTimes: localPeriodTimes.slice(0, localMaxPeriods),
        });
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
          {tab === 'class' && (
            <>
              <button
                onClick={() => setShowNeisImport(true)}
                className="flex items-center gap-2 rounded-xl bg-sp-accent/10 border border-sp-accent/30 px-4 py-2.5 text-sm font-bold text-sp-accent hover:bg-sp-accent/20 transition-all active:scale-95"
              >
                <span className="material-symbols-outlined text-[20px]">download</span>
                <span>나이스에서 불러오기</span>
              </button>
              <div className="w-px h-8 bg-sp-border" />
            </>
          )}
          <button
            onClick={() => void undo()}
            title="실행 취소 (Ctrl+Z)"
            disabled={!canUndo()}
            className="flex items-center gap-2 rounded-xl bg-sp-surface border border-sp-border px-4 py-2.5 text-sm font-bold text-sp-text hover:bg-sp-card transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[20px]">undo</span>
            <span>실행 취소</span>
          </button>
          <button
            onClick={() => void redo()}
            title="다시 실행 (Ctrl+Shift+Z)"
            disabled={!canRedo()}
            className="flex items-center gap-2 rounded-xl bg-sp-surface border border-sp-border px-4 py-2.5 text-sm font-bold text-sp-text hover:bg-sp-card transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[20px]">redo</span>
            <span>다시 실행</span>
          </button>
          <button
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-2 rounded-xl bg-sp-surface border border-red-500/30 px-4 py-2.5 text-sm font-bold text-red-400 hover:bg-red-500/10 transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-[20px]">delete_sweep</span>
            <span>모두 삭제</span>
          </button>
          <div className="w-px h-8 bg-sp-border" />
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
                  {visiblePeriodTimes.map((pt, periodIdx) => (
                    <EditorPeriodRow
                      key={pt.period}
                      periodTime={pt}
                      periodIdx={periodIdx}
                      tab={tab}
                      classRow={classGrid[periodIdx] ?? []}
                      classTeacherRow={classTeacherGrid[periodIdx] ?? []}
                      teacherSubjectRow={teacherSubjectGrid[periodIdx] ?? []}
                      teacherClassroomRow={teacherClassroomGrid[periodIdx] ?? []}
                      onClassChange={updateClassCell}
                      onClassTeacherChange={updateClassTeacherCell}
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

          {/* 교시 추가/삭제 */}
          <div className="flex items-center justify-center gap-3 py-4">
            <button
              onClick={removePeriod}
              disabled={localMaxPeriods <= MIN_PERIODS_LIMIT}
              className="flex items-center gap-1.5 rounded-lg border border-sp-border bg-sp-surface px-4 py-2 text-sm font-medium text-sp-muted hover:text-red-400 hover:border-red-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[18px]">remove</span>
              교시 삭제
            </button>
            <span className="text-sp-muted text-sm font-bold min-w-[4rem] text-center">
              {localMaxPeriods}교시
            </span>
            <button
              onClick={addPeriod}
              disabled={localMaxPeriods >= MAX_PERIODS_LIMIT}
              className="flex items-center gap-1.5 rounded-lg border border-sp-border bg-sp-surface px-4 py-2 text-sm font-medium text-sp-muted hover:text-sp-accent hover:border-sp-accent/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              교시 추가
            </button>
          </div>
        </div>
      </div>

      {/* 나이스 불러오기 모달 */}
      <NeisImportModal
        isOpen={showNeisImport}
        onClose={() => setShowNeisImport(false)}
        onImport={(data, maxPeriods) => void handleNeisImport(data, maxPeriods)}
        hasExistingData={hasExistingData}
      />

      {/* 모두 삭제 확인 모달 */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-sp-card border border-sp-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-sp-text mb-2">시간표 모두 삭제</h3>
            <p className="text-sm text-sp-muted mb-6">
              학급 시간표와 교사 시간표를 모두 초기화합니다.
              <br />
              <span className="text-sp-accent">실행 취소(Ctrl+Z)로 복원할 수 있습니다.</span>
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-slate-700 text-sm text-sp-text transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => {
                  void clearAll(settings.maxPeriods).then(() => {
                    useToastStore.getState().show('시간표가 모두 삭제되었습니다.', 'info', {
                      label: '실행 취소',
                      onClick: () => void useScheduleStore.getState().undo(),
                    });
                  });
                  setShowClearConfirm(false);
                }}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── 서브 컴포넌트 ─── */

interface EditorPeriodRowProps {
  periodTime: PeriodTime;
  periodIdx: number;
  tab: TabType;
  classRow: string[];
  classTeacherRow: string[];
  teacherSubjectRow: string[];
  teacherClassroomRow: string[];
  onClassChange: (periodIdx: number, dayIdx: number, value: string) => void;
  onClassTeacherChange: (periodIdx: number, dayIdx: number, value: string) => void;
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
  classTeacherRow,
  teacherSubjectRow,
  teacherClassroomRow,
  onClassChange,
  onClassTeacherChange,
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
              <div className="flex flex-col gap-1">
                <input
                  type="text"
                  value={classRow[dayIdx] ?? ''}
                  onChange={(e) => onClassChange(periodIdx, dayIdx, e.target.value)}
                  placeholder="과목"
                  className="h-8 w-full rounded-md bg-sp-surface border border-sp-border px-2 text-center text-xs font-medium text-sp-text placeholder:text-sp-muted/40 focus:border-sp-accent focus:outline-none focus:ring-1 focus:ring-sp-accent/50 transition-colors"
                />
                <input
                  type="text"
                  value={classTeacherRow[dayIdx] ?? ''}
                  onChange={(e) => onClassTeacherChange(periodIdx, dayIdx, e.target.value)}
                  placeholder="교사"
                  className="h-6 w-full rounded-md bg-sp-surface border border-sp-border px-2 text-center text-xs text-sp-muted placeholder:text-sp-muted/40 focus:border-sp-accent focus:outline-none focus:ring-1 focus:ring-sp-accent/50 transition-colors"
                />
              </div>
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
