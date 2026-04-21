import type { PageId } from '@adapters/components/Layout/Sidebar';

interface ToolsGridProps {
  onNavigate: (page: PageId) => void;
}

interface ToolCard {
  id: PageId;
  emoji: string;
  name: string;
  description: string;
  externalUrl?: string;
  /** 'BETA' 등 상태 배지 표시 */
  badge?: string;
}

const TOOLS: ToolCard[] = [
  { id: 'tool-timer', emoji: '⏱️', name: '타이머', description: '시간 제한 활동에 딱!' },
  { id: 'tool-random', emoji: '🎲', name: '랜덤 뽑기', description: '공정한 발표자 선정' },
  { id: 'tool-traffic-light', emoji: '🚦', name: '신호등', description: '활동 시작과 멈춤' },
  { id: 'tool-scoreboard', emoji: '📊', name: '점수판', description: '팀별 점수 관리' },
  { id: 'tool-roulette', emoji: '🎯', name: '룰렛', description: '돌려서 정하기' },
  { id: 'tool-dice', emoji: '🎲', name: '주사위', description: '운에 맡겨볼까?' },
  { id: 'tool-coin', emoji: '🪙', name: '동전', description: '앞? 뒤?' },
  { id: 'tool-qrcode', emoji: '🔗', name: 'QR코드', description: '링크를 순식간에 공유' },
  { id: 'tool-work-symbols', emoji: '🤫', name: '활동 기호', description: '수업 모드를 한눈에' },
  { id: 'tool-poll', emoji: '📊', name: '객관식 설문', description: '의견을 모아봐요' },
  { id: 'tool-survey', emoji: '📝', name: '주관식 설문', description: '자유롭게 의견을 들어봐요' },
  { id: 'tool-multi-survey', emoji: '📋', name: '복합 유형 설문', description: '여러 질문 유형을 한 번에 설문' },
  { id: 'tool-wordcloud', emoji: '☁️', name: '워드클라우드 브레인스토밍', description: '떠오르는 단어를 모아봐요' },
  { id: 'tool-seat-picker', emoji: '🪑', name: '자리 뽑기', description: '내 손으로 뽑는 내 자리' },
  { id: 'tool-grouping', emoji: '👥', name: '모둠 편성기', description: '조건에 맞게 모둠을 편성' },
  { id: 'tool-assignment', emoji: '📋', name: '과제수합', description: '과제를 수합하고 제출 현황을 확인합니다' },
  { id: 'tool-valueline', emoji: '📏', name: '가치수직선 토론', description: '입장을 수직선 위에 표현' },
  { id: 'tool-traffic-discussion', emoji: '🚦', name: '신호등 토론', description: '찬성·보류·반대 의사 표현' },
  { id: 'tool-chalkboard', emoji: '🖍️', name: '칠판', description: '분필로 판서하기' },
  { id: 'tool-collab-board', emoji: '🎨', name: '협업 보드', description: '학생들과 실시간 협업 작업하기', badge: 'BETA' },
  { id: 'tool-forms', emoji: '📄', name: '서식', description: 'HWPX · PDF · Excel 서식 모아보기' },
  { id: 'tool-supsori', emoji: '🌳', name: '숲소리', description: '교육 웹진', externalUrl: 'https://supsori.com' },
  { id: 'tool-pblsketch', emoji: '🎯', name: 'PBL스케치', description: '수업 및 평가 설계 도구', externalUrl: 'https://pblsketch.xyz' },
];

function openExternal(url: string) {
  if (window.electronAPI?.openExternal) {
    void window.electronAPI.openExternal(url);
  } else {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      // Fallback: link click (e.g. popup blocked in browser dev mode)
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
    }
  }
}

export function ToolsGrid({ onNavigate }: ToolsGridProps) {
  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-sp-text flex items-center gap-2">
          <span className="material-symbols-outlined text-[28px]">construction</span>
          <span>쌤도구</span>
        </h1>
        <p className="text-sp-muted mt-1">수업에 바로 활용하는 교실 도구</p>
      </div>

      {/* Tool Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            onClick={() => tool.externalUrl ? openExternal(tool.externalUrl) : onNavigate(tool.id)}
            className="bg-sp-card rounded-2xl p-6 text-left border border-transparent hover:border-blue-500/30 hover:scale-[1.02] transition-all group"
          >
            <div className="text-4xl mb-3">{tool.emoji}</div>
            <h3 className="text-lg font-bold text-sp-text group-hover:text-sp-accent transition-colors flex items-center gap-1.5 flex-wrap">
              {tool.name}
              {tool.badge && (
                <span className="text-[10px] font-extrabold tracking-wider px-2 py-[3px] rounded-md bg-gradient-to-br from-amber-400 to-amber-500 text-amber-950 shadow-sm ring-1 ring-amber-500/50">
                  {tool.badge}
                </span>
              )}
              {tool.externalUrl && (
                <span className="material-symbols-outlined text-icon-sm text-sp-muted">open_in_new</span>
              )}
            </h3>
            <p className="text-sm text-sp-muted mt-1">{tool.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
