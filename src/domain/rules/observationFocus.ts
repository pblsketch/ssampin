/**
 * 관찰 기록 응원 2·3차(ADR-137) — '관심 학생'과 반 범위.
 *
 * - 관심 학생은 **그 반에서만** 적용된다. key 형식은 '당분간 빼기'와 같다:
 *   담임반 = `Student.id`, 수업반 = `subject:${classId}:${studentKey}`.
 * - 효과는 기록 알림과 오늘 챙길 학생에만 있다: 공백 날수 문턱이 절반(내림, 최소 1일)이 되고,
 *   고르는 순서에서 먼저 온다. 바퀴·잔디·응원에는 영향이 없다.
 * - 빠진 학생은 빼기가 이긴다 — 빠져 있는 동안은 관심 효과가 없다(명단에서 먼저 빠지므로).
 * - 어떤 화면에도 관심 표시를 하지 않는다. 칸 메뉴와 설정 목록에서만 보인다.
 *
 * 알림 규칙(`recordReminderRules`)은 학생 id 하나로 관심·빼기를 대조한다. 수업반은 명단 id 가
 * `studentKey` 라 반 범위 key 와 바로 맞지 않는다 — 그래서 반 범위로 좁힌 설정을 만들어 넘긴다.
 */
import type { ReminderSettings } from '../entities/RecordReminder';

export type ReminderScope =
  | { readonly kind: 'homeroom' }
  | { readonly kind: 'subject'; readonly classId: string };

const SUBJECT_PREFIX = 'subject:';

/** 반 범위 key → 그 범위의 학생 ref. 범위가 다르면 null. */
export function refInScope(key: string, scope: ReminderScope): string | null {
  if (scope.kind === 'homeroom') return key.startsWith(SUBJECT_PREFIX) ? null : key;
  const prefix = `${SUBJECT_PREFIX}${scope.classId}:`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : null;
}

function refsInScope(keys: readonly string[], scope: ReminderScope): string[] {
  const out: string[] = [];
  for (const k of keys) {
    const ref = refInScope(k, scope);
    if (ref !== null) out.push(ref);
  }
  return out;
}

/**
 * 그 반 범위로 좁힌 알림 설정 — `focusedStudentIds`·`excludedStudentIds` 가 그 반 학생의
 * ref(담임 `Student.id`, 수업반 `studentKey`)만 담는다. 나머지 값은 그대로다.
 */
export function scopedReminderConfig<
  T extends Pick<ReminderSettings, 'focusedStudentIds' | 'excludedStudentIds'>,
>(config: T, scope: ReminderScope): T {
  return {
    ...config,
    focusedStudentIds: refsInScope(config.focusedStudentIds, scope),
    excludedStudentIds: refsInScope(config.excludedStudentIds, scope),
  };
}

export function isFocusedKey(
  config: Pick<ReminderSettings, 'focusedStudentIds'> | undefined,
  key: string,
): boolean {
  return (config?.focusedStudentIds ?? []).includes(key);
}

/** 관심 학생으로 — 이미 있으면 그대로. */
export function withFocus(list: readonly string[] | undefined, key: string): string[] {
  const base = [...(list ?? [])];
  return base.includes(key) ? base : [...base, key];
}

/** 관심 학생 풀기. */
export function withoutFocus(list: readonly string[] | undefined, key: string): string[] {
  return (list ?? []).filter((k) => k !== key);
}
