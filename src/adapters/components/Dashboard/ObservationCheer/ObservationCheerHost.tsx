/**
 * 관찰 기록 응원(ADR-135) — 메인 창에 한 번만 다는 보이지 않는 자리.
 *
 * - 한 바퀴 끝 지점 저장·바퀴 응원(`useObservationLapKeeper`)은 **메인 창에서만** 한다.
 *   바탕화면 위젯 창은 같은 카드를 그리기만 한다(spec §5).
 * - 첫 기록 응원 토스트는 저장한 창에서 뜬다. 곧바로 닫히는 별도 빠른 기록 창에는 달지 않는다 —
 *   그 창에서 저장하면 카드의 핀 줄에만 남는다(spec §9).
 */
import {
  useObservationCheerToasts,
  useObservationLapKeeper,
} from '@adapters/hooks/useObservationCheer';

export function ObservationCheerHost(): null {
  useObservationLapKeeper();
  useObservationCheerToasts();
  return null;
}
