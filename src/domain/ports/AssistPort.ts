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

export interface AssistRequestPayload {
  readonly installId: string;
  readonly turns: readonly AssistTurnPayload[];
  readonly toolResults: readonly AssistToolResultPayload[];
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
  | 'unavailable'
  | 'upstream'
  | 'offline'
  | 'timeout'
  | 'unreachable';

export interface AssistAnswer {
  readonly text: string;
  readonly degraded: AssistDegraded | null;
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
