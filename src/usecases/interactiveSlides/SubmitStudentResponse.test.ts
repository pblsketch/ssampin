import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEACTIVATION_GRACE_MS,
  SubmitStudentResponse,
} from './SubmitStudentResponse';
import {
  FakeBroadcaster,
  FakeLiveResponseStore,
  FakeSessionRepository,
} from './testFakes';
import type {
  LessonSession,
  SessionStudent,
  SlideOverlay,
} from '@domain/entities/InteractiveSlides';
import {
  asLessonId,
  asOverlayId,
  asSessionId,
  asShortCode,
  asSlideId,
  asStudentToken,
} from '@domain/valueObjects/InteractiveSlidesIds';

const sessionId = asSessionId('sess-1');
const overlayId = asOverlayId('ov-1');
const slideId = asSlideId('slide-1');
const studentA = asStudentToken('tok-A');
const studentB = asStudentToken('tok-B');

const pollOverlay: SlideOverlay = {
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

const activeSession: LessonSession = {
  id: sessionId,
  lessonId: asLessonId('lesson-1'),
  sessionName: 's',
  shortCode: asShortCode('ACDEFG'),
  status: 'active',
  currentSlideIndex: 0,
  resultsVisibility: 'anonymous',
  accessMode: 'lan',
  startedAt: 1000,
  archivedAt: null,
  anonymized: false,
};

const studentFixture = (token: string, name: string): SessionStudent => ({
  studentToken: asStudentToken(token),
  displayName: name,
  originalName: null,
  joinedAt: 1100,
  presence: 'online',
});

describe('SubmitStudentResponse', () => {
  let sessionRepo: FakeSessionRepository;
  let liveStore: FakeLiveResponseStore;
  let broadcaster: FakeBroadcaster;
  let now = 5000;
  let responseSeq = 0;

  const setup = (sessionOverride?: Partial<LessonSession>) => {
    sessionRepo = new FakeSessionRepository();
    liveStore = new FakeLiveResponseStore();
    broadcaster = new FakeBroadcaster();
    const session: LessonSession = { ...activeSession, ...sessionOverride };
    sessionRepo.sessions.set(sessionId, session);
    liveStore.initSession(sessionId);
    return session;
  };

  const deps = () => ({
    sessionRepo,
    liveStore,
    broadcaster,
    clock: () => now,
    makeResponseId: () => `r-${++responseSeq}`,
  });

  beforeEach(() => {
    now = 5000;
    responseSeq = 0;
  });

  it('활성 오버레이에 정상 응답 → recorded', async () => {
    setup();
    liveStore.activateOverlay(sessionId, pollOverlay, 4000);
    liveStore.addStudent(sessionId, studentFixture('tok-A', '홍길동A'));

    const result = await SubmitStudentResponse(deps(), {
      sessionId,
      overlayId,
      studentToken: studentA,
      clientResponseId: 'c1',
      data: { type: 'poll', selectedOptionIds: ['A'] },
    });
    expect(result).toBe('recorded');

    // 교사에게 response-received 통보
    expect(broadcaster.teacherMessages).toHaveLength(1);
    expect(broadcaster.teacherMessages[0]!.msg.type).toBe('response-received');
  });

  it('archived 세션 → rejected', async () => {
    setup({ status: 'archived', archivedAt: 4000 });
    liveStore.activateOverlay(sessionId, pollOverlay, 3000);

    const result = await SubmitStudentResponse(deps(), {
      sessionId,
      overlayId,
      studentToken: studentA,
      clientResponseId: 'c1',
      data: { type: 'poll', selectedOptionIds: ['A'] },
    });
    expect(result).toBe('rejected');
  });

  it('비활성 오버레이 (state 없음) → rejected', async () => {
    setup();
    // activateOverlay 호출 X

    const result = await SubmitStudentResponse(deps(), {
      sessionId,
      overlayId,
      studentToken: studentA,
      clientResponseId: 'c1',
      data: { type: 'poll', selectedOptionIds: ['A'] },
    });
    expect(result).toBe('rejected');
  });

  it('데이터 type ↔ overlay type 불일치 → rejected (도메인 안전망)', async () => {
    setup();
    liveStore.activateOverlay(sessionId, pollOverlay, 4000);

    const result = await SubmitStudentResponse(deps(), {
      sessionId,
      overlayId,
      studentToken: studentA,
      clientResponseId: 'c1',
      data: { type: 'text', value: '엉뚱' },
    });
    expect(result).toBe('rejected');
  });

  it('grace 안 (deactivate 후 500ms 이내) → late', async () => {
    setup();
    liveStore.activateOverlay(sessionId, pollOverlay, 4000);
    liveStore.markDeactivated(sessionId, overlayId, 4900);
    now = 5000; // 100ms after deactivate

    const result = await SubmitStudentResponse(deps(), {
      sessionId,
      overlayId,
      studentToken: studentA,
      clientResponseId: 'c1',
      data: { type: 'poll', selectedOptionIds: ['A'] },
    });
    expect(result).toBe('late');
  });

  it('grace 초과 (500ms 후) → rejected', async () => {
    setup();
    liveStore.activateOverlay(sessionId, pollOverlay, 4000);
    liveStore.markDeactivated(sessionId, overlayId, 4000);
    now = 4000 + DEACTIVATION_GRACE_MS + 1;

    const result = await SubmitStudentResponse(deps(), {
      sessionId,
      overlayId,
      studentToken: studentA,
      clientResponseId: 'c1',
      data: { type: 'poll', selectedOptionIds: ['A'] },
    });
    expect(result).toBe('rejected');
  });

  it('동일 (overlayId, studentToken) 재제출 → upsert (정정 허용)', async () => {
    setup();
    liveStore.activateOverlay(sessionId, pollOverlay, 4000);
    liveStore.addStudent(sessionId, studentFixture('tok-A', '홍길동A'));

    await SubmitStudentResponse(deps(), {
      sessionId,
      overlayId,
      studentToken: studentA,
      clientResponseId: 'c1',
      data: { type: 'poll', selectedOptionIds: ['A'] },
    });
    now = 5500;
    await SubmitStudentResponse(deps(), {
      sessionId,
      overlayId,
      studentToken: studentA,
      clientResponseId: 'c2',
      data: { type: 'poll', selectedOptionIds: ['B'] },
    });

    // 한 학생당 하나의 응답만
    const all = liveStore.listResponses(sessionId, overlayId);
    expect(all).toHaveLength(1);
    if (all[0]!.data.type === 'poll') {
      expect(all[0]!.data.selectedOptionIds).toEqual(['B']);
    }
  });

  it('서로 다른 학생 응답은 별도로 누적', async () => {
    setup();
    liveStore.activateOverlay(sessionId, pollOverlay, 4000);
    liveStore.addStudent(sessionId, studentFixture('tok-A', 'a'));
    liveStore.addStudent(sessionId, studentFixture('tok-B', 'b'));

    await SubmitStudentResponse(deps(), {
      sessionId,
      overlayId,
      studentToken: studentA,
      clientResponseId: 'c1',
      data: { type: 'poll', selectedOptionIds: ['A'] },
    });
    await SubmitStudentResponse(deps(), {
      sessionId,
      overlayId,
      studentToken: studentB,
      clientResponseId: 'c2',
      data: { type: 'poll', selectedOptionIds: ['A'] },
    });

    expect(liveStore.respondCount(sessionId, overlayId)).toBe(2);
  });
});
