import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import type { SubjectColorMap } from '@domain/valueObjects/SubjectColor';
import { resolvePreset, resolveClassroomPreset } from '@domain/valueObjects/SubjectColor';

/**
 * 과목별 셀 스타일 (bg / border / text Tailwind 클래스)
 */
export interface SubjectStyle {
  readonly bg: string;
  readonly border: string;
  readonly text: string;
}

/**
 * 현재 테마가 라이트 모드인지 판별한다.
 * CSS 변수 `--sp-bg`의 밝기를 기준으로 판정.
 */
export function isLightTheme(): boolean {
  const bg = getComputedStyle(document.documentElement)
    .getPropertyValue('--sp-bg').trim();
  if (!bg) return false;
  const hex = bg.replace('#', '');
  if (hex.length !== 6) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (r * 299 + g * 587 + b * 114) / 1000;
  return luminance > 150;
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
  const light = isLightTheme();
  return { bg: p.tw.bg, border: p.tw.border, text: light ? p.tw.textOnLight : p.tw.text };
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
  const p = resolvePreset(subject, userColors);
  return isLightTheme() ? p.tw.textOnLight : p.tw.text;
}

/** 위젯용 bg + textLight 합친 클래스 문자열 */
export function getSubjectWidgetStyle(
  subject: string,
  userColors?: SubjectColorMap,
): string {
  const p = resolvePreset(subject, userColors);
  return `${p.tw.bg} ${isLightTheme() ? p.tw.textOnLight : p.tw.textLight}`;
}

/**
 * 색상 모드에 따라 적절한 셀 스타일을 반환한다.
 * - 'subject': 과목 기반 색상 (기존 동작)
 * - 'classroom': 학반 기반 색상
 */
export function getCellStyle(
  subject: string,
  classroom: string | undefined,
  colorBy: 'subject' | 'classroom',
  userSubjectColors?: SubjectColorMap,
  userClassroomColors?: SubjectColorMap,
): SubjectStyle {
  const light = isLightTheme();
  if (colorBy === 'classroom' && classroom) {
    const p = resolveClassroomPreset(classroom, userClassroomColors);
    return { bg: p.tw.bg, border: p.tw.border, text: light ? p.tw.textOnLight : p.tw.text };
  }
  return getSubjectStyle(subject, userSubjectColors);
}

/**
 * 색상 모드에 따른 도트 색상
 */
export function getCellDotColor(
  subject: string,
  classroom: string | undefined,
  colorBy: 'subject' | 'classroom',
  userSubjectColors?: SubjectColorMap,
  userClassroomColors?: SubjectColorMap,
): string {
  if (colorBy === 'classroom' && classroom) {
    return resolveClassroomPreset(classroom, userClassroomColors).tw.bgSolid;
  }
  return getSubjectDotColor(subject, userSubjectColors);
}

/**
 * 색상 모드에 따른 위젯 스타일
 */
export function getCellWidgetStyle(
  subject: string,
  classroom: string | undefined,
  colorBy: 'subject' | 'classroom',
  userSubjectColors?: SubjectColorMap,
  userClassroomColors?: SubjectColorMap,
): string {
  const light = isLightTheme();
  if (colorBy === 'classroom' && classroom) {
    const p = resolveClassroomPreset(classroom, userClassroomColors);
    return `${p.tw.bg} ${light ? p.tw.textOnLight : p.tw.textLight}`;
  }
  return getSubjectWidgetStyle(subject, userSubjectColors);
}

/**
 * 점심시간이 들어갈 교시 인덱스를 반환한다.
 *
 * lunchStart/lunchEnd가 설정되어 있으면, 해당 시간대와 겹치는 교시 간 간격을 찾는다.
 * 미설정 시 연속 교시 간 간격이 30분 이상인 첫 번째 지점을 사용한다 (하위 호환).
 *
 * @returns 0-based 인덱스. 해당 인덱스의 교시 *앞에* 점심 행이 삽입된다.
 */
export function getLunchBreakIndex(
  periodTimes: readonly PeriodTime[],
  lunchStart?: string,
  lunchEnd?: string,
): number {
  if (lunchStart && lunchEnd) {
    const lStart = parseTimeToMinutes(lunchStart);
    const lEnd = parseTimeToMinutes(lunchEnd);
    for (let i = 1; i < periodTimes.length; i++) {
      const prevEnd = parseTimeToMinutes(periodTimes[i - 1]!.end);
      const currStart = parseTimeToMinutes(periodTimes[i]!.start);
      // 교시 간 간격이 점심시간 설정과 겹치는지 확인
      if (currStart > prevEnd && prevEnd >= lStart && currStart <= lEnd) {
        return i;
      }
    }
    return -1;
  }

  // 하위 호환: 설정 없으면 기존 30분 간격 기반 자동 감지
  for (let i = 1; i < periodTimes.length; i++) {
    const prevEnd = parseTimeToMinutes(periodTimes[i - 1]!.end);
    const currStart = parseTimeToMinutes(periodTimes[i]!.start);
    if (currStart - prevEnd >= 30) {
      return i;
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
