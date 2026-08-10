/**
 * 기기 전용 Drive 동기화 상태 (ADR-040).
 *
 * ⚠️ 이 키는 **절대 SYNC_FILES에 등재하지 말 것**. "마지막 동기화 시각"은 기기마다 다른
 * 값인데, v2.3.4까지는 동기화 대상인 settings 안(`sync.lastSyncedAt`)에 살았다. 그래서
 * 동기화가 끝날 때마다 동기화 대상 파일이 바뀌었고, 그 결과
 *   ① settings가 매 동기화 주기마다 무조건 업로드됐고(내용이 늘 달라짐),
 *   ② 기기 A·B가 서로의 시각으로 settings를 덮는 LWW 핑퐁이 생겼으며,
 *   ③ 그 쓰기가 **장부 확정 이후**라 다음 다운로드가 이를 "충돌"로 오해했다(ADR-039).
 * 표시 전용 값 하나 때문에 동기화 파이프라인 전체가 흔들렸다 — 되돌리지 말 것.
 *
 * 로컬 Drive 장부(`IDriveSyncRepository`)의 `lastSyncedAt`을 쓰지 않는 이유: 그쪽은
 * 실제 업로드/다운로드가 있었을 때만 갱신된다(변경 없는 동기화는 장부를 쓰지 않는다 —
 * no-op 장부 오염 방지). 화면의 "n분 전 동기화"는 변경 없는 동기화도 반영해야 한다.
 */
export const DRIVE_SYNC_DEVICE_STATE_KEY = 'drive-sync-device-state';

export interface DriveSyncDeviceState {
  /** 이 기기가 마지막으로 동기화를 완료한 시각(ISO 8601). 표시 전용. */
  readonly lastSyncedAt?: string;
}

/**
 * 기기 전용 상태 읽기. 실패는 "값 없음"으로 처리한다 — 이 값은 화면 문구에만 쓰이고
 * 어떤 데이터 판단에도 관여하지 않으므로, 읽기 실패가 동기화를 막아선 안 된다.
 * (동기화 판정에 쓰이는 스토리지 읽기는 이렇게 삼키면 안 된다 — ADR-023.)
 */
export async function readDriveSyncDeviceState(): Promise<DriveSyncDeviceState | null> {
  try {
    const { storage } = await import('@adapters/di/container');
    const raw = await storage.read<DriveSyncDeviceState>(DRIVE_SYNC_DEVICE_STATE_KEY);
    return raw !== null && typeof raw === 'object' ? raw : null;
  } catch {
    return null;
  }
}

/** 마지막 동기화 시각 기록. 실패해도 동기화 자체는 성공으로 둔다(표시 전용). */
export async function saveDriveSyncLastSyncedAt(iso: string): Promise<void> {
  try {
    const { storage } = await import('@adapters/di/container');
    const prev = await readDriveSyncDeviceState();
    await storage.write(DRIVE_SYNC_DEVICE_STATE_KEY, { ...(prev ?? {}), lastSyncedAt: iso });
  } catch (err) {
    console.warn('[DriveSync] 기기 전용 동기화 시각 저장 실패(표시 전용 — 동기화는 정상):', err);
  }
}

/** 클라우드 데이터 삭제 시 표시 값도 함께 비운다. */
export async function clearDriveSyncLastSyncedAt(): Promise<void> {
  try {
    const { storage } = await import('@adapters/di/container');
    const prev = await readDriveSyncDeviceState();
    const next = { ...(prev ?? {}) };
    delete (next as { lastSyncedAt?: string }).lastSyncedAt;
    await storage.write(DRIVE_SYNC_DEVICE_STATE_KEY, next);
  } catch (err) {
    console.warn('[DriveSync] 기기 전용 동기화 시각 초기화 실패:', err);
  }
}
