import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryLiveResponseStore } from './MemoryLiveResponseStore';
import type {
  SessionStudent,
  SlideOverlay,
  StudentResponse,
  OverlayResults,
} from '@domain/entities/InteractiveSlides';
import {
  asOverlayId,
  asResponseId,
  asSessionId,
  asSlideId,
  asStudentToken,
  type StudentToken,
} from '@domain/valueObjects/InteractiveSlidesIds';

const sessionA = asSessionId('sess-A');
const sessionB = asSessionId('sess-B');
const slideId = asSlideId('slide-1');
const overlayId = asOverlayId('ov-1');

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

const studentFixture = (
  token: string,
  name: string,
  presence: 'online' | 'offline' = 'online',
): SessionStudent => ({
  studentToken: asStudentToken(token),
  displayName: name,
  originalName: null,
  joinedAt: 1100,
  presence,
});

const pollResponse = (
  studentToken: StudentToken,
  optId: string,
  submittedAt: number,
): StudentResponse => ({
  id: asResponseId(`r-${studentToken}-${optId}`),
  sessionId: sessionA,
  slideId,
  overlayId,
  studentToken,
  clientResponseId: `c-${studentToken}-${optId}`,
  data: { type: 'poll', selectedOptionIds: [optId] },
  submittedAt,
});

