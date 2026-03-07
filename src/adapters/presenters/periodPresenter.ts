/** 교시(period) 값을 UI 표시용 레이블로 변환 */
export function periodToLabel(period: string): string {
  if (period === 'afterSchool') return '방과후';
  if (period === 'allDay') return '종일';
  return `${period}교시`;
}
