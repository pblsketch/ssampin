import { ipcMain, Notification } from 'electron';
import fs from 'fs';
import path from 'path';
import { getContentRoot } from '../dataRoot';
import { notifyLog, notifyWarn } from '../notifyDiag';
import {
  EMPTY_BUCKETS,
  applyClear,
  applySchedule,
  diagnostics,
  normalizePayload,
  pruneFiredLedger,
  selectDue,
  type FiredEntry,
  type ReminderBuckets,
  type ReminderDiagnostics,
  type ReminderObservations,
  type ReminderScheduleItem,
  type ReminderSource,
} from './reminderCore';
import { readReminderState, writeReminderState } from './reminderState';

/**
 * 알림 발화 IPC — 학생 관찰 기록 + 할 일 알람.
 *
 * 렌더러가 계산한 예약 목록을 `reminder:schedule` 로 보내면, main 의 상시 타이머가
 * 예정 시각에 `new Notification()` 으로 띄운다. 메모리 절약으로 메인 렌더러가 파괴돼도
 * main 은 살아 있어서 발화가 유지된다.
 *
 * ★ **예약 칸은 출처별로 나뉜다.** 예전에는 배열 하나를 통째로 덮어써서, 두 번째 생산자가
 *   생기는 순간 서로의 알림을 조용히 지웠다. 지금은 `record` 칸과 `todo` 칸이 따로 있어
 *   한쪽을 갈아도 다른 쪽은 그대로다.
 *
 * ★ main 은 "누가 대상인지"를 해석하지 않는다 — 받은 스냅샷을 쏘기만 하고, 클릭하면
 *   불투명한 `reminderId` 만 렌더러에 돌려준다(레이어 보존·개인정보).
 *
 * ★ 판정 로직은 전부 `reminderCore.ts`(Electron 을 모르는 순수 모듈)에 있다. 이 파일은
 *   IPC 배선·타이머·토스트 발화·정본 확인만 담당하는 얇은 껍데기다. 그렇게 나눈 이유:
 *   알림은 **조용히 실패하는 기능**이라(안 울린 알림은 아무도 신고하지 않는다) 자동
 *   테스트가 특히 중요한데, 예전 구조로는 테스트를 붙일 수 없었다.
 *
 * ⚠️ **구버전 main + 신버전 렌더러 조합**(개발 중에만 생긴다): 신버전 렌더러가 보내는
 *    `{ source, items }` 객체를 구버전 main 이 받으면 `Array.isArray ? … : []` 때문에
 *    **학생 관찰 기록 예약까지 전부 소멸한다.** electron main 변경은 `electron:dev` 가
 *    감시하지 않으므로 반드시 완전히 껐다 켜야 한다. 재시작하면 해소된다.
 */

export type { ReminderScheduleItem } from './reminderCore';

interface ReminderIpcHooks {
  /** 토스트 클릭 시 — 창을 앞으로(아이콘 모드면 확장) + 렌더러에 opaque reminderId 전달. */
  onReminderClick: (reminderId: string) => void;
  /**
   * 토스트 발화 직후 — 렌더러 발화 장부에 dedup 키 기록 요청(메인 렌더러 생존 시).
   *
   * ★ 인자 2개다. 출처를 함께 넘기지 않으면 렌더러가 남의 알림까지 자기 장부에 적는다.
   */
  onReminderFired: (dedupKey: string, source: ReminderSource) => void;
}

let buckets: ReminderBuckets = EMPTY_BUCKETS;
/** 발화 이력 — 파일에 저장돼 재시작 후에도 같은 알림이 또 울리지 않게 한다. */
let firedLedger: readonly FiredEntry[] = [];
/** 진단용 관측값. 렌더러 push 로 덮이지 않는 필드를 여기에 둔다. */
let observations: ReminderObservations = {
  lastPushedAt: {},
  restoredFromSnapshotAt: null,
  snapshotItemCount: 0,
};
/** 출처별 소유 렌더러 id — 바뀌면 경고만 남긴다(거부하지 않는다). */
const ownerBySource = new Map<ReminderSource, number>();

