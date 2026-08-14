/**
 * 옆핀 위젯 칸 — 고른 위젯을 위아래로 훑어 본다.
 *
 * 대시보드의 `WidgetCard`를 그대로 쓰지 않는다. 그 카드는 끌어 옮기기·크기 조절·
 * 모달 열기를 함께 들고 있는데, 옆핀에서는 셋 다 쓸 수 없다. 폭이 400 안팎이라
 * 모달을 띄우면 화면을 다 덮고, 늘 위에 떠 있는 창이라 그 위에 또 창을 얹으면
 * 어디를 눌러야 할지 알 수 없다. 그래서 **본문만 빌려 오고 껍데기는 여기서 만든다.**
 *
 * 개수로 자르지 않는다. 고른 위젯이 옆핀에서 말없이 사라지면 사용자는 설정이
 * 먹히지 않는다고 여긴다. 대신 칸이 스크롤된다. (메모 목록과 같은 결정)
 */
import { useMemo } from 'react';
import type { WidgetDefinition } from '@widgets/types';
import {
  selectSidePinWidgets,
  type SidePinWidgetItem,
} from '@usecases/sidePin/SelectSidePinWidgets';
import { SIDE_PIN_MEMO_FOCUS } from './SidePinMemoList';
import { SidePinZoneHeader } from './SidePinZoneHeader';

export interface SidePinWidgetZoneProps {
  readonly definitions: readonly WidgetDefinition[];
  /** 사용자가 골라 둔 위젯. 비어 있으면 기본값을 채운다 */
  readonly selectedIds: readonly string[];
  /** 메인 쌤핀의 해당 화면을 연다 */
  readonly onOpenInApp: (target: string) => void;
}

export function SidePinWidgetZone({
  definitions,
  selectedIds,
  onOpenInApp,
}: SidePinWidgetZoneProps) {
  const { items } = useMemo(
    () => selectSidePinWidgets({ definitions, selectedIds }),
    [definitions, selectedIds],
  );

  const byId = useMemo(
    () => new Map(definitions.map((definition) => [definition.id, definition])),
    [definitions],
  );

  return (
    <section aria-label="위젯" className="flex h-full flex-col bg-sp-bg">
      <SidePinZoneHeader icon="dashboard" title="위젯" />

      {/* min-h-0 이 없으면 안쪽 스크롤이 부모를 밀어내 머리말이 잘린다. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {items.length === 0 ? (
          <p className="px-1 py-3 text-caption text-sp-muted">
            옆핀에 올릴 위젯이 없습니다. 설정에서 고를 수 있습니다.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => {
              const definition = byId.get(item.id);
              if (definition === undefined) return null;
              return (
                <li key={item.id}>
                  <WidgetBlock item={item} definition={definition} onOpenInApp={onOpenInApp} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function WidgetBlock({
  item,
  definition,
  onOpenInApp,
}: {
  readonly item: SidePinWidgetItem;
  readonly definition: WidgetDefinition;
  readonly onOpenInApp: (target: string) => void;
}) {
  const Body = definition.component;

  return (
    /* 바탕(sp-bg)보다 한 단계 어두운 sp-surface를 쓴다. sp-card는 바탕과 밝기 차이가
       1.2뿐이라 카드가 거기 있는지조차 보이지 않는다. */
    <article
      aria-label={item.name}
      className="overflow-hidden rounded-lg border border-sp-border bg-sp-surface"
    >
      <div className="flex items-center gap-1 px-2 pt-1.5">
        <h3 className="min-w-0 flex-1 truncate text-caption font-medium text-sp-text">
          {item.name}
        </h3>
        <button
          type="button"
          aria-label={`쌤핀에서 ${item.name} 열기`}
          onClick={() => onOpenInApp(item.navigationTarget)}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-sp-muted transition-colors duration-sp-quick hover:bg-sp-bg hover:text-sp-text ${SIDE_PIN_MEMO_FOCUS}`}
        >
          <span aria-hidden className="material-symbols-outlined text-icon-sm leading-none">
            open_in_full
          </span>
        </button>
      </div>
      <div className="px-2 pb-2">
        <Body />
      </div>
    </article>
  );
}
