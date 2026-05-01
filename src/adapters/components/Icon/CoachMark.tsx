/**
 * 아이콘 모드 첫 활성화 시 1회성 안내 말풍선 (v2.0.2~).
 * 5초 후 자동 사라짐. settings.widget.icon.showCoachMark=false로 갱신.
 */
export function CoachMark() {
  return (
    <div
      className="absolute bottom-full mb-3 right-0 bg-sp-accent text-white text-xs rounded-xl px-3 py-2 shadow-xl whitespace-nowrap pointer-events-none animate-fade-in"
      role="status"
    >
      드래그로 이동 · 클릭으로 위젯 열기
      <div className="absolute -bottom-1 right-6 w-2 h-2 bg-sp-accent rotate-45" />
    </div>
  );
}
