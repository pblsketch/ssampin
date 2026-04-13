export interface ToolDefinition {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly color: string;
  readonly externalUrl?: string;
}

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  { id: 'tool-seat-picker', name: '자리뽑기', icon: '🪑', color: 'bg-blue-500/20 text-blue-600' },
  { id: 'tool-random', name: '랜덤뽑기', icon: '🎲', color: 'bg-purple-500/20 text-purple-600' },
  { id: 'tool-timer', name: '타이머', icon: '⏱', color: 'bg-green-500/20 text-green-600' },
  { id: 'tool-work-symbols', name: '활동기호', icon: '🤫', color: 'bg-yellow-500/20 text-yellow-600' },
  { id: 'tool-roulette', name: '룰렛', icon: '🎡', color: 'bg-pink-500/20 text-pink-600' },
  { id: 'tool-qrcode', name: 'QR코드', icon: '🔗', color: 'bg-cyan-500/20 text-cyan-600' },
  { id: 'tool-wordcloud', name: '워드클라우드', icon: '☁️', color: 'bg-indigo-500/20 text-indigo-600' },
  { id: 'tool-dice', name: '주사위', icon: '🎲', color: 'bg-orange-500/20 text-orange-600' },
  { id: 'tool-poll', name: '객관식 설문', icon: '📊', color: 'bg-teal-500/20 text-teal-600' },
  { id: 'tool-scoreboard', name: '점수판', icon: '📋', color: 'bg-red-500/20 text-red-600' },
  { id: 'tool-traffic-light', name: '신호등', icon: '🚦', color: 'bg-emerald-500/20 text-emerald-600' },
  { id: 'tool-survey', name: '주관식 설문', icon: '📝', color: 'bg-violet-500/20 text-violet-600' },
  { id: 'tool-multi-survey', name: '복합 유형 설문', icon: '📋', color: 'bg-rose-500/20 text-rose-600' },
  { id: 'tool-assignment', name: '과제수합', icon: '📮', color: 'bg-amber-500/20 text-amber-600' },
  { id: 'tool-coin', name: '동전던지기', icon: '🪙', color: 'bg-slate-500/20 text-slate-600' },
  { id: 'tool-grouping', name: '모둠 편성기', icon: '👥', color: 'bg-sky-500/20 text-sky-600' },
  { id: 'tool-valueline', name: '가치수직선 토론', icon: '📏', color: 'bg-lime-500/20 text-lime-600' },
  { id: 'tool-traffic-discussion', name: '신호등 토론', icon: '🚦', color: 'bg-fuchsia-500/20 text-fuchsia-600' },
  { id: 'tool-chalkboard', name: '칠판', icon: '🖍️', color: 'bg-stone-500/20 text-stone-600' },
  { id: 'tool-supsori', name: '숲소리', icon: '🌳', color: 'bg-green-600/20 text-green-700', externalUrl: 'https://supsori.com' },
  { id: 'tool-pblsketch', name: 'PBL스케치', icon: '🎯', color: 'bg-blue-600/20 text-blue-700', externalUrl: 'https://pblsketch.xyz' },
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
