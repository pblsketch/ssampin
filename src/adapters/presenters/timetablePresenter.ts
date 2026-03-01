import type { PeriodTime } from '@domain/valueObjects/PeriodTime';

/**
 * 과목별 셀 스타일 (디자인 예시 기준 컬러 매핑)
 *
 * 국어=blue, 수학=green, 영어=purple, 과학=indigo,
 * 사회=orange, 체육=red, 음악=pink, 미술=teal, 창체=cyan
 */
export interface SubjectStyle {
  readonly bg: string;
  readonly border: string;
  readonly text: string;
}

const SUBJECT_STYLE_MAP: Record<string, SubjectStyle> = {
  '국어': { bg: 'bg-blue-500/20', border: 'border-blue-500/30', text: 'text-blue-400' },
  '수학': { bg: 'bg-emerald-500/20', border: 'border-emerald-500/30', text: 'text-emerald-400' },
  '영어': { bg: 'bg-violet-500/20', border: 'border-violet-500/30', text: 'text-violet-400' },
  '과학': { bg: 'bg-indigo-500/20', border: 'border-indigo-500/30', text: 'text-indigo-400' },
  '사회': { bg: 'bg-orange-500/20', border: 'border-orange-500/30', text: 'text-orange-400' },
  '체육': { bg: 'bg-red-500/20', border: 'border-red-500/30', text: 'text-red-400' },
  '음악': { bg: 'bg-pink-500/20', border: 'border-pink-500/30', text: 'text-pink-400' },
  '미술': { bg: 'bg-teal-500/20', border: 'border-teal-500/30', text: 'text-teal-400' },
  '창체': { bg: 'bg-cyan-500/20', border: 'border-cyan-500/30', text: 'text-cyan-400' },
};

const DEFAULT_STYLE: SubjectStyle = {
  bg: 'bg-cyan-500/20',
  border: 'border-cyan-500/30',
  text: 'text-cyan-400',
};

/**
 * 과목명으로 셀 스타일을 반환한다.
 * 매핑에 없는 과목(자율, 동아리, 진로 등)은 cyan 기본 스타일.
 */
export function getSubjectStyle(subject: string): SubjectStyle {
  return SUBJECT_STYLE_MAP[subject] ?? DEFAULT_STYLE;
}

/**
 * 점심시간이 들어갈 교시 인덱스를 반환한다.
 * periodTimes 배열에서 연속 교시 간 간격이 30분 이상인 지점을 찾는다.
 * 찾지 못하면 -1 (점심 행 없음).
 *
 * @returns 0-based 인덱스. 해당 인덱스의 교시 *앞에* 점심 행이 삽입된다.
 */
export function getLunchBreakIndex(periodTimes: readonly PeriodTime[]): number {
  for (let i = 1; i < periodTimes.length; i++) {
    const prevEnd = parseTimeToMinutes(periodTimes[i - 1]!.end);
    const currStart = parseTimeToMinutes(periodTimes[i]!.start);
    if (currStart - prevEnd >= 30) {
      return i; // 이 교시 앞에 점심 행 삽입
    }
  }
  return -1;
}

/**
 * 점심시간 시작~끝 문자열을 반환한다.
 * @returns e.g. "12:00 ~ 13:00"
 */
export function formatLunchBreakTime(
  periodTimes: readonly PeriodTime[],
  lunchIndex: number,
): string {
  if (lunchIndex <= 0 || lunchIndex >= periodTimes.length) return '';
  const start = periodTimes[lunchIndex - 1]!.end;
  const end = periodTimes[lunchIndex]!.start;
  return `${start} ~ ${end}`;
}

function parseTimeToMinutes(time: string): number {
  const parts = time.split(':').map(Number);
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}
