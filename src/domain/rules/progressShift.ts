import type { ProgressEntry } from '@domain/entities/CurriculumProgress';

/**
 * 진도 밀기 — "이 차시부터 뒤로 한 칸씩" (순수 도메인 로직)
 *
 * 한 시간을 못 나가면 그 뒤가 통째로 밀린다. 3차시를 못 했으면 4차시도, 5차시도, 학기
 * 끝까지 하나씩 밀린다. 이것을 끌어다 놓기로 하면 스무 번을 끌어야 하고, **뒤에서부터
 * 끌지 않으면 자리가 겹친다.** 그래서 한 번에 미는 길이 따로 있어야 한다.
 *
 * ## '예정'만 민다
 *
 * 이미 '완료'한 수업의 날짜를 자동으로 바꾸면 기록이 거짓말이 된다 — 그날 그 수업을 한
 * 것은 사실이기 때문이다. '미실시'도 마찬가지로 "그날 못 했다"는 사실의 기록이라 옮기지
 * 않는다. 한 건씩 의도적으로 고치는 길(끌어다 놓기·편집 창)은 그대로 열려 있다.
 *
 * ## 완료·미실시가 차지한 자리는 건너뛴다
 *
 * 밀린 '예정'이 이미 수업한 자리에 겹쳐 앉으면 한 칸에 두 건이 쌓인다. 옮기지 않기로 한
 * 항목이 앉아 있는 자리는 후보에서 빼고 그 다음 수업일로 보낸다.
 *
 * ## 학기 밖으로 나가는 건 옮기지 않고 세어서 알려 준다
 *
 * 학기 마지막 수업일 뒤에는 놓을 자리가 없다. 임의로 날짜를 만들어 붙이면 시간표에 없는
 * 날에 진도가 생겨 캘린더에서 보이지 않는다. 조용히 버리지도 않는다 — 몇 건이 밀려나는지
 * 세어서 화면이 먼저 보여 주고 확인을 받는다.
 *
 * ## 겹치는 자리를 미리 세어서 알려 준다
 *
 * 학기 끝까지 계획이 꽉 찬 반에서 한 칸을 밀면 **마지막 자리에 두 건이 겹친다** — 뒤로
 * 밀린 차시가 갈 곳이 없어 제자리에 남고, 그 앞 차시가 그 위로 올라오기 때문이다.
 * 계획 일괄 생성(`PlannedBulkFillModal`)이 남은 수업일을 모두 채우므로 이 상황은 드물지 않다.
 *
 * 겹친다고 해서 미는 것을 막지는 않는다. 막으면 연쇄로 아무것도 못 밀게 되어(앞 차시도
 * 갈 자리가 막힌 차시 위로 가야 하므로) **가장 흔한 경우에 기능이 통째로 무용해진다.**
 * 대신 어느 자리에 몇 건이 겹치는지 세어서 화면이 먼저 보여 준다 — 겹친 칸은 캘린더에
 * `+N` 으로 드러나므로 선생님이 그 자리에서 합치거나 지우면 된다.
 *
 * Clean Architecture: 외부 의존성 0 — 엔티티 타입과 호출자가 넘긴 수업일 색인만 쓴다.
 */

/** 학기의 한 수업 자리 */
export interface LessonSlot {
  readonly date: string;
  readonly period: number;
}

/** 옮기지 못한 이유 */
export type ProgressShiftBlockedReason =
  /** 학기 마지막 수업일을 넘어간다 */
  | 'pastTermEnd'
  /** 지금 있는 자리가 학기 수업일 색인에 없다 (시간표가 바뀐 뒤 남은 기록 등) */
  | 'noSlot';

/** 미리보기 한 줄 */
export interface ProgressShiftRow {
  readonly entry: ProgressEntry;
  readonly from: LessonSlot;
  /** 옮겨 갈 자리. 옮기지 못하면 `null` 이고 `blocked` 에 이유가 담긴다. */
  readonly to: LessonSlot | null;
  readonly blocked?: ProgressShiftBlockedReason;
}

