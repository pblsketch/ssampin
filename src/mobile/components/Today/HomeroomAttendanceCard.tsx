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
    <div className="bg-sp-card rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-sp-highlight">groups</span>
          <span className="text-sp-text font-bold">우리 반 출결</span>
        </div>
        <button
          onClick={onCheckAttendance}
          className="text-xs text-sp-accent font-medium px-3 py-1.5 rounded-lg border border-sp-accent/30 hover:bg-sp-accent/10 transition-colors touch-target"
        >
          체크하기
        </button>
      </div>
      {checked ? (
        <div className="flex gap-4">
          <div className="text-center">
            <p className="text-green-400 font-bold text-lg">{present}</p>
            <p className="text-sp-muted text-xs">출석</p>
          </div>
          <div className="text-center">
            <p className="text-red-400 font-bold text-lg">{absent}</p>
            <p className="text-sp-muted text-xs">결석</p>
          </div>
          <div className="text-center">
            <p className="text-yellow-400 font-bold text-lg">{late}</p>
            <p className="text-sp-muted text-xs">지각</p>
          </div>
        </div>
      ) : (
        <p className="text-sp-muted text-sm">아직 출결 확인을 하지 않았습니다.</p>
      )}
    </div>
  );
}
