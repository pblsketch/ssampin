/**
 * 변동 시간표 삭제 — 수업 교체의 짝 인식 (서랍·시간표 칸 우클릭 공용).
 *
 * 수업 교체는 같은 pairId 의 변동 2건이다. 한쪽만 지우면 짝이 "반쪽 교체"로 남아
 * 시간표가 한 칸만 바뀐 채 굳는다. 예전에는 서랍만 짝을 알았고 칸 우클릭은 확인 없이
 * 그 1건만 지워 반쪽이 생겼다. 확인 문구와 짝 찾기를 이 한 곳에 두어 두 진입점이
 * 같은 규칙으로 지우게 한다.
 */
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { findSwapPartner } from '@domain/rules/timetableRules';

/** 교체 한쪽을 지울 때 묻는 문구 — 서랍과 칸 우클릭이 같은 문구를 쓴다. */
export const SWAP_PAIR_DELETE_CONFIRM_MESSAGE =
  '이 수업은 다른 교시와 짝을 이룬 교체입니다.\n짝까지 함께 삭제하시겠습니까?';

export type OverrideDeleteOutcome = 'pair' | 'single' | 'cancelled' | 'missing';

interface DeleteOverrideOptions {
  /**
   * 짝이 없는 변동을 지울 때 묻는 문구. 주지 않으면 확인 없이 지운다
   * (시간표 칸 우클릭은 예전부터 확인 없이 지웠다).
   */
  readonly singleConfirmMessage?: string;
}

/**
 * 변동 1건을 지운다. 수업 교체의 한쪽이고 짝이 살아 있으면 확인을 받은 뒤
 * 짝까지 한 번의 저장으로 지운다. 짝이 없으면(일반 변동·컴시간 자동 변동·이미 생긴 반쪽)
 * 그 1건만 지운다.
 */
export async function deleteOverrideConfirmingPair(
  id: string,
  options: DeleteOverrideOptions = {},
): Promise<OverrideDeleteOutcome> {
  const { overrides, deleteOverride, deleteOverrideWithPair } = useScheduleStore.getState();
  const target = overrides.find((o) => o.id === id);
  if (!target) return 'missing';

  if (findSwapPartner(overrides, target)) {
    if (!window.confirm(SWAP_PAIR_DELETE_CONFIRM_MESSAGE)) return 'cancelled';
    await deleteOverrideWithPair(id);
    return 'pair';
  }

  if (options.singleConfirmMessage && !window.confirm(options.singleConfirmMessage)) {
    return 'cancelled';
  }
  await deleteOverride(id);
  return 'single';
}
