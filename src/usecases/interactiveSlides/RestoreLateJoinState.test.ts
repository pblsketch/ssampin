import { beforeEach, describe, expect, it } from 'vitest';
import { RestoreLateJoinState } from './RestoreLateJoinState';
import {
  FakeLiveResponseStore,
  FakeSessionRepository,
} from './testFakes';
import type {
  LessonSession,
  OverlayResults,
  SessionStudent,
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
const overlayActiveId = asOverlayId('ov-active');
const overlayClosedId = asOverlayId('ov-closed');
const slideId = asSlideId('slide-1');
const studentMeToken = asStudentToken('tok-me');
const studentOtherToken = asStudentToken('tok-other');

const buildOverlay = (id: typeof overlayActiveId): SlideOverlay => ({
  id,
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
});

const session = (vis: 'hidden' | 'anonymous' | 'full' = 'anonymous'): LessonSession => ({
  id: sessionId,
  lessonId: asLessonId('lesson-1'),
  sessionName: 's',
  shortCode: asShortCode('ACDEFG'),
  status: 'active',
  currentSlideIndex: 3,
  resultsVisibility: vis,
  accessMode: 'lan',
  startedAt: 1000,
  archivedAt: null,
  anonymized: false,
});

const student = (token: typeof studentMeToken, name: string): SessionStudent => ({
  studentToken: token,
  displayName: name,
  originalName: null,
  joinedAt: 1100,
  presence: 'online',
});

describe('RestoreLateJoinState (PIPA §11.2 정보 최소화)', () => {
  let sessionRepo: FakeSessionRepository;
  let liveStore: FakeLiveResponseStore;

  beforeEach(() => {
    sessionRepo = new FakeSessionRepository();
    liveStore = new FakeLiveResponseStore();
  });

  it('myResponses는 요청 학생 본인 것만', async () => {
    sessionRepo.sessions.set(sessionId, session());
    liveStore.initSession(sessionId);

    const ovActive = buildOverlay(overlayActiveId);
    liveStore.activateOverlay(sessionId, ovActive, 1500);

    // 두 학생의 응답을 모두 저장 — 본인 것만 필터되어야 함
    const meResp: StudentResponse = {
      id: asResponseId('r-me'),
      sessionId,
      slideId,
      overlayId: overlayActiveId,
      studentToken: studentMeToken,
      clientResponseId: 'c1',
      data: { type: 'poll', selectedOptionIds: ['A'] },
      submittedAt: 2000,
    };
    const otherResp: StudentResponse = {
      ...meResp,
      id: asResponseId('r-other'),
      studentToken: studentOtherToken,
      clientResponseId: 'c2',
      submittedAt: 2100,
    };
    liveStore.upsertResponse(sessionId, meResp);
    liveStore.upsertResponse(sessionId, otherResp);

    const result = await RestoreLateJoinState(
      { sessionRepo, liveStore },
      { sessionId, studentToken: studentMeToken },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.myResponses).toHaveLength(1);
    expect(result.state.myResponses[0]!.overlayId).toBe(overlayActiveId);
  });

  it('studentList는 인원 수만 (다른 학생 정보 노출 X)', async () => {
    sessionRepo.sessions.set(sessionId, session());
    liveStore.initSession(sessionId);

    liveStore.addStudent(sessionId, student(studentMeToken, '홍길동'));
    liveStore.addStudent(sessionId, student(studentOtherToken, '김철수'));
    // offline은 카운트에서 제외
    const ghost = asStudentToken('tok-ghost');
    liveStore.addStudent(sessionId, {
      ...student(ghost, '유령'),
      presence: 'offline',
    });

    const result = await RestoreLateJoinState(
      { sessionRepo, liveStore },
      { sessionId, studentToken: studentMeToken },
    );
    if (!result.ok) throw new Error('expected ok');

    const state = result.state;
    expect(state.studentList).toEqual({ totalOnline: 2 });
    // 다른 키가 추가되지 않음을 보장
    expect(Object.keys(state.studentList)).toEqual(['totalOnline']);
  });

  it('closedOverlays.results는 visibility 마스킹 적용', async () => {
    sessionRepo.sessions.set(sessionId, session('hidden'));
    liveStore.initSession(sessionId);

    const closedResults: OverlayResults = {
      overlayId: overlayClosedId,
      type: 'poll',
      aggregated: { type: 'poll', counts: { A: 3, B: 1 }, totalVotes: 4 },
      respondCount: 4,
      totalCount: 5,
      finalizedAt: 3000,
    };
    liveStore.setOverlayResults(sessionId, closedResults);

    const result = await RestoreLateJoinState(
      { sessionRepo, liveStore },
      { sessionId, studentToken: studentMeToken },
    );
    if (!result.ok) throw new Error('expected ok');

    expect(result.state.closedOverlays).toHaveLength(1);
    // hidden 모드 → results = null
    expect(result.state.closedOverlays[0]!.results).toBeNull();
  });

  it('archived 세션은 거부', async () => {
    sessionRepo.sessions.set(sessionId, {
      ...session(),
      status: 'archived',
      archivedAt: 5000,
    });

    const result = await RestoreLateJoinState(
      { sessionRepo, liveStore },
      { sessionId, studentToken: studentMeToken },
    );
    expect(result).toEqual({ ok: false, reason: 'session-archived' });
  });
});
