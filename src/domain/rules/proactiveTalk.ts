/**
 * 관찰 기록 응원 2·3차(ADR-137) — 쌤핀이 **먼저 거는 말**의 조정(하루 한 번).
 *
 * - 이 컴퓨터에서 하루에 한 번만 먼저 말을 건다.
 * - 같은 날 둘 이상이면 **학기 돌아보기 > 한 주 정리 > 학교 달력 순간** 순으로 하나만 알리고,
 *   진 쪽은 이긴 쪽 화면 안에 조각(한 줄)으로 들어간다.
 * - 다른 작업은 날짜별 말 후보(예: 학교 달력 순간)를 `kind` 로 더하기만 하면 된다 — 우선순위를
 *   모르는 종류는 가장 뒤에 선다.
 * - 기록 알림 창, 첫 기록 응원, 한 바퀴 응원은 이 규칙에 넣지 않는다.
 * - '오늘은 쉴게요'를 누른 날은 '보여 주지 않은 것'으로 친다 — 그날 말을 거두고 알린 표시도
 *   되돌려, 한 주 정리·학기 돌아보기의 '다음 등교일' 규칙을 따르게 한다.
 */

/** 먼저 거는 말 한 건. `key` 는 종류 안에서의 대상(한 주 정리 = 주 월요일, 돌아보기 = 학기). */
export interface TalkCandidate {
  readonly kind: string;
  readonly key: string;
}

/** 종류별 우선순위 — 작을수록 먼저. 모르는 종류는 맨 뒤. */
export const TALK_PRIORITY: Readonly<Record<string, number>> = {
  retrospect: 0,
  weekly: 1,
  moment: 2,
};

function priorityOf(kind: string): number {
  return TALK_PRIORITY[kind] ?? Number.MAX_SAFE_INTEGER;
}

export interface TalkOfDay {
  readonly main: TalkCandidate;
  /** 이긴 쪽 화면 안에 조각으로 들어갈 나머지 */
  readonly folded: readonly TalkCandidate[];
}

/** 후보 가운데 그날 말할 하나와 조각으로 들어갈 나머지. 후보가 없으면 null. */
export function arbitrateTalk(candidates: readonly TalkCandidate[]): TalkOfDay | null {
  if (candidates.length === 0) return null;
  // 같은 종류끼리는 더 최근 대상(키가 큰 쪽 — 주 월요일·학기 이름)이 먼저다.
  const sorted = [...candidates].sort(
    (a, b) => priorityOf(a.kind) - priorityOf(b.kind) || b.key.localeCompare(a.key),
  );
  const [main, ...folded] = sorted as [TalkCandidate, ...TalkCandidate[]];
  return { main, folded };
}

/** 이 컴퓨터에 두는 먼저 거는 말 상태. */
export interface TalkState {
  /** 오늘 판단을 마친 날(말이 없던 날도). 판단 전이면 null. */
  readonly decidedDate: string | null;
  /** 그날 말. 없으면 null. */
  readonly talk: TalkOfDay | null;
  /** 선생님이 그 말을 열어 봤는가 */
  readonly opened: boolean;
  /** 메인 창에서 토스트를 띄웠는가 */
  readonly toastShown: boolean;
  /** 이미 알린 대상 — `${kind}:${key}` */
  readonly notified: readonly string[];
}

export const EMPTY_TALK_STATE: TalkState = {
  decidedDate: null,
  talk: null,
  opened: false,
  toastShown: false,
  notified: [],
};

/** 알린 표시를 몇 개까지 남길지(무한 증가 방지). */
const NOTIFIED_KEEP = 40;

export function notifiedKey(c: TalkCandidate): string {
  return `${c.kind}:${c.key}`;
}

export function hasNotified(state: TalkState, c: TalkCandidate): boolean {
  return state.notified.includes(notifiedKey(c));
}

