/**
 * 파일별 쓰기 직렬화 락 — "읽기→변형→통째 쓰기" 임계구역을 파일 단위로 순서대로 세운다.
 *
 * 모든 도메인 저장이 파일 전체를 읽어 일부를 바꾸고 전체를 다시 쓰는 구조라, 두 흐름이
 * 겹치면 나중 쓰기가 먼저 쓰기를 삼킨다(2026-07 codex QA — 동기화 병합 쓰기 vs 사용자
 * 저장 경합 실증). 같은 파일은 직렬, 다른 파일은 병렬로 돈다.
 *
 * 사용 규율 (위반 시 경합 또는 교착 — sync-hardening-2 계획 §10 A1/A2):
 * - 락은 반드시 repository "읽기부터" 감싼다 — 쓰기만 감싸면 이미 낡은 스냅샷을
 *   읽은 뒤라 순서만 세워질 뿐 유실은 그대로다.
 * - 락 키는 리터럴 금지 — `@usecases/sync/syncRegistry`의 SYNC_FILE_KEYS 정본만 사용.
 *   오타 하나가 별개 락 도메인을 만들어 직렬화가 조용히 깨진다.
 * - 같은 파일 락 안에서 같은 파일 withFileLock 중첩 호출 금지 — 체인이 자기 자신을
 *   기다려 교착한다(ManageStudentRecords.saveCategoriesUnsafe 전례). 락은 정확히
 *   한 계층에서만 획득하고, 내부 로직은 -Unsafe 변형으로 분리한다.
 * - 이전 작업의 실패는 체인에서 격리되어 다음 작업을 막지 않는다(호출자에게는 그대로 전파).
 */

const chains = new Map<string, Promise<unknown>>();

export function withFileLock<T>(filename: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(filename) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  chains.set(
    filename,
    next.catch(() => undefined),
  );
  return next;
}

/** 테스트 전용 — 파일별 체인 레지스트리를 비운다(테스트 간 격리). 프로덕션 호출 금지. */
export function resetFileWriteLocksForTest(): void {
  chains.clear();
}
