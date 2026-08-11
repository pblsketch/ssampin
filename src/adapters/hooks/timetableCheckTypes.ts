/**
 * 시간표 원천(컴시간·압핀) 변동 확인 결과 타입.
 *
 * 확인 로직은 "판정"만 하고 "안내 방식"은 호출한 화면이 정한다.
 * 메인 창은 토스트로 알리지만 위젯 창에는 토스트 표시기(ToastContainer)가 없어서
 * (App.tsx WidgetApp) 같은 방식으로는 아무것도 보이지 않기 때문이다.
 */
export type TimetableCheckStatus =
  /** 연동 전(또는 교사 지문 없음) — 서버 조회를 하지 않았다 */
  | 'not-configured'
  /** 서버 연결 실패 */
  | 'fetch-failed'
  /** 교사 자동 매칭 실패 → 사용자가 본인을 다시 선택해야 함 (컴시간 전용) */
  | 'unmatched'
  /** 변경 없음 */
  | 'unchanged'
  /** autoApply 옵션이 켜져 있어 즉시 반영됨 */
  | 'applied'
  /** 변경 감지 → 검토 대기(비파괴) */
  | 'pending';

export interface TimetableCheckResult {
  readonly status: TimetableCheckStatus;
  /** 바뀐 칸 수. not-configured / fetch-failed / unmatched / unchanged 는 0 */
  readonly changeCount: number;
}

/** 확인 대상 원천 */
export type TimetableSource = 'comcigan' | 'appin';

export const SOURCE_LABEL: Record<TimetableSource, string> = {
  comcigan: '컴시간',
  appin: '압핀',
};
