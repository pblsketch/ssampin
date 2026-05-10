/**
 * AdvanceSlide — 교사 슬라이드 전환 (Design §4 U3).
 *
 * - 교사 권한 검증 (UseCase 레벨에서는 role 인자로 받음)
 * - status === 'active'에서만 허용
 * - 자동 활성화(autoActivate=true) 오버레이가 새 슬라이드에 있으면 ActivateOverlay 트리거
 *   → 본 UseCase는 자동 활성화 대상 ID 목록만 반환하고, 호출자가 ActivateOverlay 반복 호출
 *     (UseCase 간 직접 호출은 회피 — 의존 단순화)
 */

import type {
  InteractiveLesson,
  LessonSession,
  Slide,
} from '@domain/entities/InteractiveSlides';
import type { ISessionRepository } from '@domain/ports/ISessionRepository';
import type {
  IRealtimeBroadcaster,
  ServerToStudentMessage,
} from '@domain/ports/IRealtimeBroadcaster';
import type {
  OverlayId,
  SessionId,
} from '@domain/valueObjects/InteractiveSlidesIds';

export type RequesterRole = 'teacher' | 'student';

export interface AdvanceSlideDeps {
  readonly sessionRepo: ISessionRepository;
  readonly broadcaster: IRealtimeBroadcaster;
}

export interface AdvanceSlideInput {
  readonly sessionId: SessionId;
  readonly lesson: InteractiveLesson;
  readonly targetIndex: number;
  readonly requesterRole: RequesterRole;
}

export type AdvanceSlideResult =
  | {
      readonly ok: true;
      readonly session: LessonSession;
      readonly slide: Slide;
      readonly autoActivateIds: readonly OverlayId[];
    }
  | {
      readonly ok: false;
      readonly reason:
        | 'not-teacher'
        | 'session-not-found'
        | 'session-not-active'
        | 'index-out-of-range';
    };

export async function AdvanceSlide(
  deps: AdvanceSlideDeps,
  input: AdvanceSlideInput,
): Promise<AdvanceSlideResult> {
  if (input.requesterRole !== 'teacher') {
    return { ok: false, reason: 'not-teacher' };
  }

  const session = await deps.sessionRepo.loadSession(input.sessionId);
  if (!session) return { ok: false, reason: 'session-not-found' };
  if (session.status !== 'active') {
    return { ok: false, reason: 'session-not-active' };
  }

  if (
    input.targetIndex < 0 ||
    input.targetIndex >= input.lesson.slides.length
  ) {
    return { ok: false, reason: 'index-out-of-range' };
  }

  const slide = input.lesson.slides[input.targetIndex]!;
  const updated: LessonSession = {
    ...session,
    currentSlideIndex: input.targetIndex,
  };
  await deps.sessionRepo.saveSession(updated);

  const message: ServerToStudentMessage = {
    type: 'slide-changed',
    slideIndex: input.targetIndex,
    slide,
  };
  deps.broadcaster.broadcastToStudents(input.sessionId, message);

  const autoActivateIds: OverlayId[] = slide.overlays
    .filter((o) => o.autoActivate)
    .map((o) => o.id);

  return { ok: true, session: updated, slide, autoActivateIds };
}
