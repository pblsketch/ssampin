/**
 * 학생 빠른 기록 카드 맨 위의 핀 줄(ADR-135) — 오늘의 응원, 없으면 연속 주 문구 한 줄.
 *
 * 카드가 아무리 작아져도 이 줄은 남는다(스크롤 영역 밖). 줄바꿈하지 않는다.
 *
 * 2·3차(ADR-137, 설계 §1) — 같은 자리에 셋 중 하나를 보인다.
 *  1. 오늘 쉬는 중: "오늘은 쉬어요"
 *  2. 아직 열어 보지 않은 먼저 거는 말: "이번 주 정리가 왔어요" 등 — 누르면 그 창을 연다
 *  3. 그 밖: 1차 그대로(오늘의 응원 → 연속 주 문구)
 * 오른쪽의 작은 [쉴게요]/[다시 켜기] 단추는 이 컴퓨터에서 그날 하루만 조용하게 한다.
 */
import { useCheerLine } from '@adapters/hooks/useObservationCheer';
import { usePendingTalk, useRestToday, useTodayString } from '@adapters/hooks/useObservationDaily';
import { CheerPin } from './CheerPin';
import { RESTING_LINE, talkNoticeText } from './cheerMessages';
import { requestObservationPanel } from './observationPanelNavigation';

export function CheerPinLine(): JSX.Element {
  const { text, pinState } = useCheerLine();
  const { resting, rest, unrest } = useRestToday();
  const talk = usePendingTalk();
  const today = useTodayString();
  const talkKind = talk?.main.kind;
  const talkText = talk !== null ? talkNoticeText(talk.main, today) : null;
  const openable = talkKind === 'weekly' || talkKind === 'retrospect';

  return (
    <div className="mb-2 flex shrink-0 items-center gap-2" aria-live="polite">
      <CheerPin state={resting || talkText !== null ? 'idle' : pinState} size={24} />
      {resting ? (
        <p className="min-w-0 flex-1 truncate text-xs text-sp-muted">{RESTING_LINE}</p>
      ) : talkText !== null && openable ? (
        <button
          type="button"
          onClick={() => requestObservationPanel(talkKind)}
          title={talkText}
          className="min-w-0 flex-1 truncate text-left text-xs text-sp-accent hover:underline"
        >
          {talkText}
        </button>
      ) : (
        <p className="min-w-0 flex-1 truncate text-xs text-sp-muted" title={text}>
          {text}
        </p>
      )}
      <button
        type="button"
        onClick={resting ? unrest : rest}
        aria-label={resting ? '오늘 쉬기를 풀고 다시 켜기' : '오늘은 쉴게요'}
        title={resting ? '다시 켜기' : '오늘은 쉴게요'}
        className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:bg-sp-surface ${
          resting ? 'text-sp-accent' : 'text-sp-muted hover:text-sp-text'
        }`}
      >
        {resting ? '다시 켜기' : '쉴게요'}
      </button>
    </div>
  );
}
