/**
 * Google Tasks 동기화 충돌 기록 — 쌤핀과 구글이 서로 다르게 바뀌었을 때 남기는 기록.
 *
 * ★승자는 늘 쌤핀이다(올리기가 가져오기보다 먼저 돌아 쌤핀 변경이 구글을 덮는다).
 *   이 기록은 승자를 정하지 않는다. **덮이거나 사라진 구글 쪽 내용을 조용히 잃지 않게**
 *   남기고 알리기 위한 것이다.
 * ★기기 전용이다. `SYNC_REGISTRY` 에 등재하지 않는다(ADR-039/040/066).
 * ★구글에서 받은 자료다(ADR-136). 쌤핀 AI·AI 브릿지에 보내지 않는다.
 */

/** 충돌 종류 — 이 세 값뿐이다. */
export type TasksSyncConflictKind =
  /** 쌤핀과 구글 모두 고쳤다. 쌤핀 내용이 구글을 덮었다. */
  | 'edit-edit'
  /** 구글에서 지웠는데 쌤핀에서 고쳤다. 쌤핀 변경을 살려 구글에 다시 만들었다. */
  | 'remote-deleted'
  /** 쌤핀에서 지웠(거나 보관했)는데 구글에서 고쳤다. 구글에서도 지웠다. */
  | 'local-deleted';

/** 비교·표시에 쓰는 할 일 내용 — 동기화되는 네 칸뿐이다. */
export interface ConflictContent {
  readonly text: string;
  readonly notes?: string;
  readonly dueDate?: string; // "YYYY-MM-DD"
  readonly completed: boolean;
}

export interface TasksSyncConflict {
  readonly id: string;
  readonly kind: TasksSyncConflictKind;
  readonly todoId: string;
  /** 충돌 당시의 구글 ID(`remote-deleted` 는 지워진 옛 ID). */
  readonly googleTaskId: string;
  /** 판정한 시각(ISO 8601). */
  readonly detectedAt: string;
  /** 구글 쪽 `updated`. `remote-deleted` 에서 구글에 항목 자체가 없으면 없다. */
  readonly remoteUpdatedAt?: string;
  /** 쌤핀 쪽 내용(올라간 내용 / 지워진 내용). */
  readonly local: ConflictContent;
  /** 구글 쪽 내용. `remote-deleted` 에서 항목 자체가 없으면 없다. */
  readonly remote?: ConflictContent;
}

/** 보관하는 기록 개수(최신순). 조정 가능한 기본값이다. */
export const TASKS_SYNC_CONFLICT_LIMIT = 20;

/**
 * 구글 `updated` 가 쌤핀 `lastSyncedAt` 보다 "뒤"라고 보는 허용 오차(ms).
 *
 * `lastSyncedAt` 은 이 PC 시계, `updated` 는 구글 서버 시계다. PC 시계가 느리면 방금 올린
 * 내용도 구글이 더 뒤로 보인다. 오차 안의 차이는 같은 시각으로 본다. 조정 가능한 기본값이다.
 */
export const TASKS_SYNC_CLOCK_TOLERANCE_MS = 5 * 60 * 1000;
