import type { PageId } from '@adapters/components/Layout/Sidebar';

/**
 * 온보딩 역할 선택용 역할 ID
 * widgets/types.ts의 TeacherRole과 동일한 값이지만 온보딩 전용으로 분리
 */
export type TeacherRoleId = 'homeroom' | 'subject' | 'admin';

/**
 * 역할별 기본 추천 메뉴 매핑
 * - dashboard는 항상 표시이므로 포함하지 않음 (별도 처리)
 * - 각 역할에서 ON으로 추천하는 메뉴 ID 목록
 */
export const ROLE_MENU_MAP: Record<TeacherRoleId, readonly PageId[]> = {
  homeroom: [
    'timetable',
    'schedule',
    'homeroom',
    'memo',
    'todo',
    'class-management',
    'bookmarks',
    'tools',
    'meal',
    'export',
  ],
  subject: [
    'timetable',
    'schedule',
    'memo',
    'todo',
    'class-management',
    'bookmarks',
    'tools',
    'meal',
    'export',
  ],
  admin: [
    'timetable',
    'schedule',
    'memo',
    'todo',
    'bookmarks',
    'meal',
    'export',
  ],
};

/**
 * 메뉴별 한 줄 설명
 * 온보딩 메뉴 선택 UI에서 각 메뉴 아래에 표시
 */
export const MENU_DESCRIPTIONS: Record<string, string> = {
  dashboard: '한눈에 보는 오늘의 교실 현황',
  timetable: '교사/학급 시간표를 확인하고 관리',
  schedule: '학사 일정과 개인 일정 관리',
  homeroom: '출결, 상담, 학생 기록 등 담임 업무',
  memo: '수업 메모, 회의록 등 자유롭게 기록',
  todo: '할 일 목록으로 업무 관리',
  'class-management': '학급별 수업 진도와 평가 관리',
  bookmarks: '자주 사용하는 사이트 바로가기',
  tools: '타이머, 랜덤뽑기, 신호등 등 수업 도구',
  meal: '오늘/이번 주 급식 메뉴 확인',
  export: '데이터를 엑셀/PDF로 내보내기',
};
