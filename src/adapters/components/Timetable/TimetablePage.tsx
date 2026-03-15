import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { getDayOfWeek, getCurrentPeriod } from '@domain/rules/periodRules';
import { DAYS_OF_WEEK } from '@domain/valueObjects/DayOfWeek';
import type { DayOfWeek } from '@domain/valueObjects/DayOfWeek';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import type { TeacherPeriod, ClassPeriod } from '@domain/entities/Timetable';
import type { SubjectColorMap } from '@domain/valueObjects/SubjectColor';
import { DEFAULT_SUBJECT_COLORS } from '@domain/valueObjects/SubjectColor';
import {
  getSubjectStyle,
  getCellStyle,
  getLunchBreakIndex,
  formatLunchBreakTime,
} from '@adapters/presenters/timetablePresenter';
import { neisPort } from '@adapters/di/container';
import { NEIS_API_KEY } from '@domain/entities/Meal';
import {
  getCurrentWeekRange,
  settingsLevelToNeisLevel,
  getCurrentAcademicYear,
  getCurrentSemester,
} from '@domain/entities/NeisTimetable';
import {
  transformToClassSchedule,
  getMaxPeriod,
} from '@domain/rules/neisTransformRules';
import { smartAutoAssignColors, extractSubjectsFromSchedule, extractClassroomsFromSchedule, autoAssignClassroomColors } from '@domain/rules/subjectColorRules';
import { getCurrentISOWeek } from '@usecases/timetable/AutoSyncNeisTimetable';
import { TimetableEditor } from './TimetableEditor';
/* eslint-disable no-restricted-imports */
import {
  exportClassScheduleToExcel,
  exportTeacherScheduleToExcel,
} from '@infrastructure/export/ExcelExporter';
import {
  exportClassScheduleToHwpx,
  exportTeacherScheduleToHwpx,
} from '@infrastructure/export/HwpxExporter';
/* eslint-enable no-restricted-imports */

type TabType = 'class' | 'teacher';

