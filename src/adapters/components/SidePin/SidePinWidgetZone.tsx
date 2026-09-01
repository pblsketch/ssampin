/**
 * 옆핀 위젯 칸 — 고른 위젯을 위아래로 훑어 보고, 고칠 수 있는 것은 열어서 고친다.
 *
 * 대시보드의 `WidgetCard`를 그대로 쓰지 않는다. 그 카드는 끌어 옮기기·크기 조절·
 * 모달 열기를 함께 들고 있는데, 옆핀에서는 앞의 둘을 쓸 수 없다. 그래서
 * **본문만 빌려 오고 껍데기는 여기서 만든다.**
 *
 * 개수로 자르지 않는다. 고른 위젯이 옆핀에서 말없이 사라지면 사용자는 설정이
 * 먹히지 않는다고 여긴다. 대신 칸이 스크롤된다. (메모 목록과 같은 결정)
 *
 * ## 여는 방식 — 모달이 아니라 화면 바꾸기 (2026-08-19)
 *
 * 위젯 모드는 카드를 누르면 `WidgetModal`을 띄운다. 옆핀에서는 **띄우지 않고 칸을
 * 통째로 바꾼다.** 폭이 400 안팎이라 모달을 띄워도 어차피 화면을 다 덮으므로 모달인
 * 이점이 없고, 늘 위에 떠 있는 창에 창을 또 얹으면 어디를 눌러야 할지 알기 어렵다.
 * 메모 편집기·삭제 확인·모양 조절이 모두 쓰는 이 패널의 방식을 그대로 따른다.
 *
 * 고치는 화면은 새로 만들지 않았다. **카드에 들어가는 그 컴포넌트를 그대로
 * `isCompactMode={false}`로 그린 것**이고, 위젯 모드 모달이 보여주는 것과 같다.
 *
 * ## 반드시 지킬 것 — 여는 동안 패널이 접히면 안 된다
 *
 * 옆핀은 마우스가 벗어나면 접힌다. 할일을 적거나 일정을 고치는 동안 마우스는 대개
 * 딴 데 있으므로, 열어 둔 사실을 창에 알리지 않으면 **쓰는 도중에 접혀 입력이 날아간다.**
 * 메모 칸이 쓰던 장치(`MemoEditorActivity`)를 그대로 쓴다. 이 패널에서 접힘이 문제가
 * 된 네 번째 자리다(메모 본문·파일 대화상자·메모 검색·여기).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import type { WidgetDefinition } from '@widgets/types';
import type { MemoEditorActivity } from '@domain/entities/SidePinRuntimeState';
import {
  selectSidePinWidgets,
  type SidePinWidgetItem,
} from '@usecases/sidePin/SelectSidePinWidgets';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { SIDE_PIN_MEMO_FOCUS } from './SidePinMemoList';
import { SidePinZoneHeader } from './SidePinZoneHeader';
import { SidePinPinGuard } from './SidePinPinGuard';
import { PIN_FEATURE_MAP } from '@widgets/utils/pinFeatureMap';

/** 위젯 본문은 요약/전체 두 모양을 갖는다. 전체가 곧 고치는 화면이다. */
type WidgetBody = ComponentType<{ isCompactMode?: boolean }>;

export interface SidePinWidgetZoneProps {
  readonly definitions: readonly WidgetDefinition[];
  /** 사용자가 골라 둔 위젯. 비어 있으면 기본값을 채운다 */
  readonly selectedIds: readonly string[];
  /** 메인 쌤핀의 해당 화면을 연다 */
  readonly onOpenInApp: (target: string) => void;
  /**
   * 위젯을 열어 두고 있는지 창에 알린다. 이게 없으면 고치는 도중에 패널이 접힌다.
   * 넣지 않아도 화면은 동작하므로 선택 항목이다(옛 호출부 보호).
   */
  readonly onEditorActivityChange?: (activity: MemoEditorActivity) => void;
  /**
   * 창이 들고 있는 "마지막으로 PIN 을 푼 시각". 안 풀었으면 null.
   *
   * 이 창이 스스로 기억하지 않는 이유는 패널 창이 접힌 뒤 10초면 파괴되기 때문이다 —
   * 여기서 기억하면 스칠 때마다 PIN 을 다시 묻는다.
   */
  readonly pinUnlockedAt?: number | null;
  /** PIN 을 풀었다고 창에 알린다 */
  readonly onPinUnlocked?: () => void;
}

