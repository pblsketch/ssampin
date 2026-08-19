/**
 * "이번 학기는 언제부터 언제까지인가"를 화면에 답해 주는 단일 창구.
 *
 * 시작일은 이미 `useCurrentTermStartIso`가 답하고 있다. 여기서 더하는 것은 **끝**이다.
 *
 * 끝은 앱이 스스로 알 수 없다(ADR-037 — 방학 날짜는 학교마다 다르다). 그래서 시작일과 똑같이
 * **학교가 알려준 값만** 쓴다. 등록 전에는 `endIso`가 `null`이고, 그때 화면은 차시 숫자를
 * 보여 주지 않고 종료일을 묻는다. 앱이 임의의 날짜를 채워 넣고 그 위에서 숫자를 만들지 않는다.
 */

import { useMemo } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useCurrentTerm, useCurrentTermStartIso } from './useCurrentTerm';

export interface TermRange {
  /** 학기 라벨('2026-2'). */
  readonly term: string;
  /** 학기 시작일 'YYYY-MM-DD'. */
  readonly startIso: string;
  /** 학기 종료일 'YYYY-MM-DD'. **아직 확인받지 못했으면 `null`.** */
  readonly endIso: string | null;
  /** 시작·끝이 모두 있어 구간 계산이 가능한가. */
  readonly isComplete: boolean;
}

export function useTermRange(): TermRange {
  const term = useCurrentTerm();
  const startIso = useCurrentTermStartIso();
  const termEndDates = useSettingsStore((s) => s.settings.termEndDates);

  return useMemo(() => {
    const endIso = termEndDates?.[term] ?? null;
    return {
      term,
      startIso,
      endIso,
      isComplete: endIso !== null && startIso !== '' && startIso <= endIso,
    };
  }, [term, startIso, termEndDates]);
}
