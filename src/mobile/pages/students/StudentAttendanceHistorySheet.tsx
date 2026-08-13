import React, { useEffect, useMemo, useState } from 'react';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { AttendanceStatus } from '@domain/entities/Attendance';
import { sortByDateDesc } from '@domain/rules/studentRecordRules';
import { useMobileStudentRecordsStore } from '@mobile/stores/useMobileStudentRecordsStore';
import { useBottomSheet } from '@mobile/hooks/useBottomSheet';
import { EmptyState } from '@mobile/components/common/EmptyState';
import { STATUS_CONFIG } from './shared';
import {
  STAT_ORDER,
  STAT_LABEL,
  STAT_INLINE_COLOR,
  type StatKey,
} from './AttendanceHistorySummary';

// ============================================================
// 담임 학생 출결 내역 전체 (S2 풀시트)
// ============================================================

interface StudentAttendanceHistorySheetProps {
  studentId: string;
  studentNumber: number;
  studentName: string;
  onClose: () => void;
}

interface ClassifiedEntry {
  record: StudentRecord;
  kind: StatKey;
}

interface MonthGroup {
  key: string;
  label: string;
  entries: ClassifiedEntry[];
}

/** STAT_ORDER 키 → STATUS_CONFIG(shared.ts) 상태 키 매핑. 칭찬은 STATUS_CONFIG 에 없어 별도 아이콘을 쓴다. */
const STAT_TO_STATUS: Record<Exclude<StatKey, 'praise'>, AttendanceStatus> = {
  absent: 'absent',
  late: 'late',
  earlyLeave: 'earlyLeave',
  resultAbsent: 'classAbsence',
};

/** 칭찬 전용 아이콘 — STATUS_CONFIG 는 AttendanceStatus 5종 키로 타입이 고정돼 확장하지 않는다. */
const PRAISE_ICON = 'star';

/** 타임라인 좌측 색 바 — CATEGORY_COLORS(shared.ts) 와 같은 표준 Tailwind 색 계열. */
const STAT_BAR_COLOR: Record<StatKey, string> = {
  absent: 'bg-red-400',
  late: 'bg-amber-400',
  earlyLeave: 'bg-orange-400',
  resultAbsent: 'bg-purple-400',
  praise: 'bg-green-400',
};

/**
 * 출결 서브카테고리에서 유형을 추출한다(domain/rules/studentRecordRules.ts 의 비공개
 * extractAttendanceType 과 동일 로직 — export 되어 있지 않아 표시 전용으로 로컬 이식).
 * 새 형식: "결석 (질병)" → "결석" / 구 형식 하위호환.
 */
function extractAttendanceType(subcategory: string): string {
  const parenIdx = subcategory.indexOf(' (');
  if (parenIdx !== -1) return subcategory.slice(0, parenIdx);
  if (['생리결석', '병결', '무단결석'].includes(subcategory)) return '결석';
  return subcategory;
}

function classifyRecord(record: StudentRecord): StatKey | null {
  if (record.category === 'life') {
    if (record.tags?.includes('칭찬') === true || record.subcategory === '칭찬') return 'praise';
    return null;
  }
  if (record.category !== 'attendance') return null;
  const type = extractAttendanceType(record.subcategory);
  if (type === '결석') return 'absent';
  if (type === '지각') return 'late';
  if (type === '조퇴') return 'earlyLeave';
  if (type === '결과') return 'resultAbsent';
  return null;
}

function groupByMonth(entries: readonly ClassifiedEntry[]): MonthGroup[] {
  const map = new Map<string, ClassifiedEntry[]>();
  for (const e of entries) {
    const key = e.record.date.slice(0, 7);
    const arr = map.get(key);
    if (arr) arr.push(e);
    else map.set(key, [e]);
  }
  return Array.from(map.entries()).map(([key, es]) => {
    const [y, m] = key.split('-');
    return { key, label: `${y}년 ${Number(m)}월`, entries: es };
  });
}

