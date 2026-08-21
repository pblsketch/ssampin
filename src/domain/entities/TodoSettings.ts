export type TodoMode = 'default' | 'pro';
export type TodoViewMode = 'todo' | 'kanban' | 'list' | 'timeline' | 'matrix' | 'autoBoard';
export type TodoProLayout = 'wide' | 'dual';

/**
 * 알림 문구에 할 일 내용을 얼마나 드러낼지.
 *
 * 윈도우 알림은 화면 오른쪽 아래에 그대로 뜬다 — PIN 잠금과 무관하고, 바탕화면 위젯
 * 모드나 교무실 큰 모니터에서도 읽힌다. 그런데 선생님들은 할 일에 학생 이름을 쓴다.
 * 그래서 기본은 건수만 알린다(오너 결정 2).
 */
export type TodoAlarmTextExposure = 'countOnly' | 'full';

export interface TodoSettings {
  /** 기능 모드 (기본: 'default') */
  readonly mode: TodoMode;

  /** 프로 모드 기본 뷰 (기본: 'todo') */
  readonly defaultView: TodoViewMode;

  /** 마지막으로 사용한 뷰 (프로 모드 뷰 전환 시 기억) */
  readonly lastView?: TodoViewMode;

  /** 프로 모드 레이아웃 ('default' | 'wide' | 'dual') */
  readonly proLayout?: TodoProLayout;

  // ─── 알림 설정 ───────────────────────────────────────────────
  //
  // ★ 알람 **켬/끔 스위치는 여기 없다.** 이 설정들은 `Settings.todoSettings` 안에 살아
  //   `settings.json`으로 저장되고 **구글 드라이브로 기기 사이를 오간다**(syncRegistry의
  //   'settings' 도메인). 켬/끔이 여기 있으면 "껐는데 다른 기기의 오래된 사본이 되살리는"
  //   일이 생기고, 그러면 되돌리기 1순위 수단이 무력화된다(오너 결정 1 = ㉰).
  //   켬/끔은 기기별이므로 `@adapters/repositories/todoAlarmDeviceState` 가 따로 갖는다.
  //   아래 값들은 기기 간 공유가 오히려 편해서 그대로 둔다.

  /** 예정 시각보다 몇 분 먼저 알릴지 (기본 0 = 정각) */
  readonly alarmLeadMinutes?: number;
  /** 하루에 띄울 알림 최대 건수 (기본 8). 발화하는 **날짜별**로 적용한다 */
  readonly alarmDailyCap?: number;
  /** 시각을 안 적은 할 일의 기본 알림 시각 "HH:mm" (기본 '09:00') */
  readonly alarmDefaultTime?: string;
  /** 알림 문구 노출 수준 (기본 'countOnly' = 건수만) */
  readonly alarmTextExposure?: TodoAlarmTextExposure;
  /** 며칠 앞까지 예약할지 (기본 14). 1년치 할 일을 넣어 두는 사용자를 위한 상한 */
  readonly alarmHorizonDays?: number;
}

export const DEFAULT_TODO_SETTINGS: TodoSettings = {
  mode: 'default',
  defaultView: 'todo',
};