export function TimetablePage() {
  const {
    classSchedule,
    teacherSchedule,
    load: loadSchedule,
  } = useScheduleStore();
  const { settings, load: loadSettings } = useSettingsStore();
  const { track } = useAnalytics();
  const [tab, setTab] = useState<TabType>('teacher');
  const [isEditing, setIsEditing] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    void loadSchedule();
    void loadSettings();
  }, [loadSchedule, loadSettings]);

  // 색상 모드: schoolLevel 기반 기본값
  const colorBy = settings.timetableColorBy ?? (settings.schoolLevel === 'elementary' ? 'subject' : 'classroom');
  const classroomColors = settings.classroomColors;

  // 기존 사용자 마이그레이션: 색상 미배정 과목 자동 배정
  useEffect(() => {
    const currentColors = settings.subjectColors ?? {};
    const allSubjects = extractSubjectsFromSchedule(classSchedule);
    const uncolored = allSubjects.filter(
      (s) => !(s in currentColors) && !(s in DEFAULT_SUBJECT_COLORS),
    );
    if (uncolored.length > 0) {
      const updated = smartAutoAssignColors(currentColors, uncolored);
      void updateSettings({ subjectColors: updated });
    }
  }, [classSchedule]); // eslint-disable-line react-hooks/exhaustive-deps

  // 학반 색상 자동 배정
  useEffect(() => {
    if (colorBy !== 'classroom') return;
    const currentColors = settings.classroomColors ?? {};
    const allClassrooms = extractClassroomsFromSchedule(teacherSchedule);
    const uncolored = allClassrooms.filter((c) => !(c in currentColors));
    if (uncolored.length > 0) {
      const updated = autoAssignClassroomColors(currentColors, uncolored);
      void updateSettings({ classroomColors: updated });
    }
  }, [teacherSchedule, colorBy]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    if (!showExportMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showExportMenu]);

  const showToast = useToastStore((s) => s.show);

  const handleExport = useCallback(async (format: 'excel' | 'hwpx') => {
    setShowExportMenu(false);
    try {
      let data: ArrayBuffer | Uint8Array;
      let defaultFileName: string;

      if (format === 'excel') {
        if (tab === 'class') {
          data = await exportClassScheduleToExcel(classSchedule, settings.maxPeriods, settings.subjectColors);
          defaultFileName = '학급시간표.xlsx';
        } else {
          data = await exportTeacherScheduleToExcel(teacherSchedule, settings.maxPeriods, settings.subjectColors, colorBy, classroomColors);
          defaultFileName = '교사시간표.xlsx';
        }
      } else {
        if (tab === 'class') {
          data = await exportClassScheduleToHwpx(classSchedule, settings.maxPeriods);
          defaultFileName = '학급시간표.hwpx';
        } else {
          data = await exportTeacherScheduleToHwpx(teacherSchedule, settings.maxPeriods);
          defaultFileName = '교사시간표.hwpx';
        }
      }

      const normalized: ArrayBuffer | string =
        data instanceof Uint8Array
          ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
          : data;

      if (window.electronAPI) {
        const ext = format === 'excel' ? 'xlsx' : 'hwpx';
        const filterName = format === 'excel' ? 'Excel 파일' : '한글 문서';
        const filePath = await window.electronAPI.showSaveDialog({
          title: '내보내기',
          defaultPath: defaultFileName,
          filters: [{ name: filterName, extensions: [ext] }],
        });
        if (filePath) {
          await window.electronAPI.writeFile(filePath, normalized);
          showToast('파일이 저장되었습니다', 'success', {
            label: '파일 열기',
            onClick: () => window.electronAPI?.openFile(filePath),
          });
        }
      } else {
        const blob = new Blob([normalized], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultFileName;
        a.click();
        URL.revokeObjectURL(url);
        showToast('파일이 다운로드되었습니다', 'success');
      }
    } catch {
      showToast('내보내기 중 오류가 발생했습니다', 'error');
    }
  }, [tab, classSchedule, teacherSchedule, settings.maxPeriods, showToast]);

  // ── 자동 동기화 ──
  const autoSync = settings.neis.autoSync;
  const hasSchoolInfo = Boolean(settings.neis.atptCode && settings.neis.schoolCode);
  const autoSyncReady = Boolean(autoSync?.enabled && autoSync?.grade && autoSync?.className && hasSchoolInfo);
  const [syncing, setSyncing] = useState(false);

  const updateSettings = useSettingsStore((s) => s.update);
  const updateClassSchedule = useScheduleStore((s) => s.updateClassSchedule);

  const handleToggleAutoSync = useCallback(async () => {
    const nextEnabled = !(autoSync?.enabled ?? false);
    if (nextEnabled && !hasSchoolInfo) {
      showToast('설정에서 학교를 먼저 검색해주세요.', 'error');
      return;
    }
    await updateSettings({
      neis: {
        ...settings.neis,
        autoSync: {
          ...(autoSync ?? { enabled: false, grade: '', className: '', lastSyncDate: '', lastSyncWeek: '', syncTarget: 'class' as const }),
          enabled: nextEnabled,
        },
      },
    });
    showToast(nextEnabled ? '자동 동기화가 켜졌습니다.' : '자동 동기화가 꺼졌습니다.', 'info');
  }, [autoSync, hasSchoolInfo, settings.neis, updateSettings, showToast]);

  const handleSyncNow = useCallback(async () => {
    if (!autoSyncReady) return;
    setSyncing(true);
    try {
      const { fromDate, toDate } = getCurrentWeekRange();
      const neisLevel = settingsLevelToNeisLevel(settings.schoolLevel);
      const rows = await neisPort.getTimetable({
        apiKey: NEIS_API_KEY,
        officeCode: settings.neis.atptCode,
        schoolCode: settings.neis.schoolCode,
        schoolLevel: neisLevel,
        academicYear: getCurrentAcademicYear(),
        semester: getCurrentSemester(),
        grade: autoSync!.grade,
        className: autoSync!.className,
        fromDate,
        toDate,
      });
      if (rows.length === 0) {
        showToast('해당 기간의 시간표 데이터가 없습니다.', 'error');
        return;
      }
      const maxPeriods = getMaxPeriod(rows);
      const data = transformToClassSchedule(rows, maxPeriods);
      await updateClassSchedule(data);

      const currentColors = settings.subjectColors ?? {};
      const allSubjects = extractSubjectsFromSchedule(data);
      const newSubjects = allSubjects.filter(
        (s) => !(s in currentColors) && !(s in DEFAULT_SUBJECT_COLORS),
      );
      if (newSubjects.length > 0) {
        const updatedColors = smartAutoAssignColors(currentColors, newSubjects);
        await updateSettings({ subjectColors: updatedColors });
      }

      await updateSettings({
        ...(maxPeriods > settings.maxPeriods ? { maxPeriods } : {}),
        neis: {
          ...settings.neis,
          autoSync: { ...autoSync!, lastSyncDate: new Date().toISOString().slice(0, 10), lastSyncWeek: getCurrentISOWeek() },
        },
      });
      showToast('시간표를 동기화했습니다!', 'success');
      track('timetable_neis_sync', { success: true });
    } catch {
      showToast('동기화에 실패했습니다.', 'error');
      track('timetable_neis_sync', { success: false });
    } finally {
      setSyncing(false);
    }
  }, [autoSyncReady, autoSync, settings, updateClassSchedule, updateSettings, showToast]);

  const { className, teacherName } = settings;
  const yearStr = `${now.getFullYear()}학년도`;
  const semester = now.getMonth() < 8 ? '1학기' : '2학기';
  const infoLabel = tab === 'class' && (className || teacherName)
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
        <div className="flex items-center gap-3">
          {/* 자동 동기화 상태 (학급 시간표 탭에서만 표시) */}
          {tab === 'class' && hasSchoolInfo && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => void handleToggleAutoSync()}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all active:scale-95 border ${
                  autoSync?.enabled
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-sp-surface border-sp-border text-sp-muted hover:text-sp-text'
                }`}
                title={autoSync?.enabled ? '자동 동기화 끄기' : '자동 동기화 켜기'}
              >
                <span className={`block w-2 h-2 rounded-full ${autoSync?.enabled ? 'bg-emerald-400' : 'bg-sp-muted/50'}`} />
                {autoSync?.enabled ? '자동 동기화' : '동기화 꺼짐'}
              </button>
              {autoSyncReady && (
                <button
                  onClick={() => void handleSyncNow()}
                  disabled={syncing}
                  className="flex items-center gap-1 rounded-xl bg-sp-surface border border-sp-border px-2.5 py-2 text-xs font-bold text-sp-muted hover:text-sp-accent transition-all active:scale-95 disabled:opacity-50"
                  title={autoSync?.lastSyncDate ? `마지막 동기화: ${autoSync.lastSyncDate}` : '지금 동기화'}
                >
                  <span className={`material-symbols-outlined text-[16px] ${syncing ? 'animate-spin' : ''}`}>sync</span>
                </button>
              )}
            </div>
          )}

          {/* 색상 모드 토글 (교사 시간표에서만 표시) */}
          {tab === 'teacher' && (
            <div className="flex items-center gap-1 bg-sp-surface rounded-xl p-1 border border-sp-border">
              <button
                onClick={() => void updateSettings({ timetableColorBy: 'subject' })}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  colorBy === 'subject' ? 'bg-sp-accent text-white shadow-md' : 'text-sp-muted hover:text-sp-text'
                }`}
                title="과목별 색상"
              >
                과목색
              </button>
              <button
                onClick={() => void updateSettings({ timetableColorBy: 'classroom' })}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  colorBy === 'classroom' ? 'bg-sp-accent text-white shadow-md' : 'text-sp-muted hover:text-sp-text'
                }`}
                title="학반별 색상"
              >
                학반색
              </button>
            </div>
          )}
          {/* 탭 토글 */}
          <div className="flex rounded-xl bg-sp-surface p-1 border border-sp-border">
            <TabButton active={tab === 'teacher'} onClick={() => setTab('teacher')} label="교사 시간표" />
            <TabButton active={tab === 'class'} onClick={() => setTab('class')} label="학급 시간표" />
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
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu((v) => !v)}
              className="flex items-center gap-2 rounded-xl bg-sp-surface border border-sp-border px-4 py-2.5 text-sm font-bold text-sp-text hover:bg-sp-card transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-[20px]">download</span>
              <span>내보내기</span>
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-sp-card border border-sp-border rounded-xl shadow-2xl shadow-black/30 z-50 overflow-hidden">
                <button
                  onClick={() => void handleExport('excel')}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-sp-text hover:bg-sp-accent/10 transition-colors"
                >
                  <span className="material-symbols-outlined text-green-400 text-lg">table_view</span>
                  <span>Excel (.xlsx)</span>
                </button>
                <button
                  onClick={() => void handleExport('hwpx')}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-sp-text hover:bg-sp-accent/10 transition-colors border-t border-sp-border"
                >
                  <span className="material-symbols-outlined text-blue-400 text-lg">description</span>
                  <span>한글 (.hwpx)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 시간표 그리드 */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl flex flex-col gap-6">
          <div className="rounded-2xl border border-sp-border bg-sp-card overflow-hidden shadow-2xl shadow-black/20">
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[800px] border-collapse">
                <TimetableHeader dayOfWeek={dayOfWeek} />
                <tbody>
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
                        classPeriods={DAYS_OF_WEEK.map(
                          (d) => (classSchedule[d] ?? [])[idx] ?? null,
                        )}
                        teacherPeriods={DAYS_OF_WEEK.map(
                          (d) => (teacherSchedule[d] ?? [])[idx] ?? null,
                        )}
                        lunchBefore={lunchIndex === idx}
                        lunchTimeStr={lunchTimeStr}
                        subjectColors={settings.subjectColors}
                        classroomColors={classroomColors}
                        colorBy={colorBy}
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
      <tr className="bg-sp-surface border-b border-sp-border">
        <th className="px-4 py-4 text-center text-sp-text font-bold text-sm w-20 border-r border-sp-border">
          교시
        </th>
        <th className="px-4 py-4 text-center text-sp-text font-bold text-sm w-24 border-r border-sp-border">
          시간
        </th>
        {DAYS_OF_WEEK.map((day) => {
          const isToday = day === dayOfWeek;
          return (
            <th
              key={day}
              className={`px-4 py-4 text-center font-bold text-sm w-1/5 border-r border-sp-border relative ${
                isToday ? 'text-sp-accent bg-sp-accent/10' : 'text-sp-text'
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
  classPeriods: (ClassPeriod | null)[];
  teacherPeriods: (TeacherPeriod | null)[];
  lunchBefore: boolean;
  lunchTimeStr: string;
  subjectColors?: SubjectColorMap;
  classroomColors?: SubjectColorMap;
  colorBy: 'subject' | 'classroom';
}

