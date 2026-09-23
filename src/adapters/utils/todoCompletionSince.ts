/**
 * 할 일 **완료 시각 기록 시작일** — 이 컴퓨터에서 완료 시각을 저장하는 쌤핀이 처음 실행된 날(spec 3-3).
 *
 * - 학기 돌아보기의 '끝낸 할 일'이 학기 중간부터 센 수인지 가르고("M월 D일부터 센 수예요"), 이 날짜보다
 *   앞선 완료 시각(구글 할 일이 준 옛 시각 등)은 세지 않는 기준이 된다.
 * - 메인·위젯·아이콘·빠른 추가 창이 모두 `main.tsx` 를 거치므로 **먼저 켜진 창**이 적는다. 한 번 적으면 바꾸지 않는다.
 * - 이 컴퓨터에만 둔다(localStorage). 읽을 수 없거나 깨져 있으면 null — 그때는 거르지 않고 안내는 날짜 없이 한다.
 */
import { toLocalDateString } from '@shared/utils/localDate';

const KEY = 'ssampin:todo-completion-since';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function readTodoCompletionSince(): string | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v !== null && DATE_RE.test(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * 값이 없으면 오늘로 적는다. 이미 있으면 그대로 둔다.
 * ★깨진 값도 덮지 않는다 — 오늘로 덮으면 진짜 시작일부터 오늘까지 끝낸 할 일이 조용히 빠진다. 깨진 값은 읽을 때
 *   null 이 되어 거르지 않고 날짜 없이 안내한다.
 */
export function markTodoCompletionSince(today: string = toLocalDateString()): void {
  try {
    if (window.localStorage.getItem(KEY) !== null) return;
    window.localStorage.setItem(KEY, today);
  } catch {
    // 저장 공간이 막혀도 앱은 그대로 — 안내만 날짜 없이 나간다.
  }
}

export const TODO_COMPLETION_SINCE_KEY = KEY;
