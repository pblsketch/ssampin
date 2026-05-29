import { describe, it, expect, vi } from 'vitest';
import { RequirePiiCapability } from './RequirePiiCapability';
import type { IPinGate, PinSession } from '@domain/ports/IPinGate';
import { PiiAccessDenied } from '@domain/ports/IPinGate';
import type { IAuditLogger, PiiAccessEvent } from '@domain/ports/IAuditLogger';
import type { PinCapability } from '@domain/valueObjects/PinCapability';
import { PIN_CAPABILITIES } from '@domain/valueObjects/PinCapability';

/**
 * RequirePiiCapability test
 *
 * Acceptance: 'throws PiiAccessDenied without unlock'
 */

function makeAuditSpy(): { logger: IAuditLogger; events: PiiAccessEvent[] } {
  const events: PiiAccessEvent[] = [];
  const logger: IAuditLogger = {
    logPiiAccess: (e) => {
      events.push(e);
    },
  };
  return { logger, events };
}

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

describe('RequirePiiCapability', () => {
  it('throws PiiAccessDenied without unlock (no session) AND logs access_denied sticky event', async () => {
    const gate = makeGate(null);
    const { logger, events } = makeAuditSpy();
    const require = new RequirePiiCapability(gate, logger);

    await expect(require.execute('ViewStudentPii')).rejects.toBeInstanceOf(PiiAccessDenied);
    expect(events).toHaveLength(1);
    expect(events[0]?.action).toBe('access_denied');
    expect(events[0]?.capability).toBe('ViewStudentPii');
    expect(events[0]?.meta?.reason).toBe('no-session');
  });

  it('throws PiiAccessDenied when session is expired', async () => {
    const expiredSession: PinSession = {
      capabilities: PIN_CAPABILITIES,
      expiresAt: Date.now() - 1000,
    };
    const gate = makeGate(expiredSession);
    const { logger, events } = makeAuditSpy();
    const require = new RequirePiiCapability(gate, logger);

    await expect(require.execute('EditStudentPii')).rejects.toMatchObject({
      capability: 'EditStudentPii',
      reason: 'expired',
    });
    expect(events[0]?.action).toBe('access_denied');
    expect(events[0]?.meta?.reason).toBe('expired');
  });

  it('throws when capability not granted', async () => {
    const partialSession: PinSession = {
      capabilities: ['ViewStudentPii'] as const,
      expiresAt: Date.now() + 60_000,
    };
    const gate = makeGate(partialSession);
    const { logger, events } = makeAuditSpy();
    const require = new RequirePiiCapability(gate, logger);

    await expect(require.execute('ExportStudentPii')).rejects.toMatchObject({
      capability: 'ExportStudentPii',
      reason: 'capability-missing',
    });
    expect(events[0]?.action).toBe('access_denied');
  });

  it('returns session when capability granted; no audit event', async () => {
    const validSession: PinSession = {
      capabilities: PIN_CAPABILITIES,
      expiresAt: Date.now() + 60_000,
    };
    const gate = makeGate(validSession);
    const { logger, events } = makeAuditSpy();
    const require = new RequirePiiCapability(gate, logger);

    const ret = await require.execute('ViewStudentPii');
    expect(ret).toBe(validSession);
    expect(events).toHaveLength(0);
  });

  it('attaches studentIdHash when provided', async () => {
    const gate = makeGate(null);
    const { logger, events } = makeAuditSpy();
    const require = new RequirePiiCapability(gate, logger);
    const hash = 'a'.repeat(64);

    await expect(require.execute('ViewStudentPii' satisfies PinCapability, hash)).rejects.toBeInstanceOf(
      PiiAccessDenied,
    );
    expect(events[0]?.studentIdHash).toBe(hash);
  });
});
