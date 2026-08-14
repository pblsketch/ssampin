/**
 * 옆핀 패널 — 펼쳤을 때 보이는 본체.
 *
 * 위는 위젯, 아래는 메모다. 둘을 탭으로 갈아 끼우지 않고 위아래로 나란히 두는 것이
 * 이 기능의 핵심 결정이다. 위젯을 보려고 메모를 덮어 버리면, "잠깐 확인하고 닫는다"는
 * 목적이 무너진다.
 *
 * 화면 오른쪽 끝에 붙으므로 왼쪽만 둥글다. 손잡이와 같은 규칙이라, 접혔다 펴져도
 * 같은 물건이 커진 것처럼 보인다.
 *
 * 등장은 짧게(140ms) 한 번만 움직인다. 펼침 예산이 300ms인데 연출이 그걸 먹으면
 * 사용자에게는 느린 앱이 된다.
 */
import type { ReactNode } from 'react';
import type { SidePinPinnedZone, SidePinZone } from '@domain/entities/SidePinRuntimeState';

export interface SidePinPanelProps {
  readonly pinnedZone: SidePinPinnedZone;
  /**
   * 어느 칸으로 들어와 열렸는가. 그 칸이 더 넓어진다.
   *
   * 들어온 칸을 아예 통째로 보여주고 다른 칸을 숨기지는 않는다. 그러면 위젯을 보려고
   * 메모를 덮는 셈이 되어, 위아래로 나란히 둔 이유가 사라진다. 넓이만 바꾼다.
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
  /** 안쪽 면 투명도를 얹는 스타일 — 토큰을 덮어써 아래 요소가 모두 따라온다 */
  readonly surfaceStyle?: Record<string, string>;
  /** 모양 조절 판. 열려 있을 때만 넣는다 */
  readonly appearanceSlot?: ReactNode;
  readonly onToggleAppearance: () => void;
  readonly appearanceOpen: boolean;
  readonly widgetSlot: ReactNode;
  readonly memoSlot: ReactNode;
  readonly onTogglePin: (zone: 'both') => void;
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
 * 두 칸의 넓이 비율.
 *
 * 메모로 들어왔으면 메모가 더 넓다. 그 외에는 위젯이 넓다 — 단축키처럼 가리킨 곳이
 * 없을 때 임의로 메모를 키우면, 사용자가 정하지 않은 것을 앱이 정한 셈이 된다.
 */
function zoneGrowth(activeZone: SidePinZone | null): { widget: string; memo: string } {
  return activeZone === 'memo'
    ? { widget: 'flex-[2]', memo: 'flex-[3]' }
    : { widget: 'flex-[3]', memo: 'flex-[2]' };
}

export function SidePinPanel({
  pinnedZone,
  activeZone,
  backgroundColor,
  leaving = false,
  surfaceStyle,
  appearanceSlot,
  onToggleAppearance,
  appearanceOpen,
  widgetSlot,
  memoSlot,
  onTogglePin,
  onClose,
  onOpenMain,
  memoEditing = false,
}: SidePinPanelProps) {
  const pinned = pinnedZone !== 'none';
  const growth = zoneGrowth(activeZone);

  return (
    <section
      aria-label="옆핀"
      style={{ backgroundColor, ...surfaceStyle }}
      className={`${leaving ? 'sidepin-exit' : 'sidepin-enter'} flex h-full w-full flex-col overflow-hidden rounded-l-xl border border-r-0 border-sp-border`}
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
          label={pinned ? '고정 해제' : '고정'}
          active={pinned}
          onClick={() => onTogglePin('both')}
        />
        <HeaderButton icon="close" label="닫기" onClick={onClose} />
      </header>

      {appearanceSlot}

      {/*
        들어온 칸이 더 넓다. 메모를 쓰는 중에는 위젯을 요약 높이로 접어
        편집기가 넓게 쓰도록 한다.
        min-h-0 이 없으면 안쪽 스크롤이 부모를 밀어내 헤더가 잘린다.
      */}
      <div
        className={`min-h-0 shrink-0 overflow-y-auto transition-[flex-grow] duration-sp-base ${
          memoEditing ? 'h-12 flex-none' : `${growth.widget} basis-0`
        }`}
      >
        {widgetSlot}
      </div>

      {/*
        두 칸 사이 이음매. 폭 안쪽으로 들여 짧게 그으면 "같은 목록의 구분선"으로 읽혀
        칸이 나뉜 줄 모른다. 끝에서 끝까지 그어야 **다른 칸이 시작된다**로 읽힌다.
        각 칸의 머리말이 한 단계 어두운 띠라 이 선과 함께 경계를 이룬다.
      */}
      <span aria-hidden className="h-px shrink-0 bg-sp-border" />

      <div
        className={`min-h-0 basis-0 overflow-y-auto transition-[flex-grow] duration-sp-base ${growth.memo}`}
      >
        {memoSlot}
      </div>
    </section>
  );
}
