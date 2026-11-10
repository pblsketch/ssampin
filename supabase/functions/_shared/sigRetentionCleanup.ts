/**
 * 서명 이미지 보관기간 만료 정리 — sig-cleanup-expired 의 본체.
 *
 * 040 은 이 일을 DB 함수가 `DELETE FROM storage.objects` 로 했다. Supabase 가 storage 표 직접 삭제를
 * 막으면서(`storage.protect_delete`) 2026-07-24 첫 만료분부터 매일 실패했고, 막히기 전이었더라도
 * 표의 행만 지울 뿐 실제 파일은 저장소에 남는 방식이었다. 그래서 Storage API(`remove`)로 지운다.
 *
 * 저장소·DB 접근은 SigRetentionCleanupStore 로 받아 테스트에서 가짜로 바꿔 끼운다.
 */
import { planSignatureImageDeletion, type SigV2SignatureEntryPointer } from './sigRetention.ts';

export const SIG_RETENTION_CLEANUP_BATCH = 50;
export const SIG_STORAGE_REMOVE_CHUNK = 100;

export interface SigRetentionCleanupStore {
  /** 마감됐고 보관기한이 지났으며 아직 이미지를 지우지 않은 세션 id */
  listDueSessionIds(nowIso: string, limit: number): Promise<string[]>;
  /** 지우기 직전 다시 확인 — 그사이 교사가 세션을 다시 열었으면 false */
  isSessionStillDue(sessionId: string, nowIso: string): Promise<boolean>;
  listImageEntries(sessionId: string): Promise<SigV2SignatureEntryPointer[]>;
  /** 실패하면 throw */
  removeObjects(keys: string[]): Promise<void>;
  clearEntryImages(entryIds: string[], deletedAtIso: string): Promise<void>;
  markSessionImagesDeleted(sessionId: string, deletedAtIso: string): Promise<void>;
}

export interface SigRetentionCleanupResult {
  readonly dueSessions: number;
  readonly completedSessions: number;
  readonly removedObjects: number;
  readonly skippedKeys: number;
  readonly failedSessions: number;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function runSigRetentionCleanup(
  store: SigRetentionCleanupStore,
  now: Date,
  onSessionError: (sessionId: string, err: unknown) => void = () => {},
): Promise<SigRetentionCleanupResult> {
  const nowIso = now.toISOString();
  const sessionIds = await store.listDueSessionIds(nowIso, SIG_RETENTION_CLEANUP_BATCH);

  let completedSessions = 0;
  let removedObjects = 0;
  let skippedKeys = 0;
  let failedSessions = 0;

  for (const sessionId of sessionIds) {
    try {
      const entries = await store.listImageEntries(sessionId);
      const plan = planSignatureImageDeletion(sessionId, entries);

      if (!(await store.isSessionStillDue(sessionId, nowIso))) continue;

      for (const keys of chunk(plan.keys, SIG_STORAGE_REMOVE_CHUNK)) {
        await store.removeObjects(keys);
      }
      if (plan.entryIds.length > 0) {
        await store.clearEntryImages(plan.entryIds, nowIso);
      }
      removedObjects += plan.keys.length;
      skippedKeys += plan.skippedKeys.length;

      // 세션 경로가 아닌 이미지가 남아 있으면 040 과 같이 세션을 완료로 표시하지 않는다.
      if (plan.skippedKeys.length === 0) {
        await store.markSessionImagesDeleted(sessionId, nowIso);
        completedSessions += 1;
      }
    } catch (err) {
      failedSessions += 1;
      onSessionError(sessionId, err);
    }
  }

  return {
    dueSessions: sessionIds.length,
    completedSessions,
    removedObjects,
    skippedKeys,
    failedSessions,
  };
}
