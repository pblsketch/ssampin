/**
 * 쌤핀 AI — 화면 상태
 *
 * ★기본이 꺼짐이고, **꺼짐이 차단선**이다(계획서 §5.8, 성공 기준 5).
 * 꺼져 있으면 진입점이 렌더되지 않고 `ssampin-assist` 요청이 **0건**이다.
 * `ask()` 도 스스로 확인해서, 화면을 우회해 불러도 나가지 않게 한다.
 *
 * ★고지문 버전을 둔 이유 (`useAiBridgeConsentStore` 선례와 같다)
 * 무료로 받아 쓰는 한 "보낸 내용이 학습에 쓰일 수 있다"를 알려야 하는데,
 * 문구가 바뀌면 **버전만 올리면 다음 켤 때 다시 안내**된다.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { screenAssistInput, type AssistInputScreening } from '@domain/rules/screenAssistInput';
import { redactOutbound, restoreModelText } from '@domain/rules/redactOutbound';
import type { MaskMapping } from '@domain/privacy/types';
import { findAssistTool } from '@domain/services/assistToolRegistry';
import type { KeywordGroup } from '@domain/privacy/types';
import type { AssistDegraded, AssistPort, AssistTurnPayload } from '@domain/ports/AssistPort';
import { AssistBlockedError } from '@domain/ports/AssistPort';
import type { ToolResultShape } from '@domain/services/sanitizeToolResult';
import type { ModelSafe } from '@domain/entities/AssistTool';

/** 고지문이 바뀌면 이 숫자를 올린다. 다음에 켤 때 안내가 다시 뜬다. */
export const ASSIST_NOTICE_VERSION = 1;

/**
 * 도구 결과 한 건.
 *
 * ★`data` 가 `ModelSafe<ToolResultShape>` 인 것이 핵심이다.
 * `sanitizeToolResult`(그물 ②)를 거치지 않은 객체는 **여기에 들어올 수 없다** —
 * 브랜드 타입이라 `as` 없이는 만들 수 없고, 이 경로 어디에도 `as` 를 두지 않는다.
 * 포트(`AssistPort`)도 같은 타입만 받으므로 sanitize → 스토어 → 전송이 한 줄로 이어진다.
 */
export interface AssistCard {
  readonly tool: string;
  readonly data: ModelSafe<ToolResultShape>;
}

/** 화면에 그리는 한 덩어리. 숫자 카드가 먼저, AI 해설이 나중에 온다. */
export interface AssistTurn {
  readonly id: string;
  readonly question: string;
  /** 로컬에서 조회한 결과 — **모델을 안 거쳐도 화면에 남는다**(P5) */
  readonly cards: readonly AssistCard[];
  /** AI 해설. 아직 안 왔으면 빈 문자열 */
  readonly answer: string;
  /**
   * ★서버가 돌려준 **그대로의** 답(별칭이 살아 있는 쪽).
   * 다음 질문에 대화 이력으로 실어 보낼 때는 이것만 쓴다 — `answer` 는 별칭을
   * 실명으로 되돌린 화면용이라, 다시 보내면 가렸던 이름이 그대로 나가버린다.
   */
  readonly outboundAnswer: string;
  /** 이 턴과 함께 실제로 나갔던(가려진) 카드. 후속 질문에 다시 실어 보낼 때 쓴다 */
  readonly outboundCards: readonly AssistCard[];
  readonly degraded: AssistDegraded | null;
  readonly status: 'thinking' | 'done' | 'blocked';
  /** 전송이 막혔을 때 보여줄 한국어 문구 */
  readonly blockedMessage?: string;
  /** ★보내기 직전에 별칭으로 가린 곳 수. 0 이면 표시하지 않는다 */
  readonly maskedCount: number;
  /** ★연락처·주민번호가 있어 통째로 뺀 칸 수 */
  readonly blankedCount: number;
}

interface AssistState {
  /** ★기본 꺼짐 */
  readonly enabled: boolean;
  /** 확인한 고지문 버전. 0 이면 아직 안 봤다 */
  readonly acknowledgedNoticeVersion: number;
  readonly installId: string;
  readonly open: boolean;
  readonly turns: readonly AssistTurn[];
  readonly draft: string;
}

interface AssistActions {
  setEnabled: (value: boolean) => void;
  acknowledgeNotice: () => void;
  needsNotice: () => boolean;
  setOpen: (value: boolean) => void;
  setDraft: (value: string) => void;
  /** 입력창 위 「나갈 문장」 줄이 쓰는 판정. **막지 않는다 — 표시만 한다.** */
  screenDraft: () => AssistInputScreening;
  clearConversation: () => void;
  /**
   * @param roster 학생 이름 명단. **domain 이 스토어를 import 하지 않으므로 주입한다.**
   *   생략할 수 없게 필수로 뒀다 — 빠뜨리면 이름이 그대로 나간다(QA 에서 실제로 그랬다).
   */
  ask: (
    port: AssistPort,
    question: string,
    cards: readonly AssistCard[],
    roster: readonly KeywordGroup[],
  ) => Promise<void>;
}

