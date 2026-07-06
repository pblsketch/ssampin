import type { AttendanceStatus } from '@domain/entities/Attendance';

export type AttendancePeriodFilter = 'all' | 'semester' | 'month' | 'week';

export interface AttendanceStatsRow {
  readonly key: string; // studentKey(교과) | student.id(담임)
  readonly number: number; // 표시 번호(담임은 studentNumber ?? 0)
  readonly name: string;
  readonly counts: Readonly<Record<AttendanceStatus, number>>;
}

export interface AttendanceStatsSummary {
  readonly absent: number;
  readonly late: number;
  readonly earlyLeave: number;
  readonly classAbsence: number;
}

export interface AttendanceStatsTableProps {
  readonly filter: AttendancePeriodFilter;
  readonly onFilterChange: (filter: AttendancePeriodFilter) => void;
  readonly summary: AttendanceStatsSummary;
  readonly rows: readonly AttendanceStatsRow[];
  /** "학급 전체"|"우리 반 전체" — 문구=`${기간라벨} ${scopeLabel} (연인원)` */
  readonly scopeLabel: string;
  /** 예: "2학년 3반 학생별 출결 통계" */
  readonly tableAriaLabel: string;
}

/**
 * PC ClassRecordStatsView.tsx:24-52 을 로컬 순수 헬퍼로 이식.
 * adapters/는 mobile/에서 import할 수 없어(레이어 분리) 복제가 필요하다 — domain 신규 파일 아님.
 * '직접 설정'은 이 화면에서 제외(design §3 — 358px 가용폭에서 날짜 인풋 2개가 불안정).
 *
 * 원래 `ClassAttendanceStatsView.tsx`에 있던 헬퍼를 design §6.1에 따라 이 공용 파일로 이동한
 * 것이며 값/동작은 변경하지 않았다(ClassAttendanceStatsView와 HomeroomAttendanceStatsView가
 * 함께 재사용).
 */
export function getFilterRange(filter: AttendancePeriodFilter): {
  start: string | null;
  end: string | null;
} {
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
export const ATT_STATUSES: { key: AttendanceStatus; label: string; color: string }[] = [
  { key: 'present', label: '출석', color: 'text-green-400' },
  { key: 'absent', label: '결석', color: 'text-red-400' },
  { key: 'late', label: '지각', color: 'text-amber-400' },
  { key: 'earlyLeave', label: '조퇴', color: 'text-orange-400' },
  { key: 'classAbsence', label: '결과', color: 'text-purple-400' },
];

export const PERIOD_FILTERS: { id: AttendancePeriodFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'semester', label: '이번 학기' },
  { id: 'month', label: '이번 달' },
  { id: 'week', label: '이번 주' },
];

/**
 * 기간 칩 + 요약(연인원) + 학생별 sticky 표 — 순수 프레젠테이션 컴포넌트(design §6.1).
 * `ClassAttendanceStatsView`(교과 학급 통계)와 `HomeroomAttendanceStatsView`(담임 우리 반 통계)가
 * 이 컴포넌트를 공유한다. 데이터 집계는 각 소비자가 담당하고, 이 컴포넌트는 완성된 rows/summary만
 * 받아 그린다(비상호작용 표 — PC의 드릴인 모달은 이번 스코프 밖).
 */
export function AttendanceStatsTable({
  filter,
  onFilterChange,
  summary,
  rows,
  scopeLabel,
  tableAriaLabel,
}: AttendanceStatsTableProps) {
  const periodLabel = PERIOD_FILTERS.find((f) => f.id === filter)?.label ?? '전체';

  return (
    <>
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
              onClick={() => onFilterChange(f.id)}
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

      {/* 요약(연인원) */}
      <div className="mx-4 mb-3 rounded-xl border border-sp-border bg-sp-card p-3">
        <p className="text-tiny text-sp-muted mb-1.5">
          {periodLabel} {scopeLabel} (연인원)
        </p>
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
        aria-label={tableAriaLabel}
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
              {rows.map((row) => (
                <tr key={row.key}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-sp-card border-r border-sp-border px-2 py-2.5 text-left font-medium w-[84px]"
                  >
                    <span className="text-sp-muted">{row.number}</span>{' '}
                    <span className="text-sp-text font-medium">{row.name}</span>
                  </th>
                  {ATT_STATUSES.map((as) => (
                    <td
                      key={as.key}
                      className={`px-2 py-2.5 text-center font-medium tabular-nums min-w-[48px] ${as.color}`}
                    >
                      {row.counts[as.key] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
