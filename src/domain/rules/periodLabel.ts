import type { PeriodTime } from '../valueObjects/PeriodTime';

/**
 * 교시 이름 최대 길이.
 * 시간표 격자·위젯·좌석표의 좁은 칸이 무너지지 않는 상한.
 */
export const PERIOD_LABEL_MAX_LENGTH = 6;

/**
 * 사용자가 입력한 교시 이름을 저장 가능한 형태로 정규화한다.
 *
 * - 앞뒤 공백 제거
 * - 공백만 남거나 빈 문자열이면 undefined (= 이름 없음)
 * - PERIOD_LABEL_MAX_LENGTH 초과분은 잘라낸다
 *
 * 빈 문자열을 그대로 저장하면 이후 모든 표시 판정이 갈리므로 반드시 undefined로 모은다.
 */
export function normalizePeriodLabel(raw: string | undefined | null): string | undefined {
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  return trimmed.slice(0, PERIOD_LABEL_MAX_LENGTH);
}

/** periodTimes에서 해당 교시의 이름을 찾는다 (없으면 undefined) */
function findLabel(
  period: number,
  periodTimes: readonly PeriodTime[] | undefined,
): string | undefined {
  if (!periodTimes) return undefined;
  return normalizePeriodLabel(periodTimes.find((pt) => pt.period === period)?.label);
}

/**
 * 교시 번호 → 화면 표시 이름.
 * 이름이 있으면 그 이름을, 없으면 `${period}교시`를 반환한다.
 *
 * periodTimes를 넘기지 않으면 항상 기본 라벨을 반환한다(하위 호환).
 */
export function resolvePeriodLabel(period: number, periodTimes?: readonly PeriodTime[]): string {
  return findLabel(period, periodTimes) ?? `${period}교시`;
}

/**
 * PeriodTime 객체를 이미 손에 들고 있을 때의 표시 이름.
 * 배열 전체를 넘겨 다시 찾을 필요가 없는 자리(시간표 행, 설정 표 행)에서 쓴다.
 */
export function periodTimeLabel(pt: PeriodTime): string {
  return normalizePeriodLabel(pt.label) ?? `${pt.period}교시`;
}

/**
 * 교시 배열이 통째로 교체될 때(컴시간 불러오기·자동 생성·마법사·온보딩)
 * next의 시각을 쓰되 같은 교시 번호의 기존 이름을 승계한다.
 *
 * - next에만 있는 교시는 이름 없이 남는다.
 * - prev에만 있던 교시의 이름은 버린다 — 없어진 교시의 이름을 엉뚱한 번호에 붙이지 않는다.
 * - next가 이미 이름을 갖고 있으면 그쪽이 이긴다(불러온 원본에 이름이 있는 경우).
 *
 * 이 함수를 거치지 않으면 선생님이 붙인 이름이 조용히 사라진다.
 */
export function mergePeriodLabels(
  prev: readonly PeriodTime[],
  next: readonly PeriodTime[],
): PeriodTime[] {
  const prevLabels = new Map<number, string>();
  for (const pt of prev) {
    const label = normalizePeriodLabel(pt.label);
    if (label) prevLabels.set(pt.period, label);
  }
  return next.map((pt) => {
    const own = normalizePeriodLabel(pt.label);
    const label = own ?? prevLabels.get(pt.period);
    return label ? { ...pt, label } : { period: pt.period, start: pt.start, end: pt.end };
  });
}

/**
 * 교시를 삭제한 뒤 번호를 다시 매길 때 쓴다.
 * 이름은 **번호가 아니라 남은 행**을 따라간다 — 3교시를 지웠을 때
 * 4교시에 붙어 있던 "창체"가 3교시로 내려와야지, 새 3교시(옛 4교시)가
 * 옛 3교시의 이름을 물려받으면 안 된다.
 */
export function renumberPeriodsKeepingLabels(rows: readonly PeriodTime[]): PeriodTime[] {
  return rows.map((pt, i) => {
    const label = normalizePeriodLabel(pt.label);
    const renumbered = { period: i + 1, start: pt.start, end: pt.end };
    return label ? { ...renumbered, label } : renumbered;
  });
}

/**
 * 교시 번호 → 좁은 칸용 짧은 이름.
 * 이름이 있으면 그 이름을, 없으면 번호만("1")을 반환한다.
 */
export function resolvePeriodShortLabel(
  period: number,
  periodTimes?: readonly PeriodTime[],
): string {
  return findLabel(period, periodTimes) ?? String(period);
}
