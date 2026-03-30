import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { FormatHint } from '../common/FormatHint';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { getDayOfWeek, getCurrentPeriod } from '@domain/rules/periodRules';
import { getActiveDays } from '@domain/valueObjects/DayOfWeek';
import type { DayOfWeekFull } from '@domain/valueObjects/DayOfWeek';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import type { TeacherPeriod, ClassPeriod, TimetableOverride } from '@domain/entities/Timetable';
import type { SubjectColorMap, SubjectColorId } from '@domain/valueObjects/SubjectColor';
import { DEFAULT_SUBJECT_COLORS } from '@domain/valueObjects/SubjectColor';
import {
  getSubjectStyle,
  getCellStyle,
  getLunchBreakIndex,
  formatLunchBreakTime,
} from '@adapters/presenters/timetablePresenter';
import { smartAutoAssignColors, extractSubjectsFromSchedule, extractClassroomsFromSchedule, autoAssignClassroomColors } from '@domain/rules/subjectColorRules';
import { getCurrentISOWeek } from '@usecases/timetable/AutoSyncNeisTimetable';
import type { ClassScheduleData, TeacherScheduleData } from '@domain/entities/Timetable';
import { TimetableEditor } from './TimetableEditor';
import { TempChangeModal } from './TempChangeModal';
import { InlineColorPalette } from './InlineColorPalette';
import { NeisImportModal } from './NeisImportModal';
import { TeacherExcelPreviewModal } from './TeacherExcelPreviewModal';
/* eslint-disable no-restricted-imports */
import {
  exportClassScheduleToExcel,
  exportTeacherScheduleToExcel,
  exportTeacherTimetableTemplate,
  parseTeacherTimetableFromExcel,
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
    overrides,
    load: loadSchedule,
    addOverride,
    deleteOverride,
  } = useScheduleStore();
  const { settings, load: loadSettings } = useSettingsStore();
  useAnalytics();
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

  const weekendDays = settings.enableWeekendDays;
  const activeDays = useMemo(() => getActiveDays(weekendDays), [weekendDays]);

  const dayOfWeek = useMemo(() => getDayOfWeek(now, weekendDays), [now, weekendDays]);
  const currentPeriod = useMemo(
    () => (dayOfWeek ? getCurrentPeriod(settings.periodTimes, now) : null),
    [dayOfWeek, settings.periodTimes, now],
  );

  // 이번 주 월~토(또는 금) 날짜 계산
  const weekDates = useMemo(() => {
    const d = new Date(now);
    const jsDay = d.getDay(); // 0=일 ... 6=토
    const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
    const monday = new Date(d);
    monday.setDate(d.getDate() + mondayOffset);
    return activeDays.map((_, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      return date.toISOString().slice(0, 10);
    });
  }, [now, activeDays]);

  // 오버라이드 맵: 날짜+교시 → override
  const overrideMap = useMemo(() => {
    const map = new Map<string, TimetableOverride>();
    for (const o of overrides) {
      map.set(`${o.date}:${o.period}`, o);
    }
    return map;
  }, [overrides]);

  // 임시 변경 모달 상태
  const [tempChangeTarget, setTempChangeTarget] = useState<{
    date: string;
    period: number;
    dayIdx: number;
    subject: string;
    classroom?: string;
  } | null>(null);

  const lunchIndex = useMemo(
    () => getLunchBreakIndex(settings.periodTimes, settings.lunchStart, settings.lunchEnd),
    [settings.periodTimes, settings.lunchStart, settings.lunchEnd],
  );
  const lunchTimeStr = useMemo(
    () => (lunchIndex >= 0 ? formatLunchBreakTime(settings.periodTimes, lunchIndex) : ''),
    [settings.periodTimes, lunchIndex],
  );

  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // 색상 팔레트 상태: 어떤 셀이 열려있는지 (day index + period number)
  const [openPalette, setOpenPalette] = useState<{ dayIdx: number; period: number } | null>(null);

  // 색상 팔레트 외부 클릭 등으로 닫힐 때 사용
  const closePalette = useCallback(() => setOpenPalette(null), []);

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

  const updateSettings = useSettingsStore((s) => s.update);
  const updateClassSchedule = useScheduleStore((s) => s.updateClassSchedule);

  // 보기 모드 색상 변경 핸들러
  const handleViewColorChange = useCallback(
    (key: string, colorId: SubjectColorId) => {
      if (colorBy === 'classroom') {
        void updateSettings({
          classroomColors: { ...settings.classroomColors, [key]: colorId },
        });
      } else {
        void updateSettings({
          subjectColors: { ...settings.subjectColors, [key]: colorId },
        });
      }
      setOpenPalette(null);
    },
    [settings.subjectColors, settings.classroomColors, colorBy, updateSettings],
  );

  // ── 나이스 불러오기 모달 ──
  const [showNeisImport, setShowNeisImport] = useState(false);

  const hasExistingData = useMemo(() => {
    return activeDays.some((day) =>
      (classSchedule[day] ?? []).some((cp) => cp.subject.trim() !== ''),
    );
  }, [classSchedule, activeDays]);

  const handleNeisImport = useCallback(
    async (data: ClassScheduleData, maxPeriods: number) => {
      await updateClassSchedule(data);
      if (maxPeriods !== settings.maxPeriods) {
        await updateSettings({ maxPeriods });
      }
      const currentColors = settings.subjectColors ?? {};
      const allSubjects = extractSubjectsFromSchedule(data);
      const newSubjects = allSubjects.filter(
        (s) => !(s in currentColors) && !(s in DEFAULT_SUBJECT_COLORS),
      );
      if (newSubjects.length > 0) {
        const updatedColors = smartAutoAssignColors(currentColors, newSubjects);
        await updateSettings({ subjectColors: updatedColors });
      }
    },
    [updateClassSchedule, settings.maxPeriods, settings.subjectColors, updateSettings],
  );

  const handleEnableAutoSync = useCallback(
    async (grade: string, className_: string) => {
      await updateSettings({
        neis: {
          ...settings.neis,
          autoSync: {
            enabled: true,
            grade,
            className: className_,
            lastSyncDate: new Date().toISOString().slice(0, 10),
            lastSyncWeek: getCurrentISOWeek(),
            syncTarget: 'class',
          },
        },
      });
      showToast('자동 동기화가 설정되었습니다!', 'success');
    },
    [settings.neis, updateSettings, showToast],
  );

  /* ── 교사 시간표 엑셀 불러오기 (메인 페이지) ── */
  const updateTeacherSchedule = useScheduleStore((s) => s.updateTeacherSchedule);
  const [showExcelPreview, setShowExcelPreview] = useState(false);
  const [previewSchedule, setPreviewSchedule] = useState<TeacherScheduleData | null>(null);

  const handleDownloadTemplate = useCallback(async () => {
    try {
      const days = activeDays as readonly string[];
      const normalized = await exportTeacherTimetableTemplate(settings.maxPeriods, days, teacherSchedule);

      if (window.electronAPI) {
        const filePath = await window.electronAPI.showSaveDialog({
          title: '양식 다운로드',
          defaultPath: '교사_시간표_양식.xlsx',
          filters: [{ name: 'Excel 파일', extensions: ['xlsx'] }],
        });
        if (filePath) {
          await window.electronAPI.writeFile(filePath, normalized);
          showToast('양식이 저장되었습니다', 'success', {
            label: '파일 열기',
            onClick: () => window.electronAPI?.openFile(filePath),
          });
        }
      } else {
        const blob = new Blob([normalized], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '교사_시간표_양식.xlsx';
        a.click();
        URL.revokeObjectURL(url);
        showToast('양식이 다운로드되었습니다', 'success');
      }
    } catch {
      showToast('양식 다운로드 중 오류가 발생했습니다', 'error');
    }
  }, [settings.maxPeriods, activeDays, teacherSchedule, showToast]);

  const handleExcelUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const parsed = await parseTeacherTimetableFromExcel(buffer);
      const hasData = Object.keys(parsed).length > 0 &&
        Object.values(parsed).some((periods) => periods.some((p) => p !== null));
      if (!hasData) {
        showToast('시간표 데이터를 찾을 수 없습니다. 양식을 확인해주세요.', 'error');
        return;
      }
      setPreviewSchedule(parsed);
      setShowExcelPreview(true);
    } catch {
      showToast('엑셀 파일을 읽을 수 없습니다. 양식을 확인해주세요.', 'error');
    }
    e.target.value = '';
  }, [showToast]);

  const handleExcelConfirm = useCallback(async () => {
    if (!previewSchedule) return;
    await updateTeacherSchedule(previewSchedule);

    const maxFromData = Math.max(
      ...Object.values(previewSchedule).map((arr) => arr.length), 0,
    );
    if (maxFromData > 0 && maxFromData !== settings.maxPeriods) {
      await updateSettings({ maxPeriods: maxFromData });
    }

    const currentWeekend = settings.enableWeekendDays ?? [];
    const dataKeys = Object.keys(previewSchedule);
    const newWeekend = (['토', '일'] as const).filter((d) => dataKeys.includes(d));
    const weekendChanged =
      newWeekend.length !== currentWeekend.length ||
      newWeekend.some((d) => !currentWeekend.includes(d));
    if (weekendChanged) {
      await updateSettings({ enableWeekendDays: newWeekend });
    }

    const currentColors = settings.subjectColors ?? {};
    const subjects = new Set<string>();
    for (const periods of Object.values(previewSchedule)) {
      for (const p of periods) {
        if (p && p.subject.trim()) subjects.add(p.subject.trim());
      }
    }
    const newSubjects = [...subjects].filter(
      (s) => !(s in currentColors) && !(s in DEFAULT_SUBJECT_COLORS),
    );
    if (newSubjects.length > 0) {
      const updated = smartAutoAssignColors(currentColors, newSubjects);
      await updateSettings({ subjectColors: updated });
    }

    showToast('교사 시간표가 업데이트되었습니다!', 'success');
    setShowExcelPreview(false);
    setPreviewSchedule(null);
  }, [previewSchedule, updateTeacherSchedule, settings.maxPeriods, settings.enableWeekendDays, settings.subjectColors, updateSettings, showToast]);

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
          {/* 나이스에서 불러오기 (학급 시간표, 비-custom 학교급) */}
          {tab === 'class' && settings.schoolLevel !== 'custom' && (
            <button
              onClick={() => setShowNeisImport(true)}
              className="flex items-center gap-2 rounded-xl bg-sp-accent/10 border border-sp-accent/30 px-4 py-2.5 text-sm font-bold text-sp-accent hover:bg-sp-accent/20 transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-icon-lg">download</span>
              <span>나이스에서 불러오기</span>
            </button>
          )}

          {/* 교사 시간표: 양식 다운로드 + 엑셀 불러오기 */}
          {tab === 'teacher' && (
            <>
              <button
                onClick={() => void handleDownloadTemplate()}
                className="flex items-center gap-2 rounded-xl bg-sp-surface border border-sp-border px-4 py-2.5 text-sm font-bold text-sp-muted hover:text-sp-text hover:bg-sp-card transition-all active:scale-95"
              >
                <span className="material-symbols-outlined text-icon-lg">download</span>
                <span>양식 다운로드</span>
              </button>
              <div className="flex flex-col items-start gap-1">
                <label className="flex items-center gap-2 rounded-xl bg-sp-accent/10 border border-sp-accent/30 px-4 py-2.5 text-sm font-bold text-sp-accent hover:bg-sp-accent/20 transition-all active:scale-95 cursor-pointer">
                  <span className="material-symbols-outlined text-icon-lg">file_open</span>
                  <span>엑셀 불러오기</span>
                  <input
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={(e) => void handleExcelUpload(e)}
                  />
                </label>
                <FormatHint formats=".xlsx" />
              </div>
            </>
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
          {/* 직접 편집 버튼 */}
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2 rounded-xl bg-sp-surface border border-sp-border px-4 py-2.5 text-sm font-bold text-sp-text hover:bg-sp-card transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-icon-lg">edit</span>
            <span>직접 편집</span>
          </button>
          {/* 내보내기 */}
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu((v) => !v)}
              className="flex items-center gap-2 rounded-xl bg-sp-surface border border-sp-border px-4 py-2.5 text-sm font-bold text-sp-text hover:bg-sp-card transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-icon-lg">download</span>
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
                <TimetableHeader dayOfWeek={dayOfWeek} activeDays={activeDays} />
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
                        classPeriods={activeDays.map(
                          (d) => (classSchedule[d] ?? [])[idx] ?? null,
                        )}
                        teacherPeriods={activeDays.map(
                          (d) => (teacherSchedule[d] ?? [])[idx] ?? null,
                        )}
                        lunchBefore={lunchIndex === idx}
                        lunchTimeStr={lunchTimeStr}
                        subjectColors={settings.subjectColors}
                        classroomColors={classroomColors}
                        colorBy={colorBy}
                        weekDates={weekDates}
                        overrideMap={overrideMap}
                        activeDays={activeDays}
                        onTempChange={(date, dayIdx, subject, classroom) =>
                          setTempChangeTarget({ date, period: periodNum, dayIdx, subject, classroom })
                        }
                        onDeleteOverride={(id) => void deleteOverride(id)}
                        openPalette={openPalette}
                        onOpenPalette={setOpenPalette}
                        onClosePalette={closePalette}
                        onViewColorChange={handleViewColorChange}
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

      {/* 임시 변경 모달 */}
      {tempChangeTarget && (
        <TempChangeModal
          date={tempChangeTarget.date}
          period={tempChangeTarget.period}
          currentSubject={tempChangeTarget.subject}
          currentClassroom={tempChangeTarget.classroom}
          onSave={(override) => void addOverride(override)}
          onClose={() => setTempChangeTarget(null)}
        />
      )}
      <NeisImportModal
        isOpen={showNeisImport}
        onClose={() => setShowNeisImport(false)}
        onImport={(data, maxPeriods) => void handleNeisImport(data, maxPeriods)}
        hasExistingData={hasExistingData}
        onEnableAutoSync={(grade, cls) => void handleEnableAutoSync(grade, cls)}
      />

      {/* 교사 시간표 엑셀 미리보기 모달 */}
      {showExcelPreview && previewSchedule && (
        <TeacherExcelPreviewModal
          schedule={previewSchedule}
          maxPeriods={settings.maxPeriods}
          activeDays={activeDays}
          onConfirm={() => void handleExcelConfirm()}
          onCancel={() => { setShowExcelPreview(false); setPreviewSchedule(null); }}
        />
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
  dayOfWeek: DayOfWeekFull | null;
  activeDays: readonly DayOfWeekFull[];
}

function TimetableHeader({ dayOfWeek, activeDays }: TimetableHeaderProps) {
  return (
    <thead>
      <tr className="bg-sp-surface border-b border-sp-border">
        <th className="px-4 py-4 text-center text-sp-text font-bold text-sm w-20 border-r border-sp-border">
          교시
        </th>
        <th className="px-4 py-4 text-center text-sp-text font-bold text-sm w-24 border-r border-sp-border">
          시간
        </th>
        {activeDays.map((day) => {
          const isToday = day === dayOfWeek;
          return (
            <th
              key={day}
              className={`px-4 py-4 text-center font-bold text-sm border-r border-sp-border relative ${
                isToday ? 'text-sp-accent bg-sp-accent/10' : 'text-sp-text'
              }`}
              style={{ width: `${100 / activeDays.length}%` }}
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
  dayOfWeek: DayOfWeekFull | null;
  tab: TabType;
  classPeriods: (ClassPeriod | null)[];
  teacherPeriods: (TeacherPeriod | null)[];
  lunchBefore: boolean;
  lunchTimeStr: string;
  subjectColors?: SubjectColorMap;
  classroomColors?: SubjectColorMap;
  colorBy: 'subject' | 'classroom';
  weekDates: string[];
  overrideMap: Map<string, TimetableOverride>;
  activeDays: readonly DayOfWeekFull[];
  onTempChange: (date: string, dayIdx: number, subject: string, classroom?: string) => void;
  onDeleteOverride: (id: string) => void;
  openPalette: { dayIdx: number; period: number } | null;
  onOpenPalette: (palette: { dayIdx: number; period: number }) => void;
  onClosePalette: () => void;
  onViewColorChange: (key: string, colorId: SubjectColorId) => void;
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
  weekDates,
  overrideMap,
  activeDays,
  onTempChange,
  onDeleteOverride,
  openPalette,
  onOpenPalette,
  onClosePalette,
  onViewColorChange,
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
            className="px-4 py-3 text-center text-sp-muted text-sm font-medium tracking-wide"
            colSpan={activeDays.length}
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
        {activeDays.map((day, dayIdx) => {
          const isToday = day === dayOfWeek;
          const dateStr = weekDates[dayIdx] ?? '';
          const override = overrideMap.get(`${dateStr}:${periodTime.period}`);

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
                isLastCol={dayIdx === activeDays.length - 1}
                override={override}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (override) {
                    onDeleteOverride(override.id);
                  } else {
                    onTempChange(dateStr, dayIdx, cp?.subject ?? '', undefined);
                  }
                }}
                isColorPaletteOpen={openPalette?.dayIdx === dayIdx && openPalette?.period === periodTime.period}
                onOpenColorPalette={() => onOpenPalette({ dayIdx, period: periodTime.period })}
                onCloseColorPalette={onClosePalette}
                onColorChange={onViewColorChange}
                colorBy="subject"
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
              isLastCol={dayIdx === activeDays.length - 1}
              subjectColors={subjectColors}
              classroomColors={classroomColors}
              colorBy={colorBy}
              override={override}
              onContextMenu={(e) => {
                e.preventDefault();
                if (override) {
                  onDeleteOverride(override.id);
                } else {
                  onTempChange(dateStr, dayIdx, tp?.subject ?? '', tp?.classroom ?? '');
                }
              }}
              isColorPaletteOpen={openPalette?.dayIdx === dayIdx && openPalette?.period === periodTime.period}
              onOpenColorPalette={() => onOpenPalette({ dayIdx, period: periodTime.period })}
              onCloseColorPalette={onClosePalette}
              onColorChange={onViewColorChange}
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
  override?: TimetableOverride;
  onContextMenu: (e: React.MouseEvent) => void;
  isColorPaletteOpen: boolean;
  onOpenColorPalette: () => void;
  onCloseColorPalette: () => void;
  onColorChange: (key: string, colorId: SubjectColorId) => void;
  colorBy: 'subject' | 'classroom';
}

function SubjectCell({ subject, teacher, isToday, isCurrent, isLastCol, subjectColors, override, onContextMenu, isColorPaletteOpen, onOpenColorPalette, onCloseColorPalette, onColorChange, colorBy: _colorBy }: SubjectCellProps) {
  const isOverridden = override != null;
  const displaySubject = isOverridden ? (override.subject || '') : subject;
  const displayTeacher = isOverridden ? '' : teacher;

  if (!displaySubject) {
    return (
      <td
        className={`p-2 ${!isLastCol ? 'border-r border-sp-border' : ''} ${
          isToday ? 'bg-sp-accent/5' : ''
        }`}
        onContextMenu={onContextMenu}
      >
        <div className={`h-14 w-full flex items-center justify-center text-sp-muted text-sm relative ${
          isOverridden ? 'border border-dashed border-amber-400/30 rounded-lg' : ''
        }`}>
          {isOverridden ? '자습' : '—'}
          {isOverridden && (
            <span className="absolute top-0.5 right-0.5 text-micro text-amber-400" title={`임시 변경: ${override.reason ?? ''}`}>
              <span className="material-symbols-outlined text-xs">push_pin</span>
            </span>
          )}
        </div>
      </td>
    );
  }

  const style = getSubjectStyle(displaySubject, subjectColors);

  const cellContent = (
    <div className="flex flex-col items-center justify-center gap-0.5">
      <span className={`${style.text} font-bold text-sm`}>{displaySubject}</span>
      {displayTeacher && <span className="text-sp-muted text-xs">{displayTeacher}</span>}
      {isOverridden && override.reason && (
        <span className="text-amber-400/70 text-tiny">{override.reason}</span>
      )}
    </div>
  );

  if (isCurrent) {
    return (
      <td
        className={`p-2 relative ${!isLastCol ? 'border-r border-sp-border' : ''} ${
          isToday ? 'bg-sp-accent/5' : ''
        }`}
        onContextMenu={onContextMenu}
      >
        <div className="absolute inset-0 bg-amber-500/10 pointer-events-none animate-pulse" />
        <div
          className={`h-14 w-full rounded-lg ${style.bg} border-2 border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.3)] flex items-center justify-center relative z-20 cursor-pointer ${
            isOverridden ? 'border-dashed' : ''
          }`}
          onClick={onOpenColorPalette}
        >
          {cellContent}
          {isOverridden ? (
            <span className="absolute -top-1 -right-1 text-amber-400">
              <span className="material-symbols-outlined text-icon-sm">push_pin</span>
            </span>
          ) : (
            <span className="block w-2 h-2 rounded-full bg-amber-400 animate-ping absolute -top-1 -right-1" />
          )}
        </div>
        {isColorPaletteOpen && (
          <InlineColorPalette
            label={displaySubject}
            currentColorId={(subjectColors?.[displaySubject] ?? 'cyan') as SubjectColorId}
            onSelect={(colorId) => onColorChange(displaySubject, colorId)}
            onClose={onCloseColorPalette}
          />
        )}
      </td>
    );
  }

  return (
    <td
      className={`p-2 relative ${!isLastCol ? 'border-r border-sp-border' : ''} ${
        isToday ? 'bg-sp-accent/5' : ''
      }`}
      onContextMenu={onContextMenu}
    >
      <div
        className={`h-14 w-full rounded-lg ${style.bg} border ${
          isOverridden ? 'border-dashed border-amber-400/30' : style.border
        } flex items-center justify-center relative cursor-pointer`}
        onClick={onOpenColorPalette}
      >
        {cellContent}
        {isOverridden && (
          <span className="absolute top-0.5 right-0.5 text-amber-400" title={`임시 변경: ${override.reason ?? ''}`}>
            <span className="material-symbols-outlined text-xs">push_pin</span>
          </span>
        )}
      </div>
      {isColorPaletteOpen && (
        <InlineColorPalette
          label={displaySubject}
          currentColorId={(subjectColors?.[displaySubject] ?? 'cyan') as SubjectColorId}
          onSelect={(colorId) => onColorChange(displaySubject, colorId)}
          onClose={onCloseColorPalette}
        />
      )}
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
  override?: TimetableOverride;
  onContextMenu: (e: React.MouseEvent) => void;
  isColorPaletteOpen: boolean;
  onOpenColorPalette: () => void;
  onCloseColorPalette: () => void;
  onColorChange: (key: string, colorId: SubjectColorId) => void;
}

function TeacherCell({ period, isToday, isCurrent, isLastCol, subjectColors, classroomColors, colorBy, override, onContextMenu, isColorPaletteOpen, onOpenColorPalette, onCloseColorPalette, onColorChange }: TeacherCellProps) {
  const isOverridden = override != null;

  // 오버라이드된 경우 override 데이터로 표시
  const displayPeriod: TeacherPeriod | null = isOverridden
    ? (override.subject ? { subject: override.subject, classroom: override.classroom ?? '' } : null)
    : period;

  if (!displayPeriod) {
    return (
      <td
        className={`p-2 ${!isLastCol ? 'border-r border-sp-border' : ''} ${
          isToday ? 'bg-sp-accent/5' : ''
        }`}
        onContextMenu={onContextMenu}
      >
        <div className={`h-14 w-full flex items-center justify-center text-sp-muted text-xs relative ${
          isOverridden ? 'border border-dashed border-amber-400/30 rounded-lg' : ''
        }`}>
          {isOverridden ? '자습' : '공강'}
          {isOverridden && (
            <span className="absolute top-0.5 right-0.5 text-amber-400" title={`임시 변경: ${override.reason ?? ''}`}>
              <span className="material-symbols-outlined text-xs">push_pin</span>
            </span>
          )}
        </div>
      </td>
    );
  }

  const style = getCellStyle(displayPeriod.subject, displayPeriod.classroom, colorBy, subjectColors, classroomColors);
  const colorKey = colorBy === 'classroom' ? displayPeriod.classroom : displayPeriod.subject;
  const colorMap = colorBy === 'classroom' ? classroomColors : subjectColors;

  const cellContent = (
    <div className="flex flex-col items-center justify-center gap-0.5">
      <span className={`${style.text} font-bold text-sm`}>{displayPeriod.subject}</span>
      <span className="text-sp-muted text-xs">{displayPeriod.classroom}</span>
      {isOverridden && override.reason && (
        <span className="text-amber-400/70 text-tiny">{override.reason}</span>
      )}
    </div>
  );

  if (isCurrent) {
    return (
      <td
        className={`p-2 relative ${!isLastCol ? 'border-r border-sp-border' : ''} ${
          isToday ? 'bg-sp-accent/5' : ''
        }`}
        onContextMenu={onContextMenu}
      >
        <div className="absolute inset-0 bg-amber-500/10 pointer-events-none animate-pulse" />
        <div
          className={`h-14 w-full rounded-lg ${style.bg} border-2 border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.3)] flex items-center justify-center relative z-20 cursor-pointer ${
            isOverridden ? 'border-dashed' : ''
          }`}
          onClick={onOpenColorPalette}
        >
          {cellContent}
          {isOverridden ? (
            <span className="absolute -top-1 -right-1 text-amber-400">
              <span className="material-symbols-outlined text-icon-sm">push_pin</span>
            </span>
          ) : (
            <span className="block w-2 h-2 rounded-full bg-amber-400 animate-ping absolute -top-1 -right-1" />
          )}
        </div>
        {isColorPaletteOpen && (
          <InlineColorPalette
            label={colorKey}
            currentColorId={(colorMap?.[colorKey] ?? 'cyan') as SubjectColorId}
            onSelect={(colorId) => onColorChange(colorKey, colorId)}
            onClose={onCloseColorPalette}
          />
        )}
      </td>
    );
  }

  return (
    <td
      className={`p-2 relative ${!isLastCol ? 'border-r border-sp-border' : ''} ${
        isToday ? 'bg-sp-accent/5' : ''
      }`}
      onContextMenu={onContextMenu}
    >
      <div
        className={`h-14 w-full rounded-lg ${style.bg} border ${
          isOverridden ? 'border-dashed border-amber-400/30' : style.border
        } flex items-center justify-center relative cursor-pointer`}
        onClick={onOpenColorPalette}
      >
        {cellContent}
        {isOverridden && (
          <span className="absolute top-0.5 right-0.5 text-amber-400" title={`임시 변경: ${override.reason ?? ''}`}>
            <span className="material-symbols-outlined text-xs">push_pin</span>
          </span>
        )}
      </div>
      {isColorPaletteOpen && (
        <InlineColorPalette
          label={colorKey}
          currentColorId={(colorMap?.[colorKey] ?? 'cyan') as SubjectColorId}
          onSelect={(colorId) => onColorChange(colorKey, colorId)}
          onClose={onCloseColorPalette}
        />
      )}
    </td>
  );
}
