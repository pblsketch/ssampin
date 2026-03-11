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

  const hasMixedGrades = useMemo(() => {
    const withGrade = students.filter((s) => s.grade != null && s.classNum != null);
    if (withGrade.length === 0) return false;
    const first = withGrade[0];
    return withGrade.some((s) => s.grade !== first!.grade || s.classNum !== first!.classNum);
  }, [students]);

  /* ── 편집 모드 상태 ── */
  const [isEditing, setIsEditing] = useState(false);
  const [editStudents, setEditStudents] = useState<TeachingClassStudent[]>([]);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const sortedStudents = useMemo(() => {
    const list = isEditing ? editStudents : cls?.students ?? [];
    if (!hasMixedGrades) return list;
    return [...list].sort((a, b) => {
      if ((a.grade ?? 0) !== (b.grade ?? 0)) return (a.grade ?? 0) - (b.grade ?? 0);
      if ((a.classNum ?? 0) !== (b.classNum ?? 0)) return (a.classNum ?? 0) - (b.classNum ?? 0);
      return a.number - b.number;
    });
  }, [isEditing, editStudents, cls?.students, hasMixedGrades]);

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
      const existing = getAttendanceRecord(classId, d, p);
      if (existing) {
        const map = new Map(existing.students.map((s) => [studentKey(s), s.status]));
        setLocalAttendance(
          students.map((s) => ({
            number: s.number,
            grade: s.grade,
            classNum: s.classNum,
            status: map.get(studentKey(s)) ?? 'present',
          })),
        );
      } else {
        setLocalAttendance(
          students.map((s) => ({
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

  const updateStudentMemoInEdit = useCallback((index: number, memo: string) => {
    setEditStudents((prev) => {
      const next = [...prev];
      const existing = next[index];
      if (existing) {
        next[index] = { ...existing, memo: memo || undefined };
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

  const gridCols = hasMixedGrades
    ? (isEditing ? 'grid-cols-[4.5rem_3rem_1fr_1fr_8rem_2.5rem]' : 'grid-cols-[4.5rem_3rem_1fr_1fr_8rem]')
    : (isEditing ? 'grid-cols-[3rem_1fr_1fr_8rem_2.5rem]' : 'grid-cols-[3rem_1fr_1fr_8rem]');

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

      {/* ── 통합 테이블 ── */}
      <div className="bg-sp-card border border-sp-border rounded-xl overflow-hidden">
        {/* 테이블 헤더 */}
        <div
          className={`grid items-center px-4 py-2.5 bg-sp-bg/50 text-xs font-medium text-sp-muted ${gridCols}`}
        >
          {hasMixedGrades && <span>소속</span>}
          <span>번호</span>
          <span>이름</span>
          <span>메모</span>
          <span className="text-center">출석</span>
          {isEditing && <span />}
        </div>

        {/* 학생 행 */}
        <div className="divide-y divide-sp-border/50">
          {displayStudents.map((student, idx) => {
            const attendance = localAttendance.find((s) => studentKey(s) === studentKey(student));
            const status = attendance?.status ?? 'present';
            const config = STATUS_CONFIG[status];

            return (
              <div
                key={`${studentKey(student)}-${idx}`}
                className={`grid items-center px-4 py-2 hover:bg-white/[0.02] transition-colors ${gridCols}`}
              >
                {/* 소속 (학년-반, 혼합 학급일 때만) */}
                {hasMixedGrades && (
                  isEditing ? (
                    <div className="flex gap-1 pr-1">
                      <input
                        type="number"
                        value={student.grade ?? ''}
                        onChange={(e) => updateStudentGrade(idx, e.target.value ? parseInt(e.target.value, 10) : undefined)}
                        className="w-8 bg-sp-bg border border-sp-border rounded px-1 py-1 text-xs text-sp-text text-center focus:outline-none focus:border-sp-accent"
                        placeholder="학년"
                        min={1}
                        max={6}
                      />
                      <span className="text-sp-muted text-xs self-center">-</span>
                      <input
                        type="number"
                        value={student.classNum ?? ''}
                        onChange={(e) => updateStudentClassNum(idx, e.target.value ? parseInt(e.target.value, 10) : undefined)}
                        className="w-8 bg-sp-bg border border-sp-border rounded px-1 py-1 text-xs text-sp-text text-center focus:outline-none focus:border-sp-accent"
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
                <span className="text-sm text-sp-muted">{student.number}</span>

                {/* 이름 */}
                {isEditing ? (
                  <div className="pr-2">
                    <input
                      type="text"
                      value={student.name}
                      onChange={(e) => updateStudentName(idx, e.target.value)}
                      className="w-full bg-sp-bg border border-sp-border rounded-lg px-2.5 py-1 text-sm text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-sp-accent"
                      placeholder="이름 입력"
                    />
                  </div>
                ) : (
                  <span className="text-sm text-sp-text">{student.name}</span>
                )}

                {/* 메모 */}
                {isEditing ? (
                  <div className="pr-2">
                    <input
                      type="text"
                      value={student.memo ?? ''}
                      onChange={(e) => updateStudentMemoInEdit(idx, e.target.value)}
                      className="w-full bg-sp-bg border border-sp-border rounded-lg px-2.5 py-1 text-sm text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-sp-accent"
                      placeholder="메모 입력"
                    />
                  </div>
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

                {/* 출석 */}
                {attendanceInitialized ? (
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
                      onClick={() => removeRow(idx)}
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

        {/* 편집 모드: 행 추가 버튼 */}
        {isEditing && (
          <div className="border-t border-sp-border/50 p-2">
            <button
              onClick={addRow}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-sp-accent hover:bg-sp-accent/10 rounded-lg transition-colors"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              학생 추가
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
          <div className="bg-sp-card border border-sp-border rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h3 className="text-base font-bold text-sp-text mb-2">붙여넣기로 입력</h3>
            <p className="text-xs text-sp-muted mb-4">
              엑셀이나 한글에서 복사한 명렬표를 붙여넣으세요.<br />
              &quot;학년{'\t'}반{'\t'}번호{'\t'}이름&quot; · &quot;번호{'\t'}이름&quot; · &quot;이름&quot; 형식을 지원합니다.
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={'1\t2\t5\t김민수\n1\t2\t12\t이영희\n2\t3\t5\t박철수'}
              rows={10}
              className="w-full bg-sp-bg border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-sp-accent resize-none font-mono"
            />
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
