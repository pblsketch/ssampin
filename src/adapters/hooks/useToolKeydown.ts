import { useContext, useEffect } from 'react';
import type { DependencyList } from 'react';
import { DualToolContext } from '@adapters/components/Tools/DualToolContext';

interface UseToolKeydownOptions {
  /** 비활성 슬롯에서도 반드시 실행 (전역 단축키 예외 케이스). 기본 false. */
  allowInactive?: boolean;
  /** capture phase 등록. 기본 false. */
  capture?: boolean;
}

/**
 * Tool 컴포넌트가 `window` keydown에 반응할 때 사용하는 공통 훅.
 * - 단일 모드(Context 부재)에서는 항상 handler 실행
 * - 듀얼 모드에서는 `active === true` 일 때만 실행 (allowInactive 미사용 시)
 *
 * 설계 근거: docs/02-design/features/dual-tool-view.design.md §5.7
 * 마이그레이션 대상: ToolLayout, ToolTimer, Timer/*, ToolQRCode, ToolWorkSymbols, TeacherControlPanel
 */
export function useToolKeydown(
  handler: (e: KeyboardEvent) => void,
  deps: DependencyList,
  options: UseToolKeydownOptions = {},
): void {
  const ctx = useContext(DualToolContext);
  const active = ctx?.active ?? true;
  const allowInactive = options.allowInactive ?? false;
  const capture = options.capture ?? false;

  useEffect(() => {
    const wrapped = (e: KeyboardEvent) => {
      if (ctx !== null && !active && !allowInactive) return;
      handler(e);
    };
    window.addEventListener('keydown', wrapped, capture);
    return () => {
      window.removeEventListener('keydown', wrapped, capture);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, active, allowInactive, capture, ctx]);
}
