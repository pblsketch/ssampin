import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type {
  AttendanceRecord,
  AttendanceStatus,
  AttendanceReason,
  StudentAttendance,
} from '@domain/entities/Attendance';
import { formatPeriodLabel, PERIOD_MORNING, PERIOD_CLOSING } from '@domain/entities/Attendance';
import { cycleStatus, summarizeTotal, computeAutoPeriods } from '@domain/rules/attendanceRules';
import { studentKey } from '@domain/entities/TeachingClass';
import { AttendanceDetailEditor } from '@adapters/components/attendance/shared/AttendanceDetailEditor';
import { AttendanceGridView } from '@adapters/components/attendance/shared/AttendanceGridView';
import {
  STATUS_CONFIG,
  STAT_COLORS,
  buildInitialMatrix,
  type LocalStudentAttendance,
  type MatrixState,
  type MatrixStudent,
} from '@adapters/components/attendance/shared/attendanceGridShared';

/**
 * 담임 오늘 기록 출결 그리드 — 담임 소유 얇은 셸.
 *
 * 공유하는 것: headless 그리드 뷰(AttendanceGridView) + 도메인 규칙(attendanceRules).
 * 담임 셸이 소유하는 것: 매트릭스 편집 상태, 저장 위임(onSaveDay — 호스트가
 * saveDayAttendance + StudentRecord 미러를 처리), 사유 팝오버.
 * 날짜와 교시 목록(periods)은 호스트(InputMode)가 단일 출처로 내려준다 —
 * 자동채움(computeAutoPeriods)의 periodCount와 어긋나지 않게 하기 위함.
 *
 * 주의: 이 컴포넌트를 장착하는 호스트는 반드시 렌더 게이트를 앞단에 둬야 한다 —
 * 담임 학생은 studentKey === String(number)라 번호가 겹치면 그리드에서 한 행으로
 * 병합 렌더되므로, 번호 충돌 시 그리드 대신 정리 안내를 렌더할 것. (P4.2에서 장착)
 */
export interface HomeroomAttendanceGridProps {
  /** 담임 학생 목록 (번호순 정렬, number 기반 식별) */
  students: readonly MatrixStudent[];
  /** 출결 저장 classId (담임 학급명) */
  classId: string;
  /** 호스트(InputMode)가 소유한 날짜 (YYYY-MM-DD) */
  date: string;
  /** (date) → 해당 날짜의 AttendanceRecord 배열 */
  loadDayRecords: (date: string) => readonly AttendanceRecord[];
  /**
   * 하루치 저장 위임 — 호스트가 saveDayAttendance 호출과
   * number→studentId 재매핑을 통한 StudentRecord 미러 조립까지 책임진다.
   */
  onSaveDay: (
    date: string,
    byPeriod: ReadonlyMap<number, readonly StudentAttendance[]>,
  ) => Promise<void>;
  /** 교시 목록 — settings(maxPeriods) 단일 출처에서 호스트가 구성 */
  periods: readonly number[];
}

interface PopoverState {
  studentKey: string;
  period: number;
  anchorRect: DOMRect;
}

/** 이름 클릭 자동채움 팝오버 상태 — status 선택 후 기준 교시가 필요한 유형은 2단계로 */
interface AutoFillState {
  studentKey: string;
  anchorRect: DOMRect;
  /** null = 상태 선택 단계, 값 있음 = 기준 교시 선택 단계 */
  pendingStatus: Exclude<AttendanceStatus, 'present' | 'absent'> | null;
}

const AUTO_FILL_STATUSES: readonly Exclude<AttendanceStatus, 'present'>[] = [
  'absent',
  'late',
  'earlyLeave',
  'classAbsence',
];

const REFERENCE_PERIOD_LABEL: Record<string, string> = {
  late: '몇 교시에 등교했나요?',
  earlyLeave: '몇 교시에 하교했나요?',
  classAbsence: '어느 교시가 결과인가요?',
};