function formatMonthDay(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

export function StudentAttendanceHistorySheet({
  studentId,
  studentNumber,
  studentName,
  onClose,
}: StudentAttendanceHistorySheetProps) {
  useBottomSheet(true, onClose);
  const load = useMobileStudentRecordsStore((s) => s.load);
  const records = useMobileStudentRecordsStore((s) => s.records);
  const [activeStat, setActiveStat] = useState<StatKey | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const classified = useMemo<ClassifiedEntry[]>(() => {
    const own = records.filter((r) => r.studentId === studentId);
    const sorted = sortByDateDesc(own);
    const result: ClassifiedEntry[] = [];
    for (const record of sorted) {
      const kind = classifyRecord(record);
      if (kind) result.push({ record, kind });
    }
    return result;
  }, [records, studentId]);

  const statCounts = useMemo(() => {
    const counts: Record<StatKey, number> = {
      absent: 0,
      late: 0,
      earlyLeave: 0,
      resultAbsent: 0,
      praise: 0,
    };
    for (const { kind } of classified) counts[kind]++;
    return counts;
  }, [classified]);

  const filtered = activeStat ? classified.filter((c) => c.kind === activeStat) : classified;
  const monthGroups = useMemo(() => groupByMonth(filtered), [filtered]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end" onClick={handleBackdropClick}>
      {/* 반투명 배경 */}
      <div className="absolute inset-0 bg-black/50" />

      {/* 시트 */}
      <div
        className="relative w-full h-[85vh] glass-card rounded-t-2xl pb-safe flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={`${studentName} 출결 내역`}
      >
        {/* 핸들 바 */}
        <div className="flex justify-center pt-2 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-sp-border" />
        </div>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-sp-border shrink-0">
          <p className="text-sp-text font-bold text-base">
            {studentNumber}번 {studentName} · 출결 내역
          </p>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
          >
            <span className="material-symbols-outlined text-sp-muted">close</span>
          </button>
        </div>

        {/* 상태 필터 칩 */}
        <div
          className="flex gap-1.5 px-5 py-3 overflow-x-auto no-scrollbar shrink-0"
          role="tablist"
          aria-label="출결 유형 필터"
        >
          {STAT_ORDER.map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={activeStat === key}
              onClick={() => setActiveStat((prev) => (prev === key ? null : key))}
              className={`shrink-0 min-h-[44px] px-3 py-2 rounded-lg text-xs font-medium border ${
                activeStat === key
                  ? 'bg-sp-accent text-sp-accent-fg border-sp-accent'
                  : 'border-sp-border text-sp-muted'
              }`}
            >
              {STAT_LABEL[key]} {statCounts[key]}
            </button>
          ))}
        </div>

        {/* 타임라인 */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-5">
          {filtered.length === 0 ? (
            <EmptyState icon="event_available" text="해당 유형의 기록이 없습니다." />
          ) : (
            monthGroups.map((group) => (
              <div key={group.key}>
                <p className="text-sp-muted text-xs font-semibold mb-2 px-1 sticky top-0 bg-sp-card py-1 -mx-1">
                  {group.label}
                </p>
                <div className="space-y-2">
                  {group.entries.map(({ record, kind }) => (
                    <AttendanceHistoryRow key={record.id} record={record} kind={kind} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function AttendanceHistoryRow({ record, kind }: { record: StudentRecord; kind: StatKey }) {
  const icon = kind === 'praise' ? PRAISE_ICON : STATUS_CONFIG[STAT_TO_STATUS[kind]].icon;
  const reason = kind !== 'praise' ? record.subcategory.match(/\(([^)]+)\)/)?.[1] : undefined;

  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 flex rounded-xl overflow-hidden">
      <div className={`w-1 shrink-0 ${STAT_BAR_COLOR[kind]}`} />
      <div className="flex-1 p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-sp-muted tabular-nums">{formatMonthDay(record.date)}</span>
          <span className={`material-symbols-outlined text-sm ${STAT_INLINE_COLOR[kind]}`}>
            {icon}
          </span>
          <span className={`text-xs font-medium ${STAT_INLINE_COLOR[kind]}`}>
            {STAT_LABEL[kind]}
            {reason ? ` · ${reason}` : ''}
          </span>
        </div>
        {record.content && (
          <p className="text-sp-text text-sm">
            {kind === 'praise' ? record.content : `메모: ${record.content}`}
          </p>
        )}
      </div>
    </div>
  );
}
