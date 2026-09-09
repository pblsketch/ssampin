import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PopupToolId } from '@domain/entities/ToolPopup';
import { parseToolPopupQuery } from '@domain/rules/toolPopupRules';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useThemeApplier } from '@adapters/hooks/useThemeApplier';
import { TOOL_REGISTRY } from '@adapters/components/Tools/toolRegistry';
import { getToolPopupBridge } from './toolPopupBridge';
import type { ToolPopupSessionValue, ToolPopupSnapshotEnvelope } from './toolPopupSession';
import {
  ToolPopupSessionContext,
  ToolPopupSlotRegistry,
  asSnapshotEnvelope,
} from './toolPopupSession';

/**
 * 쌤도구 팝업 창의 화면.
 *
 * 대시보드를 만들지 않는다 — 창마다 데이터 초기화·알림 작업이 중복으로 돌면 안 된다.
 * 넘겨받은 스냅샷을 **한 번** 가져와 도구를 그린 다음에야 "준비 끝"을 알린다.
 * 그 신호를 받아야 보낸 쪽이 실행을 놓기 때문에, 이 순서를 바꾸면 실행이 사라진다.
 *
 * 설계: docs/02-design/features/tool-popup.design.md §4
 */
export function ToolPopupApp(): JSX.Element {
  const query = useMemo(() => parseToolPopupQuery(window.location.search), []);
  useThemeApplier();

  const loadSettings = useSettingsStore((s) => s.load);
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  useEffect(() => {
    if (!settingsLoaded) void loadSettings();
  }, [settingsLoaded, loadSettings]);

  const [phase, setPhase] = useState<'loading' | 'ready' | 'rejected'>(
    query === null ? 'rejected' : 'loading',
  );
  const [envelope, setEnvelope] = useState<ToolPopupSnapshotEnvelope | null>(null);

  // 스냅샷 인계는 한 번만. 두 번 가져가면 같은 실행이 둘로 갈라진다.
  useEffect(() => {
    if (query === null) return;
    let cancelled = false;
    const bridge = getToolPopupBridge();
    if (query.handoffId === null) {
      setPhase('ready');
      return;
    }
    void bridge
      .claimHandoff(query.handoffId)
      .then((claimed) => {
        if (cancelled) return;
        setEnvelope(asSnapshotEnvelope(claimed?.snapshot));
      })
      .catch(() => {
        // 스냅샷을 못 받아도 빈 상태로는 쓸 수 있게 한다 — 로딩에 갇히는 것이 더 나쁘다.
      })
      .finally(() => {
        if (!cancelled) setPhase('ready');
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  if (query === null) {
    return <ToolPopupRejected />;
  }
  if (phase === 'loading') {
    return <ToolPopupLoading />;
  }
  return <ToolPopupSurface toolId={query.toolId} envelope={envelope} />;
}

function ToolPopupRejected(): JSX.Element {
  return (
    <div className="h-screen flex items-center justify-center bg-sp-bg p-8">
      <p className="text-sp-muted text-sm text-center">
        이 창에서 열 수 없는 도구입니다. 창을 닫고 쌤도구에서 다시 열어 주세요.
      </p>
    </div>
  );
}

function ToolPopupLoading(): JSX.Element {
  return (
    <div className="h-screen flex items-center justify-center bg-sp-bg">
      <p className="text-sp-muted text-sm">도구를 옮기는 중…</p>
    </div>
  );
}

interface ToolPopupSurfaceProps {
  readonly toolId: PopupToolId;
  readonly envelope: ToolPopupSnapshotEnvelope | null;
}

function ToolPopupSurface({ toolId, envelope }: ToolPopupSurfaceProps): JSX.Element {
  const registry = useMemo(() => new ToolPopupSlotRegistry(), []);
  const bridge = useMemo(() => getToolPopupBridge(), []);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [busy, setBusy] = useState(false);
  // 연속 클릭 가드는 ref 로 둔다 — 상태 갱신은 비동기라 두 번 통과한다(과거 실사고).
  const leavingRef = useRef(false);

  // 도구가 그려진 다음에 "준비 끝"을 알린다.
  useEffect(() => {
    void bridge.markReady();
  }, [bridge]);

  const returnToMain = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setBusy(true);
    const captured = registry.capture(Date.now());
    void bridge.returnToMain(captured, captured.capturedAt).then((ok) => {
      if (ok) return;
      // 돌려보내지 못했으면 이 창에서 계속 쓸 수 있게 되살린다.
      leavingRef.current = false;
      setBusy(false);
      registry.resume(captured);
    });
  }, [bridge, registry]);

  const closePopup = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    // 닫기는 이 실행의 종료다. 돌고 있는 것을 먼저 멈춰 알람이 남지 않게 한다.
    registry.capture(Date.now());
    void bridge.close();
  }, [bridge, registry]);

  const toggleAlwaysOnTop = useCallback(() => {
    const next = !alwaysOnTop;
    setAlwaysOnTop(next);
    void bridge.setAlwaysOnTop(null, next);
  }, [alwaysOnTop, bridge]);

  const session = useMemo<ToolPopupSessionValue>(
    () => ({
      placement: 'popup',
      toolId,
      initialSnapshot: envelope,
      registerSlot: (slotId, handlers) => registry.register(slotId, handlers),
      moveToPopup: () => {},
      returnToMain,
      closePopup,
      alwaysOnTop,
      toggleAlwaysOnTop,
      supportsAlwaysOnTop: bridge.supportsAlwaysOnTop,
      busy,
    }),
    [
      toolId,
      envelope,
      registry,
      returnToMain,
      closePopup,
      alwaysOnTop,
      toggleAlwaysOnTop,
      bridge,
      busy,
    ],
  );

  const ToolComponent = TOOL_REGISTRY[toolId].component;

  return (
    <ToolPopupSessionContext.Provider value={session}>
      <div className="h-screen bg-sp-bg text-sp-text p-4 overflow-hidden">
        <ToolComponent onBack={returnToMain} isFullscreen={false} />
      </div>
    </ToolPopupSessionContext.Provider>
  );
}
