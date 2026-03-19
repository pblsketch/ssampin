import type { AttendanceRecord } from '@domain/entities/Attendance';

interface Props {
  todayRecord: AttendanceRecord | null;
  totalStudents: number;
  onCheckAttendance: () => void;
}

export function HomeroomAttendanceCard({ todayRecord, onCheckAttendance }: Props) {
  const present = todayRecord?.students.filter((s) => s.status === 'present').length ?? 0;
  const absent = todayRecord?.students.filter((s) => s.status === 'absent').length ?? 0;
  const late = todayRecord?.students.filter((s) => s.status === 'late').length ?? 0;
  const checked = todayRecord != null;

  return (
    <div className="glass-card p-4 h-full flex flex-col">
      <div className="flex items-center gap-1.5 mb-3">
        <span className="material-symbols-outlined text-amber-500 text-[20px]">groups</span>
        <span className="text-sp-text font-bold text-sm">우리 반</span>
      </div>
      {checked ? (
        <div className="flex gap-3 flex-1 items-center">
          <div className="text-center">
            <p className="text-green-500 font-bold text-lg">{present}</p>
            <p className="text-sp-muted text-[10px]">출석</p>
          </div>
          <div className="text-center">
            <p className="text-red-500 font-bold text-lg">{absent}</p>
            <p className="text-sp-muted text-[10px]">결석</p>
          </div>
          <div className="text-center">
            <p className="text-yellow-500 font-bold text-lg">{late}</p>
            <p className="text-sp-muted text-[10px]">지각</p>
          </div>
        </div>
      ) : (
        <p className="text-sp-muted text-xs flex-1">미확인</p>
      )}
      <button
        onClick={onCheckAttendance}
        className="mt-2 w-full text-xs text-blue-500 font-medium py-2 rounded-xl bg-blue-500/10 active:scale-[0.98] transition-all touch-target"
      >
        체크하기
      </button>
    </div>
  );
}
