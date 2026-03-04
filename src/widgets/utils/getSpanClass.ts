/**
 * colSpan → responsive CSS grid span class
 * 최대 열 수를 초과하는 span은 클램핑.
 */
export function getSpanClass(colSpan: number, maxCols = 3): string {
  const effective = Math.min(colSpan, maxCols);
  if (effective <= 1) return 'col-span-1';
  return `col-span-1 md:col-span-${effective}`;
}
