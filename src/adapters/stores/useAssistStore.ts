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
import {
  ASSIST_PII_BLOCKED_MESSAGE,
  questionHasBlockingPii,
  restoreModelArguments,
  redactOutbound,
  redactQuestion,
  restoreModelText,
} from '@domain/rules/redactOutbound';
import { createMaskSession } from '@domain/privacy/maskEngine';
import type { MaskMapping } from '@domain/privacy/types';
import { findAssistTool } from '@domain/services/assistToolRegistry';
import type { KeywordGroup } from '@domain/privacy/types';
import type { AssistDegraded, AssistPort, AssistTurnPayload } from '@domain/ports/AssistPort';
import { toModelToolSchemas } from '@domain/services/assistToolRegistry';
import { AssistBlockedError } from '@domain/ports/AssistPort';
import type { ToolResultShape } from '@domain/services/sanitizeToolResult';
import type { ModelSafe } from '@domain/entities/AssistTool';
import type { AssistProposalState, AssistWriteProposal } from '@domain/entities/AssistWrite';
import { isWriteProposal } from '@domain/entities/AssistWrite';
import { isWriteTool } from '@usecases/assist/writes/buildWriteProposal';
import { mentionsWriteIntent } from '@domain/rules/assistWriteIntent';

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
  /**
   * ★실제로 나갔던(이름을 가린) 질문. 대화 이력으로 다시 실을 때는 이것만 쓴다 —
   * `question` 은 화면용 원문이라, 다시 보내면 가렸던 이름이 그대로 나가버린다.
   */
  readonly outboundQuestion?: string;
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
  /**
   * ★쓰기 **제안**. 저장된 것이 아니라 "저장할까요?"라는 종이 한 장이다(Phase 3).
   * 한 턴에 최대 하나 — 계획서의 "연속 실행·일괄 실행 없음(한 번에 한 건)".
   */
  readonly proposal?: AssistWriteProposal;
  readonly proposalState?: AssistProposalState;
  /** 실행 결과나 실패 사유. 선생님이 무슨 일이 일어났는지 알아야 한다 */
  readonly proposalMessage?: string;
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
    /**
     * 모델이 고른 도구를 로컬에서 실행하는 함수(옵션 A, ADR-067 이후).
     * 재구성(그물 ②)을 마친 카드를 돌려주거나, 모르는 도구면 null.
     * 없으면 종전처럼 정규식 카드 + 직전 카드 재전송만으로 동작한다.
     */
    executeTool?: (name: string, rawArguments: string) => AssistCard | null,
    /**
     * 모델이 고른 **쓰기** 도구를 제안으로 바꾸는 함수(Phase 3).
     *
     * ★이 자리에 "실행하는 함수"를 넘기지 않는다는 것이 안전 구조의 전부다.
     * 스토어는 저장할 방법을 아예 갖고 있지 않다 — 넘겨받은 것이 제안 조립기뿐이다.
     */
    /**
     * ★세 번째 인자는 **선생님이 친 말 그대로**(가리기 전)다. 모델이 반 이름 같은 값을
     * 흘리거나 옆 카드에서 베껴 올 때, 조립기가 선생님 말로 되찾을 수 있게 함께 넘긴다.
     * 밖으로 나가는 값이 아니다 — 앱 안에서 제안을 만드는 데만 쓴다.
     */
    proposeWrite?: (name: string, rawArguments: string, question: string) => AssistWriteOutcomeLike,
  ) => Promise<void>;
  /**
   * 제안의 상태를 바꾼다. 실제 저장은 **컨테이너**가 하고, 결과만 여기로 들어온다.
   * 스토어는 끝까지 저장 능력을 갖지 않는다.
   */
  settleProposal: (turnId: string, state: AssistProposalState, message?: string) => void;
}

