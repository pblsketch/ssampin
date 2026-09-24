/**
 * 쌤도구 타이머 — 이 기기에만 두는 값의 모양과 바로잡기(ADR-139, spec 6-2).
 */
import { MAX_TIMER_SECONDS } from './timerRules';
import { trimTimerName } from './timerSettings';

export const MAX_RECENT_ACTIVITY_NAMES = 8;

export type TimerRosterInputMode = 'custom' | 'students' | 'teachingClass';

export interface TimerRosterPresenter {
  readonly id: string;
  readonly name: string;
  readonly number?: number;
}

/** 발표 타이머 준비 화면 — 마지막 명단·순서·설정. 이 PC 밖으로 보내지 않는다. */
export interface TimerPresentationRoster {
  readonly presenters: readonly TimerRosterPresenter[];
  /** 발표자 id → 발표 순서(1부터). */
  readonly order: readonly (readonly [string, number])[];
  readonly inputMode: TimerRosterInputMode;
  readonly durationSeconds: number;
  /** null = 질문 시간 꺼짐. */
  readonly qnaSeconds: number | null;
  readonly autoAdvance: boolean;
}

export interface TimerLocalState {
  /** 타이머 탭에서 마지막으로 시작한 설정 시간. */
  readonly lastDurationSeconds: number | null;
  /** 최근에 쓴 활동 이름(최신이 앞, 최대 8개). */
  readonly recentActivityNames: readonly string[];
  readonly presentationRoster: TimerPresentationRoster | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTimerSeconds(value: unknown, min: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= MAX_TIMER_SECONDS
  );
}

/** 최근 이름 목록 맨 앞에 넣는다. 같은 이름은 한 번만, 빈 이름은 넣지 않는다. */
export function pushRecentActivityName(names: readonly string[], name: string): readonly string[] {
  const trimmed = trimTimerName(name);
  if (trimmed === '') return names;
  return [trimmed, ...names.filter((n) => n !== trimmed)].slice(0, MAX_RECENT_ACTIVITY_NAMES);
}

function normalizeRoster(raw: unknown): TimerPresentationRoster | null {
  if (!isRecord(raw)) return null;
  const rawPresenters = Array.isArray(raw['presenters']) ? raw['presenters'] : [];
  const presenters: TimerRosterPresenter[] = [];
  const ids = new Set<string>();
  for (const p of rawPresenters) {
    if (!isRecord(p)) continue;
    const id = p['id'];
    const name = p['name'];
    if (typeof id !== 'string' || id === '' || typeof name !== 'string' || ids.has(id)) continue;
    ids.add(id);
    const num = p['number'];
    presenters.push(
      typeof num === 'number' && Number.isFinite(num) ? { id, name, number: num } : { id, name },
    );
  }
  if (presenters.length === 0) return null;
  const rawOrder = Array.isArray(raw['order']) ? raw['order'] : [];
  const order: (readonly [string, number])[] = [];
  for (const entry of rawOrder) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const [id, pos] = entry as unknown[];
    if (
      typeof id === 'string' &&
      ids.has(id) &&
      typeof pos === 'number' &&
      Number.isInteger(pos) &&
      pos >= 1
    ) {
      order.push([id, pos]);
    }
  }
  const mode = raw['inputMode'];
  const inputMode: TimerRosterInputMode =
    mode === 'students' || mode === 'teachingClass' ? mode : 'custom';
  const durationSeconds = isTimerSeconds(raw['durationSeconds'], 5) ? raw['durationSeconds'] : 180;
  const qnaSeconds = isTimerSeconds(raw['qnaSeconds'], 5) ? raw['qnaSeconds'] : null;
  const autoAdvance = raw['autoAdvance'] === true;
  return { presenters, order, inputMode, durationSeconds, qnaSeconds, autoAdvance };
}

/** 저장된 값을 바로잡는다. 모양이 틀리면 빈 상태. */
export function normalizeTimerLocalState(raw: unknown): TimerLocalState {
  if (!isRecord(raw)) {
    return { lastDurationSeconds: null, recentActivityNames: [], presentationRoster: null };
  }
  const lastDurationSeconds = isTimerSeconds(raw['lastDurationSeconds'], 1)
    ? raw['lastDurationSeconds']
    : null;
  const rawNames = Array.isArray(raw['recentActivityNames']) ? raw['recentActivityNames'] : [];
  let recentActivityNames: readonly string[] = [];
  for (const n of [...rawNames].reverse()) {
    if (typeof n === 'string') recentActivityNames = pushRecentActivityName(recentActivityNames, n);
  }
  return {
    lastDurationSeconds,
    recentActivityNames,
    presentationRoster: normalizeRoster(raw['presentationRoster']),
  };
}
