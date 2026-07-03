import type { AttendanceStatus } from '@domain/entities/Attendance';

// ============================================================
// 출석 상태 설정
// ============================================================

export const STATUS_CONFIG: Record<
  AttendanceStatus,
  { label: string; icon: string; activeColor: string }
> = {
  present: {
    label: '출석',
    icon: 'check_circle',
    activeColor: 'text-green-500 bg-green-500/10 border-green-500/40',
  },
  late: {
    label: '지각',
    icon: 'schedule',
    activeColor: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/40',
  },
  absent: {
    label: '결석',
    icon: 'cancel',
    activeColor: 'text-red-500 bg-red-500/10 border-red-500/40',
  },
  earlyLeave: {
    label: '조퇴',
    icon: 'exit_to_app',
    activeColor: 'text-orange-500 bg-orange-500/10 border-orange-500/40',
  },
  classAbsence: {
    label: '결과',
    icon: 'event_busy',
    activeColor: 'text-purple-500 bg-purple-500/10 border-purple-500/40',
  },
};

export const CATEGORY_COLORS: Record<string, string> = {
  red: 'bg-red-400',
  blue: 'bg-blue-400',
  green: 'bg-green-400',
  yellow: 'bg-yellow-400',
  purple: 'bg-purple-400',
  gray: 'bg-gray-400',
};

export interface HomeroomStudent {
  id: string;
  name: string;
  studentNumber?: number;
  isVacant?: boolean;
}

export interface SheetStudentInfo {
  number: number;
  name: string;
  grade?: number;
  classNum?: number;
  sKey: string;
  studentId: string;
  classId: string;
  period: number;
  type: 'homeroom' | 'class';
  date: string;
}
