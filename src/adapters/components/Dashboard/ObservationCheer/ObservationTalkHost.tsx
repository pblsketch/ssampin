/**
 * 관찰 기록 응원 2·3차(ADR-137) — 메인 창의 먼저 거는 말(하루 한 번)과 한 주 정리·학기 돌아보기 창.
 *
 * 첫 실행 안내(온보딩)가 떠 있는 동안에는 앱이 먼저 말을 걸지 않는다 — `App.tsx` 가 이 자리를
 * `!isFirstRun` 아래에 둔다. 기록 알림 창 등 다른 안내 창이 떠 있으면 닫힌 뒤에 토스트를 띄운다.
 */
import { useCallback } from 'react';
import { useToastStore } from '@adapters/components/common/Toast';
import { useObservationTalkEngine } from '@adapters/hooks/useObservationDaily';
import type { TalkOfDay } from '@domain/rules/proactiveTalk';
import { toLocalDateString } from '@shared/utils/localDate';
import { talkNoticeText } from './cheerMessages';
import { openObservationPanelKind } from './observationPanelNavigation';
import { ObservationRecapModals } from './ObservationRecapModals';
import { weeklyRecapHasContent } from './recapPieces';

export function ObservationTalkHost(): JSX.Element {
  const showToast = useCallback((talk: TalkOfDay) => {
    const kind = talk.main.kind;
    const text = talkNoticeText(talk.main, toLocalDateString(new Date()));
    if (text === null || (kind !== 'weekly' && kind !== 'retrospect')) return;
    useToastStore.getState().showCheer(text, 'idle', () => openObservationPanelKind(kind));
  }, []);
  useObservationTalkEngine('main', showToast, weeklyRecapHasContent);
  return <ObservationRecapModals />;
}
