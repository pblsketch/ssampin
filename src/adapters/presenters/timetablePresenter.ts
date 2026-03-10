import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import type { SubjectColorMap } from '@domain/valueObjects/SubjectColor';
import { resolvePreset } from '@domain/valueObjects/SubjectColor';

/**
 * 과목별 셀 스타일 (bg / border / text Tailwind 클래스)
 */
export interface SubjectStyle {
  readonly bg: string;
  readonly border: string;
  readonly text: string;
}

/**
 * 과목명 + 사용자 색상 설정으로 셀 스타일을 반환한다.
 * 매핑에 없는 과목(자율, 동아리, 진로 등)은 cyan 기본 스타일.
 */
export function getSubjectStyle(
  subject: string,
  userColors?: SubjectColorMap,
): SubjectStyle {
  const p = resolvePreset(subject, userColors);
  return { bg: p.tw.bg, border: p.tw.border, text: p.tw.text };
}

/** 도트 색상 (대시보드, ClassList 등에서 사용) */
export function getSubjectDotColor(
  subject: string,
  userColors?: SubjectColorMap,
): string {
  return resolvePreset(subject, userColors).tw.bgSolid;
}

/** 텍스트 색상 (대시보드 시간표용) */
export function getSubjectTextColor(
  subject: string,
  userColors?: SubjectColorMap,
): string {
  return resolvePreset(subject, userColors).tw.text;
}

/** 위젯용 bg + textLight 합친 클래스 문자열 */
export function getSubjectWidgetStyle(
  subject: string,
  userColors?: SubjectColorMap,
): string {
  const p = resolvePreset(subject, userColors);
  return `${p.tw.bg} ${p.tw.textLight}`;
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
