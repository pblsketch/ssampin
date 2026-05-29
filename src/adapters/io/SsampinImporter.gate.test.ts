import { describe, it, expect, vi } from 'vitest';
import { gateImport, type StudentImportPayload } from './ssampinImportGate';
import type { IPinGate, PinSession } from '@domain/ports/IPinGate';
import { PiiAccessDenied } from '@domain/ports/IPinGate';
import { PIN_CAPABILITIES } from '@domain/valueObjects/PinCapability';

/**
 * SsampinImporter.gate.test — Decision 6 + Critic Tension 3.1 + R7
 *
 * Acceptance:
 * - 'locked import strips PII fields and notifies user'
 * - 'unlocked + ImportStudentPii capability preserves PII'
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

describe('ssampin import gate (P8)', () => {
  const piiPayloads: readonly StudentImportPayload[] = [
    { id: 's1', name: 'A', gender: 'M', academicLevel: 'A' },
    { id: 's2', name: 'B', gender: 'F' },
    { id: 's3', name: 'C', academicLevel: 'D' },
    { id: 's4', name: 'D' }, // PII 없음
  ];

  it('locked: strips PII fields and emits notice (Tension 3.1)', () => {
    const gate = makeGate(null);
    const result = gateImport(piiPayloads, gate);

    expect(result.piiAllowed).toBe(false);
    expect(result.strippedCount).toBe(3); // s1, s2, s3
    expect(result.notice).toContain('민감 정보 항목');
    expect(result.notice).toContain('잠금 상태에서 제외');

    for (const p of result.accepted) {
      // 런타임: strip 후 gender/academicLevel 미존재
      expect(p.gender).toBeUndefined();
      expect(p.academicLevel).toBeUndefined();
    }
  });

  it('unlocked + ImportStudentPii: preserves PII fields, no notice', () => {
    const session: PinSession = {
      capabilities: PIN_CAPABILITIES,
      expiresAt: Date.now() + 60_000,
    };
    const gate = makeGate(session);
    const result = gateImport(piiPayloads, gate);

    expect(result.piiAllowed).toBe(true);
    expect(result.strippedCount).toBe(0);
    expect(result.notice).toBeNull();
    expect(result.accepted[0]?.gender).toBe('M');
    expect(result.accepted[2]?.academicLevel).toBe('D');
  });

  it('partial session WITHOUT ImportStudentPii: still strips', () => {
    const session: PinSession = {
      capabilities: ['ViewStudentPii', 'EditStudentPii'],
      expiresAt: Date.now() + 60_000,
    };
    const gate = makeGate(session);
    const result = gateImport(piiPayloads, gate);
    expect(result.piiAllowed).toBe(false);
    expect(result.strippedCount).toBe(3);
  });

  it('payloads without any PII: no notice even when locked (noop)', () => {
    const gate = makeGate(null);
    const result = gateImport(
      [
        { id: 's1', name: 'a' },
        { id: 's2', name: 'b' },
      ],
      gate,
    );
    expect(result.strippedCount).toBe(0);
    expect(result.notice).toBeNull();
  });

  it('expired session strips (same as no-session)', () => {
    const expired: PinSession = {
      capabilities: PIN_CAPABILITIES,
      expiresAt: Date.now() - 1,
    };
    const gate = makeGate(expired);
    const result = gateImport(piiPayloads, gate);
    expect(result.piiAllowed).toBe(false);
    expect(result.strippedCount).toBeGreaterThan(0);
  });
});
