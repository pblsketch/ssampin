/**
 * 서명 세션 공개 유스케이스.
 *
 * 명렬 스냅샷 + 컬럼 정의로 세션을 만들고 공개(active)한다.
 * port 주입(의존성 역전) — infra(Supabase/Edge Function)를 직접 알지 않는다.
 */
import type {
  ISignaturePort,
  CreateSignatureSessionInput,
  PublishSignatureSessionResult,
} from '@domain/ports/ISignaturePort';

export type PublishSignatureSessionParams = CreateSignatureSessionInput;

export class PublishSignatureSession {
  constructor(private readonly signaturePort: ISignaturePort) {}

  /**
   * 세션 생성(draft) → 공개(publish) 오케스트레이션.
   * @returns sessionId·adminKey·shortLinkCode
   */
  async execute(params: PublishSignatureSessionParams): Promise<PublishSignatureSessionResult> {
    const { sessionId } = await this.signaturePort.createSession(params);
    return this.signaturePort.publishSession(sessionId);
  }
}
