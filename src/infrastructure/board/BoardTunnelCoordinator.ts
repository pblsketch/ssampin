/**
 * BoardTunnelCoordinator — cloudflared 터널 상호 배타 어댑터
 *
 * Plan R2 / Spike S2(18/18 PASS) 구조 이식.
 *
 * ## 설계
 *
 * tunnel.ts는 **수정하지 않고** coordinator 자체 상태로 배타 판정.
 * 기존 5개 라이브 도구(live-*) 와 협업 보드 간 상호 배타는 **UI 레벨** 에서
 * `useBoardSessionStore.isRunning` 을 기존 라이브 도구 진입 버튼에 참조시켜 처리한다
 * (Step 7 컴포넌트 구현 시).
 *
 * ## 엣지 케이스
 *
 * 보드가 실행된 상태에서 사용자가 UI 방어를 우회해 기존 도구를 직접 실행한 경우,
 * tunnel.ts의 `openTunnel()` 이 내부 `closeTunnel()` 을 먼저 호출하므로 보드 터널이
 * 파괴된다. 이 경우는 `onExit` 이벤트로 감지하여 세션을 'stopping' 으로 전환하고
 * 교사에게 토스트로 알린다.
 */
import type {
  IBoardTunnelPort,
  TunnelOwner,
  ActiveOwnership,
  UnsubscribeTunnelExit,
} from '@domain/ports/IBoardTunnelPort';
import { TunnelBusyError } from '@domain/ports/IBoardTunnelPort';

/** tunnel.ts 의존성 추상화 (테스트 시 mock 주입용) */
export interface TunnelDriver {
  /** 터널 시작 → 공개 URL 반환 */
  openTunnel(localPort: number): Promise<string>;
  /** 터널 종료 */
  closeTunnel(): void;
  /**
   * 현재 활성 터널의 exit 이벤트 구독.
   * 구현체가 tunnel.ts의 Tunnel 객체 참조를 acquire 시점에 보관했다가
   * `.on('exit', cb)` 를 연결한다.
   */
  subscribeExit(cb: (code: number | null) => void): () => void;
}

export class BoardTunnelCoordinator implements IBoardTunnelPort {
  private current: ActiveOwnership | null = null;
  private exitListeners: Array<(reason: string) => void> = [];
  private unsubDriverExit: (() => void) | null = null;

  constructor(private readonly driver: TunnelDriver) {}

  async acquire(owner: TunnelOwner, localPort: number): Promise<string> {
    if (this.current && this.current.owner === owner && this.current.localPort === localPort) {
      return this.current.url;
    }
    if (this.current) {
      throw new TunnelBusyError(this.current.owner);
    }

    const url = await this.driver.openTunnel(localPort);
    this.current = { owner, localPort, url, acquiredAt: Date.now() };

    this.unsubDriverExit = this.driver.subscribeExit((code) => {
      const reason = code === 0 || code === null ? 'normal_exit' : `cloudflared_exit_code_${code}`;
      this.current = null;
      const listeners = [...this.exitListeners];
      for (const l of listeners) l(reason);
    });

    return url;
  }

  release(owner: TunnelOwner): void {
    if (!this.current) return;
    if (this.current.owner !== owner) return;
    this.unsubDriverExit?.();
    this.unsubDriverExit = null;
    this.driver.closeTunnel();
    this.current = null;
  }

  getCurrent(): ActiveOwnership | null {
    return this.current;
  }

  isBusy(): boolean {
    return this.current !== null;
  }

  onExit(cb: (reason: string) => void): UnsubscribeTunnelExit {
    this.exitListeners.push(cb);
    return () => {
      this.exitListeners = this.exitListeners.filter((l) => l !== cb);
    };
  }
}
