import { useState, useEffect, useMemo, useCallback } from 'react';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { getActiveDays } from '@domain/valueObjects/DayOfWeek';
import type { DayOfWeekWithSat } from '@domain/valueObjects/DayOfWeek';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import type { ClassScheduleData, TeacherScheduleData, TeacherPeriod, ClassPeriod } from '@domain/entities/Timetable';
import { parseMinutes } from '@domain/rules/periodRules';
import {
  getLunchBreakIndex,
  formatLunchBreakTime,
} from '@adapters/presenters/timetablePresenter';
import { NeisImportModal } from './NeisImportModal';
import type { SubjectColorId, SubjectColorMap } from '@domain/valueObjects/SubjectColor';
import { COLOR_PRESETS, getColorPreset, DEFAULT_SUBJECT_COLORS } from '@domain/valueObjects/SubjectColor';
import { smartAutoAssignColors, extractSubjectsFromSchedule } from '@domain/rules/subjectColorRules';
import { getCurrentISOWeek } from '@usecases/timetable/AutoSyncNeisTimetable';

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
  const { track } = useAnalytics();
  const {
    classSchedule, teacherSchedule, updateClassSchedule, updateTeacherSchedule,
    undo, redo, clearAll, canUndo, canRedo,
  } = useScheduleStore();
  const { settings, update: updateSettings } = useSettingsStore();

  const enableSaturday = settings.enableSaturday ?? false;
  const activeDays = useMemo(() => getActiveDays(enableSaturday), [enableSaturday]);

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

      for (const day of activeDays) {
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
  }, [classSchedule, teacherSchedule, maxPeriods, activeDays]);

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
    () => getLunchBreakIndex(visiblePeriodTimes, settings.lunchStart, settings.lunchEnd),
    [visiblePeriodTimes, settings.lunchStart, settings.lunchEnd],
  );
  const lunchTimeStr = useMemo(
    () => (lunchIndex >= 0 ? formatLunchBreakTime(visiblePeriodTimes, lunchIndex) : ''),
    [visiblePeriodTimes, lunchIndex],
  );

  const handleColorChange = useCallback(
    (subject: string, colorId: SubjectColorId) => {
      void updateSettings({
        subjectColors: { ...settings.subjectColors, [subject]: colorId },
      });
    },
    [settings.subjectColors, updateSettings],
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
    track('timetable_edit', { action: 'add' });
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
      setClassGrid((prev) => [...prev, activeDays.map(() => '')]);
      setClassTeacherGrid((prev) => [...prev, activeDays.map(() => '')]);
      setTeacherSubjectGrid((prev) => [...prev, activeDays.map(() => '')]);
      setTeacherClassroomGrid((prev) => [...prev, activeDays.map(() => '')]);
    }

    setLocalMaxPeriods(newCount);
  }, [localMaxPeriods, localPeriodTimes, classGrid.length, settings.schoolLevel, track, activeDays]);

  // 교시 삭제
  const removePeriod = useCallback(() => {
    if (localMaxPeriods <= MIN_PERIODS_LIMIT) return;
    track('timetable_edit', { action: 'delete' });
    setLocalMaxPeriods((prev) => prev - 1);
  }, [localMaxPeriods, track]);

  /* ── 나이스 불러오기 핸들러 ── */
  const hasExistingData = useMemo(() => {
    return activeDays.some((day) =>
      (classSchedule[day] ?? []).some((cp) => cp.subject.trim() !== ''),
    );
  }, [classSchedule, activeDays]);

  const handleNeisImport = useCallback(
    async (data: ClassScheduleData, maxPeriods: number) => {
      await updateClassSchedule(data);

      // 교시 수가 다르면 설정도 업데이트
      if (maxPeriods !== settings.maxPeriods) {
        await updateSettings({ maxPeriods });
      }

      // 새 과목에 자동 색상 배정
      const currentColors = settings.subjectColors ?? {};
      const allSubjects = extractSubjectsFromSchedule(data);
      const newSubjects = allSubjects.filter(
        (s) => !(s in currentColors) && !(s in DEFAULT_SUBJECT_COLORS),
      );
      if (newSubjects.length > 0) {
        const updatedColors = smartAutoAssignColors(currentColors, newSubjects);
        await updateSettings({ subjectColors: updatedColors });
      }

      // 모달 닫기는 하지 않음 — 모달의 'done' 스텝에서 자동 동기화 제안을 보여준 후
      // 사용자가 "확인" 클릭 시 onClose에서 처리
    },
    [updateClassSchedule, settings.maxPeriods, settings.subjectColors, updateSettings],
  );

  const handleEnableAutoSync = useCallback(
    async (grade: string, className: string) => {
      await updateSettings({
        neis: {
          ...settings.neis,
          autoSync: {
            enabled: true,
            grade,
            className,
            lastSyncDate: new Date().toISOString().slice(0, 10),
            lastSyncWeek: getCurrentISOWeek(),
            syncTarget: 'class',
          },
        },
      });
      useToastStore.getState().show('자동 동기화가 설정되었습니다!', 'success');
    },
    [settings.neis, updateSettings],
  );

  const handleSave = async () => {
    setSaving(true);
    track('timetable_edit', { action: 'edit' });
    try {
      if (tab === 'class') {
        const data: Record<string, ClassPeriod[]> = {};
        for (let d = 0; d < activeDays.length; d++) {
          const day = activeDays[d]!;
          data[day] = classGrid.slice(0, localMaxPeriods).map((row, p) => ({
            subject: row[d] ?? '',
            teacher: (classTeacherGrid[p] ?? [])[d] ?? '',
          }));
        }
        await updateClassSchedule(data as ClassScheduleData);

        // 수동 편집 시에도 새 과목에 자동 색상 배정
        const currentColors = settings.subjectColors ?? {};
        const allSubjects = extractSubjectsFromSchedule(data as ClassScheduleData);
        const newSubjects = allSubjects.filter(
          (s) => !(s in currentColors) && !(s in DEFAULT_SUBJECT_COLORS),
        );
        if (newSubjects.length > 0) {
          const updatedColors = smartAutoAssignColors(currentColors, newSubjects);
          await updateSettings({ subjectColors: updatedColors });
        }
      } else {
        const data: Record<string, (TeacherPeriod | null)[]> = {};
        for (let d = 0; d < activeDays.length; d++) {
          const day = activeDays[d]!;
          data[day] = teacherSubjectGrid.slice(0, localMaxPeriods).map((row, p) => {
            const subject = row[d] ?? '';
            const classroom = (teacherClassroomGrid[p] ?? [])[d] ?? '';
            if (!subject) return null;
            return { subject, classroom };
          });
        }
        await updateTeacherSchedule(data as TeacherScheduleData);

        // 교사 시간표에서도 과목 추출 → 색상 배정
        const currentColors = settings.subjectColors ?? {};
        const teacherSubjects = new Set<string>();
        for (const periods of Object.values(data)) {
          for (const p of periods) {
            if (p && p.subject.trim()) teacherSubjects.add(p.subject.trim());
          }
        }
        const newSubjects = [...teacherSubjects].filter(
          (s) => !(s in currentColors) && !(s in DEFAULT_SUBJECT_COLORS),
        );
        if (newSubjects.length > 0) {
          const updatedColors = smartAutoAssignColors(currentColors, newSubjects);
          await updateSettings({ subjectColors: updatedColors });
        }
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
          {tab === 'class' && settings.schoolLevel !== 'custom' && (
            <>
              <button
                onClick={() => setShowNeisImport(true)}
                className="flex items-center gap-2 rounded-xl bg-sp-accent/10 border border-sp-accent/30 px-4 py-2.5 text-sm font-bold text-sp-accent hover:bg-sp-accent/20 transition-all active:scale-95"
              >
                <span className="material-symbols-outlined text-icon-lg">download</span>
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
            <span className="material-symbols-outlined text-icon-lg">undo</span>
            <span>실행 취소</span>
          </button>
          <button
            onClick={() => void redo()}
            title="다시 실행 (Ctrl+Shift+Z)"
            disabled={!canRedo()}
            className="flex items-center gap-2 rounded-xl bg-sp-surface border border-sp-border px-4 py-2.5 text-sm font-bold text-sp-text hover:bg-sp-card transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-icon-lg">redo</span>
            <span>다시 실행</span>
          </button>
          <button
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-2 rounded-xl bg-sp-surface border border-red-500/30 px-4 py-2.5 text-sm font-bold text-red-400 hover:bg-red-500/10 transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-icon-lg">delete_sweep</span>
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
                  <tr className="bg-sp-surface/50 border-b border-sp-border">
                    <th className="px-4 py-3 text-center text-sp-text font-bold text-sm w-20 border-r border-sp-border">
                      교시
                    </th>
                    <th className="px-4 py-3 text-center text-sp-text font-bold text-sm w-24 border-r border-sp-border">
                      시간
                    </th>
                    {activeDays.map((day) => (
                      <th
                        key={day}
                        className="px-4 py-3 text-center text-sp-text font-bold text-sm border-r border-sp-border"
                        style={{ width: `${100 / activeDays.length}%` }}
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
                      subjectColors={settings.subjectColors}
                      onColorChange={handleColorChange}
                      activeDays={activeDays}
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
              <span className="material-symbols-outlined text-icon-md">remove</span>
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
              <span className="material-symbols-outlined text-icon-md">add</span>
              교시 추가
            </button>
          </div>
        </div>
      </div>

      {/* 나이스 불러오기 모달 */}
      <NeisImportModal
        isOpen={showNeisImport}
        onClose={() => {
          setShowNeisImport(false);
          onSaved();
        }}
        onImport={(data, maxPeriods) => void handleNeisImport(data, maxPeriods)}
        hasExistingData={hasExistingData}
        onEnableAutoSync={(grade, cls) => void handleEnableAutoSync(grade, cls)}
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
                className="px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-sp-surface text-sm text-sp-text transition-colors"
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
  subjectColors?: SubjectColorMap;
  onColorChange: (subject: string, colorId: SubjectColorId) => void;
  activeDays: readonly DayOfWeekWithSat[];
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
  subjectColors,
  onColorChange,
  activeDays,
}: EditorPeriodRowProps) {
  const [colorPickerDay, setColorPickerDay] = useState<number | null>(null);

  // 팔레트 외부 클릭 시 닫기
  useEffect(() => {
    if (colorPickerDay === null) return;
    const close = () => setColorPickerDay(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [colorPickerDay]);

  return (
    <>
      {lunchBefore && (
        <tr className="bg-sp-card/80">
          <td className="px-4 py-3 text-center text-sp-muted font-medium text-sm bg-sp-card border-r border-sp-border">
            점심
          </td>
          <td className="px-4 py-3 text-center text-sp-muted text-sm border-r border-sp-border font-mono">
            {lunchTimeStr.split(' ~ ')[0]}
          </td>
          <td
            className="px-4 py-3 text-center text-sp-muted text-sm font-medium tracking-wide"
            colSpan={activeDays.length}
          >
            🍽️ 점심시간 ({lunchTimeStr})
          </td>
        </tr>
      )}

      <tr className="hover:bg-sp-card/30 transition-colors">
        <td className="px-4 py-3 text-center text-sp-muted font-medium text-sm bg-sp-card border-r border-sp-border">
          {periodTime.period}교시
        </td>
        <td className="px-4 py-3 text-center text-sp-muted text-sm border-r border-sp-border font-mono">
          {periodTime.start}
        </td>
        {activeDays.map((_, dayIdx) => {
          const subjectValue = tab === 'class'
            ? (classRow[dayIdx] ?? '').trim()
            : (teacherSubjectRow[dayIdx] ?? '').trim();
          const colorId = subjectValue
            ? (subjectColors?.[subjectValue] ?? DEFAULT_SUBJECT_COLORS[subjectValue] ?? ('cyan' as SubjectColorId))
            : ('cyan' as SubjectColorId);
          const preset = getColorPreset(colorId);

          return (
            <td
              key={dayIdx}
              className={`p-1.5 relative ${dayIdx < activeDays.length - 1 ? 'border-r border-sp-border' : ''}`}
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1">
                  {subjectValue ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setColorPickerDay((prev) => (prev === dayIdx ? null : dayIdx));
                      }}
                      className={`w-4 h-4 rounded-full shrink-0 ${preset.tw.bgSolid} hover:scale-125 transition-transform`}
                      title="색상 변경"
                    />
                  ) : (
                    <span className="w-4 shrink-0" />
                  )}
                  {tab === 'class' ? (
                    <input
                      type="text"
                      value={classRow[dayIdx] ?? ''}
                      onChange={(e) => onClassChange(periodIdx, dayIdx, e.target.value)}
                      placeholder="과목"
                      className="h-8 w-full rounded-md bg-sp-surface border border-sp-border px-2 text-center text-xs font-medium text-sp-text placeholder:text-sp-muted/40 focus:border-sp-accent focus:outline-none focus:ring-1 focus:ring-sp-accent/50 transition-colors"
                    />
                  ) : (
                    <input
                      type="text"
                      value={teacherSubjectRow[dayIdx] ?? ''}
                      onChange={(e) => onTeacherSubjectChange(periodIdx, dayIdx, e.target.value)}
                      placeholder="과목"
                      className="h-8 w-full rounded-md bg-sp-surface border border-sp-border px-2 text-center text-xs font-medium text-sp-text placeholder:text-sp-muted/40 focus:border-sp-accent focus:outline-none focus:ring-1 focus:ring-sp-accent/50 transition-colors"
                    />
                  )}
                </div>

                {/* 인라인 색상 팔레트 */}
                {colorPickerDay === dayIdx && subjectValue && (
                  <div
                    className="absolute left-1 top-full z-50 mt-0.5 p-2 rounded-xl bg-sp-card border border-sp-border shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="text-caption text-sp-muted mb-1.5 font-medium">{subjectValue}</p>
                    <div className="grid grid-cols-8 gap-1.5">
                      {COLOR_PRESETS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          title={p.label}
                          onClick={() => {
                            onColorChange(subjectValue, p.id);
                            setColorPickerDay(null);
                          }}
                          className={`w-5 h-5 rounded-full transition-all ${p.tw.bgSolid} ${
                            colorId === p.id
                              ? 'ring-2 ring-sp-accent ring-offset-1 ring-offset-sp-card scale-110'
                              : 'hover:scale-110 opacity-70 hover:opacity-100'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {tab === 'class' ? (
                  <input
                    type="text"
                    value={classTeacherRow[dayIdx] ?? ''}
                    onChange={(e) => onClassTeacherChange(periodIdx, dayIdx, e.target.value)}
                    placeholder="교사"
                    className="h-6 w-full rounded-md bg-sp-surface border border-sp-border px-2 text-center text-xs text-sp-muted placeholder:text-sp-muted/40 focus:border-sp-accent focus:outline-none focus:ring-1 focus:ring-sp-accent/50 transition-colors"
                  />
                ) : (
                  <input
                    type="text"
                    value={teacherClassroomRow[dayIdx] ?? ''}
                    onChange={(e) => onTeacherClassroomChange(periodIdx, dayIdx, e.target.value)}
                    placeholder="학급"
                    className="h-6 w-full rounded-md bg-sp-surface border border-sp-border px-2 text-center text-xs text-sp-muted placeholder:text-sp-muted/40 focus:border-sp-accent focus:outline-none focus:ring-1 focus:ring-sp-accent/50 transition-colors"
                  />
                )}
              </div>
            </td>
          );
        })}
      </tr>
    </>
  );
}
