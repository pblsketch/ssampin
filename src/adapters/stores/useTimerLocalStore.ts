import { create } from 'zustand';
import {
  normalizeTimerLocalState,
  pushRecentActivityName,
  type TimerLocalState,
  type TimerPresentationRoster,
} from '@domain/rules/timerLocalState';

/**
 * 쌤도구 타이머 — **이 기기에만** 저장하는 값(ADR-139, spec 6-2).
 *
 * - 마지막으로 시작한 시간, 최근 활동 이름: 쓸 때마다 바뀐다. 동기화되는 settings 에 두면
 *   두 PC 사이에서 프리셋·단계 편집이 덮일 수 있어 따로 둔다.
 * - 발표 명단: 학생 이름이라 기기 밖으로 보내지 않는다(오너 결정).
 *
 * ⚠️ 이 키는 동기화 목록(`syncRegistry.ts`)에 넣지 않는다.
 *
 * 본문 창과 팝업 창이 같은 키를 쓰므로, 쓸 때는 저장된 값을 다시 읽어 바꿀 칸만 고친 뒤 쓴다.
 */
export const TIMER_LOCAL_KEY = 'timer-local';
const LOCAL_STORAGE_KEY = `ssampin_${TIMER_LOCAL_KEY}`;

/** 읽기 결과. 읽지 못한 것(ok:false)과 저장된 것이 없는 것(value:null)을 가른다. */
type ReadResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

async function readRaw(): Promise<ReadResult> {
  let raw: string | null;
  try {
    const api = window.electronAPI;
    raw = api ? await api.readData(TIMER_LOCAL_KEY) : localStorage.getItem(LOCAL_STORAGE_KEY);
  } catch {
    return { ok: false };
  }
  if (!raw) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    // 깨진 파일은 없는 것으로 본다(다음 쓰기가 새로 만든다).
    return { ok: true, value: null };
  }
}

async function writeState(state: TimerLocalState): Promise<void> {
  const json = JSON.stringify(state);
  try {
    const api = window.electronAPI;
    if (api) {
      await api.writeData(TIMER_LOCAL_KEY, json);
    } else {
      localStorage.setItem(LOCAL_STORAGE_KEY, json);
    }
  } catch {
    /* 저장하지 못해도 타이머 동작에는 영향이 없다 */
  }
}

interface TimerLocalStoreState {
  readonly state: TimerLocalState;
  readonly loaded: boolean;
  load: () => Promise<void>;
  /** 다른 창이 바꿨을 때 다시 읽는다. */
  reload: () => Promise<void>;
  setLastDuration: (seconds: number) => Promise<void>;
  rememberActivityName: (name: string) => Promise<void>;
  setPresentationRoster: (roster: TimerPresentationRoster | null) => Promise<void>;
}

export const useTimerLocalStore = create<TimerLocalStoreState>((set, get) => {
  /**
   * 쓰기는 한 줄로 세운다. 타이머를 시작하면 마지막 시간·활동 이름을 기다리지 않고 연달아 쓰는데,
   * 둘이 같은 옛 값을 읽으면 뒤에 쓴 쪽이 앞의 칸을 옛 값으로 되돌린다.
   */
  let queue: Promise<void> = Promise.resolve();

  /** 저장된 값을 다시 읽어 바꿀 칸만 고친 뒤 쓴다. 읽지 못하면 이 창의 값에서 고친다(빈 값으로 덮지 않게). */
  const update = (patch: (current: TimerLocalState) => TimerLocalState): Promise<void> => {
    const run = queue.then(async () => {
      const read = await readRaw();
      const latest = read.ok ? normalizeTimerLocalState(read.value) : get().state;
      const next = normalizeTimerLocalState(patch(latest));
      set({ state: next, loaded: true });
      await writeState(next);
    });
    queue = run.catch(() => undefined);
    return run;
  };

  const readInto = async (): Promise<void> => {
    const read = await readRaw();
    if (read.ok) set({ state: normalizeTimerLocalState(read.value), loaded: true });
    else set({ loaded: true });
  };

  return {
    state: normalizeTimerLocalState(null),
    loaded: false,

    load: async () => {
      if (get().loaded) return;
      await readInto();
    },

    reload: readInto,

    setLastDuration: (seconds) =>
      update((current) => ({ ...current, lastDurationSeconds: seconds })),

    rememberActivityName: (name) =>
      update((current) => ({
        ...current,
        recentActivityNames: pushRecentActivityName(current.recentActivityNames, name),
      })),

    setPresentationRoster: (roster) =>
      update((current) => ({ ...current, presentationRoster: roster })),
  };
});
