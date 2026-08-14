import type { SidePinDeviceState } from '../entities/SidePinDeviceState';

/**
 * 기기 전용 상태 저장 결과.
 *
 * 성공/실패 둘로만 나누면 "본 파일은 잘 썼는데 예비 사본만 실패한" 경우를
 * 실패로 처리해 방금 저장한 값을 버리게 된다. 그래서 세 가지로 구분한다.
 *
 * - `saved`: 본 파일과 예비 사본 모두 정상
 * - `saved-with-backup-warning`: 본 파일은 저장됐고 예비 사본만 실패 — 값은 살아 있다
 * - `failed`: 본 파일 저장 실패 — 기존 파일을 그대로 둔다
 */
export type SidePinDeviceStateSaveResult = 'saved' | 'saved-with-backup-warning' | 'failed';

export interface ISidePinDeviceStateRepository {
  /** 저장된 값을 읽는다. 파일이 없거나 깨졌으면 기본값으로 정규화해 돌려준다. */
  load(): Promise<SidePinDeviceState>;
  save(state: SidePinDeviceState): Promise<SidePinDeviceStateSaveResult>;
}
