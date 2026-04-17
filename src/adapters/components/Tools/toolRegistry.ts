import type { ComponentType } from 'react';
import type { PageId } from '@adapters/components/Layout/Sidebar';
import { ToolTimer } from '@adapters/components/Tools/Timer';
import { ToolRandom } from '@adapters/components/Tools/ToolRandom';
import { ToolTrafficLight } from '@adapters/components/Tools/ToolTrafficLight';
import { ToolScoreboard } from '@adapters/components/Tools/ToolScoreboard';
import { ToolRoulette } from '@adapters/components/Tools/ToolRoulette';
import { ToolDice } from '@adapters/components/Tools/ToolDice';
import { ToolCoin } from '@adapters/components/Tools/ToolCoin';
import { ToolQRCode } from '@adapters/components/Tools/ToolQRCode';
import { ToolWorkSymbols } from '@adapters/components/Tools/ToolWorkSymbols';
import { ToolPoll } from '@adapters/components/Tools/ToolPoll';
import { ToolSurvey } from '@adapters/components/Tools/ToolSurvey';
import { ToolMultiSurvey } from '@adapters/components/Tools/ToolMultiSurvey';
import { ToolWordCloud } from '@adapters/components/Tools/ToolWordCloud';
import { ToolGrouping } from '@adapters/components/Tools/ToolGrouping';
import { ToolChalkboard } from '@adapters/components/Tools/ToolChalkboard';
import { ToolValueLine, ToolTrafficLightDiscussion } from '@adapters/components/Tools/Discussion';

/**
 * 듀얼 모드에서 사용 가능한 도구 식별자.
 *
 * 제외 사유:
 * - tool-supsori / tool-pblsketch: 외부 URL 링크 도구 (별도 브라우저 창)
 * - tool-assignment / tool-assignment-detail: { onBack, isFullscreen } 외 추가 props 요구
 * - tool-seat-picker: ToolSeatPicker.tsx:423-428가 document.fullscreenElement를 직접 제어 →
 *   슬롯 로컬 최대화와 충돌. Phase 2에서 DualToolContext 기반 분기 후 지원.
 *
 * 설계 근거: docs/02-design/features/dual-tool-view.design.md §2.1
 */
export type DualToolId = Extract<
  PageId,
  | 'tool-timer'
  | 'tool-random'
  | 'tool-traffic-light'
  | 'tool-scoreboard'
  | 'tool-roulette'
  | 'tool-dice'
  | 'tool-coin'
  | 'tool-qrcode'
  | 'tool-work-symbols'
  | 'tool-poll'
  | 'tool-survey'
  | 'tool-multi-survey'
  | 'tool-wordcloud'
  | 'tool-grouping'
  | 'tool-valueline'
  | 'tool-traffic-discussion'
  | 'tool-chalkboard'
>;

export interface ToolMeta {
  readonly id: DualToolId;
  readonly name: string;
  readonly emoji: string;
  readonly component: ComponentType<{
    onBack: () => void;
    isFullscreen: boolean;
  }>;
  /** 넓이 확보가 유리한 도구(점수판·설문 등)는 기본 분할 시 넓은 쪽에 자동 배치 힌트. */
  readonly prefersWide?: boolean;
}

export const TOOL_REGISTRY = {
  'tool-timer':              { id: 'tool-timer',              name: '타이머',             emoji: '⏱️', component: ToolTimer },
  'tool-random':             { id: 'tool-random',             name: '랜덤 뽑기',          emoji: '🎲', component: ToolRandom },
  'tool-traffic-light':      { id: 'tool-traffic-light',      name: '신호등',             emoji: '🚦', component: ToolTrafficLight },
  'tool-scoreboard':         { id: 'tool-scoreboard',         name: '점수판',             emoji: '📊', component: ToolScoreboard, prefersWide: true },
  'tool-roulette':           { id: 'tool-roulette',           name: '룰렛',               emoji: '🎯', component: ToolRoulette },
  'tool-dice':               { id: 'tool-dice',               name: '주사위',             emoji: '🎲', component: ToolDice },
  'tool-coin':               { id: 'tool-coin',               name: '동전',               emoji: '🪙', component: ToolCoin },
  'tool-qrcode':             { id: 'tool-qrcode',             name: 'QR코드',             emoji: '🔗', component: ToolQRCode },
  'tool-work-symbols':       { id: 'tool-work-symbols',       name: '활동 기호',          emoji: '🤫', component: ToolWorkSymbols },
  'tool-poll':               { id: 'tool-poll',               name: '객관식 설문',        emoji: '📊', component: ToolPoll, prefersWide: true },
  'tool-survey':             { id: 'tool-survey',             name: '주관식 설문',        emoji: '📝', component: ToolSurvey, prefersWide: true },
  'tool-multi-survey':       { id: 'tool-multi-survey',       name: '복합 유형 설문',     emoji: '📋', component: ToolMultiSurvey, prefersWide: true },
  'tool-wordcloud':          { id: 'tool-wordcloud',          name: '워드클라우드',       emoji: '☁️', component: ToolWordCloud, prefersWide: true },
  'tool-grouping':           { id: 'tool-grouping',           name: '모둠 편성기',        emoji: '👥', component: ToolGrouping, prefersWide: true },
  'tool-valueline':          { id: 'tool-valueline',          name: '가치수직선 토론',    emoji: '📏', component: ToolValueLine, prefersWide: true },
  'tool-traffic-discussion': { id: 'tool-traffic-discussion', name: '신호등 토론',        emoji: '🚦', component: ToolTrafficLightDiscussion, prefersWide: true },
  'tool-chalkboard':         { id: 'tool-chalkboard',         name: '칠판',               emoji: '🖍️', component: ToolChalkboard, prefersWide: true },
} as const satisfies Record<DualToolId, ToolMeta>;

export const DUAL_TOOL_LIST: readonly ToolMeta[] = Object.values(TOOL_REGISTRY);

export const DUAL_TOOL_IDS: readonly DualToolId[] = Object.keys(TOOL_REGISTRY) as DualToolId[];

export function isDualToolId(value: unknown): value is DualToolId {
  return typeof value === 'string' && (DUAL_TOOL_IDS as readonly string[]).includes(value);
}
