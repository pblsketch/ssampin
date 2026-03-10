import { useState, useMemo, useCallback } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
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

interface AttendanceTabProps {
  classId: string;
}

export function AttendanceTab({ classId }: AttendanceTabProps) {
  const { classes, getAttendanceRecord, saveAttendanceRecord } = useTeachingClassStore();

  const [date, setDate] = useState(todayString);
  const [period, setPeriod] = useState(1);
  const [localStudents, setLocalStudents] = useState<StudentAttendance[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [hasExistingRecord, setHasExistingRecord] = useState(false);
  const [hasModified, setHasModified] = useState(false);
  const [dismissedGuide, setDismissedGuide] = useState(
    () => localStorage.getItem('ssampin:attendance-guide-dismissed') === 'true',
  );

  const cls = useMemo(() => classes.find((c) => c.id === classId), [classes, classId]);
  const students = cls?.students ?? [];

  // 날짜/교시 변경 시 기존 기록 로드 또는 기본값 세팅
  const loadRecord = useCallback(
    (d: string, p: number) => {
      const existing = getAttendanceRecord(classId, d, p);
      if (existing) {
        // 기존 기록이 있으면 로드, 새 학생이 추가됐을 수 있으므로 병합
        const map = new Map(existing.students.map((s) => [s.number, s.status]));
        setLocalStudents(
          students.map((s) => ({
            number: s.number,
            status: map.get(s.number) ?? 'present',
          })),
        );
        setHasExistingRecord(true);
      } else {
        setLocalStudents(
          students.map((s) => ({
            number: s.number,
            status: 'present' as AttendanceStatus,
          })),
        );
        setHasExistingRecord(false);
      }
      setInitialized(true);
      setHasModified(false);
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

  const toggleStatus = useCallback((studentNumber: number) => {
    setLocalStudents((prev) =>
      prev.map((s) =>
        s.number === studentNumber
          ? { ...s, status: STATUS_CYCLE[s.status] }
          : s,
      ),
    );
    setHasModified(true);
    setSaveStatus('idle');
  }, []);

  const handleSave = useCallback(async () => {
    setSaveStatus('saving');
    const record: AttendanceRecord = {
      classId,
      date,
      period,
      students: localStudents,
    };
    await saveAttendanceRecord(record);
    setSaveStatus('saved');
    setHasModified(false);
    if (!dismissedGuide) {
      setDismissedGuide(true);
      localStorage.setItem('ssampin:attendance-guide-dismissed', 'true');
    }
    setTimeout(() => setSaveStatus('idle'), 2000);
  }, [classId, date, period, localStudents, saveAttendanceRecord, dismissedGuide]);

  // 통계
  const stats = useMemo(() => {
    const counts: Record<AttendanceStatus, number> = {
      present: 0,
      absent: 0,
      late: 0,
    };
    for (const s of localStudents) {
      counts[s.status]++;
    }
    return counts;
  }, [localStudents]);

  // 학생이 없는 경우
  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-sp-muted">
        <span className="material-symbols-outlined text-4xl mb-3">group_add</span>
        <p className="text-sm">명렬표에 학생을 먼저 등록해주세요.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── 상단 컨트롤: 날짜 + 교시 ── */}
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

      {/* ── 수정 안내 바 (이전 기록 불러왔을 때 + 첫 방문 시) ── */}
      {hasExistingRecord && initialized && !dismissedGuide && (
        <div className="flex items-center gap-2 bg-sp-accent/10 border border-sp-accent/30
                        rounded-xl px-4 py-2.5 text-sm text-sp-accent">
          <span className="material-symbols-outlined text-base">edit_note</span>
          <span>이전 기록을 불러왔습니다. 학생을 클릭하면 출결 상태를 수정할 수 있습니다.</span>
          <button
            onClick={() => {
              setDismissedGuide(true);
              localStorage.setItem('ssampin:attendance-guide-dismissed', 'true');
            }}
            className="ml-auto text-sp-muted hover:text-sp-text transition-colors"
            title="닫기"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* ── 상태 순환 범례 ── */}
      {hasExistingRecord && initialized && !dismissedGuide && (
        <div className="flex items-center gap-3 text-xs text-sp-muted px-1">
          <span className="text-sp-muted/70">상태 변경 순서:</span>
          <span className="flex items-center gap-1 text-green-400">
            <span className="material-symbols-outlined text-sm">check_circle</span>출석
          </span>
          <span className="text-sp-muted/50">→</span>
          <span className="flex items-center gap-1 text-red-400">
            <span className="material-symbols-outlined text-sm">cancel</span>결석
          </span>
          <span className="text-sp-muted/50">→</span>
          <span className="flex items-center gap-1 text-amber-400">
            <span className="material-symbols-outlined text-sm">schedule</span>지각
          </span>
          <span className="text-sp-muted/50">→</span>
          <span className="text-sp-muted/70">(반복)</span>
        </div>
      )}

      {/* ── 통계 바 ── */}
      <div className="flex items-center gap-4 bg-sp-surface border border-sp-border rounded-xl px-4 py-2.5">
        {(Object.keys(STATUS_CONFIG) as AttendanceStatus[]).map((status) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className={`material-symbols-outlined text-base ${STAT_COLORS[status]}`}>
              {STATUS_CONFIG[status].icon}
            </span>
            <span className="text-xs text-sp-muted">
              {STATUS_CONFIG[status].label}:
            </span>
            <span className={`text-sm font-medium ${STAT_COLORS[status]}`}>
              {stats[status]}명
            </span>
          </div>
        ))}
        <div className="flex-1" />
        <span className="text-xs text-sp-muted">
          전체 {localStudents.length}명
        </span>
      </div>

      {/* ── 학생 목록 ── */}
      {initialized && (
        <div className="bg-sp-surface border border-sp-border rounded-xl overflow-hidden">
          {/* 헤더 */}
          <div className="grid grid-cols-[3rem_1fr_8rem] px-4 py-2 border-b border-sp-border
                          text-xs text-sp-muted font-medium">
            <span>번호</span>
            <span>이름</span>
            <span className="text-center">출석상태</span>
          </div>

          {/* 학생 행 */}
          <div className="divide-y divide-sp-border/50">
            {students.map((student) => {
              const attendance = localStudents.find((s) => s.number === student.number);
              const status = attendance?.status ?? 'present';
              const config = STATUS_CONFIG[status];

              return (
                <div
                  key={student.number}
                  className="grid grid-cols-[3rem_1fr_8rem] items-center px-4 py-2.5
                             hover:bg-sp-card/50 transition-colors"
                >
                  <span className="text-sm text-sp-muted font-medium">
                    {student.number}
                  </span>
                  <span className="text-sm text-sp-text">
                    {student.name}
                  </span>
                  <div className="flex justify-center">
                    <button
                      onClick={() => toggleStatus(student.number)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs
                                 font-medium cursor-pointer transition-colors ${config.badge}
                                 hover:opacity-80`}
                      title={`클릭하여 출결 상태 변경 (${config.label} → ${STATUS_CONFIG[STATUS_CYCLE[status]].label})`}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {config.icon}
                      </span>
                      {config.label}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 저장 버튼 ── */}
      <div className="flex justify-end">
        <button
          onClick={() => void handleSave()}
          disabled={saveStatus === 'saving'}
          className={`flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-medium
                     transition-all duration-200 ${
            saveStatus === 'saved'
              ? 'bg-green-500/20 text-green-400'
              : 'bg-sp-accent text-white hover:bg-sp-accent/80'
          } ${
            hasModified && saveStatus === 'idle' ? 'animate-pulse ring-2 ring-sp-accent/50' : ''
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <span className="material-symbols-outlined text-lg">
            {saveStatus === 'saved' ? 'check' : saveStatus === 'saving' ? 'hourglass_empty' : 'save'}
          </span>
          {saveStatus === 'saved' ? '저장됨!' : saveStatus === 'saving' ? '저장 중...' : '출석 저장'}
        </button>
      </div>
    </div>
  );
}
