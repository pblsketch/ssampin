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
 *    밝기가 아니라 면이 통째로 뒤집히는 것으로 알린다.
 *
 * 4. **아이콘에 앉을 면(칩)을 항상 그린다.** 초기 구현은 16 DIP 폭을 전제로 아이콘만
 *    띄웠는데, Windows가 창 최소 폭을 물리 52픽셀로 강제해 실제로는 **30~52 DIP**로
 *    들어온다(배율 175%면 30, 100%면 52). 그 넓은 칸에 14px 아이콘 하나만 있으니
 *    "아무것도 없는 회색 막대"로 읽혔다. 칩을 상시 노출해 "여기 눌리는 것이 있다"를
 *    처음부터 알린다.
 *
 * 칩은 24px로 고정한다. 창 폭 비율로 다시 계산하면 혼합 배율에서 호버할 때마다 시각적인
 * 크기가 달라질 수 있다. 30~52 DIP 어느 창에서도 들어가는 크기만 고르고 상태 변화는 색으로만 낸다.
 *
 * 칩 배경에 `sp-card`가 아니라 `sp-border`를 쓰는 이유가 중요하다. 라이트 모드에서
 * `sp-card`는 `sp-surface`와 **밝기 차이가 2도 안 되는 사실상 같은 색**이라, 칩을 그려도
 * 화면에는 아무것도 없는 흰 막대만 보인다(2026-08-14 실제 발생). 토큰이 있는지만 보고
 * 값이 실제로 다른지 확인하지 않은 것이 원인이었다.
 *
 * 이 조합이 다시 무너지지 않도록 색 값 자체를 재는 검사를 `railContrast.test.ts`에 뒀다.
 *
 * 위아래 두 구역은 각각 위젯·메모로 들어가는 입구다. 어느 쪽에 들어왔는지에 따라
 * 펼쳤을 때 먼저 보여 줄 곳이 달라진다.
 */
import type { SidePinPointerRegion } from '@domain/entities/SidePinRuntimeState';
import { useRef } from 'react';

const RAIL_DRAG_THRESHOLD_PX = 4;

export interface SidePinRailProps {
  /** 지금 포인터가 어느 구역에 있는지 (창이 알려 준다) */
  readonly pointerRegion: SidePinPointerRegion;
  /**
   * 배경색. 설정한 투명도가 여기 담겨 온다.
   *
   * 클래스가 아니라 인라인으로 칠하는 이유는, 이 저장소에서 `bg-sp-*` 에 투명도 수식을
   * 붙이면 CSS 자체가 만들어지지 않기 때문이다. 위젯 모드도 같은 이유로 인라인을 쓴다.
   */
  readonly backgroundColor: string;
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
    <div className="flex flex-1 items-center justify-center">
      <button
        type="button"
        aria-label={label}
        onMouseEnter={onEnter}
        onFocus={onEnter}
        onClick={onClick}
        className="relative flex h-11 w-11 items-center justify-center outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent focus-visible:-outline-offset-2"
      >
        {/* 펼쳐질 방향(화면 안쪽)을 미리 알리는 얇은 선. */}
        <span
          aria-hidden
          className={`absolute left-0 top-2 bottom-2 w-[2px] rounded-r-full bg-sp-accent transition-opacity duration-sp-quick ${
            active ? 'opacity-100' : 'opacity-0'
          }`}
        />
        {/* 칩 — 크기는 고정하고 호버·활성 상태에서는 색만 바꾼다. */}
        <span
          aria-hidden
          className={`flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-lg transition-colors duration-sp-quick ${
            active ? 'bg-sp-accent' : 'bg-sp-border'
          }`}
        >
          <span
            className={`material-symbols-outlined text-[18px] leading-none transition-colors duration-sp-quick ${
              active ? 'text-sp-accent-fg' : 'text-sp-text'
            }`}
          >
            {icon}
          </span>
        </span>
      </button>
    </div>
  );
}

export function SidePinRail({
  pointerRegion,
  backgroundColor,
  onZoneEnter,
  onZoneLeave,
  onZoneClick,
}: SidePinRailProps) {
  const dragRef = useRef<{
    readonly pointerId: number;
    readonly startScreenY: number;
    dragging: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const finishDrag = (pointerId: number): void => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== pointerId) return;
    dragRef.current = null;
    if (!drag.dragging) return;
    suppressClickRef.current = true;
    window.electronAPI?.sidePin?.endRailDrag?.();
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  const clickZone = (zone: 'widget' | 'memo'): void => {
    if (suppressClickRef.current) return;
    onZoneClick(zone);
  };

  return (
    <div
      data-sidepin-rail
      onMouseLeave={onZoneLeave}
      onPointerDown={(event) => {
        if (event.button !== 0 || !event.isPrimary) return;
        dragRef.current = {
          pointerId: event.pointerId,
          startScreenY: event.screenY,
          dragging: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (drag === null || drag.pointerId !== event.pointerId || drag.dragging) return;
        if (Math.abs(event.screenY - drag.startScreenY) < RAIL_DRAG_THRESHOLD_PX) return;
        drag.dragging = true;
        window.electronAPI?.sidePin?.startRailDrag?.();
      }}
      onPointerUp={(event) => finishDrag(event.pointerId)}
      onPointerCancel={(event) => finishDrag(event.pointerId)}
      style={{ backgroundColor }}
      className="box-border flex h-full w-full flex-col overflow-hidden rounded-l-lg border border-r-0 border-sp-border"
    >
      <RailZone
        icon="dashboard"
        label="위젯 열기"
        active={pointerRegion === 'rail-widget'}
        onEnter={() => onZoneEnter('rail-widget')}
        onClick={() => clickZone('widget')}
      />
      {/* 두 구역을 나누는 선 — 손잡이가 하나가 아니라 둘임을 알린다 */}
      <span aria-hidden className="mx-1 h-px shrink-0 bg-sp-border" />
      <RailZone
        icon="sticky_note_2"
        label="메모 열기"
        active={pointerRegion === 'rail-memo'}
        onEnter={() => onZoneEnter('rail-memo')}
        onClick={() => clickZone('memo')}
      />
    </div>
  );
}
