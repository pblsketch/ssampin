import { describe, it, expect } from 'vitest';
import { applyStudentRecordsOffer } from './studentRecordsOffer';
import { WIDGET_PRESETS } from './presets';
import type { DashboardConfig } from './types';

function config(visible: boolean, offered?: boolean): DashboardConfig {
  return {
    widgets: [
      { widgetId: 'meal', visible: true, order: 0, colSpan: 1, rowSpan: 3 },
      { widgetId: 'todo', visible: true, order: 5, colSpan: 1, rowSpan: 3 },
      { widgetId: 'student-records', visible, order: 120, colSpan: 1, rowSpan: 4 },
    ],
    lastModified: '2026-09-01T00:00:00.000Z',
    ...(offered !== undefined ? { studentRecordsOffered: offered } : {}),
  };
}

describe("'학생 빠른 기록' 카드 한 번 붙여 드리기 (ADR-135)", () => {
  it('카드가 안 보이고 명렬이 있으면 맨 끝에 붙이고 표시를 남긴다', () => {
    const { config: next, changed } = applyStudentRecordsOffer(config(false), true);
    expect(changed).toBe(true);
    const card = next.widgets.find((w) => w.widgetId === 'student-records');
    expect(card?.visible).toBe(true);
    expect(card?.order).toBe(121);
    expect(next.studentRecordsOffered).toBe(true);
  });

  it('명렬이 없으면 붙이지 않고 표시만 남긴다', () => {
    const { config: next } = applyStudentRecordsOffer(config(false), false);
    expect(next.widgets.find((w) => w.widgetId === 'student-records')?.visible).toBe(false);
    expect(next.studentRecordsOffered).toBe(true);
  });

  it('한 번 처리한 뒤에는 다시 붙이지 않는다 — 선생님이 뺀 카드는 그대로', () => {
    const { changed, config: next } = applyStudentRecordsOffer(config(false, true), true);
    expect(changed).toBe(false);
    expect(next.widgets.find((w) => w.widgetId === 'student-records')?.visible).toBe(false);
  });

  it('이미 보이는 카드는 순서를 건드리지 않는다', () => {
    const { config: next } = applyStudentRecordsOffer(config(true), true);
    expect(next.widgets.find((w) => w.widgetId === 'student-records')?.order).toBe(120);
    expect(next.studentRecordsOffered).toBe(true);
  });

  it('새로 시작하는 선생님의 모든 기본 구성에 카드가 있다', () => {
    for (const [key, ids] of Object.entries(WIDGET_PRESETS)) {
      expect(ids, key).toContain('student-records');
    }
  });
});
