import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import type {
  AttendanceRecord,
  AttendanceStatus,
  AttendanceReason,
  StudentAttendance,
} from '@domain/entities/Attendance';
import { formatPeriodLabel } from '@domain/entities/Attendance';
import { cycleStatus, summarizeTotal } from '@domain/rules/attendanceRules';
import { studentKey } from '@domain/entities/TeachingClass';
import { AttendanceDetailEditor } from '@adapters/components/attendance/shared/AttendanceDetailEditor';
import { AttendanceGridView } from '@adapters/components/attendance/shared/AttendanceGridView';
import {
  DEFAULT_PERIODS,
  STATUS_CONFIG,
  STAT_COLORS,
  buildInitialMatrix,
  type LocalStudentAttendance,
  type MatrixState,
  type MatrixStudent,
} from '@adapters/components/attendance/shared/attendanceGridShared';

export type { MatrixStudent };

/* ── 팝오버 상태 ── */
interface PopoverState {
  studentKey: string;
  period: number;
  anchorRect: DOMRect;
}

export interface AttendanceMatrixCoreProps {
  /** 학생 목록 (이미 정렬된 배열로 전달할 것) */
  students: readonly MatrixStudent[];
  /** 출결 데이터를 조회할 학급 ID (buildAttendanceMatrix 내부용) */
  classId: string;
  date: string;
  onDateChange: (date: string) => void;
  /** (date) → 해당 날짜의 AttendanceRecord 배열 반환 */
  loadDayRecords: (date: string) => readonly AttendanceRecord[];
  /** 저장 콜백. byPeriod Map을 전달받아 외부에서 처리 */
  saveDay: (
    date: string,
    byPeriod: ReadonlyMap<number, readonly StudentAttendance[]>,
  ) => Promise<void>;
  /** 렌더할 교시 목록 (기본값: [1..8]) */
  periods?: readonly number[];
  /** 하이라이트할 매칭 교시 Set. undefined 이면 하이라이트 없음 */
  matchingPeriods?: ReadonlySet<number>;
  /** true 이면 상단 날짜 입력 숨김 (외부에서 DateNavigator 제공 시) */
  hideDateInput?: boolean;
  /** 학생 없을 때 메시지 */
  emptyMessage?: string;
}

