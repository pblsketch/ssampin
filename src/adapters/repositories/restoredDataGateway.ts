/**
 * restoredDataGateway — 시작 스냅샷으로 되돌린 자료의 기록(ADR-148)을 화면 쪽에서 읽고 표시한다.
 *
 * 기록은 데스크톱 메인 프로세스의 `backups/restore-log` 에 있다(`electron/dataRestoreLog.ts`).
 * 브라우저 모드·모바일·옛 preload 에는 창구가 없다 — 그때는 "기록 없음"이다(되돌리는 일 자체가 없다).
 *
 *  - 동기화: 아직 클라우드와 맞춰지지 않은 기록을 유스케이스에 주입한다(`getRestoredDataHolds`).
 *    ★읽기가 실패하면 예외를 그대로 던진다 — 빈 목록으로 삼키면 되돌린 옛 내용이 클라우드를 덮을 수 있다.
 *  - 알림: 아직 알리지 않은 기록을 메인 창이 한 번 알리고 표시한다(`useRestoredDataNotice`).
 */
import type { RestoredDataRecord } from '@domain/rules/restoredDataNotice';
import type { RestoredDataHold } from '@usecases/sync/restoredDataHold';

function api() {
  if (typeof window === 'undefined') return undefined;
  return window.electronAPI;
}

function toRecord(value: unknown): RestoredDataRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  const { id, file, snapshotModifiedAt, notified, syncResolved } = v;
  if (
    typeof id !== 'string' ||
    typeof file !== 'string' ||
    typeof snapshotModifiedAt !== 'string' ||
    typeof notified !== 'boolean' ||
    typeof syncResolved !== 'boolean'
  ) {
    return null;
  }
  return { id, file, snapshotModifiedAt, notified, syncResolved };
}

/** 복원 기록 전체. 창구가 없으면 빈 목록. 읽기 실패는 예외. */
export async function listRestoredData(): Promise<RestoredDataRecord[]> {
  const getList = api()?.getRestoredDataFiles;
  if (!getList) return [];
  const raw = await getList();
  return raw.map(toRecord).filter((r): r is RestoredDataRecord => r !== null);
}

/** 복원 기록을 읽지 못해 동기화를 멈출 때 사이드바에 보이는 문구(메인 프로세스 문구와 같다). */
export const RESTORED_DATA_UNAVAILABLE_MESSAGE =
  '자료 복원 기록을 읽지 못해 클라우드 자료를 덮지 않도록 이번 동기화를 멈췄어요. 다음 동기화나 쌤핀을 다시 켤 때 기록을 다시 만들어 이어서 동기화해요.';

/**
 * 동기화 유스케이스에 주입하는 훅 — 아직 클라우드와 맞춰지지 않은 복원 자료.
 * ★기록을 읽지 못하면(깨짐·잠김·IPC 실패) 예외를 던진다 → 이번 동기화가 받기·올리기 모두 멈춘다.
 */
export async function getRestoredDataHolds(): Promise<RestoredDataHold[]> {
  let records: RestoredDataRecord[];
  try {
    records = await listRestoredData();
  } catch (err) {
    console.warn('[restoredData] 복원 기록을 읽지 못함 — 동기화를 멈춘다:', err);
    throw new Error(RESTORED_DATA_UNAVAILABLE_MESSAGE, { cause: err });
  }
  const holds = new Map<string, RestoredDataHold>();
  for (const record of records) {
    if (record.syncResolved) continue;
    holds.set(record.file, { key: record.file, restoredStateAt: record.snapshotModifiedAt });
  }
  return [...holds.values()];
}

/** 클라우드와 맞춰진 복원 자료를 표시한다. 실패해도 동기화 결과는 그대로다(다음 동기화가 다시 맞춘다). */
export async function markRestoredDataSyncResolved(
  files: readonly string[],
  reason?: 'year-transition',
): Promise<void> {
  if (files.length === 0) return;
  try {
    await api()?.markRestoredDataSyncResolved?.(files, reason);
  } catch (err) {
    console.warn('[restoredData] 동기화 정리 표시 실패:', err);
  }
}

/** 알린 복원 기록을 표시한다. */
export async function markRestoredDataNotified(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await api()?.markRestoredDataNotified?.(ids);
}

/**
 * 알릴 복원이 있고 메인 창이 보일 때 부른다(메인 프로세스가 창이 보이는지 판정한다 — `show: false` 로 만든
 * 창은 숨어 있어도 `document.visibilityState` 가 'visible' 로 나와 화면 쪽에서는 알 수 없다).
 * 등록한 뒤 메인 프로세스에 준비됐다고 알린다. 해제 함수를 돌려준다.
 */
export function onDataRestored(callback: () => void): () => void {
  const electronApi = api();
  const off = electronApi?.onDataRestored?.(callback) ?? (() => undefined);
  void electronApi?.readyForRestoredDataNotice?.().catch(() => undefined);
  return off;
}
