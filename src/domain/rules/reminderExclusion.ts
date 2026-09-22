/**
 * '당분간 빼기'(ADR-135) — 한 바퀴와 기록 알림 둘 다에서 학생을 잠시 빼는 규칙.
 *
 * - 누른 카드의 반에서만 빠진다. key 형식이 범위를 정한다.
 *   담임반 = `Student.id`, 수업반 = `subject:${classId}:${studentKey}`.
 * - 기간: 2주 · 한 달 · 이번 학기 끝까지. `until` 날이 지나면 저절로 다시 들어온다.
 * - 옛 `excludedStudentIds`(설정 화면이 없어 늘 비어 있던 칸)는 기간 없는 빼기로 읽는다.
 */
import type { ReminderExclusion, ReminderSettings } from '../entities/RecordReminder';
import { addDaysIso } from './schoolCalendarDays';

export type ExclusionPeriod = 'twoWeeks' | 'oneMonth' | 'termEnd';

export const EXCLUSION_PERIOD_LABELS: Record<ExclusionPeriod, string> = {
  twoWeeks: '2주',
  oneMonth: '한 달',
  termEnd: '이번 학기 끝까지',
};

export function homeroomExclusionKey(studentId: string): string {
  return studentId;
}

export function subjectExclusionKey(classId: string, studentKey: string): string {
  return `subject:${classId}:${studentKey}`;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * 고른 기간의 마지막 날(포함).
 * - 2주 = 오늘 + 13일 (오늘 포함 14일)
 * - 한 달 = 다음 달 같은 날(없으면 그달 마지막 날) − 1일
 * - 이번 학기 끝까지 = 학기 마지막 날(다음 학기 시작일 전날)
 * (날 수 계산은 조정 가능한 기본값이다. 뜻은 "고른 기간 동안 빠짐"으로 고정.)
 */
export function exclusionUntil(period: ExclusionPeriod, today: string, termEnd: string): string {
  if (period === 'twoWeeks') return addDaysIso(today, 13);
  if (period === 'termEnd') return termEnd >= today ? termEnd : today;
  const [y, m, d] = today.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return addDaysIso(today, 29);
  const nextMonthIndex = m; // m 은 1-based → 다음 달의 0-based 인덱스
  const targetYear = nextMonthIndex > 11 ? y + 1 : y;
  const targetMonth = nextMonthIndex % 12;
  const day = Math.min(d, daysInMonth(targetYear, targetMonth));
  const mm = String(targetMonth + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return addDaysIso(`${targetYear}-${mm}-${dd}`, -1);
}

/** 오늘 빠져 있는 학생 key 집합 — 옛 `excludedStudentIds` 포함. */
export function activeExclusionKeys(
  settings: Pick<ReminderSettings, 'excludedStudentIds' | 'exclusions'>,
  today: string,
): Set<string> {
  const keys = new Set<string>(settings.excludedStudentIds);
  for (const ex of settings.exclusions ?? []) {
    if (today <= ex.until) keys.add(ex.key);
  }
  return keys;
}

/** 오늘 빠져 있는 항목만(지난 것은 버린다). 설정을 저장할 때 정리용. */
export function pruneExpiredExclusions(
  list: readonly ReminderExclusion[] | undefined,
  today: string,
): ReminderExclusion[] {
  return (list ?? []).filter((ex) => today <= ex.until);
}

/** 빼기 추가 — 같은 key 가 있으면 새 기간으로 바꾼다. 지난 항목은 함께 정리한다. */
export function withExclusion(
  list: readonly ReminderExclusion[] | undefined,
  key: string,
  until: string,
  today: string,
): ReminderExclusion[] {
  return [...pruneExpiredExclusions(list, today).filter((ex) => ex.key !== key), { key, until }];
}

/**
 * 설정 화면 [저장] 직전 — 빼기 목록과 옛 `excludedStudentIds` 는 카드·위젯 창·설정 화면의
 * [다시 넣기]에서 **누르는 즉시** 저장되는 값이다. 화면을 연 뒤 바뀐 목록을 초안이 덮어쓰지 않게
 * 지금 저장된 값(`latest`)을 쓴다. 저장된 값이 없으면 초안 그대로.
 */
export function withLatestExclusions<
  T extends Pick<ReminderSettings, 'exclusions' | 'excludedStudentIds'>,
>(draft: T, latest: Pick<ReminderSettings, 'exclusions' | 'excludedStudentIds'> | undefined): T {
  if (latest === undefined) return draft;
  return {
    ...draft,
    exclusions: latest.exclusions ?? [],
    excludedStudentIds: latest.excludedStudentIds,
  };
}

/** 다시 넣기 — 그 key 를 목록에서 뺀다. */
export function withoutExclusion(
  list: readonly ReminderExclusion[] | undefined,
  key: string,
  today: string,
): ReminderExclusion[] {
  return pruneExpiredExclusions(list, today).filter((ex) => ex.key !== key);
}
