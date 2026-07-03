const CLASSROOM_TOOLS = [
  { id: 'tool-traffic-light', icon: 'traffic', name: '신호등', desc: '활동 시작과 멈춤' },
  { id: 'tool-dice', icon: 'casino', name: '주사위', desc: '운에 맡겨볼까?' },
  { id: 'tool-coin', icon: 'paid', name: '동전', desc: '앞? 뒤?' },
  { id: 'tool-scoreboard', icon: 'scoreboard', name: '점수판', desc: '팀별 점수 관리' },
  { id: 'tool-timer', icon: 'timer', name: '타이머', desc: '시간 제한 활동에 딱!' },
  { id: 'tool-work-symbols', icon: 'front_hand', name: '활동 기호', desc: '수업 모드를 한눈에' },
  { id: 'tool-random', icon: 'shuffle', name: '랜덤뽑기', desc: '누가 발표할까?' },
  { id: 'tool-roulette', icon: 'donut_large', name: '룰렛', desc: '돌려돌려 돌림판' },
  { id: 'tool-qrcode', icon: 'qr_code_2', name: 'QR코드', desc: 'URL을 QR로 변환' },
  { id: 'tool-grouping', icon: 'groups', name: '모둠 편성기', desc: '조건별 모둠 구성' },
  {
    id: 'tool-score-allocator',
    icon: 'calculate',
    name: '배점 계산기',
    desc: '지필 문항 배점 설계',
  },
];

// 관리 도구 — 도구별 Material Symbol. 칩 배경/아이콘 색은 교실 도구와 동일한 중립 토큰 계열로 통일.
const MANAGEMENT_TOOLS = [
  {
    id: 'tool-assignment',
    icon: 'assignment',
    name: '과제 수합',
    desc: '학생 과제 제출 현황 확인',
  },
  { id: 'tool-survey', icon: 'poll', name: '설문/체크리스트', desc: '설문 응답 현황 확인' },
  { id: 'tool-rubric', icon: 'grading', name: '수행평가 채점', desc: '평가지 점수 입력' },
];

// 아이콘 칩 — 앱 전역(설치 배너·온보딩 메달리온)과 동일한 중립 틴트.
// sp 토큰 알파 수식(bg-sp-accent/NN)은 클래스가 생성되지 않아 무효이므로 black/white 알파를 쓴다.
const CHIP_CLASS =
  'flex items-center justify-center rounded-xl bg-black/5 text-sp-accent dark:bg-white/10';

interface Props {
  onNavigate: (sub: string) => void;
  onBack: () => void;
}

export function ToolsOverviewPage({ onNavigate, onBack }: Props) {
  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-sp-border/30">
        <button
          onClick={onBack}
          aria-label="뒤로"
          className="flex h-11 w-11 shrink-0 items-center justify-center -ml-2 text-sp-muted active:scale-95 transition-transform"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-base font-bold text-sp-text">쌤도구</h2>
      </header>

      <div className="flex-1 overflow-auto p-4 space-y-5">
        {/* 교실 도구 섹션 */}
        <div>
          <p className="text-xs font-semibold text-sp-muted uppercase tracking-wider mb-3">
            교실 도구
          </p>
          <div className="grid grid-cols-2 gap-3">
            {CLASSROOM_TOOLS.map((tool) => (
              <button
                key={tool.id}
                onClick={() => onNavigate(tool.id)}
                className="rounded-xl glass-card p-4 text-left active:scale-[0.97] transition-transform"
              >
                <div className={`${CHIP_CLASS} mb-2 h-11 w-11`}>
                  <span className="material-symbols-outlined text-icon-xl">{tool.icon}</span>
                </div>
                <p className="text-sm font-bold text-sp-text">{tool.name}</p>
                <p className="text-xs text-sp-muted mt-0.5 leading-snug">{tool.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* 관리 도구 섹션 */}
        <div>
          <p className="text-xs font-semibold text-sp-muted uppercase tracking-wider mb-3">
            관리 도구
          </p>
          <div className="space-y-3">
            {MANAGEMENT_TOOLS.map((tool) => (
              <button
                key={tool.id}
                onClick={() => onNavigate(tool.id)}
                className="w-full rounded-xl glass-card p-4 text-left active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-3">
                  <div className={`${CHIP_CLASS} h-11 w-11 shrink-0`}>
                    <span className="material-symbols-outlined">{tool.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-sp-text">{tool.name}</p>
                    <p className="text-xs text-sp-muted mt-0.5">{tool.desc}</p>
                  </div>
                  <span className="material-symbols-outlined text-sp-muted text-lg shrink-0">
                    chevron_right
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
