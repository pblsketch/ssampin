import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { JsonInteractiveLessonRepository } from './JsonInteractiveLessonRepository';
import {
  LESSON_SESSION_SNAPSHOT_SCHEMA_VERSION,
  type LessonSession,
  type LessonSessionSnapshot,
} from '@domain/entities/InteractiveSlides';
import {
  asLessonId,
  asSessionId,
  asShortCode,
  type SessionId,
} from '@domain/valueObjects/InteractiveSlidesIds';

const buildSession = (overrides: Partial<LessonSession> & { id: SessionId }): LessonSession => ({
  lessonId: asLessonId('lesson-1'),
  sessionName: '2반 1교시',
  shortCode: asShortCode('ACDEFG'),
  status: 'lobby',
  currentSlideIndex: 0,
  resultsVisibility: 'anonymous',
  accessMode: 'lan',
  startedAt: 1000,
  archivedAt: null,
  anonymized: false,
  ...overrides,
});

const buildSnapshot = (
  session: LessonSession,
  overrides: Partial<LessonSessionSnapshot> = {},
): LessonSessionSnapshot => ({
  schemaVersion: LESSON_SESSION_SNAPSHOT_SCHEMA_VERSION,
  session,
  students: [],
  responses: [],
  overlayResults: [],
  anonymizationMap: {},
  ...overrides,
});

