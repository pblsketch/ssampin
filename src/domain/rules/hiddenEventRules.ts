import type { SchoolEvent } from '../entities/SchoolEvent';

/**
 * 숨긴 일정 되돌리기 규칙.
 *
 * 왜 필요한가 (2026-08-21) — 쌤핀에는 일정을 숨기는 길이 둘 있는데(학사일정 "삭제", 중복 정리)
 * **다시 꺼내는 길이 없었다.** 자료는 남아 있는데 화면에서 되돌릴 수 없으니, 선생님 입장에선
 * 사실상 지워진 것과 같았다. 그래서 중복 정리 안내에서 "언제든 되돌릴 수 있다"는 말을 빼야 했다.
 * 이 규칙은 그 약속을 실제로 지킬 수 있게 하는 자리다.
 */

/** 왜 숨겨졌는지 — 화면 문구용. 옛 데이터에는 이유가 없어 `unknown` 이 된다. */
export type HiddenReason = 'manual' | 'duplicate' | 'unknown';

export interface HiddenEventItem {
  readonly event: SchoolEvent;
  readonly reason: HiddenReason;
}

/**
 * 되돌릴 수 있는 숨긴 일정만 고른다.
 *
 * 외부 구독 캘린더(`ext:`)는 제외한다 — 쌤핀이 그 일정을 고쳐 저장할 수 없어서
 * 되돌리기 버튼을 눌러도 아무 일도 일어나지 않는다. 못 하는 걸 보여 주지 않는다.
 */
export function getRestorableHiddenEvents(
  events: readonly SchoolEvent[],
): readonly HiddenEventItem[] {
  return events
    .filter((e) => e.isHidden && !e.id.startsWith('ext:'))
    .map((e): HiddenEventItem => ({ event: e, reason: e.hiddenReason ?? 'unknown' }))
    .sort(compareForDisplay);
}

/**
 * 최근에 치운 것부터, 숨긴 시각을 모르면 일정 날짜가 늦은 것부터.
 *
 * 방금 정리한 것을 "아차" 싶어 되돌리는 경우가 가장 흔하다고 보고 맨 위에 둔다.
 */
function compareForDisplay(a: HiddenEventItem, b: HiddenEventItem): number {
  const ah = a.event.hiddenAt ?? '';
  const bh = b.event.hiddenAt ?? '';
  if (ah !== bh) return bh.localeCompare(ah);
  return b.event.date.localeCompare(a.event.date);
}

/** 이유별 개수 — 화면 상단 요약용. */
export function countByReason(
  items: readonly HiddenEventItem[],
): Readonly<Record<HiddenReason, number>> {
  const counts: Record<HiddenReason, number> = { manual: 0, duplicate: 0, unknown: 0 };
  for (const item of items) counts[item.reason] += 1;
  return counts;
}

/**
 * 되돌리면 다시 겹쳐 보이게 되는가.
 *
 * 중복이라 접은 사본을 되돌리면 달력에 그 줄이 다시 두 개로 보인다. 되돌리기 자체는 막지 않지만
 * (선생님 판단이 우선이다) **모르고 누르는 일은 없게** 화면에서 미리 알려 주려고 판정한다.
 */
export function willReappearAsDuplicate(item: HiddenEventItem): boolean {
  return item.reason === 'duplicate';
}
