import { beforeEach, describe, expect, it } from 'vitest';
import { EndLessonSession } from './EndLessonSession';
import {
  FakeBroadcaster,
  FakeLiveResponseStore,
  FakeSessionRepository,
} from './testFakes';
import type {
  InteractiveLesson,
  LessonSession,
  Slide,
  SlideOverlay,
  StudentResponse,
} from '@domain/entities/InteractiveSlides';
import {
  asLessonId,
  asOverlayId,
  asResponseId,
  asSessionId,
  asShortCode,
  asSlideId,
  asStudentToken,
} from '@domain/valueObjects/InteractiveSlidesIds';

const sessionId = asSessionId('sess-1');
const lessonId = asLessonId('lesson-1');
const slideId = asSlideId('slide-1');
const overlayId = asOverlayId('ov-1');
const studentA = asStudentToken('tok-A');
const studentB = asStudentToken('tok-B');

const overlay: SlideOverlay = {
  id: overlayId,
  slideId,
  type: 'poll',
  position: { xPercent: 0, yPercent: 0, widthPercent: 50, heightPercent: 30 },
  autoActivate: false,
  config: {
    type: 'poll',
    question: 'Q',
    options: [
      { id: 'A', label: 'A' },
      { id: 'B', label: 'B' },
    ],
    multiSelect: false,
  },
  createdAt: 1000,
};

const slide: Slide = {
  id: slideId,
  pageNumber: 1,
  imagePath: 'file:///cache/1.png',
  overlays: [overlay],
};

const lesson: InteractiveLesson = {
  id: lessonId,
  title: '수업',
  source: { type: 'pdf', originalFileName: 't.pdf', originalSize: 1000 },
  slides: [slide],
  createdAt: 100,
  updatedAt: 100,
};

const activeSession: LessonSession = {
  id: sessionId,
  lessonId,
  sessionName: '2반 1교시',
  shortCode: asShortCode('ACDEFG'),
  status: 'active',
  currentSlideIndex: 0,
  resultsVisibility: 'anonymous',
  accessMode: 'lan',
  startedAt: 1000,
  archivedAt: null,
  anonymized: false,
};

describe('EndLessonSession', () => {
  let sessionRepo: FakeSessionRepository;
  let liveStore: FakeLiveResponseStore;
  let broadcaster: FakeBroadcaster;
  let now = 9999;

  const deps = () => ({ sessionRepo, liveStore, broadcaster, clock: () => now });

  beforeEach(() => {
    sessionRepo = new FakeSessionRepository();
    liveStore = new FakeLiveResponseStore();
    broadcaster = new FakeBroadcaster();
    now = 9999;
  });

  it('진행 중 활성 오버레이 freeze + 학생 익명화 + 스냅샷 저장', async () => {
    sessionRepo.sessions.set(sessionId, activeSession);
    liveStore.initSession(sessionId);
    liveStore.addStudent(sessionId, {
      studentToken: studentA,
      displayName: '홍길동',
      originalName: null,
      joinedAt: 1100,
      presence: 'online',
    });
    liveStore.addStudent(sessionId, {
      studentToken: studentB,
      displayName: '김철수',
      originalName: null,
      joinedAt: 1101,
      presence: 'online',
    });
    liveStore.activateOverlay(sessionId, overlay, 2000);

    const respA: StudentResponse = {
      id: asResponseId('r1'),
      sessionId,
      slideId,
      overlayId,
      studentToken: studentA,
      clientResponseId: 'c1',
      data: { type: 'poll', selectedOptionIds: ['A'] },
      submittedAt: 2500,
    };
    liveStore.upsertResponse(sessionId, respA);

    const result = await EndLessonSession(deps(), { sessionId, lesson });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 1) session archived
    expect(result.snapshot.session.status).toBe('archived');
    expect(result.snapshot.session.archivedAt).toBe(now);
    expect(result.snapshot.session.anonymized).toBe(true);

    // 2) 학생 익명화 (실명 → 학생N)
    const names = result.snapshot.students.map((s) => s.displayName);
    expect(names).toEqual(['학생1', '학생2']);
    expect(result.snapshot.students[0]!.originalName).toBe('홍길동');

    // 3) 매핑 테이블
    expect(result.snapshot.anonymizationMap[studentA]).toBe('학생1');
    expect(result.snapshot.anonymizationMap[studentB]).toBe('학생2');

    // 4) overlayResults freeze
    expect(result.snapshot.overlayResults).toHaveLength(1);
    expect(result.snapshot.overlayResults[0]!.finalizedAt).toBe(now);

    // 5) sessionRepo에 저장됨
    expect(sessionRepo.snapshots.has(sessionId)).toBe(true);

    // 6) lesson-ended broadcast + session-archived (교사)
    expect(
      broadcaster.studentBroadcasts.some((b) => b.msg.type === 'lesson-ended'),
    ).toBe(true);
    expect(
      broadcaster.teacherMessages.some((m) => m.msg.type === 'session-archived'),
    ).toBe(true);
  });

  it('이미 archived 세션은 already-archived 반환', async () => {
    sessionRepo.sessions.set(sessionId, {
      ...activeSession,
      status: 'archived',
      archivedAt: 5000,
    });

    const result = await EndLessonSession(deps(), { sessionId, lesson });
    expect(result).toEqual({ ok: false, reason: 'already-archived' });
  });

  it('세션 없음 → session-not-found', async () => {
    const result = await EndLessonSession(deps(), { sessionId, lesson });
    expect(result).toEqual({ ok: false, reason: 'session-not-found' });
  });

  it('liveStore 메모리는 dispose됨', async () => {
    sessionRepo.sessions.set(sessionId, activeSession);
    liveStore.initSession(sessionId);
    expect(liveStore.hasSession(sessionId)).toBe(true);

    await EndLessonSession(deps(), { sessionId, lesson });
    expect(liveStore.hasSession(sessionId)).toBe(false);
  });
});
