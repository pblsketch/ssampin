import type { WidgetDefinition } from './types';

// 위젯 아이템 import
import { WeeklyTimetable } from './items/WeeklyTimetable';
import { TodayClass } from './items/TodayClass';
import { ClassTimetable } from './items/ClassTimetable';
import { Seating } from './items/Seating';
import { TodayProgress } from './items/TodayProgress';
import { Meal } from './items/Meal';
import { Events } from './items/Events';
import { Memo } from './items/Memo';
import { StudentRecords } from './items/StudentRecords';
import { TodoWidget } from './items/TodoWidget';
import { BookmarksWidget } from './items/Bookmarks';
import { DDayCounter } from './items/DDayCounter';
import { SurveyWidget } from './items/SurveyWidget';
import { ConsultationWidget } from './items/ConsultationWidget';
import { MemoFocus } from './items/MemoFocus';
import { FavoriteTools } from './items/FavoriteTools';
import { MiniCalendar } from './items/MiniCalendar';
import { MessageWidget } from './items/MessageWidget';

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
    defaultSize: { w: 2, h: 5 },
    minSize: { w: 1, h: 2 },
    availableFor: {
      schoolLevel: ['middle', 'high', 'custom'],
      role: ['homeroom', 'subject', 'admin'],
    },
    component: WeeklyTimetable,
    navigateTo: 'timetable',
    navigateLabel: '시간표 전체 보기',
  },
  {
    id: 'today-class',
    name: '오늘 수업',
    icon: '🕐',
    description: '오늘의 수업 시간표를 확인합니다',
    category: 'timetable',
    defaultSize: { w: 1, h: 4 },
    minSize: { w: 1, h: 2 },
    availableFor: {
      schoolLevel: ['elementary', 'middle', 'high', 'custom'],
      role: ['homeroom', 'subject', 'admin'],
    },
    component: TodayClass,
    navigateTo: 'timetable',
    navigateLabel: '시간표 전체 보기',
  },
  {
    id: 'class-timetable',
    name: '학급 시간표',
    icon: '📋',
    description: '학급 주간 시간표를 확인합니다',
    category: 'timetable',
    defaultSize: { w: 2, h: 5 },
    minSize: { w: 1, h: 2 },
    availableFor: {
      schoolLevel: ['elementary', 'custom'],
      role: ['homeroom'],
    },
    component: ClassTimetable,
    navigateTo: 'timetable',
    navigateLabel: '시간표 전체 보기',
  },

  // ─── 학급 카테고리 ───
  {
    id: 'seating',
    name: '자리배치',
    icon: '💺',
    description: '학급 자리배치를 미리봅니다',
    category: 'class',
    defaultSize: { w: 1, h: 4 },
    minSize: { w: 1, h: 2 },
    availableFor: {
      schoolLevel: ['elementary', 'middle', 'high', 'custom'],
      role: ['homeroom'],
    },
    component: Seating,
    navigateTo: 'seating',
    navigateLabel: '자리배치 보기',
  },
  {
    id: 'today-progress',
    name: '오늘 수업 진도',
    icon: '📚',
    description: '오늘 가르칠 학급별 진도 상태를 확인합니다',
    category: 'class',
    defaultSize: { w: 1, h: 5 },
    minSize: { w: 1, h: 2 },
    availableFor: {
      schoolLevel: ['middle', 'high', 'custom'],
      role: ['homeroom', 'subject', 'admin'],
    },
    component: TodayProgress,
    navigateTo: 'class-management',
    navigateLabel: '수업 관리 보기',
  },
  {
    id: 'student-records',
    name: '담임 메모장',
    icon: '👩‍🏫',
    description: '오늘의 학생 기록을 확인합니다',
    category: 'class',
    defaultSize: { w: 1, h: 4 },
    minSize: { w: 1, h: 2 },
    availableFor: {
      schoolLevel: ['elementary', 'middle', 'high', 'custom'],
      role: ['homeroom'],
    },
    component: StudentRecords,
    navigateTo: 'homeroom',
    navigateLabel: '담임 업무 보기',
  },

  // ─── 정보 카테고리 ───
  {
    id: 'message',
    name: '오늘의 한마디',
    icon: '💬',
    description: '오늘의 메시지를 표시하고 편집합니다',
    category: 'info',
    defaultSize: { w: 2, h: 2 },
    minSize: { w: 1, h: 2 },
    availableFor: {
      schoolLevel: ['elementary', 'middle', 'high', 'custom'],
      role: ['homeroom', 'subject', 'admin'],
    },
    component: MessageWidget,
  },
  {
    id: 'meal',
    name: '급식 메뉴',
    icon: '🍱',
    description: '오늘의 급식 메뉴를 확인합니다',
    category: 'info',
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 1, h: 2 },
    availableFor: {
      schoolLevel: ['elementary', 'middle', 'high', 'custom'],
      role: ['homeroom', 'subject', 'admin'],
    },
    component: Meal,
    navigateTo: 'meal',
    navigateLabel: '급식 전체 보기',
  },
  {
    id: 'events',
    name: '다가오는 일정',
    icon: '📆',
    description: '앞으로의 일정과 D-Day를 확인합니다',
    category: 'info',
    defaultSize: { w: 1, h: 3 },
    minSize: { w: 1, h: 2 },
    availableFor: {
      schoolLevel: ['elementary', 'middle', 'high', 'custom'],
      role: ['homeroom', 'subject', 'admin'],
    },
    component: Events,
    navigateTo: 'schedule',
    navigateLabel: '일정 전체 보기',
  },
  {
    id: 'mini-calendar',
    name: '미니 캘린더',
    icon: '📅',
    description: '월간 달력으로 일정을 한눈에 확인합니다',
    category: 'admin',
    defaultSize: { w: 1, h: 4 },
    minSize: { w: 1, h: 3 },
    availableFor: {
      schoolLevel: ['elementary', 'middle', 'high', 'custom'],
      role: ['homeroom', 'subject', 'admin'],
    },
    component: MiniCalendar,
    navigateTo: 'schedule',
    navigateLabel: '일정 전체 보기',
  },
  {
    id: 'memo',
    name: '메모',
    icon: '📝',
    description: '최근 메모를 미리봅니다',
    category: 'info',
    defaultSize: { w: 1, h: 5 },
    minSize: { w: 1, h: 2 },
    availableFor: {
      schoolLevel: ['elementary', 'middle', 'high', 'custom'],
      role: ['homeroom', 'subject', 'admin'],
    },
    component: Memo,
    navigateTo: 'memo',
    navigateLabel: '메모 전체 보기',
  },
  {
    id: 'memo-focus',
    name: '메모 (전체 보기)',
    icon: '📄',
    description: '메모 하나를 대시보드 전체에 펼쳐 봅니다',
    category: 'info',
    defaultSize: { w: 4, h: 6 },
    minSize: { w: 2, h: 3 },
    availableFor: {
      schoolLevel: ['elementary', 'middle', 'high', 'custom'],
      role: ['homeroom', 'subject', 'admin'],
    },
    component: MemoFocus,
    navigateTo: 'memo',
    navigateLabel: '메모장 전체 보기',
  },

  // ─── 관리 카테고리 ───
  {
    id: 'todo',
    name: '할 일',
    icon: '✅',
    description: '할 일 목록을 관리합니다',
    category: 'admin',
    defaultSize: { w: 1, h: 3 },
    minSize: { w: 1, h: 2 },
    availableFor: {
      schoolLevel: ['elementary', 'middle', 'high', 'custom'],
      role: ['homeroom', 'subject', 'admin'],
    },
    component: TodoWidget,
    navigateTo: 'todo',
    navigateLabel: '할 일 전체 보기',
  },

  // ─── D-Day 카운터 ───
  {
    id: 'dday-counter',
    name: 'D-Day 카운터',
    icon: '🎯',
    description: '중요한 날까지 남은 일수를 확인합니다',
    category: 'info',
    defaultSize: { w: 1, h: 3 },
    minSize: { w: 1, h: 2 },
    availableFor: {
      schoolLevel: ['elementary', 'middle', 'high', 'custom'],
      role: ['homeroom', 'subject', 'admin'],
    },
    component: DDayCounter,
  },

  // ─── 설문/체크리스트 ───
  {
    id: 'survey',
    name: '설문/체크리스트',
    icon: '📋',
    description: '진행 중인 설문/체크리스트 현황을 확인합니다',
    category: 'class',
    defaultSize: { w: 1, h: 3 },
    minSize: { w: 1, h: 2 },
    availableFor: {
      schoolLevel: ['elementary', 'middle', 'high', 'custom'],
      role: ['homeroom'],
    },
    component: SurveyWidget,
    navigateTo: 'homeroom',
    navigateLabel: '설문 탭 보기',
  },

  // ─── 상담 예약 ───
  {
    id: 'consultation',
    name: '상담 예약',
    icon: '📅',
    description: '진행 중인 상담 예약 현황을 확인합니다',
    category: 'class',
    defaultSize: { w: 1, h: 3 },
    minSize: { w: 1, h: 2 },
    availableFor: {
      schoolLevel: ['elementary', 'middle', 'high', 'custom'],
      role: ['homeroom'],
    },
    component: ConsultationWidget,
    navigateTo: 'homeroom',
    navigateLabel: '상담 예약 탭 보기',
  },

  // ─── 자주 쓰는 도구 ───
  {
    id: 'favorite-tools',
    name: '자주 쓰는 도구',
    icon: '🛠️',
    description: '자주 사용하는 쌤도구를 바로 실행합니다',
    category: 'info',
    defaultSize: { w: 2, h: 3 },
    minSize: { w: 1, h: 2 },
    availableFor: {
      schoolLevel: ['elementary', 'middle', 'high', 'custom'],
      role: ['homeroom', 'subject', 'admin'],
    },
    component: FavoriteTools,
    navigateTo: 'tools',
    navigateLabel: '쌤도구 전체 보기',
  },

  // ─── 즐겨찾기 카테고리 ───
  {
    id: 'bookmarks',
    name: '즐겨찾기',
    icon: '⭐',
    description: '자주 사용하는 사이트 바로가기',
    category: 'info',
    defaultSize: { w: 1, h: 3 },
    minSize: { w: 1, h: 2 },
    availableFor: {
      schoolLevel: ['elementary', 'middle', 'high', 'custom'],
      role: ['homeroom', 'subject', 'admin'],
    },
    component: BookmarksWidget,
    navigateTo: 'bookmarks',
    navigateLabel: '즐겨찾기 전체 보기',
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
