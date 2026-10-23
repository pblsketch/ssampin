/**
 * 내 API 키로 쌤핀 AI 패널에 답하는 어댑터 (ADR-143).
 *
 * 쌤핀 AI(Solar) 포트와 **같은 모양**으로 일한다 — 모델이 도구를 고르면 `toolCalls` 로 돌려주고,
 * 화면(스토어)이 이 컴퓨터에서 조회한 뒤 이름을 가린 결과를 실어 다시 묻는다. 그래서 별칭 가리기·
 * 쓰기 제안·연락처 차단 같은 그물이 하나도 바뀌지 않는다.
 *
 * ★키는 이 파일에 없다. main 에 "이 대화를 보내 달라"고만 한다. 어느 서비스·모델로 갈지도 main 이 정한다.
 * ★쌤핀 AI 로 몰래 넘기지 않는다(폴백 없음) — 선생님이 고른 통로가 실패하면 실패를 말한다.
 */
import type {
  AssistAnswer,
  AssistPort,
  AssistRequestPayload,
  CancelableAssistPort,
} from '@domain/ports/AssistPort';
import { AssistBlockedError } from '@domain/ports/AssistPort';
import type { OwnAiErrorKind } from '@domain/entities/OwnAiProvider';
import { buildApiKeyChatMessages, buildApiKeyPanelSystemPrompt } from '@domain/rules/apiKeyRules';
import { isOwnAiErrorKind, OWN_AI_ERROR_MESSAGES } from '@domain/rules/ownAiCliRules';
import { OwnAiRunError } from './OwnAiAssistPort';

/** 이미지는 첫 판에서 받지 않는다 — 화면이 붙이기 단추를 숨기지만, 혹시 오면 정직하게 거절한다. */
export const API_KEY_ATTACHMENT_NOT_SUPPORTED =
  '내 API 키로 답할 때는 아직 이미지를 보낼 수 없어요. 이미지를 빼고 다시 보내 주세요.';

function newId(prefix: string): string {
  const c = globalThis.crypto;
  const raw =
    c && typeof c.randomUUID === 'function'
      ? c.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${raw}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
}

export interface ApiKeyAssistPortOptions {
  /** 오늘 날짜를 정하는 시계 — 테스트가 바꿔 끼운다 */
  readonly now?: () => Date;
}

export class ApiKeyAssistPort implements AssistPort, CancelableAssistPort {
  /** 이 포트(= 한 질문)의 왕복들이 같은 세션으로 묶이게 한다(오픈코드 세션 머리글). */
  private readonly sessionId = newId('ssampin');
  private activeRequestId: string | null = null;

  constructor(private readonly options: ApiKeyAssistPortOptions = {}) {}

  cancel(): void {
    const id = this.activeRequestId;
    if (id === null) return;
    void window.electronAPI?.apiKey?.cancel(id);
  }

  async ask(payload: AssistRequestPayload): Promise<AssistAnswer> {
    if (payload.attachments && payload.attachments.length > 0) {
      throw new AssistBlockedError(API_KEY_ATTACHMENT_NOT_SUPPORTED);
    }
    const api = typeof window === 'undefined' ? undefined : window.electronAPI?.apiKey;
    if (!api) throw new OwnAiRunError('key-missing', OWN_AI_ERROR_MESSAGES['key-missing'].panel);

    const now = this.options.now?.() ?? new Date();
    const messages = buildApiKeyChatMessages(
      buildApiKeyPanelSystemPrompt(now),
      payload.turns,
      payload.toolResults,
    );
    const requestId = newId('panel');
    this.activeRequestId = requestId;
    try {
      const r = await api.chat({
        requestId,
        purpose: 'panel',
        messages,
        ...(payload.tools && payload.tools.length > 0 ? { tools: payload.tools } : {}),
        sessionId: this.sessionId,
      });
      if (!r.ok) {
        const kind: OwnAiErrorKind = isOwnAiErrorKind(r.reason) ? r.reason : 'key-provider-error';
        throw new OwnAiRunError(kind, OWN_AI_ERROR_MESSAGES[kind].panel);
      }
      return {
        text: r.text,
        degraded: null,
        toolCalls: r.toolCalls.map((c) => ({ name: c.name, rawArguments: c.rawArguments })),
      };
    } catch (e) {
      if (e instanceof OwnAiRunError) throw e;
      throw new OwnAiRunError(
        'key-provider-error',
        OWN_AI_ERROR_MESSAGES['key-provider-error'].panel,
      );
    } finally {
      if (this.activeRequestId === requestId) this.activeRequestId = null;
    }
  }
}
