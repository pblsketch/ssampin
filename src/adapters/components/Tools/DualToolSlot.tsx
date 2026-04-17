import { useMemo, useState } from 'react';
import { DualToolContext, type DualToolContextValue } from './DualToolContext';
import { DualToolPicker } from './DualToolPicker';
import { TOOL_REGISTRY, type DualToolId } from './toolRegistry';

export type SlotId = 'left' | 'right';

export interface DualToolSlotProps {
  slotId: SlotId;
  tool: DualToolId | null;
  isActive: boolean;
  onActivate: () => void;
  onChangeTool: (next: DualToolId) => void;
  onSwap: () => void;
  onClose: () => void;
  /** Picker 목록에서 제외할 도구 id 목록 (보통 반대 슬롯의 도구) */
  excludeTools: readonly DualToolId[];
  /** 반대 슬롯에 도구가 있는지 (Picker 상태에서 swap 가능 여부 판단) */
  oppositeHasTool: boolean;
  widthPercent: number;
  /** 슬롯 닫기 대신 도구 변경을 유도할 때(교체 요청). */
  onRequestToolChange: () => void;
}

/**
 * 듀얼 모드 단일 슬롯. Tool 로드/Picker 상태를 자체 관리하며 DualToolContext를 Provider로 공급한다.
 * Tool 컴포넌트는 내부에서 ToolLayout을 마운트하며, ToolLayout이 Context를 소비해 듀얼 UI를 적용한다.
 *
 * 설계 근거: docs/02-design/features/dual-tool-view.design.md §5.4, §5.5
 */
export function DualToolSlot({
  slotId,
  tool,
  isActive,
  onActivate,
  onChangeTool,
  onSwap,
  onClose,
  excludeTools,
  oppositeHasTool,
  widthPercent,
  onRequestToolChange,
}: DualToolSlotProps) {
  const [slotMaximized, setSlotMaximized] = useState(false);

  const ctxValue = useMemo<DualToolContextValue>(
    () => ({
      dualMode: true,
      active: isActive,
      onSlotClose: onClose,
      onSlotMaximizeToggle: () => setSlotMaximized((v) => !v),
      onSlotSwap: onSwap,
      onRequestToolChange,
    }),
    [isActive, onClose, onSwap, onRequestToolChange],
  );

  const handlePointerDown = () => {
    if (!isActive) onActivate();
  };

  const activeBorder = isActive
    ? 'border-sp-accent/60 ring-1 ring-sp-accent/30'
    : 'border-sp-border';

  const maximizedStyle: React.CSSProperties = slotMaximized
    ? { position: 'absolute', inset: 0, zIndex: 20, width: 'auto' }
    : { width: `${widthPercent}%` };

  return (
    <div
      role="group"
      aria-selected={isActive}
      aria-label={`${slotId === 'left' ? '좌측' : '우측'} 슬롯`}
      onPointerDown={handlePointerDown}
      style={maximizedStyle}
      className={`min-w-0 rounded-xl border ${activeBorder} bg-sp-bg/30 overflow-hidden transition-colors`}
    >
      <div className="h-full p-3">
        {tool === null ? (
          <DualToolPicker
            exclude={excludeTools}
            onSelect={onChangeTool}
            onSwapSlot={onSwap}
            canSwapSlot={oppositeHasTool}
            onCloseSlot={onClose}
            headerHint={slotId === 'left' ? '좌측 슬롯' : '우측 슬롯'}
          />
        ) : (
          <DualToolContext.Provider value={ctxValue}>
            <ToolHost toolId={tool} onBack={onClose} />
          </DualToolContext.Provider>
        )}
      </div>
    </div>
  );
}

interface ToolHostProps {
  toolId: DualToolId;
  onBack: () => void;
}

function ToolHost({ toolId, onBack }: ToolHostProps) {
  const ToolComponent = TOOL_REGISTRY[toolId].component;
  return <ToolComponent onBack={onBack} isFullscreen={false} />;
}
