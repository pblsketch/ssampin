/**
 * @vitest-environment jsdom
 *
 * 옆핀이 대시보드 선택을 따라 읽는지 확인한다.
 *
 * 여기서 지키는 것은 두 가지다.
 * - 선생님이 대시보드에서 고른 순서 그대로 따라간다
 * - 다른 창에서 대시보드를 바꾸면 옆핀도 따라간다 (안 그러면 "껐는데 옆핀엔 그대로")
 */
import { describe, expect, test, beforeEach } from 'vitest';
import { DASHBOARD_CONFIG_STORAGE_KEY, readDashboardWidgetIds } from './useSidePinWidgetIds';

interface StoredWidget {
  widgetId: string;
  visible: boolean;
  order: number;
}

function save(widgets: StoredWidget[]): void {
  localStorage.setItem(DASHBOARD_CONFIG_STORAGE_KEY, JSON.stringify({ widgets }));
}

beforeEach(() => {
  localStorage.clear();
});

describe('대시보드 선택 읽기', () => {
  test('보이는 위젯만, 순서대로 읽는다', () => {
    save([
      { widgetId: '세번째', visible: true, order: 3 },
      { widgetId: '숨김', visible: false, order: 2 },
      { widgetId: '첫번째', visible: true, order: 1 },
    ]);

    expect(readDashboardWidgetIds()).toEqual(['첫번째', '세번째']);
  });

  test('저장된 것이 없으면 빈 목록 — 옆핀은 올릴 수 있는 것 전부를 보여준다', () => {
    // 대시보드를 아직 손대지 않은 사람에게 빈 칸을 보여주는 것보다 낫다.
    expect(readDashboardWidgetIds()).toEqual([]);
  });

  test('저장값이 깨져 있어도 옆핀이 죽지 않는다', () => {
    localStorage.setItem(DASHBOARD_CONFIG_STORAGE_KEY, '{망가진 JSON');

    expect(readDashboardWidgetIds()).toEqual([]);
  });

  test('모양이 다른 값이 섞여 있어도 걸러낸다', () => {
    localStorage.setItem(
      DASHBOARD_CONFIG_STORAGE_KEY,
      JSON.stringify({ widgets: [{ widgetId: 123, visible: true }, { visible: true }, null] }),
    );

    expect(readDashboardWidgetIds()).toEqual([]);
  });

  test('widgets 가 배열이 아니면 빈 목록', () => {
    localStorage.setItem(DASHBOARD_CONFIG_STORAGE_KEY, JSON.stringify({ widgets: '아님' }));

    expect(readDashboardWidgetIds()).toEqual([]);
  });
});
