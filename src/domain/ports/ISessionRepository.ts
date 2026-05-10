/**
 * 세션 영속 저장 추상화 (Plan §3 + Design §5.5).
 *
 * 구현체(`JsonInteractiveLessonRepository`)는 어댑터 레이어에서 IStoragePort 사용.
 * 라이브 응답은 별도 `LiveResponseStore`(메모리)로 분리 — 종료 시 스냅샷만 영속.
 */

import type {
  LessonSession,
  LessonSessionSnapshot,
} from '@domain/entities/InteractiveSlides';
import type {
  LessonId,
  SessionId,
} from '@domain/valueObjects/InteractiveSlidesIds';

export interface ISessionRepository {
  /** 진행 중 세션의 메타 저장 (가벼움 — status, currentSlideIndex 변경 시) */
  saveSession(session: LessonSession): Promise<void>;

  /** 종료된 세션의 전체 스냅샷 저장 (학생·응답·집계 포함) */
  saveSnapshot(snapshot: LessonSessionSnapshot): Promise<void>;

  loadSession(id: SessionId): Promise<LessonSession | null>;

  loadSnapshot(id: SessionId): Promise<LessonSessionSnapshot | null>;

  listByLessonId(lessonId: LessonId): Promise<readonly LessonSession[]>;

  /** 즉시 영구 삭제 (휴지통 X) — F8-3 결과 삭제 버튼 */
  delete(id: SessionId): Promise<void>;

  /**
   * 보존 기간 만료 세션 ID 목록 (PIPA 180일 sweep, Plan §11.1).
   * @param beforeMs 이 시각보다 archivedAt이 이전인 세션
   */
  listExpired(beforeMs: number): Promise<readonly SessionId[]>;
}
