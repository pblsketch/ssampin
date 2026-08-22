import { ipcMain, Notification } from 'electron';
import {
  EMPTY_BUCKETS,
  applyClear,
  applySchedule,
  normalizePayload,
  selectDue,
  type ReminderBuckets,
  type ReminderScheduleItem,
} from './reminderCore';

/**
 * 학생 관찰 기록 알림 — OS 토스트 발화 IPC (P3, 계획서 S1).
 *
 * 렌더러(domain 순수함수)가 계산한 forward 스케줄을 `reminder:schedule`로 push하면,
 * main의 상시 타이머가 예정 시각(fireAt)에 `new Notification()`으로 발화한다.
 * memorySaver로 MainApp 렌더러가 destroy돼도 main은 살아있어 발화가 유지된다.
 *
 * ★ main은 "누가 due인지" 계산하지 않는다 — 받은 스냅샷을 쏘기만 하고, 클릭 시엔
 *   opaque reminderId만 렌더러에 돌려준다(레이어 보존·프라이버시). 학생/프롬프트 해석은 렌더러 몫.
 *
 * ★ 판정 로직은 전부 `reminderCore.ts`(Electron 을 모르는 순수 모듈)에 있다.
 *   이 파일은 IPC 배선·타이머·토스트 발화만 담당하는 얇은 껍데기다.
 *   그렇게 나눈 이유: 알림은 **조용히 실패하는 기능**이라(안 울린 알림은 아무도 신고하지
 *   않는다) 자동 테스트가 특히 중요한데, 예전 구조로는 테스트를 붙일 수 없었다.
 */

export type { ReminderScheduleItem } from './reminderCore';

interface ReminderIpcHooks {
  /** 토스트 클릭 시 — 창을 앞으로(아이콘 모드면 확장) + 렌더러에 opaque reminderId 전달. */
  onReminderClick: (reminderId: string) => void;
  /** 토스트 발화 직후 — 렌더러 발화 장부에 dedup 키 기록 요청(메인 렌더러 생존 시). */
  onReminderFired: (studentDedupKey: string) => void;
}

let buckets: ReminderBuckets = EMPTY_BUCKETS;
/** 이 세션에서 이미 발화한 reminderId — 같은 스케줄의 중복 발화 방지. */
const firedThisSession = new Set<string>();

function fireDue(hooks: ReminderIpcHooks): void {
  if (!Notification.isSupported()) return;

  const result = selectDue(buckets, Date.now(), firedThisSession);
  buckets = result.nextBuckets;
  if (result.toFire.length === 0) return;

  for (const { item } of result.toFire) {
    firedThisSession.add(item.reminderId);
    try {
      const n = new Notification({ title: item.title, body: item.body });
      n.on('click', () => hooks.onReminderClick(item.reminderId));
      n.show();
      hooks.onReminderFired(item.studentDedupKey);
    } catch (e) {
      console.warn('[reminder] notification 발화 실패:', (e as Error).message);
    }
  }
}

/**
 * 리마인더 발화 IPC 등록 + 상시 타이머 시작.
 * @returns cleanup 함수(타이머 정리 + 리스너 해제)
 */
export function registerReminderIpc(hooks: ReminderIpcHooks): () => void {
  const onSchedule = (_e: unknown, payload: unknown): void => {
    const { source, items } = normalizePayload(payload);
    buckets = applySchedule(buckets, source, items);
  };
  const onClear = (): void => {
    buckets = applyClear(buckets);
  };
  ipcMain.on('reminder:schedule', onSchedule);
  ipcMain.on('reminder:clear', onClear);
  // 30초마다 예정 시각 도달분 발화 (리마인더는 초 단위 정밀도 불필요).
  const timer = setInterval(() => fireDue(hooks), 30_000);
  return () => {
    clearInterval(timer);
    ipcMain.removeListener('reminder:schedule', onSchedule);
    ipcMain.removeListener('reminder:clear', onClear);
  };
}