export function HomeroomAttendanceGrid({
  students,
  classId,
  date,
  loadDayRecords,
  onSaveDay,
  periods,
}: HomeroomAttendanceGridProps) {
  const [matrix, setMatrix] = useState<MatrixState>({});
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [autoFill, setAutoFill] = useState<AutoFillState | null>(null);
  const autoFillRef = useRef<HTMLDivElement>(null);

  /** 정규 교시 수 (조회/종례 제외) — computeAutoPeriods 의 periodCount */
  const regularPeriodCount = useMemo(
    () => periods.filter((p) => p !== PERIOD_MORNING && p !== PERIOD_CLOSING).length,
    [periods],
  );

  /* 날짜/학생 변경 시 저장본에서 재시드 */
  useEffect(() => {
    const records = loadDayRecords(date);
    setMatrix(buildInitialMatrix(records, classId, date, students, periods));
    setDirty(false);
    setSaveStatus('idle');
    setPopover(null);
    setAutoFill(null);
    // periods는 원시 배열이므로 직렬화로 의존성 비교
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, date, loadDayRecords, students, periods.join(',')]);

  /* 팝오버 외부 클릭 / ESC 닫기 */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPopover(null);
        setAutoFill(null);
      }
    };
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopover(null);
      }
      if (autoFillRef.current && !autoFillRef.current.contains(e.target as Node)) {
        setAutoFill(null);
      }
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, []);

  /* 셀 클릭 = 상태 순환 (정상 출석은 엔트리 제거 = 예외 기반 입력) */
  const handleCellClick = useCallback(
    (sKey: string, period: number) => {
      const student = students.find((s) => studentKey(s) === sKey);
      if (!student) return;
      setMatrix((prev) => {
        const row = prev[sKey] ?? {};
        const current = row[period];
        const currentStatus: AttendanceStatus = current?.status ?? 'present';
        const nextStatus = cycleStatus(currentStatus);
        const fallback: LocalStudentAttendance = { number: student.number, status: 'present' };
        const updated: LocalStudentAttendance | undefined =
          nextStatus === 'present'
            ? undefined
            : { ...(current ?? fallback), status: nextStatus, reason: undefined, memo: undefined };
        return { ...prev, [sKey]: { ...row, [period]: updated } };
      });
      setDirty(true);
      setSaveStatus('idle');
    },
    [students],
  );

  const handleCellContextMenu = useCallback((e: React.MouseEvent, sKey: string, period: number) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopover({ studentKey: sKey, period, anchorRect: rect });
  }, []);

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

  /* 이름 클릭 → 자동채움 팝오버 열기 */
  const openAutoFill = useCallback((sKey: string, anchorRect: DOMRect) => {
    setPopover(null);
    setAutoFill({ studentKey: sKey, anchorRect, pendingStatus: null });
  }, []);

  /* 상태(+기준 교시) 확정 → computeAutoPeriods 로 행 채움.
     결과는 초기값일 뿐 — 이후 셀 단위 클릭으로 자유롭게 override 가능. */
  const applyAutoFill = useCallback(
    (sKey: string, status: Exclude<AttendanceStatus, 'present'>, referencePeriod: number) => {
      const student = students.find((s) => studentKey(s) === sKey);
      if (!student) return;
      const fill = computeAutoPeriods(status, referencePeriod, regularPeriodCount);
      setMatrix((prev) => {
        const row: Record<number, LocalStudentAttendance | undefined> = {};
        for (const p of periods) {
          row[p] = fill.has(p) ? { number: student.number, status } : undefined;
        }
        return { ...prev, [sKey]: row };
      });
      setDirty(true);
      setSaveStatus('idle');
      setAutoFill(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [students, regularPeriodCount, periods.join(',')],
  );

  const handleReset = useCallback(() => {
    const records = loadDayRecords(date);
    setMatrix(buildInitialMatrix(records, classId, date, students, periods));
    setDirty(false);
    setSaveStatus('idle');
    setPopover(null);
    setAutoFill(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, date, loadDayRecords, students, periods.join(',')]);

  const handleSave = useCallback(async () => {
    setSaveStatus('saving');
    const byPeriod = new Map<number, StudentAttendance[]>();
    for (const p of periods) {
      const periodStudents: StudentAttendance[] = [];
      for (const [sKey, row] of Object.entries(matrix)) {
        const att = row?.[p];
        if (att) {
          const student = students.find((s) => studentKey(s) === sKey);
          periodStudents.push({
            number: att.number || (student?.number ?? 0),
            status: att.status,
            ...(att.reason ? { reason: att.reason } : {}),
            ...(att.memo ? { memo: att.memo } : {}),
          });
        }
      }
      byPeriod.set(p, periodStudents);
    }
    await onSaveDay(date, byPeriod);
    setSaveStatus('saved');
    setDirty(false);
    setTimeout(() => setSaveStatus('idle'), 2000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, matrix, students, onSaveDay, periods.join(',')]);

  /* 상단 요약 (전체 카운트) */
  const matrixMap = useMemo(() => {
    const m = new Map<string, Map<number, StudentAttendance | undefined>>();
    for (const [sKey, row] of Object.entries(matrix)) {
      const inner = new Map<number, StudentAttendance | undefined>();
      for (const p of periods) inner.set(p, row?.[p]);
      m.set(sKey, inner);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrix, periods.join(',')]);
  const totalStats = useMemo(() => summarizeTotal(matrixMap), [matrixMap]);

  const popoverAtt = popover ? matrix[popover.studentKey]?.[popover.period] : undefined;
  const popoverStudent = popover
    ? students.find((s) => studentKey(s) === popover.studentKey)
    : undefined;

  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-sp-muted">
        <span className="material-symbols-outlined text-4xl mb-3">group_add</span>
        <p className="text-sm">명렬표에 학생을 먼저 등록해주세요.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 요약 + 액션 바 */}
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
        <button
          onClick={handleReset}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-sp-muted hover:text-sp-text
                     bg-sp-card border border-sp-border rounded-lg transition-colors hover:border-sp-accent/50"
          title="저장된 데이터로 되돌리기"
        >
          <span className="material-symbols-outlined text-sm">restart_alt</span>
          변경 초기화
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={saveStatus === 'saving'}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium
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
              : '출결 저장'}
        </button>
      </div>

      {/* 공용 headless 그리드 뷰 (이름 클릭 = 자동채움) */}
      <AttendanceGridView
        students={students}
        matrix={matrix}
        periods={periods}
        onCellClick={handleCellClick}
        onCellContextMenu={handleCellContextMenu}
        onStudentNameClick={openAutoFill}
      />

      {/* 자동채움 팝오버 — 상태 선택 → (지각·조퇴·결과) 기준 교시 선택 */}
      {autoFill && (
        <div
          ref={autoFillRef}
          style={{
            position: 'fixed',
            top: autoFill.anchorRect.bottom + 6,
            left: autoFill.anchorRect.left,
            zIndex: 9999,
          }}
          className="bg-sp-card border border-sp-border rounded-xl shadow-xl p-3 min-w-[230px]"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-sp-text">
              {students.find((s) => studentKey(s) === autoFill.studentKey)?.name} · 교시 자동 채움
            </span>
            <button
              type="button"
              onClick={() => setAutoFill(null)}
              className="text-sp-muted hover:text-sp-text transition-colors"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>

          {autoFill.pendingStatus === null ? (
            <div className="flex flex-col gap-1">
              {AUTO_FILL_STATUSES.map((status) => {
                const desc =
                  status === 'absent'
                    ? '조회~종례 전체'
                    : status === 'late'
                      ? '조회부터 등교 교시까지'
                      : status === 'earlyLeave'
                        ? '하교 교시부터 종례까지'
                        : '해당 교시만';
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() =>
                      status === 'absent'
                        ? applyAutoFill(autoFill.studentKey, 'absent', PERIOD_MORNING)
                        : setAutoFill({ ...autoFill, pendingStatus: status })
                    }
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-left hover:bg-sp-surface transition-colors"
                  >
                    <span className={`material-symbols-outlined text-base ${STAT_COLORS[status]}`}>
                      {STATUS_CONFIG[status].icon}
                    </span>
                    <span className="text-sm text-sp-text font-medium">
                      {STATUS_CONFIG[status].label}
                    </span>
                    <span className="text-caption text-sp-muted ml-auto">{desc}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div>
              <p className="text-xs text-sp-muted mb-2">
                {REFERENCE_PERIOD_LABEL[autoFill.pendingStatus]}
              </p>
              <div className="flex flex-wrap gap-1.5 max-w-[260px]">
                {periods.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => applyAutoFill(autoFill.studentKey, autoFill.pendingStatus!, p)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-sp-surface border border-sp-border text-sp-text hover:border-sp-accent hover:text-sp-accent transition-colors"
                  >
                    {formatPeriodLabel(p)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setAutoFill({ ...autoFill, pendingStatus: null })}
                className="mt-2 text-caption text-sp-muted hover:text-sp-text transition-colors"
              >
                ← 상태 다시 선택
              </button>
            </div>
          )}
        </div>
      )}

      {/* 사유·메모 팝오버 */}
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
              {popoverStudent?.name} {formatPeriodLabel(popover.period)}
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
