/**
 * 쌤핀 AI — 바깥과 이야기하는 창구 (포트)
 *
 * 순수 TypeScript. `domain/` 은 아무것도 import 하지 않는다는 규칙을 따르되,
 * 같은 레이어의 타입(`ModelSafe`)만 참조한다.
 *
 * ★`ModelSafe<T>` 만 받는 이유 — 여기가 **그물 ②의 컴파일 강제가 살아나는 자리**다.
 *
 * Phase 1 에서 `sanitizeToolResult` 가 `ModelSafe<T>` 를 돌려주게 만들었지만,
 * 그 타입을 **소비하는 곳이 없어서** 강제가 공허했다(적대적 검토 지적).
 * 이 포트가 `ModelSafe<T>` 만 받는 순간, **재구성을 거치지 않은 객체는 타입 시스템이 거부한다.**
 */
import type { ModelSafe } from '../entities/AssistTool';
import type { ToolResultShape } from '../services/sanitizeToolResult';

/** 모델에 보낼 도구 결과 한 건. `data` 는 반드시 재구성을 거친 것이어야 한다. */
export interface AssistToolResultPayload {
  readonly tool: string;
  /** 항상 1 이다. 서버도 같은 값을 검사한다(ADR-061 결정 7). */
  readonly grade: 1;
  readonly data: ModelSafe<ToolResultShape>;
}

export interface AssistTurnPayload {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

/** 모델 도구 선택용 스키마 (OpenAI function 형식 — 서버 검증 형식과 일치) */
export interface AssistToolSchemaPayload {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Readonly<Record<string, unknown>>;
  };
}

/** 모델이 요청한 도구 호출. 인자는 모델이 만든 JSON 원문이라 **항상 불신**한다. */
export interface AssistToolCallPayload {
  readonly name: string;
  readonly rawArguments: string;
}

export interface AssistRequestPayload {
  readonly installId: string;
  readonly turns: readonly AssistTurnPayload[];
  readonly toolResults: readonly AssistToolResultPayload[];
  /** 있으면 모델이 도구를 고를 수 있다(옵션 A). 없으면 종전과 같은 단발 답변 */
  readonly tools?: readonly AssistToolSchemaPayload[];
}

/**
 * 축소 사유. **오류가 아니다** — 이 값이 있어도 숫자 카드는 화면에 남는다(P5).
 *
 * - `budget`      오너가 정한 상한에 닿음
 * - `unavailable` 서버에 키가 없음(배포 실수)
 * - `upstream`    공급자 장애
 * - `offline`     인터넷이 끊김
 */
/**
 * AI 해설을 못 받은 사유.
 *
 * ★`offline` 은 **인터넷이 실제로 끊겼을 때만** 쓴다. 예전에는 요청이 실패한 모든 경우를
 * 여기로 몰아넣어, 인터넷이 멀쩡한데도 "인터넷이 끊겼다"고 알렸다(2026-08-23 사용자 신고).
 * 원인이 다르면 사용자가 할 일도 다르므로 `timeout`·`unreachable` 로 나눈다.
 */
export type AssistDegraded =
  | 'budget'
  // ★`busy` 는 분당 상한(잠깐 몰림)이다. 예전에는 월/일 한도(`budget`)와 한 값이어서
  //   1분만 기다리면 되는 상황에 "이번 달 사용량을 다 썼다"고 말했다(2026-08-24 UltraQA).
  | 'busy'
  | 'unavailable'
  | 'upstream'
  | 'offline'
  | 'timeout'
  | 'unreachable'
  // ★`own-ai-fallback` 은 실패가 아니다 — "내 AI"(선생님 구독 CLI)로 답하려다 못 해서
  //   쌤핀 AI 가 대신 답했다는 뜻이다. 답은 정상이므로 카드도 문장도 그대로 남는다.
  //   생기부 초안에는 이 값이 오지 않는다(초안은 폴백하지 않고 멈춘다 — 오너 결정 D2).
  | 'own-ai-fallback';

export interface AssistAnswer {
  readonly text: string;
  readonly degraded: AssistDegraded | null;
  /** 모델이 도구를 요청했으면 채워진다. 실행 여부·방법은 전적으로 앱이 정한다 */
  readonly toolCalls?: readonly AssistToolCallPayload[];
}

/** 전송이 막힌 경우. 사용자에게 보여줄 한국어 문구를 담는다. */
export class AssistBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssistBlockedError';
  }
}

export interface AssistPort {
  /**
   * 질문 + (이미 재구성된) 도구 결과 → 답변 한 문단.
   *
   * 구현체는 **중계 함수만 부른다.** AI 공급자를 직접 부르지 않는다 —
   * 키가 앱에 없기 때문이다.
   */
  ask(payload: AssistRequestPayload): Promise<AssistAnswer>;
}
