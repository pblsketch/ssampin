import { useState, useMemo, useCallback, useEffect } from 'react';
import type {
  AttendanceRecord,
  AttendanceStatus,
  AttendanceReason,
  StudentAttendance,
} from '@domain/entities/Attendance';
import { PERIOD_MORNING, PERIOD_CLOSING, ATTENDANCE_REASONS } from '@domain/entities/Attendance';
import { computeAutoPeriods, summarizeTotal } from '@domain/rules/attendanceRules';
import { studentKey } from '@domain/entities/TeachingClass';
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
 * 담임 오늘 출결 그리드 — 담임 소유 얇은 셸 (attendance-grid-v2 팔레트 모델).
 *
 * 인터랙션: 팔레트에서 종류(결석/지각/조퇴/결과/지우개)+사유(질병/미인정/기타/인정)+비고를
 * 사전 설정 → 학생 행의 교시 칸을 클릭하면 그 교시를 기준으로 computeAutoPeriods 로 행 전체를
 * 재작성한다(§3.10-5 전-행 재작성: 찍힌 교시 외 clear, 전 교시 동일 사유·비고). 지우개는 칸=그
 * 칸만, 이름=하루 전체 지움. 저장 구조·미러·통계는 불변(교시별 fan-out 유지).
 *
 * 공유하는 것: headless 그리드 뷰(AttendanceGridView) + 도메인 규칙(attendanceRules).
 * 담임 셸이 소유하는 것: 매트릭스 편집 상태, 팔레트, 저장 위임(onSaveDay).
 * 날짜와 교시 목록(periods)은 호스트(AttendanceMode)가 단일 출처로 내려준다.
 * 스토어 직접 import 금지(저장·데이터는 호스트 위임) — 단일 기록자 메타 가드.
 *
 * 주의: 이 컴포넌트를 장착하는 호스트는 반드시 렌더 게이트를 앞단에 둬야 한다 —
 * 담임 학생은 studentKey === String(number)라 번호가 겹치면 그리드에서 한 행으로
 * 병합 렌더되므로, 번호 충돌 시 그리드 대신 정리 안내를 렌더할 것.
 */
