/**
 * EndLessonSession — 수업 종료 + 결과 freeze + 익명화 + 스냅샷 영속 (Design §4 U2, §7.5).
 *
 * 단계:
 * 1. session.status = 'archived', archivedAt = now
 * 2. 활성 오버레이 모두 freeze (in-flight 응답은 grace 처리는 별도 — 여기서는 즉시 freeze)
 * 3. AnonymizeSession 호출 (실명 → "학생N")
 * 4. LessonSessionSnapshot 직렬화 + ISessionRepository.saveSnapshot
 * 5. 학생 broadcast: lesson-ended
 * 6. 라이브 메모리 dispose
 */

import {
  LESSON_SESSION_SNAPSHOT_SCHEMA_VERSION,
  type AggregatedResultData,
  type InteractiveLesson,
  type LessonSession,
  type LessonSessionSnapshot,
  type OverlayResults,
  type SlideOverlay,
} from '@domain/entities/InteractiveSlides';
import type { ILiveResponseStore } from '@domain/ports/ILiveResponseStore';
import type { ISessionRepository } from '@domain/ports/ISessionRepository';
import type {
  IRealtimeBroadcaster,
  ServerToStudentMessage,
} from '@domain/ports/IRealtimeBroadcaster';
import {
  aggregateResponses,
  finalizeOverlayResults,
} from '@domain/rules/overlayRules';
import type { SessionId } from '@domain/valueObjects/InteractiveSlidesIds';
import { AnonymizeSession } from './AnonymizeSession';

export interface EndLessonSessionDeps {
  readonly sessionRepo: ISessionRepository;
  readonly liveStore: ILiveResponseStore;
  readonly broadcaster: IRealtimeBroadcaster;
  readonly clock: () => number;
}

export interface EndLessonSessionInput {
  readonly sessionId: SessionId;
  readonly lesson: InteractiveLesson;
  /** 'teacher-ended' | 'teacher-timeout' (60s grace 만료 등) */
  readonly reason?: string;
}

export type EndLessonSessionResult =
  | {
      readonly ok: true;
      readonly snapshot: LessonSessionSnapshot;
    }
  | {
      readonly ok: false;
      readonly reason: 'session-not-found' | 'already-archived';
    };

export async function EndLessonSession(
  deps: EndLessonSessionDeps,
  input: EndLessonSessionInput,
): Promise<EndLessonSessionResult> {
  const session = await deps.sessionRepo.loadSession(input.sessionId);
  if (!session) return { ok: false, reason: 'session-not-found' };
  if (session.status === 'archived') {
    return { ok: false, reason: 'already-archived' };
  }

  const archivedAt = deps.clock();

  // 1. 활성 오버레이 freeze
  const overlaysById = buildOverlayLookup(input.lesson);
  const allResults: OverlayResults[] = freezeAllOverlayResults(
    deps,
    input.sessionId,
    overlaysById,
    archivedAt,
  );

  // 2. archived 상태로 전이
  const archivedSession: LessonSession = {
    ...session,
    status: 'archived',
    archivedAt,
  };

  // 3. 익명화
  const allStudents = deps.liveStore.listStudents(input.sessionId);
  const anonymizeResult = AnonymizeSession({
    session: archivedSession,
    students: allStudents,
  });

  // 4. 스냅샷 저장
  const snapshot: LessonSessionSnapshot = {
    schemaVersion: LESSON_SESSION_SNAPSHOT_SCHEMA_VERSION,
    session: anonymizeResult.session,
    students: anonymizeResult.students,
    responses: deps.liveStore.listAllResponses(input.sessionId),
    overlayResults: allResults,
    anonymizationMap: anonymizeResult.mapping,
  };
  await deps.sessionRepo.saveSnapshot(snapshot);
  await deps.sessionRepo.saveSession(anonymizeResult.session);

  // 5. broadcast
  const message: ServerToStudentMessage = {
    type: 'lesson-ended',
    reason: input.reason,
  };
  deps.broadcaster.broadcastToStudents(input.sessionId, message);
  deps.broadcaster.sendToTeacher(input.sessionId, {
    type: 'session-archived',
    sessionId: input.sessionId,
  });

  // 6. 메모리 정리
  deps.liveStore.disposeSession(input.sessionId);

  return { ok: true, snapshot };
}

function buildOverlayLookup(
  lesson: InteractiveLesson,
): ReadonlyMap<string, SlideOverlay> {
  const map = new Map<string, SlideOverlay>();
  for (const slide of lesson.slides) {
    for (const ov of slide.overlays) map.set(ov.id, ov);
  }
  return map;
}

function freezeAllOverlayResults(
  deps: EndLessonSessionDeps,
  sessionId: SessionId,
  overlaysById: ReadonlyMap<string, SlideOverlay>,
  finalizedAt: number,
): OverlayResults[] {
  const out: OverlayResults[] = [];
  const seen = new Set<string>();

  // 이미 종료된 오버레이는 그대로
  for (const closed of deps.liveStore.listClosedOverlayResults(sessionId)) {
    out.push(finalizeOverlayResults(closed, finalizedAt));
    seen.add(closed.overlayId);
  }

  // 진행 중이던 오버레이 강제 freeze
  for (const live of deps.liveStore.listActiveOverlays(sessionId)) {
    if (seen.has(live.overlay.id)) continue;
    const overlay = overlaysById.get(live.overlay.id);
    if (!overlay) continue;
    const responses = deps.liveStore.listResponses(sessionId, overlay.id);
    const students = deps.liveStore.listStudents(sessionId);
    const aggregated: AggregatedResultData = aggregateResponses(
      overlay,
      responses,
      students,
    );
    const draft: OverlayResults = {
      overlayId: overlay.id,
      type: overlay.type,
      aggregated,
      respondCount: deps.liveStore.respondCount(sessionId, overlay.id),
      totalCount: deps.liveStore.studentCount(sessionId),
      finalizedAt: null,
    };
    out.push(finalizeOverlayResults(draft, finalizedAt));
    seen.add(overlay.id);
  }

  return out;
}
