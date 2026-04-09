import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { studentKey } from '@domain/entities/TeachingClass';
import type { TeachingClassStudent } from '@domain/entities/TeachingClass';
import type { SeatingData } from '@domain/entities/Seating';
import type { Student } from '@domain/entities/Student';
import type { AttendanceStatus, AttendanceReason, StudentAttendance, AttendanceRecord } from '@domain/entities/Attendance';
import { ATTENDANCE_REASONS } from '@domain/entities/Attendance';
import { getDayOfWeek } from '@domain/rules/periodRules';
import { exportSeatingToExcel, exportSeatingToHwpx } from '@infrastructure/export';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { buildPairGroups, adjustPairGroupsForRow } from '@domain/rules/seatingLayoutRules';
import { ObservationForm } from './ObservationForm';
import { ObservationCard } from './ObservationCard';
import { useObservationStore } from '@adapters/stores/useObservationStore';

/* ──────────────────────── 출석 체크 상수 ──────────────────────── */

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; icon: string; color: string }> = {
  present: { label: '출석', icon: 'check_circle', color: 'green' },
  absent: { label: '결석', icon: 'cancel', color: 'red' },
  late: { label: '지각', icon: 'schedule', color: 'amber' },
  earlyLeave: { label: '조퇴', icon: 'exit_to_app', color: 'orange' },
  classAbsence: { label: '결과', icon: 'event_busy', color: 'purple' },
};

const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

const BORDER_COLOR_MAP: Record<AttendanceStatus, string> = {
  present: 'border-green-500/60',
  absent: 'border-red-500/60',
  late: 'border-amber-500/60',
  earlyLeave: 'border-orange-500/60',
  classAbsence: 'border-purple-500/60',
};

interface ClassSeatingTabProps {
  classId: string;
}

