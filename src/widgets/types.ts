import type { ComponentType } from 'react';
import type { SchoolLevel } from '@domain/entities/Settings';

/** 위젯 카테고리 */
export type WidgetCategory = 'timetable' | 'class' | 'admin' | 'info';

/** 교사 역할 */
export type TeacherRole = 'homeroom' | 'subject' | 'admin';

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
