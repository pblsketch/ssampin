/**
 * 옆핀 손잡이 — 화면 오른쪽 가장자리에 늘 붙어 있는 작은 탭.
 *
 * 디자인 판단 세 가지:
 *
 * 1. **가장자리를 다 덮지 않는다.** 세로 가운데에 짧게 놓인다. 항상 위에 떠 있는 창이라
 *    가장자리 전체를 덮으면 그 줄이 통째로 클릭을 가로채, 최대화한 창의 스크롤바를
 *    누를 수 없게 된다.
 *
 * 2. **화면 쪽만 둥글다.** 오른쪽은 화면 끝에 딱 붙고 왼쪽만 둥글게 해서, 떠 있는 막대가
 *    아니라 가장자리에 꽂힌 책갈피처럼 읽히게 한다. 이름 그대로 '핀'이다.
 *
 * 3. **빛나지 않는다.** 이 제품의 안티레퍼런스가 "과도한 네온·글로우"다. 상태 변화는
 *    밝기가 아니라 왼쪽 가장자리에 얇은 강조선이 서는 것으로 알린다.
 *
 * 위아래 두 구역은 각각 위젯·메모로 들어가는 입구다. 어느 쪽에 들어왔는지에 따라
 * 펼쳤을 때 먼저 보여 줄 곳이 달라진다.
 */
import type { SidePinPointerRegion } from '@domain/entities/SidePinRuntimeState';

export interface SidePinRailProps {
  /** 지금 포인터가 어느 구역에 있는지 (창이 알려 준다) */
  readonly pointerRegion: SidePinPointerRegion;
  readonly onZoneEnter: (region: 'rail-widget' | 'rail-memo') => void;
  readonly onZoneLeave: () => void;
  readonly onZoneClick: (zone: 'widget' | 'memo') => void;
}

interface ZoneProps {
  readonly icon: string;
  readonly label: string;
  readonly active: boolean;
  readonly onEnter: () => void;
  readonly onClick: () => void;
}

function RailZone({ icon, label, active, onEnter, onClick }: ZoneProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onMouseEnter={onEnter}
      onFocus={onEnter}
      onClick={onClick}
      className="relative flex flex-1 items-center justify-center outline-none focus-visible:bg-sp-card"
    >
      {/* 상태 표시는 밝기가 아니라 얇은 강조선으로 — 글로우 금지 */}
      <span
        aria-hidden
        className={`absolute left-0 top-1 bottom-1 w-[2px] rounded-r bg-sp-accent transition-opacity duration-150 ${
          active ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <span
        aria-hidden
        className={`material-symbols-outlined text-icon-sm leading-none transition-colors duration-150 ${
          active ? 'text-sp-accent' : 'text-sp-muted'
        }`}
      >
        {icon}
      </span>
    </button>
  );
}

export function SidePinRail({
  pointerRegion,
  onZoneEnter,
  onZoneLeave,
  onZoneClick,
}: SidePinRailProps) {
  return (
    <div
      onMouseLeave={onZoneLeave}
      className="flex h-full w-full flex-col overflow-hidden rounded-l-lg border border-r-0 border-sp-border bg-sp-surface"
    >
      <RailZone
        icon="dashboard"
        label="위젯 열기"
        active={pointerRegion === 'rail-widget'}
        onEnter={() => onZoneEnter('rail-widget')}
        onClick={() => onZoneClick('widget')}
      />
      {/* 두 구역을 나누는 선 — 손잡이가 하나가 아니라 둘임을 알린다 */}
      <span aria-hidden className="mx-1 h-px shrink-0 bg-sp-border" />
      <RailZone
        icon="sticky_note_2"
        label="메모 열기"
        active={pointerRegion === 'rail-memo'}
        onEnter={() => onZoneEnter('rail-memo')}
        onClick={() => onZoneClick('memo')}
      />
    </div>
  );
}
