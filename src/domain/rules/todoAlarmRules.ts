import type { Todo } from '@domain/entities/Todo';
import type { TodoSettings } from '@domain/entities/TodoSettings';
import { wallClockToEpochMs } from '@domain/rules/todoTime';

/**
 * 할 일 시각 알람 — 무엇을 언제 울릴지 계산하는 **순수 규칙**.
 *
 * ★ 이 파일은 시계를 직접 읽지 않는다(`new Date`·`Date.now` 없음). 지금 시각과 시간대
 *   오프셋은 바깥에서 받는다 — 안 그러면 같은 코드가 개발자 PC(한국)와 CI(UTC)에서
 *   다른 값을 내서 테스트가 어느 한쪽에서만 통과한다. 회귀 검사 #58 이 이걸 지킨다.
 *
 * domain 레이어이므로 외부 의존성을 import 하지 않는다.
 */

/** main 으로 보낼 예약 한 건. `electron/ipc/reminderCore.ts` 의 `ReminderScheduleItem` 과 같은 모양. */
export interface TodoAlarmScheduleItem {
  readonly reminderId: string;
  readonly fireAt: number;
  readonly expiresAt: number;
  readonly title: string;
  readonly body: string;
  readonly studentDedupKey: string;
}

/** 알림 제목은 **항상 이 한 줄**이다 — 제목에 할 일 내용을 섞지 않는다(오너 결정 2). */
export const TODO_ALARM_TITLE = '할 일 알림';

export const DEFAULT_ALARM_LEAD_MINUTES = 0;
export const DEFAULT_ALARM_DAILY_CAP = 8;
/**
 * 하루 상한 "제한 없음"을 뜻하는 값.
 *
 * `undefined` 를 쓰지 않는 이유: 그건 이미 "설정한 적 없음 = 기본값 8건"이라는 뜻이라
 * "일부러 제한을 풀었다"와 구분되지 않는다. `Infinity` 도 쓰지 않는다 — 설정 파일이
 * JSON 이라 저장하는 순간 `null` 이 되어 값이 조용히 사라진다.
 */
export const ALARM_DAILY_CAP_UNLIMITED = 0;
export const DEFAULT_ALARM_DEFAULT_TIME = '09:00';
export const DEFAULT_ALARM_HORIZON_DAYS = 14;
/** 기본 유예 창 2시간 — 절전에서 늦게 깨어난 경우까지는 울리고, 그보다 오래 지나면 버린다. */
export const DEFAULT_ALARM_GRACE_MS = 2 * 60 * 60 * 1000;

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2, none: 3 };

function priorityRank(todo: Todo): number {
  return PRIORITY_ORDER[todo.priority ?? 'none'] ?? 3;
}

/**
 * 발화 시각이 **현지 날짜로 며칠인지**. 하루 상한을 이 값으로 묶는다.
 *
 * "오늘 몇 건"이 아니라 "울리는 날 기준 몇 건"이어야 한다 — 안 그러면 내일 울릴 10건이
 * 오늘 몫의 상한을 다 먹어 치우고 오늘 알림이 사라진다.
 */
function localDayIndex(epochMs: number, offsetMinutes: number): number {
  return Math.floor((epochMs + offsetMinutes * MS_PER_MINUTE) / MS_PER_DAY);
}

/**
 * 알림 문구. **기본은 건수만 알린다.**
 *
 * 윈도우 알림은 화면 오른쪽 아래에 그대로 뜬다 — PIN 잠금과 무관하고, 바탕화면 위젯
 * 모드나 교무실 큰 모니터에서도 읽힌다. 선생님들은 할 일에 학생 이름을 쓴다
 * ("김OO 학부모 상담 회신"). 그래서 `alarmTextExposure` 가 `'full'` 일 때만 내용을 넣는다.
 */
function buildBody(todo: Todo, exposure: TodoSettings['alarmTextExposure']): string {
  if (exposure === 'full') return todo.text;
  return '확인할 일이 1건 있습니다';
}

/** 후보 시각을 고른다 — 마감일과 점검 날짜 둘 다 알림 대상이다. */
function candidateDates(todo: Todo): readonly string[] {
  const out: string[] = [];
  if (typeof todo.dueDate === 'string' && todo.dueDate !== '') out.push(todo.dueDate);
  if (typeof todo.checkAt === 'string' && todo.checkAt !== '' && todo.checkAt !== todo.dueDate) {
    out.push(todo.checkAt);
  }
  return out;
}

