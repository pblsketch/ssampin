/**
 * AuthorizeBoardJoin — Design §3.3 학생 입장 인증 유스케이스
 *
 * 실제 WebSocket 연결 인증은 YDocBoardServer의 `upgrade` 핸들러에서
 * `verifyJoinCredentials`를 호출하며 이미 수행된다. 이 유스케이스는 IPC
 * 레벨에서 학생이 보드 링크를 열 때(세션 아직 시작 전 시나리오 대비) 또는
 * 개발 도구 디버깅 시 사용할 수 있는 shim이다.
 *
 * Phase 1a 에서는 YDocBoardServer upgrade 훅이 단일 진실 원천(SoT).
 * 이 유스케이스는 Phase 2+ 에서 교사 UI에서 "테스트 접속" 같은 기능 추가 시
 * 재사용 가능한 순수 검증 경로.
 */
import type { BoardAuthToken } from '@domain/valueObjects/BoardAuthToken';
import type { BoardSessionCode } from '@domain/valueObjects/BoardSessionCode';
import { verifyJoinCredentials } from '@domain/rules/boardRules';

export interface JoinCredentials {
  readonly providedToken: string;
  readonly providedCode: string;
}

export interface ExpectedCredentials {
  readonly token: BoardAuthToken;
  readonly code: BoardSessionCode;
}

export class AuthorizeBoardJoin {
  execute(provided: JoinCredentials, expected: ExpectedCredentials): boolean {
    return verifyJoinCredentials(provided.providedToken, provided.providedCode, expected);
  }
}