export interface HomeroomAttendanceGridProps {
  /** 담임 학생 목록 (번호순 정렬, number 기반 식별) */
  students: readonly MatrixStudent[];
  /** 출결 저장 classId (담임 학급명) */
  classId: string;
  /** 호스트(AttendanceMode)가 소유한 날짜 (YYYY-MM-DD) */
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

/** 팔레트 종류 = 예외 상태 4종 + 지우개 */
type PaletteType = Exclude<AttendanceStatus, 'present'> | 'eraser';

const TYPE_ITEMS: readonly Exclude<AttendanceStatus, 'present'>[] = [
  'absent',
  'late',
  'earlyLeave',
  'classAbsence',
];

/** 종류별 칸 클릭 안내(기준 교시 의미) */
const TYPE_HINT: Record<Exclude<AttendanceStatus, 'present'>, string> = {
  absent: '아무 칸이나 클릭 → 전 교시 결석',
  late: '등교한 교시 칸 클릭 → 조회~그 교시 지각',
  earlyLeave: '하교한 교시 칸 클릭 → 그 교시~종례 조퇴',
  classAbsence: '해당 교시 칸 클릭 → 그 교시만 결과',
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

  /* ── 팔레트 상태 (종류 + 사유 + 비고) ── */
  const [paletteType, setPaletteType] = useState<PaletteType>('absent');
  const [paletteReason, setPaletteReason] = useState<AttendanceReason>('질병');
  const [paletteMemo, setPaletteMemo] = useState('');

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
    // periods는 원시 배열이므로 직렬화로 의존성 비교
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, date, loadDayRecords, students, periods.join(',')]);

  /* 팔레트 적용 = 칸 클릭. 지우개면 그 칸만 clear, 아니면 기준 교시로 전-행 재작성. */
  const handleCellClick = useCallback(
    (sKey: string, period: number) => {
      const student = students.find((s) => studentKey(s) === sKey);
      if (!student) return;

      if (paletteType === 'eraser') {
        setMatrix((prev) => {
          const row = { ...(prev[sKey] ?? {}) };
          row[period] = undefined;
          return { ...prev, [sKey]: row };
        });
      } else {
        const status: AttendanceStatus = paletteType;
        const fill = computeAutoPeriods(status, period, regularPeriodCount);
        const memoText = paletteMemo.trim() || undefined;
        setMatrix((prev) => {
          // §3.10-5 전-행 재작성: 찍힌 교시 외 clear, 전 교시 동일 사유·비고
          const row: Record<number, LocalStudentAttendance | undefined> = {};
          for (const p of periods) {
            row[p] = fill.has(p)
              ? { number: student.number, status, reason: paletteReason, memo: memoText }
              : undefined;
          }
          return { ...prev, [sKey]: row };
        });
      }
      setDirty(true);
      setSaveStatus('idle');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [students, paletteType, paletteReason, paletteMemo, regularPeriodCount, periods.join(',')],
  );

  /* 이름 클릭 = (지우개 모드에서만) 그 학생 하루 전체 지움 */
  const handleNameClick = useCallback(
    (sKey: string) => {
      if (paletteType !== 'eraser') return;
      setMatrix((prev) => {
        const row: Record<number, LocalStudentAttendance | undefined> = {};
        for (const p of periods) row[p] = undefined;
        return { ...prev, [sKey]: row };
      });
      setDirty(true);
      setSaveStatus('idle');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paletteType, periods.join(',')],
  );

  /* 사유(비고) 인라인 편집 = 찍힌 교시 전체로 memo fan-out (§3.10-5) */
  const handleMemoEdit = useCallback(
    (sKey: string, memo: string) => {
      const memoText = memo.trim() || undefined;
      setMatrix((prev) => {
        const row = prev[sKey];
        if (!row) return prev;
        const next: Record<number, LocalStudentAttendance | undefined> = { ...row };
        let changed = false;
        for (const p of periods) {
          const att = next[p];
          if (att && att.status !== 'present') {
            next[p] = { ...att, memo: memoText };
            changed = true;
          }
        }
        if (!changed) return prev;
        return { ...prev, [sKey]: next };
      });
      setDirty(true);
      setSaveStatus('idle');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [periods.join(',')],
  );

  /* 우클릭은 팔레트 모델에서 미사용 (컨텍스트 메뉴 무시) */
  const handleCellContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const handleReset = useCallback(() => {
    const records = loadDayRecords(date);
    setMatrix(buildInitialMatrix(records, classId, date, students, periods));
    setDirty(false);
    setSaveStatus('idle');
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

  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-sp-muted">
        <span className="material-symbols-outlined text-4xl mb-3">group_add</span>
        <p className="text-sm">명렬표에 학생을 먼저 등록해주세요.</p>
      </div>
    );
  }

  const isEraser = paletteType === 'eraser';
  const selectionLabel = isEraser
    ? '지우개'
    : `${STATUS_CONFIG[paletteType].label} · ${paletteReason}`;

  return (
    <div className="flex flex-col gap-3">
      {/* ── 팔레트 바 ── */}
      <div className="flex flex-col gap-2.5 bg-sp-surface border border-sp-border rounded-xl px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-sp-muted w-8 shrink-0">종류</span>
          {TYPE_ITEMS.map((type) => {
            const active = paletteType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setPaletteType(type)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  active
                    ? 'bg-sp-accent/15 text-sp-accent border-sp-accent/50'
                    : 'text-sp-muted bg-sp-card border-sp-border hover:text-sp-text'
                }`}
              >
                <span className={`material-symbols-outlined text-sm ${STAT_COLORS[type]}`}>
                  {STATUS_CONFIG[type].icon}
                </span>
                {STATUS_CONFIG[type].label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setPaletteType('eraser')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
              isEraser
                ? 'bg-sp-accent/15 text-sp-accent border-sp-accent/50'
                : 'text-sp-muted bg-sp-card border-sp-border hover:text-sp-text'
            }`}
            title="칸 클릭: 그 칸만 지움 · 이름 클릭: 하루 전체 지움"
          >
            <span className="material-symbols-outlined text-sm">ink_eraser</span>
            지우개
          </button>

          <div className="flex-1" />

          {/* 현재 선택 크게 강조 */}
          <span
            className={`px-3 py-1 rounded-lg text-sm font-bold ${
              isEraser ? 'bg-sp-card text-sp-text' : 'bg-sp-accent/15 text-sp-accent'
            }`}
          >
            {selectionLabel}
          </span>
        </div>

        {/* 사유 + 비고 (지우개일 땐 숨김) */}
        {!isEraser && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-sp-muted w-8 shrink-0">사유</span>
            {ATTENDANCE_REASONS.map((reason) => {
              const active = paletteReason === reason;
              return (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setPaletteReason(reason)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    active
                      ? 'bg-sp-accent/15 text-sp-accent border-sp-accent/50'
                      : 'text-sp-muted bg-sp-card border-sp-border hover:text-sp-text'
                  }`}
                >
                  {reason}
                </button>
              );
            })}
            <span className="text-xs text-sp-muted ml-2">비고</span>
            <input
              type="text"
              value={paletteMemo}
              onChange={(e) => setPaletteMemo(e.target.value)}
              placeholder="예: 감기 (선택)"
              className="flex-1 min-w-[8rem] bg-sp-card border border-sp-border rounded-lg px-2.5 py-1 text-xs text-sp-text placeholder:text-sp-muted/60 focus:outline-none focus:border-sp-accent"
            />
          </div>
        )}

        <p className="text-caption text-sp-muted leading-relaxed">
          {isEraser
            ? '칸을 클릭하면 그 칸만, 이름을 클릭하면 그 학생 하루 전체를 출석으로 되돌려요.'
            : TYPE_HINT[paletteType]}
        </p>
      </div>

      {/* ── 요약 + 저장 바 ── */}
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

      {/* 공용 headless 그리드 뷰 (팔레트 클릭 적용 · 구분/사유 열 · 출석 빈칸) */}
      <AttendanceGridView
        students={students}
        matrix={matrix}
        periods={periods}
        onCellClick={handleCellClick}
        onCellContextMenu={handleCellContextMenu}
        onStudentNameClick={isEraser ? handleNameClick : undefined}
        nameClickTitle="지우개: 클릭하면 이 학생의 하루 출결을 전부 지워요"
        blankPresent
        reasonColumn
        onMemoEdit={handleMemoEdit}
      />
    </div>
  );
}