export interface ProgressShiftPlan {
  /** 미리보기용 — 날짜·교시 순으로 정렬돼 있다. 옮기지 못하는 줄도 포함한다. */
  readonly rows: readonly ProgressShiftRow[];
  /** 실제로 저장할 값들. 옮기지 못하는 것은 빠져 있다. */
  readonly moved: readonly ProgressEntry[];
  /** 학기 밖으로 밀려나 옮기지 못하는 건수 */
  readonly overflowCount: number;
  /**
   * 옮길 것 중 **다른 반에 같은 단원·차시 기록이 있는** 건수.
   *
   * 여러 반 동시 기록(팬아웃, ADR-044)의 사본에는 표식이 없어 내용이 같은지로 짐작만 한다.
   * 판정에는 쓰지 않고, 화면이 "밀기는 이 반만 밀린다"를 미리 알리는 데만 쓴다 — 반마다
   * 시간표가 달라 사본을 같이 밀 수는 없고, 말없이 이 반만 밀면 기대와 어긋나기 때문이다.
   */
  readonly otherClassCopyCount: number;
  /**
   * 민 뒤에 이 반의 진도가 2건 이상 겹치게 되는 자리들.
   *
   * 밀기를 막지는 않지만 숨기지도 않는다(위 주석 참조). 이미 겹쳐 있던 자리도 잡히므로,
   * 화면은 "이번에 새로 겹친다"가 아니라 "민 뒤 상태가 이렇다"로 읽어 주면 된다.
   */
  readonly collisions: readonly LessonSlot[];
}

export interface ProgressShiftInput {
  /** 전체 진도 기록 (반 스코프 아님 — 이 함수가 걸러 낸다) */
  readonly entries: readonly ProgressEntry[];
  readonly classId: string;
  /** 이 자리부터 **포함해서** 뒤로 민다 */
  readonly from: LessonSlot;
  /**
   * 이 반의 학기 수업일 — 날짜순.
   *
   * PC/모바일 모두 `useLessonCountEstimate` 의 `view.lessonDays` 를 그대로 넘긴다.
   * 공휴일·학사일정으로 빠진 날은 이미 걸러져 있으므로 여기서 다시 판단하지 않는다.
   * **두 기기가 같은 목록을 써야 같은 자리로 민다.**
   */
  readonly lessonDays: readonly { readonly date: string; readonly periods: readonly number[] }[];
  /** 몇 칸 밀지. 기본 1. */
  readonly steps?: number;
}

/** date+period 를 정렬·비교용 키로 */
function slotKey(slot: LessonSlot): string {
  return `${slot.date}#${String(slot.period).padStart(2, '0')}`;
}

/**
 * 수업일 목록을 날짜·교시 순의 평평한 자리 목록으로 편다.
 *
 * 들어온 목록이 이미 날짜순이라도 여기서 다시 정렬한다 — 한 칸씩 미는 계산은 순서가
 * 전부라, 위쪽 정렬이 언젠가 바뀌면 조용히 엉뚱한 자리로 민다.
 */
function flattenSlots(
  lessonDays: readonly { readonly date: string; readonly periods: readonly number[] }[],
): LessonSlot[] {
  const slots: LessonSlot[] = [];
  for (const day of lessonDays) {
    for (const period of day.periods) slots.push({ date: day.date, period });
  }
  slots.sort((a, b) => slotKey(a).localeCompare(slotKey(b)));
  return slots;
}

/**
 * "이 자리부터 뒤로 `steps` 칸씩" 밀기를 계산한다.
 *
 * 아무것도 옮길 것이 없으면 `rows` 가 빈 배열이다 — 호출부는 창을 열지 않으면 된다.
 */