describe('MemoryLiveResponseStore', () => {
  let store: MemoryLiveResponseStore;

  beforeEach(() => {
    store = new MemoryLiveResponseStore();
  });

  // ─────────────────────────────────────────────────────────────
  describe('Session lifecycle', () => {
    it('initSession 후 hasSession=true', () => {
      expect(store.hasSession(sessionA)).toBe(false);
      store.initSession(sessionA);
      expect(store.hasSession(sessionA)).toBe(true);
    });

    it('disposeSession 후 모든 상태 회수', () => {
      store.initSession(sessionA);
      store.addStudent(sessionA, studentFixture('t-1', 'a'));
      store.activateOverlay(sessionA, overlay, 1000);
      store.upsertResponse(sessionA, pollResponse(asStudentToken('t-1'), 'A', 2000));

      store.disposeSession(sessionA);

      expect(store.hasSession(sessionA)).toBe(false);
      expect(store.listStudents(sessionA)).toEqual([]);
      expect(store.listActiveOverlays(sessionA)).toEqual([]);
      expect(store.listAllResponses(sessionA)).toEqual([]);
    });

    it('두 세션은 독립 상태', () => {
      store.initSession(sessionA);
      store.initSession(sessionB);
      store.addStudent(sessionA, studentFixture('t-1', 'aA'));
      store.addStudent(sessionB, studentFixture('t-1', 'aB'));

      expect(store.studentCount(sessionA)).toBe(1);
      expect(store.studentCount(sessionB)).toBe(1);
      expect(store.listStudents(sessionA)[0]!.displayName).toBe('aA');
      expect(store.listStudents(sessionB)[0]!.displayName).toBe('aB');
    });

    it('초기화 안 된 세션은 모든 read가 안전한 기본값', () => {
      expect(store.studentCount(sessionA)).toBe(0);
      expect(store.listStudents(sessionA)).toEqual([]);
      expect(store.listActiveOverlays(sessionA)).toEqual([]);
      expect(store.respondCount(sessionA, overlayId)).toBe(0);
      expect(store.getOverlayState(sessionA, overlayId)).toBeNull();
      expect(
        store.findRecentlyDisconnected(
          sessionA,
          asStudentToken('any'),
          1000,
          60000,
        ),
      ).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('Students', () => {
    beforeEach(() => store.initSession(sessionA));

    it('addStudent 후 listStudents에 포함', () => {
      store.addStudent(sessionA, studentFixture('t-1', '홍길동'));
      const all = store.listStudents(sessionA);
      expect(all).toHaveLength(1);
      expect(all[0]!.displayName).toBe('홍길동');
    });

    it('동일 token 재등록은 덮어쓰기', () => {
      store.addStudent(sessionA, studentFixture('t-1', '홍길동'));
      store.addStudent(sessionA, studentFixture('t-1', '홍길순'));
      expect(store.studentCount(sessionA)).toBe(1);
      expect(store.listStudents(sessionA)[0]!.displayName).toBe('홍길순');
    });

    it('markStudentPresence: online → offline → online 전이', () => {
      store.addStudent(sessionA, studentFixture('t-1', 'a'));
      store.markStudentPresence(sessionA, asStudentToken('t-1'), false);
      expect(store.listStudents(sessionA)[0]!.presence).toBe('offline');
      store.markStudentPresence(sessionA, asStudentToken('t-1'), true);
      expect(store.listStudents(sessionA)[0]!.presence).toBe('online');
    });

    it('존재 안 하는 token은 markStudentPresence noop', () => {
      store.markStudentPresence(sessionA, asStudentToken('ghost'), true);
      expect(store.listStudents(sessionA)).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('findRecentlyDisconnected (rejoin window)', () => {
    beforeEach(() => store.initSession(sessionA));

    it('disconnect 후 60초 안이면 학생 반환', () => {
      const now = 100_000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      store.addStudent(sessionA, studentFixture('t-1', '홍길동'));
      store.markStudentPresence(sessionA, asStudentToken('t-1'), false);

      const r = store.findRecentlyDisconnected(
        sessionA,
        asStudentToken('t-1'),
        now + 30_000,
        60_000,
      );
      expect(r).not.toBeNull();
      expect(r!.studentToken).toBe('t-1');

      vi.restoreAllMocks();
    });

    it('disconnect 후 60초 초과면 null', () => {
      const now = 100_000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      store.addStudent(sessionA, studentFixture('t-1', '홍길동'));
      store.markStudentPresence(sessionA, asStudentToken('t-1'), false);

      const r = store.findRecentlyDisconnected(
        sessionA,
        asStudentToken('t-1'),
        now + 60_001,
        60_000,
      );
      expect(r).toBeNull();

      vi.restoreAllMocks();
    });

    it('disconnect 기록 없는 token은 null', () => {
      store.addStudent(sessionA, studentFixture('t-1', '홍길동'));
      const r = store.findRecentlyDisconnected(
        sessionA,
        asStudentToken('t-1'),
        100_000,
        60_000,
      );
      expect(r).toBeNull();
    });

    it('reonline 시 disconnect 기록 제거 (rejoin 후 재참여 X)', () => {
      const now = 100_000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      store.addStudent(sessionA, studentFixture('t-1', '홍길동'));
      store.markStudentPresence(sessionA, asStudentToken('t-1'), false);
      store.markStudentPresence(sessionA, asStudentToken('t-1'), true);

      const r = store.findRecentlyDisconnected(
        sessionA,
        asStudentToken('t-1'),
        now + 30_000,
        60_000,
      );
      expect(r).toBeNull();

      vi.restoreAllMocks();
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('Overlays', () => {
    beforeEach(() => store.initSession(sessionA));

    it('activateOverlay 후 listActiveOverlays에 포함', () => {
      store.activateOverlay(sessionA, overlay, 1000);
      const active = store.listActiveOverlays(sessionA);
      expect(active).toHaveLength(1);
      expect(active[0]!.activatedAt).toBe(1000);
      expect(active[0]!.deactivatedAt).toBeNull();
    });

    it('markDeactivated 후 listActiveOverlays에서 제외', () => {
      store.activateOverlay(sessionA, overlay, 1000);
      store.markDeactivated(sessionA, overlayId, 5000);
      expect(store.listActiveOverlays(sessionA)).toEqual([]);
      const state = store.getOverlayState(sessionA, overlayId);
      expect(state?.deactivatedAt).toBe(5000);
    });

    it('이미 deactivated된 오버레이 markDeactivated 재호출은 noop', () => {
      store.activateOverlay(sessionA, overlay, 1000);
      store.markDeactivated(sessionA, overlayId, 5000);
      store.markDeactivated(sessionA, overlayId, 9999);
      expect(store.getOverlayState(sessionA, overlayId)?.deactivatedAt).toBe(5000);
    });

    it('setOverlayResults / listClosedOverlayResults', () => {
      const results: OverlayResults = {
        overlayId,
        type: 'poll',
        aggregated: { type: 'poll', counts: { A: 2, B: 1 }, totalVotes: 3 },
        respondCount: 3,
        totalCount: 5,
        finalizedAt: 5000,
      };
      store.setOverlayResults(sessionA, results);
      const closed = store.listClosedOverlayResults(sessionA);
      expect(closed).toHaveLength(1);
      expect(closed[0]).toEqual(results);
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('Responses (upsert by overlayId+studentToken)', () => {
    beforeEach(() => {
      store.initSession(sessionA);
      store.addStudent(sessionA, studentFixture('t-A', 'a'));
      store.addStudent(sessionA, studentFixture('t-B', 'b'));
    });

    it('한 학생당 한 응답만 (upsert)', () => {
      store.upsertResponse(sessionA, pollResponse(asStudentToken('t-A'), 'A', 2000));
      store.upsertResponse(sessionA, pollResponse(asStudentToken('t-A'), 'B', 3000));

      const all = store.listResponses(sessionA, overlayId);
      expect(all).toHaveLength(1);
      if (all[0]!.data.type === 'poll') {
        expect(all[0]!.data.selectedOptionIds).toEqual(['B']); // 최신값
      }
    });

    it('서로 다른 학생 응답은 분리 누적', () => {
      store.upsertResponse(sessionA, pollResponse(asStudentToken('t-A'), 'A', 2000));
      store.upsertResponse(sessionA, pollResponse(asStudentToken('t-B'), 'A', 2100));

      expect(store.respondCount(sessionA, overlayId)).toBe(2);
      expect(store.listResponses(sessionA, overlayId)).toHaveLength(2);
    });

    it('listAllResponses는 모든 overlay 응답 포함', () => {
      const otherOverlayId = asOverlayId('ov-2');
      store.upsertResponse(sessionA, pollResponse(asStudentToken('t-A'), 'A', 2000));
      store.upsertResponse(sessionA, {
        ...pollResponse(asStudentToken('t-A'), 'A', 2100),
        overlayId: otherOverlayId,
      });
      expect(store.listAllResponses(sessionA)).toHaveLength(2);
    });
  });
});
