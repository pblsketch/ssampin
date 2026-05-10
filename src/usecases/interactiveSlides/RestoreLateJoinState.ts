/**
 * RestoreLateJoinState — 학생 재접속 시 상태 복원 (Design §4 U8, §7.3).
 *
 * 정보 최소화 원칙 (PIPA §11.2):
 * - studentList는 인원 수만 (`totalOnline`)
 * - myResponses[]는 요청 학생 본인 응답만
 * - closedOverlays[].results는 visibility 마스킹 후
 */

import type {
  LateJoinActiveOverlay,
  LateJoinClosedOverlay,
  LateJoinMyResponse,
  LateJoinState,
  LessonSession,
} from '@domain/entities/InteractiveSlides';
import type { ILiveResponseStore } from '@domain/ports/ILiveResponseStore';
import type { ISessionRepository } from '@domain/ports/ISessionRepository';
import { maskResultsForStudent } from '@domain/rules/overlayRules';
import type {
  SessionId,
  StudentToken,
} from '@domain/valueObjects/InteractiveSlidesIds';

export interface RestoreLateJoinStateDeps {
  readonly sessionRepo: ISessionRepository;
  readonly liveStore: ILiveResponseStore;
}

export interface RestoreLateJoinStateInput {
  readonly sessionId: SessionId;
  readonly studentToken: StudentToken;
}

export type RestoreLateJoinStateResult =
  | { readonly ok: true; readonly state: LateJoinState }
  | {
      readonly ok: false;
      readonly reason: 'session-not-found' | 'session-archived';
    };

export async function RestoreLateJoinState(
  deps: RestoreLateJoinStateDeps,
  input: RestoreLateJoinStateInput,
): Promise<RestoreLateJoinStateResult> {
  const session = await deps.sessionRepo.loadSession(input.sessionId);
  if (!session) return { ok: false, reason: 'session-not-found' };
  if (session.status === 'archived') {
    return { ok: false, reason: 'session-archived' };
  }

  const state: LateJoinState = {
    slideIndex: session.currentSlideIndex,
    activeOverlays: buildActiveOverlays(deps, input.sessionId),
    closedOverlays: buildClosedOverlays(deps, session, input.sessionId),
    studentList: { totalOnline: countOnline(deps, input.sessionId) },
    myResponses: buildMyResponses(
      deps,
      input.sessionId,
      input.studentToken,
    ),
  };

  return { ok: true, state };
}

function buildActiveOverlays(
  deps: RestoreLateJoinStateDeps,
  sessionId: SessionId,
): readonly LateJoinActiveOverlay[] {
  return deps.liveStore.listActiveOverlays(sessionId).map((s) => ({
    id: s.overlay.id,
    activatedAt: s.activatedAt,
  }));
}

function buildClosedOverlays(
  deps: RestoreLateJoinStateDeps,
  session: LessonSession,
  sessionId: SessionId,
): readonly LateJoinClosedOverlay[] {
  return deps.liveStore.listClosedOverlayResults(sessionId).map((res) => ({
    id: res.overlayId,
    closedAt: res.finalizedAt ?? 0,
    results: maskResultsForStudent(res.aggregated, session.resultsVisibility),
  }));
}

function countOnline(
  deps: RestoreLateJoinStateDeps,
  sessionId: SessionId,
): number {
  let n = 0;
  for (const s of deps.liveStore.listStudents(sessionId)) {
    if (s.presence === 'online') n++;
  }
  return n;
}

function buildMyResponses(
  deps: RestoreLateJoinStateDeps,
  sessionId: SessionId,
  token: StudentToken,
): readonly LateJoinMyResponse[] {
  const all = deps.liveStore.listAllResponses(sessionId);
  const mine: LateJoinMyResponse[] = [];
  for (const r of all) {
    if (r.studentToken !== token) continue;
    mine.push({ overlayId: r.overlayId, submittedAt: r.submittedAt });
  }
  return mine;
}
