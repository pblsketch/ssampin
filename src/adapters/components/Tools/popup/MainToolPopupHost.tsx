import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PopupToolId, ToolPopupFailureReason } from '@domain/entities/ToolPopup';
import { isPopupToolId } from '@domain/rules/toolPopupRules';
import { useToastStore } from '@adapters/components/common/Toast';
import { useToolPopupStore } from '@adapters/stores/useToolPopupStore';
import { TOOL_REGISTRY } from '@adapters/components/Tools/toolRegistry';
import { getToolPopupBridge } from './toolPopupBridge';
import type { ToolPopupSessionValue, ToolPopupSnapshotEnvelope } from './toolPopupSession';
import { ToolPopupSessionContext, ToolPopupSlotRegistry } from './toolPopupSession';

/**
 * 본문(메인 창)에서 쌤도구를 감싸 팝업 이관에 참여시킨다.
 *
 * 이미 팝업으로 열려 있는 도구는 **본문에서 그리지 않는다** — 같은 도구가 두 곳에서
 * 돌면 알람이 두 번 울리고 결과가 갈라진다. 대신 안내와 [창 보기]를 준다
 * (되돌리기는 팝업 창의 [본문으로 가져오기]가 맡는다).
 *
 * 설계: docs/02-design/features/tool-popup.design.md §4, §7
 */

interface MainToolPopupHostProps {
  readonly page: string;
  readonly children: React.ReactNode;
}

const FAILURE_MESSAGES: Readonly<Record<ToolPopupFailureReason, string>> = {
  'unsupported-tool': '이 도구는 별도 창으로 열 수 없습니다.',
  'window-create-failed': '새 창을 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
  'ready-timeout': '새 창이 준비되지 않아 본문에서 계속 사용합니다.',
  'load-failed': '새 창을 여는 중 문제가 생겨 본문에서 계속 사용합니다.',
  'blocked-by-browser': '브라우저가 새 창을 막았습니다. 팝업 허용 후 다시 시도해 주세요.',
  unavailable: '이 환경에서는 별도 창을 지원하지 않습니다.',
};

export function MainToolPopupHost({ page, children }: MainToolPopupHostProps): JSX.Element {
  if (!isPopupToolId(page)) return <>{children}</>;
  return <PopupCapableTool toolId={page}>{children}</PopupCapableTool>;
}

