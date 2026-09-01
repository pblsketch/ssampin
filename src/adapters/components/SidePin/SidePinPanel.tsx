/**
 * 옆핀 패널 — 펼쳤을 때 보이는 본체.
 *
 * 위는 위젯, 아래는 메모다. 들어온 칸이 화면을 거의 다 쓰고 반대 칸은 48px 띠로 접히되,
 * **띠는 화면에서 사라지지 않는다.** 탭으로 갈아 끼우면 반대 칸의 존재 자체가 안 보여
 * "위젯 어디 갔지"가 되므로, 접어도 그 자리에 남겨 두고 누르면 돌아오게 한다.
 * 배치를 정하는 규칙은 `sidePinZoneLayout.ts` 하나뿐이다.
 *
 * 화면 오른쪽 끝에 붙으므로 왼쪽만 둥글다. 손잡이와 같은 규칙이라, 접혔다 펴져도
 * 같은 물건이 커진 것처럼 보인다.
 *
 * 등장은 260ms 안에 부드럽게 멈추고, 퇴장은 150ms 안에 빠르게 빠진다. 펼침 예산 300ms와
 * Electron 창 축소 마감 180ms 안에서 각각 끝나야 조작이 느리거나 끝 프레임이 잘리지 않는다.
 */
import type { ReactNode } from 'react';
import type { SidePinPinnedZone, SidePinZone } from '@domain/entities/SidePinRuntimeState';
import { SIDE_PIN_ZONE_META, SidePinCollapsedZoneBand } from './SidePinZoneHeader';
import { resolveSidePinZoneLayout, type SidePinZoneFit } from './sidePinZoneLayout';
import {
  SIDE_PIN_HIDDEN_OPACITY,
  SIDE_PIN_HIDDEN_TRANSFORM,
  useSidePinMotion,
} from './useSidePinMotion';

export interface SidePinPanelProps {
  readonly pinnedZone: SidePinPinnedZone;
  /**
   * 어느 칸으로 들어와 열렸는가. 그 칸이 화면을 거의 다 쓴다.
   *
   * `both`·`null`(단축키·끌기 자리처럼 가리킨 곳이 없을 때)이면 둘 다 보여 준다 —
   * 사용자가 고르지 않은 것을 앱이 대신 고르지 않는다.
   */
  readonly activeZone: SidePinZone | null;
  /**
   * 배경색. 설정한 투명도가 여기 담겨 온다.
   *
   * 클래스가 아니라 인라인으로 칠한다 — 이 저장소에서 `bg-sp-*` 에 투명도 수식을 붙이면
   * CSS 자체가 만들어지지 않는다. 위젯 모드도 같은 이유로 인라인을 쓴다.
   */
  readonly backgroundColor: string;
  /** 나가는 중인가. 창은 아직 큰 상태이고, 연출이 끝나야 줄어든다 */
  readonly leaving?: boolean;
  /** 네이티브 패널 창이 실제로 표시된 뒤에만 첫 열기 모션을 시작한다. */
  readonly motionActive?: boolean;
  /** 안쪽 면 투명도를 얹는 스타일 — 토큰을 덮어써 아래 요소가 모두 따라온다 */
  readonly surfaceStyle?: Record<string, string>;
  /** 모양 조절 판. 열려 있을 때만 넣는다 */
  readonly appearanceSlot?: ReactNode;
  readonly onToggleAppearance: () => void;
  readonly appearanceOpen: boolean;
  readonly widgetSlot: ReactNode;
  readonly memoSlot: ReactNode;
  /**
   * 고정을 켜고 끈다. **지금 보는 칸**을 넘긴다.
   *
   * 늘 `both`를 넘기면, 손잡이로 한 칸을 고정해 둔 상태에서 이 버튼이 해제가 아니라
   * `both` 재고정이 되고 `activeZone`까지 함께 풀려 화면이 반으로 갈라진다.
   */
  readonly onTogglePin: (zone: SidePinZone) => void;
  /** 접힌 띠를 눌러 볼 칸을 옮긴다 — 고정은 걸지 않는다 */
  readonly onFocusZone: (zone: SidePinZone) => void;
  readonly onClose: () => void;
  /**
   * 메인 쌤핀으로 돌아간다.
   *
   * 옆핀은 위젯·아이콘과 같은 계열의 "접어 둔 상태"라, 메인 창은 숨어 있다.
   * 돌아갈 길이 눈에 보이지 않으면 사용자는 트레이를 뒤지거나 앱을 다시 켠다.
   */
  readonly onOpenMain: () => void;
  /** 메모를 편집 중이면 위젯 영역을 요약 높이로 접는다 */
  readonly memoEditing?: boolean;
  /**
   * 위젯 하나를 열어 고치는 중인가. 참이면 메모 칸을 요약 높이로 접는다.
   * `memoEditing`의 거울이다 — 쓰는 칸에 자리를 몰아준다.
   */
  readonly widgetEditing?: boolean;
}

interface HeaderButtonProps {
  readonly icon: string;
  readonly label: string;
  readonly active?: boolean;
  readonly onClick: () => void;
}

