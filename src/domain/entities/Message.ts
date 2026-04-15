/** 메시지 배너 아이콘 프리셋 */
export type MessageIcon =
  | 'verified'
  | 'star'
  | 'favorite'
  | 'campaign'
  | 'celebration'
  | 'school'
  | 'emoji_objects'
  | 'warning'
  | 'info'
  | 'mood'
  | 'auto_stories'
  | 'psychiatry'
  | 'none';

/** 메시지 배너 색상 프리셋 */
export type MessageColorPreset =
  | 'theme'
  | 'emerald'
  | 'blue'
  | 'purple'
  | 'amber'
  | 'rose'
  | 'slate'
  | 'teal'
  | 'custom';

/** 색상 프리셋 → 실제 색상 매핑 */
export const MESSAGE_COLOR_MAP: Record<Exclude<MessageColorPreset, 'custom' | 'theme'>, {
  bg: string;
  border: string;
  icon: string;
  text: string;
  sub: string;
}> = {
  emerald: { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.2)', icon: '#10b981', text: '#34d399', sub: 'rgba(52,211,153,0.8)' },
  blue:    { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.2)', icon: '#3b82f6', text: '#60a5fa', sub: 'rgba(96,165,250,0.8)' },
  purple:  { bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.2)', icon: '#8b5cf6', text: '#a78bfa', sub: 'rgba(167,139,250,0.8)' },
  amber:   { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', icon: '#f59e0b', text: '#fbbf24', sub: 'rgba(251,191,36,0.8)' },
  rose:    { bg: 'rgba(244,63,94,0.1)',  border: 'rgba(244,63,94,0.2)',  icon: '#f43f5e', text: '#fb7185', sub: 'rgba(251,113,133,0.8)' },
  slate:   { bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)', icon: '#64748b', text: '#94a3b8', sub: 'rgba(148,163,184,0.8)' },
  teal:    { bg: 'rgba(20,184,166,0.1)', border: 'rgba(20,184,166,0.2)', icon: '#14b8a6', text: '#2dd4bf', sub: 'rgba(45,212,191,0.8)' },
};

/** 메시지 배너 스타일 설정 */
export interface MessageStyle {
  readonly icon: MessageIcon;
  readonly colorPreset: MessageColorPreset;
  readonly customColor?: string;
  readonly subtitle: string;
  readonly collapsed?: boolean;
}

/** 기본 스타일 — 위젯 테마 연동 */
export const DEFAULT_MESSAGE_STYLE: MessageStyle = {
  icon: 'verified',
  colorPreset: 'theme',
  subtitle: '',
  collapsed: false,
};

export interface MessageData {
  readonly title: string;
  readonly content: string;
  readonly date: string;
  readonly visible: boolean;
  readonly style?: MessageStyle;
}
