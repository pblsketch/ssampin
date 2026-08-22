/**
 * 할 일 알람 켬/끔 — **기기 전용** 상태 (오너 결정 1, 2026-08-22).
 *
 * ⚠️ 이 키를 `syncRegistry.ts` 의 `SYNC_REGISTRY` 에 **절대 등재하지 말 것.**
 *
 * 켬/끔이 동기화 대상 안에 있으면 이런 일이 벌어진다 — 학교 PC에서 알람을 껐는데,
 * 집 PC가 **켬 상태이던 오래된 사본**을 나중에 저장하면서 다시 켜 버린다.
 * 알람에 문제가 생겼을 때 사용자가 제일 먼저 하는 일이 "설정에서 끄기"인데,
 * 그게 확실히 안 꺼지면 **되돌리기 1순위 수단이 무력화된다.**
 *
 * 같은 실패를 이 저장소가 이미 한 번 겪었다 — "마지막 동기화 시각"이 동기화 대상인
 * settings 안에 살아서 매 주기 업로드·LWW 핑퐁·가짜 충돌을 낳았다(ADR-039/040).
 * 그때 만든 해법이 `driveSyncDeviceState.ts` 이고, 이 파일은 같은 모양이다.
 *
 * 나머지 알람 값(미리 알림 분, 하루 상한, 기본 시각, 문구 노출, 예약 범위)은
 * 기기 간 공유가 오히려 편해서 `TodoSettings` 에 그대로 둔다(오너 결정 1 = ㉰ 절반씩).
 */
export const TODO_ALARM_DEVICE_STATE_KEY = 'todo-alarm-device-state';

export interface TodoAlarmDeviceState {
  /** 이 기기에서 할 일 알람을 켤지. 없으면 꺼진 것으로 본다(기본 꺼짐). */
  readonly alarmEnabled?: boolean;
}

/**
 * 읽기 실패는 "꺼짐"으로 처리한다.
 *
 * 알람은 **켜는 쪽이 적극적 행위**다. 저장소를 못 읽는 상황에서 멋대로 알림을 띄우는
 * 것보다, 조용히 있다가 사용자가 다시 켜는 편이 안전하다.
 */
export async function readTodoAlarmEnabled(): Promise<boolean> {
  try {
    const { storage } = await import('@adapters/di/container');
    const raw = await storage.read<TodoAlarmDeviceState>(TODO_ALARM_DEVICE_STATE_KEY);
    return raw !== null && typeof raw === 'object' && raw.alarmEnabled === true;
  } catch {
    return false;
  }
}

/** 켬/끔 저장. 실패하면 false 를 돌려 화면이 "저장하지 못했습니다"를 알릴 수 있게 한다. */
export async function saveTodoAlarmEnabled(alarmEnabled: boolean): Promise<boolean> {
  try {
    const { storage } = await import('@adapters/di/container');
    await storage.write<TodoAlarmDeviceState>(TODO_ALARM_DEVICE_STATE_KEY, { alarmEnabled });
    notify(alarmEnabled);
    return true;
  } catch {
    return false;
  }
}

/**
 * 켬/끔이 바뀌면 알려 준다.
 *
 * 이 값은 동기화되는 설정(`settings.json`)이 아니라 기기 전용 저장소에 있어서, 설정 화면의
 * 스위치를 껐을 때 **알람을 실제로 보내는 훅이 그 사실을 알 방법이 없다.** 이 구독이 그
 * 다리다. 스위치를 끄자마자 예약이 비워져야 "껐는데도 울린다"가 생기지 않는다.
 */
type Listener = (alarmEnabled: boolean) => void;
const listeners = new Set<Listener>();

function notify(alarmEnabled: boolean): void {
  for (const listener of listeners) {
    try {
      listener(alarmEnabled);
    } catch {
      // 구독자 하나가 실패해도 나머지에게는 전달한다.
    }
  }
}

export function subscribeTodoAlarmEnabled(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