export function ClassSeatingTab({ classId }: ClassSeatingTabProps) {
  const cls = useTeachingClassStore((s) => s.classes.find((c) => c.id === classId));
  const initClassSeating = useTeachingClassStore((s) => s.initClassSeating);
  const randomizeClassSeating = useTeachingClassStore((s) => s.randomizeClassSeating);
  const swapClassSeats = useTeachingClassStore((s) => s.swapClassSeats);
  const clearClassSeating = useTeachingClassStore((s) => s.clearClassSeating);
  const resizeClassGrid = useTeachingClassStore((s) => s.resizeClassGrid);
  const toggleClassPairMode = useTeachingClassStore((s) => s.toggleClassPairMode);
  const toggleClassOddColumnMode = useTeachingClassStore((s) => s.toggleClassOddColumnMode);

  const { track } = useAnalytics();
  const showToast = useToastStore((s) => s.show);

  const getAttendanceRecord = useTeachingClassStore((s) => s.getAttendanceRecord);
  const saveAttendanceRecord = useTeachingClassStore((s) => s.saveAttendanceRecord);

  const teacherSchedule = useScheduleStore((s) => s.teacherSchedule);
  const scheduleOverrides = useScheduleStore((s) => s.overrides);
  const loadSchedule = useScheduleStore((s) => s.load);

  const seatingDefaultView = useSettingsStore((s) => s.settings.seatingDefaultView);

  const [isEditing, setIsEditing] = useState(false);
  const [isTeacherView, setIsTeacherView] = useState(seatingDefaultView === 'teacher');
  const [dragSource, setDragSource] = useState<{ row: number; col: number } | null>(null);
  const [dragOver, setDragOver] = useState<{ row: number; col: number } | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // 출석 체크 모드 상태
  const [isAttendanceMode, setIsAttendanceMode] = useState(false);
  const [attendanceDate, setAttendanceDate] = useState(todayString);
  const [attendancePeriod, setAttendancePeriod] = useState(1);
  const [localAttendance, setLocalAttendance] = useState<Map<string, AttendanceStatus>>(new Map());
  const [attendanceReasons, setAttendanceReasons] = useState<Map<string, string>>(new Map());
  const [attendanceMemos, setAttendanceMemos] = useState<Map<string, string>>(new Map());
  const [hasModified, setHasModified] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // 출석 팝업 모달 상태
  const [selectedStudentKey, setSelectedStudentKey] = useState<string | null>(null);

  const [showRecentRecords, setShowRecentRecords] = useState(false);

  // 특기사항 데이터
  const observationRecords = useObservationStore((s) => s.records);
  const loadObs = useObservationStore((s) => s.load);

  // 스케줄 로드
  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  // 특기사항 로드
  useEffect(() => {
    void loadObs();
  }, [loadObs]);

  // 출석 모드 ON / 날짜·교시 변경 시 기록 로드
  useEffect(() => {
    if (!isAttendanceMode || !cls) return;
    const existing = getAttendanceRecord(classId, attendanceDate, attendancePeriod);
    const map = new Map<string, AttendanceStatus>();
    const reasonMap = new Map<string, string>();
    const memoMap = new Map<string, string>();
    if (existing) {
      for (const sa of existing.students) {
        map.set(studentKey(sa), sa.status);
        if (sa.reason) reasonMap.set(studentKey(sa), sa.reason);
        if (sa.memo) memoMap.set(studentKey(sa), sa.memo);
      }
      // 새로 추가된 학생은 present
      for (const s of cls.students) {
        if (!s.isVacant) {
          const k = studentKey(s);
          if (!map.has(k)) map.set(k, 'present');
        }
      }
    } else {
      for (const s of cls.students) {
        if (!s.isVacant) map.set(studentKey(s), 'present');
      }
    }
    setLocalAttendance(map);
    setAttendanceReasons(reasonMap);
    setAttendanceMemos(memoMap);
    setHasModified(false);
    setSaveStatus('idle');
  }, [isAttendanceMode, attendanceDate, attendancePeriod, classId, cls, getAttendanceRecord]);

  // 수업 매칭 교시 계산
  const matchingPeriods = useMemo(() => {
    if (!cls) return new Set<number>();
    const d = new Date(attendanceDate + 'T00:00:00');
    const dayOfWeekVal = getDayOfWeek(d);
    if (!dayOfWeekVal) return new Set<number>();

    const baseSchedule = teacherSchedule[dayOfWeekVal] ?? [];
    const dayOverrides = scheduleOverrides.filter((o) => o.date === attendanceDate);

    const periods = [...baseSchedule];
    for (const override of dayOverrides) {
      const idx = override.period - 1;
      if (idx >= 0 && idx < periods.length) {
        if (override.subject) {
          periods[idx] = { subject: override.subject, classroom: override.classroom ?? '' };
        } else {
          periods[idx] = null;
        }
      }
    }

    const matching = new Set<number>();
    periods.forEach((slot, idx) => {
      if (slot && slot.classroom === cls.name && slot.subject === cls.subject) {
        matching.add(idx + 1);
      }
    });
    return matching;
  }, [cls, attendanceDate, teacherSchedule, scheduleOverrides]);

  // 출석 클릭 핸들러 — 팝업 열기
  const handleAttendanceClick = useCallback((key: string) => {
    setSelectedStudentKey(key);
  }, []);

  // 팝업 내 출석 상태 변경
  const setStudentAttStatus = useCallback((key: string, newStatus: AttendanceStatus) => {
    setLocalAttendance((prev) => {
      const next = new Map(prev);
      next.set(key, newStatus);
      return next;
    });
    setHasModified(true);
    setSaveStatus('idle');
  }, []);

  // 선택된 학생의 최근 특기사항
  const selectedObservations = useMemo(() => {
    if (!selectedStudentKey) return [];
    return [...observationRecords]
      .filter((r) => r.classId === classId && r.studentId === selectedStudentKey)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
  }, [observationRecords, classId, selectedStudentKey]);

  // 출석 저장
  const handleSaveAttendance = useCallback(async () => {
    if (!cls) return;
    setSaveStatus('saving');
    const studentAttendances: StudentAttendance[] = cls.students
      .filter((s) => !s.isVacant)
      .map((s) => {
        const k = studentKey(s);
        return {
          number: s.number,
          status: localAttendance.get(k) ?? 'present',
          reason: attendanceReasons.get(k) as AttendanceReason | undefined,
          memo: attendanceMemos.get(k),
          grade: s.grade,
          classNum: s.classNum,
        };
      });
    const record: AttendanceRecord = {
      classId,
      date: attendanceDate,
      period: attendancePeriod,
      students: studentAttendances,
    };
    await saveAttendanceRecord(record);
    setSaveStatus('saved');
    setHasModified(false);
    showToast('출석이 저장되었습니다', 'success');
  }, [cls, classId, attendanceDate, attendancePeriod, localAttendance, attendanceReasons, attendanceMemos, saveAttendanceRecord, showToast]);

  // 출석 통계
  const attendanceStats = useMemo(() => {
    const counts: Record<AttendanceStatus, number> = { present: 0, absent: 0, late: 0, earlyLeave: 0, classAbsence: 0 };
    for (const status of localAttendance.values()) {
      counts[status]++;
    }
    return counts;
  }, [localAttendance]);

  // 내보내기 메뉴 외부 클릭 닫기
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

  // studentKey → student 맵
  const studentMap = useMemo(() => {
    if (!cls) return new Map<string, TeachingClassStudent>();
    const map = new Map<string, TeachingClassStudent>();
    for (const s of cls.students) {
      if (!s.isVacant) map.set(studentKey(s), s);
    }
    return map;
  }, [cls]);

  // 미배치 학생 감지
  const unplacedStudents = useMemo(() => {
    if (!cls?.seating) return [];
    const placedKeys = new Set(cls.seating.seats.flat().filter((v): v is string => v !== null));
    return cls.students
      .filter((s) => !s.isVacant && !placedKeys.has(studentKey(s)));
  }, [cls]);

  // 좌석에 있지만 명렬표에 없는 학생 키 (동기화용)
  const orphanedKeys = useMemo(() => {
    if (!cls?.seating) return new Set<string>();
    const activeKeys = new Set(
      cls.students.filter((s) => !s.isVacant).map((s) => studentKey(s)),
    );
    const placedKeys = cls.seating.seats.flat().filter((v): v is string => v !== null);
    return new Set(placedKeys.filter((k) => !activeKeys.has(k)));
  }, [cls]);

  const activeStudentCount = cls?.students.filter((s) => !s.isVacant).length ?? 0;

  /* ────── 핸들러 ────── */

  const handleInit = useCallback(async (mode: 'sequential' | 'random') => {
    await initClassSeating(classId, mode);
    track('tool_use', { tool: 'class_seating' });
  }, [classId, initClassSeating, track]);

  const handleRandomize = useCallback(async () => {
    await randomizeClassSeating(classId);
    track('seating_shuffle', { studentCount: activeStudentCount });
  }, [classId, randomizeClassSeating, track, activeStudentCount]);

  const handleClear = useCallback(async () => {
    if (!confirm('좌석 배치를 초기화하시겠습니까?')) return;
    await clearClassSeating(classId);
  }, [classId, clearClassSeating]);

  const handleResize = useCallback(async (rows: number, cols: number) => {
    await resizeClassGrid(classId, rows, cols);
  }, [classId, resizeClassGrid]);

  const handleTogglePairMode = useCallback(async () => {
    await toggleClassPairMode(classId);
  }, [classId, toggleClassPairMode]);

  const handleToggleOddColumnMode = useCallback(async () => {
    await toggleClassOddColumnMode(classId);
  }, [classId, toggleClassOddColumnMode]);

  const handlePlaceUnseated = useCallback(async () => {
    if (!cls?.seating) return;
    // 현재 좌석에서 빈 자리에 미배치 학생 추가
    const newSeats = cls.seating.seats.map((row) => [...row]);
    const toPlace = unplacedStudents.map((s) => studentKey(s));
    let idx = 0;
    for (let r = 0; r < newSeats.length && idx < toPlace.length; r++) {
      for (let c = 0; c < newSeats[r]!.length && idx < toPlace.length; c++) {
        if (newSeats[r]![c] === null) {
          newSeats[r]![c] = toPlace[idx]!;
          idx++;
        }
      }
    }
    // 빈 자리가 부족하면 행 추가
    const cols = cls.seating.cols;
    while (idx < toPlace.length) {
      const row: (string | null)[] = [];
      for (let c = 0; c < cols; c++) {
        row.push(idx < toPlace.length ? toPlace[idx]! : null);
        idx++;
      }
      newSeats.push(row);
    }
    const rows = newSeats.length;
    const updated = { ...cls, seating: { ...cls.seating, rows, seats: newSeats }, updatedAt: new Date().toISOString() };
    await useTeachingClassStore.getState().updateClass(updated);
  }, [cls, unplacedStudents]);

  /* ────── 내보내기 ────── */

  // TeachingClassStudent → Student 변환 (기존 exporter 재사용용)
  const { exportStudents, exportGetStudent, exportSeatingData } = useMemo(() => {
    if (!cls?.seating) return { exportStudents: [] as Student[], exportGetStudent: () => undefined as Student | undefined, exportSeatingData: null };
    // studentKey → Student 매핑
    const keyToStudent = new Map<string, Student>();
    for (const s of cls.students) {
      if (s.isVacant) continue;
      const key = studentKey(s);
      keyToStudent.set(key, {
        id: key,
        name: s.name,
        studentNumber: s.number,
        isVacant: false,
      });
    }
    const students = [...keyToStudent.values()];
    const getStudent = (id: string | null): Student | undefined =>
      id ? keyToStudent.get(id) : undefined;
    const seatingData: SeatingData = {
      rows: cls.seating.rows,
      cols: cls.seating.cols,
      seats: cls.seating.seats,
      pairMode: cls.seating.pairMode,
    };
    return { exportStudents: students, exportGetStudent: getStudent, exportSeatingData: seatingData };
  }, [cls]);

  const handleExport = useCallback(async (format: 'excel' | 'hwpx') => {
    setShowExportMenu(false);
    if (!exportSeatingData || !cls) return;
    try {
      let data: ArrayBuffer | Uint8Array;
      let defaultFileName: string;

      if (format === 'excel') {
        data = await exportSeatingToExcel(exportSeatingData, exportGetStudent, exportStudents, cls.name);
        defaultFileName = `${cls.name} 자리배치도.xlsx`;
      } else {
        data = await exportSeatingToHwpx(exportSeatingData, exportGetStudent, exportStudents, cls.name);
        defaultFileName = `${cls.name} 자리배치도.hwpx`;
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
          track('export', { format });
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
        track('export', { format });
      }
    } catch {
      showToast('내보내기 중 오류가 발생했습니다', 'error');
    }
  }, [exportSeatingData, exportGetStudent, exportStudents, cls, showToast, track]);

  /* ────── 드래그 앤 드롭 ────── */

  const handleDragStart = useCallback((row: number, col: number) => {
    setDragSource({ row, col });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, row: number, col: number) => {
    e.preventDefault();
    setDragOver({ row, col });
  }, []);

  const handleDrop = useCallback(async (row: number, col: number) => {
    if (!dragSource) return;
    await swapClassSeats(classId, dragSource.row, dragSource.col, row, col);
    track('seating_drag', {} as Record<string, never>);
    setDragSource(null);
    setDragOver(null);
  }, [dragSource, classId, swapClassSeats, track]);

  const handleDragEnd = useCallback(() => {
    setDragSource(null);
    setDragOver(null);
  }, []);

  if (!cls) return null;

  // 빈 상태: 좌석 데이터 없음
  if (!cls.seating) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-sp-muted py-20">
        <span className="text-5xl mb-4">💺</span>
        <h3 className="text-lg font-semibold text-sp-text mb-2">좌석 배치를 시작해보세요!</h3>
        <p className="text-sm text-sp-muted mb-6 text-center max-w-sm">
          명렬표에 등록된 {activeStudentCount}명의 학생들의<br />
          자리를 쉽게 배치할 수 있어요.
        </p>
        {activeStudentCount === 0 ? (
          <p className="text-xs text-amber-400">명렬표에 학생을 먼저 등록해주세요.</p>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={() => void handleInit('sequential')}
              className="flex items-center gap-2 px-4 py-2.5 bg-sp-card border border-sp-border rounded-lg hover:bg-sp-border/50 transition-colors text-sm"
            >
              <span className="material-symbols-outlined text-lg">format_list_numbered</span>
              번호 순서대로 배치
            </button>
            <button
              onClick={() => void handleInit('random')}
              className="flex items-center gap-2 px-4 py-2.5 bg-sp-accent text-white rounded-lg hover:bg-sp-accent/80 transition-colors text-sm"
            >
              <span className="material-symbols-outlined text-lg">shuffle</span>
              랜덤 배치
            </button>
          </div>
        )}
      </div>
    );
  }

  const { rows, cols, seats, pairMode } = cls.seating;

  // 고아 키 정리된 좌석 (표시용)
  const displaySeats = seats.map((row) =>
    row.map((key) => (key !== null && orphanedKeys.has(key) ? null : key)),
  );

  const toolBtnClass =
    'flex items-center gap-1.5 px-3 py-1.5 bg-sp-card border border-sp-border rounded-lg hover:bg-sp-border/50 transition-colors text-sm text-sp-text';
  const activeBtnClass =
    'flex items-center gap-1.5 px-3 py-1.5 bg-sp-accent/20 border border-sp-accent/40 rounded-lg text-sp-accent text-sm';

  return (
    <div className="flex flex-col h-full">
      {/* 미배치 학생 알림 */}
      {unplacedStudents.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
          <span className="material-symbols-outlined text-amber-400">person_add</span>
          <div className="flex-1">
            <p className="text-sm text-sp-text">
              명렬표에서 추가된 학생 {unplacedStudents.length}명이 아직 배치되지 않았어요.
            </p>
          </div>
          <button
            onClick={() => void handlePlaceUnseated()}
            className="px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg text-xs hover:bg-amber-500/30 transition-colors"
          >
            빈 자리에 배치
          </button>
        </div>
      )}

      {/* 툴바 */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setIsEditing((v) => !v)}
          className={isEditing ? activeBtnClass : toolBtnClass}
        >
          <span className="material-symbols-outlined text-lg">
            {isEditing ? 'check' : 'edit'}
          </span>
          {isEditing ? '완료' : '편집'}
        </button>

        <button onClick={() => void handleRandomize()} className={toolBtnClass}>
          <span className="material-symbols-outlined text-lg">shuffle</span>
          랜덤 배치
        </button>

        {/* 그리드 크기 조절 */}
        <div className="flex items-center gap-1 ml-2">
          <span className="text-xs text-sp-muted">행</span>
          <button
            onClick={() => void handleResize(rows - 1, cols)}
            disabled={rows <= 1}
            className="w-7 h-7 rounded bg-sp-card border border-sp-border text-sp-text text-sm disabled:opacity-30"
          >
            -
          </button>
          <span className="text-sm w-6 text-center text-sp-text">{rows}</span>
          <button
            onClick={() => void handleResize(rows + 1, cols)}
            className="w-7 h-7 rounded bg-sp-card border border-sp-border text-sp-text text-sm"
          >
            +
          </button>
          <span className="text-xs text-sp-muted ml-2">열</span>
          <button
            onClick={() => void handleResize(rows, cols - 1)}
            disabled={cols <= 1}
            className="w-7 h-7 rounded bg-sp-card border border-sp-border text-sp-text text-sm disabled:opacity-30"
          >
            -
          </button>
          <span className="text-sm w-6 text-center text-sp-text">{cols}</span>
          <button
            onClick={() => void handleResize(rows, cols + 1)}
            className="w-7 h-7 rounded bg-sp-card border border-sp-border text-sp-text text-sm"
          >
            +
          </button>
        </div>

        <button
          onClick={() => void handleTogglePairMode()}
          className={pairMode ? activeBtnClass : toolBtnClass}
        >
          <span className="material-symbols-outlined text-lg">group</span>
          짝꿍
        </button>

        {pairMode && (
          <button
            onClick={() => void handleToggleOddColumnMode()}
            className={
              (cls.seating?.oddColumnMode ?? 'single') === 'triple'
                ? 'flex items-center gap-1.5 px-3 py-1.5 bg-sp-highlight/20 border border-sp-highlight/40 rounded-lg text-sp-highlight text-sm'
                : toolBtnClass
            }
            title="홀수 열 처리: 3명 함께 앉기 / 1명 따로 앉기"
          >
            <span className="material-symbols-outlined text-lg">group_add</span>
            {(cls.seating?.oddColumnMode ?? 'single') === 'triple' ? '3인 짝' : '1인 따로'}
          </button>
        )}

        <button
          onClick={() => setIsTeacherView((v) => !v)}
          className={isTeacherView ? activeBtnClass : toolBtnClass}
          title={isTeacherView ? '학생 시점으로 보기' : '교사 시점으로 보기'}
        >
          <span className="material-symbols-outlined text-lg">
            {isTeacherView ? 'visibility' : 'swap_vert'}
          </span>
          {isTeacherView ? '교사 시점' : '교사 시점'}
        </button>

        <button
          onClick={() => {
            setIsAttendanceMode((v) => !v);
            if (isEditing) setIsEditing(false);
          }}
          className={isAttendanceMode ? activeBtnClass : toolBtnClass}
        >
          <span className="material-symbols-outlined text-lg">fact_check</span>
          출석/기록
        </button>

        {/* 내보내기 */}
        <div className="relative ml-auto" ref={exportMenuRef}>
          <button
            onClick={() => setShowExportMenu((v) => !v)}
            className={toolBtnClass}
          >
            <span className="material-symbols-outlined text-lg">download</span>
            내보내기
          </button>
          {showExportMenu && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-sp-card border border-sp-border rounded-xl shadow-2xl shadow-black/30 z-50 overflow-hidden">
              <button
                onClick={() => void handleExport('excel')}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-sp-text hover:bg-sp-accent/10 transition-colors"
              >
                <span className="material-symbols-outlined text-green-400 text-lg">table_view</span>
                <span>자리 배치 Excel (.xlsx)</span>
              </button>
              <button
                onClick={() => void handleExport('hwpx')}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-sp-text hover:bg-sp-accent/10 transition-colors border-t border-sp-border"
              >
                <span className="material-symbols-outlined text-blue-400 text-lg">description</span>
                <span>자리 배치 한글 (.hwpx)</span>
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => void handleClear()}
          className="text-sm text-red-400 hover:text-red-300 transition-colors"
        >
          전체 초기화
        </button>
      </div>

      {/* 출석 체크 컨트롤 바 */}
      {isAttendanceMode && (
        <div className="flex items-center gap-4 mb-4 bg-sp-card border border-sp-border rounded-xl px-4 py-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-sp-muted">날짜</label>
            <input
              type="date"
              value={attendanceDate}
              onChange={(e) => setAttendanceDate(e.target.value)}
              className="px-3 py-1.5 bg-sp-card border border-sp-border rounded-lg text-sp-text text-sm focus:outline-none focus:border-sp-accent"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-sp-muted">교시</label>
            <div className="flex gap-1">
              {PERIODS.map((p) => {
                const isMatching = matchingPeriods.has(p);
                return (
                  <button
                    key={p}
                    onClick={() => setAttendancePeriod(p)}
                    title={isMatching ? `${cls?.subject} 수업` : undefined}
                    className={`relative w-8 h-8 rounded-lg text-sm font-medium transition-all
                      ${attendancePeriod === p
                        ? 'bg-sp-accent text-white ring-2 ring-sp-accent/40 shadow-md shadow-sp-accent/20'
                        : isMatching
                          ? 'bg-sp-accent/15 border-2 border-sp-accent text-sp-accent font-semibold'
                          : 'bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/50'
                      }`}
                  >
                    {p}
                    {isMatching && attendancePeriod !== p && (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-sp-accent" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-sp-muted">
            <span className="text-green-400">{STATUS_CONFIG.present.label} {attendanceStats.present}</span>
            <span className="text-red-400">{STATUS_CONFIG.absent.label} {attendanceStats.absent}</span>
            <span className="text-amber-400">{STATUS_CONFIG.late.label} {attendanceStats.late}</span>
            <span className="text-orange-400">{STATUS_CONFIG.earlyLeave.label} {attendanceStats.earlyLeave}</span>
            <span className="text-purple-400">{STATUS_CONFIG.classAbsence.label} {attendanceStats.classAbsence}</span>
          </div>
          <button
            onClick={() => void handleSaveAttendance()}
            disabled={!hasModified || saveStatus === 'saving'}
            className={`ml-auto flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${hasModified
                ? 'bg-sp-accent text-white hover:bg-sp-accent/80'
                : saveStatus === 'saved'
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-sp-card border border-sp-border text-sp-muted'
              }`}
          >
            <span className="material-symbols-outlined text-lg">
              {saveStatus === 'saving' ? 'sync' : saveStatus === 'saved' ? 'check' : 'save'}
            </span>
            {saveStatus === 'saving' ? '저장 중...' : saveStatus === 'saved' ? '저장됨' : '저장'}
          </button>
        </div>
      )}

      {/* 교실 정면 레이블 (학생 시점: 위, 교사 시점: 아래) */}
      {!isTeacherView && (
        <div className="flex justify-center mb-3">
          <div className="px-6 py-1.5 bg-sp-border/40 rounded-full text-xs text-sp-muted font-medium">
            칠판
          </div>
        </div>
      )}

      {/* 좌석 그리드 */}
      <div className="flex-1 overflow-auto pb-4">
        {pairMode ? (
          <div className="mx-auto w-fit flex flex-col gap-4">
            {renderPairGrid(displaySeats, rows, cols, studentMap, isEditing, dragSource, dragOver, handleDragStart, handleDragOver, handleDrop, handleDragEnd, isTeacherView, cls.seating?.oddColumnMode ?? 'single', isAttendanceMode, localAttendance, handleAttendanceClick)}
          </div>
        ) : (
          <div
            className="mx-auto w-fit"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gap: '8px',
            }}
          >
            {renderNormalGrid(displaySeats, rows, cols, studentMap, isEditing, dragSource, dragOver, handleDragStart, handleDragOver, handleDrop, handleDragEnd, isTeacherView, isAttendanceMode, localAttendance, handleAttendanceClick)}
          </div>
        )}
      </div>

      {/* 교실 정면 레이블 (교사 시점: 아래) */}
      {isTeacherView && (
        <div className="flex justify-center mt-3 pb-2">
          <div className="px-6 py-1.5 bg-sp-border/40 rounded-full text-xs text-sp-muted font-medium">
            칠판
          </div>
        </div>
      )}

      {/* 출석 팝업 모달 */}
      {selectedStudentKey && (() => {
        const student = studentMap.get(selectedStudentKey);
        const currentStatus = localAttendance.get(selectedStudentKey) ?? 'present';
        const currentReason = attendanceReasons.get(selectedStudentKey) ?? '';
        const currentMemo = attendanceMemos.get(selectedStudentKey) ?? '';
        const needsReason = currentStatus !== 'present';

        const STATUS_BUTTONS: { status: AttendanceStatus; label: string; color: string }[] = [
          { status: 'present', label: '출석', color: 'bg-green-500/20 text-green-400 border-green-500/40' },
          { status: 'absent', label: '결석', color: 'bg-red-500/20 text-red-400 border-red-500/40' },
          { status: 'late', label: '지각', color: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
          { status: 'earlyLeave', label: '조퇴', color: 'bg-orange-500/20 text-orange-400 border-orange-500/40' },
          { status: 'classAbsence', label: '결과', color: 'bg-purple-500/20 text-purple-400 border-purple-500/40' },
        ];

        return (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setSelectedStudentKey(null)}
          >
            <div
              className="bg-sp-card border border-sp-border rounded-2xl w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto shadow-2xl shadow-black/40"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 헤더 */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-sp-border">
                <h3 className="text-base font-semibold text-sp-text">
                  {student ? `${student.number}번 ${student.name}` : '학생'}
                </h3>
                <button
                  onClick={() => setSelectedStudentKey(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-sp-border/50 text-sp-muted transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>

              <div className="px-5 py-4 space-y-5">
                {/* 출결 섹션 */}
                <div>
                  <p className="text-xs font-semibold text-sp-muted mb-2 uppercase tracking-wide">출결</p>
                  <div className="flex gap-1.5 flex-wrap mb-3">
                    {STATUS_BUTTONS.map(({ status, label, color }) => (
                      <button
                        key={status}
                        onClick={() => setStudentAttStatus(selectedStudentKey, status)}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-all
                          ${currentStatus === status ? color + ' font-semibold ring-2 ring-offset-1 ring-offset-sp-card ring-current' : 'bg-sp-surface border-sp-border text-sp-muted hover:text-sp-text'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* 사유 (출석이 아닐 때) */}
                  {needsReason && (
                    <div className="mb-3">
                      <p className="text-xs text-sp-muted mb-1.5">사유</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {ATTENDANCE_REASONS.map((reason) => (
                          <button
                            key={reason}
                            onClick={() => {
                              setAttendanceReasons((prev) => {
                                const next = new Map(prev);
                                if (next.get(selectedStudentKey) === reason) {
                                  next.delete(selectedStudentKey);
                                } else {
                                  next.set(selectedStudentKey, reason);
                                }
                                return next;
                              });
                              setHasModified(true);
                              setSaveStatus('idle');
                            }}
                            className={`px-3 py-1 rounded-lg text-sm border transition-all
                              ${currentReason === reason
                                ? 'bg-sp-accent/20 border-sp-accent/40 text-sp-accent font-semibold'
                                : 'bg-sp-surface border-sp-border text-sp-muted hover:text-sp-text'}`}
                          >
                            {reason}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 상세 메모 */}
                  <div>
                    <p className="text-xs text-sp-muted mb-1.5">상세 메모</p>
                    <input
                      type="text"
                      value={currentMemo}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAttendanceMemos((prev) => {
                          const next = new Map(prev);
                          if (val) next.set(selectedStudentKey, val);
                          else next.delete(selectedStudentKey);
                          return next;
                        });
                        setHasModified(true);
                        setSaveStatus('idle');
                      }}
                      placeholder="메모 입력 (선택)"
                      className="w-full px-3 py-2 bg-sp-surface border border-sp-border rounded-lg text-sp-text text-sm placeholder:text-sp-muted focus:outline-none focus:border-sp-accent"
                    />
                  </div>
                </div>

                {/* 출결 저장 버튼 */}
                <button
                  onClick={async () => { await handleSaveAttendance(); setSelectedStudentKey(null); }}
                  disabled={saveStatus === 'saving'}
                  className={`w-full py-2 rounded-lg text-sm font-medium transition-all ${
                    saveStatus === 'saved'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-sp-accent text-white hover:bg-sp-accent/80'
                  } disabled:opacity-50`}
                >
                  {saveStatus === 'saved' ? '✓ 출석 저장됨' : saveStatus === 'saving' ? '저장 중...' : '출석 저장'}
                </button>

                {/* 특기사항 섹션 */}
                <div className="border-t border-sp-border pt-4">
                  <p className="text-xs font-semibold text-sp-muted mb-3 uppercase tracking-wide">특기사항</p>
                  <ObservationForm classId={classId} studentId={selectedStudentKey} />
                </div>

                {/* 최근 기록 (토글) */}
                {selectedObservations.length > 0 && (
                  <div className="border-t border-sp-border pt-4">
                    <button
                      onClick={() => setShowRecentRecords((v) => !v)}
                      className="flex items-center gap-1 text-xs font-semibold text-sp-muted mb-3 uppercase tracking-wide hover:text-sp-text transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm" style={{ transition: 'transform 0.2s', transform: showRecentRecords ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                        chevron_right
                      </span>
                      최근 기록 ({selectedObservations.length})
                    </button>
                    {showRecentRecords && (
                      <div className="space-y-2">
                        {selectedObservations.map((rec) => (
                          <ObservationCard key={rec.id} record={rec} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ────── 일반 그리드 렌더링 ────── */

function renderNormalGrid(
  seats: (string | null)[][],
  rows: number,
  cols: number,
  studentMap: Map<string, TeachingClassStudent>,
  isEditing: boolean,
  dragSource: { row: number; col: number } | null,
  dragOver: { row: number; col: number } | null,
  onDragStart: (r: number, c: number) => void,
  onDragOver: (e: React.DragEvent, r: number, c: number) => void,
  onDrop: (r: number, c: number) => Promise<void>,
  onDragEnd: () => void,
  isTeacherView: boolean,
  isAttendanceMode: boolean,
  attendanceMap: Map<string, AttendanceStatus>,
  onAttendanceClick: (key: string) => void,
) {
  const cells: React.ReactNode[] = [];
  for (let vi = 0; vi < rows; vi++) {
    for (let vj = 0; vj < cols; vj++) {
      // 교사 시점: 상하좌우 반전 (180도 회전)
      const r = isTeacherView ? rows - 1 - vi : vi;
      const c = isTeacherView ? cols - 1 - vj : vj;
      const key = seats[r]?.[c] ?? null;
      const student = key ? studentMap.get(key) : undefined;
      const isDragSrc = dragSource?.row === r && dragSource?.col === c;
      const isDragOvr = dragOver?.row === r && dragOver?.col === c;

      cells.push(
        <SeatCard
          key={`${r}-${c}`}
          student={student ?? null}
          isEmpty={key === null}
          isEditing={isAttendanceMode ? false : isEditing}
          isDragSource={isDragSrc}
          isDragOver={isDragOvr}
          onDragStart={() => onDragStart(r, c)}
          onDragOver={(e) => onDragOver(e, r, c)}
          onDrop={() => void onDrop(r, c)}
          onDragEnd={onDragEnd}
          isAttendanceMode={isAttendanceMode}
          attendanceStatus={key ? attendanceMap.get(key) : undefined}
          onAttendanceClick={key ? () => onAttendanceClick(key) : undefined}
        />,
      );
    }
  }
  return cells;
}

/* ────── 짝꿍 그리드 렌더링 ────── */

function renderPairGrid(
  seats: (string | null)[][],
  rows: number,
  cols: number,
  studentMap: Map<string, TeachingClassStudent>,
  isEditing: boolean,
  dragSource: { row: number; col: number } | null,
  dragOver: { row: number; col: number } | null,
  onDragStart: (r: number, c: number) => void,
  onDragOver: (e: React.DragEvent, r: number, c: number) => void,
  onDrop: (r: number, c: number) => Promise<void>,
  onDragEnd: () => void,
  isTeacherView: boolean,
  oddColumnMode: 'single' | 'triple' = 'single',
  isAttendanceMode: boolean = false,
  attendanceMap: Map<string, AttendanceStatus> = new Map(),
  onAttendanceClick: (key: string) => void = () => {},
) {
  const mode = oddColumnMode;
  const basePairs = buildPairGroups(cols, cols % 2 !== 0 ? mode : 'single');
  const useRowAdjust = mode === 'triple' && cols % 2 === 0;
  const rowElements: React.ReactNode[] = [];

  for (let vi = 0; vi < rows; vi++) {
    const r = isTeacherView ? rows - 1 - vi : vi;
    const rowData = seats[r] ?? [];

    // 행별 그룹 조정 (짝수 열 + 3인짝 모드)
    const rowPairs = useRowAdjust
      ? adjustPairGroupsForRow(basePairs, rowData)
      : basePairs;
    const orderedPairs = isTeacherView ? [...rowPairs].reverse() : rowPairs;

    const groupCells = orderedPairs.map((group, gIdx) => {
      const cells: React.ReactNode[] = [];
      const groupCols: number[] = [];
      for (let c = group.startCol; c <= group.endCol; c++) {
        groupCols.push(c);
      }
      const colOrder = isTeacherView ? [...groupCols].reverse() : groupCols;

      for (const c of colOrder) {
        if (c >= cols) continue;
        const key = seats[r]?.[c] ?? null;
        const student = key ? studentMap.get(key) : undefined;
        const isDragSrc = dragSource?.row === r && dragSource?.col === c;
        const isDragOvr = dragOver?.row === r && dragOver?.col === c;

        cells.push(
          <SeatCard
            key={`${r}-${c}`}
            student={student ?? null}
            isEmpty={key === null}
            isEditing={isAttendanceMode ? false : isEditing}
            isDragSource={isDragSrc}
            isDragOver={isDragOvr}
            onDragStart={() => onDragStart(r, c)}
            onDragOver={(e) => onDragOver(e, r, c)}
            onDrop={() => void onDrop(r, c)}
            onDragEnd={onDragEnd}
            isAttendanceMode={isAttendanceMode}
            attendanceStatus={key ? attendanceMap.get(key) : undefined}
            onAttendanceClick={key ? () => onAttendanceClick(key) : undefined}
          />,
        );
      }

      return (
        <div
          key={`pair-${r}-${gIdx}`}
          className="flex gap-1 bg-sp-bg/30 rounded-xl p-1"
        >
          {cells}
        </div>
      );
    });

    rowElements.push(
      <div key={`row-${r}`} className="flex items-stretch justify-center gap-4">
        {groupCells}
      </div>,
    );
  }
  return rowElements;
}

/* ────── 좌석 카드 컴포넌트 ────── */

interface SeatCardProps {
  student: TeachingClassStudent | null;
  isEmpty: boolean;
  isEditing: boolean;
  isDragSource: boolean;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  isAttendanceMode?: boolean;
  attendanceStatus?: AttendanceStatus;
  onAttendanceClick?: () => void;
}

function SeatCard({
  student,
  isEmpty,
  isEditing,
  isDragSource,
  isDragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isAttendanceMode,
  attendanceStatus,
  onAttendanceClick,
}: SeatCardProps) {
  let className =
    'w-20 min-h-[72px] rounded-xl p-2 flex flex-col items-center justify-center gap-0.5 transition-all select-none relative';

  if (isEmpty) {
    className += ' border border-dashed border-sp-border/50 bg-transparent';
  } else if (isAttendanceMode && attendanceStatus) {
    className += ` bg-sp-card border-2 ${BORDER_COLOR_MAP[attendanceStatus]}`;
  } else {
    className += ' bg-sp-card border border-sp-border';
  }

  if (isDragOver && !isAttendanceMode) {
    className += ' ring-2 ring-sp-accent bg-sp-accent/10';
  }
  if (isDragSource && !isAttendanceMode) {
    className += ' opacity-40';
  }
  if (isAttendanceMode && !isEmpty) {
    className += ' cursor-pointer hover:brightness-110';
  } else if (isEditing && !isEmpty) {
    className += ' cursor-grab active:cursor-grabbing';
  }

  const handleClick = () => {
    if (isAttendanceMode && onAttendanceClick && !isEmpty) {
      onAttendanceClick();
    }
  };

  return (
    <div
      className={className}
      draggable={!isAttendanceMode && isEditing}
      onDragStart={isAttendanceMode ? undefined : onDragStart}
      onDragOver={isAttendanceMode ? undefined : onDragOver}
      onDrop={isAttendanceMode ? undefined : onDrop}
      onDragEnd={isAttendanceMode ? undefined : onDragEnd}
      onClick={handleClick}
    >
      {/* 출석 상태 뱃지 */}
      {isAttendanceMode && attendanceStatus && !isEmpty && attendanceStatus !== 'present' && (
        <span
          className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs
            ${attendanceStatus === 'absent' ? 'bg-red-500' : ''}
            ${attendanceStatus === 'late' ? 'bg-amber-500' : ''}
            ${attendanceStatus === 'earlyLeave' ? 'bg-orange-500' : ''}
            ${attendanceStatus === 'classAbsence' ? 'bg-purple-500' : ''}
          `}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
            {STATUS_CONFIG[attendanceStatus].icon}
          </span>
        </span>
      )}
      {isAttendanceMode && attendanceStatus === 'present' && !isEmpty && (
        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs bg-green-500">
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>check</span>
        </span>
      )}
      {student ? (
        <>
          {student.grade != null && student.classNum != null && (
            <span className="text-caption text-sp-muted">
              {student.grade}-{student.classNum}
            </span>
          )}
          <span className="text-xs text-sp-muted">{student.number}번</span>
          <span className="text-sm font-medium text-sp-text truncate max-w-full">
            {student.name}
          </span>
        </>
      ) : (
        <span className="text-sp-muted text-xs">빈 자리</span>
      )}
    </div>
  );
}
