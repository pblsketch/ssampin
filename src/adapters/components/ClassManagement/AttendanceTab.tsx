import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import type { AttendanceStatus, AttendanceReason, StudentAttendance, AttendanceRecord } from '@domain/entities/Attendance';
import { PERIOD_MORNING, PERIOD_CLOSING, formatPeriodShort } from '@domain/entities/Attendance';
import { studentKey } from '@domain/entities/TeachingClass';
import { exportAttendanceToExcel } from '@infrastructure/export';
import { useToastStore } from '@adapters/components/common/Toast';
import { getDayOfWeek } from '@domain/rules/periodRules';
import { AttendanceMatrixView } from './AttendanceMatrixView';
import { AttendanceDetailEditor } from './shared/AttendanceDetailEditor';

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

const PERIODS = [PERIOD_MORNING, 1, 2, 3, 4, 5, 6, 7, 8, PERIOD_CLOSING] as const;

function isSpecialPeriod(p: number): boolean {
  return p === PERIOD_MORNING || p === PERIOD_CLOSING;
}

type ViewMode = 'single' | 'matrix';

/* ──────────────────────── 컴포넌트 ──────────────────────── */

interface AttendanceTabProps {
  classId: string;
}

export function AttendanceTab({ classId }: AttendanceTabProps) {
  const { classes, getAttendanceRecord, saveAttendanceRecord } = useTeachingClassStore();

  /* ── 뷰 모드 토글 (localStorage 유지) ── */
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const stored = localStorage.getItem('ssampin:attendance-view-mode');
    return stored === 'matrix' ? 'matrix' : 'single';
  });

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('ssampin:attendance-view-mode', mode);
  }, []);

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

  const showToast = useToastStore((s) => s.show);

  const teacherSchedule = useScheduleStore((s) => s.teacherSchedule);
  const scheduleOverrides = useScheduleStore((s) => s.overrides);
  const loadSchedule = useScheduleStore((s) => s.load);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  const cls = useMemo(() => classes.find((c) => c.id === classId), [classes, classId]);
  const allStudents = cls?.students ?? [];
  const students = useMemo(() => allStudents.filter((s) => !s.isVacant), [allStudents]);

  const groupSiblingCount = useMemo(
    () =>
      cls?.groupId ? classes.filter((c) => c.groupId === cls.groupId).length : 0,
    [cls, classes],
  );

  const hasGradeInfo = useMemo(() => {
    return students.some((s) => s.grade != null || s.classNum != null);
  }, [students]);

  const sortedStudents = useMemo(() => {
    if (!hasGradeInfo) return students;
    return [...students].sort((a, b) => {
      if ((a.grade ?? 0) !== (b.grade ?? 0)) return (a.grade ?? 0) - (b.grade ?? 0);
      if ((a.classNum ?? 0) !== (b.classNum ?? 0)) return (a.classNum ?? 0) - (b.classNum ?? 0);
      return a.number - b.number;
    });
  }, [students, hasGradeInfo]);

  const matchingPeriods = useMemo(() => {
    if (!cls) return new Set<number>();

    const d = new Date(date + 'T00:00:00');
    const dayOfWeekVal = getDayOfWeek(d);
    if (!dayOfWeekVal) return new Set<number>();

    const baseSchedule = teacherSchedule[dayOfWeekVal] ?? [];
    const dayOverrides = scheduleOverrides.filter((o) => o.date === date);

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
  }, [cls, date, teacherSchedule, scheduleOverrides]);

  // 날짜/교시 변경 시 기존 기록 로드 또는 기본값 세팅
  const loadRecord = useCallback(
    (d: string, p: number) => {
      const existing = getAttendanceRecord(classId, d, p);
      if (existing) {
        const map = new Map(existing.students.map((s) => [studentKey(s), s]));
        setLocalStudents(
          students.map((s) => {
            const saved = map.get(studentKey(s));
            return {
              number: s.number,
              grade: s.grade,
              classNum: s.classNum,
              status: saved?.status ?? 'present',
              reason: saved?.reason,
              memo: saved?.memo,
            };
          }),
        );
        setHasExistingRecord(true);
      } else {
        setLocalStudents(
          students.map((s) => ({
            number: s.number,
            grade: s.grade,
            classNum: s.classNum,
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
    setLocalStudents((prev) =>
      prev.map((s) => {
        if (studentKey(s) !== key) return s;
        const next = STATUS_CYCLE[s.status];
        // present로 돌아오면 reason/memo clear
        return next === 'present'
          ? { ...s, status: next, reason: undefined, memo: undefined }
          : { ...s, status: next };
      }),
    );
    setHasModified(true);
    setSaveStatus('idle');
  }, []);

  const handleDetailChange = useCallback(
    (key: string, next: { reason?: AttendanceReason; memo?: string }) => {
      setLocalStudents((prev) =>
        prev.map((s) =>
          studentKey(s) === key ? { ...s, reason: next.reason, memo: next.memo } : s,
        ),
      );
      setHasModified(true);
      setSaveStatus('idle');
    },
    [],
  );

  const handleSave = useCallback(async () => {
    setSaveStatus('saving');
    const record: AttendanceRecord = {
      classId,
      date,
      period,
      students: localStudents.map((s) => ({
        number: s.number,
        status: s.status,
        ...(s.grade != null ? { grade: s.grade } : {}),
        ...(s.classNum != null ? { classNum: s.classNum } : {}),
        ...(s.reason ? { reason: s.reason } : {}),
        ...(s.memo ? { memo: s.memo } : {}),
      })),
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

  const handleExport = useCallback(async () => {
    if (!cls) return;
    const allRecords = useTeachingClassStore.getState().attendanceRecords
      .filter((r) => r.classId === classId);
    if (allRecords.length === 0) {
      showToast('내보낼 출결 기록이 없습니다', 'info');
      return;
    }
    try {
      const buffer = await exportAttendanceToExcel(
        allRecords,
        cls.students,
        cls.name,
      );
      const defaultFileName = `${cls.name}_출결기록.xlsx`;
      if (window.electronAPI) {
        const filePath = await window.electronAPI.showSaveDialog({
          title: '출결 기록 내보내기',
          defaultPath: defaultFileName,
          filters: [{ name: 'Excel 파일', extensions: ['xlsx'] }],
        });
        if (filePath) {
          const normalized: ArrayBuffer = buffer;
          await window.electronAPI.writeFile(filePath, normalized);
          showToast('파일이 저장되었습니다', 'success', {
            label: '파일 열기',
            onClick: () => window.electronAPI?.openFile(filePath),
          });
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
      }
    } catch {
      showToast('내보내기 중 오류가 발생했습니다', 'error');
    }
  }, [cls, classId, showToast]);

  // 통계
  const stats = useMemo(() => {
    const counts: Record<AttendanceStatus, number> = {
      present: 0,
      absent: 0,
      late: 0,
      earlyLeave: 0,
      classAbsence: 0,
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
      {/* ── 뷰 모드 토글 ── */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => handleViewModeChange('single')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            viewMode === 'single'
              ? 'bg-sp-accent text-white'
              : 'bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text'
          }`}
        >
          <span className="material-symbols-outlined text-base">format_list_bulleted</span>
          단일 교시
        </button>
        <button
          onClick={() => handleViewModeChange('matrix')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            viewMode === 'matrix'
              ? 'bg-sp-accent text-white'
              : 'bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text'
          }`}
        >
          <span className="material-symbols-outlined text-base">grid_on</span>
          전체 교시
        </button>
      </div>

      {/* ── 매트릭스 모드 ── */}
      {viewMode === 'matrix' && (
        <AttendanceMatrixView
          classId={classId}
          date={date}
          onDateChange={handleDateChange}
        />
      )}

      {/* ── 단일 교시 모드 ── */}
      {viewMode === 'single' && (
        <>
          {/* 상단 컨트롤: 날짜 + 교시 */}
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
                {PERIODS.map((p) => {
                  const isMatching = matchingPeriods.has(p);
                  const special = isSpecialPeriod(p);
                  const label = formatPeriodShort(p);
                  return (
                    <button
                      key={p}
                      onClick={() => handlePeriodChange(p)}
                      title={
                        special
                          ? p === PERIOD_MORNING ? '조회 (아침 담임 시간)' : '종례 (하교 담임 시간)'
                          : isMatching ? `${cls?.subject} 수업` : undefined
                      }
                      className={`relative ${special ? 'px-2 h-8' : 'w-8 h-8'} rounded-lg text-sm font-medium transition-all
                        ${period === p
                          ? 'bg-sp-accent text-white ring-2 ring-sp-accent/40 shadow-md shadow-sp-accent/20'
                          : isMatching
                            ? 'bg-sp-accent/15 border-2 border-sp-accent text-sp-accent font-semibold'
                            : special
                              ? 'bg-sp-card border border-sp-border/70 text-sp-muted hover:text-sp-text hover:border-sp-accent/50'
                              : 'bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/50'
                        }`}
                    >
                      {label}
                      {isMatching && period !== p && (
                        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-sp-accent" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 그룹 출결 안내 (조회/종례는 그룹 전체 공유) */}
          {cls?.groupId && groupSiblingCount > 1 && isSpecialPeriod(period) && (
            <div className="flex items-center gap-2 bg-sp-accent/10 border border-sp-accent/30
                            rounded-xl px-4 py-2.5 text-sm text-sp-accent">
              <span className="material-symbols-outlined text-base">groups</span>
              <span>조회 출결은 이 학급의 모든 과목에 공유됩니다.</span>
            </div>
          )}

          {/* 수정 안내 바 */}
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

          {/* 상태 순환 범례 */}
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

          {/* 통계 바 */}
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
            <button
              onClick={() => void handleExport()}
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-sp-muted hover:text-sp-text
                         bg-sp-card border border-sp-border rounded-lg transition-colors hover:border-sp-accent/50"
              title="출결 기록을 엑셀로 내보내기"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              내보내기
            </button>
            <div className="flex-1" />
            <span className="text-xs text-sp-muted">
              전체 {localStudents.length}명
            </span>
          </div>

          {/* 학생 목록 */}
          {initialized && (
            <div className="bg-sp-surface border border-sp-border rounded-xl overflow-hidden">
              {/* 헤더 */}
              <div className={`grid ${hasGradeInfo ? 'grid-cols-[4.5rem_3rem_1fr_8rem]' : 'grid-cols-[3rem_1fr_8rem]'} px-4 py-2 border-b border-sp-border
                              text-xs text-sp-muted font-medium`}>
                {hasGradeInfo && <span>소속</span>}
                <span>번호</span>
                <span>이름</span>
                <span className="text-center">출석상태</span>
              </div>

              {/* 학생 행 */}
              <div className="divide-y divide-sp-border/50">
                {sortedStudents.map((student) => {
                  const sKey = studentKey(student);
                  const attendance = localStudents.find((s) => studentKey(s) === sKey);
                  const status = attendance?.status ?? 'present';
                  const config = STATUS_CONFIG[status];

                  return (
                    <div
                      key={sKey}
                      className={`px-4 py-2.5 hover:bg-sp-card/50 transition-colors`}
                    >
                      <div className={`grid ${hasGradeInfo ? 'grid-cols-[4.5rem_3rem_1fr_8rem]' : 'grid-cols-[3rem_1fr_8rem]'} items-center`}>
                        {hasGradeInfo && (
                          <span className="text-xs text-sp-muted">
                            {student.grade != null && student.classNum != null ? `${student.grade}-${student.classNum}` : ''}
                          </span>
                        )}
                        <span className="text-sm text-sp-muted font-medium">
                          {student.number}
                        </span>
                        <span className="text-sm text-sp-text">
                          {student.name}
                        </span>
                        <div className="flex justify-center">
                          <button
                            onClick={() => toggleStatus(sKey)}
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

                      {/* reason/memo 인라인 편집 (present면 안내 문구, 그 외면 편집 UI) */}
                      <div className="mt-1 pl-0">
                        <AttendanceDetailEditor
                          status={status}
                          reason={attendance?.reason}
                          memo={attendance?.memo}
                          onChange={(next) => handleDetailChange(sKey, next)}
                          compact={true}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 저장 버튼 */}
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
        </>
      )}
    </div>
  );
}