function HeaderButton({ icon, label, active = false, onClick }: HeaderButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-sp-surface ${
        active ? 'text-sp-accent' : 'text-sp-muted'
      }`}
    >
      <span aria-hidden className="material-symbols-outlined text-icon-sm leading-none">
        {icon}
      </span>
    </button>
  );
}

/**
 * 한 칸을 그린다.
 *
 * 접혔을 때 **본문을 들어내지 않고 감춘다**(`hidden`). 들어내면 그 칸이 통째로
 * 다시 만들어져 스크롤 위치·검색어·열어 둔 위젯이 전부 초기화된다. 메모를 쓰는 동안
 * 위젯 칸이 접히는 기존 동작에서도 같은 문제가 생기므로 여기서 함께 막는다.
 */
function ZoneSlot({
  fit,
  zone,
  share,
  onExpand,
  children,
}: {
  readonly fit: SidePinZoneFit;
  readonly zone: 'widget' | 'memo';
  /** 둘이 나눠 쓸 때의 몫 */
  readonly share: string;
  readonly onExpand: () => void;
  readonly children: ReactNode;
}) {
  const meta = SIDE_PIN_ZONE_META[zone];
  const collapsed = fit.kind === 'band';

  return (
    <div
      data-sidepin-zone={zone}
      data-sidepin-zone-fit={fit.kind}
      className={`min-h-0 shrink-0 transition-[flex-grow] duration-sp-base ${
        collapsed
          ? // 접힌 띠는 스크롤되면 안 된다 — 머리말이 위로 밀려 나가면 펼칠 곳이 사라진다.
            'h-12 flex-none overflow-hidden'
          : `${fit.kind === 'full' ? 'flex-1' : share} basis-0 overflow-y-auto`
      }`}
    >
      {collapsed && (
        <SidePinCollapsedZoneBand
          icon={meta.icon}
          title={meta.title}
          expandable={fit.expandable}
          onExpand={onExpand}
        />
      )}
      <div className={collapsed ? 'hidden' : 'h-full'}>{children}</div>
    </div>
  );
}

export function SidePinPanel({
  pinnedZone,
  activeZone,
  backgroundColor,
  leaving = false,
  motionActive = true,
  surfaceStyle,
  appearanceSlot,
  onToggleAppearance,
  appearanceOpen,
  widgetSlot,
  memoSlot,
  onTogglePin,
  onFocusZone,
  onClose,
  onOpenMain,
  memoEditing = false,
  widgetEditing = false,
}: SidePinPanelProps) {
  const layout = resolveSidePinZoneLayout({ activeZone, memoEditing, widgetEditing });
  /**
   * 고정 버튼이 겨누는 칸 — 지금 보고 있는 칸이다.
   *
   * 가리킨 곳이 없어 둘 다 보이는 중이면 `both`가 맞다. 그때는 한 칸만 고정하는 것이
   * 무엇을 뜻하는지 화면으로 설명할 수 없다.
   */
  const pinTarget: SidePinZone =
    activeZone === 'widget' || activeZone === 'memo' ? activeZone : 'both';
  const pinned = pinnedZone === pinTarget;
  const pinLabel = pinned
    ? '고정 해제'
    : pinTarget === 'widget'
      ? '위젯 고정'
      : pinTarget === 'memo'
        ? '메모 고정'
        : '고정';
  const panelRef = useSidePinMotion(leaving, motionActive);

  return (
    <section
      ref={panelRef}
      aria-label="옆핀"
      style={{
        backgroundColor,
        ...surfaceStyle,
        transform: SIDE_PIN_HIDDEN_TRANSFORM,
        opacity: SIDE_PIN_HIDDEN_OPACITY,
      }}
      className="sidepin-motion flex h-full w-full flex-col overflow-hidden rounded-l-xl border border-r-0 border-sp-border"
    >
      <header className="flex shrink-0 items-center gap-1 border-b border-sp-border px-3 py-2">
        <h1 className="flex-1 truncate text-sm font-bold text-sp-text">옆핀</h1>
        {/* 메인으로 돌아가는 길 — 옆핀은 접어 둔 상태라 메인 창이 숨어 있다 */}
        <HeaderButton icon="open_in_full" label="쌤핀 열기" onClick={onOpenMain} />
        {/* 뒤에 무엇이 있느냐에 따라 알맞은 투명도가 달라져, 설정 창을 열면 정작 맞출 화면이 가려진다 */}
        <HeaderButton
          icon="tune"
          label="모양"
          active={appearanceOpen}
          onClick={onToggleAppearance}
        />
        <HeaderButton
          icon={pinned ? 'keep' : 'keep_off'}
          label={pinLabel}
          active={pinned}
          onClick={() => onTogglePin(pinTarget)}
        />
        {/*
          "닫기"는 앱을 끄는 말로 읽혀 선생님이 누르길 꺼렸다. 이 버튼은 아무것도
          끄지 않고 패널을 손잡이로 접을 뿐이라, 실제 쓰임(누가 다가올 때·발표 직전)에
          맞춰 "지금 가리기"로 부른다.
        */}
        <HeaderButton icon="visibility_off" label="지금 가리기" onClick={onClose} />
      </header>

      {appearanceSlot}

      {/*
        들어온 칸이 화면을 거의 다 쓰고 반대 칸은 띠로 접힌다. 편집 중이면 편집이 이긴다.
        min-h-0 이 없으면 안쪽 스크롤이 부모를 밀어내 헤더가 잘린다.
      */}
      <ZoneSlot
        fit={layout.widget}
        zone="widget"
        share="flex-[3]"
        onExpand={() => onFocusZone('widget')}
      >
        {widgetSlot}
      </ZoneSlot>

      {/*
        두 칸 사이 이음매. 폭 안쪽으로 들여 짧게 그으면 "같은 목록의 구분선"으로 읽혀
        칸이 나뉜 줄 모른다. 끝에서 끝까지 그어야 **다른 칸이 시작된다**로 읽힌다.
        각 칸의 머리말이 한 단계 어두운 띠라 이 선과 함께 경계를 이룬다.
      */}
      <span aria-hidden className="h-px shrink-0 bg-sp-border" />

      <ZoneSlot fit={layout.memo} zone="memo" share="flex-[2]" onExpand={() => onFocusZone('memo')}>
        {memoSlot}
      </ZoneSlot>
    </section>
  );
}
