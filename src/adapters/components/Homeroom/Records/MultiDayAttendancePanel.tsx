import { useState, useMemo, useCallback } from 'react';
import type { Student } from '@domain/entities/Student';
import type {
  AttendanceStatus,
  AttendanceReason,
  StudentAttendance,
} from '@domain/entities/Attendance';
import { ATTENDANCE_REASONS, formatPeriodLabel } from '@domain/entities/Attendance';
import { computeAutoPeriods } from '@domain/rules/attendanceRules';
import { isStudentActive } from '@domain/rules/studentActivity';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { MultiDatePicker } from '@adapters/components/common/MultiDatePicker';
import { Notice } from '@adapters/components/common/Notice';
import {
  STATUS_CONFIG,
  STAT_COLORS,
} from '@adapters/components/attendance/shared/attendanceGridShared';
import { createDateRange, formatDateKR } from './recordUtils';

/**
 * 여러 날 출결 입력 패널 — 출결 탭 전용(§3.6 이관).
 *
 * 입원·체험학습 등 여러 날에 걸친 출결을 팔레트(종류+사유+비고)로 설정하고 기간/여러 날 +
 * 학생 다중 선택으로 한 번에 입력한다. 저장은 기존 fan-out(교시별) 로직 재사용 —
 * 스키마·동기화·미러 불변. 이로써 출결 탭이 유일한 출결 입력구가 된다(카드 경로 소멸).
 */

type MultiType = Exclude<AttendanceStatus, 'present'>;

const TYPE_ITEMS: readonly { type: MultiType; label: string }[] = [
  { type: 'absent', label: '결석' },
  { type: 'late', label: '지각' },
  { type: 'earlyLeave', label: '조퇴' },
  { type: 'classAbsence', label: '결과' },
];

const REF_LABEL: Record<Exclude<MultiType, 'absent'>, string> = {
  late: '등교 교시',
  earlyLeave: '하교 교시',
  classAbsence: '해당 교시',
};

export interface MultiDayAttendancePanelProps {
  /** 담임 활성 학생 목록 */
  students: readonly Student[];
  /** 담임 학급명 (저장 classId) */
  className: string;
  /** 정규 교시 수 (computeAutoPeriods) */
  regularPeriodCount: number;
  /** 기준 교시 선택 옵션 (조회/1..N/종례) */
  periods: readonly number[];
  /** 시작일 기본값 (출결 탭의 선택 날짜) */
  defaultDate: string;
  /** 초기 종류(명령 팔레트 intent) */
  initialType?: MultiType;
  onClose: () => void;
}

