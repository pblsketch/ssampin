/**
 * 메모 교실 공유 — 교실 화면 수신 확인증(presence + attention ack) 읽기 포트.
 *
 * 보드 내용은 선생님 개인 Google Drive에만 저장된다(쌤핀 서버 무저장, ADR-011).
 * 이 포트가 다루는 것은 **메타데이터뿐** — board_id·생존 신호 시각·소리 토글·
 * 주목 신호 재생 결과(nonce 대조)만 오가며, 메모 내용은 일절 전송되지 않는다
 * (사용자 승인 메타데이터 예외, 2026-06-12, ADR-012).
 *
 * 구현: `src/infrastructure/supabase/MemoSharePresenceClient.ts`
 */

/** 교실 페이지가 주목 신호를 처리한 결과 */
export type MemoShareAckResult = 'played' | 'sound-off' | 'fallback-voice';

/** 교실 화면 1대의 생존/재생 확인 상태 (보드당 1행) */
export interface MemoSharePresence {
  /** Drive 보드 JSON fileId */
  readonly boardId: string;
  /** 교실 페이지의 마지막 생존 신호 시각 (ISO 8601) */
  readonly lastSeenAt: string;
  /** 교실 화면의 소리 토글 상태 (🔔 버튼) */
  readonly soundOn: boolean;
  /** 마지막으로 처리한 주목 신호의 nonce — 앱이 자기가 보낸 nonce와 대조 */
  readonly lastAckNonce?: string;
  readonly lastAckResult?: MemoShareAckResult;
  /** ISO 8601 */
  readonly lastAckAt?: string;
}

export interface IMemoSharePresencePort {
  /**
   * 보드 id 목록의 presence를 일괄 조회한다 (boardId → presence).
   * 행이 없는 보드는 맵에 포함되지 않는다. env 미설정 등 비활성 시 빈 맵.
   */
  fetchPresence(boardIds: readonly string[]): Promise<ReadonlyMap<string, MemoSharePresence>>;
}
