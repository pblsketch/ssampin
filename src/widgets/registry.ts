import type { WidgetDefinition } from './types';

// 위젯 아이템 import
import { WeeklyTimetable } from './items/WeeklyTimetable';
import { TodayClass } from './items/TodayClass';
import { ClassTimetable } from './items/ClassTimetable';
import { Seating } from './items/Seating';
import { Meal } from './items/Meal';
import { Events } from './items/Events';
import { Memo } from './items/Memo';
import { StudentRecords } from './items/StudentRecords';
import { TodoWidget } from './items/TodoWidget';

/**
 * 전체 위젯 정의 레지스트리
 * 기존 대시보드 컴포넌트를 래핑한 아이템 + 신규 위젯
 */
export const WIDGET_DEFINITIONS: readonly WidgetDefinition[] = [
  // ─── 시간표 카테고리 ───
  {
    id: 'weekly-timetable',
    name: '교사 주간시간표',
    icon: '📅',
    description: '월~금 교사 시간표를 한눈에 확인합니다',
    category: 'timetable',
    defaultSize: { w: 2, h: 1 },
    minSize: { w: 1, h: 1 },
    availableFor: {
      schoolLevel: ['middle', 'high'],
      role: ['homeroom', 'subject', 'admin'],
    },
    component: WeeklyTimetable,
  },
  {
    id: 'today-class',
    name: '오늘 수업',
    icon: '🕐',
    description: '오늘의 수업 시간표를 확인합니다',
    category: 'timetable',
    defaultSize: { w: 1, h: 1 },
    minSize: { w: 1, h: 1 },
    availableFor: {
      schoolLevel: ['elementary', 'middle', 'high'],
      role: ['homeroom', 'subject', 'admin'],
    },
    component: TodayClass,
  },
  {
    id: 'class-timetable',
    name: '학급 시간표',
    icon: '📋',
    description: '학급 주간 시간표를 확인합니다',
    category: 'timetable',
    defaultSize: { w: 2, h: 1 },
    minSize: { w: 1, h: 1 },
    availableFor: {
      schoolLevel: ['elementary'],
      role: ['homeroom'],
    },
    component: ClassTimetable,
  },

  // ─── 학급 카테고리 ───
  {
    id: 'seating',
    name: '자리배치',
    icon: '💺',
    description: '학급 자리배치를 미리봅니다',
    category: 'class',
    defaultSize: { w: 1, h: 1 },
    minSize: { w: 1, h: 1 },
    availableFor: {
      schoolLevel: ['elementary', 'middle', 'high'],
      role: ['homeroom'],
    },
    component: Seating,
  },
  {
    id: 'student-records',
    name: '담임 메모장',
    icon: '👩‍🏫',
    description: '오늘의 학생 기록을 확인합니다',
    category: 'class',
    defaultSize: { w: 1, h: 1 },
    minSize: { w: 1, h: 1 },
    availableFor: {
      schoolLevel: ['elementary', 'middle', 'high'],
      role: ['homeroom'],
    },
    component: StudentRecords,
  },

  // ─── 정보 카테고리 ───
  {
    id: 'meal',
    name: '급식 메뉴',
    icon: '🍱',
    description: '오늘의 급식 메뉴를 확인합니다',
    category: 'info',
    defaultSize: { w: 1, h: 1 },
    minSize: { w: 1, h: 1 },
    availableFor: {
      schoolLevel: ['elementary', 'middle', 'high'],
      role: ['homeroom', 'subject', 'admin'],
    },
    component: Meal,
  },
  {
    id: 'events',
    name: '다가오는 일정',
    icon: '📆',
    description: '앞으로의 일정과 D-Day를 확인합니다',
    category: 'info',
    defaultSize: { w: 1, h: 1 },
    minSize: { w: 1, h: 1 },
    availableFor: {
      schoolLevel: ['elementary', 'middle', 'high'],
      role: ['homeroom', 'subject', 'admin'],
    },
    component: Events,
  },
  {
    id: 'memo',
    name: '메모',
    icon: '📝',
    description: '최근 메모를 미리봅니다',
    category: 'info',
    defaultSize: { w: 1, h: 1 },
    minSize: { w: 1, h: 1 },
    availableFor: {
      schoolLevel: ['elementary', 'middle', 'high'],
      role: ['homeroom', 'subject', 'admin'],
    },
    component: Memo,
  },

  // ─── 관리 카테고리 ───
  {
    id: 'todo',
    name: '할 일',
    icon: '✅',
    description: '할 일 목록을 관리합니다',
    category: 'admin',
    defaultSize: { w: 1, h: 1 },
    minSize: { w: 1, h: 1 },
    availableFor: {
      schoolLevel: ['elementary', 'middle', 'high'],
      role: ['homeroom', 'subject', 'admin'],
    },
    component: TodoWidget,
  },
];

/** ID로 위젯 정의 조회 */
export function getWidgetById(id: string): WidgetDefinition | undefined {
  return WIDGET_DEFINITIONS.find((w) => w.id === id);
}

/** 전체 위젯 ID 목록 */
export function getAllWidgetIds(): readonly string[] {
  return WIDGET_DEFINITIONS.map((w) => w.id);
}
