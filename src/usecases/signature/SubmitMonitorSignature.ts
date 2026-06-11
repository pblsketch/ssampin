/**
 * 서명 현황 모니터링 유스케이스.
 *
 * 교사 현황 보드용 — 10초 폴링으로 sig-status를 반복 조회한다.
 * 폴링 시작/정지 오케스트레이션을 담당하며, 정지 함수를 반환한다.
 *
 * 폴링 구현은 infra(SignatureSupabaseClient.startStatusPolling)가 제공하지만,
 * 의존성 역전을 위해 좁은 포트(ISignatureStatusPoller)로 주입받는다.
 */
import type { SignatureStatusRow } from '@domain/entities/SignatureEntry';

/**
 * 현황 폴링 포트 (ISignaturePort와 분리된 좁은 능력).
 * SignatureSupabaseClient가 구현한다.
 */
export interface ISignatureStatusPoller {
  startStatusPolling(
    sessionId: string,
    adminKey: string,
    onUpdate: (rows: readonly SignatureStatusRow[]) => void,
    intervalMs?: number,
  ): () => void;
}

export interface MonitorSignatureParams {
  readonly sessionId: string;
  readonly adminKey: string;
  /** 현황 갱신 콜백 */
  readonly onUpdate: (rows: readonly SignatureStatusRow[]) => void;
  /** 폴링 간격 (기본 10초) */
  readonly intervalMs?: number;
}

export class SubmitMonitorSignature {
  constructor(private readonly poller: ISignatureStatusPoller) {}

  /**
   * 현황 폴링 시작.
   * @returns stopPolling — 호출 시 폴링 정지
   */
  start(params: MonitorSignatureParams): () => void {
    return this.poller.startStatusPolling(
      params.sessionId,
      params.adminKey,
      params.onUpdate,
      params.intervalMs,
    );
  }
}
