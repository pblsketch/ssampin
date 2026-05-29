import { describe, it, expect } from 'vitest';
import { migrateStudentPiiV1 } from './migrateStudentPiiV1';
import type { Student } from '@domain/entities/Student';
import type { IStudentPiiRepository } from '@domain/repositories/IStudentPiiRepository';
import type { StudentPiiOverlay } from '@domain/entities/StudentPiiOverlay';
import type { IAuditLogger, PiiAccessEvent } from '@domain/ports/IAuditLogger';

/**
 * migrateStudentPiiV1 crash-safety test
 *
 * Acceptance: 'kill between write and rename leaves no corrupt state on next boot'
 *
 * 비즈니스 레이어 atomic 보장: `IStudentPiiRepository.saveAll` 부분 실패 시
 * 다음 boot에서 idempotent 재시도로 깨끗하게 복구. 실제 fs-level atomic은
 * `AtomicJsonFileStore.crash.test.ts`에서 검증.
 */

function makeStudent(id: string): Student {
  return { id, name: `s-${id}` };
}

class InMemoryRepo implements IStudentPiiRepository {
  private map = new Map<string, StudentPiiOverlay>();
  /** saveAll 직전에 호출되는 훅. throw 시 crash 시뮬레이션. */
  saveAllHook: (() => void) | null = null;
  saveAllCalls = 0;

  async getAll(): Promise<readonly StudentPiiOverlay[]> {
    return Array.from(this.map.values());
  }
  async get(studentId: string): Promise<StudentPiiOverlay | null> {
    return this.map.get(studentId) ?? null;
  }
  async save(overlay: StudentPiiOverlay): Promise<void> {
    this.map.set(overlay.studentId, overlay);
  }
  async delete(studentId: string): Promise<void> {
    this.map.delete(studentId);
  }
  async saveAll(overlays: readonly StudentPiiOverlay[]): Promise<void> {
    this.saveAllCalls++;
    if (this.saveAllHook) this.saveAllHook();
    // hook이 throw 안 했으면 정상 적용 (atomic semantics)
    const next = new Map<string, StudentPiiOverlay>();
    for (const o of overlays) next.set(o.studentId, o);
    this.map = next;
  }
  async dispose(): Promise<void> {
    this.map.clear();
  }
  snapshot(): readonly StudentPiiOverlay[] {
    return Array.from(this.map.values());
  }
}

function makeAuditSpy(): { logger: IAuditLogger; events: PiiAccessEvent[] } {
  const events: PiiAccessEvent[] = [];
  return {
    logger: {
      logPiiAccess: (e) => {
        events.push(e);
      },
    },
    events,
  };
}

describe('migrateStudentPiiV1 crash safety', () => {
  it('first boot creates empty overlay for each student (migrated outcome)', async () => {
    const repo = new InMemoryRepo();
    const { logger, events } = makeAuditSpy();
    const students = [makeStudent('a'), makeStudent('b'), makeStudent('c')];

    const result = await migrateStudentPiiV1(students, repo, logger);

    expect(result.outcome).toBe('migrated');
    expect(result.createdCount).toBe(3);
    expect(repo.snapshot()).toHaveLength(3);
    expect(events.filter((e) => e.action === 'migrate')).toHaveLength(1);
  });

  it('second boot with same students is no-op (idempotent)', async () => {
    const repo = new InMemoryRepo();
    const { logger } = makeAuditSpy();
    const students = [makeStudent('a'), makeStudent('b')];

    await migrateStudentPiiV1(students, repo, logger);
    const r2 = await migrateStudentPiiV1(students, repo, logger);

    expect(r2.outcome).toBe('noop');
    expect(r2.createdCount).toBe(0);
    expect(repo.snapshot()).toHaveLength(2);
  });

  it('kill between write and rename leaves no corrupt state on next boot', async () => {
    const repo = new InMemoryRepo();
    const { logger, events } = makeAuditSpy();
    const students = [makeStudent('a'), makeStudent('b')];

    // 1차 시도: saveAll에서 crash 발생
    repo.saveAllHook = () => {
      throw new Error('simulated kill -9 between write and rename');
    };
    const r1 = await migrateStudentPiiV1(students, repo, logger);

    expect(r1.outcome).toBe('corrupted');
    expect(r1.error).toContain('simulated kill');
    expect(repo.snapshot()).toHaveLength(0); // 부분 기록 없음 (atomic 보장)
    expect(events.filter((e) => e.action === 'migrate')).toHaveLength(0); // 실패 시 audit X

    // 2차 시도: hook 제거 후 재실행 → 정상 마이그레이션
    repo.saveAllHook = null;
    const r2 = await migrateStudentPiiV1(students, repo, logger);

    expect(r2.outcome).toBe('migrated');
    expect(r2.createdCount).toBe(2);
    expect(repo.snapshot()).toHaveLength(2);
    expect(events.filter((e) => e.action === 'migrate')).toHaveLength(1);
  });

  it('existing overlays preserved when new students added (partial migration)', async () => {
    const repo = new InMemoryRepo();
    const { logger } = makeAuditSpy();

    // 사전 데이터: 학생 a는 이미 입력된 PII 보유
    await repo.save({ studentId: 'a', gender: 'M', academicLevel: 'B' });

    const students = [makeStudent('a'), makeStudent('b')];
    const result = await migrateStudentPiiV1(students, repo, logger);

    expect(result.outcome).toBe('migrated');
    expect(result.createdCount).toBe(1); // b만 신규
    const aOverlay = await repo.get('a');
    expect(aOverlay?.gender).toBe('M');
    expect(aOverlay?.academicLevel).toBe('B');
  });

  it('read failure surfaces as corrupted outcome', async () => {
    class BrokenReadRepo extends InMemoryRepo {
      override async getAll(): Promise<readonly StudentPiiOverlay[]> {
        throw new Error('disk read error');
      }
    }
    const repo = new BrokenReadRepo();
    const { logger } = makeAuditSpy();
    const students = [makeStudent('a')];

    const result = await migrateStudentPiiV1(students, repo, logger);
    expect(result.outcome).toBe('corrupted');
    expect(result.error).toContain('disk read error');
  });

  it('zero students still triggers idempotent noop', async () => {
    const repo = new InMemoryRepo();
    const { logger } = makeAuditSpy();
    const result = await migrateStudentPiiV1([], repo, logger);
    expect(result.outcome).toBe('noop');
    expect(result.createdCount).toBe(0);
  });
});
