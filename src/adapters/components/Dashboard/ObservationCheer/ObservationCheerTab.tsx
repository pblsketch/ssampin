/**
 * 학생 빠른 기록 카드를 크게 연 화면의 [잔디] 탭 — 내 잔디 + 반 카드(ADR-135).
 *
 * 반 카드는 세로로 쌓고 카드 안의 칸만 줄을 바꾼다 — 가로로 밀리지 않는다.
 */
import {
  useMyGrass,
  useObservationLapCards,
  useTodayCheer,
} from '@adapters/hooks/useObservationCheer';
import { useObservationTermWindow } from '@adapters/hooks/useObservationCheerContext';
import { MyGrassSection } from './MyGrassSection';
import { ClassLapCard } from './ClassLapCard';
import { requestObservationPanel } from './observationPanelNavigation';

export function ObservationCheerTab(): JSX.Element {
  const grass = useMyGrass();
  const cheer = useTodayCheer();
  const cards = useObservationLapCards();
  const termWindow = useObservationTermWindow();

  return (
    <div className="space-y-3">
      {/* ADR-137 — 한 주 정리·학기 돌아보기는 언제든 여기서 연다(위젯 창이면 메인 창에서). */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => requestObservationPanel('weekly')}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-sp-border px-3 py-1.5 text-xs text-sp-text transition-colors hover:border-sp-accent"
        >
          <span aria-hidden className="material-symbols-outlined text-sm">
            calendar_view_week
          </span>
          이번 주 정리
        </button>
        <button
          type="button"
          onClick={() => requestObservationPanel('retrospect')}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-sp-border px-3 py-1.5 text-xs text-sp-text transition-colors hover:border-sp-accent"
        >
          <span aria-hidden className="material-symbols-outlined text-sm">
            auto_stories
          </span>
          이번 학기 돌아보기
        </button>
      </div>
      <MyGrassSection weeks={grass.weeks} lineText={cheer?.message ?? grass.lineText} />
      {cards.map((card) => (
        <ClassLapCard
          key={card.card}
          card={card}
          today={termWindow.today}
          termEnd={termWindow.termEnd}
        />
      ))}
    </div>
  );
}
