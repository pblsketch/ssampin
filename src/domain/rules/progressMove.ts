import type { ProgressEntry } from '@domain/entities/CurriculumProgress';
import type { WeeklyProgressCell } from './progressCalendarRules';

/**
 * 진도 캘린더 — 진도를 다른 칸으로 끌어다 옮기기 (순수 도메인 로직)
 *
 * 진도는 계획대로 나가지 않는다. 행사로 한 시간 못 하거나 순서를 바꾸는 일이 잦아,
 * 등록해 둔 차시를 **다른 날짜·교시로 옮길** 수 있어야 한다.
 *
 * ## 왜 아무 칸에나 놓게 두면 안 되는가
 *
 * 진도 기록의 자리는 `classId + date + period` 세 개로 정해지고, 캘린더는 그 셋이 모두
 * 맞는 칸에만 기록을 그린다(`buildWeeklyProgressGrid`). 그래서 1-7 반의 기록을 1-8 반
 * 칸에 놓으면 **classId 는 1-7 그대로인 채 date/period 만 1-8 자리가 된다.** 그 시간에
 * 1-7 수업이 없으면 그 기록은 캘린더 어느 칸에도 나타나지 않는다.
 *
 * 데이터가 지워지는 것은 아니고 반별 진도 탭에는 그대로 남지만, 캘린더에서 사라지면
 * 선생님 입장에서는 잃어버린 것과 같다. 그래서 **같은 반 수업이 있는 칸으로만** 놓을 수
 * 있게 판정을 도메인에 둔다 — 화면이 점선을 어디에 그릴지도 이 함수 하나가 정한다.
 *
 * ## 왜 항목이 아니라 칸 단위인가
 *
 * 손짓이 "이 카드를 저 카드로"이기 때문이다. 칸에 진도가 여러 건이면 화면에는 대표 1건과
 * `+N` 만 보이는데, 항목 단위로 옮기면 `+2` 가 붙은 카드를 끌었을 때 눈에 보이는 한 건만
 * 움직이고 나머지는 원래 자리에 남는다. 보이는 것과 결과가 어긋난다.
 *
 * Clean Architecture: 외부 의존성 0 — 엔티티와 같은 레이어의 타입만 사용한다.
 */

/** 놓을 수 있는지 판정한 결과. 막을 때는 화면에 보여 줄 이유를 함께 준다. */
export type ProgressDropCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

/** 두 칸이 같은 자리인가 (날짜 + 교시) */
function isSameSlot(a: WeeklyProgressCell, b: WeeklyProgressCell): boolean {
  return a.date === b.date && a.period === b.period;
}

/**
 * 이 칸의 진도를 저 칸으로 옮겨도 되는가.
 *
 * 막는 경우마다 이유가 다르므로 문구도 나눈다.
 *  1. 출발 칸에 진도가 없다 — 옮길 것이 없다.
 *  2. 놓을 칸이 공강·자습이거나 반 매칭이 안 됐다 — 애초에 수업이 없는 자리다.
 *  3. 놓을 칸이 다른 반 수업이다 — 놓으면 캘린더에서 사라진다(위 주석 참조).
 *  4. 원래 있던 자리다 — 바뀌는 것이 없다. 화면이 출발 칸을 점선으로 밝히지 않도록 여기서 막는다.
 */
export function canDropProgressCell(
  source: WeeklyProgressCell,
  target: WeeklyProgressCell,
): ProgressDropCheck {
  if (source.entries.length === 0) {
    return { ok: false, reason: '옮길 진도가 없어요' };
  }
  if (!target.matchedClass) {
    return { ok: false, reason: '수업이 없는 칸에는 놓을 수 없어요' };
  }
  if (target.matchedClass.id !== source.entries[0]!.classId) {
    return {
      ok: false,
      reason: `같은 반 수업 칸에만 놓을 수 있어요 (${target.matchedClass.name} 칸이에요)`,
    };
  }
  if (isSameSlot(source, target)) {
    return { ok: false, reason: '원래 자리예요' };
  }
  return { ok: true };
}

/** 옮기기 결과 — 화면은 이 두 목록을 그대로 저장하면 된다. */
export interface ProgressMovePlan {
  /** 끌어다 놓은 칸의 진도들. 날짜·교시가 놓은 칸으로 바뀌어 있다. */
  readonly moved: readonly ProgressEntry[];
  /**
   * 놓은 칸에 이미 있던 진도들. **지우지 않고 출발 칸으로 보낸다(자리 바꿈).**
   *
   * 덮어쓰기로 만들면 선생님이 적어 둔 차시가 끌기 한 번에 사라진다. 두 차시의 순서를
   * 맞바꾸는 것은 진도 조정에서 흔한 일이므로, 자리 바꿈이 기대에도 맞고 잃는 것도 없다.
   * 놓은 칸이 비어 있었으면 빈 배열이다.
   */
  readonly swapped: readonly ProgressEntry[];
}

/**
 * 끌어다 놓기를 실제 저장할 값으로 바꾼다.
 *
 * 놓을 수 없으면 `null` — 호출부는 아무 것도 하지 않으면 된다.
 * (막는 이유를 화면에 보여 주려면 `canDropProgressCell` 을 먼저 부른다.)
 */
export function planProgressMove(
  source: WeeklyProgressCell,
  target: WeeklyProgressCell,
): ProgressMovePlan | null {
  if (!canDropProgressCell(source, target).ok) return null;

  const movedIds = new Set(source.entries.map((e) => e.id));

  return {
    moved: source.entries.map((e) => ({ ...e, date: target.date, period: target.period })),
    // 같은 항목이 양쪽에 잡히는 일은 없어야 하지만, 잡히면 날짜가 두 번 덮여 자리가 어긋난다.
    swapped: target.entries
      .filter((e) => !movedIds.has(e.id))
      .map((e) => ({ ...e, date: source.date, period: source.period })),
  };
}
