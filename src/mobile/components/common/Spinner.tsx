/**
 * 로딩 스피너 — `h-32` 컨테이너 + `progress_activity` 회전 아이콘.
 * ClassProgressTab·ClassObservationTab·MemoPage 에서 바이트 단위로 동일했던 블록을 공용화.
 */
export function Spinner() {
  return (
    <div className="flex items-center justify-center h-32">
      <span className="material-symbols-outlined text-sp-muted text-3xl animate-spin">
        progress_activity
      </span>
    </div>
  );
}
