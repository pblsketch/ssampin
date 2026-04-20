/**
 * BoardTunnelCoordinator 프로토타입 (Spike S2)
 *
 * 목적: 기존 tunnel.ts의 activeTunnel 싱글턴을 건드리지 않고
 * 상호 배타(mutual exclusion) 레이어를 추가할 수 있음을 증명한다.
 *
 * 실제 구현 시에는 이 모듈이 tunnel.ts 위에서 얇은 래퍼로 동작하여,
 * 투표/설문/협업보드 등 여러 도구가 서로의 터널을 파괴하지 않도록 보장한다.
 *
 * 이 POC에선 실제 cloudflared를 호출하지 않고 mock으로 대체한다.
 */

export type TunnelOwner =
  | 'board'
  | 'live-survey'
  | 'live-vote'
  | 'live-wordcloud'
  | 'live-discussion'
  | 'live-multi-survey';

export interface ActiveOwnership {
  owner: TunnelOwner;
  localPort: number;
  url: string;
  acquiredAt: number;
}

export class TunnelBusyError extends Error {
  constructor(public readonly existing: TunnelOwner) {
    super(`다른 도구(${existing})가 이미 터널을 사용 중입니다. 먼저 종료해 주세요.`);
    this.name = 'TunnelBusyError';
  }
}

/** 실제 tunnel.ts의 openTunnel/closeTunnel을 주입 가능한 형태로 추상화 */
export interface TunnelDriver {
  openTunnel(localPort: number): Promise<string>;
  closeTunnel(): void;
}

export class BoardTunnelCoordinator {
  private current: ActiveOwnership | null = null;

  constructor(private readonly driver: TunnelDriver) {}

  /**
   * 터널 점유 획득. 다른 도구가 이미 사용 중이면 TunnelBusyError.
   * 같은 owner가 재호출 시에는 기존 URL을 반환 (idempotent).
   */
  async acquire(owner: TunnelOwner, localPort: number): Promise<string> {
    if (this.current) {
      if (this.current.owner === owner && this.current.localPort === localPort) {
        return this.current.url; // idempotent
      }
      throw new TunnelBusyError(this.current.owner);
    }
    const url = await this.driver.openTunnel(localPort);
    this.current = { owner, localPort, url, acquiredAt: Date.now() };
    return url;
  }

  /**
   * 터널 해제. 점유자가 아니면 무시 (방어적).
   */
  release(owner: TunnelOwner): void {
    if (!this.current) return;
    if (this.current.owner !== owner) return;
    this.driver.closeTunnel();
    this.current = null;
  }

  /** 현재 점유 상태 조회 (UI에서 "무엇이 실행 중인지" 표시용) */
  getCurrent(): ActiveOwnership | null {
    return this.current;
  }

  isBusy(): boolean {
    return this.current !== null;
  }
}
