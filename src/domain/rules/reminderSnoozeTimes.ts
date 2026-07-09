/**
 * 학생 관찰 기록 알림 — '나중에(미루기)' 시각 계산 (순수).
 * now 주입으로 결정론. 반환은 Unix ms(미루기 만료 시각).
 */
export type SnoozeWhen = 'hour1' | 'afternoon' | 'tomorrow';

/** 오후 기준 시각(15:00) — '오늘 오후'의 재알림 시점. */
const AFTERNOON_HOUR = 15;
/** 다음 날 재알림 시각(08:00) — 근무 시작 즈음. */
const TOMORROW_HOUR = 8;

/**
 * 미루기 만료 시각(Unix ms)을 계산한다.
 * - hour1:     지금부터 1시간 뒤
 * - afternoon: 오늘 15:00 (이미 지났으면 2시간 뒤로 폴백)
 * - tomorrow:  내일 08:00 (항상 미래)
 */
export function computeSnoozeUntil(now: Date, when: SnoozeWhen): number {
  const t = now.getTime();
  if (when === 'hour1') return t + 60 * 60 * 1000;
  if (when === 'afternoon') {
    const aft = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      AFTERNOON_HOUR,
      0,
      0,
      0,
    ).getTime();
    return aft > t ? aft : t + 2 * 60 * 60 * 1000;
  }
  // tomorrow
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    TOMORROW_HOUR,
    0,
    0,
    0,
  ).getTime();
}
