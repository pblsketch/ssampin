/**
 * SubmitStudentResponse — 학생 응답 제출 (Design §4.1 의사코드).
 *
 * 정책:
 * - status='archived' 세션 → 'rejected'
 * - 활성 오버레이 아니면 'rejected'
 * - deactivate 후 500ms grace 안에 도착한 응답 → 'late' (수락하되 마킹)
 * - upsert by (overlayId, studentToken) — 학생 정정 허용
 * - 교사에게 response-received broadcast (집계 결과)
 */

import type {
  AggregatedResultData,
  StudentResponse,
  StudentResponseData,
} from '@domain/entities/InteractiveSlides';
import type {
  ILiveResponseStore,
  LiveOverlayState,
} from '@domain/ports/ILiveResponseStore';
import type { ISessionRepository } from '@domain/ports/ISessionRepository';
import type {
  IRealtimeBroadcaster,
  ServerToTeacherMessage,
} from '@domain/ports/IRealtimeBroadcaster';
import {
  aggregateResponses,
  isResponseDataMatchingOverlay,
} from '@domain/rules/overlayRules';
import {
  asResponseId,
  type OverlayId,
  type SessionId,
  type StudentToken,
} from '@domain/valueObjects/InteractiveSlidesIds';

export const DEACTIVATION_GRACE_MS = 500;

export interface SubmitStudentResponseDeps {
  readonly sessionRepo: ISessionRepository;
  readonly liveStore: ILiveResponseStore;
  readonly broadcaster: IRealtimeBroadcaster;
  readonly clock: () => number;
  readonly makeResponseId: () => string;
}

export interface SubmitStudentResponseInput {
  readonly sessionId: SessionId;
  readonly overlayId: OverlayId;
  readonly studentToken: StudentToken;
  readonly clientResponseId: string;
  readonly data: StudentResponseData;
}

export type SubmitOutcome = 'recorded' | 'late' | 'rejected';

export async function SubmitStudentResponse(
  deps: SubmitStudentResponseDeps,
  input: SubmitStudentResponseInput,
): Promise<SubmitOutcome> {
  const session = await deps.sessionRepo.loadSession(input.sessionId);
  if (!session) return 'rejected';
  if (session.status !== 'active') return 'rejected';

  const liveState = deps.liveStore.getOverlayState(
    input.sessionId,
    input.overlayId,
  );
  if (!liveState) return 'rejected';

  // 데이터 type ↔ overlay type 검증 (도메인 레벨 안전망)
  if (!isResponseDataMatchingOverlay(input.data, liveState.overlay)) {
    return 'rejected';
  }

  const outcome = classifyOutcome(liveState, deps.clock());
  if (outcome === 'rejected') return 'rejected';

  const response: StudentResponse = {
    id: asResponseId(deps.makeResponseId()),
    sessionId: input.sessionId,
    slideId: liveState.slideId,
    overlayId: input.overlayId,
    studentToken: input.studentToken,
    clientResponseId: input.clientResponseId,
    data: input.data,
    submittedAt: deps.clock(),
  };
  deps.liveStore.upsertResponse(input.sessionId, response);

  // 교사 화면 집계 통보 (마스킹은 학생 broadcast 시점에서만, 교사는 full)
  const responses = deps.liveStore.listResponses(
    input.sessionId,
    input.overlayId,
  );
  const students = deps.liveStore.listStudents(input.sessionId);
  const aggregated: AggregatedResultData = aggregateResponses(
    liveState.overlay,
    responses,
    students,
  );
  const message: ServerToTeacherMessage = {
    type: 'response-received',
    overlayId: input.overlayId,
    aggregated,
    respondCount: deps.liveStore.respondCount(
      input.sessionId,
      input.overlayId,
    ),
    totalCount: deps.liveStore.studentCount(input.sessionId),
  };
  deps.broadcaster.sendToTeacher(input.sessionId, message);

  return outcome;
}

function classifyOutcome(
  liveState: LiveOverlayState,
  nowMs: number,
): SubmitOutcome {
  if (liveState.deactivatedAt === null) return 'recorded';
  const elapsed = nowMs - liveState.deactivatedAt;
  if (elapsed <= DEACTIVATION_GRACE_MS) return 'late';
  return 'rejected';
}
