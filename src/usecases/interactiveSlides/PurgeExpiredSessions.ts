/**
 * PurgeExpiredSessions — 보존 기간 만료 세션 sweep (Plan §11.1, Design §4 U10).
 *
 * 기본 보존: 180일. 매일 0시 cron으로 호출 (어댑터 측 setInterval).
 */

import type { ISessionRepository } from '@domain/ports/ISessionRepository';
import type { SessionId } from '@domain/valueObjects/InteractiveSlidesIds';

export const DEFAULT_RETENTION_DAYS = 180;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface PurgeExpiredSessionsDeps {
  readonly sessionRepo: ISessionRepository;
  readonly clock: () => number;
}

export interface PurgeExpiredSessionsInput {
  /** 기본 180일 (PIPA 정책). 단축 시뮬레이션용으로 override 가능 */
  readonly retentionDays?: number;
}

export interface PurgeExpiredSessionsResult {
  readonly purged: readonly SessionId[];
  readonly cutoffMs: number;
}

export async function PurgeExpiredSessions(
  deps: PurgeExpiredSessionsDeps,
  input: PurgeExpiredSessionsInput = {},
): Promise<PurgeExpiredSessionsResult> {
  const days = input.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const cutoffMs = deps.clock() - days * MS_PER_DAY;
  const ids = await deps.sessionRepo.listExpired(cutoffMs);
  for (const id of ids) {
    await deps.sessionRepo.delete(id);
  }
  return { purged: ids, cutoffMs };
}
