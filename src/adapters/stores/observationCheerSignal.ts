/**
 * 관찰 기록 응원(ADR-135) — "이 컴퓨터에서 추가한 기록" 표시와 응원 판정.
 *
 * - 이 컴퓨터의 쌤핀이 기록 저장소에 새 관찰 기록을 **추가**하면(빠른 기록·담임 기록·수업 관리·
 *   기록 알림 창·쌤핀 AI·외부 AI 연결) 저장소가 `recordLocalObservationAdd` 를 부른다.
 *   동기화·다시 불러오기는 추가 함수를 거치지 않으므로 여기에 오지 않는다.
 * - 표시는 **이 컴퓨터에만** 둔다(localStorage — 창끼리 공유, 동기화 안 함). 별도 빠른 기록 창에서
 *   저장한 기록도 메인 창이 나중에 "이 컴퓨터 기록"으로 알아볼 수 있다.
 * - 응원은 두 가지뿐이다: 오늘 이 컴퓨터에서 처음 저장한 관찰 기록, 이 컴퓨터가 끝 지점을 새로
 *   저장한 한 바퀴. 같은 응원은 이 컴퓨터에서 한 번만 한다.
 * - 토스트는 **저장한 창**에서만 뜬다(`ssampin:observation-cheer` 는 창 안 이벤트). 카드 핀 줄은
 *   localStorage 를 읽으므로 다른 창에도 남는다.
 * - localStorage 가 막혀 있어도 저장 자체는 깨지지 않는다(모두 try/catch).
 */
import { toLocalDateString } from '@shared/utils/localDate';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { isObservationCheerEnabled } from '@domain/entities/RecordReminder';
import {
  FIRST_RECORD_MESSAGES,
  LAP_MESSAGES,
  pickMessage,
} from '@adapters/components/Dashboard/ObservationCheer/cheerMessages';

const LOCAL_ADDS_KEY = 'ssampin:observation-local-adds';
const CHEER_KEY = 'ssampin:observation-cheer';
/** 이 컴퓨터 기록 표시를 며칠 남길지(조정 가능). 바퀴 판정은 그 사이에 끝난다. */
const LOCAL_ADDS_KEEP_DAYS = 14;
export const CHEER_EVENT = 'ssampin:observation-cheer';

export interface CheerLineState {
  readonly message: string;
  readonly pinState: 'wave' | 'celebrate';
  /** 이 응원이 남아 있는 날 'YYYY-MM-DD' */
  readonly day: string;
}

interface CheerState {
  readonly firstDay?: string;
  readonly lapKeys?: readonly string[];
  readonly line?: CheerLineState;
}

interface LocalAdd {
  readonly id: string;
  readonly day: string;
}

/** 이 창에서 추가한 기록 id — 한 바퀴 토스트를 저장한 창에서만 띄우기 위해. */
const sessionAddedIds = new Set<string>();

function readRaw(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/** 깨진 값은 조용히 버린다 — 응원 표시 때문에 기록 저장이나 메인 창이 멈추면 안 된다. */
function readLocalAdds(): LocalAdd[] {
  const v = readRaw(LOCAL_ADDS_KEY);
  if (!Array.isArray(v)) return [];
  return v.filter(
    (a): a is LocalAdd =>
      typeof a === 'object' &&
      a !== null &&
      typeof (a as Record<string, unknown>)['id'] === 'string' &&
      typeof (a as Record<string, unknown>)['day'] === 'string',
  );
}

function isCheerLine(v: unknown): v is CheerLineState {
  if (typeof v !== 'object' || v === null) return false;
  const l = v as Record<string, unknown>;
  return (
    typeof l['message'] === 'string' &&
    (l['pinState'] === 'wave' || l['pinState'] === 'celebrate') &&
    typeof l['day'] === 'string'
  );
}

function readCheerState(): CheerState {
  const v = readRaw(CHEER_KEY);
  if (typeof v !== 'object' || v === null) return {};
  const s = v as Record<string, unknown>;
  const lapKeys = Array.isArray(s['lapKeys'])
    ? (s['lapKeys'] as unknown[]).filter((k): k is string => typeof k === 'string')
    : undefined;
  return {
    ...(typeof s['firstDay'] === 'string' ? { firstDay: s['firstDay'] } : {}),
    ...(lapKeys !== undefined ? { lapKeys } : {}),
    ...(isCheerLine(s['line']) ? { line: s['line'] } : {}),
  };
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 공간이 막혀도 응원만 빠질 뿐 기록 저장에는 영향이 없다.
  }
}

function cheerEnabled(): boolean {
  try {
    return isObservationCheerEnabled(useSettingsStore.getState().settings.recordReminder);
  } catch {
    return true;
  }
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toLocalDateString(d);
}

