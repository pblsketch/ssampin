/**
 * 시작 스냅샷으로 되돌린 자료의 동기화 보호(ADR-148).
 *
 * 원본·백업이 모두 깨진 자료를 메인 프로세스가 시작 스냅샷(그날 처음 켰을 때의 상태)으로 되돌리면,
 * 그 내용은 클라우드에 있는 사본보다 **옛 것일 수 있다.** 그런데 동기화 장부로 보면 "아직 안 올린 로컬
 * 변경"과 똑같이 보여서, 그대로 두면 받기는 건너뛰고 올리기가 클라우드의 더 새 사본을 덮는다.
 *
 * 그래서 아직 클라우드와 맞춰지지 않은 복원 자료는:
 *  - 받기(`SyncFromCloud`)가 내용이 다르면 **충돌로 올려 묻는다**(ADR-144 "덮지 말고 묻는다").
 *  - 올리기(`SyncToCloud`)는 클라우드 사본이 있고 내용이 다르면 **올리지 않고 건너뛴다**(유예하지 않는다
 *    — 매번 다시 도는 고리를 만들지 않는다).
 *  - 내용이 같아졌거나, 클라우드에 사본이 아예 없으면 "맞춰짐"으로 알려 준다(`restoredResolved`).
 *
 * 복원 기록은 데스크톱 메인 프로세스에 있다 — 유스케이스는 이 모양만 알고, 읽기는 호출부가 주입한다.
 */
export interface RestoredDataHold {
  /** 동기화 키(데이터 파일 이름). */
  readonly key: string;
  /** 되돌린 상태의 시각(스냅샷이 찍힌 시각, ISO). 충돌 창에 "이 기기" 시각으로 보인다. */
  readonly restoredStateAt: string;
}

/**
 * 아직 클라우드와 맞춰지지 않은 복원 자료 목록. 읽기에 실패하면 예외를 던질 것 — 빈 목록으로 삼키면
 * 되돌린 옛 내용이 클라우드를 덮을 수 있다(동기화가 실패하는 쪽이 낫다).
 */
export type GetRestoredDataHolds = () => Promise<readonly RestoredDataHold[]>;

export async function loadRestoredDataHolds(
  getHolds: GetRestoredDataHolds | undefined,
): Promise<ReadonlyMap<string, RestoredDataHold>> {
  if (!getHolds) return new Map();
  const holds = await getHolds();
  return new Map(holds.map((hold) => [hold.key, hold]));
}
