import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { studentKey } from '@domain/entities/TeachingClass';
import type { AttendanceStatus, AttendanceReason, StudentAttendance, AttendanceRecord } from '@domain/entities/Attendance';
import { ATTENDANCE_REASONS } from '@domain/entities/Attendance';
import { isSubjectMatch } from '@domain/rules/matchingRules';
import { CalendarPicker } from '@adapters/components/common/CalendarPicker';
import { resolvePreset, resolveClassroomPreset } from '@domain/valueObjects/SubjectColor';
import { ObservationForm } from './ObservationForm';
import { ObservationCard } from './ObservationCard';
import { ClassRecordStudentGrid } from './ClassRecordStudentGrid';

/* ── 유틸 ── */

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const STATUS_OPTIONS: { key: AttendanceStatus; label: string; icon: string; color: string }[] = [
  { key: 'present', label: '출석', icon: 'check_circle', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  { key: 'absent', label: '결석', icon: 'cancel', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { key: 'late', label: '지각', icon: 'schedule', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { key: 'earlyLeave', label: '조퇴', icon: 'exit_to_app', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  { key: 'classAbsence', label: '결과', icon: 'event_busy', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
];

const STATUS_BADGE: Record<AttendanceStatus, string> = {
  present: 'bg-green-500/20 text-green-400',
  absent: 'bg-red-500/20 text-red-400',
  late: 'bg-amber-500/20 text-amber-400',
  earlyLeave: 'bg-orange-500/20 text-orange-400',
  classAbsence: 'bg-purple-500/20 text-purple-400',
};

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: '출석',
  absent: '결석',
  late: '지각',
  earlyLeave: '조퇴',
  classAbsence: '결과',
};

const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/* ── 컴포넌트 ── */

interface ClassRecordInputViewProps {
  classId: string;
}

export function ClassRecordInputView({ classId }: ClassRecordInputViewProps) {
  const classes = useTeachingClassStore((s) => s.classes);
  const getAttendanceRecord = useTeachingClassStore((s) => s.getAttendanceRecord);
  const saveAttendanceRecord = useTeachingClassStore((s) => s.saveAttendanceRecord);
  const teacherSchedule = useScheduleStore((s) => s.teacherSchedule);
  const loadSchedule = useScheduleStore((s) => s.load);
  const { settings } = useSettingsStore();

  const observationRecords = useObservationStore((s) => s.records);
  const loadObservations = useObservationStore((s) => s.load);

  useEffect(() => { void loadSchedule(); }, [loadSchedule]);
  useEffect(() => { void loadObservations(); }, [loadObservations]);

  const cls = useMemo(() => classes.find((c) => c.id === classId), [classes, classId]);
  const students = useMemo(() => {
    if (!cls) return [];
    return [...cls.students]
      .filter((s) => !s.isVacant && (!s.status || s.status === 'active'))
      .sort((a, b) => a.number - b.number);
  }, [cls]);

  /* ── state ── */
  const [date, setDate] = useState(todayString);
  const [period, setPeriod] = useState(1);
  const [studentViewMode, setStudentViewMode] = useState<'list' | 'seating'>('list');
  const [selectedStudentKey, setSelectedStudentKey] = useState<string | null>(null);
  const [localAttendance, setLocalAttendance] = useState<StudentAttendance[]>([]);
  const [attendanceInitialized, setAttendanceInitialized] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showRecentRecords, setShowRecentRecords] = useState(false);

  /* ── 시간표 연동 ── */
  const subjectAccent = useMemo(() => {
    if (!cls) return undefined;
    const colorBy = settings.timetableColorBy ?? 'classroom';
    if (colorBy === 'classroom') {
      return resolveClassroomPreset(cls.name, settings.classroomColors).tw;
    }
    return resolvePreset(cls.subject, settings.subjectColors).tw;
  }, [cls, settings.subjectColors, settings.classroomColors, settings.timetableColorBy]);

  const getMatchingPeriods = useCallback((dateStr: string): number[] => {
    if (!cls || !teacherSchedule) return [];
    const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
    const d = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = DAYS[d.getDay()] ?? '';
    if (!dayOfWeek) return [];
    const daySchedule = teacherSchedule[dayOfWeek];
    if (!daySchedule) return [];
    const periods: number[] = [];
    daySchedule.forEach((slot, idx) => {
      if (!slot) return;
      const classMatch = slot.classroom === cls.name || slot.classroom.includes(cls.name) || cls.name.includes(slot.classroom);
      if (classMatch && isSubjectMatch(slot.subject, cls.subject)) {
        periods.push(idx + 1);
      }
    });
    return periods;
  }, [cls, teacherSchedule]);

  const matchingPeriods = useMemo(() => new Set(getMatchingPeriods(date)), [date, getMatchingPeriods]);

  const lessonDayIndices = useMemo(() => {
    const indices: number[] = [];
    const ref = new Date();
    const refDay = ref.getDay();
    for (let i = 0; i < 7; i++) {
      const d = new Date(ref);
      d.setDate(d.getDate() + (i - refDay));
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (getMatchingPeriods(ds).length > 0) indices.push(i);
    }
    return indices;
  }, [getMatchingPeriods]);

  /* ── 출석 로드 ── */
  const loadRecord = useCallback((d: string, p: number) => {
    const existing = getAttendanceRecord(classId, d, p);
    if (existing) {
      const map = new Map(existing.students.map((s) => [studentKey(s), s]));
      setLocalAttendance(
        students.map((s) => {
          const prev = map.get(studentKey(s));
          return {
            number: s.number,
            grade: s.grade,
            classNum: s.classNum,
            status: prev?.status ?? 'present' as AttendanceStatus,
            reason: prev?.reason,
            memo: prev?.memo,
          };
        }),
      );
    } else {
      setLocalAttendance(
        students.map((s) => ({ number: s.number, grade: s.grade, classNum: s.classNum, status: 'present' as AttendanceStatus })),
      );
    }
    setAttendanceInitialized(true);
    setSaveStatus('idle');
  }, [classId, students, getAttendanceRecord]);

  useEffect(() => {
    if (students.length > 0) loadRecord(date, period);
  }, [date, period, classId, students.length, loadRecord]);

  const handleDateChange = useCallback((d: string) => { setDate(d); }, []);
  const handlePeriodChange = useCallback((p: number) => { setPeriod(p); }, []);

  /* ── 출석 변경 ── */
  const setStudentAttendanceStatus = useCallback((key: string, newStatus: AttendanceStatus) => {
    setLocalAttendance((prev) =>
      prev.map((s) =>
        studentKey(s) === key
          ? { ...s, status: newStatus, ...(newStatus === 'present' ? { reason: undefined, memo: undefined } : {}) }
          : s,
      ),
    );
    setSaveStatus('idle');
  }, []);

  const setStudentReason = useCallback((key: string, reason: AttendanceReason | undefined) => {
    setLocalAttendance((prev) =>
      prev.map((s) => studentKey(s) === key ? { ...s, reason } : s),
    );
    setSaveStatus('idle');
  }, []);

  const setStudentMemo = useCallback((key: string, memo: string) => {
    setLocalAttendance((prev) =>
      prev.map((s) => studentKey(s) === key ? { ...s, memo } : s),
    );
    setSaveStatus('idle');
  }, []);

  const handleSaveAttendance = useCallback(async () => {
    setSaveStatus('saving');
    const record: AttendanceRecord = { classId, date, period, students: localAttendance };
    await saveAttendanceRecord(record);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  }, [classId, date, period, localAttendance, saveAttendanceRecord]);

  /* ── 파생 데이터 ── */
  const attendanceMap = useMemo(() => {
    const m = new Map<string, AttendanceStatus>();
    for (const s of localAttendance) m.set(studentKey(s), s.status);
    return m;
  }, [localAttendance]);

  const recordCountMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of observationRecords) {
      if (r.classId !== classId) continue;
      m.set(r.studentId, (m.get(r.studentId) ?? 0) + 1);
    }
    return m;
  }, [observationRecords, classId]);

  const selectedStudent = useMemo(() => {
    if (!selectedStudentKey || !cls) return null;
    return cls.students.find((s) => studentKey(s) === selectedStudentKey) ?? null;
  }, [selectedStudentKey, cls]);

  const selectedAttendance = useMemo(() => {
    if (!selectedStudentKey) return null;
    return localAttendance.find((s) => studentKey(s) === selectedStudentKey) ?? null;
  }, [selectedStudentKey, localAttendance]);

  const selectedObservations = useMemo(() => {
    if (!selectedStudentKey) return [];
    return observationRecords
      .filter((r) => r.classId === classId && r.studentId === selectedStudentKey)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10);
  }, [observationRecords, classId, selectedStudentKey]);

  /* ── 렌더 ── */
  return (
    <div className="h-full flex flex-col gap-3">
      {/* 상단 컨트롤 */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-sp-muted">날짜</label>
          <CalendarPicker
            value={date}
            onChange={handleDateChange}
            lessonDays={lessonDayIndices}
            accentColor={subjectAccent}
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
                  className={`relative w-8 h-8 rounded-lg text-sm font-medium transition-all
                    ${period === p
                      ? 'bg-sp-accent text-white ring-2 ring-sp-accent/40'
                      : isMatching
                        ? 'bg-sp-accent/15 border-2 border-sp-accent text-sp-accent font-semibold'
                        : 'bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text'
                    }`}
                >
                  {p}
                  {isMatching && period !== p && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-sp-accent" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1" />

        {/* 뷰 토글 */}
        <div className="flex gap-1 bg-sp-surface rounded-lg p-0.5">
          <button
            onClick={() => setStudentViewMode('list')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              studentViewMode === 'list' ? 'bg-sp-accent text-white' : 'text-sp-muted hover:text-sp-text'
            }`}
          >
            <span className="material-symbols-outlined text-sm">format_list_numbered</span>
            번호순
          </button>
          <button
            onClick={() => setStudentViewMode('seating')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              studentViewMode === 'seating' ? 'bg-sp-accent text-white' : 'text-sp-muted hover:text-sp-text'
            }`}
          >
            <span className="material-symbols-outlined text-sm">grid_view</span>
            좌석배치
          </button>
        </div>
      </div>

      {/* 메인 영역 */}
      <div className="flex-1 flex gap-3 min-h-0">
        {/* 왼쪽: 학생 선택 */}
        <div className="w-[260px] shrink-0 bg-sp-card border border-sp-border rounded-xl overflow-hidden flex flex-col">
          <div className="px-4 py-2.5 border-b border-sp-border flex items-center justify-between">
            <span className="text-sm font-semibold text-sp-text">
              {cls?.name ?? '수업반'} <span className="text-xs text-sp-muted font-normal">{students.length}명</span>
            </span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {studentViewMode === 'list' ? (
              <div className="p-2 flex flex-col gap-0.5">
                {students.map((s) => {
                  const sKey = studentKey(s);
                  const att = attendanceMap.get(sKey) ?? 'present';
                  const count = recordCountMap.get(sKey) ?? 0;
                  const isSelected = selectedStudentKey === sKey;
                  return (
                    <button
                      key={sKey}
                      onClick={() => setSelectedStudentKey(sKey)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                        isSelected ? 'bg-sp-accent/10 text-sp-text' : 'text-sp-text hover:bg-sp-border/30'
                      }`}
                    >
                      <span className="w-8 shrink-0 text-xs text-sp-muted text-center">{s.number}</span>
                      <span className="flex-1 text-sm">{s.name}</span>
                      {attendanceInitialized && (
                        <span className={`px-1.5 py-0.5 rounded text-caption font-medium ${STATUS_BADGE[att]}`}>
                          {STATUS_LABEL[att]}
                        </span>
                      )}
                      {count > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-caption font-medium bg-sp-accent/15 text-sp-accent">
                          {count}건
                        </span>
                      )}
                    </button>
                  );
                })}
                {students.length === 0 && (
                  <div className="py-8 text-center text-xs text-sp-muted">학생이 없습니다</div>
                )}
              </div>
            ) : (
              <ClassRecordStudentGrid
                classId={classId}
                selectedStudentKey={selectedStudentKey}
                onSelectStudent={setSelectedStudentKey}
                attendanceMap={attendanceMap}
                recordCountMap={recordCountMap}
              />
            )}
          </div>
        </div>

        {/* 오른쪽: 기록 패널 */}
        {selectedStudentKey && selectedStudent ? (
          <div className="flex-1 min-w-0 bg-sp-card border border-sp-border rounded-xl flex flex-col overflow-hidden">
            {/* 학생 헤더 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-sp-border">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-sp-accent/20 flex items-center justify-center">
                  <span className="text-detail font-bold text-sp-accent">{selectedStudent.number}</span>
                </div>
                <span className="text-sm font-bold text-sp-text">{selectedStudent.name}</span>
              </div>
              <button
                onClick={() => setSelectedStudentKey(null)}
                className="p-1 text-sp-muted hover:text-sp-text transition-colors"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* 출결 섹션 */}
              <div className="px-4 py-3 border-b border-sp-border">
                <h4 className="text-xs font-semibold text-sp-muted mb-2 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">how_to_reg</span>
                  출결
                </h4>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setStudentAttendanceStatus(selectedStudentKey, opt.key)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-detail font-medium transition-colors border ${
                        selectedAttendance?.status === opt.key
                          ? opt.color
                          : 'border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-muted'
                      }`}
                    >
                      {selectedAttendance?.status === opt.key && (
                        <span className="material-symbols-outlined text-xs">check</span>
                      )}
                      {opt.label}
                    </button>
                  ))}
                </div>

                {selectedAttendance && selectedAttendance.status !== 'present' && (
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-caption text-sp-muted font-medium">사유</span>
                    {ATTENDANCE_REASONS.map((r) => (
                      <button
                        key={r}
                        onClick={() => setStudentReason(selectedStudentKey, selectedAttendance.reason === r ? undefined : r)}
                        className={`px-2 py-0.5 rounded-lg text-caption font-medium transition-colors border ${
                          selectedAttendance.reason === r
                            ? 'bg-sp-accent/15 text-sp-accent border-sp-accent/30'
                            : 'border-sp-border text-sp-muted hover:text-sp-text'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                )}

                {selectedAttendance && selectedAttendance.status !== 'present' && (
                  <input
                    type="text"
                    placeholder="상세 사유..."
                    value={selectedAttendance.memo ?? ''}
                    onChange={(e) => setStudentMemo(selectedStudentKey, e.target.value)}
                    className="w-full bg-sp-bg border border-sp-border rounded-lg px-2 py-1 text-caption text-sp-text placeholder:text-sp-muted/50 focus:outline-none focus:border-sp-accent mb-2"
                  />
                )}

                <button
                  onClick={() => void handleSaveAttendance()}
                  disabled={saveStatus === 'saving'}
                  className={`w-full py-1.5 rounded-lg text-xs font-medium transition-all ${
                    saveStatus === 'saved'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-sp-accent text-white hover:bg-sp-accent/80'
                  } disabled:opacity-50`}
                >
                  {saveStatus === 'saved' ? '✓ 저장됨' : saveStatus === 'saving' ? '저장 중...' : '출석 저장'}
                </button>
              </div>

              {/* 특기사항 섹션 */}
              <div className="px-4 py-3">
                <h4 className="text-xs font-semibold text-sp-muted mb-2 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">edit_note</span>
                  특기사항
                </h4>
              </div>

              <ObservationForm classId={classId} studentId={selectedStudentKey} />

              {/* 최근 기록 (토글) */}
              {selectedObservations.length > 0 && (
                <div className="px-4 pb-3">
                  <button
                    onClick={() => setShowRecentRecords((v) => !v)}
                    className="flex items-center gap-1 text-xs font-semibold text-sp-muted mb-2 uppercase tracking-wide hover:text-sp-text transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm" style={{ transition: 'transform 0.2s', transform: showRecentRecords ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                      chevron_right
                    </span>
                    최근 기록 ({selectedObservations.length})
                  </button>
                  {showRecentRecords && (
                    <div className="space-y-2">
                      {selectedObservations.map((r) => (
                        <ObservationCard key={r.id} record={r} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 min-w-0 bg-sp-card border border-sp-border rounded-xl flex items-center justify-center">
            <div className="text-center text-sp-muted">
              <span className="material-symbols-outlined text-3xl mb-2 opacity-30">person</span>
              <p className="text-xs">학생을 선택하세요</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
