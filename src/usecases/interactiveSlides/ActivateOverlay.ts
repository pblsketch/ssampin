/**
 * ActivateOverlay — 활동 활성화 (Design §4 U4).
 *
 * - Phase 1 제약: 슬라이드당 동시 활성 1개 (`canActivateOverlay`)
 * - LiveResponseStore에 활성 상태 기록
 * - 학생 전체에 broadcast: overlay-activated
 *
 * UI 측 확인 다이얼로그(P0)는 Adapter가 처리. UseCase는 dialog confirm을 가정.
 */

import type {
  InteractiveLesson,
  Slide,
  SlideOverlay,
} from '@domain/entities/InteractiveSlides';
import type { ILiveResponseStore } from '@domain/ports/ILiveResponseStore';
import type { ISessionRepository } from '@domain/ports/ISessionRepository';
import type {
  IRealtimeBroadcaster,
  ServerToStudentMessage,
} from '@domain/ports/IRealtimeBroadcaster';
import { canActivateOverlay } from '@domain/rules/overlayRules';
import type {
  OverlayId,
  SessionId,
} from '@domain/valueObjects/InteractiveSlidesIds';

export interface ActivateOverlayDeps {
  readonly sessionRepo: ISessionRepository;
  readonly liveStore: ILiveResponseStore;
  readonly broadcaster: IRealtimeBroadcaster;
  readonly clock: () => number;
}

export interface ActivateOverlayInput {
  readonly sessionId: SessionId;
  readonly lesson: InteractiveLesson;
  readonly overlayId: OverlayId;
}

export type ActivateOverlayResult =
  | {
      readonly ok: true;
      readonly overlay: SlideOverlay;
      readonly activatedAt: number;
    }
  | {
      readonly ok: false;
      readonly reason:
        | 'session-not-found'
        | 'session-not-active'
        | 'overlay-not-found'
        | 'already-active-on-slide';
    };

export async function ActivateOverlay(
  deps: ActivateOverlayDeps,
  input: ActivateOverlayInput,
): Promise<ActivateOverlayResult> {
  const session = await deps.sessionRepo.loadSession(input.sessionId);
  if (!session) return { ok: false, reason: 'session-not-found' };
  if (session.status !== 'active') {
    return { ok: false, reason: 'session-not-active' };
  }

  const slide = findSlideByOverlay(input.lesson, input.overlayId);
  if (!slide) return { ok: false, reason: 'overlay-not-found' };

  // 같은 슬라이드의 활성 overlay 집합
  const activeIds = new Set<OverlayId>();
  for (const ov of deps.liveStore.listActiveOverlays(input.sessionId)) {
    if (ov.slideId === slide.id) activeIds.add(ov.overlay.id);
  }

  const check = canActivateOverlay(slide, input.overlayId, activeIds);
  if (!check.allowed) {
    if (check.reason === 'overlay-not-found') {
      return { ok: false, reason: 'overlay-not-found' };
    }
    return { ok: false, reason: 'already-active-on-slide' };
  }

  const overlay = slide.overlays.find((o) => o.id === input.overlayId)!;
  const activatedAt = deps.clock();
  deps.liveStore.activateOverlay(input.sessionId, overlay, activatedAt);

  const message: ServerToStudentMessage = {
    type: 'overlay-activated',
    overlayId: overlay.id,
    config: overlay.config,
    position: overlay.position,
    activatedAt,
  };
  deps.broadcaster.broadcastToStudents(input.sessionId, message);

  return { ok: true, overlay, activatedAt };
}

function findSlideByOverlay(
  lesson: InteractiveLesson,
  overlayId: OverlayId,
): Slide | null {
  for (const slide of lesson.slides) {
    if (slide.overlays.some((o) => o.id === overlayId)) return slide;
  }
  return null;
}
