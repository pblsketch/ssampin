import { useEffect, useMemo, useState } from 'react';
import { useMobileTeachingClassStore } from '@mobile/stores/useMobileTeachingClassStore';
import { useMobileAttendanceStore } from '@mobile/stores/useMobileAttendanceStore';
import { studentKey } from '@domain/entities/TeachingClass';
import { filterActive } from '@domain/rules/studentActivity';
import type { AttendanceStatus } from '@domain/entities/Attendance';
import { EmptyState } from '@mobile/components/common/EmptyState';

type PeriodFilter = 'all' | 'semester' | 'month' | 'week';

/**
 * PC ClassRecordStatsView.tsx:24-52 을 로컬 순수 헬퍼로 이식.
 * adapters/는 mobile/에서 import할 수 없어(레이어 분리) 복제가 필요하다 — domain 신규 파일 아님.
 * '직접 설정'은 이 화면에서 제외(design §3 — 358px 가용폭에서 날짜 인풋 2개가 불안정).
 */
function getFilterRange(filter: PeriodFilter): { start: string | null; end: string | null } {
  if (filter === 'all') return { start: null, end: null };
  const now = new Date();
  if (filter === 'week') {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const start = new Date(now);
    start.setDate(now.getDate() - diff);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return {
      start: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
      end: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`,
    };
  }
  if (filter === 'month') {
    return {
      start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
      end: null,
    };
  }
  // semester (3~8월 / 9~2월)
  const month = now.getMonth() + 1;
  const semStart = month >= 3 && month < 9 ? 3 : 9;
  const year = semStart === 9 && month < 3 ? now.getFullYear() - 1 : now.getFullYear();
  return { start: `${year}-${String(semStart).padStart(2, '0')}-01`, end: null };
}

/** 상태색 매핑 — design §4.4 (표 텍스트 색 컬럼) 그대로. adapters/presentation/는 import 불가라 로컬 재정의. */
const ATT_STATUSES: { key: AttendanceStatus; label: string; color: string }[] = [
  { key: 'present', label: '출석', color: 'text-green-400' },
  { key: 'absent', label: '결석', color: 'text-red-400' },
  { key: 'late', label: '지각', color: 'text-amber-400' },
  { key: 'earlyLeave', label: '조퇴', color: 'text-orange-400' },
  { key: 'classAbsence', label: '결과', color: 'text-purple-400' },
];

const PERIOD_FILTERS: { id: PeriodFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'semester', label: '이번 학기' },
  { id: 'month', label: '이번 달' },
  { id: 'week', label: '이번 주' },
];

const skeletonRows = Array.from({ length: 4 }, (_, index) => index);

interface ClassAttendanceStatsViewProps {
  classId: string;
  className: string;
}

/**
 * 학급 상세 → 출결 탭 내부 "출결 통계" 세그먼트. Design §3 (S3).
 * PC `ClassRecordStatsView`의 출결 통계 파트를 좁은 화면에 맞게 미러링한 읽기 전용 집계 화면.
 * 셀은 비상호작용 — PC의 드릴인 모달(`RecordDetailModal`)은 adapters/ 컴포넌트라 mobile/에서
 * import할 수 없어 이번 스코프에서 제외(후속 PDCA).
 */
export function ClassAttendanceStatsView({ classId, className }: ClassAttendanceStatsViewProps) {
  const [filter, setFilter] = useState<PeriodFilter>('all');

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

  const dateRange = useMemo(() => getFilterRange(filter), [filter]);

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

  const periodLabel = PERIOD_FILTERS.find((f) => f.id === filter)?.label ?? '전체';

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* 기간 필터 칩 — §4.1 공통 규격 */}
      <div
        role="tablist"
        aria-label="통계 기간"
        className="flex gap-1.5 px-4 py-3 overflow-x-auto no-scrollbar shrink-0"
      >
        {PERIOD_FILTERS.map((f) => {
          const active = f.id === filter;
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f.id)}
              className={`shrink-0 min-h-[44px] px-3 py-2 rounded-lg text-xs font-medium border ${
                active
                  ? 'bg-sp-accent text-sp-accent-fg border-transparent'
                  : 'border-sp-border text-sp-muted'
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* 학급 요약(연인원) */}
      <div className="mx-4 mb-3 rounded-xl border border-sp-border bg-sp-card p-3">
        <p className="text-tiny text-sp-muted mb-1.5">{periodLabel} 학급 전체 (연인원)</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          <span className="text-red-500 dark:text-red-400 font-medium">
            결석 <b className="tabular-nums">{summary.absent}</b>
          </span>
          <span className="text-amber-500 dark:text-amber-400 font-medium">
            지각 <b className="tabular-nums">{summary.late}</b>
          </span>
          <span className="text-orange-500 dark:text-orange-400 font-medium">
            조퇴 <b className="tabular-nums">{summary.earlyLeave}</b>
          </span>
          <span className="text-purple-500 dark:text-purple-400 font-medium">
            결과 <b className="tabular-nums">{summary.classAbsence}</b>
          </span>
        </div>
      </div>

      {/* 학생별 출결 표 — 번호·이름 sticky + 상태 5칸 가로 스크롤(design §3 390px 폭 검증) */}
      <div
        className="mx-4 mb-4 rounded-xl border border-sp-border bg-sp-card overflow-hidden"
        aria-label={`${className} 학생별 출결 통계`}
      >
        <div className="px-4 py-2.5 border-b border-sp-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-sp-text flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base">how_to_reg</span>
            학생별 출결
          </h3>
          <span className="text-tiny text-sp-muted">옆으로 스크롤 →</span>
        </div>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr className="bg-black/[0.03] dark:bg-white/[0.03]">
                <th
                  scope="col"
                  className="sticky left-0 z-10 bg-sp-card border-r border-sp-border px-2 py-2.5 text-left font-medium w-[84px]"
                >
                  번호·이름
                </th>
                {ATT_STATUSES.map((s) => (
                  <th
                    key={s.key}
                    scope="col"
                    className={`px-2 py-2.5 text-center font-medium tabular-nums min-w-[48px] ${s.color}`}
                  >
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-sp-divider">
              {students.map((s) => {
                const sKey = studentKey(s);
                const stat = stats.get(sKey);
                return (
                  <tr key={sKey}>
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-sp-card border-r border-sp-border px-2 py-2.5 text-left font-medium w-[84px]"
                    >
                      <span className="text-sp-muted">{s.number}</span>{' '}
                      <span className="text-sp-text font-medium">{s.name}</span>
                    </th>
                    {ATT_STATUSES.map((as) => (
                      <td
                        key={as.key}
                        className={`px-2 py-2.5 text-center font-medium tabular-nums min-w-[48px] ${as.color}`}
                      >
                        {stat?.[as.key] ?? 0}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
