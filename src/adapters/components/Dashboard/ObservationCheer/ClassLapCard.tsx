/**
 * 반 카드 한 장 — 이번 바퀴에 기록한 학생 칸을 칠해 보여 준다(ADR-135).
 *
 * - 칸을 누르면 그 학생·그 반으로 빠른 기록의 글쓰기 단계가 바로 열린다(ADR-122 결정 2의 예외).
 * - 칸 모서리의 '⋯'로 [당분간 빼기]·[다시 넣기]. 칸 누르기(기록)와 메뉴는 서로 다른 단추다 —
 *   단추 안에 단추를 넣지 않는다.
 * - 칠한 칸만 채운 배경(`sp-accent`)을 쓴다. 종은 글자색 아이콘, 빠진 칸은 점선 테두리 — 경고색
 *   채움·학생별 건수·순위는 쓰지 않는다(ADR-134).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useQuickAddStore } from '@adapters/stores/useQuickAddStore';
import { useToastStore } from '@adapters/components/common/Toast';
import type { LapCardViewModel, LapCellViewModel } from '@adapters/hooks/observationLapCards';
import { exclusionUntil, type ExclusionPeriod } from '@domain/rules/reminderExclusion';
import { openQuickRecordDirect } from '../studentRecordNavigation';
import { ObservationCellMenu, type CellMenuAnchor } from './ObservationCellMenu';

interface ClassLapCardProps {
  readonly card: LapCardViewModel;
  readonly today: string;
  readonly termEnd: string;
}

interface OpenMenu {
  readonly ref: string;
  readonly anchor: CellMenuAnchor;
  readonly trigger: HTMLElement;
}

function cellAriaLabel(cell: LapCellViewModel): string {
  const who =
    cell.displayName.length > 0 ? `${cell.label}번 ${cell.displayName}` : `${cell.label}번 학생`;
  if (cell.state === 'excluded') return `${who}, 지금 빠져 있음`;
  if (cell.state === 'filled') return `${who}, 이번 바퀴 기록 완료`;
  return cell.bell ? `${who}, 아직 기록 전 · 오늘 챙길 학생` : `${who}, 아직 기록 전`;
}

const CELL_STATE_CLASS: Record<LapCellViewModel['state'], string> = {
  filled: 'bg-sp-accent text-sp-accent-fg hover:brightness-110',
  empty: 'border border-sp-border text-sp-text hover:bg-sp-surface',
  excluded: 'border border-dashed border-sp-border text-sp-muted hover:bg-sp-surface',
};

export function ClassLapCard({ card, today, termEnd }: ClassLapCardProps): JSX.Element {
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const menuTriggerRef = useRef<HTMLElement | null>(null);
  /** 칸에서 연 빠른 기록 창이 닫히면 초점을 돌려줄 칸 */
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // 빠른 기록 창이 닫히면 누른 칸으로 초점을 돌려준다. 확장 창이 초점 가두기를 다시 켜며 첫 단추로
  // 초점을 옮기므로, 그 다음 차례에 돌려놓는다.
  useEffect(
    () =>
      useQuickAddStore.subscribe((s, prev) => {
        if (!prev.isOpen || s.isOpen) return;
        const el = returnFocusRef.current;
        returnFocusRef.current = null;
        if (el === null) return;
        window.setTimeout(() => {
          if (el.isConnected) el.focus();
        }, 0);
      }),
    [],
  );

  const closeMenu = useCallback(() => {
    setMenu(null);
    // 메뉴 안에 초점이 있었으면 연 단추로 돌려준다.
    const trigger = menuTriggerRef.current;
    const focusInMenu = (document.activeElement?.closest('[role="menu"]') ?? null) !== null;
    if (trigger !== null && focusInMenu) {
      trigger.focus();
    }
  }, []);

  const toggleMenu = (cell: LapCellViewModel, el: HTMLElement): void => {
    if (menu?.ref === cell.ref) {
      closeMenu();
      return;
    }
    const r = el.getBoundingClientRect();
    menuTriggerRef.current = el;
    setMenu({ ref: cell.ref, anchor: { left: r.left, top: r.top, bottom: r.bottom }, trigger: el });
  };

  const save = async (action: () => Promise<void>): Promise<void> => {
    closeMenu();
    try {
      await action();
    } catch {
      useToastStore.getState().show('저장하지 못했어요. 잠시 뒤 다시 해 주세요.', 'error');
    }
  };

  const exclude = (cell: LapCellViewModel, period: ExclusionPeriod): void => {
    void save(() =>
      useSettingsStore
        .getState()
        .setReminderExclusion(cell.exclusionKey, exclusionUntil(period, today, termEnd)),
    );
  };

  const putBack = (cell: LapCellViewModel): void => {
    void save(() => useSettingsStore.getState().removeReminderExclusion(cell.exclusionKey));
  };

  // 관심 학생은 칸 어디에도 표시가 없다(ADR-137 — TV 화면 대비). 눌렸는지 알 수 있게 짧게 알린다.
  const toggleFocus = (cell: LapCellViewModel): void => {
    const next = !cell.focused;
    void save(async () => {
      await useSettingsStore.getState().setReminderFocus(cell.exclusionKey, next);
      useToastStore
        .getState()
        .show(
          next ? '관심 학생으로 지정했어요' : '관심 학생 지정을 풀었어요',
          'success',
          undefined,
          2500,
        );
    });
  };

  const openCell = (cell: LapCellViewModel, el: HTMLElement): void => {
    returnFocusRef.current = el;
    openQuickRecordDirect({
      contextKind: card.contextKind,
      contextId: card.contextId,
      studentRef: cell.ref,
    });
  };

  const menuCell = menu === null ? null : (card.cells.find((c) => c.ref === menu.ref) ?? null);
  const gridCols = card.mixed
    ? 'grid-cols-[repeat(auto-fill,minmax(44px,1fr))]'
    : 'grid-cols-[repeat(auto-fill,minmax(36px,1fr))]';

  return (
    <section className="rounded-xl border border-sp-border bg-sp-card p-3" aria-label={card.title}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="truncate text-sm font-sp-semibold text-sp-text">{card.title}</h4>
        {card.memberCount > 0 &&
          (card.justFinished ? (
            <span className="shrink-0 text-xs font-medium text-sp-accent">한 바퀴 완료</span>
          ) : (
            <span className="shrink-0 text-xs text-sp-muted">한 바퀴까지 {card.remaining}명</span>
          ))}
      </div>

      <ul className={`grid ${gridCols} gap-1`}>
        {card.cells.map((cell, i) => {
          const menuOpen = menu?.ref === cell.ref;
          return (
            // 번호가 겹친 명렬(같은 학생 key 두 칸)도 칸은 모두 그린다 — key 에 순서를 붙인다.
            <li key={`${cell.ref}#${i}`} className="group relative">
              <button
                type="button"
                onClick={(e) => openCell(cell, e.currentTarget)}
                aria-label={cellAriaLabel(cell)}
                className={`relative flex w-full items-center justify-center rounded-md font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sp-accent ${
                  card.mixed ? 'h-8 text-[10px]' : 'aspect-square text-[11px]'
                } ${CELL_STATE_CLASS[cell.state]}`}
              >
                {cell.state === 'excluded' ? '–' : cell.label}
                {cell.bell && (
                  <span
                    aria-hidden
                    className="material-symbols-outlined pointer-events-none absolute bottom-0 right-0 text-[11px] leading-none text-sp-highlight"
                  >
                    notifications
                  </span>
                )}
              </button>

              {cell.displayName.length > 0 && (
                <span
                  role="tooltip"
                  data-sp-floating
                  className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-sp-border bg-sp-card px-2 py-0.5 text-caption text-sp-text opacity-0 shadow-sp-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
                >
                  {cell.displayName}
                </span>
              )}

              <button
                type="button"
                data-sp-floating
                aria-label={`${cell.label}번 칸 메뉴 열기`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={(e) => toggleMenu(cell, e.currentTarget)}
                className={`absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-sp-border bg-sp-card text-[10px] leading-none text-sp-muted transition-opacity hover:text-sp-text focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 ${
                  menuOpen ? 'opacity-100' : 'opacity-0'
                }`}
              >
                ⋯
              </button>
            </li>
          );
        })}
      </ul>

      {menu !== null && menuCell !== null && (
        <ObservationCellMenu
          anchor={menu.anchor}
          trigger={menu.trigger}
          label={`${menuCell.label}번 칸`}
          excluded={menuCell.state === 'excluded'}
          excludedUntil={menuCell.excludedUntil}
          onExclude={(p) => exclude(menuCell, p)}
          onReturn={() => putBack(menuCell)}
          focused={menuCell.focused}
          onToggleFocus={() => toggleFocus(menuCell)}
          onClose={closeMenu}
        />
      )}
    </section>
  );
}
