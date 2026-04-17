import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToastStore } from '@adapters/components/common/Toast';
import { useDualToolSession, type DualToolSession, DEFAULT_RATIO, MIN_RATIO, MAX_RATIO } from '@adapters/hooks/useDualToolSession';
import { DualToolSlot, type SlotId } from './DualToolSlot';
import { ResizeDivider } from './ResizeDivider';
import { TOOL_REGISTRY, type DualToolId } from './toolRegistry';

const DUAL_MIN_WIDTH = 1280;
const PRESETS: readonly number[] = [30, 50, 70];

export interface DualToolContainerProps {
  /** 듀얼 진입 직전의 단일 도구(좌측 기본값 힌트). 세션 복원이 우선한다. */
  initialLeftTool?: DualToolId | null;
  /** 듀얼 모드 종료 콜백. remainingTool이 null이면 도구 그리드로, 아니면 해당 단일 도구로 복귀하도록 상위에서 처리한다. */
  onExit: (remainingTool: DualToolId | null) => void;
}

/**
 * 듀얼 모드 셸 — 두 슬롯 · 분할 비율 · 활성 슬롯 · 폴백 감지를 총괄한다.
 *
 * 설계 근거: docs/02-design/features/dual-tool-view.design.md §4, §5.8
 */
export function DualToolContainer({ initialLeftTool, onExit }: DualToolContainerProps) {
  const [session, updateSession, { wasRestored }] = useDualToolSession({
    initialLeftTool: initialLeftTool ?? null,
  });

  const [activeSlot, setActiveSlot] = useState<SlotId>(() => {
    // 우측이 비어있으면 우측 활성(도구 선택 유도), 아니면 좌측.
    return session.rightTool === null ? 'right' : 'left';
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidthPx, setContainerWidthPx] = useState(0);
  const showToast = useToastStore((s) => s.show);

  // 복원 Toast (F5 후)
  const restoredToastShown = useRef(false);
  useEffect(() => {
    if (wasRestored && !restoredToastShown.current) {
      restoredToastShown.current = true;
      showToast('이전 병렬 구성을 복원했습니다', 'info');
    }
  }, [wasRestored, showToast]);

  // 컨테이너 폭 추적 (ResizeDivider px↔% 변환용)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidthPx(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Viewport shrink → 단일 모드 폴백 (undo 가능)
  useEffect(() => {
    const handler = () => {
      if (window.innerWidth >= DUAL_MIN_WIDTH) return;
      // 스냅샷 후 단일 모드로 전환
      const snapshot: DualToolSession = { ...session };
      const remaining = resolveRemainingTool(session, activeSlot);
      onExit(remaining);
      showToast('화면이 좁아졌습니다 · 단일 모드로 전환', 'info', {
        label: '복원',
        onClick: () => {
          if (window.innerWidth < DUAL_MIN_WIDTH) {
            showToast('화면을 1280px 이상으로 넓힌 뒤 다시 시도하세요', 'error');
            return;
          }
          updateSession(snapshot);
          // 상위(App.tsx) navigate 필요 — 복원 정보를 세션에 남겼으므로 동일 경로 재진입으로 충분
          // 부모에서 dual-tool-view로 재진입 시 세션 복원 플로우가 동작한다.
        },
      });
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [session, activeSlot, onExit, showToast, updateSession]);

  // 프리셋 매칭 (드래그 중엔 일치 없음)
  const draggingRef = useRef(false);
  const matchedPreset = !draggingRef.current && PRESETS.includes(session.splitRatio) ? session.splitRatio : null;

  const setPreset = useCallback(
    (value: number) => {
      if (draggingRef.current) return;
      updateSession({ splitRatio: value });
    },
    [updateSession],
  );

  const setRatioLive = useCallback(
    (value: number) => {
      draggingRef.current = true;
      updateSession({ splitRatio: value });
    },
    [updateSession],
  );

  const endRatioDrag = useCallback(() => {
    draggingRef.current = false;
  }, []);

  const chooseTool = useCallback(
    (slot: SlotId, id: DualToolId) => {
      if (slot === 'left') {
        if (session.rightTool === id) {
          // 같은 도구 선택 → 좌우 스왑 효과
          updateSession({ leftTool: id, rightTool: session.leftTool });
        } else {
          updateSession({ leftTool: id });
        }
      } else {
        if (session.leftTool === id) {
          updateSession({ leftTool: session.rightTool, rightTool: id });
        } else {
          updateSession({ rightTool: id });
        }
      }
      setActiveSlot(slot);
    },
    [session.leftTool, session.rightTool, updateSession],
  );

  const swapSlots = useCallback(() => {
    updateSession({ leftTool: session.rightTool, rightTool: session.leftTool });
  }, [session.leftTool, session.rightTool, updateSession]);

  const closeSlot = useCallback(
    (slot: SlotId) => {
      const closedTool = slot === 'left' ? session.leftTool : session.rightTool;
      const keptTool = slot === 'left' ? session.rightTool : session.leftTool;
      const snapshot: DualToolSession = { ...session };

      if (keptTool === null) {
        // 둘 다 비어있는 상황 — 그냥 종료
        onExit(null);
        return;
      }

      // 남은 도구로 단일 모드 복귀
      onExit(keptTool);
      const closedName = closedTool !== null ? TOOL_REGISTRY[closedTool].name : '빈 슬롯';
      showToast(`${closedName}(이)가 닫혔습니다`, 'info', {
        label: '복원',
        onClick: () => {
          updateSession(snapshot);
        },
      });
    },
    [session, onExit, showToast, updateSession],
  );

  const requestToolChange = useCallback(
    (slot: SlotId) => {
      // 슬롯의 현재 도구를 null 로 되돌려 Picker 표시
      if (slot === 'left') updateSession({ leftTool: null });
      else updateSession({ rightTool: null });
      setActiveSlot(slot);
    },
    [updateSession],
  );

  const activateSlot = useCallback((slot: SlotId) => setActiveSlot(slot), []);

  const leftWidth = session.splitRatio;
  const rightWidth = 100 - session.splitRatio;

  const leftExclude = useMemo<readonly DualToolId[]>(
    () => (session.rightTool !== null ? [session.rightTool] : []),
    [session.rightTool],
  );
  const rightExclude = useMemo<readonly DualToolId[]>(
    () => (session.leftTool !== null ? [session.leftTool] : []),
    [session.leftTool],
  );

  return (
    <div className="h-full flex flex-col">
      {/* 컨테이너 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onExit(null)}
            className="flex items-center gap-1.5 text-sp-muted hover:text-sp-text transition-colors text-sm"
            title="도구 그리드로 돌아가기 (Esc 종료)"
          >
            <span className="material-symbols-outlined text-icon-md">arrow_back</span>
            <span>쌤도구</span>
          </button>
          <div className="w-px h-5 bg-sp-border" />
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-sp-accent/20 text-sp-accent">
            <span className="material-symbols-outlined text-icon-sm mr-0.5">splitscreen</span>
            병렬 모드
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* 프리셋 */}
          <div className="flex items-center gap-0.5 bg-sp-text/5 rounded-lg p-0.5">
            {PRESETS.map((p) => {
              const active = matchedPreset === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPreset(p)}
                  aria-pressed={active}
                  className={`px-2 py-1 text-xs rounded-md transition-colors ${
                    active
                      ? 'bg-sp-accent/20 text-sp-accent font-semibold'
                      : 'text-sp-muted hover:text-sp-text hover:bg-sp-text/5'
                  }`}
                  title={`좌:${p}% / 우:${100 - p}%`}
                >
                  {p}:{100 - p}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => onExit(null)}
            className="p-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all"
            title="병렬 모드 종료"
            aria-label="병렬 모드 종료"
          >
            <span className="material-symbols-outlined text-icon-lg">close</span>
          </button>
        </div>
      </div>

      {/* 슬롯 영역 */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 flex relative"
      >
        <DualToolSlot
          slotId="left"
          tool={session.leftTool}
          isActive={activeSlot === 'left'}
          onActivate={() => activateSlot('left')}
          onChangeTool={(id) => chooseTool('left', id)}
          onSwap={swapSlots}
          onClose={() => closeSlot('left')}
          excludeTools={leftExclude}
          oppositeHasTool={session.rightTool !== null}
          widthPercent={leftWidth}
          onRequestToolChange={() => requestToolChange('left')}
        />
        <ResizeDivider
          ratio={session.splitRatio}
          onChange={setRatioLive}
          onChangeEnd={endRatioDrag}
          containerWidthPx={containerWidthPx}
          minRatio={MIN_RATIO}
          maxRatio={MAX_RATIO}
        />
        <DualToolSlot
          slotId="right"
          tool={session.rightTool}
          isActive={activeSlot === 'right'}
          onActivate={() => activateSlot('right')}
          onChangeTool={(id) => chooseTool('right', id)}
          onSwap={swapSlots}
          onClose={() => closeSlot('right')}
          excludeTools={rightExclude}
          oppositeHasTool={session.leftTool !== null}
          widthPercent={rightWidth}
          onRequestToolChange={() => requestToolChange('right')}
        />
      </div>
    </div>
  );
}

function resolveRemainingTool(session: DualToolSession, activeSlot: SlotId): DualToolId | null {
  if (activeSlot === 'left' && session.leftTool !== null) return session.leftTool;
  if (activeSlot === 'right' && session.rightTool !== null) return session.rightTool;
  return session.leftTool ?? session.rightTool ?? null;
}

// 내보내기: 기본 분할 비율 재사용
export { DEFAULT_RATIO };