function firedIdSet(): ReadonlySet<string> {
  return new Set(firedLedger.map((e) => e.reminderId));
}

/**
 * `todo` 칸 예약과 **`todo` 발화 이력만** 파일에 남긴다.
 *
 * 학생 관찰 기록 쪽은 렌더러가 매번 다시 보내고 자기 장부도 따로 들고 있다. 그쪽까지
 * main 이 기억하기 시작하면 **출시된 동작이 바뀐다** — 이 변경에서 가장 피하고 싶은 일이다.
 */
function persist(now: number): void {
  writeReminderState({
    todo: buckets.todo,
    fired: firedLedger.filter((e) => e.source === 'todo'),
    savedAt: now,
  });
}

/**
 * 발화 직전 정본 확인 — "그 할 일이 아직 남아 있고, 아직 안 끝났는가".
 *
 * 왜 필요한가: 일요일 저녁에 휴대폰으로 할 일을 끝냈는데 데스크톱이 꺼져 있었다면,
 * 월요일 아침 콜드 부팅 때 main 은 **금요일 스냅샷**을 들고 있다. 시간만 보는 만료 검사는
 * 이걸 못 막는다("끝낸 일이 다시 울리는 앱"이 된다). 그래서 울리기 직전에 파일을 확인한다.
 *
 * `record` 칸은 확인 대상이 아니다 — 오늘과 똑같이 렌더러 계산을 그대로 믿는다.
 * 읽기에 실패하면 **던진다.** 부르는 쪽(`selectDue`)이 그걸 "울리지 않음"으로 처리한다.
 */
function makeIsStillValid(): (item: ReminderScheduleItem, source: ReminderSource) => boolean {
  let cache: { ids: Set<string> } | null = null;

  return (item, source) => {
    if (source !== 'todo') return true;
    if (cache === null) {
      // 파일 읽기는 발화 대상이 있을 때 한 번만 한다(30초마다 읽지 않는다).
      const p = path.join(getContentRoot(), 'data', 'todos.json');
      const raw = fs.readFileSync(p, 'utf-8'); // 실패하면 던진다 → 안 울린다
      const parsed: unknown = JSON.parse(raw);
      const list =
        typeof parsed === 'object' &&
        parsed !== null &&
        Array.isArray((parsed as { todos?: unknown }).todos)
          ? (parsed as { todos: unknown[] }).todos
          : [];
      const ids = new Set<string>();
      for (const t of list) {
        if (typeof t !== 'object' || t === null) continue;
        const todo = t as Record<string, unknown>;
        if (typeof todo['id'] !== 'string') continue;
        if (todo['completed'] === true) continue; // 끝난 일은 안 울린다
        ids.add(todo['id']);
      }
      cache = { ids };
    }
    // reminderId = `todo:<todoId>:<fireAtMs>` — 가운데 조각이 할 일 id 다.
    const parts = item.reminderId.split(':');
    const todoId = parts.length >= 3 ? parts.slice(1, -1).join(':') : '';
    return todoId !== '' && cache.ids.has(todoId);
  };
}

