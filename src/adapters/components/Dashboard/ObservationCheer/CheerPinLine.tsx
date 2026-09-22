/**
 * 학생 빠른 기록 카드 맨 위의 핀 줄(ADR-135) — 오늘의 응원, 없으면 연속 주 문구 한 줄.
 *
 * 카드가 아무리 작아져도 이 줄은 남는다(스크롤 영역 밖). 줄바꿈하지 않는다.
 */
import { useCheerLine } from '@adapters/hooks/useObservationCheer';
import { CheerPin } from './CheerPin';

export function CheerPinLine(): JSX.Element {
  const { text, pinState } = useCheerLine();
  return (
    <div className="mb-2 flex shrink-0 items-center gap-2" aria-live="polite">
      <CheerPin state={pinState} size={24} />
      <p className="min-w-0 flex-1 truncate text-xs text-sp-muted">{text}</p>
    </div>
  );
}
