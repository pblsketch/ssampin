import { formatDateKR } from '@adapters/components/common/calendarUtils';

interface DateGroupHeaderProps {
  /** YYYY-MM-DD */
  date: string;
  /** 선택: 해당 날짜 그룹의 기록 수. */
  count?: number;
}

/**
 * 날짜 그룹 헤더 공용 부품 — 날짜는 단일 포맷 {@link formatDateKR}("M월 D일")로 표시.
 * count를 주면 "N건"을 함께 노출(조회 화면 결과 가독성).
 */
export function DateGroupHeader({ date, count }: DateGroupHeaderProps) {
  return (
    <div className="text-xs text-sp-muted font-medium mb-1.5 px-1">
      {formatDateKR(date)}
      {count != null && <span className="ml-1.5">{count}건</span>}
    </div>
  );
}