export function SidePinWidgetZone({
  definitions,
  selectedIds,
  onOpenInApp,
  onEditorActivityChange,
  pinUnlockedAt = null,
  onPinUnlocked,
}: SidePinWidgetZoneProps) {
  const { items } = useMemo(
    () => selectSidePinWidgets({ definitions, selectedIds }),
    [definitions, selectedIds],
  );

  const byId = useMemo(
    () => new Map(definitions.map((definition) => [definition.id, definition])),
    [definitions],
  );

  /** 열어 둔 위젯 id. null이면 목록이다 */
  const [openId, setOpenId] = useState<string | null>(null);

  const { track } = useAnalytics();

  const open = openId === null ? undefined : items.find((item) => item.id === openId);
  const openDefinition = openId === null ? undefined : byId.get(openId);

  // 고를 수 있는 목록이 바뀌어 열어 둔 위젯이 사라지면 목록으로 돌린다.
  // 그대로 두면 아무것도 안 그려진 빈 칸에 갇힌다.
  useEffect(() => {
    if (openId === null) return;
    if (open === undefined || openDefinition === undefined) setOpenId(null);
  }, [openId, open, openDefinition]);

  /**
   * PIN 판이 떠 있는가. 위젯을 연 것과 **따로** 센다.
   *
   * 목록에서 자물쇠를 눌러 PIN 을 치는 동안에는 `openId` 가 null 이라, 이걸 안 세면
   * "아무것도 안 하는 중"으로 보고돼 **숫자를 누르는 사이 패널이 접힌다.**
   */
  const [pinBusy, setPinBusy] = useState(false);

  // 열려 있는 동안 "쓰는 중"을 건다. 목록으로 돌아오면 푼다.
  useEffect(() => {
    onEditorActivityChange?.(openId === null && !pinBusy ? 'idle' : 'editing');
  }, [openId, pinBusy, onEditorActivityChange]);

  // 화면을 떠날 때는 반드시 손을 뗀다. 안 그러면 창이 영영 접히지 않는다.
  useEffect(() => {
    return () => onEditorActivityChange?.('idle');
  }, [onEditorActivityChange]);

  const close = useCallback(() => setOpenId(null), []);

  if (open !== undefined && openDefinition !== undefined) {
    return (
      <SidePinWidgetDetail
        item={open}
        Body={openDefinition.component as WidgetBody}
        onBack={close}
        onOpenInApp={onOpenInApp}
        pinUnlockedAt={pinUnlockedAt}
        onPinUnlocked={onPinUnlocked}
        onPinBusyChange={setPinBusy}
        pinBusy={pinBusy}
      />
    );
  }

  return (
    /* 바탕을 칠하지 않는다 — 패널이 깔아 둔 (투명도가 적용된) 배경이 비쳐야 한다 */
    <section aria-label="위젯" className="flex h-full flex-col">
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
                  <WidgetBlock
                    item={item}
                    Body={definition.component as WidgetBody}
                    onOpen={() => {
                      // 옆핀을 "펴 보기만" 하는지 "실제로 고치는 데" 쓰는지 가르는 신호다.
                      track('sidepin_action', { action: 'widget_open' });
                      setOpenId(item.id);
                    }}
                    onOpenInApp={onOpenInApp}
                    pinUnlockedAt={pinUnlockedAt}
                    onPinUnlocked={onPinUnlocked}
                    onPinBusyChange={setPinBusy}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

/**
 * 잠금 대상이면 본문을 자물쇠로 바꾼다. 아니면 그대로 그린다.
 *
 * 대상 목록을 여기 적지 않는다 — `PIN_FEATURE_MAP` 하나에서 나오므로 나중에 위젯이
 * 늘어도 **매핑만 있으면 자동으로 보호된다.** 목록을 복사해 두면 반드시 어긋난다.
 */
function GuardedBody({
  widgetId,
  pinUnlockedAt,
  onPinUnlocked,
  onPinBusyChange,
  children,
}: {
  readonly widgetId: string;
  readonly pinUnlockedAt: number | null;
  readonly onPinUnlocked?: () => void;
  readonly onPinBusyChange?: (busy: boolean) => void;
  readonly children: ReactNode;
}) {
  const feature = PIN_FEATURE_MAP[widgetId];
  if (feature === undefined) return <>{children}</>;
  return (
    <SidePinPinGuard
      feature={feature}
      pinUnlockedAt={pinUnlockedAt}
      onUnlocked={onPinUnlocked}
      onEditorActivityChange={onPinBusyChange}
    >
      {children}
    </SidePinPinGuard>
  );
}

/**
 * 위젯 하나를 열어 고치는 화면.
 *
 * 돌아가는 길을 **항상 왼쪽 위에** 둔다(메모 편집기와 같은 자리). Esc로도 돌아간다.
 * 쌤핀 본체로 가는 길은 여기서도 남겨 둔다 — 옆핀에서 하기엔 큰 일이라는 걸
 * 열고 나서 깨닫는 경우가 있고, 그때 목록으로 되돌아갔다 다시 찾게 하면 안 된다.
 */
function SidePinWidgetDetail({
  item,
  Body,
  onBack,
  onOpenInApp,
  pinUnlockedAt,
  onPinUnlocked,
  onPinBusyChange,
  pinBusy,
}: {
  readonly item: SidePinWidgetItem;
  readonly Body: WidgetBody;
  readonly onBack: () => void;
  readonly onOpenInApp: (target: string) => void;
  readonly pinUnlockedAt: number | null;
  readonly onPinUnlocked?: () => void;
  readonly onPinBusyChange?: (busy: boolean) => void;
  /** PIN 판이 떠 있는가 — 떠 있으면 Esc 를 가로채지 않는다 */
  readonly pinBusy: boolean;
}) {
  return (
    <section
      aria-label={`${item.name} 열기`}
      className="flex h-full flex-col"
      onKeyDown={(e) => {
        // Esc는 목록으로 돌아간다. 여기서 멈추지 않으면 패널 자체가 닫혀
        // 고치던 화면에서 그대로 튕겨 나간다.
        if (e.key !== 'Escape') return;
        /**
         * ⚠️ PIN 판이 떠 있으면 **가로채지 않는다.**
         *
         * 여기서 `stopPropagation()` 을 부르면 React 18 은 루트에 붙으므로
         * `PinOverlay` 의 `window` 리스너까지 못 간다. 그러면 Esc 를 눌러도
         * **PIN 이 취소되지 않고 위젯 목록으로만 튄다** — 사용자는 PIN 판에 갇힌다.
         */
        if (pinBusy) return;
        e.preventDefault();
        e.stopPropagation();
        onBack();
      }}
    >
      <header className="flex shrink-0 items-center gap-1 px-2 pb-1 pt-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="위젯 목록으로"
          className={`flex h-7 items-center gap-1 rounded-lg px-1.5 text-caption font-medium text-sp-muted transition-colors duration-sp-quick hover:bg-sp-surface hover:text-sp-text ${SIDE_PIN_MEMO_FOCUS}`}
        >
          <span aria-hidden className="material-symbols-outlined text-icon-sm leading-none">
            arrow_back
          </span>
          위젯
        </button>

        <h3 className="min-w-0 flex-1 truncate px-1 text-caption font-medium text-sp-text">
          {item.name}
        </h3>

        <button
          type="button"
          aria-label={`쌤핀에서 ${item.name} 열기`}
          onClick={() => onOpenInApp(item.navigationTarget)}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sp-muted transition-colors duration-sp-quick hover:bg-sp-surface hover:text-sp-text ${SIDE_PIN_MEMO_FOCUS}`}
        >
          <span aria-hidden className="material-symbols-outlined text-icon-sm leading-none">
            open_in_full
          </span>
        </button>
      </header>

      {/*
        위젯 모드 모달이 보여주는 것과 같은 화면이다. 다만 그쪽은 최대 896px을 쓰고
        여기는 400 안팎이라, 안쪽 배치가 좁은 폭에서 눌릴 수 있다. 가로로 넘치면
        잘라 버리지 말고 스크롤로 닿게 둔다 — 안 보이는 것보다 밀어 보는 편이 낫다.
      */}
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        <GuardedBody
          widgetId={item.id}
          pinUnlockedAt={pinUnlockedAt}
          onPinUnlocked={onPinUnlocked}
          onPinBusyChange={onPinBusyChange}
        >
          <Body isCompactMode={false} />
        </GuardedBody>
      </div>
    </section>
  );
}

function WidgetBlock({
  item,
  Body,
  onOpen,
  onOpenInApp,
  pinUnlockedAt,
  onPinUnlocked,
  onPinBusyChange,
}: {
  readonly item: SidePinWidgetItem;
  readonly Body: WidgetBody;
  readonly onOpen: () => void;
  readonly onOpenInApp: (target: string) => void;
  readonly pinUnlockedAt: number | null;
  readonly onPinUnlocked?: () => void;
  readonly onPinBusyChange?: (busy: boolean) => void;
}) {
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

        {/*
          고칠 수 있는 위젯에만 여는 단추를 둔다. 크게 보기만 하는 위젯에까지 달면
          열어 놓고 "왜 아무것도 안 고쳐지지"가 된다.
        */}
        {item.editable && (
          <button
            type="button"
            aria-label={`${item.name} 열기`}
            onClick={onOpen}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-sp-muted transition-colors duration-sp-quick hover:bg-sp-bg hover:text-sp-text ${SIDE_PIN_MEMO_FOCUS}`}
          >
            <span aria-hidden className="material-symbols-outlined text-icon-sm leading-none">
              edit
            </span>
          </button>
        )}

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
        <GuardedBody
          widgetId={item.id}
          pinUnlockedAt={pinUnlockedAt}
          onPinUnlocked={onPinUnlocked}
          onPinBusyChange={onPinBusyChange}
        >
          <Body />
        </GuardedBody>
      </div>
    </article>
  );
}
