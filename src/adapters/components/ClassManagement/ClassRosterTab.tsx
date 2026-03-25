import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import type { TeachingClassStudent } from '@domain/entities/TeachingClass';
import { studentKey } from '@domain/entities/TeachingClass';
import type { AttendanceStatus, StudentAttendance, AttendanceRecord } from '@domain/entities/Attendance';
import { exportAttendanceToExcel, generateTeachingClassRosterTemplate, parseTeachingClassRosterFromExcel } from '@infrastructure/export';
import { useToastStore } from '@adapters/components/common/Toast';
import { CalendarPicker } from '@adapters/components/common/CalendarPicker';
import { isSubjectMatch } from '@domain/rules/matchingRules';

/* ──────────────────────── 유틸 ──────────────────────── */

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; icon: string; badge: string }> = {
  present: { label: '출석', icon: 'check_circle', badge: 'bg-green-500/20 text-green-400' },
  absent: { label: '결석', icon: 'cancel', badge: 'bg-red-500/20 text-red-400' },
  late: { label: '지각', icon: 'schedule', badge: 'bg-amber-500/20 text-amber-400' },
  earlyLeave: { label: '조퇴', icon: 'exit_to_app', badge: 'bg-orange-500/20 text-orange-400' },
  classAbsence: { label: '결과', icon: 'event_busy', badge: 'bg-purple-500/20 text-purple-400' },
};

const STATUS_CYCLE: Record<AttendanceStatus, AttendanceStatus> = {
  present: 'absent',
  absent: 'late',
  late: 'earlyLeave',
  earlyLeave: 'classAbsence',
  classAbsence: 'present',
};

const STAT_COLORS: Record<AttendanceStatus, string> = {
  present: 'text-green-400',
  absent: 'text-red-400',
  late: 'text-amber-400',
  earlyLeave: 'text-orange-400',
  classAbsence: 'text-purple-400',
};

const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/* ──────────────────────── 컴포넌트 ──────────────────────── */

interface ClassRosterTabProps {
  classId: string;
}