describe('JsonInteractiveLessonRepository', () => {
  let userDataDir: string;
  let repo: JsonInteractiveLessonRepository;

  beforeEach(async () => {
    userDataDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'ssampin-sessrepo-test-'),
    );
    repo = new JsonInteractiveLessonRepository(userDataDir);
  });

  afterEach(async () => {
    await fs.promises.rm(userDataDir, { recursive: true, force: true });
  });

  // ─────────────────────────────────────────────────────────────
  describe('saveSession + loadSession', () => {
    it('진행 중 세션 메타 저장/로드', async () => {
      const session = buildSession({ id: asSessionId('sess-1') });
      await repo.saveSession(session);

      const loaded = await repo.loadSession(asSessionId('sess-1'));
      expect(loaded).toEqual(session);
    });

    it('없는 세션 ID는 null', async () => {
      const r = await repo.loadSession(asSessionId('sess-missing'));
      expect(r).toBeNull();
    });

    it('hot path: 같은 세션을 100회 saveSession 해도 안전 (atomic write)', async () => {
      const session = buildSession({ id: asSessionId('sess-1') });
      for (let i = 0; i < 100; i++) {
        await repo.saveSession({ ...session, currentSlideIndex: i });
      }
      const loaded = await repo.loadSession(asSessionId('sess-1'));
      expect(loaded?.currentSlideIndex).toBe(99);

      // tmp 파일이 잔류해 있지 않음
      const dir = path.join(userDataDir, 'data', 'lessonSessions');
      const entries = await fs.promises.readdir(dir);
      expect(entries.some((e) => e.endsWith('.tmp'))).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('saveSnapshot + loadSnapshot', () => {
    it('스냅샷 저장 시 메타 + 스냅샷 두 파일 모두 갱신', async () => {
      const session = buildSession({
        id: asSessionId('sess-1'),
        status: 'archived',
        archivedAt: 5000,
        anonymized: true,
      });
      const snapshot = buildSnapshot(session);
      await repo.saveSnapshot(snapshot);

      // 메타 + 스냅샷 두 파일 존재
      const dir = path.join(userDataDir, 'data', 'lessonSessions');
      const entries = await fs.promises.readdir(dir);
      expect(entries.some((e) => e === 'sess-1.session.json')).toBe(true);
      expect(entries.some((e) => e === 'sess-1.snapshot.json')).toBe(true);

      // loadSession은 archived session 반환
      const loadedSession = await repo.loadSession(asSessionId('sess-1'));
      expect(loadedSession?.status).toBe('archived');

      // loadSnapshot은 전체 스냅샷 반환
      const loadedSnap = await repo.loadSnapshot(asSessionId('sess-1'));
      expect(loadedSnap).toEqual(snapshot);
    });

    it('스냅샷 없는 세션은 null', async () => {
      await repo.saveSession(buildSession({ id: asSessionId('sess-1') }));
      const r = await repo.loadSnapshot(asSessionId('sess-1'));
      expect(r).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('listByLessonId', () => {
    it('같은 lessonId의 세션만 반환', async () => {
      await repo.saveSession(
        buildSession({ id: asSessionId('s-A'), lessonId: asLessonId('lesson-1') }),
      );
      await repo.saveSession(
        buildSession({ id: asSessionId('s-B'), lessonId: asLessonId('lesson-2') }),
      );
      await repo.saveSession(
        buildSession({ id: asSessionId('s-C'), lessonId: asLessonId('lesson-1') }),
      );

      const list = await repo.listByLessonId(asLessonId('lesson-1'));
      expect(list).toHaveLength(2);
      expect(list.map((s) => s.id).sort()).toEqual(['s-A', 's-C']);
    });

    it('빈 디렉토리는 빈 배열', async () => {
      const r = await repo.listByLessonId(asLessonId('lesson-1'));
      expect(r).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('delete', () => {
    it('메타 + 스냅샷 둘 다 삭제', async () => {
      const session = buildSession({ id: asSessionId('sess-1') });
      await repo.saveSnapshot(buildSnapshot(session));
      await repo.delete(asSessionId('sess-1'));

      expect(await repo.loadSession(asSessionId('sess-1'))).toBeNull();
      expect(await repo.loadSnapshot(asSessionId('sess-1'))).toBeNull();
    });

    it('존재하지 않는 세션 delete는 throw 안 함 (멱등)', async () => {
      await expect(repo.delete(asSessionId('sess-nope'))).resolves.toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('listExpired (PIPA 180일 sweep)', () => {
    it('archivedAt < beforeMs인 세션만 반환', async () => {
      await repo.saveSession(
        buildSession({
          id: asSessionId('s-old'),
          status: 'archived',
          archivedAt: 1000,
        }),
      );
      await repo.saveSession(
        buildSession({
          id: asSessionId('s-recent'),
          status: 'archived',
          archivedAt: 5000,
        }),
      );
      await repo.saveSession(
        buildSession({ id: asSessionId('s-active'), status: 'active' }),
      );

      const expired = await repo.listExpired(3000);
      expect([...expired].sort()).toEqual(['s-old']);
    });

    it('archivedAt이 null인 세션(active/lobby)은 절대 만료 대상 아님', async () => {
      await repo.saveSession(buildSession({ id: asSessionId('s-1'), status: 'lobby' }));
      const expired = await repo.listExpired(Number.MAX_SAFE_INTEGER);
      expect(expired).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('findActiveByShortCode', () => {
    it('진행 중 세션 중 코드 일치하는 것 반환', async () => {
      await repo.saveSession(
        buildSession({
          id: asSessionId('s-1'),
          status: 'lobby',
          shortCode: asShortCode('ACDEFG'),
        }),
      );
      await repo.saveSession(
        buildSession({
          id: asSessionId('s-2'),
          status: 'active',
          shortCode: asShortCode('GHJKLM'),
        }),
      );

      const r = await repo.findActiveByShortCode('GHJKLM');
      expect(r?.id).toBe('s-2');
    });

    it('archived 세션은 코드 매칭 대상에서 제외', async () => {
      await repo.saveSession(
        buildSession({
          id: asSessionId('s-archived'),
          status: 'archived',
          archivedAt: 1000,
          shortCode: asShortCode('ACDEFG'),
        }),
      );

      const r = await repo.findActiveByShortCode('ACDEFG');
      expect(r).toBeNull();
    });

    it('일치 없으면 null', async () => {
      const r = await repo.findActiveByShortCode('GHJKLM');
      expect(r).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('path safety', () => {
    it('sessionId에 ".." 포함 시 reject', async () => {
      await expect(
        repo.saveSession(buildSession({ id: asSessionId('..') })),
      ).rejects.toThrow(/Invalid sessionId/);
    });

    it('sessionId에 슬래시 포함 시 reject', async () => {
      await expect(
        repo.saveSession(buildSession({ id: asSessionId('a/b') })),
      ).rejects.toThrow(/Invalid sessionId/);
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('손상 복구', () => {
    it('손상된 JSON 메타 파일은 null로 fallback (앱 크래시 X)', async () => {
      const dir = path.join(userDataDir, 'data', 'lessonSessions');
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(
        path.join(dir, 'corrupt.session.json'),
        'not valid json{',
        'utf8',
      );

      const r = await repo.loadSession(asSessionId('corrupt'));
      expect(r).toBeNull();
    });

    it('손상 파일이 listByLessonId 결과에서 자동 제외', async () => {
      const dir = path.join(userDataDir, 'data', 'lessonSessions');
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(
        path.join(dir, 'corrupt.session.json'),
        'invalid',
        'utf8',
      );
      await repo.saveSession(buildSession({ id: asSessionId('s-1') }));

      const list = await repo.listByLessonId(asLessonId('lesson-1'));
      expect(list).toHaveLength(1);
      expect(list[0]!.id).toBe('s-1');
    });
  });
});
