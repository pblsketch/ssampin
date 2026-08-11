/**
 * "지금 몇 학기인가"를 화면에 답해 주는 단일 창구.
 *
 * 이 훅을 쓰지 않고 화면에서 월을 직접 세면 앱 안에 학기 규칙이 두 벌 생기고, 하필 답이 갈리면
 * 안 되는 경계(8월 개학·9월 초 개학·1~2월)에서만 화면끼리 다른 말을 한다. 실제로 그런 사본이
 * 일정 학기뷰와 "이번 학기" 필터에 각각 있었다.
 *
 * 판정 규칙 자체는 `@domain/rules/schoolTermStart`에 있다(개학일 우선·낡은 등록 무시·마감 존중).
 */

import { useMemo } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import {
  resolveCurrentTerm,
  resolveTermStartDate,
  toLocalIsoDate,
} from '@domain/rules/schoolTermStart';

/**
 * 오늘 날짜를 'YYYY-MM-DD'로 — 렌더마다 계산하지만 값은 하루 동안 같으므로
 * 이 문자열을 의존성으로 쓰면 useMemo가 헛돌지 않고 자정에 자연스럽게 넘어간다.
 */
function useTodayIso(): string {
  return toLocalIsoDate(new Date());
}

/** 화면에 보여줄 현재 학기 라벨('2026-2'). */
export function useCurrentTerm(): string {
  const termStartDates = useSettingsStore((s) => s.settings.termStartDates);
  const currentTerm = useSettingsStore((s) => s.settings.currentTerm);
  const todayIso = useTodayIso();

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

/**
 * "이번 학기" 기간 필터의 시작일('YYYY-MM-DD') — 개학일을 등록했으면 그 날, 아니면 명목 시작일.
 *
 * 항상 유효한 날짜를 돌려준다(호출처마다 null 처리를 반복하지 않게 한다). resolveCurrentTerm은
 * 언제나 올바른 학기 라벨을 내므로 폴백은 실제로는 도달하지 않는 안전망이다.
 */
export function useCurrentTermStartIso(): string {
  const termStartDates = useSettingsStore((s) => s.settings.termStartDates);
  const term = useCurrentTerm();
  const todayIso = useTodayIso();

  return useMemo(
    () => resolveTermStartDate(term, termStartDates) ?? todayIso,
    [term, termStartDates, todayIso],
  );
}

/** "이번 학기" 시작을 Date로 — Date 범위를 받는 기존 필터에 그대로 끼운다. */
export function useCurrentTermStartDateObject(): Date {
  const startIso = useCurrentTermStartIso();
  return useMemo(() => new Date(`${startIso}T00:00:00`), [startIso]);
}
