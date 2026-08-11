import { useEffect, useMemo, useState } from 'react';
import { useMobileTeachingClassStore } from '@mobile/stores/useMobileTeachingClassStore';
import { useMobileAttendanceStore } from '@mobile/stores/useMobileAttendanceStore';
import { studentKey } from '@domain/entities/TeachingClass';
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

interface ClassAttendanceStatsViewProps {
  classId: string;
  className: string;
}

/**
 * 학급 상세 → 출결 탭 내부 "출결 통계" 세그먼트. Design §3 (S3) / §6.1(리팩터).
 * PC `ClassRecordStatsView`의 출결 통계 파트를 좁은 화면에 맞게 미러링한 읽기 전용 집계 화면.
 * 기간 칩+요약+sticky 표는 공용 `AttendanceStatsTable`(components/common/)에 위임하고, 이
 * 컴포넌트는 학급 데이터를 rows/summary로 집계하는 역할만 한다(담임용 `HomeroomAttendanceStatsView`
 * 와 프레젠테이션을 공유). 셀은 비상호작용 — PC의 드릴인 모달(`RecordDetailModal`)은 adapters/
 * 컴포넌트라 mobile/에서 import할 수 없어 이번 스코프에서 제외(후속 PDCA).
 */
export function ClassAttendanceStatsView({ classId, className }: ClassAttendanceStatsViewProps) {
  const [filter, setFilter] = useState<AttendancePeriodFilter>('all');
  const [customRange, setCustomRange] = useState<{ start: string; end: string } | null>(null);

  const classes = useMobileTeachingClassStore((s) => s.classes);
  const loadClasses = useMobileTeachingClassStore((s) => s.load);
  const records = useMobileAttendanceStore((s) => s.records);
  const loadAttendance = useMobileAttendanceStore((s) => s.load);

  useEffect(() => {
    void loadClasses();
    void loadAttendance();
  }, [loadClasses, loadAttendance]);

  // PC ClassRecordStatsView.tsx:77처럼 classes 배열을 직접 구독 — load() 완료 시 정상 재계산된다.
  const cls = useMemo(() => classes.find((c) => c.id === classId), [classes, classId]);
  const students = useMemo(() => {
    if (!cls) return [];
    return filterActive(cls.students).sort((a, b) => a.number - b.number);
  }, [cls]);

  const termStartIso = useMobileCurrentTermStartIso();
  const dateRange = useMemo(
    () =>
      filter === 'custom'
        ? (customRange ?? { start: null, end: null })
        : getFilterRange(filter, termStartIso),
    [filter, customRange, termStartIso],
  );

  /* 학생별 출결 통계 — PC ClassRecordStatsView.tsx:89-108과 동일 알고리즘(period 무시, 연인원 합산) */
  const stats = useMemo(() => {
    const map = new Map<string, Record<AttendanceStatus, number>>();
    for (const s of students) {
      map.set(studentKey(s), { present: 0, absent: 0, late: 0, earlyLeave: 0, classAbsence: 0 });
    }
    const filtered = records.filter(
      (r) =>
        r.classId === classId &&
        (!dateRange.start || r.date >= dateRange.start) &&
        (!dateRange.end || r.date <= dateRange.end),
    );
    for (const record of filtered) {
      for (const sa of record.students) {
        const entry = map.get(studentKey(sa));
        if (entry) entry[sa.status]++;
      }
    }
    return map;
  }, [records, classId, students, dateRange]);

  /* 학급 요약(연인원) — 출석을 제외한 이상 출결 4종 합산 */
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
      students.map((s) => ({
        key: studentKey(s),
        number: s.number,
        name: s.name,
        counts: stats.get(studentKey(s)) ?? EMPTY_COUNTS,
      })),
    [students, stats],
  );

  if (!cls) {
    return (
      <div className="px-4 py-3 space-y-3 animate-pulse" aria-label="통계를 불러오는 중입니다">
        <p className="text-xs text-sp-muted">통계를 불러오는 중입니다</p>
        {skeletonRows.map((row) => (
          <div key={row} className="h-10 rounded-lg bg-sp-surface border border-sp-border" />
        ))}
      </div>
    );
  }

  if (students.length === 0) {
    return <EmptyState icon="group_off" text="등록된 학생이 없습니다." />;
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <AttendanceStatsTable
        filter={filter}
        onFilterChange={setFilter}
        summary={summary}
        rows={rows}
        scopeLabel="학급 전체"
        tableAriaLabel={`${className} 학생별 출결 통계`}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
      />
    </div>
  );
}
