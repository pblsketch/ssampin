/**
 * 기존 쌤도구 5종 + 협업 보드가 공유하는 cloudflared 터널의 **상호 배타** 포트.
 *
 * - Plan R2 / Spike S2에서 설계·검증됨.
 * - 구현체(infrastructure의 BoardTunnelCoordinator)는 electron/ipc/tunnel.ts에
 *   1개 함수(`getCurrentOwner()`)만 추가해 기존 5개 라이브 도구 코드 무수정으로
 *   양방향 상호 배타를 보장한다.
 */
export type TunnelOwner =
  | 'board'
  | 'live-survey'
  | 'live-vote'
  | 'live-wordcloud'
  | 'live-discussion'
  | 'live-multi-survey';

export interface ActiveOwnership {
  readonly owner: TunnelOwner;
  readonly localPort: number;
  readonly url: string;
  /** 획득 시각 (Unix ms) */
  readonly acquiredAt: number;
}

/** 다른 도구가 터널을 점유 중일 때 `acquire()`가 던지는 에러 */
export class TunnelBusyError extends Error {
  public readonly name = 'TunnelBusyError';
  constructor(public readonly existing: TunnelOwner) {
    super(`다른 도구(${existing})가 이미 터널을 사용 중입니다.`);
  }
}

/** 터널 점유 해제 구독 해제 함수 */
export type UnsubscribeTunnelExit = () => void;

export interface IBoardTunnelPort {
  /**
   * 터널 점유 획득. 이미 다른 owner가 쓰고 있으면 TunnelBusyError.
   * 같은 owner가 같은 port로 재호출 시엔 기존 URL 반환 (idempotent).
   */
  acquire(owner: TunnelOwner, localPort: number): Promise<string>;
  /** 터널 해제. 점유자가 아니면 무시 (방어적). */
  release(owner: TunnelOwner): void;
  /** 현재 점유 상태 (없으면 null) */
  getCurrent(): ActiveOwnership | null;
  /** 점유 중 여부 (편의) */
  isBusy(): boolean;
  /**
   * cloudflared 프로세스 비정상 종료 감지.
   * StartBoardSession이 이 훅을 구독해 세션을 'stopping'으로 전환하고
   * UI에 BOARD_TUNNEL_EXIT 토스트를 노출한다.
   */
  onExit(cb: (reason: string) => void): UnsubscribeTunnelExit;
}
