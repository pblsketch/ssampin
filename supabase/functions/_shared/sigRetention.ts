export const SIGV2_DEFAULT_RETENTION_DAYS = 30;
export const SIGV2_MIN_RETENTION_DAYS = 1;
export const SIGV2_MAX_RETENTION_DAYS = 365;

export type SigV2SessionStatus = 'draft' | 'active' | 'closed';

export interface SigV2SignatureEntryPointer {
  readonly id: string;
  readonly signature_object_key: string | null;
}

export interface SigV2ImageDeletionPlan {
  readonly keys: string[];
  readonly entryIds: string[];
  readonly skippedKeys: string[];
}

export function normalizeRetentionDays(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return SIGV2_DEFAULT_RETENTION_DAYS;
  }
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (
    typeof numeric !== 'number' ||
    !Number.isInteger(numeric) ||
    numeric < SIGV2_MIN_RETENTION_DAYS ||
    numeric > SIGV2_MAX_RETENTION_DAYS
  ) {
    return null;
  }
  return numeric;
}

export function canDeleteSignatureImages(status: SigV2SessionStatus): boolean {
  return status === 'closed';
}

export function buildCloseMetadata(now: Date, retentionDays: number) {
  return {
    status: 'closed' as const,
    closed_at: now.toISOString(),
    signature_retention_days: retentionDays,
    signature_cleanup_after: new Date(
      now.getTime() + retentionDays * 24 * 60 * 60 * 1000,
    ).toISOString(),
  };
}

export function isSessionSignatureObjectKey(sessionId: string, key: string): boolean {
  return key.startsWith(`${sessionId}/`) && key.endsWith('.png') && !key.includes('..');
}

export function planSignatureImageDeletion(
  sessionId: string,
  entries: readonly SigV2SignatureEntryPointer[],
): SigV2ImageDeletionPlan {
  const keys: string[] = [];
  const entryIds: string[] = [];
  const skippedKeys: string[] = [];

  for (const entry of entries) {
    const key = entry.signature_object_key;
    if (!key) continue;
    if (!isSessionSignatureObjectKey(sessionId, key)) {
      skippedKeys.push(key);
      continue;
    }
    keys.push(key);
    entryIds.push(entry.id);
  }

  return { keys, entryIds, skippedKeys };
}
