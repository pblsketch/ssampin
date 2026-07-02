/**
 * 아이콘 모드 첫 활성화 시 1회성 안내 말풍선 (v2.0.2~).
 * 5초 후 자동 사라짐. settings.widget.icon.showCoachMark=false로 갱신.
 *
 * v2.2.7: 자체 absolute 배치 제거(창 밖 렌더 버그) — IconWindow 오버레이 영역이
 * 위치를 담당. 문구도 새 클릭 규칙(클릭=오늘 요약, 더블클릭=앱)으로 갱신.
 */
import { PIN_NAME } from './pinName';

export function CoachMark() {
  return (
    <div
      className="bg-sp-accent text-white text-xs rounded-xl px-3 py-2 shadow-lg whitespace-nowrap pointer-events-none animate-fade-in"
      role="status"
    >
      {PIN_NAME}에요! 클릭: 오늘 요약 · 더블클릭: 앱 열기 · 드래그: 이동
    </div>
  );
}
