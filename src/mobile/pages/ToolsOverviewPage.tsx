const CLASSROOM_TOOLS = [
  { id: 'tool-traffic-light', emoji: '🚦', name: '신호등', desc: '활동 시작과 멈춤' },
  { id: 'tool-dice', emoji: '🎲', name: '주사위', desc: '운에 맡겨볼까?' },
  { id: 'tool-coin', emoji: '🪙', name: '동전', desc: '앞? 뒤?' },
  { id: 'tool-scoreboard', emoji: '📊', name: '점수판', desc: '팀별 점수 관리' },
  { id: 'tool-timer', emoji: '⏱️', name: '타이머', desc: '시간 제한 활동에 딱!' },
  { id: 'tool-work-symbols', emoji: '🤫', name: '활동 기호', desc: '수업 모드를 한눈에' },
  { id: 'tool-random', emoji: '🎲', name: '랜덤뽑기', desc: '누가 발표할까?' },
  { id: 'tool-roulette', emoji: '🎯', name: '룰렛', desc: '돌려돌려 돌림판' },
  { id: 'tool-qrcode', emoji: '🔗', name: 'QR코드', desc: 'URL을 QR로 변환' },
];

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

      <div className="flex-1 overflow-auto p-4 space-y-5">
        {/* 교실 도구 섹션 */}
        <div>
          <p className="text-xs font-semibold text-sp-muted uppercase tracking-wider mb-3">🏫 교실 도구</p>
          <div className="grid grid-cols-2 gap-3">
            {CLASSROOM_TOOLS.map((tool) => (
              <button
                key={tool.id}
                onClick={() => onNavigate(tool.id)}
                className="rounded-xl glass-card p-4 text-left active:scale-[0.97] transition-transform"
              >
                <div className="text-2xl mb-2">{tool.emoji}</div>
                <p className="text-sm font-bold text-sp-text">{tool.name}</p>
                <p className="text-xs text-sp-muted mt-0.5 leading-snug">{tool.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* 관리 도구 섹션 */}
        <div>
          <p className="text-xs font-semibold text-sp-muted uppercase tracking-wider mb-3">📋 관리 도구</p>
          <div className="space-y-3">
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
      </div>
    </div>
  );
}