function emit(line: CheerLineState): void {
  try {
    window.dispatchEvent(new CustomEvent<CheerLineState>(CHEER_EVENT, { detail: line }));
  } catch {
    // 이벤트를 못 보내도 핀 줄은 localStorage 로 남는다.
  }
}

/** 이 컴퓨터에서 추가한 관찰 기록인가(모든 창 공유). */
export function isLocalObservationAdd(id: string): boolean {
  return readLocalAdds().some((a) => a.id === id);
}

/** 이 창에서 추가한 기록인가. */
export function isSessionObservationAdd(id: string): boolean {
  return sessionAddedIds.has(id);
}

/**
 * 기록 저장소가 관찰 기록을 **파일에 쓰기 전에** 부른다 — "이 컴퓨터에서 추가한 기록" 표시만 남긴다.
 *
 * ★쓰기 전에 남기는 까닭: 별도 빠른 기록 창에서 저장하면 파일이 먼저 바뀌고 메인 창이 그걸 다시
 *   불러와 바퀴를 판정한다. 표시가 그보다 늦으면 메인 창은 이 컴퓨터 기록인 줄 모르고 넘어간다.
 *   저장이 실패하면 쓰이지 않는 id 하나가 남을 뿐이다.
 */
export function markLocalObservationAdd(id: string, now: Date = new Date()): void {
  const today = toLocalDateString(now);
  sessionAddedIds.add(id);
  const cutoff = addDays(today, -LOCAL_ADDS_KEEP_DAYS);
  const adds = readLocalAdds().filter((a) => a.day >= cutoff && a.id !== id);
  writeJson(LOCAL_ADDS_KEY, [...adds, { id, day: today }]);
}

/**
 * 기록 저장소가 **관찰 기록 저장에 성공한 직후** 부른다(출결 기록은 부르지 않는다).
 * 이 컴퓨터 표시를 남기고(이미 있으면 그대로), 오늘 첫 저장이면 응원한다.
 */
export function recordLocalObservationAdd(id: string, now: Date = new Date()): void {
  const today = toLocalDateString(now);
  if (!isLocalObservationAdd(id)) markLocalObservationAdd(id, now);
  sessionAddedIds.add(id);

  if (!cheerEnabled()) return;
  const state = readCheerState();
  if (state.firstDay === today) return;
  const line: CheerLineState = {
    message: pickMessage(FIRST_RECORD_MESSAGES, now.getTime() / 1000),
    pinState: 'wave',
    day: today,
  };
  writeJson(CHEER_KEY, { ...state, firstDay: today, line });
  emit(line);
}

/**
 * 한 바퀴 응원 — 이 컴퓨터가 끝 지점을 새로 저장했을 때 부른다.
 * (card, term, 끝낸 바퀴 수)마다 한 번. 응원했으면 true.
 * @param toastHere 이 창에서 저장한 기록으로 끝났는가 — 아니면 토스트 없이 핀 줄에만 남긴다.
 */
export function recordLapCheer(
  lapKey: string,
  cardTitle: string,
  toastHere: boolean,
  now: Date = new Date(),
): boolean {
  if (!cheerEnabled()) return false;
  const today = toLocalDateString(now);
  const state = readCheerState();
  const keys = state.lapKeys ?? [];
  if (keys.includes(lapKey)) return false;
  const line: CheerLineState = {
    message: pickMessage(LAP_MESSAGES, now.getTime() / 1000).replace('{반}', cardTitle),
    pinState: 'celebrate',
    day: today,
  };
  // 지난 학기 키는 쌓여도 작다. 그래도 끝없이 늘지 않게 최근 200개만 둔다(조정 가능).
  writeJson(CHEER_KEY, { ...state, lapKeys: [...keys, lapKey].slice(-200), line });
  if (toastHere) emit(line);
  else emitLineOnly();
  return true;
}

/** 토스트 없이 핀 줄만 새로 그리게 알린다(같은 창). 다른 창은 storage 이벤트로 안다. */
function emitLineOnly(): void {
  try {
    window.dispatchEvent(new CustomEvent(`${CHEER_EVENT}:line`));
  } catch {
    // 무시
  }
}

/** 오늘의 핀 줄 응원(없거나 지난 날이면 null). */
export function readTodayCheerLine(now: Date = new Date()): CheerLineState | null {
  const line = readCheerState().line;
  if (line === undefined) return null;
  return line.day === toLocalDateString(now) ? line : null;
}

export const CHEER_STORAGE_KEY = CHEER_KEY;

/** 시험용 — 이 창의 기록 표시를 비운다. */
export function resetObservationCheerForTest(): void {
  sessionAddedIds.clear();
}
