/**
 * 라이브 세션의 메모리 상태 추상화 (Design §5.6).
 *
 * - 진행 중 응답·학생·오버레이 상태를 메모리에 보관
 * - 디스크 R/W 없음 (per-event 디스크 쓰기 회피, JSON 폭증 방지)
 * - 세션 종료 시 `EndLessonSession` UseCase가 스냅샷으로 변환해 ISessionRepository에 저장
 *
 * 구현체: 어댑터 레이어의 in-memory class (예: `MemoryLiveResponseStore`).
 * 단위 테스트에서는 fake 구현 주입.
 */

import type {
  OverlayResults,
  SessionStudent,
  SlideOverlay,
  StudentResponse,
} from '@domain/entities/InteractiveSlides';
import type {
  OverlayId,
  SessionId,
  SlideId,
  StudentToken,
} from '@domain/valueObjects/InteractiveSlidesIds';

/** 활성·종료 오버레이의 라이브 상태 */
export interface LiveOverlayState {
  readonly overlay: SlideOverlay;
  readonly slideId: SlideId;
  readonly activatedAt: number;
  /** null: 진행 중. number: deactivate 호출 시각 (Design §6.2 grace 500ms 판정용) */
  readonly deactivatedAt: number | null;
}

export interface ILiveResponseStore {
  // ─── Session lifecycle ───
  initSession(sessionId: SessionId): void;
  hasSession(sessionId: SessionId): boolean;
  disposeSession(sessionId: SessionId): void;

  // ─── Students ───
  addStudent(sessionId: SessionId, student: SessionStudent): void;
  markStudentPresence(
    sessionId: SessionId,
    token: StudentToken,
    online: boolean,
  ): void;
  listStudents(sessionId: SessionId): readonly SessionStudent[];
  studentCount(sessionId: SessionId): number;
  /** rejoin 윈도우(60초) 내 disconnect한 학생 token 반환 */
  findRecentlyDisconnected(
    sessionId: SessionId,
    token: StudentToken,
    nowMs: number,
    windowMs: number,
  ): SessionStudent | null;

  // ─── Overlays ───
  activateOverlay(
    sessionId: SessionId,
    overlay: SlideOverlay,
    activatedAt: number,
  ): void;
  markDeactivated(
    sessionId: SessionId,
    overlayId: OverlayId,
    deactivatedAt: number,
  ): void;
  getOverlayState(
    sessionId: SessionId,
    overlayId: OverlayId,
  ): LiveOverlayState | null;
  listActiveOverlays(sessionId: SessionId): readonly LiveOverlayState[];
  listClosedOverlayResults(
    sessionId: SessionId,
  ): readonly OverlayResults[];
  setOverlayResults(sessionId: SessionId, results: OverlayResults): void;

  // ─── Responses ───
  /**
   * (overlayId, studentToken)에 대한 upsert (학생 정정 허용).
   * 동일 키 기존 응답은 덮어쓰기.
   */
  upsertResponse(sessionId: SessionId, response: StudentResponse): void;
  listResponses(
    sessionId: SessionId,
    overlayId: OverlayId,
  ): readonly StudentResponse[];
  listAllResponses(sessionId: SessionId): readonly StudentResponse[];
  respondCount(sessionId: SessionId, overlayId: OverlayId): number;
}
