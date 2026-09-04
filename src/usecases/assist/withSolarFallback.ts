/**
 * "내 AI"가 실패하면 쌤핀 AI(Solar)가 대신 답하게 하는 합성 포트.
 *
 * ★폴백은 **선생님이 쌤핀 AI 에 동의한 경우에만** 일어난다.
 * 동의하지 않았는데 조용히 서버로 질문을 보내면, 그건 동의 없는 전송이다.
 * 동의가 없으면 폴백하지 않고 원래 오류를 그대로 올린다.
 *
 * ★생기부 초안은 이 합성을 **쓰지 않는다.** 초안은 구독 모델 전용이고 Solar 로 만들지
 * 않는다(오너 결정 D2) — 실패하면 안내만 하고 멈춘다.
 *
 * ★스토어는 폴백을 모른다. 어느 포트로 물어보는지는 호출부(DI)가 정하고, 스토어는
 * 받은 포트에 물어보기만 한다 — 그래서 스토어가 infrastructure 를 import 하지 않는다.
 */
import type { AssistAnswer, AssistPort, AssistRequestPayload } from '@domain/ports/AssistPort';
import { AssistBlockedError } from '@domain/ports/AssistPort';
import { canFallbackToSolar } from '@domain/rules/ownAiCliRules';
import type { OwnAiErrorKind } from '@domain/entities/OwnAiProvider';

/**
 * 오류가 "내 AI 실행 오류"면 그 갈래를 꺼낸다.
 *
 * ★`instanceof` 를 쓰지 않는 이유: 그 오류 클래스는 infrastructure 에 있고, 유스케이스는
 * infrastructure 를 import 할 수 없다(아키텍처 규칙). 모양으로 알아본다.
 */
function ownAiErrorKind(error: unknown): OwnAiErrorKind | null {
  const e = error as { name?: unknown; kind?: unknown } | null;
  if (e?.name !== 'OwnAiRunError' || typeof e.kind !== 'string') return null;
  return e.kind as OwnAiErrorKind;
}

export interface SolarFallbackOptions {
  /** 선생님이 쌤핀 AI 사용에 동의했는가(실험실 토글). */
  readonly solarEnabled: () => boolean;
  /** 폴백이 실제로 일어났을 때 화면에 알린다(배지·문구용). */
  readonly onFallback?: (reason: unknown) => void;
}

/**
 * `primary` 로 먼저 물어보고, 실패하면 `solar` 로 다시 물어본다.
 *
 * 폴백한 답에는 `degraded: 'own-ai-fallback'` 을 달아 "왜 다른 데서 답했는지"를 화면이
 * 말할 수 있게 한다. 원래 답이 이미 축소 사유를 갖고 있으면 그 값을 존중한다.
 */
export function withSolarFallback(
  primary: AssistPort,
  solar: AssistPort,
  options: SolarFallbackOptions,
): AssistPort {
  return {
    async ask(payload: AssistRequestPayload): Promise<AssistAnswer> {
      try {
        return await primary.ask(payload);
      } catch (error) {
        // 전송이 막힌 것(개인정보 등)은 폴백 대상이 아니다 — 다른 데로 보내도 똑같이 막혀야 한다.
        if (error instanceof AssistBlockedError) throw error;
        // ★[중단]을 누른 것도 폴백하지 않는다 — 멈추라는 말을 "다른 데로 보내라"로
        //   읽으면 안 된다.
        const kind = ownAiErrorKind(error);
        if (kind !== null && !canFallbackToSolar(kind)) throw error;
        if (!options.solarEnabled()) throw error;

        options.onFallback?.(error);
        const answer = await solar.ask(payload);
        return { ...answer, degraded: answer.degraded ?? 'own-ai-fallback' };
      }
    },
  };
}
