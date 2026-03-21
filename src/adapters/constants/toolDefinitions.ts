export interface ToolDefinition {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly color: string;
}

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  { id: 'tool-seat-picker', name: '자리뽑기', icon: '🪑', color: 'bg-blue-500/20 text-blue-400' },
  { id: 'tool-random', name: '랜덤뽑기', icon: '🎲', color: 'bg-purple-500/20 text-purple-400' },
  { id: 'tool-timer', name: '타이머', icon: '⏱', color: 'bg-green-500/20 text-green-400' },
  { id: 'tool-work-symbols', name: '활동기호', icon: '🎯', color: 'bg-yellow-500/20 text-yellow-400' },
  { id: 'tool-roulette', name: '룰렛', icon: '🎡', color: 'bg-pink-500/20 text-pink-400' },
  { id: 'tool-qrcode', name: 'QR코드', icon: '🔗', color: 'bg-cyan-500/20 text-cyan-400' },
  { id: 'tool-wordcloud', name: '워드클라우드', icon: '☁️', color: 'bg-indigo-500/20 text-indigo-400' },
  { id: 'tool-dice', name: '주사위', icon: '🎲', color: 'bg-orange-500/20 text-orange-400' },
  { id: 'tool-poll', name: '투표', icon: '📊', color: 'bg-teal-500/20 text-teal-400' },
  { id: 'tool-scoreboard', name: '점수판', icon: '📋', color: 'bg-red-500/20 text-red-400' },
  { id: 'tool-traffic-light', name: '신호등', icon: '🚦', color: 'bg-emerald-500/20 text-emerald-400' },
  { id: 'tool-survey', name: '설문조사', icon: '📝', color: 'bg-violet-500/20 text-violet-400' },
  { id: 'tool-assignment', name: '과제수합', icon: '📮', color: 'bg-amber-500/20 text-amber-400' },
  { id: 'tool-coin', name: '동전던지기', icon: '🪙', color: 'bg-slate-500/20 text-slate-400' },
];

export const DEFAULT_FAVORITE_TOOLS: readonly string[] = [
  'tool-seat-picker',
  'tool-random',
  'tool-timer',
  'tool-work-symbols',
];

export function getToolDefinition(id: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.id === id);
}
