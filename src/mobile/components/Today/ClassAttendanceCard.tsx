import type { AttendanceRecord } from '@domain/entities/Attendance';

interface Props {
  attendanceRecord: AttendanceRecord | null;
  onCheckAttendance: () => void;
}

/** 수업 출결 요약 본문 — 헤더("{N}교시 · {교실}")는 상위 CollapsibleCard 가 그린다. */
export function ClassAttendanceCard({ attendanceRecord, onCheckAttendance }: Props) {
  const present = attendanceRecord?.students.filter((s) => s.status === 'present').length ?? 0;
  const absent = attendanceRecord?.students.filter((s) => s.status === 'absent').length ?? 0;
  const late = attendanceRecord?.students.filter((s) => s.status === 'late').length ?? 0;
  const checked = attendanceRecord != null;

  return (
    <>
      {checked ? (
        <div className="flex gap-3 items-center">
          <div className="text-center">
            <p className="text-green-500 font-bold text-lg">{present}</p>
            <p className="text-sp-muted text-caption">출석</p>
          </div>
          <div className="text-center">
            <p className="text-red-500 font-bold text-lg">{absent}</p>
            <p className="text-sp-muted text-caption">결석</p>
          </div>
          <div className="text-center">
            <p className="text-yellow-500 font-bold text-lg">{late}</p>
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