export function MultiDayAttendancePanel({
  students,
  className,
  regularPeriodCount,
  periods,
  defaultDate,
  initialType = 'absent',
  onClose,
}: MultiDayAttendancePanelProps) {
  const getDayAttendance = useTeachingClassStore((s) => s.getDayAttendance);
  const saveDayAttendance = useTeachingClassStore((s) => s.saveDayAttendance);
  const bridgeHomeroomDayAttendance = useStudentRecordsStore((s) => s.bridgeHomeroomDayAttendance);
  const showToast = useToastStore((s) => s.show);

  const [type, setType] = useState<MultiType>(initialType);
  const [reason, setReason] = useState<AttendanceReason>('질병');
  const [memo, setMemo] = useState('');
  const [referencePeriod, setReferencePeriod] = useState<number>(1);

  const [dateMode, setDateMode] = useState<'range' | 'multi'>('range');
  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);
  const [multiSet, setMultiSet] = useState<ReadonlySet<string>>(new Set());

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const rosterStudents = useMemo(
    () =>
      students.filter((s) => isStudentActive(s) && s.studentNumber != null && s.studentNumber > 0),
    [students],
  );

  const rangeDates = useMemo(() => {
    if (dateMode === 'range')
      return endDate >= startDate ? createDateRange(startDate, endDate) : [];
    return Array.from(multiSet).sort();
  }, [dateMode, startDate, endDate, multiSet]);

  const isWeekend = (d: string) => {
    const g = new Date(`${d}T00:00:00`).getDay();
    return g === 0 || g === 6;
  };
  const weekendSkipped = useMemo(
    () => (dateMode === 'range' ? rangeDates.filter(isWeekend) : []),
    [dateMode, rangeDates],
  );
  const effectiveDates = useMemo(
    () => (dateMode === 'range' ? rangeDates.filter((d) => !isWeekend(d)) : rangeDates),
    [dateMode, rangeDates],
  );

  const rangeError =
    dateMode === 'range' && endDate < startDate
      ? '종료일이 시작일보다 빠릅니다'
      : effectiveDates.length > 30
        ? '30일을 초과하는 범위는 등록할 수 없습니다'
        : null;

  const totalCount = selectedIds.size * effectiveDates.length;
  const canApply = !saving && !rangeError && selectedIds.size > 0 && effectiveDates.length > 0;

  const toggleStudent = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === rosterStudents.length ? new Set() : new Set(rosterStudents.map((s) => s.id)),
    );
  }, [rosterStudents]);

  const handleApply = useCallback(async () => {
    if (!canApply) return;
    setSaving(true);
    try {
      const tc = useTeachingClassStore.getState();
      if (!tc.loaded) await tc.load();
      const fill = computeAutoPeriods(type, referencePeriod, regularPeriodCount);
      const memoText = memo.trim() || undefined;
      const picked = rosterStudents.filter((s) => selectedIds.has(s.id));

      const pickedNumbers = new Set(picked.map((s) => s.studentNumber!));
      for (const date of effectiveDates) {
        const existing = getDayAttendance(className, date);
        const byPeriod = new Map<number, StudentAttendance[]>();
        for (const r of existing) byPeriod.set(r.period, [...r.students]);
        // §3.10-5 전-행 재작성: 선택 학생의 기존 교시 기록을 먼저 전부 지운다(다른 학생 기록은 보존).
        // 이렇게 해야 기존에 전일 결석이던 학생을 2교시 지각으로 바꿀 때 3교시~종례에 결석이 남지 않는다.
        for (const [p, arr] of byPeriod) {
          const cleaned = arr.filter((sa) => !pickedNumbers.has(sa.number));
          if (cleaned.length !== arr.length) byPeriod.set(p, cleaned);
        }
        // 그다음 fill 교시에만 선택 학생 엔트리를 넣는다(그리드의 팔레트 적용과 동일 계약).
        for (const student of picked) {
          const number = student.studentNumber!;
          for (const p of fill) {
            const arr = byPeriod.get(p) ?? [];
            arr.push({ number, status: type, reason, memo: memoText });
            byPeriod.set(p, arr);
          }
        }
        await saveDayAttendance(className, date, byPeriod);
        await bridgeHomeroomDayAttendance({ className, date, recordsByPeriod: byPeriod, students });
      }

      const parts: string[] = [];
      if (weekendSkipped.length > 0) parts.push(`주말 ${weekendSkipped.length}일 제외`);
      showToast(
        `${effectiveDates.length}일 × ${picked.length}명 출결을 등록했어요${
          parts.length ? ` (${parts.join(', ')})` : ''
        }`,
        'success',
      );
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : '여러 날 출결 저장에 실패했어요', 'error');
    } finally {
      setSaving(false);
    }
  }, [
    canApply,
    type,
    referencePeriod,
    regularPeriodCount,
    memo,
    reason,
    rosterStudents,
    selectedIds,
    effectiveDates,
    weekendSkipped,
    className,
    getDayAttendance,
    saveDayAttendance,
    bridgeHomeroomDayAttendance,
    students,
    showToast,
    onClose,
  ]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-sp-card border border-sp-border rounded-2xl w-[680px] max-w-full max-h-[88vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-sp-border">
          <h3 className="text-sm font-bold text-sp-text flex items-center gap-2">
            <span className="material-symbols-outlined text-base">date_range</span>
            여러 날 출결 입력
            <span className="text-xs text-sp-muted font-normal">(입원·체험학습·격리 등)</span>
          </h3>
          <button
            onClick={onClose}
            className="text-sp-muted hover:text-sp-text transition-colors"
            aria-label="닫기"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
          {/* 팔레트 */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-sp-muted w-8 shrink-0">종류</span>
              {TYPE_ITEMS.map(({ type: t, label }) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    type === t
                      ? 'bg-sp-accent/15 text-sp-accent border-sp-accent/50'
                      : 'text-sp-muted bg-sp-surface border-sp-border hover:text-sp-text'
                  }`}
                >
                  <span className={`material-symbols-outlined text-sm ${STAT_COLORS[t]}`}>
                    {STATUS_CONFIG[t].icon}
                  </span>
                  {label}
                </button>
              ))}
              {type !== 'absent' && (
                <label className="flex items-center gap-1.5 text-xs text-sp-muted ml-2">
                  {REF_LABEL[type]}
                  <select
                    value={referencePeriod}
                    onChange={(e) => setReferencePeriod(Number(e.target.value))}
                    className="bg-sp-surface border border-sp-border rounded-lg px-2 py-1 text-xs text-sp-text focus:outline-none focus:border-sp-accent"
                  >
                    {periods.map((p) => (
                      <option key={p} value={p}>
                        {formatPeriodLabel(p)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-sp-muted w-8 shrink-0">사유</span>
              {ATTENDANCE_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    reason === r
                      ? 'bg-sp-accent/15 text-sp-accent border-sp-accent/50'
                      : 'text-sp-muted bg-sp-surface border-sp-border hover:text-sp-text'
                  }`}
                >
                  {r}
                </button>
              ))}
              <span className="text-xs text-sp-muted ml-2">비고</span>
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="예: 학교장허가 교외체험학습 (선택)"
                className="flex-1 min-w-[10rem] bg-sp-surface border border-sp-border rounded-lg px-2.5 py-1 text-xs text-sp-text placeholder:text-sp-muted/60 focus:outline-none focus:border-sp-accent"
              />
            </div>
          </div>

          {/* 날짜 선택 */}
          <div className="space-y-2">
            <div
              role="radiogroup"
              aria-label="날짜 선택 모드"
              className="flex items-center gap-1 p-1 bg-sp-surface rounded-lg w-fit"
            >
              {(['range', 'multi'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={dateMode === m}
                  onClick={() => setDateMode(m)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    dateMode === m ? 'bg-sp-accent text-white' : 'text-sp-muted hover:text-sp-text'
                  }`}
                >
                  {m === 'range' ? '기간' : '여러 날'}
                </button>
              ))}
            </div>

            {dateMode === 'range' ? (
              <div className="flex items-center gap-3 flex-wrap text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-sp-muted w-8">시작</span>
                  <MultiDatePicker
                    mode="single"
                    singleValue={startDate}
                    onSingleChange={setStartDate}
                    compact
                    portal
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-sp-muted w-8">종료</span>
                  <MultiDatePicker
                    mode="single"
                    singleValue={endDate}
                    onSingleChange={setEndDate}
                    compact
                    portal
                  />
                </div>
              </div>
            ) : (
              <MultiDatePicker
                mode="multi"
                multiValues={multiSet}
                onMultiChange={setMultiSet}
                onToast={showToast}
                maxCount={30}
              />
            )}

            {rangeError ? (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">error</span>
                {rangeError}
              </p>
            ) : effectiveDates.length > 0 ? (
              <p className="text-xs text-sp-accent flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">info</span>
                {effectiveDates.length}일 등록
                {weekendSkipped.length > 0 ? ` · 주말 ${weekendSkipped.length}일 자동 제외` : ''}
              </p>
            ) : null}
          </div>

          {/* 학생 선택 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-sp-text">
                학생 선택 ({selectedIds.size}명)
              </span>
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs text-sp-accent hover:text-sp-accent/80 transition-colors"
              >
                {selectedIds.size === rosterStudents.length ? '전체 해제' : '전체 선택'}
              </button>
            </div>
            <div className="grid grid-cols-5 gap-1.5 max-h-40 overflow-y-auto">
              {rosterStudents.map((s) => {
                const on = selectedIds.has(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleStudent(s.id)}
                    className={`px-1.5 py-1.5 rounded-lg text-xs font-medium transition-all text-center ${
                      on
                        ? 'bg-sp-accent text-white ring-1 ring-sp-accent'
                        : 'bg-sp-surface text-sp-text hover:bg-sp-surface/80'
                    }`}
                  >
                    <div className="text-caption opacity-60 tabular-nums">{s.studentNumber}</div>
                    <div className="truncate">{s.name}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 미리보기 */}
          <Notice variant="info" title="적용 미리보기">
            <span className="text-sp-muted">
              선택 학생 <span className="text-sp-text font-medium">{selectedIds.size}명</span> ×{' '}
              <span className="text-sp-text font-medium">{effectiveDates.length}일</span> = 총{' '}
              <span className="text-sp-text font-bold">{totalCount}건</span> 등록
              {effectiveDates.length > 0 && (
                <>
                  {' '}
                  ({formatDateKR(effectiveDates[0]!)}
                  {effectiveDates.length > 1
                    ? ` ~ ${formatDateKR(effectiveDates[effectiveDates.length - 1]!)}`
                    : ''}
                  )
                </>
              )}
            </span>
          </Notice>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-sp-border">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-sp-surface text-sp-muted hover:text-sp-text transition-colors disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={() => void handleApply()}
            disabled={!canApply}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-sp-accent text-white hover:bg-sp-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {saving ? (
              <>
                <span className="material-symbols-outlined text-sm animate-spin">
                  progress_activity
                </span>
                등록 중...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm">check</span>
                {totalCount > 0 ? `${totalCount}건 등록` : '등록'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