/**
 * 할 일 목록에서 OS 알람 예약을 만든다.
 *
 * @param todos 전체 할 일. 완료·보관된 것은 여기서 걸러진다.
 * @param settings 할 일 설정(미리 알림 분, 하루 상한, 기본 시각, 문구 노출, 예약 범위).
 * @param nowMs 지금 시각 (Unix ms). 어댑터가 넣는다.
 * @param offsetMinutes UTC 기준 동쪽 분. 한국은 540. 어댑터가 `-getTimezoneOffset()` 로 넣는다.
 * @param graceMs 유예 창 — 이 시간을 넘겨 늦게 발견되면 울리지 않는다.
 * @param horizonDays 며칠 앞까지 예약할지. **1년치 할 일이 매번 main 으로 넘어가는 것을 막는다.**
 */
export function buildTodoAlarmSchedule(
  todos: readonly Todo[],
  settings: TodoSettings,
  nowMs: number,
  offsetMinutes: number,
  graceMs: number = DEFAULT_ALARM_GRACE_MS,
  horizonDays: number = settings.alarmHorizonDays ?? DEFAULT_ALARM_HORIZON_DAYS,
): readonly TodoAlarmScheduleItem[] {
  const leadMinutes = settings.alarmLeadMinutes ?? DEFAULT_ALARM_LEAD_MINUTES;
  const dailyCap = settings.alarmDailyCap ?? DEFAULT_ALARM_DAILY_CAP;
  const defaultTime = settings.alarmDefaultTime ?? DEFAULT_ALARM_DEFAULT_TIME;
  const exposure = settings.alarmTextExposure ?? 'countOnly';
  const horizonEnd = nowMs + Math.max(0, horizonDays) * MS_PER_DAY;

  const candidates: Array<{ todo: Todo; item: TodoAlarmScheduleItem }> = [];

  for (const todo of todos) {
    if (todo.completed) continue;
    if (todo.archivedAt !== undefined) continue;

    for (const dateStr of candidateDates(todo)) {
      const base = wallClockToEpochMs(dateStr, todo.time ?? defaultTime, offsetMinutes);
      if (base === null) continue;
      const fireAt = base - leadMinutes * MS_PER_MINUTE;
      const expiresAt = fireAt + graceMs;
      /*
        ★ 자르는 기준은 "발화 시각"이 아니라 **"유예 창까지 지났는가"** 다.

        `fireAt <= nowMs` 로 자르면 **울려야 하는 바로 그 순간에 예약을 도로 거둬간다.**
        울리는 쪽(main)은 30초마다 한 번씩 확인하는데, 그 사이에 이 함수가 다시 불리면
        "이미 지난 시각"이라며 목록에서 빼 버리고, 그러면 알림은 영영 안 뜬다.
        실측된 사고다 — 01:54:30 에 1건 예약 → 01:55:00 에 0건 → 발화 기록 없음.

        유예 창까지 남겨 두면 "언제 버릴지"의 판단이 **울리는 쪽 한 곳**에만 있게 된다.
        덤으로, 컴퓨터가 꺼져 있어 놓친 알림도 유예 창 안이면 켤 때 울린다 — `expiresAt`
        을 만든 목적이 원래 그것이다.
      */
      if (expiresAt <= nowMs) continue;
      if (fireAt > horizonEnd) continue; // 지평 밖 — 그때 가서 다시 계산한다

      candidates.push({
        todo,
        item: {
          reminderId: `todo:${todo.id}:${fireAt}`,
          fireAt,
          expiresAt,
          title: TODO_ALARM_TITLE,
          body: buildBody(todo, exposure),
          // 출처별 중복 방지 열쇠. 할 일은 "그 날 그 할 일"이 단위다.
          studentDedupKey: `todo:${todo.id}:${dateStr}`,
        },
      });
    }
  }

  // 이른 것 먼저 → 급한 것 먼저 → id 사전순(같은 값이어도 결과가 흔들리지 않게).
  candidates.sort((a, b) => {
    if (a.item.fireAt !== b.item.fireAt) return a.item.fireAt - b.item.fireAt;
    const pr = priorityRank(a.todo) - priorityRank(b.todo);
    if (pr !== 0) return pr;
    return a.todo.id < b.todo.id ? -1 : a.todo.id > b.todo.id ? 1 : 0;
  });

  // 상한이 `ALARM_DAILY_CAP_UNLIMITED`(0) 이면 거르지 않는다 — 사용자가 일부러 푼 것이다.
  if (dailyCap <= ALARM_DAILY_CAP_UNLIMITED) {
    return candidates.map((c) => c.item);
  }

  // 하루 상한은 **울리는 날짜별**로 적용한다.
  const perDay = new Map<number, number>();
  const out: TodoAlarmScheduleItem[] = [];
  for (const { item } of candidates) {
    const day = localDayIndex(item.fireAt, offsetMinutes);
    const used = perDay.get(day) ?? 0;
    if (used >= dailyCap) continue;
    perDay.set(day, used + 1);
    out.push(item);
  }
  return out;
}
