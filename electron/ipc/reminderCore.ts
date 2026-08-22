/**
 * 알림 스케줄의 **순수 로직** — Electron 을 모른다.
 *
 * 왜 떼어냈나: 기존 `reminder.ts` 는 `ipcMain`·`Notification`·`setInterval` 과 판정 로직이
 * 한 파일에 섞여 있어 **자동 테스트를 붙일 수 없었다.** 알림은 조용히 실패하는 기능이라
 * (안 울린 알림은 아무도 신고하지 않는다) 검사할 수 없는 상태가 특히 위험하다.
 *
 * ★ 이 파일은 `ipcMain`·`Notification`·`setInterval`·`fs` 를 import 하지 않는다.
 *   관례: `aiBridgeCore.ts` · `aiBridgeLiveSyncCore.ts`
 *
 * ★ 이 커밋(M4-a)에서는 **동작이 하나도 바뀌지 않는다.** 모듈 전역 변수로 흩어져 있던
 *   상태를 인자로 주고받는 형태로 옮기기만 한다. 출처별 병합·만료·정본 조회는 다음 커밋.
 */

/**
 * 알림 한 건.
 *
 * ★ `studentDedupKey` 는 **학생 전용이 아니다** — 출처별 중복 발화를 막는 열쇠다.
 *   지금은 학생 관찰 기록만 쓰지만 곧 할 일도 쓴다. 그런데도 개명하지 않는 이유는,
 *   이 이름이 preload·렌더러 훅까지 4개 층에 걸쳐 있어 개명이 곧 4층 동시 수정이고,
 *   실제 dedup 키 형식(담임반 `{sid}:{date}` · 수업반 `subject:{clsId}:{today}`)에
 *   출처 접두가 없어 **이름만 바꾸면 잘못된 안전감을 준다.** 출처는 별도 인자로 넘긴다.
 */
export interface ReminderScheduleItem {
  readonly reminderId: string;
  /** 발화 예정 시각 (Unix ms) */
  readonly fireAt: number;
  /**
   * 이 시각을 넘기면 발화하지 않는다 (Unix ms). 없으면 만료 없음.
   *
   * 구버전 렌더러가 보낸 항목에는 이 값이 없으므로 **선택 항목**이다.
   */
  readonly expiresAt?: number;
  readonly title: string;
  /** 렌더러가 이름 노출 정책을 이미 적용한 최종 문자열 */
  readonly body: string;
  /** 발화 장부 중복 방지 키 */
  readonly studentDedupKey: string;
}

/** 알림을 만들어 보내는 쪽. 칸이 출처별로 나뉘어 서로를 지우지 못한다. */
export type ReminderSource = 'record' | 'todo';

export const REMINDER_SOURCES: readonly ReminderSource[] = ['record', 'todo'];

/** 출처별 예약 칸. 한 칸을 갈아도 다른 칸은 그대로다. */
export type ReminderBuckets = Readonly<Record<ReminderSource, readonly ReminderScheduleItem[]>>;

export const EMPTY_BUCKETS: ReminderBuckets = { record: [], todo: [] };

export function isValidItem(x: unknown): x is ReminderScheduleItem {
  if (typeof x !== 'object' || x === null) return false;
  const it = x as Record<string, unknown>;
  return (
    typeof it['reminderId'] === 'string' &&
    typeof it['fireAt'] === 'number' &&
    typeof it['title'] === 'string' &&
    typeof it['body'] === 'string' &&
    typeof it['studentDedupKey'] === 'string'
  );
}

function isSource(v: unknown): v is ReminderSource {
  return v === 'record' || v === 'todo';
}

/**
 * 렌더러가 보낸 값을 { 출처, 항목들 } 로 정규화한다.
 *
 * ★ **배열이 오면 `record` 로 본다.** 구버전 렌더러는 출처 없이 배열만 보내는데,
 *   그때 쓰던 유일한 생산자가 학생 관찰 기록이었기 때문이다. 이 한 줄이 구버전 렌더러
 *   호환을 담당한다.
 */
export function normalizePayload(payload: unknown): {
  source: ReminderSource;
  items: readonly ReminderScheduleItem[];
} {
  if (Array.isArray(payload)) {
    return { source: 'record', items: payload.filter(isValidItem) };
  }
  if (typeof payload === 'object' && payload !== null) {
    const obj = payload as Record<string, unknown>;
    const source = isSource(obj['source']) ? obj['source'] : 'record';
    const raw = obj['items'];
    return { source, items: Array.isArray(raw) ? raw.filter(isValidItem) : [] };
  }
  return { source: 'record', items: [] };
}