export type AssistStore = AssistState & AssistActions;

/**
 * ★폴백도 반드시 **UUID 모양**이어야 한다.
 *
 * 예전 폴백은 `t_1787...` 형태였는데, 서버는 `installId` 를 UUID 정규식으로만 받는다
 * (`supabase/functions/_shared/assistRequest.ts`). `crypto.randomUUID` 가 없는 환경에서
 * 선생님은 **이유를 알 수 없는 실패**만 보게 된다 — QA 에서 잡힌 결함.
 */
/** `crypto.randomUUID` 가 없을 때 쓰는 대체 생성기. **테스트에서 직접 부르려고 내보낸다.** */
export function uuidFallback(): string {
  const hex = (n: number): string =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  // 버전 4, variant 8~b 자리를 규격대로 채운다.
  const variant = '89ab'[Math.floor(Math.random() * 4)];
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? uuidFallback();
}

/** 대화 이력은 모델에 다시 보내지 않는다(§8.2). 화면 표시용으로만 쌓인다. */
const MAX_TURNS_KEPT = 30;

/**
 * 서버 검증 한도의 거울값 — `supabase/functions/_shared/assistRequest.ts` 의 `LIMITS`.
 * 서버는 넘치면 400 으로 거절하므로 앱이 먼저 잘라 보낸다.
 * 두 값이 어긋나면 테스트('서버 한도와 같은 값이다')가 잡는다.
 */
export const ASSIST_SEND_LIMITS = {
  maxTurns: 12,
  maxTurnChars: 2_000,
  maxTotalChars: 8_000,
  maxToolResults: 6,
} as const;

/**
 * 서버로 보낼 대화 턴을 만든다 — **직전 대화를 함께 싣는다** (ADR-067).
 *
 * 예전에는 질문 하나만 보냈다(§8.2). 그 결과 "오늘 할 일 있나" → "8개" →
 * "어떤 일인지 알려줘"에 모델이 앱 소개로 답했다 — 앞 대화를 전혀 모르니
 * "어떤 일"이 뭘 가리키는지 알 수 없었던 것이다(2026-08-23 오너 신고).
 *
 * 개인정보 면에서 새로 나가는 것은 없다: 질문은 보낼 때 이미 나갔던 원문이고,
 * 답변은 별칭이 살아 있는 `outboundAnswer` 쪽만 싣는다.
 *
 * 한도(서버 LIMITS)에 걸리면 **오래된 대화부터** 떨어져 나간다.
 */
export function buildHistoryTurns(
  prior: readonly AssistTurn[],
  question: string,
): AssistTurnPayload[] {
  const current: AssistTurnPayload = {
    role: 'user',
    content: question.slice(0, ASSIST_SEND_LIMITS.maxTurnChars),
  };
  let totalChars = current.content.length;
  const history: AssistTurnPayload[] = [];

  for (let i = prior.length - 1; i >= 0; i--) {
    const t = prior[i]!;
    // 막힌 턴은 서버가 또 거절하고(같은 검사를 다시 하므로), 진행 중 턴은 답이 없다.
    if (t.status !== 'done') continue;

    const pair: AssistTurnPayload[] = [];
    const q = t.question.slice(0, ASSIST_SEND_LIMITS.maxTurnChars);
    if (q.length > 0) pair.push({ role: 'user', content: q });
    const a = t.outboundAnswer.slice(0, ASSIST_SEND_LIMITS.maxTurnChars);
    if (a.length > 0) pair.push({ role: 'assistant', content: a });
    if (pair.length === 0) continue;

    const pairChars = pair.reduce((n, turn) => n + turn.content.length, 0);
    if (history.length + pair.length + 1 > ASSIST_SEND_LIMITS.maxTurns) break;
    if (totalChars + pairChars > ASSIST_SEND_LIMITS.maxTotalChars) break;
    history.unshift(...pair);
    totalChars += pairChars;
  }

  return [...history, current];
}

