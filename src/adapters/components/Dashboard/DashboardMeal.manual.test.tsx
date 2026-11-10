/**
 * @vitest-environment jsdom
 *
 * 나이스에 없는 학교가 급식을 직접 입력해 두고도 위젯에서 못 보던 문제 (2026-10-06 신고).
 *
 * "급식을 수동입력모드로 해놨는데 위젯에서 안 보여 — 설정에서 학교를 선택하라는 말만 나온다."
 * 급식 출처(mealSource)는 저장되지 않는 화면 상태라 위젯 창(별도 창)이나 다시 켠 앱에서는
 * 늘 기본값 'merged' 다. 대시보드 급식 카드는 그 값만 보고 학교가 없으면 안내만 띄웠다.
 * 이제 직접 입력한 급식이 하나라도 있으면 그대로 보여 준다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DashboardMeal } from './DashboardMeal';
import { useMealStore } from '@adapters/stores/useMealStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import type { ManualMealInfo } from '@domain/entities/Meal';

function todayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function clearSchool(): void {
  const settings = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    settings: {
      ...settings,
      mealSchool: undefined,
      neis: { ...settings.neis, atptCode: '', schoolCode: '', schoolName: '' },
    },
  });
}

beforeEach(() => {
  clearSchool();
  useMealStore.setState({ manualMeals: {}, manualLoaded: true, mealSource: 'merged' });
});

afterEach(() => cleanup());

describe('DashboardMeal — 학교 미등록', () => {
  it('직접 입력한 급식도 없으면 학교 등록 안내를 보여 준다', () => {
    render(<DashboardMeal />);

    expect(screen.getByText('설정에서 학교를 등록해주세요')).toBeTruthy();
  });

  // ★ 신고 재현 — 급식 출처가 기본값이어도 직접 입력한 급식은 보여야 한다.
  it('직접 입력한 급식이 있으면 급식 출처가 기본값이어도 그 급식을 보여 준다', () => {
    const meal = {
      date: todayKey(),
      mealType: '중식',
      dishes: [{ name: '직접입력비빔밥', allergens: [] }],
      source: 'manual',
    } as unknown as ManualMealInfo;
    useMealStore.setState({ manualMeals: { [todayKey()]: [meal] } });

    render(<DashboardMeal />);

    expect(screen.queryByText('설정에서 학교를 등록해주세요')).toBeNull();
    expect(screen.getByText(/직접입력비빔밥/)).toBeTruthy();
  });
});
