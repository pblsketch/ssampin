import { useState, useMemo, useCallback, useRef } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import type { TeachingClassStudent } from '@domain/entities/TeachingClass';
import { studentKey } from '@domain/entities/TeachingClass';
import type { AttendanceStatus, StudentAttendance, AttendanceRecord } from '@domain/entities/Attendance';

/* ──────────────────────── 유틸 ──────────────────────── */

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; icon: string; badge: string }> = {
  present: { label: '출석', icon: 'check_circle', badge: 'bg-green-500/20 text-green-400' },
  absent: { label: '결석', icon: 'cancel', badge: 'bg-red-500/20 text-red-400' },
  late: { label: '지각', icon: 'schedule', badge: 'bg-amber-500/20 text-amber-400' },
};

const STATUS_CYCLE: Record<AttendanceStatus, AttendanceStatus> = {
  present: 'absent',
  absent: 'late',
  late: 'present',
};

const STAT_COLORS: Record<AttendanceStatus, string> = {
  present: 'text-green-400',
  absent: 'text-red-400',
  late: 'text-amber-400',
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

  const cls = classes.find((c) => c.id === classId);
  const students = cls?.students ?? [];

  /* ── 편집 모드 상태 ── */
  const [isEditing, setIsEditing] = useState(false);
  const [sortBy, setSortBy] = useState<'number' | 'name' | 'grade'>('number');
  const [editStudents, setEditStudents] = useState<TeachingClassStudent[]>([]);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');

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

  /* ── 출석 통계 ── */
  const stats = useMemo(() => {
    const counts: Record<AttendanceStatus, number> = {
      present: 0,
      absent: 0,
      late: 0,
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
    setEditStudents((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.map((s, i) => ({ ...s, number: i + 1 }));
    });
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

  /* ── 학년/반 일괄 입력 ── */
  const [bulkGrade, setBulkGrade] = useState('');
  const [bulkClassNum, setBulkClassNum] = useState('');

  const applyBulkGrade = useCallback(() => {
    const g = bulkGrade ? parseInt(bulkGrade, 10) : undefined;
    const c = bulkClassNum ? parseInt(bulkClassNum, 10) : undefined;
    if (g == null && c == null) return;
    setEditStudents((prev) =>
      prev.map((s) => ({
        ...s,
        ...(g != null ? { grade: g } : {}),
        ...(c != null ? { classNum: c } : {}),
      })),
    );
  }, [bulkGrade, bulkClassNum]);

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
            <input
              type="date"
              value={date}
              onChange={(e) => handleDateChange(e.target.value)}
              className="px-3 py-1.5 bg-sp-card border border-sp-border rounded-lg
                         text-sp-text text-sm focus:outline-none focus:border-sp-accent"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-sp-muted">교시</label>
            <div className="flex gap-1">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  onClick={() => handlePeriodChange(p)}
                  className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors
                    ${period === p
                      ? 'bg-sp-accent text-white'
                      : 'bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/50'
                    }`}
                >
                  {p}
                </button>
              ))}
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
        </div>
      </div>

      {/* ── 학년/반 일괄 입력 (편집 모드) ── */}
      {isEditing && (
        <div className="flex items-center gap-3 bg-sp-surface border border-sp-border rounded-xl px-4 py-2.5">
          <span className="text-xs text-sp-muted whitespace-nowrap">소속 일괄 입력</span>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={bulkGrade}
              onChange={(e) => setBulkGrade(e.target.value)}
              className="w-14 bg-sp-bg border border-sp-border rounded-lg px-2 py-1 text-sm text-sp-text text-center focus:outline-none focus:border-sp-accent"
              placeholder="학년"
              min={1}
              max={6}
            />
            <span className="text-xs text-sp-muted">학년</span>
            <input
              type="number"
              value={bulkClassNum}
              onChange={(e) => setBulkClassNum(e.target.value)}
              className="w-14 bg-sp-bg border border-sp-border rounded-lg px-2 py-1 text-sm text-sp-text text-center focus:outline-none focus:border-sp-accent"
              placeholder="반"
              min={1}
              max={30}
            />
            <span className="text-xs text-sp-muted">반</span>
          </div>
          <button
            onClick={applyBulkGrade}
            disabled={!bulkGrade && !bulkClassNum}
            className="flex items-center gap-1 px-3 py-1 text-xs text-sp-accent bg-sp-accent/10 rounded-lg
                       hover:bg-sp-accent/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-sm">done_all</span>
            전체 적용
          </button>
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
                className={`grid items-center px-4 py-2 hover:bg-white/[0.02] transition-colors ${gridCols}`}
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
                <span className={`text-sm ${student.isVacant ? 'text-sp-muted/40 line-through' : 'text-sp-muted'}`}>{student.number}</span>

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
                    className="text-left text-sm truncate pr-2 py-1 rounded hover:bg-white/[0.04] transition-colors"
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
    </div>
  );
}