function PopupCapableTool({
  toolId,
  children,
}: {
  readonly toolId: PopupToolId;
  readonly children: React.ReactNode;
}): JSX.Element {
  const registry = useMemo(() => new ToolPopupSlotRegistry(), []);
  const bridge = useMemo(() => getToolPopupBridge(), []);
  const showToast = useToastStore((s) => s.show);

  const openToolIds = useToolPopupStore((s) => s.openToolIds);
  const subscribe = useToolPopupStore((s) => s.subscribe);

  useEffect(() => {
    subscribe();
  }, [subscribe]);

  // ★팝업에서 돌아온 상태는 "첫 렌더에만" 읽으면 안 된다.
  //   본문이 이미 그 도구 화면에 있으면 페이지가 바뀌지 않아 이 부품이 다시 만들어지지 않고,
  //   그러면 넘어온 스냅샷이 조용히 버려져 타이머가 처음으로 돌아간다(실제로 겪은 결함).
  //   그래서 도착을 지켜보다가 받는 즉시 소비하고, 세대 번호를 올려 도구를 다시 만든다.
  const hasPendingReturn = useToolPopupStore((s) => s.returned?.toolId === toolId);
  const [restored, setRestored] = useState<{
    readonly envelope: ToolPopupSnapshotEnvelope;
    readonly generation: number;
  } | null>(null);

  useEffect(() => {
    if (!hasPendingReturn) return;
    const envelope = useToolPopupStore.getState().consumeReturned(toolId);
    if (envelope === null) return;
    setRestored((prev) => ({ envelope, generation: (prev?.generation ?? 0) + 1 }));
  }, [hasPendingReturn, toolId]);

  const initialSnapshot = restored?.envelope ?? null;

  const [busy, setBusy] = useState(false);
  // ★ref 가드 — 상태 갱신은 비동기라 연속 클릭 두 번이 같은 옛 상태를 본다(과거 실사고).
  const movingRef = useRef(false);

  const moveToPopup = useCallback(() => {
    if (movingRef.current) return;
    // 이미 별도 창에서 도는 도구면 시작하지 않는다 — 멈추고 담아 봐야 그 스냅샷이 갈 곳이 없다.
    if (useToolPopupStore.getState().openToolIds.includes(toolId)) return;
    movingRef.current = true;
    setBusy(true);
    // 1) 먼저 멈추고 담는다 — 이 순간부터 소유자는 아무도 아니다(이중 실행 없음).
    const captured = registry.capture(Date.now());
    void bridge
      .open(toolId, captured, captured.capturedAt)
      .then((result) => {
        if (result.ok) {
          // 성공 — 본문은 아래에서 안내 화면으로 바뀌므로 여기서 되살리지 않는다.
          return;
        }
        // 2) 실패하면 원래 실행을 그대로 되살린다. 흐른 시간은 스냅샷 시각으로 보정된다.
        registry.resume(captured);
        showToast(FAILURE_MESSAGES[result.reason], 'error');
      })
      .finally(() => {
        movingRef.current = false;
        setBusy(false);
      });
  }, [bridge, registry, showToast, toolId]);

  const session = useMemo<ToolPopupSessionValue>(
    () => ({
      placement: 'main',
      toolId,
      initialSnapshot,
      registerSlot: (slotId, handlers) => registry.register(slotId, handlers),
      moveToPopup,
      returnToMain: () => {},
      closePopup: () => {},
      alwaysOnTop: false,
      toggleAlwaysOnTop: () => {},
      supportsAlwaysOnTop: false,
      busy,
    }),
    [toolId, initialSnapshot, registry, moveToPopup, busy],
  );

  if (openToolIds.includes(toolId)) {
    return <ToolInPopupNotice toolId={toolId} />;
  }

  // 돌아온 스냅샷을 아직 못 집었으면 한 프레임만 기다린다 —
  // 빈 상태로 도구를 먼저 그리면 그 순간 화면이 초기화된 것처럼 보인다.
  if (hasPendingReturn) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-sp-muted">도구를 본문으로 가져오는 중…</p>
      </div>
    );
  }

  return (
    // key: 돌아온 상태를 받을 때마다 도구를 새로 만들어 그 스냅샷으로 시작하게 한다.
    <ToolPopupSessionContext.Provider key={restored?.generation ?? 0} value={session}>
      {children}
    </ToolPopupSessionContext.Provider>
  );
}

/** 이 도구가 지금 별도 창에서 돌고 있을 때 본문이 보여 주는 안내. */
function ToolInPopupNotice({ toolId }: { readonly toolId: PopupToolId }): JSX.Element {
  const meta = TOOL_REGISTRY[toolId];
  const bridge = useMemo(() => getToolPopupBridge(), []);

  return (
    <div className="h-full flex items-center justify-center">
      <div className="max-w-md w-full rounded-2xl border border-sp-border bg-sp-card p-8 text-center">
        <div className="text-5xl mb-4">{meta.emoji}</div>
        <h2 className="text-lg font-bold text-sp-text mb-2">
          {meta.name}은(는) 지금 별도 창에서 사용 중입니다
        </h2>
        <p className="text-sm text-sp-muted mb-6">
          창을 앞으로 가져오거나, 본문으로 다시 가져와 이어서 쓸 수 있습니다.
        </p>
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => void bridge.focus(toolId)}
            className="px-4 py-2 rounded-xl bg-sp-accent text-white text-sm font-medium hover:bg-sp-accent/80 transition-colors"
          >
            창 보기
          </button>
        </div>
        <p className="text-xs text-sp-muted mt-4">
          별도 창의 [본문으로 가져오기]를 누르면 진행 중인 상태 그대로 이 화면으로 돌아옵니다.
        </p>
      </div>
    </div>
  );
}
