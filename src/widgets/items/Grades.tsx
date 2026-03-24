/**
 * 성적 현황 위젯 (placeholder)
 * TODO: 실제 성적 데이터 연동 시 구현
 */
export function Grades() {
  return (
    <div className="rounded-xl bg-sp-card p-4 h-full flex flex-col">
      <div className="mb-3 shrink-0">
        <h3 className="text-sm font-bold text-sp-text flex items-center gap-1.5"><span>📊</span>성적 현황</h3>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center text-sp-muted">
        <p className="text-sm">준비 중입니다</p>
      </div>
    </div>
  );
}
