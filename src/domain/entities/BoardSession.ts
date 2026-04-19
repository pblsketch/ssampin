import type { BoardId } from '../valueObjects/BoardId';
import type { BoardSessionCode } from '../valueObjects/BoardSessionCode';
import type { BoardAuthToken } from '../valueObjects/BoardAuthToken';
import type { BoardParticipant } from './BoardParticipant';

/** 세션 수명 주기 */
export type BoardSessionPhase = 'starting' | 'running' | 'stopping' | 'stopped';

/**
 * BoardSession — 보드가 실시간으로 "열려 있는 상태"
 *
 * 영속 저장 대상이 아니라 메모리 런타임 뷰. 서버가 기동/정리 때마다 갱신된다.
 * renderer 측에서는 `useBoardSessionStore`가 이 상태를 구독한다.
 */
export interface BoardSession {
  readonly boardId: BoardId;
  readonly phase: BoardSessionPhase;
  /** WebSocket 서버 로컬 포트 */
  readonly localPort: number;
  /** cloudflared 공개 URL (https). phase !== 'running' 동안 null */
  readonly publicUrl: string | null;
  /** 학생 브라우저가 URL `?t=` 파라미터로 제시해야 하는 토큰 */
  readonly authToken: BoardAuthToken;
  /** 학생 브라우저가 URL `?code=` 파라미터로 제시해야 하는 코드 */
  readonly sessionCode: BoardSessionCode;
  /** 세션 시작 시각 (Unix ms) */
  readonly startedAt: number;
  /** 현재 접속 중인 학생 목록 */
  readonly participants: readonly BoardParticipant[];
}
