export interface PeriodTime {
  readonly period: number;
  readonly start: string; // "HH:mm"
  readonly end: string; // "HH:mm"
  /**
   * 교사가 직접 붙인 교시 이름 (예: "창체", "동아리", "보충").
   * 없으면 화면에는 `${period}교시`가 표시된다.
   * 저장 시 normalizePeriodLabel을 거쳐 빈 값은 undefined로 정규화한다.
   */
  readonly label?: string;
}
