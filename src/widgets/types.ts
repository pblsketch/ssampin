import type { ComponentType } from 'react';
import type { SchoolLevel } from '@domain/entities/Settings';

/** 위젯 카테고리 */
export type WidgetCategory = 'timetable' | 'class' | 'admin' | 'info';

/** 교사 역할 */
export type TeacherRole = 'homeroom' | 'subject' | 'admin';

/**
 * 옆핀에서 위젯을 눌렀을 때 열 수 있는 화면.
 *
 * 아무 데나 보낼 수 있게 두지 않는 이유가 있다. 옆핀은 늘 떠 있는 좁은 창이라
 * 여기서 시작된 이동이 예상 밖의 화면을 띄우면 사용자는 무엇을 눌러 그렇게 됐는지
 * 되짚기 어렵다. 갈 수 있는 곳을 미리 정해 둔다.
 */
export const SIDE_PIN_NAVIGATION_TARGETS = [
  'timetable',
  'schedule',
  'meal',
  'todo',
  'bookmarks',
  'tools',
  'class-management',
] as const;

export type SidePinNavigationTarget = (typeof SIDE_PIN_NAVIGATION_TARGETS)[number];

/**
 * 이 위젯을 옆핀에 올릴 수 있는가.
 *
 * **적지 않으면 올리지 않는다.** 새 위젯을 만들면서 이 항목을 잊었을 때
 * 조용히 옆핀에 나타나는 편보다, 조용히 빠지는 편이 안전하다 — 옆핀은 늘 떠 있어서
 * 개인정보가 담긴 위젯이 실수로 올라가면 화면 공유나 옆자리 눈에 그대로 노출된다.
 *
 * 올릴 수 없다면 **이유를 한국어로** 적는다. 설정에서 "왜 이 위젯은 못 고르지?"에
 * 답하기 위해서다. 이유 없이 목록에서 빼면 사용자는 앱이 고장 난 줄 안다.
 */
export type SidePinWidgetMetadata =
  | { readonly eligible: true; readonly navigationTarget: SidePinNavigationTarget }
  | { readonly eligible: false; readonly unavailableReason: string };

/** 위젯 정의 (시스템 레지스트리용) */
export interface WidgetDefinition {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly description: string;
  readonly category: WidgetCategory;
  readonly defaultSize: { w: number; h: number };
  readonly minSize: { w: number; h: number };
  readonly availableFor: {
    schoolLevel: readonly SchoolLevel[];
    role: readonly TeacherRole[];
  };
  readonly component: ComponentType;
  /** 클릭 시 이동할 페이지 ID */
  readonly navigateTo?: string;
  /** "더 보기" 링크 텍스트 */
  readonly navigateLabel?: string;
  /** 모달 크기 힌트 — 생략 시 'md' 기본값 */
  readonly modalSize?: 'sm' | 'md' | 'lg' | 'fullscreen';
  /** 모달 동작 모드 */
  readonly modalMode?: 'view' | 'edit' | 'view+edit' | 'expanded' | 'large-only';
  /** 위젯 카드 안에서 인라인 편집이 가능한 경우 true */
  readonly inplaceCapable?: boolean;
  /** 모달을 닫으려면 명시적 취소/저장 버튼이 필요한 경우 true */
  readonly requiresExplicitCancel?: boolean;
  /** 옆핀에 올릴 수 있는가. 적지 않으면 올리지 않는다 */
  readonly sidePin?: SidePinWidgetMetadata;
}

/** 사용자 위젯 인스턴스 설정 */
export interface WidgetInstance {
  widgetId: string;
  visible: boolean;
  order: number;
  colSpan: 1 | 2 | 3 | 4;
  rowSpan: number; // 세로 크기 (행 단위, 1~12)
}

/** 사용자 대시보드 설정 (저장용) */
export interface DashboardConfig {
  widgets: WidgetInstance[];
  lastModified: string;
}

/** 프리셋 키 */
export type PresetKey =
  | 'elementary-homeroom'
  | 'elementary-subject'
  | 'middle-homeroom'
  | 'middle-subject'
  | 'high-homeroom'
  | 'high-subject'
  | 'admin'
  | 'custom-homeroom'
  | 'custom-subject';
