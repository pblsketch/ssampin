/**
 * 벽시계 시각 → 절대 시각(Unix ms) 변환 — 순수 산술.
 *
 * 왜 `new Date('2026-08-21T14:00')` 를 쓰지 않는가:
 * 그 형태는 **실행하는 컴퓨터의 시간대**로 해석된다. 그래서 같은 코드가 개발자 PC(한국)와
 * CI 서버(UTC)에서 다른 값을 낸다 — 테스트가 어느 한쪽에서만 통과하는 고전적 함정이다.
 * 여기서는 시간대 오프셋을 **바깥에서 받아** 계산하므로 어디서 돌려도 결과가 같다.
 *
 * 오프셋은 어댑터가 `-new Date().getTimezoneOffset()`(UTC 기준 동쪽 분 단위)으로 넣는다.
 * 한국은 서머타임이 없어 고정 오프셋(+540)이 언제나 옳다.
 *
 * ★ 이 파일은 `Date` 를 쓰지 않는다 — `scripts/regression-grep-check.mjs` 의 규칙이 막는다.
 *
 * domain 레이어이므로 외부 의존성을 import 하지 않는다.
 */

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;

/** 그 달의 날 수. 윤년은 4의 배수이되 100의 배수는 제외, 400의 배수는 다시 포함. */
function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/**
 * 1970-01-01 부터 며칠째인지 (음수 가능).
 *
 * Howard Hinnant 의 `days_from_civil` 알고리즘. 3월을 해의 시작으로 보면 윤일이 해의
 * 끝에 오므로 분기 없이 계산된다. 400년(146097일) 주기를 그대로 이용한다.
 */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400; // [0, 399]
  const monthShifted = month > 2 ? month - 3 : month + 9; // 3월=0 … 2월=11
  const dayOfYear = Math.floor((153 * monthShifted + 2) / 5) + day - 1; // [0, 365]
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

/** "YYYY-MM-DD" 를 숫자로. 형식이나 범위가 어긋나면 null. */
function parseDateParts(dateStr: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (match === null) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

/** "HH:mm" 을 숫자로. 형식이나 범위가 어긋나면 null. */
function parseTimeParts(timeStr: string): { hh: number; mm: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(timeStr);
  if (match === null) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh > 23 || mm > 59) return null;
  return { hh, mm };
}

/**
 * 벽시계 날짜·시각을 절대 시각(Unix ms)으로 바꾼다.
 *
 * @param dateStr "YYYY-MM-DD"
 * @param timeStr "HH:mm"
 * @param offsetMinutes UTC 기준 동쪽 분. 한국은 540. UTC 는 0.
 * @returns Unix ms. 형식·범위가 어긋나면 null(호출한 쪽이 조용히 건너뛰도록).
 */
export function wallClockToEpochMs(
  dateStr: string,
  timeStr: string,
  offsetMinutes: number,
): number | null {
  if (!Number.isFinite(offsetMinutes)) return null;
  const date = parseDateParts(dateStr);
  if (date === null) return null;
  const time = parseTimeParts(timeStr);
  if (time === null) return null;

  const days = daysFromCivil(date.y, date.m, date.d);
  const secondsLocal =
    days * SECONDS_PER_DAY + time.hh * SECONDS_PER_HOUR + time.mm * SECONDS_PER_MINUTE;
  // 벽시계는 현지 시각이므로, UTC 로 되돌리려면 오프셋만큼 뺀다.
  return (secondsLocal - offsetMinutes * SECONDS_PER_MINUTE) * MS_PER_SECOND;
}