/** 해당 출처의 칸만 통째로 갈아 끼운다. 다른 칸은 건드리지 않는다. */
export function applySchedule(
  buckets: ReminderBuckets,
  source: ReminderSource,
  items: readonly ReminderScheduleItem[],
): ReminderBuckets {
  return { ...buckets, [source]: [...items] };
}

/**
 * 예약을 비운다. **출처를 주면 그 칸만**, 안 주면 전부.
 *
 * ★ 인자 없이 부르면 전체가 지워진다 — 구버전 렌더러 호환을 위해 남겨 둔 동작이다.
 *   새로 쓰는 쪽은 반드시 출처를 지정해야 한다. 안 그러면 남의 알림까지 지운다
 *   (회귀 검사 #59 가 할일 알람 훅에서 이 실수를 막는다).
 */
export function applyClear(buckets: ReminderBuckets, source?: ReminderSource): ReminderBuckets {
  if (source === undefined) return EMPTY_BUCKETS;
  return { ...buckets, [source]: [] };
}

export interface DueItem {
  readonly source: ReminderSource;
  readonly item: ReminderScheduleItem;
}

export interface SelectDueResult {
  /** 지금 발화할 것 */
  readonly toFire: readonly DueItem[];
  /** 시간이 지나 버려진 것 */
  readonly expired: readonly DueItem[];
  /** 정본에 없거나 이미 끝난 일이라 버려진 것 */
  readonly dropped: readonly DueItem[];
  /** 발화·만료·폐기분을 뺀 나머지 */
  readonly nextBuckets: ReminderBuckets;
}

/**
 * 지금 발화할 것을 고른다.
 *
 * @param firedIds 이번 세션에 이미 발화한 reminderId 들
 * @param isStillValid 정본을 확인하는 술어. **던지면 발화하지 않는다**(안전 쪽 실패) —
 *   확인할 수 없는 상태에서 알림을 띄우는 것보다 조용한 편이 낫다.
 */
export function selectDue(
  buckets: ReminderBuckets,
  now: number,
  firedIds: ReadonlySet<string>,
  isStillValid: (item: ReminderScheduleItem, source: ReminderSource) => boolean = () => true,
): SelectDueResult {
  const toFire: DueItem[] = [];
  const expired: DueItem[] = [];
  const dropped: DueItem[] = [];
  const next: Record<ReminderSource, ReminderScheduleItem[]> = { record: [], todo: [] };

  for (const source of REMINDER_SOURCES) {
    for (const item of buckets[source]) {
      if (firedIds.has(item.reminderId)) continue; // 이미 울렸다 — 조용히 뺀다

      if (item.fireAt > now) {
        next[source].push(item); // 아직 이르다
        continue;
      }

      if (item.expiresAt !== undefined && item.expiresAt < now) {
        expired.push({ source, item }); // 절전 등으로 한참 지났다
        continue;
      }

      let valid = false;
      try {
        valid = isStillValid(item, source);
      } catch {
        valid = false; // 확인 실패 → 발화하지 않는다
      }
      if (!valid) {
        dropped.push({ source, item });
        continue;
      }

      toFire.push({ source, item });
    }
  }

  return {
    toFire,
    expired,
    dropped,
    nextBuckets: { record: next.record, todo: next.todo },
  };
}

export interface ReminderDiagnostics {
  readonly counts: Readonly<Record<ReminderSource, number>>;
  /** 가장 이른 예정 시각 (Unix ms). 없으면 null */
  readonly nextFireAt: number | null;
}

/** 진단 화면에 보여줄 값. 알림은 조용히 실패하므로 "지금 몇 건 걸려 있는지"를 볼 수 있어야 한다. */
export function diagnostics(buckets: ReminderBuckets): ReminderDiagnostics {
  let nextFireAt: number | null = null;
  for (const source of REMINDER_SOURCES) {
    for (const item of buckets[source]) {
      if (nextFireAt === null || item.fireAt < nextFireAt) nextFireAt = item.fireAt;
    }
  }
  return {
    counts: { record: buckets.record.length, todo: buckets.todo.length },
    nextFireAt,
  };
}
