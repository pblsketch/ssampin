/** 학교 알리미 탭 공용 빈 상태/안내 — 아이콘 + 한 줄 설명. */
export function EmptyNotice({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <span className="material-symbols-outlined text-6xl text-sp-muted/40 mb-4">{icon}</span>
      <p className="text-sp-muted text-sm max-w-md">{text}</p>
    </div>
  );
}
