/**
 * 미저장 로컬 쓰기 배리어 (모바일 PWA).
 *
 * 왜 필요한가 — 화면은 편집을 디바운스로 모아 저장하는데, 앱이 백그라운드로 가면
 * `useSyncTrigger` 가 같은 이벤트(visibilitychange/pagehide)에서 즉시 업로드를 시작한다.
 * 두 리스너의 실행 순서는 등록 순서에 달려 있어, 업로드가 먼저 돌면 **편집 직전 상태가
 * 클라우드 정본이 되어 PC 까지 덮는다**. iOS PWA 는 백그라운드에서 타이머를 죽이기 때문에
 * 그 뒤 디바운스가 발사된다는 보장도 없다.
 *
 * 해결 — 편집이 들어와 저장이 예약되는 순간 "미완료 쓰기"를 열어두고, 업로드는 시작 전에
 * 이 배리어를 기다린다. 업로드 리스너가 먼저 실행돼도 `await` 하는 사이 화면 리스너가
 * 디바운스를 flush 하므로, 순서와 무관하게 최신 상태가 올라간다.
 */

let pendingCount = 0;
let waiters: Array<() => void> = [];

function releaseIfIdle(): void {
  if (pendingCount > 0) return;
  const toRun = waiters;
  waiters = [];
  for (const resolve of toRun) resolve();
}

/**
 * 미저장 편집이 생겼음을 알린다(저장 예약 시점에 호출).
 * 반환된 함수를 저장 완료·취소 시 반드시 호출해야 배리어가 풀린다.
 */
export function beginPendingWrite(): () => void {
  pendingCount += 1;
  let settled = false;
  return () => {
    if (settled) return; // 중복 호출 방어 — 카운터가 음수로 새지 않게
    settled = true;
    pendingCount = Math.max(0, pendingCount - 1);
    releaseIfIdle();
  };
}

/** 진행 중인 미저장 쓰기가 모두 끝날 때까지 기다린다. 없으면 즉시 반환. */
export function awaitPendingWrites(): Promise<void> {
  if (pendingCount === 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    waiters.push(resolve);
  });
}

/** 테스트 전용 — 모듈 상태 초기화. */
export function resetPendingWritesForTest(): void {
  pendingCount = 0;
  waiters = [];
}

/** 테스트/진단용 — 현재 미완료 쓰기 수. */
export function getPendingWriteCount(): number {
  return pendingCount;
}
