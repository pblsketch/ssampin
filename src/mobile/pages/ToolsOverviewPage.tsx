interface Props {
  onNavigate: (sub: string) => void;
  onBack: () => void;
}

export function ToolsOverviewPage({ onNavigate, onBack }: Props) {
  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-sp-border/30">
        <button onClick={onBack} className="text-sp-muted active:scale-95 transition-transform">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-base font-bold text-sp-text">쌤도구</h2>
      </header>

      <div className="flex-1 overflow-auto p-4 space-y-3">
        {/* 과제 수합 */}
        <button
          onClick={() => onNavigate('tool-assignment')}
          className="w-full rounded-xl glass-card p-4 text-left active:scale-[0.98] transition-transform"
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-blue-500/15 shrink-0">
              <span className="material-symbols-outlined text-blue-400">assignment</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-sp-text">과제 수합</p>
              <p className="text-xs text-sp-muted mt-0.5">학생 과제 제출 현황 확인</p>
            </div>
            <span className="material-symbols-outlined text-sp-muted text-lg shrink-0">chevron_right</span>
          </div>
        </button>

        {/* 설문/체크리스트 */}
        <button
          onClick={() => onNavigate('tool-survey')}
          className="w-full rounded-xl glass-card p-4 text-left active:scale-[0.98] transition-transform"
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-purple-500/15 shrink-0">
              <span className="material-symbols-outlined text-purple-400">poll</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-sp-text">설문/체크리스트</p>
              <p className="text-xs text-sp-muted mt-0.5">설문 응답 현황 확인</p>
            </div>
            <span className="material-symbols-outlined text-sp-muted text-lg shrink-0">chevron_right</span>
          </div>
        </button>
      </div>
    </div>
  );
}
