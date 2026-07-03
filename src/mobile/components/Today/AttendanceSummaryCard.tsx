import type { AttendanceRecord } from '@domain/entities/Attendance';

interface Props {
  record: AttendanceRecord | null;
  onCheckAttendance: () => void;
  /** 담임(우리 반) 카드에서만 "전체 N명" 줄을 노출한다. 수업 출결 카드는 전달하지 않는다(기본 0 → 미표시). */
  totalStudents?: number;
}

/**
 * 출결 요약 본문 카드 — 헤더(교시·교실 또는 "우리 반")는 상위 CollapsibleCard 가 그린다.
 * ClassAttendanceCard·HomeroomAttendanceCard 가 바이트 단위로 동일했던 본문을 공용화.
 * `totalStudents` 를 넘긴 경우(담임)만 "전체 N명" 줄이 추가된다.
 */
export function AttendanceSummaryCard({ record, onCheckAttendance, totalStudents = 0 }: Props) {
  const present = record?.students.filter((s) => s.status === 'present').length ?? 0;
  const absent = record?.students.filter((s) => s.status === 'absent').length ?? 0;
  const late = record?.students.filter((s) => s.status === 'late').length ?? 0;
  const checked = record != null;

  return (
    <>
      {totalStudents > 0 && (
        <p className="text-sp-muted text-caption mb-2">전체 {totalStudents}명</p>
      )}
      {checked ? (
        <div className="flex gap-3 items-center">
          <div className="text-center">
            <p className="text-sp-success font-bold text-lg">{present}</p>
            <p className="text-sp-muted text-caption">출석</p>
          </div>
          <div className="text-center">
            <p className="text-sp-error font-bold text-lg">{absent}</p>
            <p className="text-sp-muted text-caption">결석</p>
          </div>
          <div className="text-center">
            <p className="text-sp-warning font-bold text-lg">{late}</p>
            <p className="text-sp-muted text-caption">지각</p>
          </div>
        </div>
      ) : (
        <p className="text-sp-muted text-xs">미확인</p>
      )}
      <button
        onClick={onCheckAttendance}
        className="mt-3 w-full text-xs text-sp-accent font-medium py-2 rounded-xl bg-sp-accent/15 active:scale-[0.98] transition-all touch-target"
      >
        체크하기
      </button>
    </>
  );
}
