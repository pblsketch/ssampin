/**
 * 타이머 & 스톱워치 순수 함수
 *
 * 타이머·단계 타이머·발표 타이머가 같은 색·예고·초과 규칙을 쓴다(ADR-139).
 * 규칙을 여기 한곳에 두는 까닭: 예전에는 발표 타이머가 예고 시점을 10초로 박아 두어
 * 버튼("1분 전")과 실제 동작이 어긋났다.
 */

/** 타이머가 다룰 수 있는 가장 긴 시간(99:59). */
export const MAX_TIMER_SECONDS = 5999;
/** 설정 시간의 최소값. ± 조정으로 이보다 줄이지 않는다. */
export const MIN_TIMER_SECONDS = 1;
/** 마지막 이 초 동안은 위험색으로 칠한다. */
export const CRITICAL_SECONDS = 10;
/** 예고 알림이 꺼져 있을 때 경고색을 켜는 기준(초). */
export const DEFAULT_WARNING_SECONDS = 60;

/** "05:30" 형식 (타이머용) */
export function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 예고 알림을 트리거해야 하는지 판단 */
export function shouldTriggerPreWarning(
  remaining: number,
  secondsBefore: number,
  alreadyTriggered: boolean,
): boolean {
  return !alreadyTriggered && remaining <= secondsBefore && remaining > 0;
}

/**
 * 이 시작(또는 재개)에서 예고 알림이 울릴 수 있는가.
 *
 * - 전체 시간이 예고 시점 이하인 짧은 타이머는 울리지 않는다.
 * - 이미 예고 시점 안에서 시작·재개했으면 울리지 않는다(시작하자마자 울리는 것을 막는다).
 */
export function isPreWarningArmed(
  remainingAtStart: number,
  totalSeconds: number,
  secondsBefore: number,
): boolean {
  return totalSeconds > secondsBefore && remainingAtStart > secondsBefore;
}

/** "01:23.45" 형식 (스톱워치용, ms 단위 입력) */
export function formatTimeMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  const cs = Math.floor((ms % 1000) / 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

// ── 색 단계 ──────────────────────────────────────────────────────────────

export type TimerColorLevel = 'normal' | 'warning' | 'critical';

/**
 * 경고색을 켤 기준(초).
 * 예고 알림이 켜져 있으면 그 시점, 꺼져 있으면 60초.
 */
export function warningThresholdSeconds(preWarning: {
  readonly enabled: boolean;
  readonly secondsBefore: number;
}): number {
  return preWarning.enabled ? preWarning.secondsBefore : DEFAULT_WARNING_SECONDS;
}

/**
 * 원 색 단계.
 *
 * - 임박: 남은 시간 ≤ 10초, 그리고 전체 시간 > 10초
 * - 경고: 남은 시간 ≤ 경고 기준, 그리고 전체 시간 > 경고 기준
 * - 그 밖에는 평소
 *
 * 전체 시간이 기준 이하인 짧은 타이머는 처음부터 경고색이 되어 경고로서 뜻이 없으므로
 * 그 단계를 건너뛴다.
 */
export function getTimerColorLevel(
  remaining: number,
  totalSeconds: number,
  warningThreshold: number,
): TimerColorLevel {
  if (totalSeconds > CRITICAL_SECONDS && remaining <= CRITICAL_SECONDS) return 'critical';
  if (totalSeconds > warningThreshold && remaining <= warningThreshold) return 'warning';
  return 'normal';
}

// ── 시간 조정 ────────────────────────────────────────────────────────────

/** 설정 시간을 1초~99:59 로 자른다. */
export function clampTimerSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return MIN_TIMER_SECONDS;
  return Math.min(MAX_TIMER_SECONDS, Math.max(MIN_TIMER_SECONDS, Math.round(seconds)));
}

/** ± 단추를 눌렀을 때 결과가 1초~99:59 안에 드는가(벗어나면 그 단추만 막는다). */
export function canAdjustSeconds(current: number, delta: number): boolean {
  const next = current + delta;
  return next >= MIN_TIMER_SECONDS && next <= MAX_TIMER_SECONDS;
}

// ── 초과 시간 ────────────────────────────────────────────────────────────

/** 끝난 시각부터 지금까지 넘긴 초. 99:59 에서 멈춘다. 시계가 되감기면 0. */
export function overtimeSeconds(finishedAt: number, now: number): number {
  if (!Number.isFinite(finishedAt) || !Number.isFinite(now)) return 0;
  const seconds = Math.floor(Math.max(0, now - finishedAt) / 1000);
  return Math.min(MAX_TIMER_SECONDS, seconds);
}

/** "+00:32" 형식. */
export function formatOvertime(seconds: number): string {
  return `+${formatTime(Math.min(MAX_TIMER_SECONDS, Math.max(0, seconds)))}`;
}

/** 기록용 짧은 형식 — "2:35", 넘긴 시간은 "+0:35". */
export function formatShortDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── 끝나는 시각 ──────────────────────────────────────────────────────────

/** "오후 2:35" 형식(이 기기의 시간대). */
export function formatClockTime(epochMs: number): string {
  const date = new Date(epochMs);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours < 12 ? '오전' : '오후';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${period} ${hour12}:${String(minutes).padStart(2, '0')}`;
}

/** 지금부터 남은 초가 흐른 뒤의 시각 — "오후 2:35". */
export function endClockTime(now: number, remainingSeconds: number): string {
  return formatClockTime(now + Math.max(0, remainingSeconds) * 1000);
}
