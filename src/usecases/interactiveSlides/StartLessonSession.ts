/**
 * StartLessonSession — 새 세션 생성 + shortCode 발급 (Design §4 U1).
 *
 * - status='lobby'로 시작
 * - shortCode 충돌 시 최대 N회 재생성
 * - LiveResponseStore에 세션 슬롯 초기화
 */

import type {
  InteractiveLesson,
  LessonSession,
  ResultsVisibility,
  SessionAccessMode,
} from '@domain/entities/InteractiveSlides';
import type { ILiveResponseStore } from '@domain/ports/ILiveResponseStore';
import type { ISessionRepository } from '@domain/ports/ISessionRepository';
import { generateShortCode } from '@domain/rules/overlayRules';
import {
  asSessionId,
  asShortCode,
  type LessonId,
  type SessionId,
  type ShortCode,
} from '@domain/valueObjects/InteractiveSlidesIds';

export interface StartLessonSessionDeps {
  readonly sessionRepo: ISessionRepository;
  readonly liveStore: ILiveResponseStore;
  readonly clock: () => number;
  readonly random: () => number;
  readonly makeSessionId: () => string;
  /**
   * 같은 lesson에 이미 존재하는 shortCode 충돌 검사용.
   * 구현체는 진행 중 세션만 검사하면 됨 (archived는 코드 무효화 가정).
   */
  readonly findActiveByShortCode: (code: ShortCode) => Promise<LessonSession | null>;
}

export interface StartLessonSessionInput {
  readonly lesson: InteractiveLesson;
  readonly sessionName: string;
  readonly accessMode: SessionAccessMode;
  readonly resultsVisibility?: ResultsVisibility;
}

export const SHORT_CODE_MAX_GENERATION_ATTEMPTS = 16;

export class ShortCodeCollisionError extends Error {
  readonly code = 'shortcode-collision' as const;
  constructor() {
    super('Failed to generate unique shortCode after max attempts');
  }
}

export async function StartLessonSession(
  deps: StartLessonSessionDeps,
  input: StartLessonSessionInput,
): Promise<LessonSession> {
  const code = await allocateShortCode(deps);

  const session: LessonSession = {
    id: asSessionId(deps.makeSessionId()),
    lessonId: input.lesson.id,
    sessionName: input.sessionName,
    shortCode: code,
    status: 'lobby',
    currentSlideIndex: 0,
    resultsVisibility: input.resultsVisibility ?? 'anonymous',
    accessMode: input.accessMode,
    startedAt: deps.clock(),
    archivedAt: null,
    anonymized: false,
  };

  await deps.sessionRepo.saveSession(session);
  deps.liveStore.initSession(session.id);

  return session;
}

async function allocateShortCode(
  deps: StartLessonSessionDeps,
): Promise<ShortCode> {
  for (let i = 0; i < SHORT_CODE_MAX_GENERATION_ATTEMPTS; i++) {
    const candidate = asShortCode(generateShortCode(deps.random));
    const collision = await deps.findActiveByShortCode(candidate);
    if (!collision) return candidate;
  }
  throw new ShortCodeCollisionError();
}

// Re-export to allow `Plan §3 F4` type-checking from outside
export type { LessonId, SessionId };
