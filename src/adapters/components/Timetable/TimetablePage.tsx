import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useToastStore } from '@adapters/components/common/Toast';
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
    undo,
    redo,
    clearAll,
    canUndo,
    canRedo,
  } = useScheduleStore();
  const { settings, load: loadSettings } = useSettingsStore();
  const [tab, setTab] = useState<TabType>('class');
  const [isEditing, setIsEditing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
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

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y 키보드 단축키
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditing) return; // 편집기 내 텍스트 입력 Undo와 충돌 방지
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (canUndo()) {
          e.preventDefault();
          void undo();
        }
      }
      if (
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') ||
        ((e.ctrlKey || e.metaKey) && e.key === 'y')
      ) {
        if (canRedo()) {
          e.preventDefault();
          void redo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, undo, redo, canUndo, canRedo]);

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
          data = await exportClassScheduleToExcel(classSchedule, settings.maxPeriods);
          defaultFileName = '학급시간표.xlsx';
        } else {
          data = await exportTeacherScheduleToExcel(teacherSchedule, settings.maxPeriods);
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
          {/* 실행 취소 */}
          <button
            onClick={() => void undo()}
            title="실행 취소 (Ctrl+Z)"
            disabled={!canUndo()}
            className="flex items-center gap-2 rounded-xl bg-sp-surface border border-sp-border px-4 py-2.5 text-sm font-bold text-sp-text hover:bg-sp-card transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[20px]">undo</span>
            <span>실행 취소</span>
          </button>
          {/* 다시 실행 */}
          <button
            onClick={() => void redo()}
            title="다시 실행 (Ctrl+Shift+Z)"
            disabled={!canRedo()}
            className="flex items-center gap-2 rounded-xl bg-sp-surface border border-sp-border px-4 py-2.5 text-sm font-bold text-sp-text hover:bg-sp-card transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[20px]">redo</span>
            <span>다시 실행</span>
          </button>
          {/* 모두 삭제 */}
          <button
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-2 rounded-xl bg-sp-surface border border-red-500/30 px-4 py-2.5 text-sm font-bold text-red-400 hover:bg-red-500/10 transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-[20px]">delete_sweep</span>
            <span>모두 삭제</span>
          </button>
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