/** `buildWriteProposal` 의 반환형과 같은 모양. domain 을 다시 import 하지 않으려고 좁게 받는다 */
export type AssistWriteOutcomeLike = AssistWriteProposal | { readonly reason: string };

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
  /**
   * 바로 뒤(최종 순서 기준)에 놓일 답변. 뒤에서 앞으로 훑으므로 "직전에 본 답"이
   * 곧 "이 답 다음에 오는 답"이다. 같으면 연속 중복이라 이번 것을 뺀다.
   *
   * ★뺀 것도 여기 남긴다 — 같은 답이 세 번 이어져도 **한 번만** 남기려는 것이다.
   */
  let lastSeenAnswer: string | undefined;

  for (let i = prior.length - 1; i >= 0; i--) {
    const t = prior[i]!;
    // 막힌 턴은 서버가 또 거절하고(같은 검사를 다시 하므로), 진행 중 턴은 답이 없다.
    if (t.status !== 'done') continue;

    const pair: AssistTurnPayload[] = [];
    // ★가려진 쪽(outboundQuestion)만 싣는다 — 원문을 실으면 이름이 매 턴 다시 나간다.
    const q = (t.outboundQuestion ?? t.question).slice(0, ASSIST_SEND_LIMITS.maxTurnChars);
    if (q.length > 0) pair.push({ role: 'user', content: q });
    const a = t.outboundAnswer.slice(0, ASSIST_SEND_LIMITS.maxTurnChars);
    // ★똑같은 답이 연달아 두 번 실리면 **모델이 세 번째도 그대로 따라 쓴다.**
    //
    //   2026-08-25 실사용: 출결 질문 두 개가 같은 답을 냈고(앞의 "처리해줘" 결함 탓),
    //   그다음 "관찰 기록 남겨줘"에 모델이 그 출결 답을 **글자 하나 안 틀리고** 세 번째로
    //   반복했다 — 도구 목록도 카드도 제대로 나갔는데도. 이력에 같은 문장이 연속으로
    //   놓이는 것 자체가 "이 말을 계속하라"는 신호가 된다.
    //
    //   앞 결함을 고치면 이 상황은 대부분 사라지지만(제안으로 맺히면 답 문장이 비어
    //   이력에 안 들어간다), 같은 조회를 두 번 물으면 언제든 다시 만들어진다.
    //   ★질문은 남기고 **중복된 답만** 뺀다 — 무엇을 물었는지는 문맥에 필요하고,
    //   같은 답을 두 번 실어서 얻는 정보는 하나도 없다.
    const duplicateAnswer = a.length > 0 && a === lastSeenAnswer;
    if (a.length > 0 && !duplicateAnswer) pair.push({ role: 'assistant', content: a });
    if (pair.length === 0) continue;
    // 답이 빈 턴(제안으로 맺힌 턴)은 질문만 남아 두 답 사이에 끼어든다 —
    // 그러면 더는 '연속'이 아니므로 기준을 비운다.
    lastSeenAnswer = a.length > 0 ? a : undefined;

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

      setEnabled: (value) =>
        set((s) => ({
          enabled: value,
          ...(value
            ? {}
            : {
                open: false,
                // ★끄는 순간 살아 있던 [실행] 버튼도 죽인다 — 꺼진 기능이 저장을
                //   일으키는 경로를 남기지 않는다 (2026-08-24 UltraQA).
                turns: s.turns.map((t) =>
                  t.proposalState === 'pending' ? { ...t, proposalState: 'expired' as const } : t,
                ),
              }),
        })),

      acknowledgeNotice: () => set({ acknowledgedNoticeVersion: ASSIST_NOTICE_VERSION }),

      needsNotice: () => get().acknowledgedNoticeVersion < ASSIST_NOTICE_VERSION,

      setOpen: (value) => {
        // 꺼져 있으면 열 수 없다. 화면을 우회해 불러도 마찬가지다.
        if (value && !get().enabled) return;
        if (!value) {
          // ★닫으면 미실행 제안은 소멸한다 — 닫았다 한참 뒤에 다시 열어 [실행]을 누르면,
          //   그 사이 화면에서 직접 지운 대상에 대해 "지웠어요"라고 거짓말하게 된다.
          set((s) => ({
            open: false,
            turns: s.turns.map((t) =>
              t.proposalState === 'pending' ? { ...t, proposalState: 'expired' as const } : t,
            ),
          }));
          return;
        }
        set({ open: value });
      },

      setDraft: (value) => set({ draft: value }),

      screenDraft: () => screenAssistInput(get().draft),

      clearConversation: () => {
        // ★[실행]으로 저장이 진행 중이면 지우지 않는다 (2026-08-24 UltraQA P2).
        //   지우면 settleProposal 이 결과를 적을 턴이 사라져, **저장은 됐는데 화면에는
        //   아무 말도 없는** 상태가 된다. 저장은 로컬 파일 쓰기라 금방 끝난다 —
        //   결과 문구가 뜬 뒤에 지우면 된다. 화면의 [새 대화] 버튼도 같은 조건으로
        //   비활성화된다(AssistDock).
        if (get().turns.some((t) => t.proposalState === 'running')) return;
        set({ turns: [], draft: '' });
      },

      settleProposal: (turnId, state, message) =>
        set((s) => ({
          turns: s.turns.map((t) =>
            t.id === turnId && t.proposal
              ? {
                  ...t,
                  proposalState: state,
                  ...(message === undefined ? {} : { proposalMessage: message }),
                }
              : t,
          ),
        })),

      ask: async (port, question, cards, roster, executeTool, proposeWrite) => {
        // ★차단선. 꺼져 있으면 **요청이 나가지 않는다**(성공 기준 5).
        if (!get().enabled) return;

        // ★계획서: "실행 없이 대화가 이어지면 제안은 소멸".
        //   다음 질문을 던지는 순간 앞 제안의 [실행] 버튼은 죽는다 — 한참 전에 말한
        //   내용이 대화 저 위에 살아 있다가 눌리는 것이 가장 위험한 모양이다.
        set((s) => ({
          turns: s.turns.map((t) =>
            t.proposalState === 'pending' ? { ...t, proposalState: 'expired' as const } : t,
          ),
        }));

        // ★그물 ③ — 나가기 직전 관문. **여기 말고 다른 통로가 없다.**
        //   화면에는 원본 카드가 그대로 남고(이름은 화면에 남는다),
        //   포트로 넘기는 것은 이름을 별칭으로 가린 사본이다(숫자만 밖으로 나간다).
        let maskedCount = 0;
        let blankedCount = 0;
        const outbound: AssistCard[] = [];
        // ★별칭 매핑은 **개인정보다.** 이 함수 안에서만 살고 상태에 저장하지 않는다.
        //   AI 답변을 화면에 띄우기 직전 되돌리는 데에만 쓴다.
        const mappings: MaskMapping[] = [];
        // ★별칭 번호를 이 질문(ask) 전체가 공유한다 — 질문·카드·2왕복 실행 결과까지.
        //   세션이 없으면 칸마다 1번부터 다시 세어 다른 학생 둘이 같은 ［이름1］ 이 된다.
        const maskSession = createMaskSession();

        // ★질문 원문도 카드와 같은 그물을 지난다 — 방침·고지문이 그렇게 약속한다.
        //   화면(turn.question)에는 원문이 남고, 밖으로는 가린 쪽만 나간다.
        const questionRedaction = redactQuestion(question, roster, maskSession);
        const outboundQuestion = questionRedaction.masked;
        maskedCount += questionRedaction.mappings.length;
        mappings.push(...questionRedaction.mappings);

        for (const card of cards) {
          const tool = findAssistTool(card.tool);
          if (!tool) continue; // 레지스트리에 없는 도구는 보내지 않는다
          const result = redactOutbound(tool, card.data, roster, maskSession);
          maskedCount += result.maskedCount;
          blankedCount += result.blankedCount;
          // 자유 입력이 아닌 자리에서 걸렸다면 화이트리스트 설계가 잘못된 것이다 — 통째로 뺀다.
          if (result.blocked) continue;
          mappings.push(...result.mappings);
          outbound.push({ tool: card.tool, data: result.data });
        }

        // ★새 턴을 상태에 넣기 **전에** 이력을 만든다 — 자기 자신이 이력에 끼면 안 된다.
        //   현재 질문도 **가려진 쪽**을 싣는다.
        const historyTurns = buildHistoryTurns(get().turns, outboundQuestion);

        // 정규식에 안 걸린 질문("이번 주 급식 뭐 나와?")의 두 경로:
        //  - 실행기가 있으면(옵션 A) 1차 왕복에서 **모델이 도구를 고르게** 한다.
        //  - 실행기가 없으면(테스트·구형 경로) 직전 턴의 (가려진) 카드를 다시 싣는다 —
        //    이미 한 번 나간 자료라 새 노출은 없다.
        // ★도구 목록을 보낼지의 조건은 "실행기가 있는가"가 아니라 **"도구를 다룰 수단이
        //   하나라도 있는가"**다. 읽기 실행기만 보고 판단했더니, 쓰기 제안만 붙인 경로에서
        //   도구가 아예 안 나가 제안이 만들어지지 않았다(Phase 3 테스트에서 잡힘).
        const canUseTools = executeTool !== undefined || proposeWrite !== undefined;
        // ★"카드가 있으면 도구를 안 보낸다"만으로 판단하면 안 된다 (2026-08-24 UltraQA P0):
        //   "장보기 할 일 지워줘"는 정규식 지름길("할 일")에 걸려 조회 카드가 만들어지는데,
        //   그 순간 도구 목록이 빠져 **모델이 쓰기를 고를 방법 자체가 없었다** — 흔한
        //   한국어 쓰기 요청 전부가 조회로 강등됐다. 바꾸려는 말이면 카드가 있어도
        //   도구를 함께 싣는다(그 카드는 대상 확인용 목록으로 같이 나간다).
        const wantsToolSelection =
          (outbound.length === 0 ||
            (proposeWrite !== undefined && mentionsWriteIntent(question))) &&
          canUseTools;
        let effectiveOutbound = outbound;
        if (effectiveOutbound.length === 0 && !wantsToolSelection) {
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
              outboundQuestion,
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

        // ★연락처·주민번호·이메일이 있으면 **여기서 끝낸다 — 요청이 나가지 않는다.**
        //
        //   서버(`assistRequest.ts`)에도 같은 검사가 있고 그 주석은 이렇게 적혀 있다:
        //   *"앱의 관문(그물 ③)이 막았어야 하는 것이 여기까지 왔다 = 앱 쪽 그물이 뚫렸다는 신호."*
        //   그런데 앱 쪽 그물은 **카드에만** 걸려 있고 질문에는 없었다 — 연락처가 적힌 질문은
        //   쌤핀 서버까지 갔다가 거기서 되돌아왔다(2026-08-25 실측).
        //
        //   서버 검사는 **그대로 둔다.** 여기가 뚫렸을 때 마지막으로 막아야 한다.
        //   ★가리고 보내지 않는다 — 원 설계의 판단(몰래 지우느니 정직하게 거절한다)을 잇는다.
        if (questionHasBlockingPii(question)) {
          patch({ status: 'blocked', blockedMessage: ASSIST_PII_BLOCKED_MESSAGE });
          return;
        }

        try {
          let answer = await port.ask({
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
            ...(wantsToolSelection ? { tools: toModelToolSchemas() } : {}),
          });

          // ── Phase 3: 쓰기 도구를 골랐으면 **실행하지 않고 제안만 만든다** ──
          //
          // ★여기서 두 번째 왕복을 하지 않는 것이 중요하다. 결과를 실어 다시 물으면
          //   모델이 "저장했습니다"라고 앞질러 말하는데, 아직 아무것도 저장되지 않았다.
          //   대신 앱이 고정된 문구로 안내하고 미리보기 카드를 띄운다.
          /**
           * 쓰기 제안을 턴에 붙이고 끝낸다. **저장은 하지 않는다.**
           *
           * 1왕복째에도, 조회를 한 번 하고 온 2왕복째에도 같은 자리를 쓴다.
           */
          const settleWithProposal = (
            call: { name: string; rawArguments: string },
            extra: Partial<AssistTurn>,
          ): void => {
            // ★별칭을 실제 값으로 되돌린 뒤에 넘긴다.
            //   모델은 `［이름1］` 만 봤으므로 대상도 그 말로 가리켜 온다 — 되돌리지 않으면
            //   앱이 이름이 `［이름1］` 인 항목을 찾다가 없다고 답한다(2026-08-25 재현 확인).
            //   ★`mappings` 는 이 함수 스코프에만 있다. 상태로 새지 않는다.
            const outcome = proposeWrite?.(
              call.name,
              restoreModelArguments(call.rawArguments, mappings),
              // ★가린 쪽이 아니라 **원문**이다. 이건 밖으로 안 나가고 앱 안에서만 쓴다.
              question,
            );
            if (outcome && isWriteProposal(outcome)) {
              patch({
                ...extra,
                answer: '아래 내용을 확인하고 [실행]을 누르면 저장할게요.',
                outboundAnswer: '',
                degraded: answer.degraded,
                status: 'done',
                proposal: outcome,
                proposalState: 'pending',
              });
            } else {
              // 못 만든 이유를 그대로 보여준다 — 조용히 아무 일도 없는 것이 가장 나쁘다.
              patch({
                ...extra,
                answer: outcome?.reason ?? '무엇을 하려는지 알아듣지 못했어요.',
                outboundAnswer: '',
                degraded: answer.degraded,
                status: 'done',
              });
            }
          };

          const writeCall = (answer.toolCalls ?? []).find((call) => isWriteTool(call.name));
          if (wantsToolSelection && proposeWrite && writeCall) {
            settleWithProposal(writeCall, {});
            return;
          }

          // ── 옵션 A 2왕복: 모델이 도구를 골랐으면 로컬 실행 후 결과를 실어 다시 묻는다 ──
          if (wantsToolSelection && executeTool && (answer.toolCalls?.length ?? 0) > 0) {
            const executed: AssistCard[] = [];
            // 폭주 방어: 모델이 여러 개를 불러도 앞 3개만. 서버 상한(6)보다 보수적으로.
            for (const call of (answer.toolCalls ?? []).slice(0, 3)) {
              // ★쓰기 도구는 이 루프에 절대 들어오지 않는다. 위에서 이미 갈라졌지만,
              //   실행기가 쓰기 이름을 받는 경로 자체를 없애 두는 편이 안전하다.
              if (isWriteTool(call.name)) continue;
              const card = executeTool(call.name, call.rawArguments);
              if (card) executed.push(card);
            }

            if (executed.length > 0) {
              // 실행 결과도 초기 카드와 **같은 관문**을 지난다 — 화면엔 원본, 밖엔 가린 사본.
              const executedOutbound: AssistCard[] = [];
              for (const card of executed) {
                const tool = findAssistTool(card.tool);
                if (!tool) continue;
                const result = redactOutbound(tool, card.data, roster, maskSession);
                maskedCount += result.maskedCount;
                blankedCount += result.blankedCount;
                if (result.blocked) continue;
                mappings.push(...result.mappings);
                executedOutbound.push({ tool: card.tool, data: result.data });
              }
              patch({
                cards: [...cards, ...executed],
                maskedCount,
                blankedCount,
              });

              const secondOutbound = executedOutbound.slice(0, ASSIST_SEND_LIMITS.maxToolResults);
              effectiveOutbound = secondOutbound;
              answer = await port.ask({
                installId: get().installId,
                turns: historyTurns,
                toolResults: secondOutbound.map((c) => ({
                  tool: c.tool,
                  grade: 1 as const,
                  data: c.data,
                })),
                // ★2왕복째에도 도구 목록을 보낸다 — **바꾸려는 말일 때만.**
                //
                //   실측(2026-08-23): "장보기 할 일 지워줘"에 모델은 **먼저 목록을 본다** —
                //   어떤 항목인지 확인하고 지우려는 것이고, 사람도 그렇게 한다. 그런데 예전에는
                //   2왕복째에 도구를 안 보내서, 목록을 보고 온 모델이 **지우자고 말할 방법이
                //   없었다.** 그래서 고치기·지우기 요청 7건이 전부 조회로 끝났다(0/7).
                //   설명 문구를 두 번 고쳐도 소용없던 이유가 이것이다 — 낱말이 아니라 구조였다.
                //
                //   ★다만 **늘** 실으면 안 된다(UltraQA 실측): 도구가 있으면 이 모델은 문장
                //   대신 도구를 한 번 더 부른다 — 조회 질문 5개 중 5개가 그랬다. 그러면 문장을
                //   받으러 한 번 더 물어야 해서 조회 한 번이 3요청이 되고, 하루 상한
                //   (40요청/설치) 안에서 물어볼 수 있는 횟수가 20번 → 13번으로 준다.
                //   그래서 바꾸려는 말일 때만 싣는다. 조회는 예전처럼 2왕복이다.
                ...(proposeWrite && mentionsWriteIntent(question)
                  ? { tools: toModelToolSchemas() }
                  : {}),
              });

              // 목록을 보고 온 모델이 이제 쓰기를 고르면, 그 제안을 조회 카드와 함께 띄운다.
              const followUp = (answer.toolCalls ?? []).find((call) => isWriteTool(call.name));
              if (proposeWrite && followUp) {
                settleWithProposal(followUp, { outboundCards: secondOutbound });
                return;
              }

              // ★도구 목록을 붙였더니 모델이 **문장 대신 또 도구를 부르는** 일이 생겼다
              //   ("할 일 뭐 있어?"에 조회를 한 번 더 하자고 했고, text 는 빈 문자열이었다 —
              //   2026-08-23 실측). 그대로 두면 카드만 뜨고 해설이 사라진다.
              //
              //   더 부르지는 않는다. **도구 없이 한 번만** 다시 물어 문장을 받는다 —
              //   왕복 상한을 세 번으로 못 박아 두는 셈이다.
              // ★상한·장애로 빈 답이 온 경우는 다시 물어봐야 소용없다 — 모델이 도구를
              //   또 부르느라 문장이 빈 경우(degraded 없음)에만 한 번 더 묻는다.
              if (answer.degraded === null && answer.text.trim().length === 0) {
                answer = await port.ask({
                  installId: get().installId,
                  turns: historyTurns,
                  toolResults: secondOutbound.map((c) => ({
                    tool: c.tool,
                    grade: 1 as const,
                    data: c.data,
                  })),
                });
              }
            }
          }
          // ★별칭을 실제 이름으로 되돌린 뒤 화면에 올린다.
          //   모델은 ［이름1］ 만 봤고, 선생님은 "김지훈"을 본다.
          //   ★실측상 모델이 괄호를 자주 바꾸므로(〈이름1〉 등) 관대하게 되돌린다.
          patch({
            answer: restoreModelText(answer.text, mappings),
            // 이력용으로는 되돌리기 전(별칭 그대로)을 남긴다 — 위 outboundAnswer 주석 참조.
            outboundAnswer: answer.text,
            // 도구 선택 경로에서는 실행 결과가 이 턴의 "나갔던 카드"다 — 후속 질문 재전송용.
            outboundCards: effectiveOutbound,
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
