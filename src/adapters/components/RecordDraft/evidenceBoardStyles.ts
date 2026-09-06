/**
 * 근거 정리 보드가 카드·열·하단 바에서 같이 쓰는 작은 클래스 묶음.
 * 보드(`RecordEvidenceBoard`)·카드(`EvidenceCard`)·열(`EvidenceColumn`)이 같은 모양의 단추·칩을 그린다.
 */

/** 작은 윤곽 단추. */
export const boardBtn =
  'rounded-lg px-2.5 py-1 text-xs font-medium ring-1 ring-sp-border transition-colors hover:bg-sp-surface';

/** 켜짐/꺼짐 칩(영역 필터·유형). */
export const boardChip = (on: boolean): string =>
  `rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors ${
    on
      ? 'bg-blue-500/10 text-sp-accent ring-blue-500/30'
      : 'text-sp-muted ring-sp-border hover:text-sp-text'
  }`;

/** YYYY-MM-DD → 'M/D'. */
export function shortDate(date?: string): string {
  if (!date) return '';
  const [, mm, dd] = date.split('-');
  return mm && dd ? `${Number(mm)}/${Number(dd)}` : date;
}
