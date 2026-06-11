/**
 * useRealtimeToolFlag — MultiSurvey v2 Feature Flag Facade (Plan §5.2 D5)
 *
 * 약속한 분기 위치 ≤ 3개 (Phase D에서 일괄 제거):
 *  1. `useMultiSurveyV2Store.loadSessions` V1/V2 분기
 *  2. `MultiSurveyToolEntry.tsx` UI 라우팅
 *  3. `multiSurveyMigration.ts` 첫 실행 트리거
 *
 * 가드: `scripts/check-flag-usage.mjs`가 본 hook 호출 ≤ 3건 강제. 추가 호출은 ADR 필요.
 *
 * 본 facade가 단일 진입점인 이유:
 *  - flag OFF 시 v1 store/UI 그대로 사용 → 즉시 롤백 가능 (Plan §10 ADR)
 *  - 분기 추적성: grep으로 모든 위치 발견 가능
 *  - 마이그레이션 상태(`migrationStatus`)도 합성해 옛 UI ↔ 변환 중 ↔ 새 UI 매끄러운 전환
 */

import { useCallback } from 'react';
import { useMultiSurveyV2Store } from '@adapters/stores/useMultiSurveyV2Store';

export interface RealtimeToolFlag {
  /** v2 도구 활성 여부. false면 v1 store/UI 사용 */
  readonly enabled: boolean;
  /** flag ON/OFF 전환 */
  readonly setEnabled: (v: boolean) => void;
  /** 마이그레이션 진행 상태 — UI에서 "변환 중" 표시용 */
  readonly migrationStatus: 'idle' | 'in_progress' | 'completed' | 'failed';
}

/**
 * 단일 facade hook.
 * 호출 위치: useMultiSurveyV2Store.loadSessions / MultiSurveyToolEntry / multiSurveyMigration
 */
export function useRealtimeToolFlag(): RealtimeToolFlag {
  const enabled = useMultiSurveyV2Store((s) => s.realtimeToolV2Enabled);
  const migrationStatus = useMultiSurveyV2Store((s) => s.migrationStatus);
  const setEnabledInternal = useMultiSurveyV2Store((s) => s.setRealtimeToolV2Enabled);

  const setEnabled = useCallback(
    (v: boolean) => {
      setEnabledInternal(v);
    },
    [setEnabledInternal],
  );

  return {
    enabled,
    setEnabled,
    migrationStatus,
  };
}
