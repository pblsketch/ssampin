/** 오프라인(로컬 캐시값) 표시 배지 — 학교 알리미 공시 탭 공용. */
export function OfflineBadge({ cachedAt }: { cachedAt: number | null }) {
  const days = cachedAt ? Math.floor((Date.now() - cachedAt) / 86_400_000) : 0;
  const when = days <= 0 ? '오늘 조회' : `${days}일 전 조회`;
  return (
    <span className="inline-flex items-center gap-1 text-caption text-sp-muted bg-sp-text/5 px-2 py-0.5 rounded-full">
      <span className="material-symbols-outlined text-sm">cloud_off</span>
      오프라인 · {when}
    </span>
  );
}
