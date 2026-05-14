import type { AttendanceRecord } from '@domain/entities/Attendance';

interface Props {
  todayRecord: AttendanceRecord | null;
  totalStudents: number;
  onCheckAttendance: () => void;
}

/** 담임 출결 요약 본문 — 헤더("우리 반")는 상위 CollapsibleCard 가 그린다. */
export function HomeroomAttendanceCard({ todayRecord, totalStudents, onCheckAttendance }: Props) {
  const present = todayRecord?.students.filter((s) => s.status === 'present').length ?? 0;
  const absent = todayRecord?.students.filter((s) => s.status === 'absent').length ?? 0;
  const late = todayRecord?.students.filter((s) => s.status === 'late').length ?? 0;
  const checked = todayRecord != null;

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
