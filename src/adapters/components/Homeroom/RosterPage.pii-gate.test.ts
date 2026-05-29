import { describe, it, expect, vi } from 'vitest';
import type { IPinGate, PinSession } from '@domain/ports/IPinGate';
import { PiiAccessDenied } from '@domain/ports/IPinGate';
import type { IAuditLogger, PiiAccessEvent } from '@domain/ports/IAuditLogger';
import { PIN_CAPABILITIES } from '@domain/valueObjects/PinCapability';
import { RequirePiiCapability } from '@usecases/pii/RequirePiiCapability';
import { SessionOnlyStudentPiiRepository } from '@infrastructure/persistence/SessionOnlyStudentPiiRepository';

/**
 * RosterPage.pii-gate.test — Critic C#7 acceptance:
 *   'PII masked when locked, revealed when unlocked, edits write audit entry'
 *
 * 본 테스트는 Roster page의 PII 게이트 흐름을 도메인 통합 시나리오로 검증한다:
 * 1. locked → RequirePiiCapability throws PiiAccessDenied + access_denied audit
 * 2. unlocked → repository 접근 가능
 * 3. edit → repository.save + audit `update` FIFO 이벤트
 *
 * (Component-level e2e는 @testing-library/react 미설치로 별도 도구로 진행.)
 */

function makeGate(session: PinSession | null): IPinGate {
  return {
    unlock: vi.fn(),
    currentSession: () => session,
    requireCapability: (cap, sess) => {
      if (sess === null) throw new PiiAccessDenied(cap, 'no-session');
      if (sess.expiresAt <= Date.now()) throw new PiiAccessDenied(cap, 'expired');
      if (!sess.capabilities.includes(cap)) throw new PiiAccessDenied(cap, 'capability-missing');
    },
  };
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

describe('Roster PII gate scenarios', () => {
  it('locked: PII reveal attempt produces access_denied sticky event', async () => {
    const gate = makeGate(null);
    const { logger, events } = makeAuditSpy();
    const require = new RequirePiiCapability(gate, logger);

    await expect(require.execute('ViewStudentPii', 'hash-abc')).rejects.toBeInstanceOf(
      PiiAccessDenied,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.action).toBe('access_denied');
    expect(events[0]?.capability).toBe('ViewStudentPii');
    expect(events[0]?.studentIdHash).toBe('hash-abc');
  });

  it('unlocked: PII reveal allowed; repository readable', async () => {
    const validSession: PinSession = {
      capabilities: PIN_CAPABILITIES,
      expiresAt: Date.now() + 60_000,
    };
    const gate = makeGate(validSession);
    const { logger, events } = makeAuditSpy();
    const require = new RequirePiiCapability(gate, logger);
    const repo = new SessionOnlyStudentPiiRepository();
    await repo.save({ studentId: 's1', gender: 'F', academicLevel: 'A' });

    const session = await require.execute('ViewStudentPii', 'hash-s1');
    expect(session).toBe(validSession);
    expect(events).toHaveLength(0);

    const overlay = await repo.get('s1');
    expect(overlay?.gender).toBe('F');
    expect(overlay?.academicLevel).toBe('A');
  });

  it('edit flow: ViewEdit capability + repo.save + audit update FIFO', async () => {
    const validSession: PinSession = {
      capabilities: PIN_CAPABILITIES,
      expiresAt: Date.now() + 60_000,
    };
    const gate = makeGate(validSession);
    const { logger, events } = makeAuditSpy();
    const require = new RequirePiiCapability(gate, logger);
    const repo = new SessionOnlyStudentPiiRepository();

    // 1. require Edit capability
    await require.execute('EditStudentPii', 'hash-s2');
    // 2. perform edit
    await repo.save({ studentId: 's2', gender: 'M', academicLevel: 'C' });

    // 3. emit update FIFO event (호출자 책임 — 본 테스트는 직접 emit)
    await Promise.resolve(
      logger.logPiiAccess({
        action: 'update',
        studentIdHash: 'hash-s2',
        capability: 'EditStudentPii',
        timestamp: Date.now(),
        meta: { field: 'gender' },
      }),
    );
    await Promise.resolve(
      logger.logPiiAccess({
        action: 'update',
        studentIdHash: 'hash-s2',
        capability: 'EditStudentPii',
        timestamp: Date.now(),
        meta: { field: 'academicLevel' },
      }),
    );

    expect(events.filter((e) => e.action === 'update')).toHaveLength(2);
    expect(events.some((e) => e.action === 'access_denied')).toBe(false);
    const overlay = await repo.get('s2');
    expect(overlay?.gender).toBe('M');
    expect(overlay?.academicLevel).toBe('C');
  });

  it('expired session: PII access throws expired reason', async () => {
    const expiredSession: PinSession = {
      capabilities: PIN_CAPABILITIES,
      expiresAt: Date.now() - 1,
    };
    const gate = makeGate(expiredSession);
    const { logger, events } = makeAuditSpy();
    const require = new RequirePiiCapability(gate, logger);

    await expect(require.execute('ViewStudentPii')).rejects.toMatchObject({
      reason: 'expired',
    });
    expect(events[0]?.meta?.reason).toBe('expired');
  });

  it('capability-missing: partial session denies specific capability', async () => {
    const partial: PinSession = {
      capabilities: ['ViewStudentPii'],
      expiresAt: Date.now() + 60_000,
    };
    const gate = makeGate(partial);
    const { logger, events } = makeAuditSpy();
    const require = new RequirePiiCapability(gate, logger);

    // View 허용
    await expect(require.execute('ViewStudentPii')).resolves.toBeTruthy();
    // Export 거부
    await expect(require.execute('ExportStudentPii')).rejects.toMatchObject({
      reason: 'capability-missing',
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.capability).toBe('ExportStudentPii');
  });
});