export const useAssistStore = create<AssistStore>()(
  persist(
    (set, get) => ({
      enabled: false,
      acknowledgedNoticeVersion: 0,
      installId: newId(),
      open: false,
      turns: [],
      draft: '',

      setEnabled: (value) => set({ enabled: value, ...(value ? {} : { open: false }) }),

      acknowledgeNotice: () => set({ acknowledgedNoticeVersion: ASSIST_NOTICE_VERSION }),

      needsNotice: () => get().acknowledgedNoticeVersion < ASSIST_NOTICE_VERSION,

      setOpen: (value) => {
        // 꺼져 있으면 열 수 없다. 화면을 우회해 불러도 마찬가지다.
        if (value && !get().enabled) return;
        set({ open: value });
      },

      setDraft: (value) => set({ draft: value }),

      screenDraft: () => screenAssistInput(get().draft),

      clearConversation: () => set({ turns: [], draft: '' }),

      ask: async (port, question, cards, roster) => {
        // ★차단선. 꺼져 있으면 **요청이 나가지 않는다**(성공 기준 5).
        if (!get().enabled) return;

        // ★그물 ③ — 나가기 직전 관문. **여기 말고 다른 통로가 없다.**
        //   화면에는 원본 카드가 그대로 남고(이름은 화면에 남는다),
        //   포트로 넘기는 것은 이름을 별칭으로 가린 사본이다(숫자만 밖으로 나간다).
        let maskedCount = 0;
        let blankedCount = 0;
        const outbound: AssistCard[] = [];
        // ★별칭 매핑은 **개인정보다.** 이 함수 안에서만 살고 상태에 저장하지 않는다.
        //   AI 답변을 화면에 띄우기 직전 되돌리는 데에만 쓴다.
        const mappings: MaskMapping[] = [];
        for (const card of cards) {
          const tool = findAssistTool(card.tool);
          if (!tool) continue; // 레지스트리에 없는 도구는 보내지 않는다
          const result = redactOutbound(tool, card.data, roster);
          maskedCount += result.maskedCount;
          blankedCount += result.blankedCount;
          // 자유 입력이 아닌 자리에서 걸렸다면 화이트리스트 설계가 잘못된 것이다 — 통째로 뺀다.
          if (result.blocked) continue;
          mappings.push(...result.mappings);
          outbound.push({ tool: card.tool, data: result.data });
        }

        // ★새 턴을 상태에 넣기 **전에** 이력을 만든다 — 자기 자신이 이력에 끼면 안 된다.
        const historyTurns = buildHistoryTurns(get().turns, question);

        // 후속 질문("어떤 일인지 알려줘")은 의도 규칙에 안 걸려 카드가 없다.
        // 그러면 모델이 직전에 본 숫자를 다시 봐야 답할 수 있으므로, **직전 턴에
        // 나갔던 카드**를 다시 싣는다. 이미 한 번 나간(가려진) 자료라 새 노출은 없다.
        let effectiveOutbound = outbound;
        if (effectiveOutbound.length === 0) {
          const lastWithCards = [...get().turns]
            .reverse()
            .find((t) => t.status === 'done' && t.outboundCards.length > 0);
          if (lastWithCards) effectiveOutbound = [...lastWithCards.outboundCards];
        }
        effectiveOutbound = effectiveOutbound.slice(0, ASSIST_SEND_LIMITS.maxToolResults);

        const id = newId();
        // 숫자 카드를 **먼저** 넣는다. 모델이 느려도, 심지어 죽어도 답의 절반은 이미 보인다.
        set((s) => ({
          turns: [
            ...s.turns,
            {
              id,
              question,
              cards,
              answer: '',
              outboundAnswer: '',
              outboundCards: effectiveOutbound,
              degraded: null,
              status: 'thinking' as const,
              maskedCount,
              blankedCount,
            },
          ].slice(-MAX_TURNS_KEPT),
          draft: '',
        }));

        const patch = (next: Partial<AssistTurn>): void => {
          set((s) => ({
            turns: s.turns.map((t) => (t.id === id ? { ...t, ...next } : t)),
          }));
        };

        try {
          const answer = await port.ask({
            installId: get().installId,
            turns: historyTurns,
            // ★`as` 가 없다. `c.data` 는 이미 `ModelSafe` 라 그대로 들어간다 —
            //   재구성을 안 거친 객체는 애초에 여기까지 못 온다(그물 ② 컴파일 강제).
            //   ★`cards` 가 아니라 `outbound` 다 — 이름을 지운 쪽만 나간다.
            toolResults: effectiveOutbound.map((c) => ({
              tool: c.tool,
              grade: 1 as const,
              data: c.data,
            })),
          });
          // ★별칭을 실제 이름으로 되돌린 뒤 화면에 올린다.
          //   모델은 ［이름1］ 만 봤고, 선생님은 "김지훈"을 본다.
          //   ★실측상 모델이 괄호를 자주 바꾸므로(〈이름1〉 등) 관대하게 되돌린다.
          patch({
            answer: restoreModelText(answer.text, mappings),
            // 이력용으로는 되돌리기 전(별칭 그대로)을 남긴다 — 위 outboundAnswer 주석 참조.
            outboundAnswer: answer.text,
            degraded: answer.degraded,
            status: 'done',
          });
        } catch (err) {
          if (err instanceof AssistBlockedError) {
            patch({ status: 'blocked', blockedMessage: err.message });
            return;
          }
          // 예상 밖 오류여도 **숫자 카드는 남긴다.**
          console.error('[assist] 질문 실패', err);
          patch({ degraded: 'upstream', status: 'done' });
        }
      },
    }),
    {
      name: 'ssampin-assist-v1',
      // ★대화 내용은 저장하지 않는다(§5.5). 설정과 식별자만 남긴다.
      partialize: (state) => ({
        enabled: state.enabled,
        acknowledgedNoticeVersion: state.acknowledgedNoticeVersion,
        installId: state.installId,
      }),
    },
  ),
);
