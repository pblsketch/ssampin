import { useEffect, useMemo, useState } from 'react';
import { useMobileStudentStore } from '@mobile/stores/useMobileStudentStore';
import { useMobileAttendanceStore } from '@mobile/stores/useMobileAttendanceStore';
import { filterActive } from '@domain/rules/studentActivity';
import type { AttendanceStatus } from '@domain/entities/Attendance';
import { EmptyState } from '@mobile/components/common/EmptyState';
import { useMobileCurrentTermStartIso } from '@mobile/hooks/useMobileCurrentTerm';
import {
  AttendanceStatsTable,
  getFilterRange,
  type AttendancePeriodFilter,
  type AttendanceStatsRow,
} from '@mobile/components/common/AttendanceStatsTable';

const skeletonRows = Array.from({ length: 4 }, (_, index) => index);

const EMPTY_COUNTS: Record<AttendanceStatus, number> = {
  present: 0,
  absent: 0,
  late: 0,
  earlyLeave: 0,
  classAbsence: 0,
};

interface HomeroomAttendanceStatsViewProps {
  classId: string;
  className: string;
  onBack: () => void;
}

/**
 * 담임 '우리 반' 출결 통계 — Design §6.1(Feature A). `HomeroomAttendanceView`의
 * "출결 통계" 세그먼트에서 렌더된다. `ClassAttendanceStatsView`(교과)와 공용
 * `AttendanceStatsTable`을 공유하되, 데이터 소스는 `useMobileStudentStore`(담임 전체 학생)와
 * `useMobileAttendanceStore`다.
 *
 * 헤더는 이 파일 소유의 자체 헤더(뒤로가기 + "담임 출결 통계" + 반 이름)로, `AttendanceCheckPage`
 * 비embedded 헤더 스타일을 그대로 복제했다. `HomeroomAttendanceView`의 세그먼트 바가 이미
 * safe-area-inset-top을 흡수하므로 여기서는 `paddingTop` 없이 고정 높이 3.5rem만 쓴다(이중
 * 여백 방지).
 */
export function HomeroomAttendanceStatsView({
  classId,
  className,
  onBack,
}: HomeroomAttendanceStatsViewProps) {
  const [filter, setFilter] = useState<AttendancePeriodFilter>('all');
  const [customRange, setCustomRange] = useState<{ start: string; end: string } | null>(null);

  const students = useMobileStudentStore((s) => s.students);
  const studentsLoaded = useMobileStudentStore((s) => s.loaded);
  const loadStudents = useMobileStudentStore((s) => s.load);
  const records = useMobileAttendanceStore((s) => s.records);
  const loadAttendance = useMobileAttendanceStore((s) => s.load);

  useEffect(() => {
    void loadStudents();
    void loadAttendance();
  }, [loadStudents, loadAttendance]);

  const activeStudents = useMemo(
    () => filterActive(students).sort((a, b) => (a.studentNumber ?? 0) - (b.studentNumber ?? 0)),
    [students],
  );

  const termStartIso = useMobileCurrentTermStartIso();
  const dateRange = useMemo(
    () =>
      filter === 'custom'
        ? (customRange ?? { start: null, end: null })
        : getFilterRange(filter, termStartIso),
    [filter, customRange, termStartIso],
  );

  /* 학생별 출결 통계 — record.students[].number → Student.studentNumber 매핑
     (AttendanceCheckPage.tsx:220-221 bridge 로직과 동일). period 필터 없음(담임은 항상 period 0). */
  const stats = useMemo(() => {
    const map = new Map<string, Record<AttendanceStatus, number>>();
    for (const s of activeStudents) {
      map.set(s.id, { present: 0, absent: 0, late: 0, earlyLeave: 0, classAbsence: 0 });
    }
    const filtered = records.filter(
      (r) =>
        r.classId === classId &&
        (!dateRange.start || r.date >= dateRange.start) &&
        (!dateRange.end || r.date <= dateRange.end),
    );
    for (const record of filtered) {
      for (const sa of record.students) {
        const student = activeStudents.find((s) => s.studentNumber === sa.number);
        if (!student) continue;
        const entry = map.get(student.id);
        if (entry) entry[sa.status]++;
      }
    }
    return map;
  }, [records, classId, activeStudents, dateRange]);

  /* 우리 반 요약(연인원) — 출석을 제외한 이상 출결 4종 합산 */
  const summary = useMemo(() => {
    const total = { absent: 0, late: 0, earlyLeave: 0, classAbsence: 0 };
    for (const entry of stats.values()) {
      total.absent += entry.absent;
      total.late += entry.late;
      total.earlyLeave += entry.earlyLeave;
      total.classAbsence += entry.classAbsence;
    }
    return total;
  }, [stats]);

  const rows = useMemo<AttendanceStatsRow[]>(
    () =>
      activeStudents.map((s) => ({
        key: s.id,
        number: s.studentNumber ?? 0,
        name: s.name,
        counts: stats.get(s.id) ?? EMPTY_COUNTS,
      })),
    [activeStudents, stats],
  );

  return (
    <div className="flex flex-col h-full bg-sp-bg">
      <header
        className="glass-header flex items-center gap-3 px-4 shrink-0"
        style={{ minHeight: '3.5rem' }}
      >
        <button
          onClick={onBack}
          className="touch-target flex items-center justify-center"
          aria-label="뒤로가기"
        >
          <span className="material-symbols-outlined text-sp-text">arrow_back</span>
        </button>
        <div className="flex-1">
          <h2 className="text-sp-text font-bold">담임 출결 통계</h2>
          <p className="text-sp-muted text-xs">{className}</p>
        </div>
      </header>

      {!studentsLoaded ? (
        <div className="px-4 py-3 space-y-3 animate-pulse" aria-label="통계를 불러오는 중입니다">
          <p className="text-xs text-sp-muted">통계를 불러오는 중입니다</p>
          {skeletonRows.map((row) => (
            <div key={row} className="h-10 rounded-lg bg-sp-surface border border-sp-border" />
          ))}
        </div>
      ) : activeStudents.length === 0 ? (
        <EmptyState icon="group_off" text="등록된 학생이 없습니다." />
      ) : (
        <div className="flex-1 overflow-y-auto">
          <AttendanceStatsTable
            filter={filter}
            onFilterChange={setFilter}
            summary={summary}
            rows={rows}
            scopeLabel="우리 반 전체"
            tableAriaLabel={`${className} 학생별 출결 통계`}
            customRange={customRange}
            onCustomRangeChange={setCustomRange}
          />
        </div>
      )}
    </div>
  );
}
