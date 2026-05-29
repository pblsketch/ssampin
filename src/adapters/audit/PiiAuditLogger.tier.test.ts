import { describe, it, expect } from 'vitest';
import { PiiAuditLogger, InMemoryPiiAuditLogStorage } from './PiiAuditLogger';
import type { PiiAccessEvent, PiiAuditAction } from '@domain/ports/IAuditLogger';

/**
 * PiiAuditLogger 2-tier 보존 정책 테스트
 *
 * Acceptance:
 * - 'sticky events never evicted, FIFO evicts at 5MB' (Critic C#2)
 * - 'keeps sticky events past FIFO eviction threshold'
 * - 'evicts oldest FIFO event at 5MB boundary'
 */

function makeEvent(action: PiiAuditAction, idx: number, padding = ''): PiiAccessEvent {
  return {
    action,
    studentIdHash: idx.toString(16).padStart(8, '0'),
    capability: action === 'view' || action === 'update' ? 'ViewStudentPii' : 'system',
    timestamp: 1_700_000_000_000 + idx,
    meta: padding ? { padding } : undefined,
  };
}

describe('PiiAuditLogger tiering', () => {
  it('routes view/update to FIFO tier, sticky-class events to sticky tier', async () => {
    const storage = new InMemoryPiiAuditLogStorage();
    const logger = new PiiAuditLogger(storage);

    await logger.logPiiAccess(makeEvent('view', 1));
    await logger.logPiiAccess(makeEvent('update', 2));
    await logger.logPiiAccess(makeEvent('consent_grant', 3));
    await logger.logPiiAccess(makeEvent('migrate', 4));
    await logger.logPiiAccess(makeEvent('access_denied', 5));
    await logger.logPiiAccess(makeEvent('consent_deny', 6));

    const snap = logger.snapshot();
    expect(snap.fifo).toHaveLength(2);
    expect(snap.sticky).toHaveLength(4);
    const stickyActions = snap.sticky.map((e) => e.action).sort();
    expect(stickyActions).toEqual(['access_denied', 'consent_deny', 'consent_grant', 'migrate']);
  });

  it('keeps sticky events past FIFO eviction threshold (Critic C#2)', async () => {
    // 작은 FIFO bound (1KB)로 압축해 빠르게 evict 트리거
    const storage = new InMemoryPiiAuditLogStorage(1000, 1024);
    const logger = new PiiAuditLogger(storage);

    // 1개의 영구 sticky 이벤트
    await logger.logPiiAccess(makeEvent('consent_grant', 0));

    // 다수의 view/update로 FIFO 채워서 evict 트리거 (각 event ~150 bytes)
    for (let i = 1; i <= 50; i++) {
      await logger.logPiiAccess(makeEvent('view', i, 'x'.repeat(50)));
    }

    const snap = logger.snapshot();
    // Sticky는 여전히 1건 보존
    expect(snap.sticky).toHaveLength(1);
    expect(snap.sticky[0]?.action).toBe('consent_grant');
    // FIFO는 1KB 미만으로 줄어들었음
    expect(snap.fifoBytes).toBeLessThanOrEqual(1024);
    expect(snap.fifo.length).toBeLessThan(50);
  });

  it('evicts oldest FIFO event when crossing 5MB boundary', async () => {
    const storage = new InMemoryPiiAuditLogStorage(1000, 5 * 1024 * 1024);
    const logger = new PiiAuditLogger(storage);

    // 큰 padding으로 빠르게 5MB 채우기 (각 ~1KB × 6000개 ≈ 6MB)
    const padding = 'x'.repeat(900);
    for (let i = 0; i < 6000; i++) {
      await logger.logPiiAccess(makeEvent('view', i, padding));
    }

    const snap = logger.snapshot();
    expect(snap.fifoBytes).toBeLessThanOrEqual(5 * 1024 * 1024);
    // 가장 오래된 이벤트(i=0)는 evict 되었어야 함
    expect(snap.fifo[0]?.studentIdHash).not.toBe('00000000');
  });

  it('sticky events bound at maxStickyPerType per event-type-class', async () => {
    // event-type별 3건 한도로 테스트
    const storage = new InMemoryPiiAuditLogStorage(3, 5 * 1024 * 1024);
    const logger = new PiiAuditLogger(storage);

    for (let i = 0; i < 5; i++) {
      await logger.logPiiAccess(makeEvent('access_denied', i));
    }
    // 다른 type는 영향 없음을 확인
    await logger.logPiiAccess(makeEvent('migrate', 100));

    const snap = logger.snapshot();
    const deniedEvents = snap.sticky.filter((e) => e.action === 'access_denied');
    expect(deniedEvents).toHaveLength(3);
    // 가장 오래된 (i=0, 1) 항목은 evict
    const remainingIdx = deniedEvents.map((e) => parseInt(e.studentIdHash, 16));
    expect(remainingIdx.sort((a, b) => a - b)).toEqual([2, 3, 4]);
    // migrate는 1건 보존
    expect(snap.sticky.filter((e) => e.action === 'migrate')).toHaveLength(1);
  });

  it('countByAction returns combined counts across both tiers', async () => {
    const storage = new InMemoryPiiAuditLogStorage();
    const logger = new PiiAuditLogger(storage);

    await logger.logPiiAccess(makeEvent('view', 1));
    await logger.logPiiAccess(makeEvent('view', 2));
    await logger.logPiiAccess(makeEvent('consent_grant', 3));

    const counts = logger.countByAction();
    expect(counts.view).toBe(2);
    expect(counts.consent_grant).toBe(1);
    expect(counts.update).toBe(0);
  });
});
