import { resolvePeriodLabel } from '@domain/rules/periodLabel';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';

/**
 * 교시(period) 값을 UI 표시용 레이블로 변환.
 * periodTimes를 넘기면 교사가 붙인 교시 이름("창체" 등)을 우선 사용한다.
 */
export function periodToLabel(
  period: string,
  periodEnd?: string,
  periodTimes?: readonly PeriodTime[],
): string {
  if (period === 'afterSchool') return '방과후';
  if (period === 'allDay') return '종일';

  const start = Number(period);
  if (!Number.isFinite(start)) return `${period}교시`;

  if (periodEnd && periodEnd !== period) {
    const end = Number(periodEnd);
    if (!Number.isFinite(end)) return `${period}~${periodEnd}교시`;

    const startLabel = resolvePeriodLabel(start, periodTimes);
    const endLabel = resolvePeriodLabel(end, periodTimes);
    // 양쪽 다 이름이 없으면 기존처럼 "3~4교시"로 줄여 쓴다
    if (startLabel === `${start}교시` && endLabel === `${end}교시`) {
      return `${period}~${periodEnd}교시`;
    }
    return `${startLabel}~${endLabel}`;
  }

  return resolvePeriodLabel(start, periodTimes);
}
