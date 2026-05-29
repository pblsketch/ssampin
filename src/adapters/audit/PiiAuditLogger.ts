import type { IAuditLogger, PiiAccessEvent, PiiAuditAction } from '@domain/ports/IAuditLogger';
import { isStickyEvent } from '@domain/ports/IAuditLogger';

/**
 * PiiAuditLogStorage — 백엔드 저장 추상.
 * 테스트에서는 in-memory, 프로덕션에서는 Electron 파일 writer 주입.
 */
export interface PiiAuditLogStorage {
  /** Sticky tier에 한 줄 추가. event-type-class별 maxPerType 초과 시 가장 오래된 동일 type 항목 제거. */
  appendSticky(event: PiiAccessEvent): Promise<void> | void;
  /** FIFO tier에 한 줄 추가. 누적 바이트가 maxBytes 초과 시 가장 오래된 항목부터 제거. */
  appendFifo(event: PiiAccessEvent): Promise<void> | void;
  /** Sticky tier 전체 (현재 스냅샷, 신순). */
  getSticky(): readonly PiiAccessEvent[];
  /** FIFO tier 전체 (현재 스냅샷, 신순). */
  getFifo(): readonly PiiAccessEvent[];
  /** 현재 FIFO tier가 사용 중인 바이트 추정치. */
  fifoSizeBytes(): number;
}

/** 이벤트 1건이 차지하는 바이트 추정 (JSON 직렬화 길이). */
function estimateBytes(e: PiiAccessEvent): number {
  return Buffer.byteLength(JSON.stringify(e), 'utf8') + 1; // +1 for newline
}

/**
 * InMemoryPiiAuditLogStorage — 테스트/디폴트 in-memory 백엔드.
 * 프로덕션 파일 백엔드는 P3에서 FileStudentPiiRepository와 동일 패턴으로 도입.
 */
export class InMemoryPiiAuditLogStorage implements PiiAuditLogStorage {
  private sticky: PiiAccessEvent[] = [];
  private fifo: PiiAccessEvent[] = [];
  private fifoBytes = 0;

  constructor(
    /** Sticky tier event-type-class별 최대 보존 건수. Decision 5: 1000/type. */
    private readonly maxStickyPerType = 1000,
    /** FIFO tier 누적 최대 바이트. Decision 5: 5MB. */
    private readonly maxFifoBytes = 5 * 1024 * 1024,
  ) {}

  appendSticky(event: PiiAccessEvent): void {
    this.sticky.push(event);
    // event-type별 1000건 초과 시 가장 오래된 동일 type 제거
    const sameTypeCount = this.sticky.filter((e) => e.action === event.action).length;
    if (sameTypeCount > this.maxStickyPerType) {
      // 가장 오래된 동일 type 인덱스 찾아 splice
      const idx = this.sticky.findIndex((e) => e.action === event.action);
      if (idx >= 0) this.sticky.splice(idx, 1);
    }
  }

  appendFifo(event: PiiAccessEvent): void {
    const bytes = estimateBytes(event);
    this.fifo.push(event);
    this.fifoBytes += bytes;
    // 5MB 초과 시 가장 오래된 항목부터 제거
    while (this.fifoBytes > this.maxFifoBytes && this.fifo.length > 0) {
      const evicted = this.fifo.shift();
      if (evicted) this.fifoBytes -= estimateBytes(evicted);
    }
  }

  getSticky(): readonly PiiAccessEvent[] {
    return this.sticky.slice();
  }

  getFifo(): readonly PiiAccessEvent[] {
    return this.fifo.slice();
  }

  fifoSizeBytes(): number {
    return this.fifoBytes;
  }
}

/**
 * PiiAuditLogger — IAuditLogger 어댑터 구현.
 *
 * **Sticky tier** (Decision 5):
 *   - 이벤트 `migrate`, `consent_grant`, `consent_deny`, `access_denied`
 *   - event-type-class별 1000건 무한 보존 (FIFO 미적용)
 *
 * **FIFO tier**:
 *   - 이벤트 `view`, `update`
 *   - 5MB rolling, 초과 시 가장 오래된 항목부터 evict
 *
 * 분기는 `isStickyEvent()` 도메인 헬퍼 기반.
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 5, §Hash Functions
 */
export class PiiAuditLogger implements IAuditLogger {
  constructor(private readonly storage: PiiAuditLogStorage) {}

  async logPiiAccess(event: PiiAccessEvent): Promise<void> {
    if (isStickyEvent(event.action)) {
      await Promise.resolve(this.storage.appendSticky(event));
    } else {
      await Promise.resolve(this.storage.appendFifo(event));
    }
  }

  /** 디버깅·테스트용 헬퍼: 현재 sticky/FIFO 카운트. */
  snapshot(): { sticky: readonly PiiAccessEvent[]; fifo: readonly PiiAccessEvent[]; fifoBytes: number } {
    return {
      sticky: this.storage.getSticky(),
      fifo: this.storage.getFifo(),
      fifoBytes: this.storage.fifoSizeBytes(),
    };
  }

  /** action별 카운트 (관측성 helper). */
  countByAction(): Record<PiiAuditAction, number> {
    const counts: Record<PiiAuditAction, number> = {
      view: 0,
      update: 0,
      consent_grant: 0,
      consent_deny: 0,
      migrate: 0,
      access_denied: 0,
    };
    for (const e of this.storage.getSticky()) counts[e.action]++;
    for (const e of this.storage.getFifo()) counts[e.action]++;
    return counts;
  }
}