/**
 * 오늘 말을 정한다 — 이미 정한 날이면 그대로 둔다(같은 객체).
 * 말한 것과 조각으로 들어간 것은 모두 '알린 것'으로 친다.
 * @param handled 말하지 않지만 '처리한 것'으로 적을 대상 — 예: 알릴 날 처음 화면에서 기록이 0건이라
 *   넘긴 한 주 정리는, 그 뒤 기록이 생겨도 다음 등교일에 다시 알리지 않는다(다시 알리기는 못 알린
 *   날만 — 안 열었거나 쉰 날).
 */
export function decideTalk(
  state: TalkState,
  today: string,
  candidates: readonly TalkCandidate[],
  handled: readonly TalkCandidate[] = [],
): TalkState {
  if (state.decidedDate === today) return state;
  const fresh = candidates.filter((c) => !hasNotified(state, c));
  const talk = arbitrateTalk(fresh);
  const added = [
    ...(talk === null ? [] : [talk.main, ...talk.folded].map(notifiedKey)),
    ...handled.filter((c) => !hasNotified(state, c)).map(notifiedKey),
  ];
  return {
    decidedDate: today,
    talk,
    opened: false,
    toastShown: false,
    notified: [...state.notified, ...added].slice(-NOTIFIED_KEEP),
  };
}

/** 오늘 말이 아직 열어 보지 않은 채 남아 있는가. */
export function pendingTalk(state: TalkState, today: string): TalkOfDay | null {
  if (state.decidedDate !== today || state.opened) return null;
  return state.talk;
}

export function markTalkOpened(state: TalkState, today: string): TalkState {
  if (state.decidedDate !== today || state.opened) return state;
  return { ...state, opened: true };
}

export function markToastShown(state: TalkState, today: string): TalkState {
  if (state.decidedDate !== today || state.toastShown) return state;
  return { ...state, toastShown: true };
}

/**
 * 오늘은 쉴게요 — 아직 열어 보지 않은 그날 말을 거둔다. 알린 표시도 되돌려 다음 등교일에 다시
 * 알릴 수 있게 한다. 이미 열어 본 말은 그대로 둔다(본 것이다).
 *
 * ★그날 판단은 끝난 것으로 둔다(`decidedDate` 유지). 되돌리면 같은 날 [다시 켜기]를 눌렀을 때
 *   같은 말이 한 번 더 나가 '하루 한 번'이 깨지고, 다음 등교일 규칙도 건너뛴다.
 */
export function revokeTalkForRest(state: TalkState, today: string): TalkState {
  if (state.decidedDate !== today || state.opened || state.talk === null) return state;
  const revoked = new Set([state.talk.main, ...state.talk.folded].map(notifiedKey));
  return {
    ...state,
    talk: null,
    toastShown: false,
    notified: state.notified.filter((k) => !revoked.has(k)),
  };
}

/** 저장소에서 읽은 값 → 상태. 깨진 값은 빈 상태. */
export function parseTalkState(value: unknown): TalkState {
  if (typeof value !== 'object' || value === null) return EMPTY_TALK_STATE;
  const v = value as Record<string, unknown>;
  const cand = (x: unknown): TalkCandidate | null => {
    if (typeof x !== 'object' || x === null) return null;
    const c = x as Record<string, unknown>;
    return typeof c['kind'] === 'string' && typeof c['key'] === 'string'
      ? { kind: c['kind'], key: c['key'] }
      : null;
  };
  let talk: TalkOfDay | null = null;
  if (typeof v['talk'] === 'object' && v['talk'] !== null) {
    const t = v['talk'] as Record<string, unknown>;
    const main = cand(t['main']);
    if (main !== null) {
      const folded = Array.isArray(t['folded'])
        ? (t['folded'] as unknown[]).map(cand).filter((c): c is TalkCandidate => c !== null)
        : [];
      talk = { main, folded };
    }
  }
  return {
    decidedDate: typeof v['decidedDate'] === 'string' ? v['decidedDate'] : null,
    talk,
    opened: v['opened'] === true,
    toastShown: v['toastShown'] === true,
    notified: Array.isArray(v['notified'])
      ? (v['notified'] as unknown[]).filter((k): k is string => typeof k === 'string')
      : [],
  };
}
