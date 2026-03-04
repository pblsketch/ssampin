import type { WidgetCategory } from './types';

/** 카테고리 한국어 라벨 */
export const CATEGORY_LABELS: Record<WidgetCategory, string> = {
  timetable: '시간표',
  class: '학급',
  info: '정보',
  admin: '관리',
};

/** 카테고리 표시 순서 */
export const CATEGORY_ORDER: WidgetCategory[] = ['timetable', 'class', 'info', 'admin'];
