/**
 * 반 카드 칸 메뉴 — [당분간 빼기 ▸ 2주 / 한 달 / 이번 학기 끝까지] 또는 [다시 넣기](ADR-135).
 * 빠지지 않은 칸에는 맨 위에 [관심 학생으로]/[관심 학생 풀기](ADR-137). 빠진 칸은 [다시 넣기]만 —
 * 빠져 있는 동안은 관심 효과가 없다(빼기가 이긴다).
 *
 * ★문서 끝(`document.body`)에 띄운다. 유리 모드의 확장 창은 흐림 효과 때문에 그 안의 `fixed`
 *   위치를 가둔다(사이드바 모달 사고와 같은 원인). 위치는 누른 '⋯' 단추 기준으로 화면 안에 맞춘다.
 * ★Esc 는 확장 창이 먼저 받으므로 `overlayMenuStack` 에 닫기를 올려 둔다 — Esc 한 번에 메뉴만 닫힌다.
 * ★고르는 즉시 저장한다(설정 화면의 [저장]을 기다리지 않는다). 성공하면 알림 없이 칸 모양만 바뀐다.
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { pushOverlayMenu } from '@adapters/utils/overlayMenuStack';
import { EXCLUSION_PERIOD_LABELS, type ExclusionPeriod } from '@domain/rules/reminderExclusion';

const PERIODS: readonly ExclusionPeriod[] = ['twoWeeks', 'oneMonth', 'termEnd'];

export interface CellMenuAnchor {
  readonly left: number;
  readonly top: number;
  readonly bottom: number;
}

interface ObservationCellMenuProps {
  readonly anchor: CellMenuAnchor;
  /** 메뉴를 연 '⋯' 단추 — 이 단추를 누른 것은 '바깥'으로 치지 않는다(단추가 열고 닫는다). */
  readonly trigger: HTMLElement | null;
  /** 메뉴를 읽어 줄 이름 — "3번 칸" */
  readonly label: string;
  readonly excluded: boolean;
  /** 빠져 있으면 다시 들어오는 날 'YYYY-MM-DD' */
  readonly excludedUntil: string | null;
  readonly onExclude: (period: ExclusionPeriod) => void;
  readonly onReturn: () => void;
  /** 관심 학생인가(빠진 칸이면 무시) */
  readonly focused: boolean;
  readonly onToggleFocus: () => void;
  readonly onClose: () => void;
}

function formatUntil(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return m !== undefined && d !== undefined ? `${m}월 ${d}일까지 빠져 있어요` : '';
}

export function ObservationCellMenu({
  anchor,
  trigger,
  label,
  excluded,
  excludedUntil,
  onExclude,
  onReturn,
  focused,
  onToggleFocus,
  onClose,
}: ObservationCellMenuProps): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.bottom + 4 });

  // Esc 는 확장 창이 먼저 받는다 — 맨 위 메뉴부터 닫게 올려 둔다.
  useEffect(() => pushOverlayMenu(onClose), [onClose]);

  // 화면 밖으로 나가지 않게 맞춘다. 아래 자리가 모자라면 단추 위로 띄운다.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (el === null) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const below = anchor.bottom + 4;
    const top = below + rect.height > vh - 8 ? Math.max(8, anchor.top - rect.height - 4) : below;
    setPos({ left: Math.max(8, Math.min(anchor.left, vw - rect.width - 8)), top });
  }, [anchor]);

  // 열리면 첫 항목에 초점.
  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, []);

  // 바깥을 누르면 닫는다. ★잡기 단계로 듣는다 — 확장 창 본문이 누르기 이벤트를 위로 올리지 않아서
  //   보통 단계로 들으면 창 안 어디를 눌러도 메뉴가 안 닫힌다.
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) === true) return;
      if (trigger?.contains(target) === true) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [onClose, trigger]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    const i = items.findIndex((el) => el === document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      // 확장 창 밖(일반 화면)에서 열렸을 때를 위한 대비. 확장 창 안이면 창이 먼저 닫아 준다.
      e.preventDefault();
      onClose();
    }
  };

  const itemClass =
    'w-full rounded-md px-3 py-1.5 text-left text-xs text-sp-text transition-colors hover:bg-sp-surface focus-visible:bg-sp-surface focus-visible:outline-none';

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      data-sp-floating
      aria-label={`${label} 메뉴`}
      onKeyDown={onKeyDown}
      // 확장 창의 '바깥 누르면 닫기'로 새지 않게 막는다(창 안에서 연 메뉴라 이벤트가 창으로 올라간다).
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-sp-tooltip min-w-[152px] rounded-lg border border-sp-border bg-sp-card p-1 shadow-sp-lg"
      style={{ left: pos.left, top: pos.top }}
    >
      {excluded ? (
        <>
          {excludedUntil !== null && (
            <p className="px-3 pb-1 pt-1.5 text-caption text-sp-muted">
              {formatUntil(excludedUntil)}
            </p>
          )}
          <button type="button" role="menuitem" className={itemClass} onClick={onReturn}>
            다시 넣기
          </button>
        </>
      ) : (
        <>
          <button type="button" role="menuitem" className={itemClass} onClick={onToggleFocus}>
            {focused ? '관심 학생 풀기' : '관심 학생으로'}
          </button>
          <div role="separator" className="my-1 border-t border-sp-border" />
          <p className="px-3 pb-1 pt-1.5 text-caption text-sp-muted">당분간 빼기</p>
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={() => onExclude(p)}
            >
              {EXCLUSION_PERIOD_LABELS[p]}
            </button>
          ))}
        </>
      )}
    </div>
  );

  return createPortal(menu, document.body);
}
