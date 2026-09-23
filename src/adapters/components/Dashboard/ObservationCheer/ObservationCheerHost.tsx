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
import {
  useObservationTalkEngine,
  useTodayStudentsEngine,
} from '@adapters/hooks/useObservationDaily';
import { useObservationDaySync } from '@adapters/stores/useObservationDayStore';
import { weeklyRecapHasContent } from './recapPieces';

export function ObservationCheerHost(): null {
  useObservationDaySync();
  useObservationLapKeeper();
  useObservationCheerToasts();
  // ADR-137 — 오늘 챙길 학생은 메인 창·위젯 창 모두 고른다(이 컴퓨터 저장소에서 합쳐진다).
  useTodayStudentsEngine();
  return null;
}

/**
 * 바탕화면 위젯 창에 한 번만 다는 보이지 않는 자리(ADR-137).
 * 그날 상태를 따라가고, 오늘 챙길 학생을 고르고, 먼저 거는 말을 정한다(토스트 없음 — 핀 줄만).
 * 한 바퀴 끝 지점 저장은 하지 않는다(메인 창만).
 */
export function ObservationWidgetHost(): null {
  useObservationDaySync();
  useTodayStudentsEngine();
  useObservationTalkEngine('widget', undefined, weeklyRecapHasContent);
  return null;
}