function fireDue(hooks: ReminderIpcHooks): void {
  if (!Notification.isSupported()) return;

  const now = Date.now();
  const result = selectDue(buckets, now, firedIdSet(), makeIsStillValid());
  const changed =
    result.toFire.length > 0 || result.expired.length > 0 || result.dropped.length > 0;
  buckets = result.nextBuckets;

  for (const { source, item } of result.expired) {
    notifyLog('만료로 건너뜀', { source, id: item.reminderId, expiresAt: item.expiresAt });
  }
  for (const { source, item } of result.dropped) {
    notifyLog('정본에 없거나 끝난 일이라 건너뜀', { source, id: item.reminderId });
  }

  if (result.toFire.length > 0) {
    for (const { source, item } of result.toFire) {
      firedLedger = [...firedLedger, { reminderId: item.reminderId, firedAt: now, source }];
      try {
        const n = new Notification({ title: item.title, body: item.body });
        n.on('click', () => hooks.onReminderClick(item.reminderId));
        n.show();
        hooks.onReminderFired(item.studentDedupKey, source);
        notifyLog('발화', { source, id: item.reminderId });
      } catch (e) {
        notifyWarn('발화 실패', { source, id: item.reminderId, message: (e as Error).message });
      }
    }
    firedLedger = pruneFiredLedger(firedLedger, now);
  }

  if (changed) persist(now);
}

/**
 * 알림 발화 IPC 등록 + 상시 타이머 시작.
 *
 * 시작 시 `notify-state.json` 에서 `todo` 칸과 발화 이력을 되살린다 — 메모리 절약 모드로
 * 메인 렌더러가 없는 콜드 부팅에서도 할 일 알람이 울리게 하는 유일한 장치다.
 *
 * @returns cleanup 함수(타이머 정리 + 리스너 해제)
 */
export function registerReminderIpc(hooks: ReminderIpcHooks): () => void {
  const bootNow = Date.now();
  const restored = readReminderState(bootNow);
  if (restored.todo.length > 0 || restored.fired.length > 0) {
    buckets = applySchedule(buckets, 'todo', restored.todo);
    firedLedger = restored.fired;
    observations = {
      ...observations,
      restoredFromSnapshotAt: bootNow,
      snapshotItemCount: restored.todo.length,
    };
  }
  notifyLog('시작 — 스냅샷 복원', {
    todo: restored.todo.length,
    fired: restored.fired.length,
    savedAt: restored.savedAt,
  });

  const onSchedule = (e: { sender?: { id?: number } } | unknown, payload: unknown): void => {
    const { source, items } = normalizePayload(payload);

    // 출처당 생산자는 정확히 하나여야 한다. 창이 파괴됐다 다시 생기면 id 가 정상적으로
    // 바뀌므로 **거부하지 않고 경고만** 남긴다 — 거부하면 그게 오탐이 된다.
    const senderId = (e as { sender?: { id?: number } })?.sender?.id;
    if (typeof senderId === 'number') {
      const prev = ownerBySource.get(source);
      if (prev !== undefined && prev !== senderId) {
        notifyWarn('생산자 렌더러가 바뀌었다', { source, from: prev, to: senderId });
      }
      ownerBySource.set(source, senderId);
    }

    const now = Date.now();
    buckets = applySchedule(buckets, source, items);
    observations = {
      ...observations,
      lastPushedAt: { ...observations.lastPushedAt, [source]: now },
    };
    notifyLog('예약 받음', { source, count: items.length });
    if (source === 'todo') persist(now);
  };

  const onClear = (_e: unknown, source?: unknown): void => {
    const target: ReminderSource | undefined =
      source === 'record' || source === 'todo' ? source : undefined;
    buckets = applyClear(buckets, target);
    notifyLog('예약 비움', { source: target ?? '전체' });
    if (target !== 'record') persist(Date.now());
  };

  const onDiagnostics = (): ReminderDiagnostics =>
    diagnostics(buckets, Date.now(), observations, firedLedger.length);

  ipcMain.on('reminder:schedule', onSchedule);
  ipcMain.on('reminder:clear', onClear);
  ipcMain.handle('reminder:diagnostics', onDiagnostics);
  // 30초마다 예정 시각 도달분 발화 (리마인더는 초 단위 정밀도 불필요).
  const timer = setInterval(() => fireDue(hooks), 30_000);
  return () => {
    clearInterval(timer);
    ipcMain.removeListener('reminder:schedule', onSchedule);
    ipcMain.removeListener('reminder:clear', onClear);
    ipcMain.removeHandler('reminder:diagnostics');
  };
}
