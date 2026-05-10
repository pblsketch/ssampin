/**
 * DeactivateOverlay — 활동 종료 + 결과 freeze + visibility 마스킹 (Design §4 U5).
 *
 * - LiveResponseStore에 deactivatedAt 기록 (응답은 500ms grace 동안 'late'로 수락 — SubmitStudentResponse 참조)
 * - aggregateResponses + finalizeOverlayResults
 * - visibility별 결과 마스킹 후 학생 전체 broadcast
 */

import type {
  AggregatedResultData,
  LessonSession,
  OverlayResults,
  ResultsVisibility,
  SlideOverlay,
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
  maskResultsForStudent,
} from '@domain/rules/overlayRules';
import type {
  OverlayId,
  SessionId,
} from '@domain/valueObjects/InteractiveSlidesIds';

export interface DeactivateOverlayDeps {
  readonly sessionRepo: ISessionRepository;
  readonly liveStore: ILiveResponseStore;
  readonly broadcaster: IRealtimeBroadcaster;
  readonly clock: () => number;
}

export interface DeactivateOverlayInput {
  readonly sessionId: SessionId;
  readonly overlayId: OverlayId;
  /** undefined면 세션 기본값(session.resultsVisibility) 사용 */
  readonly visibility?: ResultsVisibility;
}

export type DeactivateOverlayResult =
  | { readonly ok: true; readonly results: OverlayResults }
  | {
      readonly ok: false;
      readonly reason: 'session-not-found' | 'overlay-not-active';
    };

export async function DeactivateOverlay(
  deps: DeactivateOverlayDeps,
  input: DeactivateOverlayInput,
): Promise<DeactivateOverlayResult> {
  const session = await deps.sessionRepo.loadSession(input.sessionId);
  if (!session) return { ok: false, reason: 'session-not-found' };

  const liveState = deps.liveStore.getOverlayState(
    input.sessionId,
    input.overlayId,
  );
  if (!liveState || liveState.deactivatedAt !== null) {
    return { ok: false, reason: 'overlay-not-active' };
  }

  const deactivatedAt = deps.clock();
  deps.liveStore.markDeactivated(
    input.sessionId,
    input.overlayId,
    deactivatedAt,
  );

  const results = computeResults(deps, session, liveState.overlay, deactivatedAt);
  deps.liveStore.setOverlayResults(input.sessionId, results);

  const visibility = input.visibility ?? session.resultsVisibility;
  const studentMaskedResults = maskResultsForStudent(
    results.aggregated,
    visibility,
  );

  const message: ServerToStudentMessage = {
    type: 'overlay-deactivated',
    overlayId: input.overlayId,
    results: studentMaskedResults,
  };
  deps.broadcaster.broadcastToStudents(input.sessionId, message);
  deps.broadcaster.sendToTeacher(input.sessionId, {
    type: 'overlay-finalized',
    results,
  });

  return { ok: true, results };
}

function computeResults(
  deps: DeactivateOverlayDeps,
  session: LessonSession,
  overlay: SlideOverlay,
  finalizedAt: number,
): OverlayResults {
  const responses = deps.liveStore.listResponses(session.id, overlay.id);
  const students = deps.liveStore.listStudents(session.id);
  const aggregated: AggregatedResultData = aggregateResponses(
    overlay,
    responses,
    students,
  );

  const draft: OverlayResults = {
    overlayId: overlay.id,
    type: overlay.type,
    aggregated,
    respondCount: deps.liveStore.respondCount(session.id, overlay.id),
    totalCount: deps.liveStore.studentCount(session.id),
    finalizedAt: null,
  };
  return finalizeOverlayResults(draft, finalizedAt);
}
