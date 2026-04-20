/**
 * BoardParticipant — 협업 보드 참여자(학생)
 *
 * Y.js awareness state와 1:1 매핑되는 UI 표시용 뷰 타입.
 * 서버 측에서 awareness change 이벤트를 이 형태로 정규화해 renderer에 전달한다.
 */
export interface BoardParticipant {
  /** Y.js awareness clientID를 문자열화 (number→string) */
  readonly awarenessId: string;
  /** 학생이 입장 시 입력한 이름 (sanitizeParticipantName 통과값) */
  readonly name: string;
  /** awareness user 컬러 (#RRGGBB) — Phase 2 커서 뱃지용 */
  readonly color: string;
  /** 입장 시각 (Unix ms) */
  readonly joinedAt: number;
  /** 마지막으로 관측된 시각 (heartbeat 또는 activity) */
  readonly lastSeenAt: number;
}