export function AttendanceMatrixCore({
  students,
  classId,
  date,
  onDateChange,
  loadDayRecords,
  saveDay,
  periods: periodsProp,
  matchingPeriods,
  hideDateInput = false,
  emptyMessage = '명렬표에 학생을 먼저 등록해주세요.',
}: AttendanceMatrixCoreProps) {
  const periodTimes = useSettingsStore((s) => s.settings.periodTimes);
  const PERIODS = (periodsProp ?? DEFAULT_PERIODS) as readonly number[];

  const effectiveMatchingPeriods = useMemo(
    () => matchingPeriods ?? new Set<number>(),
    [matchingPeriods],
  );

  /* ── 매트릭스 로컬 상태 ── */
  const [matrix, setMatrix] = useState<MatrixState>({});
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  /* 날짜/classId/students 변경 시 매트릭스 재구성 */
  useEffect(() => {
    const records = loadDayRecords(date);
    const initial = buildInitialMatrix(records, classId, date, students, PERIODS);
    setMatrix(initial);
    setDirty(false);
    setSaveStatus('idle');
    setPopover(null);
    // PERIODS는 원시 배열이므로 직렬화로 의존성 비교
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, date, loadDayRecords, students, PERIODS.join(',')]);

  /* 팝오버 외부 클릭 / ESC 닫기 */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPopover(null);
    };
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopover(null);
      }
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, []);

  /* ── 셀 상태 변경 ── */
  const handleCellClick = useCallback(
    (sKey: string, period: number) => {
      // 기존 출결 레코드가 없을 때도 올바른 학생 번호/학년/반을 사용해야 한다
      // (number: 0 폴백은 저장 시 잘못된 번호로 기록됨)
      const student = students.find((s) => studentKey(s) === sKey);
      if (!student) return;
      setMatrix((prev) => {
        const row = prev[sKey] ?? {};
        const current = row[period];
        const currentStatus: AttendanceStatus = current?.status ?? 'present';
        const nextStatus = cycleStatus(currentStatus);
        const fallback: LocalStudentAttendance = {
          number: student.number,
          status: 'present',
          ...(student.grade != null ? { grade: student.grade } : {}),
          ...(student.classNum != null ? { classNum: student.classNum } : {}),
        };
        const updated: LocalStudentAttendance | undefined =
          nextStatus === 'present'
            ? undefined
            : {
                ...(current ?? fallback),
                status: nextStatus,
                reason: undefined,
                memo: undefined,
              };
        return { ...prev, [sKey]: { ...row, [period]: updated } };
      });
      setDirty(true);
      setSaveStatus('idle');
    },
    [students],
  );

  /* ── 셀 우클릭 → 팝오버 ── */
  const handleCellContextMenu = useCallback((e: React.MouseEvent, sKey: string, period: number) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopover({ studentKey: sKey, period, anchorRect: rect });
  }, []);

  /* ── 팝오버에서 reason/memo 변경 ── */
  const handleDetailChange = useCallback(
    (sKey: string, period: number, next: { reason?: AttendanceReason; memo?: string }) => {
      setMatrix((prev) => {
        const row = prev[sKey] ?? {};
        const current = row[period];
        if (!current) return prev;
        return {
          ...prev,
          [sKey]: { ...row, [period]: { ...current, reason: next.reason, memo: next.memo } },
        };
      });
      setDirty(true);
      setSaveStatus('idle');
    },
    [],
  );

  /* ── 정상출석 일괄 ── */
  const handleBulkPresent = useCallback(() => {
    setMatrix((prev) => {
      const next: MatrixState = {};
      for (const sKey of Object.keys(prev)) {
        next[sKey] = {};
        for (const p of PERIODS) {
          if (effectiveMatchingPeriods.has(p)) {
            next[sKey]![p] = undefined;
          } else {
            next[sKey]![p] = prev[sKey]?.[p];
          }
        }
      }
      return next;
    });
    setDirty(true);
    setSaveStatus('idle');
    // PERIODS 배열은 useEffect에서 직렬화, 여기서는 클로저로 충분
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveMatchingPeriods, PERIODS.join(',')]);

  /* ── 변경 초기화 ── */
  const handleReset = useCallback(() => {
    const records = loadDayRecords(date);
    const initial = buildInitialMatrix(records, classId, date, students, PERIODS);
    setMatrix(initial);
    setDirty(false);
    setSaveStatus('idle');
    setPopover(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, date, loadDayRecords, students, PERIODS.join(',')]);

  /* ── 저장 ── */
  const handleSave = useCallback(async () => {
    setSaveStatus('saving');
    const byPeriod = new Map<number, StudentAttendance[]>();
    for (const p of PERIODS) {
      const periodStudents: StudentAttendance[] = [];
      for (const [sKey, row] of Object.entries(matrix)) {
        const att = row?.[p];
        if (att) {
          const student = students.find((s) => studentKey(s) === sKey);
          const record: StudentAttendance = {
            number: att.number || (student?.number ?? 0),
            status: att.status,
            ...(att.reason ? { reason: att.reason } : {}),
            ...(att.memo ? { memo: att.memo } : {}),
            ...(student?.grade != null ? { grade: student.grade } : {}),
            ...(student?.classNum != null ? { classNum: student.classNum } : {}),
          };
          periodStudents.push(record);
        }
      }
      byPeriod.set(p, periodStudents);
    }
    await saveDay(date, byPeriod);
    setSaveStatus('saved');
    setDirty(false);
    setTimeout(() => setSaveStatus('idle'), 2000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, matrix, students, saveDay, PERIODS.join(',')]);

  /* ── 통계 ── */
  const matrixMap = useMemo(() => {
    const m = new Map<string, Map<number, StudentAttendance | undefined>>();
    for (const [sKey, row] of Object.entries(matrix)) {
      const inner = new Map<number, StudentAttendance | undefined>();
      for (const p of PERIODS) {
        inner.set(p, row?.[p]);
      }
      m.set(sKey, inner);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrix, PERIODS.join(',')]);

  const totalStats = useMemo(() => summarizeTotal(matrixMap), [matrixMap]);

  /* ── 팝오버 현재 데이터 ── */
  const popoverAtt = popover ? matrix[popover.studentKey]?.[popover.period] : undefined;
  const popoverStudent = popover
    ? students.find((s) => studentKey(s) === popover.studentKey)
    : undefined;

  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-sp-muted">
        <span className="material-symbols-outlined text-4xl mb-3">group_add</span>
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── 날짜 ── */}
      {!hideDateInput && (
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-sp-muted">날짜</label>
            <input
              type="date"
              value={date}
              onChange={(e) => onDateChange(e.target.value)}
              className="px-3 py-1.5 bg-sp-card border border-sp-border rounded-lg
                         text-sp-text text-sm focus:outline-none focus:border-sp-accent"
            />
          </div>
        </div>
      )}

      {/* ── 통계 바 ── */}
      <div className="flex items-center gap-4 bg-sp-surface border border-sp-border rounded-xl px-4 py-2.5 flex-wrap">
        <span className="text-xs text-sp-muted">전체 {students.length}명</span>
        <span className="text-sp-border">|</span>
        {(['absent', 'late', 'earlyLeave', 'classAbsence'] as AttendanceStatus[]).map((status) => (
          <div key={status} className="flex items-center gap-1">
            <span className={`material-symbols-outlined text-sm ${STAT_COLORS[status]}`}>
              {STATUS_CONFIG[status].icon}
            </span>
            <span className="text-xs text-sp-muted">{STATUS_CONFIG[status].label}</span>
            <span className={`text-sm font-medium ${STAT_COLORS[status]}`}>
              {totalStats[status]}
            </span>
          </div>
        ))}
        <div className="flex-1" />
        {/* 일괄 액션 */}
        <button
          onClick={handleBulkPresent}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-sp-muted hover:text-sp-text
                     bg-sp-card border border-sp-border rounded-lg transition-colors hover:border-sp-accent/50"
          title="매칭 교시의 모든 학생을 정상출석으로 설정"
        >
          <span className="material-symbols-outlined text-sm">done_all</span>
          정상출석 일괄
        </button>
        <button
          onClick={handleReset}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-sp-muted hover:text-sp-text
                     bg-sp-card border border-sp-border rounded-lg transition-colors hover:border-sp-accent/50"
          title="저장된 데이터로 되돌리기"
        >
          <span className="material-symbols-outlined text-sm">restart_alt</span>
          변경 초기화
        </button>
      </div>

      {/* ── 매트릭스 테이블 (공용 headless 그리드 뷰) ── */}
      <AttendanceGridView
        periodTimes={periodTimes}
        students={students}
        matrix={matrix}
        periods={PERIODS}
        matchingPeriods={matchingPeriods}
        onCellClick={handleCellClick}
        onCellContextMenu={handleCellContextMenu}
      />

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
                       dirty && saveStatus === 'idle'
                         ? 'animate-pulse ring-2 ring-sp-accent/50'
                         : ''
                     } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <span className="material-symbols-outlined text-lg">
            {saveStatus === 'saved'
              ? 'check'
              : saveStatus === 'saving'
                ? 'hourglass_empty'
                : 'save'}
          </span>
          {saveStatus === 'saved'
            ? '저장됨!'
            : saveStatus === 'saving'
              ? '저장 중...'
              : '전체 저장'}
        </button>
      </div>

      {/* ── 팝오버 (우클릭 상세 편집) ── */}
      {popover && (
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            top: popover.anchorRect.bottom + 6,
            left: popover.anchorRect.left,
            zIndex: 9999,
          }}
          className="bg-sp-card border border-sp-border rounded-xl shadow-xl p-3 min-w-[200px]"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-sp-text">
              {popoverStudent?.name} {formatPeriodLabel(popover.period, periodTimes)}
            </span>
            <button
              type="button"
              onClick={() => setPopover(null)}
              className="text-sp-muted hover:text-sp-text transition-colors"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
          <AttendanceDetailEditor
            status={popoverAtt?.status ?? 'present'}
            reason={popoverAtt?.reason}
            memo={popoverAtt?.memo}
            onChange={(next) => handleDetailChange(popover.studentKey, popover.period, next)}
            compact={false}
          />
        </div>
      )}
    </div>
  );
}
