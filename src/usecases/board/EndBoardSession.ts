/**
 * EndBoardSession — 협업 보드 세션 종료 유스케이스 (Design §3.2)
 *
 * 절차:
 *   1. 자동 저장 타이머 clear + 터널 exit 구독 해제
 *   2. 최종 encodeState → saveSnapshot
 *   3. 참여자 히스토리 병합 저장
 *   4. 서버 stop → 터널 release
 *   5. 보드 메타 `lastSessionEndedAt`·`updatedAt` 업데이트
 */
import type { BoardId } from '@domain/valueObjects/BoardId';
import type { IBoardRepository } from '@domain/repositories/IBoardRepository';
import type { IBoardServerPort } from '@domain/ports/IBoardServerPort';
import type { IBoardTunnelPort } from '@domain/ports/IBoardTunnelPort';

import type { ActiveBoardSessionRuntime } from './StartBoardSession';

export interface EndBoardSessionOpts {
  /** true면 저장 실패를 무시하고 종료 강행 (before-quit/에러 복구 경로) */
  readonly forceSave: boolean;
}

export class EndBoardSession {
  constructor(
    private readonly repo: IBoardRepository,
    private readonly serverPort: IBoardServerPort,
    private readonly tunnelPort: IBoardTunnelPort,
  ) {}

  async execute(
    boardId: BoardId,
    runtime: ActiveBoardSessionRuntime,
    opts: EndBoardSessionOpts = { forceSave: false },
  ): Promise<void> {
    // 1. 타이머/구독 정리
    if (runtime.autoSaveTimer) {
      clearInterval(runtime.autoSaveTimer);
      runtime.autoSaveTimer = null;
    }
    runtime.unsubscribeTunnelExit?.();
    runtime.unsubscribeTunnelExit = null;

    // 2. 최종 저장
    try {
      const update = runtime.handle.encodeState();
      await this.repo.saveSnapshot(boardId, update);
    } catch (err) {
      if (!opts.forceSave) {
        // forceSave=false일 때는 실패를 그대로 위로 — 호출 측이 UI 토스트 선택
        throw err;
      }
      // forceSave=true면 로그만 남기고 계속 종료 (before-quit 경로에서 중요)
      // infrastructure 로그는 infra가 담당하므로 여기선 swallow
    }

    // 3. 참여자 이력 병합
    try {
      const names = runtime.handle.getParticipantNames();
      if (names.length > 0) {
        await this.repo.appendParticipantHistory(boardId, names);
      }
    } catch {
      // 메인 저장 성공 시 이력은 best-effort
    }

    // 4. 서버·터널 정리
    try {
      await this.serverPort.stop(boardId);
    } finally {
      this.tunnelPort.release('board');
    }

    // 5. 메타 lastSessionEndedAt·updatedAt 갱신 (R-3 iter #1)
    //    appendParticipantHistory가 호출된 경우 이미 lastSessionEndedAt이 touch되지만,
    //    참여자 이름이 0명인 세션(교사만 열고 닫은 경우)은 여기서 마무리해야 한다.
    try {
      await this.repo.touchSessionEnd(boardId);
    } catch {
      // best-effort — 메타 갱신 실패는 세션 종료를 막지 않는다
    }
  }
}