function PeriodRow({
  periodTime,
  isCurrent,
  dayOfWeek,
  tab,
  classPeriods,
  teacherPeriods,
  lunchBefore,
  lunchTimeStr,
  subjectColors,
  classroomColors,
  colorBy,
}: PeriodRowProps) {
  return (
    <>
      {/* 점심시간 행 */}
      {lunchBefore && (
        <tr className="bg-sp-surface/60 border-b border-sp-border">
          <td className="px-4 py-3 text-center text-sp-muted font-medium text-sm bg-sp-surface border-r border-sp-border">
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
            ? 'relative z-10 border-b border-sp-border'
            : 'group border-b border-sp-border hover:bg-sp-surface/50 transition-colors'
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
            const cp = classPeriods[dayIdx] ?? null;
            return (
              <SubjectCell
                key={day}
                subject={cp?.subject ?? ''}
                teacher={cp?.teacher ?? ''}
                subjectColors={subjectColors}
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
              subjectColors={subjectColors}
              classroomColors={classroomColors}
              colorBy={colorBy}
            />
          );
        })}
      </tr>
    </>
  );
}

interface SubjectCellProps {
  subject: string;
  teacher: string;
  isToday: boolean;
  isCurrent: boolean;
  isLastCol: boolean;
  subjectColors?: SubjectColorMap;
}

