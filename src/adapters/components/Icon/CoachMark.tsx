/**
 * 아이콘 모드 첫 활성화 시 1회성 안내 말풍선 (v2.0.2~).
 * 5초 후 자동 사라짐. settings.widget.icon.showCoachMark=false로 갱신.
 *
 * v2.2.7: 자체 absolute 배치 제거(창 밖 렌더 버그) — IconWindow 오버레이 영역이
 * 위치를 담당. 문구도 새 클릭 규칙(클릭=오늘 요약, 더블클릭=앱)으로 갱신.
 *
 * #147 B-2: 수동 닫기(×) 추가. 자동 소멸이 어떤 이유로든 실패해도 사용자가 직접
 * 치울 수 있어야 한다. 말풍선 본체는 계속 pointer-events-none(아래 창으로 클릭 통과)
 * 이고, 닫기 버튼만 pointer-events-auto로 살린다.
 */
import { PIN_NAME } from './pinName';

interface CoachMarkProps {
  /** ×를 눌러 즉시 닫기 (누르면 "봤음"으로 영구 저장) */
  readonly onClose?: () => void;
}

export function CoachMark({ onClose }: CoachMarkProps) {
  return (
    <div
      className="bg-sp-accent text-white text-xs rounded-xl pl-3 pr-2 py-2 shadow-lg whitespace-nowrap pointer-events-none animate-fade-in flex items-center gap-2"
      role="status"
    >
      <span>{PIN_NAME}에요! 클릭: 오늘 요약 · 더블클릭: 앱 열기 · 드래그: 이동</span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="안내 닫기"
          className="pointer-events-auto shrink-0 rounded-md px-1 leading-none text-white/80 hover:text-white hover:bg-white/20 transition-colors"
        >
          ✕
        </button>
      )}
    </div>
  );
}
