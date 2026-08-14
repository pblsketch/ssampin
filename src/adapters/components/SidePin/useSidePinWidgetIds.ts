/**
 * 옆핀에 올릴 위젯 목록을 **대시보드 설정에서 그대로 가져온다.**
 *
 * 옆핀 전용으로 또 고르게 하지 않는 이유가 있다. 선생님은 이미 대시보드에서 무엇을
 * 볼지 정했다. 같은 것을 두 번 고르게 하면 설정만 늘고, 둘이 어긋나면 "왜 여기만
 * 다르지"를 사람이 맞춰야 한다. 대시보드가 정본이고 옆핀은 그것을 따른다.
 *
 * 올릴 수 없는 위젯을 거르는 일은 여기서 하지 않는다. `selectSidePinWidgets`가
 * 정본이고, 이 훅은 "무엇을 고르셨는지"만 읽어 온다.
 *
 * 다른 창에서 대시보드를 바꾸면 그 즉시 따라간다. 옆핀만 옛 목록을 붙들고 있으면
 * "위젯을 껐는데 옆핀엔 그대로"가 된다. (메모 목록과 같은 이유)
 */
import { useEffect, useState } from 'react';

/** `useDashboardConfig`가 쓰는 저장 키 — 바뀌면 여기도 함께 바꿔야 한다 */
export const DASHBOARD_CONFIG_STORAGE_KEY = 'ssampin-dashboard-config';

interface StoredWidget {
  readonly widgetId?: unknown;
  readonly visible?: unknown;
  readonly order?: unknown;
}

/**
 * 저장된 대시보드 설정에서 **보이는 위젯의 id를 순서대로** 읽는다.
 *
 * 저장된 것이 없으면 빈 목록을 준다. 그러면 옆핀은 올릴 수 있는 위젯 전부를 보여준다 —
 * 대시보드를 아직 손대지 않은 사람에게 빈 칸을 보여주는 것보다 낫다.
 */
export function readDashboardWidgetIds(): readonly string[] {
  try {
    const raw = localStorage.getItem(DASHBOARD_CONFIG_STORAGE_KEY);
    if (raw === null) return [];

    const parsed = JSON.parse(raw) as { widgets?: unknown };
    if (!Array.isArray(parsed.widgets)) return [];

    return (parsed.widgets as StoredWidget[])
      .filter((w) => w.visible === true && typeof w.widgetId === 'string')
      .sort(
        (a, b) =>
          (typeof a.order === 'number' ? a.order : 0) - (typeof b.order === 'number' ? b.order : 0),
      )
      .map((w) => w.widgetId as string);
  } catch {
    // 저장값이 깨져 있어도 옆핀이 죽으면 안 된다. 기본값으로 넘어간다.
    return [];
  }
}

export function useSidePinWidgetIds(): readonly string[] {
  const [ids, setIds] = useState<readonly string[]>(readDashboardWidgetIds);

  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      // key가 null이면 저장소 전체가 지워진 것이라 이때도 다시 읽는다.
      if (event.key !== null && event.key !== DASHBOARD_CONFIG_STORAGE_KEY) return;
      setIds(readDashboardWidgetIds());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return ids;
}