function SubjectCell({ subject, teacher, isToday, isCurrent, isLastCol, subjectColors }: SubjectCellProps) {
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

  const style = getSubjectStyle(subject, subjectColors);

  const cellContent = (
    <div className="flex flex-col items-center justify-center gap-0.5">
      <span className={`${style.text} font-bold text-sm`}>{subject}</span>
      {teacher && <span className="text-sp-muted text-xs">{teacher}</span>}
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

interface TeacherCellProps {
  period: TeacherPeriod | null;
  isToday: boolean;
  isCurrent: boolean;
  isLastCol: boolean;
  subjectColors?: SubjectColorMap;
  classroomColors?: SubjectColorMap;
  colorBy: 'subject' | 'classroom';
}

function TeacherCell({ period, isToday, isCurrent, isLastCol, subjectColors, classroomColors, colorBy }: TeacherCellProps) {
  if (!period) {
    return (
      <td
        className={`p-2 ${!isLastCol ? 'border-r border-sp-border' : ''} ${
          isToday ? 'bg-sp-accent/5' : ''
        }`}
      >
        <div className="h-14 w-full flex items-center justify-center text-sp-muted text-xs">
          공강
        </div>
      </td>
    );
  }

  const style = getCellStyle(period.subject, period.classroom, colorBy, subjectColors, classroomColors);

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
