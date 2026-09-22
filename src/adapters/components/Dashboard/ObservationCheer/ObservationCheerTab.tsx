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

export function ObservationCheerTab(): JSX.Element {
  const grass = useMyGrass();
  const cheer = useTodayCheer();
  const cards = useObservationLapCards();
  const termWindow = useObservationTermWindow();

  return (
    <div className="space-y-3">
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