export function ClassRosterTab({ classId }: ClassRosterTabProps) {
  const classes = useTeachingClassStore((s) => s.classes);
  const updateClass = useTeachingClassStore((s) => s.updateClass);
  const getAttendanceRecord = useTeachingClassStore((s) => s.getAttendanceRecord);
  const saveAttendanceRecord = useTeachingClassStore((s) => s.saveAttendanceRecord);
  const showToast = useToastStore((s) => s.show);
  const teacherSchedule = useScheduleStore((s) => s.teacherSchedule);
  const classSchedule = useScheduleStore((s) => s.classSchedule);
  const loadSchedule = useScheduleStore((s) => s.load);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  const cls = classes.find((c) => c.id === classId);
  const students = cls?.students ?? [];

  /* ── 편집 모드 상태 ── */
  const [isEditing, setIsEditing] = useState(false);
  const [sortBy, setSortBy] = useState<'number' | 'name' | 'grade'>('number');
  const [editStudents, setEditStudents] = useState<TeachingClassStudent[]>([]);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [excelPreview, setExcelPreview] = useState<TeachingClassStudent[] | null>(null);
  const excelFileRef = useRef<HTMLInputElement>(null);

  const hasGradeInfo = useMemo(() => {
    // 편집 중이면 editStudents도 체크
    const list = isEditing ? editStudents : students;
    return list.some((s) => s.grade != null || s.classNum != null);
  }, [students, isEditing, editStudents]);

  const sortedStudents = useMemo(() => {
    const list = isEditing ? editStudents : cls?.students ?? [];
    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'grade':
          // 소속이 있는 학생 먼저, 없는 학생은 뒤로
          if ((a.grade != null) !== (b.grade != null)) return a.grade != null ? -1 : 1;
          if ((a.grade ?? 0) !== (b.grade ?? 0)) return (a.grade ?? 0) - (b.grade ?? 0);
          if ((a.classNum ?? 0) !== (b.classNum ?? 0)) return (a.classNum ?? 0) - (b.classNum ?? 0);
          return a.number - b.number;
        case 'name':
          // 결번은 뒤로
          if ((a.isVacant ?? false) !== (b.isVacant ?? false)) return a.isVacant ? 1 : -1;
          return (a.name || '').localeCompare(b.name || '', 'ko');
        case 'number':
        default:
          // 소속(학년→반) 순 → 번호 순
          if ((a.grade ?? 0) !== (b.grade ?? 0)) return (a.grade ?? 0) - (b.grade ?? 0);
          if ((a.classNum ?? 0) !== (b.classNum ?? 0)) return (a.classNum ?? 0) - (b.classNum ?? 0);
          return a.number - b.number;
      }
    });
  }, [isEditing, editStudents, cls?.students, sortBy]);

  /* ── 출석 상태 ── */
  const [date, setDate] = useState(todayString);
  const [period, setPeriod] = useState(1);
  const [localAttendance, setLocalAttendance] = useState<StudentAttendance[]>([]);
  const [attendanceInitialized, setAttendanceInitialized] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  /* ── 인라인 메모 편집 상태 ── */
  const [editingMemoKey, setEditingMemoKey] = useState<string | null>(null);
  const [editingMemoValue, setEditingMemoValue] = useState('');
  const memoInputRef = useRef<HTMLInputElement>(null);

  /* ── 시간표 연동: 해당 날짜의 매칭 교시 ── */
  const getMatchingPeriods = useCallback((dateStr: string): number[] => {
    if (!cls) return [];
    const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
    const d = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = DAYS[d.getDay()] ?? '';
    if (!dayOfWeek) return [];

    const dayScheduleClass = classSchedule[dayOfWeek];
    const dayScheduleTeacher = teacherSchedule?.[dayOfWeek];
    const periods: number[] = [];

    // 1단계: 학급 시간표에서 과목 매칭
    if (dayScheduleClass && dayScheduleClass.length > 0) {
      dayScheduleClass.forEach((slot, idx) => {
        if (slot.subject && isSubjectMatch(slot.subject, cls.subject)) {
          periods.push(idx + 1);
        }
      });
    }

    // 2단계: 교사 시간표에서 교실명 + 과목 매칭
    if (periods.length === 0 && dayScheduleTeacher) {
      dayScheduleTeacher.forEach((slot, idx) => {
        if (!slot) return;
        const classroomMatch =
          slot.classroom === cls.name ||
          slot.classroom.includes(cls.name) ||
          cls.name.includes(slot.classroom);
        if (classroomMatch && isSubjectMatch(slot.subject, cls.subject)) {
          periods.push(idx + 1);
        }
      });
    }

    // 3단계: 교실명만으로 매칭
    if (periods.length === 0 && dayScheduleTeacher) {
      dayScheduleTeacher.forEach((slot, idx) => {
        if (!slot) return;
        const classroomMatch =
          slot.classroom === cls.name ||
          slot.classroom.includes(cls.name) ||
          cls.name.includes(slot.classroom);
        if (classroomMatch) {
          periods.push(idx + 1);
        }
      });
    }

    return periods;
  }, [cls, classSchedule, teacherSchedule]);

  const matchingPeriods = useMemo(
    () => new Set(getMatchingPeriods(date)),
    [date, getMatchingPeriods],
  );

  // 수업이 있는 요일 (CalendarPicker용)
  const lessonDayIndices = useMemo(() => {
    const indices: number[] = [];
    const ref = new Date();
    const refDay = ref.getDay();
    for (let i = 0; i < 7; i++) {
      const d = new Date(ref);
      d.setDate(d.getDate() + (i - refDay));
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (getMatchingPeriods(ds).length > 0) {
        indices.push(i);
      }
    }
    return indices;
  }, [getMatchingPeriods]);

  /* ──────────────────────── 출석 로드 ──────────────────────── */

  const loadRecord = useCallback(
    (d: string, p: number) => {
      const activeStudents = students.filter((s) => !s.isVacant);
      const existing = getAttendanceRecord(classId, d, p);
      if (existing) {
        const map = new Map(existing.students.map((s) => [studentKey(s), s.status]));
        setLocalAttendance(
          activeStudents.map((s) => ({
            number: s.number,
            grade: s.grade,
            classNum: s.classNum,
            status: map.get(studentKey(s)) ?? 'present',
          })),
        );
      } else {
        setLocalAttendance(
          activeStudents.map((s) => ({
            number: s.number,
            grade: s.grade,
            classNum: s.classNum,
            status: 'present' as AttendanceStatus,
          })),
        );
      }
      setAttendanceInitialized(true);
      setSaveStatus('idle');
    },
    [classId, students, getAttendanceRecord],
  );

  // 초기 로드 및 날짜/교시 변경 감지
  useMemo(() => {
    if (students.length > 0) {
      loadRecord(date, period);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, period, classId, students.length]);

  const handleDateChange = useCallback(
    (newDate: string) => {
      setDate(newDate);
      loadRecord(newDate, period);
    },
    [period, loadRecord],
  );

  const handlePeriodChange = useCallback(
    (newPeriod: number) => {
      setPeriod(newPeriod);
      loadRecord(date, newPeriod);
    },
    [date, loadRecord],
  );

  const toggleStatus = useCallback((key: string) => {
    setLocalAttendance((prev) =>
      prev.map((s) =>
        studentKey(s) === key
          ? { ...s, status: STATUS_CYCLE[s.status] }
          : s,
      ),
    );
    setSaveStatus('idle');
  }, []);

  const handleAttendanceSave = useCallback(async () => {
    setSaveStatus('saving');
    const record: AttendanceRecord = {
      classId,
      date,
      period,
      students: localAttendance,
    };
    await saveAttendanceRecord(record);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  }, [classId, date, period, localAttendance, saveAttendanceRecord]);

  const [showExportModal, setShowExportModal] = useState(false);

  /* ── 출석 통계 ── */
  const stats = useMemo(() => {
    const counts: Record<AttendanceStatus, number> = {
      present: 0,
      absent: 0,
      late: 0,
      earlyLeave: 0,
      classAbsence: 0,
    };
    for (const s of localAttendance) {
      counts[s.status]++;
    }
    return counts;
  }, [localAttendance]);

  /* ──────────────────────── 편집 모드 ──────────────────────── */

  const startEdit = useCallback(() => {
    if (!cls) return;
    setEditStudents(cls.students.map((s) => ({ ...s })));
    setIsEditing(true);
  }, [cls]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditStudents([]);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!cls) return;
    await updateClass({
      ...cls,
      students: editStudents,
    });
    setIsEditing(false);
  }, [cls, editStudents, updateClass]);

  const updateStudentName = useCallback((index: number, name: string) => {
    setEditStudents((prev) => {
      const next = [...prev];
      const existing = next[index];
      if (existing) {
        next[index] = { ...existing, name };
      }
      return next;
    });
  }, []);


  const addRow = useCallback(() => {
    setEditStudents((prev) => {
      const nextNumber = prev.length > 0 ? Math.max(...prev.map((s) => s.number)) + 1 : 1;
      return [...prev, { number: nextNumber, name: '' }];
    });
  }, []);

  const setStudentCount = useCallback((count: number) => {
    if (count < 1) return;
    setEditStudents((prev) => {
      if (count > prev.length) {
        const newRows: TeachingClassStudent[] = [];
        const maxNum = prev.length > 0 ? Math.max(...prev.map((s) => s.number)) : 0;
        for (let i = 0; i < count - prev.length; i++) {
          newRows.push({ number: maxNum + i + 1, name: '' });
        }
        return [...prev, ...newRows];
      }
      return prev.slice(0, count);
    });
  }, []);

  const removeRow = useCallback((index: number) => {
    setEditStudents((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateStudentGrade = useCallback((index: number, grade: number | undefined) => {
    setEditStudents((prev) => {
      const next = [...prev];
      const existing = next[index];
      if (existing) next[index] = { ...existing, grade };
      return next;
    });
  }, []);

  const updateStudentClassNum = useCallback((index: number, classNum: number | undefined) => {
    setEditStudents((prev) => {
      const next = [...prev];
      const existing = next[index];
      if (existing) next[index] = { ...existing, classNum };
      return next;
    });
  }, []);

  const updateStudentNumber = useCallback((index: number, num: number) => {
    setEditStudents((prev) => {
      const next = [...prev];
      const existing = next[index];
      if (existing) next[index] = { ...existing, number: num };
      return next;
    });
  }, []);

  const toggleVacant = useCallback((index: number) => {
    setEditStudents((prev) => {
      const next = [...prev];
      const existing = next[index];
      if (existing) {
        next[index] = {
          ...existing,
          isVacant: !existing.isVacant,
          name: !existing.isVacant ? '' : existing.name,
        };
      }
      return next;
    });
  }, []);

  /* ── 반별 인원 입력 ── */
  const [bulkEntries, setBulkEntries] = useState<Array<{ grade: string; classNum: string; count: string }>>([
    { grade: '', classNum: '', count: '' },
  ]);

  const updateBulkEntry = useCallback((index: number, field: 'grade' | 'classNum' | 'count', value: string) => {
    setBulkEntries((prev) => {
      const next = [...prev];
      next[index] = { ...next[index]!, [field]: value };
      return next;
    });
  }, []);

  const addBulkEntry = useCallback(() => {
    setBulkEntries((prev) => {
      // 마지막 항목의 학년을 복사
      const last = prev[prev.length - 1];
      return [...prev, { grade: last?.grade ?? '', classNum: '', count: '' }];
    });
  }, []);

  const removeBulkEntry = useCallback((index: number) => {
    setBulkEntries((prev) => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);
  }, []);

  const applyBulkEntries = useCallback(() => {
    // 학년 → 반 순으로 정렬 후 생성
    const sorted = [...bulkEntries]
      .map((e) => ({ grade: parseInt(e.grade, 10), classNum: parseInt(e.classNum, 10), count: parseInt(e.count, 10) }))
      .filter((e) => !isNaN(e.grade) && !isNaN(e.classNum) && !isNaN(e.count) && e.count > 0)
      .sort((a, b) => a.grade - b.grade || a.classNum - b.classNum);
    const students: TeachingClassStudent[] = [];
    for (const entry of sorted) {
      for (let i = 1; i <= entry.count; i++) {
        students.push({ number: i, name: '', grade: entry.grade, classNum: entry.classNum });
      }
    }
    if (students.length > 0) {
      setEditStudents(students);
    }
  }, [bulkEntries]);

  const bulkValid = bulkEntries.some((e) => {
    const g = parseInt(e.grade, 10);
    const c = parseInt(e.classNum, 10);
    const n = parseInt(e.count, 10);
    return !isNaN(g) && !isNaN(c) && !isNaN(n) && n > 0;
  });

  const bulkTotal = bulkEntries.reduce((sum, e) => {
    const n = parseInt(e.count, 10);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);

  const handlePasteImport = useCallback(() => {
    const lines = pasteText.trim().split('\n').filter((line) => line.trim());
    if (lines.length === 0) return;

    const parsed: TeachingClassStudent[] = lines.map((line, idx) => {
      const parts = line.split('\t');
      // 4열: 학년 반 번호 이름
      if (parts.length >= 4) {
        const grade = parseInt(parts[0]!.trim(), 10);
        const classNum = parseInt(parts[1]!.trim(), 10);
        const num = parseInt(parts[2]!.trim(), 10);
        const name = parts[3]!.trim();
        return {
          number: isNaN(num) ? idx + 1 : num,
          name,
          grade: isNaN(grade) ? undefined : grade,
          classNum: isNaN(classNum) ? undefined : classNum,
        };
      }
      // 2열: 번호 이름
      if (parts.length >= 2) {
        const num = parseInt(parts[0]!.trim(), 10);
        const name = parts[1]!.trim();
        return { number: isNaN(num) ? idx + 1 : num, name };
      }
      // 1열: 이름만
      return { number: idx + 1, name: line.trim() };
    });

    setEditStudents(parsed);
    setShowPasteModal(false);
    setPasteText('');
    if (!isEditing) setIsEditing(true);
  }, [pasteText, isEditing]);

  /* ── 엑셀 양식 다운로드 ── */
  const handleDownloadTemplate = useCallback(async () => {
    try {
      const data = await generateTeachingClassRosterTemplate();
      const defaultFileName = '수업반_명렬표_양식.xlsx';

      if (window.electronAPI) {
        const filePath = await window.electronAPI.showSaveDialog({
          title: '명렬표 양식 다운로드',
          defaultPath: defaultFileName,
          filters: [{ name: 'Excel 파일', extensions: ['xlsx'] }],
        });
        if (filePath) {
          await window.electronAPI.writeFile(filePath, data);
          showToast('양식이 저장되었습니다', 'success', {
            label: '파일 열기',
            onClick: () => window.electronAPI?.openFile(filePath),
          });
        }
      } else {
        const blob = new Blob([data], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultFileName;
        a.click();
        URL.revokeObjectURL(url);
        showToast('양식이 다운로드되었습니다', 'success');
      }
    } catch {
      showToast('양식 다운로드 중 오류가 발생했습니다', 'error');
    }
  }, [showToast]);

  /* ── 엑셀 파일 선택 ── */
  const handleExcelFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith('.xls') && !file.name.endsWith('.xlsx')) {
      showToast('구형 엑셀(.xls) 파일은 지원되지 않습니다. Excel에서 .xlsx로 다시 저장해주세요.', 'error');
      e.target.value = '';
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const parsed = await parseTeachingClassRosterFromExcel(buffer);
      if (parsed.length === 0) {
        showToast('엑셀에서 학생 데이터를 찾을 수 없습니다. 1열=번호, 2열=이름 순서인지 확인해주세요.', 'error');
        e.target.value = '';
        return;
      }
      setExcelPreview(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('End of data reached') || msg.includes('Unexpected')) {
        showToast('파일 형식을 읽을 수 없습니다. .xlsx 파일인지 확인해주세요.', 'error');
      } else {
        showToast('엑셀 파일을 읽는 중 오류가 발생했습니다', 'error');
      }
    }
    e.target.value = '';
  }, [showToast]);

  /* ── 엑셀 가져오기 적용 ── */
  const applyExcelImport = useCallback(async () => {
    if (!excelPreview || !cls) return;
    await updateClass({ ...cls, students: excelPreview });
    showToast(`${excelPreview.length}명의 학생을 가져왔습니다`, 'success');
    setExcelPreview(null);
    if (isEditing) {
      setIsEditing(false);
      setEditStudents([]);
    }
  }, [excelPreview, cls, updateClass, showToast, isEditing]);

  /* ── 붙여넣기 미리보기 ── */
  const parsedPreview = useMemo(() => {
    if (!pasteText.trim()) return [];
    const lines = pasteText.trim().split('\n').filter((line) => line.trim());
    return lines.map((line, idx) => {
      const parts = line.split('\t');
      if (parts.length >= 4) {
        const grade = parseInt(parts[0]!.trim(), 10);
        const classNum = parseInt(parts[1]!.trim(), 10);
        const num = parseInt(parts[2]!.trim(), 10);
        const name = parts[3]!.trim();
        return {
          number: isNaN(num) ? idx + 1 : num,
          name,
          grade: isNaN(grade) ? undefined : grade,
          classNum: isNaN(classNum) ? undefined : classNum,
        };
      }
      if (parts.length >= 2) {
        const num = parseInt(parts[0]!.trim(), 10);
        const name = parts[1]!.trim();
        return { number: isNaN(num) ? idx + 1 : num, name, grade: undefined, classNum: undefined };
      }
      return { number: idx + 1, name: line.trim(), grade: undefined, classNum: undefined };
    });
  }, [pasteText]);

  /* ──────────────────────── 인라인 메모 저장 ──────────────────────── */

  const startMemoEdit = useCallback((key: string, currentMemo: string) => {
    setEditingMemoKey(key);
    setEditingMemoValue(currentMemo);
    // focus will be handled via useEffect-like ref callback
    setTimeout(() => memoInputRef.current?.focus(), 0);
  }, []);

  const saveMemo = useCallback(async () => {
    if (editingMemoKey === null || !cls) return;
    const updatedStudents = cls.students.map((s) =>
      studentKey(s) === editingMemoKey
        ? { ...s, memo: editingMemoValue.trim() || undefined }
        : s,
    );
    await updateClass({ ...cls, students: updatedStudents });
    setEditingMemoKey(null);
    setEditingMemoValue('');
  }, [editingMemoKey, editingMemoValue, cls, updateClass]);

  const handleMemoKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void saveMemo();
      }
      if (e.key === 'Escape') {
        setEditingMemoKey(null);
        setEditingMemoValue('');
      }
    },
    [saveMemo],
  );

  /* ──────────────────────── 렌더링 ──────────────────────── */

  if (!cls) {
    return (
      <div className="flex items-center justify-center h-64 text-sp-muted">
        <p className="text-sm">학급을 찾을 수 없습니다.</p>
      </div>
    );
  }

  const displayStudents = sortedStudents;

  // 편집 모드에서는 항상 소속 컬럼 표시 (직접 입력 가능하도록)
  const showGradeCol = isEditing || hasGradeInfo;

  const gridCols = showGradeCol
    ? (isEditing ? 'grid-cols-[7rem_3.5rem_1fr_1fr_5rem_2.5rem]' : 'grid-cols-[5rem_3.5rem_1fr_1fr_8rem]')
    : (isEditing ? 'grid-cols-[3rem_1fr_1fr_5rem_2.5rem]' : 'grid-cols-[3rem_1fr_1fr_8rem]');

  return (
    <div className="space-y-4">
      {/* ── 상단 컨트롤: 날짜 + 교시 (편집 모드 아닐 때) ── */}
      {!isEditing && students.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-sp-muted">날짜</label>
            <CalendarPicker
              value={date}
              onChange={handleDateChange}
              lessonDays={lessonDayIndices}
              portal
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
                    onClick={() => handlePeriodChange(p)}
                    title={isMatching ? `${cls?.subject} 수업` : undefined}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors
                      ${period === p
                        ? 'bg-sp-accent text-white'
                        : isMatching
                          ? 'bg-sp-accent/20 border border-sp-accent text-sp-accent font-bold'
                          : 'bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/50'
                      }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── 헤더: 학생 수 + 편집 버튼 ── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-sp-muted">
          총 <span className="text-sp-text font-medium">{cls.students.length}</span>명
        </p>
        <div className="flex items-center gap-2">
          {!isEditing ? (
            <>
              <button
                onClick={() => setShowExportModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-sp-muted hover:text-sp-text bg-sp-card border border-sp-border rounded-lg hover:border-sp-accent/50 transition-colors"
                title="출결 기록을 엑셀로 내보내기"
              >
                <span className="material-symbols-outlined text-sm">download</span>
                내보내기
              </button>
              <button
                onClick={() => {
                  setShowPasteModal(true);
                  setPasteText('');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-sp-muted hover:text-sp-text bg-sp-card border border-sp-border rounded-lg hover:border-sp-accent/50 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">content_paste</span>
                붙여넣기로 입력
              </button>
              <button
                onClick={() => void handleDownloadTemplate()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-sp-muted hover:text-sp-text bg-sp-card border border-sp-border rounded-lg hover:border-sp-accent/50 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">description</span>
                엑셀 양식
              </button>
              <button
                onClick={() => excelFileRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-sp-muted hover:text-sp-text bg-sp-card border border-sp-border rounded-lg hover:border-sp-accent/50 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">upload_file</span>
                엑셀 가져오기
              </button>
              <button
                onClick={startEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-sp-accent bg-sp-accent/10 rounded-lg hover:bg-sp-accent/20 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">edit</span>
                편집
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setShowPasteModal(true);
                  setPasteText('');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-sp-muted hover:text-sp-text bg-sp-card border border-sp-border rounded-lg hover:border-sp-accent/50 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">content_paste</span>
                붙여넣기로 입력
              </button>
              <button
                onClick={() => void handleDownloadTemplate()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-sp-muted hover:text-sp-text bg-sp-card border border-sp-border rounded-lg hover:border-sp-accent/50 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">description</span>
                엑셀 양식
              </button>
              <button
                onClick={() => excelFileRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-sp-muted hover:text-sp-text bg-sp-card border border-sp-border rounded-lg hover:border-sp-accent/50 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">upload_file</span>
                엑셀 가져오기
              </button>
              <button
                onClick={() => void saveEdit()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-sp-accent rounded-lg hover:bg-sp-accent/80 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">check</span>
                저장
              </button>
              <button
                onClick={cancelEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-sp-muted bg-sp-border rounded-lg hover:bg-sp-border/80 transition-colors"
              >
                취소
              </button>
            </>
          )}
          <input
            ref={excelFileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => void handleExcelFileChange(e)}
          />
        </div>
      </div>

      {/* ── 반별 인원 입력 (편집 모드) ── */}
      {isEditing && (
        <div className="bg-sp-surface border border-sp-border rounded-xl px-4 py-3 space-y-2">
          {bulkEntries.map((entry, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="number"
                value={entry.grade}
                onChange={(e) => updateBulkEntry(i, 'grade', e.target.value)}
                className="w-14 bg-sp-bg border border-sp-border rounded-lg px-2 py-1.5 text-sm text-sp-text text-center focus:outline-none focus:border-sp-accent"
                placeholder="학년"
                min={1}
                max={6}
              />
              <span className="text-xs text-sp-muted">학년</span>
              <input
                type="number"
                value={entry.classNum}
                onChange={(e) => updateBulkEntry(i, 'classNum', e.target.value)}
                className="w-14 bg-sp-bg border border-sp-border rounded-lg px-2 py-1.5 text-sm text-sp-text text-center focus:outline-none focus:border-sp-accent"
                placeholder="반"
                min={1}
                max={30}
              />
              <span className="text-xs text-sp-muted">반</span>
              <input
                type="number"
                value={entry.count}
                onChange={(e) => updateBulkEntry(i, 'count', e.target.value)}
                className="w-14 bg-sp-bg border border-sp-border rounded-lg px-2 py-1.5 text-sm text-sp-text text-center focus:outline-none focus:border-sp-accent"
                placeholder="인원"
                min={1}
              />
              <span className="text-xs text-sp-muted">명</span>
              {bulkEntries.length > 1 && (
                <button
                  onClick={() => removeBulkEntry(i)}
                  className="p-1 text-sp-muted hover:text-red-400 rounded transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              )}
              {i === bulkEntries.length - 1 && (
                <button
                  onClick={addBulkEntry}
                  className="flex items-center gap-0.5 px-2 py-1 text-xs text-sp-accent hover:bg-sp-accent/10 rounded-lg transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  반 추가
                </button>
              )}
            </div>
          ))}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={applyBulkEntries}
              disabled={!bulkValid}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-sp-accent bg-sp-accent/10 rounded-lg
                         hover:bg-sp-accent/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-sm">done_all</span>
              명단 생성
            </button>
            {bulkTotal > 0 && (
              <span className="text-xs text-sp-muted">총 {bulkTotal}명</span>
            )}
          </div>
        </div>
      )}

      {/* ── 통합 테이블 ── */}
      <div className="bg-sp-card border border-sp-border rounded-xl overflow-hidden">
        {/* 테이블 헤더 */}
        <div
          className={`grid items-center px-4 py-2.5 bg-sp-bg/50 text-xs font-medium text-sp-muted ${gridCols}`}
        >
          {showGradeCol && (
            <button
              onClick={() => setSortBy('grade')}
              className={`flex items-center gap-0.5 hover:text-sp-text transition-colors text-left ${sortBy === 'grade' ? 'text-sp-accent' : ''}`}
            >
              소속
              {sortBy === 'grade' && <span className="material-symbols-outlined text-xs">arrow_downward</span>}
            </button>
          )}
          <button
            onClick={() => setSortBy('number')}
            className={`flex items-center gap-0.5 hover:text-sp-text transition-colors text-left ${sortBy === 'number' ? 'text-sp-accent' : ''}`}
          >
            번호
            {sortBy === 'number' && <span className="material-symbols-outlined text-xs">arrow_downward</span>}
          </button>
          <button
            onClick={() => setSortBy('name')}
            className={`flex items-center gap-0.5 hover:text-sp-text transition-colors text-left ${sortBy === 'name' ? 'text-sp-accent' : ''}`}
          >
            이름
            {sortBy === 'name' && <span className="material-symbols-outlined text-xs">arrow_downward</span>}
          </button>
          <span>{isEditing ? '' : '메모'}</span>
          <span className="text-center">{isEditing ? '결번' : '출석'}</span>
          {isEditing && <span />}
        </div>

        {/* 학생 행 */}
        <div className="divide-y divide-sp-border/50">
          {displayStudents.map((student) => {
            // 편집 모드에서 정렬 시 원래 인덱스를 찾아야 함
            const originalIdx = isEditing
              ? editStudents.findIndex((s) => s.number === student.number && s.grade === student.grade && s.classNum === student.classNum)
              : -1;
            const attendance = localAttendance.find((s) => studentKey(s) === studentKey(student));
            const status = attendance?.status ?? 'present';
            const config = STATUS_CONFIG[status];

            return (
              <div
                key={studentKey(student)}
                className={`grid items-center px-4 py-2 hover:bg-sp-text/[0.02] transition-colors ${gridCols}`}
              >
                {/* 소속 (학년-반) */}
                {showGradeCol && (
                  isEditing ? (
                    <div className="flex gap-1 pr-1">
                      <input
                        type="number"
                        value={student.grade ?? ''}
                        onChange={(e) => updateStudentGrade(originalIdx, e.target.value ? parseInt(e.target.value, 10) : undefined)}
                        className="w-11 bg-sp-bg border border-sp-border rounded px-1.5 py-1 text-xs text-sp-text text-center focus:outline-none focus:border-sp-accent"
                        placeholder="학년"
                        min={1}
                        max={6}
                      />
                      <span className="text-sp-muted text-xs self-center">-</span>
                      <input
                        type="number"
                        value={student.classNum ?? ''}
                        onChange={(e) => updateStudentClassNum(originalIdx, e.target.value ? parseInt(e.target.value, 10) : undefined)}
                        className="w-11 bg-sp-bg border border-sp-border rounded px-1.5 py-1 text-xs text-sp-text text-center focus:outline-none focus:border-sp-accent"
                        placeholder="반"
                        min={1}
                        max={30}
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-sp-muted">
                      {student.grade != null && student.classNum != null ? `${student.grade}-${student.classNum}` : ''}
                    </span>
                  )
                )}

                {/* 번호 */}
                {isEditing ? (
                  <input
                    type="number"
                    value={student.number}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v)) updateStudentNumber(originalIdx, v);
                    }}
                    className="w-12 bg-sp-bg border border-sp-border rounded px-1.5 py-1 text-sm text-sp-text text-center focus:outline-none focus:border-sp-accent"
                    min={1}
                  />
                ) : (
                  <span className={`text-sm ${student.isVacant ? 'text-sp-muted/40 line-through' : 'text-sp-muted'}`}>{student.number}</span>
                )}

                {/* 이름 */}
                {isEditing ? (
                  student.isVacant ? (
                    <span className="text-sm text-sp-muted/40 italic">결번</span>
                  ) : (
                    <div className="pr-2">
                      <input
                        type="text"
                        value={student.name}
                        onChange={(e) => updateStudentName(originalIdx, e.target.value)}
                        className="w-full bg-sp-bg border border-sp-border rounded-lg px-2.5 py-1 text-sm text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-sp-accent"
                        placeholder="이름 입력"
                      />
                    </div>
                  )
                ) : (
                  student.isVacant ? (
                    <span className="text-sm text-sp-muted/40 italic">결번</span>
                  ) : (
                    <span className="text-sm text-sp-text">{student.name}</span>
                  )
                )}

                {/* 메모 (보기 모드) / 빈 칸 (편집 모드) */}
                {isEditing ? (
                  <div />
                ) : editingMemoKey === studentKey(student) ? (
                  <div className="pr-2">
                    <input
                      ref={memoInputRef}
                      type="text"
                      value={editingMemoValue}
                      onChange={(e) => setEditingMemoValue(e.target.value)}
                      onBlur={() => void saveMemo()}
                      onKeyDown={handleMemoKeyDown}
                      className="w-full bg-sp-bg border border-sp-accent rounded-lg px-2.5 py-1 text-sm text-sp-text placeholder:text-sp-muted focus:outline-none"
                      placeholder="메모 입력"
                    />
                  </div>
                ) : student.isVacant ? (
                  <div />
                ) : (
                  <button
                    onClick={() => startMemoEdit(studentKey(student), student.memo ?? '')}
                    className="text-left text-sm truncate pr-2 py-1 rounded hover:bg-sp-text/[0.04] transition-colors"
                  >
                    {student.memo ? (
                      <span className="text-sp-text">{student.memo}</span>
                    ) : (
                      <span className="text-sp-muted/50 italic">메모 추가...</span>
                    )}
                  </button>
                )}

                {/* 결번 토글 (편집 모드) / 출석 (보기 모드) */}
                {isEditing ? (
                  <div className="flex justify-center">
                    <button
                      onClick={() => toggleVacant(originalIdx)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                        student.isVacant
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-sp-bg border border-sp-border text-sp-muted hover:border-sp-accent/50'
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {student.isVacant ? 'person_off' : 'person'}
                      </span>
                    </button>
                  </div>
                ) : student.isVacant ? (
                  <div />
                ) : attendanceInitialized ? (
                  <div className="flex justify-center">
                    <button
                      onClick={() => toggleStatus(studentKey(student))}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs
                                 font-medium cursor-pointer transition-colors ${config.badge}
                                 hover:opacity-80`}
                      title="클릭하여 상태 변경"
                    >
                      <span className="material-symbols-outlined text-sm">
                        {config.icon}
                      </span>
                      {config.label}
                    </button>
                  </div>
                ) : (
                  <div />
                )}

                {/* 삭제 (편집 모드) */}
                {isEditing && (
                  <div className="flex justify-center">
                    <button
                      onClick={() => removeRow(originalIdx)}
                      className="p-1 text-sp-muted hover:text-red-400 rounded transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {displayStudents.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-sp-muted">
              등록된 학생이 없습니다
            </div>
          )}
        </div>

        {/* 편집 모드: 수강 인원 + 행 추가 */}
        {isEditing && (
          <div className="border-t border-sp-border/50 p-2 flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-sp-muted">수강 인원</span>
              <input
                type="number"
                value={editStudents.length || ''}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v)) setStudentCount(v);
                }}
                className="w-16 bg-sp-bg border border-sp-border rounded-lg px-2 py-1 text-sm text-sp-text text-center focus:outline-none focus:border-sp-accent"
                min={1}
              />
              <span className="text-xs text-sp-muted">명</span>
            </div>
            <button
              onClick={addRow}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-sp-accent hover:bg-sp-accent/10 rounded-lg transition-colors"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              1명 추가
            </button>
          </div>
        )}
      </div>

      {/* ── 출석 통계 바 (편집 모드 아닐 때) ── */}
      {!isEditing && students.length > 0 && attendanceInitialized && (
        <div className="flex items-center gap-4 bg-sp-surface border border-sp-border rounded-xl px-4 py-2.5">
          {(Object.keys(STATUS_CONFIG) as AttendanceStatus[]).map((statusKey) => (
            <div key={statusKey} className="flex items-center gap-1.5">
              <span className={`material-symbols-outlined text-base ${STAT_COLORS[statusKey]}`}>
                {STATUS_CONFIG[statusKey].icon}
              </span>
              <span className="text-xs text-sp-muted">
                {STATUS_CONFIG[statusKey].label}:
              </span>
              <span className={`text-sm font-medium ${STAT_COLORS[statusKey]}`}>
                {stats[statusKey]}명
              </span>
            </div>
          ))}
          <div className="flex-1" />
          <span className="text-xs text-sp-muted">
            전체 {localAttendance.length}명
          </span>
        </div>
      )}

      {/* ── 출석 저장 버튼 (편집 모드 아닐 때) ── */}
      {!isEditing && students.length > 0 && attendanceInitialized && (
        <div className="flex justify-end">
          <button
            onClick={() => void handleAttendanceSave()}
            disabled={saveStatus === 'saving'}
            className={`flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-medium
                       transition-all duration-200 ${
              saveStatus === 'saved'
                ? 'bg-green-500/20 text-green-400'
                : 'bg-sp-accent text-white hover:bg-sp-accent/80'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <span className="material-symbols-outlined text-lg">
              {saveStatus === 'saved' ? 'check' : saveStatus === 'saving' ? 'hourglass_empty' : 'save'}
            </span>
            {saveStatus === 'saved' ? '저장됨!' : saveStatus === 'saving' ? '저장 중...' : '출석 저장'}
          </button>
        </div>
      )}

      {/* ── 출결 내보내기 모달 ── */}
      {showExportModal && cls && (
        <AttendanceExportModal
          classId={classId}
          className={cls.name}
          students={cls.students}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {/* ── 붙여넣기 모달 ── */}
      {showPasteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-sp-card border border-sp-border rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6">
            <h3 className="text-base font-bold text-sp-text mb-2">붙여넣기로 입력</h3>
            <p className="text-xs text-sp-muted mb-4">
              엑셀이나 한글에서 복사한 명렬표를 붙여넣으세요.<br />
              &quot;학년{'\t'}반{'\t'}번호{'\t'}이름&quot; · &quot;번호{'\t'}이름&quot; · &quot;이름&quot; 형식을 지원합니다.
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={'1\t2\t5\t김민수\n1\t2\t12\t이영희\n2\t3\t5\t박철수'}
              rows={5}
              className="w-full bg-sp-bg border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-sp-accent resize-none font-mono"
            />
            {parsedPreview.length > 0 && (
              <>
                <div className="mt-3 max-h-48 overflow-y-auto border border-sp-border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-sp-bg/50 sticky top-0">
                      <tr className="text-xs text-sp-muted">
                        {parsedPreview.some((s) => s.grade != null) && <th className="px-3 py-1.5 text-left font-medium">학년</th>}
                        {parsedPreview.some((s) => s.classNum != null) && <th className="px-3 py-1.5 text-left font-medium">반</th>}
                        <th className="px-3 py-1.5 text-left font-medium">번호</th>
                        <th className="px-3 py-1.5 text-left font-medium">이름</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sp-border/50">
                      {parsedPreview.map((s, i) => (
                        <tr key={i} className="text-sp-text">
                          {parsedPreview.some((ps) => ps.grade != null) && <td className="px-3 py-1.5">{s.grade ?? '-'}</td>}
                          {parsedPreview.some((ps) => ps.classNum != null) && <td className="px-3 py-1.5">{s.classNum ?? '-'}</td>}
                          <td className="px-3 py-1.5">{s.number}</td>
                          <td className="px-3 py-1.5">{s.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-sp-muted mt-2">{parsedPreview.length}명 인식됨</p>
              </>
            )}
            <div className="flex gap-2 mt-4">
              <button
                onClick={handlePasteImport}
                disabled={!pasteText.trim()}
                className="flex-1 text-sm bg-sp-accent text-white rounded-lg py-2 hover:bg-sp-accent/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                적용
              </button>
              <button
                onClick={() => setShowPasteModal(false)}
                className="flex-1 text-sm bg-sp-border text-sp-muted rounded-lg py-2 hover:bg-sp-border/80 transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 엑셀 가져오기 미리보기 모달 ── */}
      {excelPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-sp-card border border-sp-border rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-bold text-sp-text flex items-center gap-2">
                <span className="material-symbols-outlined text-sp-accent">preview</span>
                가져올 학생 미리보기 ({excelPreview.length}명)
              </h3>
              <button
                onClick={() => setExcelPreview(null)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
              </button>
            </div>
            <p className="text-xs text-red-400 mb-4">주의: 적용 시 기존 명단이 모두 교체됩니다.</p>
            <div className="flex-1 overflow-y-auto mb-4 text-xs">
              <table className="w-full">
                <thead className="sticky top-0 bg-sp-card">
                  <tr className="text-sp-muted border-b border-sp-border">
                    {excelPreview.some((s) => s.grade != null) && <th className="py-1.5 text-left">학년</th>}
                    {excelPreview.some((s) => s.classNum != null) && <th className="py-1.5 text-left">반</th>}
                    <th className="py-1.5 text-left w-16">번호</th>
                    <th className="py-1.5 text-left">이름</th>
                  </tr>
                </thead>
                <tbody>
                  {excelPreview.map((s, i) => (
                    <tr key={i} className="border-b border-sp-border/30">
                      {excelPreview.some((ps) => ps.grade != null) && (
                        <td className="py-1.5 text-sp-muted">{s.grade ?? '-'}</td>
                      )}
                      {excelPreview.some((ps) => ps.classNum != null) && (
                        <td className="py-1.5 text-sp-muted">{s.classNum ?? '-'}</td>
                      )}
                      <td className="py-1.5 text-sp-text font-mono">{s.number}</td>
                      <td className="py-1.5 text-sp-text">
                        {s.isVacant ? <span className="text-red-400 italic">결번</span> : s.name}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-3 shrink-0 pt-3 border-t border-sp-border">
              <button
                onClick={() => setExcelPreview(null)}
                className="px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-sp-surface text-sm text-sp-text transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => void applyExcelImport()}
                className="px-4 py-2 rounded-lg bg-sp-accent hover:bg-blue-600 text-white text-sm font-medium transition-colors"
              >
                적용하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────── 출결 내보내기 모달 ──────────────────────── */

type PeriodPreset = 'all' | 'semester' | 'month' | 'custom';

function getSemesterRange(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const semesterStart = m >= 8 ? new Date(y, 8, 1) : new Date(y, 2, 1);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: fmt(semesterStart), end: fmt(now) };
}

function getMonthRange(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = new Date(y, m, 1);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: fmt(start), end: fmt(now) };
}

interface AttendanceExportModalProps {
  classId: string;
  className: string;
  students: readonly TeachingClassStudent[];
  onClose: () => void;
}

function AttendanceExportModal({ classId, className, students, onClose }: AttendanceExportModalProps) {
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const showToast = useToastStore((s) => s.show);

  const period = useMemo<{ start: string; end: string } | undefined>(() => {
    if (periodPreset === 'all') return undefined;
    if (periodPreset === 'semester') return getSemesterRange();
    if (periodPreset === 'month') return getMonthRange();
    if (periodPreset === 'custom' && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }
    return undefined;
  }, [periodPreset, customStart, customEnd]);

  const allRecords = useMemo(() => {
    return useTeachingClassStore.getState().attendanceRecords
      .filter((r) => r.classId === classId);
  }, [classId]);

  const filteredCount = useMemo(() => {
    if (!period) return allRecords.length;
    return allRecords.filter((r) => r.date >= period.start && r.date <= period.end).length;
  }, [allRecords, period]);

  const handleExport = useCallback(async () => {
    if (filteredCount === 0) {
      showToast('내보낼 출결 기록이 없습니다', 'info');
      return;
    }
    setIsExporting(true);
    try {
      const buffer = await exportAttendanceToExcel(allRecords, students, className, period);
      const defaultFileName = `${className}_출결기록.xlsx`;

      if (window.electronAPI) {
        const filePath = await window.electronAPI.showSaveDialog({
          title: '출결 기록 내보내기',
          defaultPath: defaultFileName,
          filters: [{ name: 'Excel 파일', extensions: ['xlsx'] }],
        });
        if (filePath) {
          await window.electronAPI.writeFile(filePath, buffer);
          showToast('파일이 저장되었습니다', 'success', {
            label: '파일 열기',
            onClick: () => window.electronAPI?.openFile(filePath),
          });
          onClose();
        }
      } else {
        const blob = new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultFileName;
        a.click();
        URL.revokeObjectURL(url);
        showToast('파일이 다운로드되었습니다', 'success');
        onClose();
      }
    } catch {
      showToast('내보내기 중 오류가 발생했습니다', 'error');
    } finally {
      setIsExporting(false);
    }
  }, [allRecords, students, className, period, filteredCount, showToast, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        className="bg-sp-card border border-sp-border rounded-2xl w-full max-w-md mx-4"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-sp-border">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sp-accent">download</span>
            <h3 className="text-sp-text font-semibold">출결 기록 내보내기</h3>
          </div>
          <button onClick={onClose} className="text-sp-muted hover:text-sp-text transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          <div>
            <label className="text-sm text-sp-muted mb-2 block">기간</label>
            <div className="flex gap-2 flex-wrap">
              {([
                { id: 'all' as const, label: '전체' },
                { id: 'semester' as const, label: '이번 학기' },
                { id: 'month' as const, label: '이번 달' },
                { id: 'custom' as const, label: '직접 입력' },
              ]).map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPeriodPreset(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    periodPreset === p.id
                      ? 'bg-sp-accent text-white'
                      : 'bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {periodPreset === 'custom' && (
              <div className="flex gap-2 mt-2">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="bg-sp-surface border border-sp-border rounded-lg px-3 py-1.5 text-sm text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
                />
                <span className="text-sp-muted text-sm self-center">~</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="bg-sp-surface border border-sp-border rounded-lg px-3 py-1.5 text-sm text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
                />
              </div>
            )}
          </div>

          <div className="bg-sp-surface border border-sp-border rounded-xl px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-sp-muted">출결 기록</span>
              <span className="text-sp-text font-medium">{filteredCount}건</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-sp-border">
          <button
            onClick={() => void handleExport()}
            disabled={isExporting || filteredCount === 0}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium
                       bg-sp-accent text-white hover:bg-sp-accent/80 transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-base">
              {isExporting ? 'hourglass_empty' : 'download'}
            </span>
            {isExporting ? '내보내는 중...' : '엑셀로 내보내기'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-sm text-sp-muted bg-sp-surface border border-sp-border hover:text-sp-text transition-colors"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
