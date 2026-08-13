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
import type { SidePinPinnedZone } from '@domain/entities/SidePinRuntimeState';

export interface SidePinPanelProps {
  readonly pinnedZone: SidePinPinnedZone;
  readonly widgetSlot: ReactNode;
  readonly memoSlot: ReactNode;
  readonly onTogglePin: (zone: 'both') => void;
  readonly onClose: () => void;
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
      className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-sp-card ${
        active ? 'text-sp-accent' : 'text-sp-muted'
      }`}
    >
      <span aria-hidden className="material-symbols-outlined text-icon-sm leading-none">
        {icon}
      </span>
    </button>
  );
}

export function SidePinPanel({
  pinnedZone,
  widgetSlot,
  memoSlot,
  onTogglePin,
  onClose,
  memoEditing = false,
}: SidePinPanelProps) {
  const pinned = pinnedZone !== 'none';

  return (
    <section
      aria-label="옆핀"
      className="sidepin-enter flex h-full w-full flex-col overflow-hidden rounded-l-xl border border-r-0 border-sp-border bg-sp-surface"
    >
      <header className="flex shrink-0 items-center gap-1 border-b border-sp-border px-3 py-2">
        <h1 className="flex-1 truncate text-sm font-bold text-sp-text">옆핀</h1>
        <HeaderButton
          icon={pinned ? 'keep' : 'keep_off'}
          label={pinned ? '고정 해제' : '고정'}
          active={pinned}
          onClick={() => onTogglePin('both')}
        />
        <HeaderButton icon="close" label="닫기" onClick={onClose} />
      </header>

      {/*
        위젯 60% · 메모 40%. 메모를 쓰는 중에는 위젯을 요약 높이로 접어
        편집기가 넓게 쓰도록 한다.
        min-h-0 이 없으면 안쪽 스크롤이 부모를 밀어내 헤더가 잘린다.
      */}
      <div
        className={`min-h-0 shrink-0 overflow-y-auto transition-[flex-basis] duration-150 ${
          memoEditing ? 'h-12 flex-none' : 'flex-[3] basis-0'
        }`}
      >
        {widgetSlot}
      </div>

      <span aria-hidden className="mx-3 h-px shrink-0 bg-sp-border" />

      <div className="min-h-0 flex-[2] basis-0 overflow-y-auto">{memoSlot}</div>
    </section>
  );
}
