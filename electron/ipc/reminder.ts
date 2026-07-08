import { ipcMain, Notification } from 'electron';

/**
 * 학생 관찰 기록 알림 — OS 토스트 발화 IPC (P3, 계획서 S1).
 *
 * 렌더러(domain 순수함수)가 계산한 forward 스케줄을 `reminder:schedule`로 push하면,
 * main의 상시 타이머가 예정 시각(fireAt)에 `new Notification()`으로 발화한다.
 * memorySaver로 MainApp 렌더러가 destroy돼도 main은 살아있어 발화가 유지된다.
 *
 * ★ main은 "누가 due인지" 계산하지 않는다 — 받은 스냅샷을 쏘기만 하고, 클릭 시엔
 *   opaque reminderId만 렌더러에 돌려준다(레이어 보존·프라이버시). 학생/프롬프트 해석은 렌더러 몫.
 */
interface ReminderScheduleItem {
  readonly reminderId: string;
  /** 발화 예정 시각 (Unix ms). */
  readonly fireAt: number;
  readonly title: string;
  /** 렌더러가 nameExposure 정책을 이미 적용한 최종 문자열. */
  readonly body: string;
  /** 발화 장부 dedup 키(`studentId:YYYY-MM-DD`). */
  readonly studentDedupKey: string;
}

interface ReminderIpcHooks {
  /** 토스트 클릭 시 — 창을 앞으로(아이콘 모드면 확장) + 렌더러에 opaque reminderId 전달. */
  onReminderClick: (reminderId: string) => void;
  /** 토스트 발화 직후 — 렌더러 발화 장부에 dedup 키 기록 요청(메인 렌더러 생존 시). */
  onReminderFired: (studentDedupKey: string) => void;
}

let schedule: ReminderScheduleItem[] = [];
/** 이 세션에서 이미 발화한 reminderId — 같은 스케줄의 중복 발화 방지. */
const firedThisSession = new Set<string>();

function isValidItem(x: unknown): x is ReminderScheduleItem {
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

function fireDue(hooks: ReminderIpcHooks): void {
  if (!Notification.isSupported()) return;
  const now = Date.now();
  const due = schedule.filter((it) => it.fireAt <= now && !firedThisSession.has(it.reminderId));
  if (due.length === 0) return;
  for (const it of due) {
    firedThisSession.add(it.reminderId);
    try {
      const n = new Notification({ title: it.title, body: it.body });
      n.on('click', () => hooks.onReminderClick(it.reminderId));
      n.show();
      hooks.onReminderFired(it.studentDedupKey);
    } catch (e) {
      console.warn('[reminder] notification 발화 실패:', (e as Error).message);
    }
  }
  schedule = schedule.filter((it) => !firedThisSession.has(it.reminderId));
}

/**
 * 리마인더 발화 IPC 등록 + 상시 타이머 시작.
 * @returns cleanup 함수(타이머 정리 + 리스너 해제)
 */
export function registerReminderIpc(hooks: ReminderIpcHooks): () => void {
  const onSchedule = (_e: unknown, items: unknown): void => {
    schedule = Array.isArray(items) ? items.filter(isValidItem) : [];
  };
  const onClear = (): void => {
    schedule = [];
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
