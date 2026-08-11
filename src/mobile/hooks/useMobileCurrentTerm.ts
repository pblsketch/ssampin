/**
 * 모바일에서 "지금 몇 학기인가"를 답하는 창구 — 데스크톱 `useCurrentTerm`의 짝이다.
 *
 * 판정 규칙은 두 앱이 같은 도메인 모듈(`@domain/rules/schoolTermStart`)을 쓴다. 규칙을 여기서
 * 다시 구현하면 같은 선생님의 PC와 폰이 "이번 학기" 통계에 서로 다른 답을 낸다.
 *
 * 개학일은 **데스크톱에서만 편집**하고 모바일은 동기화로 받아 읽기만 한다.
 */

import { useMemo } from 'react';
import { useMobileSettingsStore } from '@mobile/stores/useMobileSettingsStore';
import {
  resolveCurrentTerm,
  resolveTermStartDate,
  toLocalIsoDate,
} from '@domain/rules/schoolTermStart';

/** 화면에 보여줄 현재 학기 라벨('2026-2'). */
export function useMobileCurrentTerm(): string {
  const termStartDates = useMobileSettingsStore((s) => s.settings.termStartDates);
  const currentTerm = useMobileSettingsStore((s) => s.settings.currentTerm);
  const todayIso = toLocalIsoDate(new Date());

  return useMemo(
    () =>
      resolveCurrentTerm({
        today: new Date(`${todayIso}T00:00:00`),
        termStartDates,
        currentTerm,
      }),
    [todayIso, termStartDates, currentTerm],
  );
}

/** "이번 학기" 기간 필터의 시작일('YYYY-MM-DD') — 항상 유효한 값. */
export function useMobileCurrentTermStartIso(): string {
  const termStartDates = useMobileSettingsStore((s) => s.settings.termStartDates);
  const term = useMobileCurrentTerm();
  const todayIso = toLocalIsoDate(new Date());

  return useMemo(
    () => resolveTermStartDate(term, termStartDates) ?? todayIso,
    [term, termStartDates, todayIso],
  );
}
