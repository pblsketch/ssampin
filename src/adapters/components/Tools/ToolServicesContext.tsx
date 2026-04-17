import { createContext } from 'react';

/**
 * 단일 모드에서 ToolLayout이 상위 App.tsx의 공용 기능(병렬 모드 진입 등)에
 * 접근할 수 있도록 하는 Context. Tool 개별 컴포넌트는 이를 알 필요 없다.
 *
 * 설계 근거: docs/02-design/features/dual-tool-view.design.md §5.1, §5.2
 */
export interface ToolServicesValue {
  readonly onRequestDualMode: () => void;
}

export const ToolServicesContext = createContext<ToolServicesValue | null>(null);
