import { useEffect, useState } from 'react';
import { getAttendanceStats } from '@domain/rules/studentRecordRules';
import { useMobileStudentRecordsStore } from '@mobile/stores/useMobileStudentRecordsStore';
import { StudentAttendanceHistorySheet } from './StudentAttendanceHistorySheet';

// ============================================================
// 담임 학생 누적 출결 요약 (S2 인라인 스트립 + 전체 내역 시트 트리거)
// ============================================================

/** 출결 통계 5종 표시 순서 — StudentAttendanceHistorySheet 의 상태 필터 칩과 공유한다. */
export const STAT_ORDER = ['absent', 'late', 'earlyLeave', 'resultAbsent', 'praise'] as const;
export type StatKey = (typeof STAT_ORDER)[number];

export const STAT_LABEL: Record<StatKey, string> = {
  absent: '결석',
  late: '지각',
  earlyLeave: '조퇴',
  resultAbsent: '결과',
  praise: '칭찬',
};

/** §4.4 인라인 텍스트 색 — 표준 Tailwind 색상(비-sp 토큰)이라 다크 변형을 함께 적는다. */
export const STAT_INLINE_COLOR: Record<StatKey, string> = {
  absent: 'text-red-500 dark:text-red-400',
  late: 'text-amber-500 dark:text-amber-400',
  earlyLeave: 'text-orange-500 dark:text-orange-400',
  resultAbsent: 'text-purple-500 dark:text-purple-400',
  praise: 'text-green-500 dark:text-green-400',
};

interface AttendanceHistorySummaryProps {
  studentId: string;
  studentNumber: number;
  studentName: string;
}

export function AttendanceHistorySummary({
  studentId,
  studentNumber,
  studentName,
}: AttendanceHistorySummaryProps) {
  const load = useMobileStudentRecordsStore((s) => s.load);
  const records = useMobileStudentRecordsStore((s) => s.records);
  const [showSheet, setShowSheet] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = getAttendanceStats(records, studentId);
  const total = stats.absent + stats.late + stats.earlyLeave + stats.resultAbsent + stats.praise;

  return (
    <div className="border-t border-sp-border my-4 pt-4" aria-label="누적 출결 요약">
      <p className="text-sp-muted text-xs font-medium mb-2">누적 출결 (전체 기간)</p>
      {total === 0 ? (
        <p className="text-sp-muted text-sm">이상 출결 없음 · 칭찬 기록 없음</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-sm">
            {STAT_ORDER.map((key) => (
              <span key={key} className={`${STAT_INLINE_COLOR[key]} font-medium`}>
                {STAT_LABEL[key]} <b className="tabular-nums">{stats[key]}</b>
              </span>
            ))}
          </div>
          <button
            onClick={() => setShowSheet(true)}
            className="w-full flex items-center justify-between mt-3 min-h-[44px] px-1 text-sp-accent text-sm font-medium"
          >
            <span>전체 내역 보기 ({total})</span>
            <span className="material-symbols-outlined text-lg">chevron_right</span>
          </button>
        </>
      )}
      {showSheet && (
        <StudentAttendanceHistorySheet
          studentId={studentId}
          studentNumber={studentNumber}
          studentName={studentName}
          onClose={() => setShowSheet(false)}
        />
      )}
    </div>
  );
}
