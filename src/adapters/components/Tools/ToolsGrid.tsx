import type { PageId } from '@adapters/components/Layout/Sidebar';

interface ToolsGridProps {
  onNavigate: (page: PageId) => void;
}

interface ToolCard {
  id: PageId;
  emoji: string;
  name: string;
  description: string;
}

const TOOLS: ToolCard[] = [
  { id: 'tool-timer', emoji: '\u23f1\ufe0f', name: '\ud0c0\uc774\uba38', description: '\uc2dc\uac04 \uc81c\ud55c \ud65c\ub3d9\uc5d0 \ub531!' },
  { id: 'tool-random', emoji: '\ud83c\udfb2', name: '\ub79c\ub364 \ubf51\uae30', description: '\uacf5\uc815\ud55c \ubc1c\ud45c\uc790 \uc120\uc815' },
  { id: 'tool-traffic-light', emoji: '\ud83d\udea6', name: '\uc2e0\ud638\ub4f1', description: '\ud65c\ub3d9 \uc2dc\uc791\uacfc \uba48\ucda4' },
  { id: 'tool-scoreboard', emoji: '\ud83d\udcca', name: '\uc810\uc218\ud310', description: '\ud300\ubcc4 \uc810\uc218 \uad00\ub9ac' },
  { id: 'tool-roulette', emoji: '\ud83c\udfaf', name: '\ub8f0\ub81b', description: '\ub3cc\ub824\uc11c \uc815\ud558\uae30' },
  { id: 'tool-dice', emoji: '\ud83c\udfb2', name: '\uc8fc\uc0ac\uc704', description: '\uc6b4\uc5d0 \ub9e1\uaca8\ubcfc\uae4c?' },
  { id: 'tool-coin', emoji: '\ud83e\ude99', name: '\ub3d9\uc804', description: '\uc55e? \ub4a4?' },
  { id: 'tool-qrcode', emoji: '🔗', name: 'QR코드', description: '링크를 순식간에 공유' },
  { id: 'tool-work-symbols', emoji: '🤫', name: '활동 기호', description: '수업 모드를 한눈에' },
  { id: 'tool-poll', emoji: '📊', name: '투표', description: '의견을 모아봐요' },
  { id: 'tool-seat-picker', emoji: '🪑', name: '자리 뽑기', description: '내 손으로 뽑는 내 자리' },
  { id: 'tool-supsori', emoji: '🌳', name: '숲소리', description: '교육 웹진' },
  { id: 'tool-pblsketch', emoji: '🎯', name: 'PBL스케치', description: '수업 및 평가 설계 도구' },
];

export function ToolsGrid({ onNavigate }: ToolsGridProps) {
  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
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
            onClick={() => onNavigate(tool.id)}
            className="bg-sp-card rounded-2xl p-6 text-left border border-transparent hover:border-blue-500/30 hover:scale-[1.02] transition-all group"
          >
            <div className="text-4xl mb-3">{tool.emoji}</div>
            <h3 className="text-lg font-bold text-white group-hover:text-sp-accent transition-colors">
              {tool.name}
            </h3>
            <p className="text-sm text-sp-muted mt-1">{tool.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
