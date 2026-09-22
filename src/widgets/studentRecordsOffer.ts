/**
 * '학생 빠른 기록' 카드를 한 번 붙여 드리기(ADR-135).
 *
 * 관찰 기록 잔디는 이 카드 안에 산다. 그런데 교과·부장 선생님의 예전 기본 구성에는 이 카드가
 * 없어서, 업데이트해도 잔디를 못 본다 — 수업반 5~6개를 맡은 교과 선생님이 이 기능의 주인공인데도.
 *
 * - 카드가 안 보이고 학생 명렬이 하나 이상 있으면 대시보드 **맨 끝**에 한 번만 붙인다.
 * - 명렬이 없으면 붙이지 않고 처리했다는 표시만 남긴다.
 * - 한 번 처리한 뒤에는 다시 하지 않는다. 선생님이 카드를 빼면 그대로 둔다.
 */
import type { DashboardConfig } from './types';

export const STUDENT_RECORDS_WIDGET_ID = 'student-records';

export function applyStudentRecordsOffer(
  config: DashboardConfig,
  hasRoster: boolean,
): { readonly config: DashboardConfig; readonly changed: boolean } {
  if (config.studentRecordsOffered === true) return { config, changed: false };

  const marked: DashboardConfig = { ...config, studentRecordsOffered: true };
  const current = config.widgets.find((w) => w.widgetId === STUDENT_RECORDS_WIDGET_ID);
  if (!hasRoster || current === undefined || current.visible) {
    return { config: marked, changed: true };
  }

  const lastOrder = Math.max(0, ...config.widgets.map((w) => w.order));
  return {
    config: {
      ...marked,
      widgets: config.widgets.map((w) =>
        w.widgetId === STUDENT_RECORDS_WIDGET_ID
          ? { ...w, visible: true, order: lastOrder + 1 }
          : w,
      ),
      lastModified: new Date().toISOString(),
    },
    changed: true,
  };
}
