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
 * ★ 여기에는 **파일·타이머·토스트가 없다.** 스냅샷 파일 읽기/쓰기는 `reminderState.ts`,
 *   IPC 배선·발화는 `reminder.ts` 가 맡는다. 정본 확인(`isStillValid`)도 껍데기가 주입한다 —
 *   이 모듈은 "무엇을 울릴지"만 판단한다.
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

/**
 * 두 예약 목록이 **내용까지 같은가.**
 *
 * 왜 필요한가: 화면 쪽 저장소는 같은 자료를 다시 읽을 때도 **새 배열·새 객체를 만든다.**
 * 그래서 "바뀌었나"를 참조로 판단하면 아무것도 안 바뀐 순간에도 바뀐 것처럼 보이고,
 * 그때마다 예약을 다시 보내면 **로그와 파일 쓰기가 끝없이 쌓인다**(실제로 그렇게 됐다).
 * 내용으로 비교해서 같으면 아무 일도 하지 않는다.
 */
export function sameItems(
  a: readonly ReminderScheduleItem[],
  b: readonly ReminderScheduleItem[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as ReminderScheduleItem;
    const y = b[i] as ReminderScheduleItem;
    if (
      x.reminderId !== y.reminderId ||
      x.fireAt !== y.fireAt ||
      x.expiresAt !== y.expiresAt ||
      x.title !== y.title ||
      x.body !== y.body ||
      x.studentDedupKey !== y.studentDedupKey
    ) {
      return false;
    }
  }
  return true;
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

/**
 * 발화 장부 한 줄. 언제 울렸는지를 함께 적어 **오래된 줄을 정리할 수 있게** 한다.
 *
 * 이름만 모아 두면 파일이 영원히 자란다. 실제로 이 앱은 예전에 "지우는 규칙이 없는 목록"이
 * 조용히 불어나 파일을 무겁게 만든 적이 있다.
 */
export interface FiredEntry {
  readonly reminderId: string;
  /** 발화 시각 (Unix ms) */
  readonly firedAt: number;
  /**
   * 어느 칸에서 울린 것인지.
   *
   * ★ 이 값이 필요한 이유: **파일에 남기는 것은 `todo` 것만**이다. 학생 관찰 기록 알림은
   *   출시된 동작을 한 글자도 바꾸지 않기로 했고, 그쪽은 렌더러가 자기 장부를 이미 들고
   *   있다. 그런데 발화 이력은 두 칸이 한 목록을 같이 쓰므로, 저장할 때 골라내려면
   *   줄마다 출처가 적혀 있어야 한다. `reminderId` 앞글자로 가르는 방법도 있지만
   *   그건 식별자 형식에 기대는 약한 약속이라 쓰지 않는다.
   */
  readonly source: ReminderSource;
}

/** 발화 장부 기본 보관 기간 — 30일. 예약 지평(14일)의 두 배라 재발화를 막기에 충분하다. */
export const FIRED_LEDGER_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** 발화 장부 기본 상한 — 최근 500건. 기간 정리가 실패해도 파일이 무한정 자라지 않게 한다. */
export const FIRED_LEDGER_CAP = 500;

export function isFiredEntry(x: unknown): x is FiredEntry {
  if (typeof x !== 'object' || x === null) return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e['reminderId'] === 'string' && typeof e['firedAt'] === 'number' && isSource(e['source'])
  );
}

/**
 * 발화 장부를 정리한다 — 오래된 줄을 버리고, 그래도 많으면 **최근 것부터** 남긴다.
 *
 * 같은 `reminderId` 가 여러 줄이면 마지막 발화만 남긴다(재시작 직후 중복 기록 방지).
 */
export function pruneFiredLedger(
  entries: readonly FiredEntry[],
  now: number,
  maxAgeMs: number = FIRED_LEDGER_MAX_AGE_MS,
  cap: number = FIRED_LEDGER_CAP,
): readonly FiredEntry[] {
  const latest = new Map<string, FiredEntry>();
  for (const e of entries) {
    if (!isFiredEntry(e)) continue;
    if (now - e.firedAt > maxAgeMs) continue;
    const prev = latest.get(e.reminderId);
    if (prev === undefined || e.firedAt > prev.firedAt) latest.set(e.reminderId, e);
  }
  const sorted = [...latest.values()].sort((a, b) => a.firedAt - b.firedAt);
  return sorted.length > cap ? sorted.slice(sorted.length - cap) : sorted;
}

/**
 * 진단 화면·로그가 볼 값 중 **예약 칸 바깥**에서 오는 것들.
 *
 * ★ `restoredFromSnapshotAt`·`snapshotItemCount` 는 **렌더러 push 로 덮이지 않는다.**
 *   왜 굳이 그렇게 두는가: 콜드 부팅이 잘 됐는지 확인하려고 설정 화면을 여는 순간
 *   메인 렌더러가 살아나 `'todo'` 칸을 자기 계산으로 덮어쓴다 — **확인하는 행위가 증거를
 *   지워 버린다.** 이 두 값은 그 덮어쓰기를 견디고 "부팅 때 몇 건을 되살렸는지"를 남긴다.
 */
export interface ReminderObservations {
  /** 출처별 마지막 push 시각 (Unix ms) */
  readonly lastPushedAt: Readonly<Partial<Record<ReminderSource, number>>>;
  /** 부팅 시 스냅샷 복원 시각 (Unix ms). 복원한 적 없으면 null */
  readonly restoredFromSnapshotAt: number | null;
  /** 부팅 시 스냅샷에서 되살린 건수 */
  readonly snapshotItemCount: number;
}

export const EMPTY_OBSERVATIONS: ReminderObservations = {
  lastPushedAt: {},
  restoredFromSnapshotAt: null,
  snapshotItemCount: 0,
};

export interface ReminderDiagnostics extends ReminderObservations {
  readonly counts: Readonly<Record<ReminderSource, number>>;
  /** 가장 이른 예정 시각 (Unix ms). 없으면 null */
  readonly nextFireAt: number | null;
  /** 지금부터 가장 이른 발화까지 남은 시간(ms). 없으면 null */
  readonly nextFireInMs: number | null;
  /** 발화 장부에 남아 있는 줄 수 */
  readonly firedCount: number;
}

/** 진단 화면에 보여줄 값. 알림은 조용히 실패하므로 "지금 몇 건 걸려 있는지"를 볼 수 있어야 한다. */
export function diagnostics(
  buckets: ReminderBuckets,
  now: number,
  observations: ReminderObservations = EMPTY_OBSERVATIONS,
  firedCount = 0,
): ReminderDiagnostics {
  let nextFireAt: number | null = null;
  for (const source of REMINDER_SOURCES) {
    for (const item of buckets[source]) {
      if (nextFireAt === null || item.fireAt < nextFireAt) nextFireAt = item.fireAt;
    }
  }
  return {
    counts: { record: buckets.record.length, todo: buckets.todo.length },
    nextFireAt,
    nextFireInMs: nextFireAt === null ? null : nextFireAt - now,
    firedCount,
    ...observations,
  };
}
