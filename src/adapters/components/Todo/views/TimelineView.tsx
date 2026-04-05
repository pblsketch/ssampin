interface TimelineViewProps {
  categoryFilter: string | null;
}

export function TimelineView({ categoryFilter }: TimelineViewProps) {
  return (
    <div className="flex items-center justify-center py-16 text-sp-muted">
      <div className="text-center">
        <span className="text-4xl mb-3 block">▬</span>
        <p className="text-lg font-medium">타임라인 뷰 (준비 중)</p>
        {categoryFilter && <p className="text-sm mt-1">카테고리 필터: {categoryFilter}</p>}
      </div>
    </div>
  );
}
