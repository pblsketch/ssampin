import { createContext } from 'react';

/**
 * 듀얼 모드 슬롯의 런타임 메타. ToolLayout과 개별 Tool이 소비한다.
 * 단일 모드에서는 Context value가 `null`이므로 모든 소비 지점은 null-check 후 분기한다.
 * 상세 설계: docs/02-design/features/dual-tool-view.design.md §5.5, §5.7
 */
export interface DualToolContextValue {
  readonly dualMode: true;
  readonly active: boolean;
  readonly onSlotMaximizeToggle: () => void;
  readonly onSlotClose: () => void;
  readonly onSlotSwap: () => void;
  readonly onRequestToolChange: () => void;
}

export const DualToolContext = createContext<DualToolContextValue | null>(null);
