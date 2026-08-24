import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import {
  readTodoAlarmEnabled,
  subscribeTodoAlarmEnabled,
} from '@adapters/repositories/todoAlarmDeviceState';
import { DEFAULT_TODO_SETTINGS } from '@domain/entities/TodoSettings';
import { buildTodoAlarmSchedule, DEFAULT_ALARM_DAILY_CAP } from '@domain/rules/todoAlarmRules';

/**
 * 할 일 시각 알람 — OS 토스트 예약 push 훅.
 *
 * 할 일 목록·설정이 바뀔 때마다 "언제 무엇을 울릴지"를 계산해 main 으로 보낸다. main 은
 * 그 목록을 파일에도 남겨 두므로, 메모리 절약 모드로 이 화면이 파괴돼도 알람은 울린다.
 *
 * ★ **이 훅은 `MainApp` 안에서만 부른다.** 바탕화면 위젯·아이콘·빠른 입력·스티커·
 *   멀티설문 공유 창은 전부 같은 번들(`index.html`)을 쓰기 때문에, 위쪽 분기 함수인
 *   `App()` 에 두면 최대 6개 창이 같은 `'todo'` 칸에 동시에 써서 서로를 덮어쓴다.
 *   `electron/appEntryReminder.contract.test.ts` 가 이 배치를 검사한다.
 *
 * 🚨 **끌 때 반드시 `clearReminderSchedule('todo')` 처럼 출처를 지정할 것.**
 *   기존 기록 알림 훅을 그대로 베끼면 인자 없는 `clearReminderSchedule()` 을 부르게 되고,
 *   그러면 **학생 관찰 기록 알림이 통째로 사라진다** — 할 일 알람을 끄려다 남의 알림을
 *   끄는 셈이다. 회귀 검사 #59 가 이 실수를 게이트에서 잡는다.
 *
 * 브라우저 모드(electronAPI 없음)에서는 조용히 아무것도 하지 않는다.
 */
/** "비웠다"를 나타내는 표식. 예약 목록의 지문(JSON)과 겹치지 않는 값이면 된다. */
const CLEARED = '__cleared__';

export function useTodoAlarmOsPush(): void {
  const todos = useTodoStore((s) => s.todos);
  const todosLoaded = useTodoStore((s) => s.loaded);
  const todoSettings = useSettingsStore((s) => s.settings.todoSettings) ?? DEFAULT_TODO_SETTINGS;
  const [alarmEnabled, setAlarmEnabled] = useState<boolean | null>(null);
  /** 마지막으로 보낸 내용의 지문. 같은 것을 두 번 보내지 않기 위한 것뿐이다. */
  const lastSentRef = useRef<string | null>(null);

  // 할 일 목록을 직접 불러온다. 지금까지는 할 일 화면이나 대시보드 카드가 먼저 떠야
  // 목록이 채워졌는데, 그러면 **대시보드에서 할 일 카드를 빼 둔 선생님은 알람이 아예
  // 안 온다.** 알람이 남의 화면이 떠 주기를 기다리게 두지 않는다.
  // (`load()` 는 이미 불러왔으면 곧바로 돌아오므로 중복 호출이 안전하다.)
  useEffect(() => {
    void useTodoStore.getState().load();
  }, []);

  // 켬/끔은 **이 기기에만** 저장된다(동기화되면 껐는데 되살아난다). 최초 1회 읽고,
  // 설정 화면에서 스위치를 움직이면 구독으로 즉시 따라간다.
  useEffect(() => {
    let alive = true;
    void readTodoAlarmEnabled().then((v) => {
      if (alive) setAlarmEnabled(v);
    });
    const off = subscribeTodoAlarmEnabled((v) => setAlarmEnabled(v));
    return () => {
      alive = false;
      off();
    };
  }, []);

  const push = useCallback(() => {
    const api = window.electronAPI;
    if (!api?.scheduleReminders || !api.clearReminderSchedule) return;
    if (alarmEnabled === null) return; // 아직 읽는 중 — 켜지도 끄지도 않는다

    // 꺼져 있거나 아직 할 일을 못 읽었으면 **우리 칸만** 비운다.
    if (!alarmEnabled || !todosLoaded) {
      if (lastSentRef.current !== CLEARED) {
        lastSentRef.current = CLEARED;
        api.clearReminderSchedule('todo');
      }
      return;
    }

    const items = buildTodoAlarmSchedule(
      todos,
      todoSettings,
      Date.now(),
      -new Date().getTimezoneOffset(),
    );

    // ★하루 상한을 main 에도 알린다 (2026-08-24 UltraQA) — 이 목록의 상한 필터는
    //   "이미 울리고 유예까지 지난 몫"을 세지 못한다(후보에서 사라져 매번 0부터 센다).
    //   실제로 울린 개수의 정본은 main 의 발화 장부라, 최종 상한 판정은 main 이 한다.
    const dailyCap = todoSettings.alarmDailyCap ?? DEFAULT_ALARM_DAILY_CAP;

    // ★ 방금 보낸 것과 같으면 다시 보내지 않는다.
    //
    // 할 일 저장소는 동기화가 자료를 다시 읽을 때마다 **내용이 같아도 새 배열을 만든다.**
    // 그래서 이 함수는 아무것도 안 바뀐 순간에도 계속 다시 불린다. 그때마다 보내면
    // 앱 속 알맹이가 매번 진단 로그를 쓰고 예약 파일을 새로 저장해서, **로그가 같은 줄로
    // 뒤덮여 정작 봐야 할 줄이 묻힌다.** (실제로 그렇게 됐다.)
    const signature = JSON.stringify([dailyCap, items]);
    if (lastSentRef.current === signature) return;
    lastSentRef.current = signature;

    api.scheduleReminders('todo', [...items], dailyCap);
  }, [alarmEnabled, todos, todosLoaded, todoSettings]);

  useEffect(() => {
    push();
  }, [push]);

  // 창 포커스·절전 복귀 때도 다시 계산한다 — 자정을 넘겼거나 절전으로 몇 시간이 지났으면
  // 예약이 이미 낡았다.
  useEffect(() => {
    const api = window.electronAPI;
    const offResume = api?.onSystemResume?.(() => push());
    const onFocus = () => push();
    window.addEventListener('focus', onFocus);
    return () => {
      offResume?.();
      window.removeEventListener('focus', onFocus);
    };
  }, [push]);
}