export function planProgressShift(input: ProgressShiftInput): ProgressShiftPlan {
  const steps = input.steps ?? 1;
  const anchorKey = slotKey(input.from);

  const ofClass = input.entries.filter((e) => e.classId === input.classId);

  // 앵커 자리부터(포함) 뒤에 있는 것만 대상. 그중 '예정'만 옮긴다.
  const atOrAfter = ofClass.filter((e) => slotKey(e) >= anchorKey);
  const moving = atOrAfter
    .filter((e) => e.status === 'planned')
    .sort((a, b) => slotKey(a).localeCompare(slotKey(b)));

  if (moving.length === 0 || steps <= 0) {
    return { rows: [], moved: [], overflowCount: 0, otherClassCopyCount: 0, collisions: [] };
  }

  // 옮기지 않기로 한 항목(완료·미실시)이 앉아 있는 자리는 후보에서 뺀다.
  const held = new Set(atOrAfter.filter((e) => e.status !== 'planned').map((e) => slotKey(e)));

  const allSlots = flattenSlots(input.lessonDays);
  const lessonSlotKeys = new Set(allSlots.map(slotKey));
  const available = allSlots.filter((s) => slotKey(s) >= anchorKey && !held.has(slotKey(s)));
  const indexOfSlot = new Map(available.map((s, i) => [slotKey(s), i]));

  const rows: ProgressShiftRow[] = moving.map((entry) => {
    const from: LessonSlot = { date: entry.date, period: entry.period };
    const key = slotKey(entry);
    let current = indexOfSlot.get(key);
    let stepsFromHere = steps;
    if (current === undefined) {
      if (!lessonSlotKeys.has(key)) {
        // 시간표가 바뀌어 지금 자리가 학기 수업일에 없다 — 어디로 밀지 정할 근거가 없다.
        return { entry, from, to: null, blocked: 'noSlot' };
      }
      // 완료·미실시가 차지한 자리에 겹쳐 있는 '예정'이다. 자기 자리는 held 라 색인에 없지만
      // 시간표상 실제 수업 자리이므로 옮길 근거는 있다 — 'noSlot'("수업일 아님")으로 보내면
      // 원인과 문구가 어긋난다. 뒤쪽 첫 빈 자리를 "한 칸 민 자리"로 삼아 이어서 센다.
      const firstAfter = available.findIndex((s) => slotKey(s) > key);
      if (firstAfter === -1) {
        return { entry, from, to: null, blocked: 'pastTermEnd' };
      }
      current = firstAfter;
      stepsFromHere = steps - 1;
    }
    const target = available[current + stepsFromHere];
    if (!target) {
      return { entry, from, to: null, blocked: 'pastTermEnd' };
    }
    return { entry, from, to: target };
  });

  const moved = rows
    .filter((r) => r.to !== null)
    .map((r) => ({ ...r.entry, date: r.to!.date, period: r.to!.period }));

  // 민 뒤 이 반의 최종 자리 = 옮긴 것들 + 손대지 않은 나머지
  const movedIds = new Set(moved.map((e) => e.id));
  const finalSlots = [...moved, ...ofClass.filter((e) => !movedIds.has(e.id))];

  const perSlot = new Map<string, LessonSlot>();
  const collisions: LessonSlot[] = [];
  for (const e of finalSlots) {
    const key = slotKey(e);
    if (perSlot.has(key)) {
      // 3건 이상이어도 자리는 한 번만 보고한다
      if (!collisions.some((c) => slotKey(c) === key)) collisions.push(perSlot.get(key)!);
      continue;
    }
    perSlot.set(key, { date: e.date, period: e.period });
  }
  collisions.sort((a, b) => slotKey(a).localeCompare(slotKey(b)));

  // 다른 반에 같은 단원·차시가 있는지 — 팬아웃 사본 짐작용(위 otherClassCopyCount 주석 참조).
  // 단원·차시가 둘 다 빈 항목은 아무하고나 겹치므로 세지 않는다.
  const contentKey = (e: ProgressEntry): string => `${e.unit}#${e.lesson}`;
  const otherClassContents = new Set(
    input.entries
      .filter((e) => e.classId !== input.classId && (e.unit !== '' || e.lesson !== ''))
      .map(contentKey),
  );
  const otherClassCopyCount = moved.filter(
    (e) => (e.unit !== '' || e.lesson !== '') && otherClassContents.has(contentKey(e)),
  ).length;

  return {
    rows,
    moved,
    overflowCount: rows.filter((r) => r.to === null).length,
    otherClassCopyCount,
    collisions,
  };
}
