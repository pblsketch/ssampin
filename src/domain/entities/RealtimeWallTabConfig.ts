/**
 * v2.0 신규. 보드 안 N개 탭 컨테이너 (외부 참고 도구의 게시판 패턴 정합).
 * 엔티티가 아니라 타입만 — Repository CRUD 없음.
 * layoutMode per tab은 v2.1+ deferred.
 *
 * 외부 의존성 0 (순수 TypeScript — Clean Architecture 도메인 레이어 규칙 준수).
 */

/**
 * 기본 탭 식별자 — 도메인 identity sentinel.
 *
 * 마이그레이션·normalizer가 default 탭을 주입할 때, v1.x 카드(tabId 없음)를
 * 백필할 때, infrastructure 가 fallback 처리할 때 모두 이 상수를 참조한다.
 *
 * UI 문자열(예: '전체')은 어댑터 레이어(`realtimeWallConstants.ts`)에 분리되어 있다.
 * 이 파일은 "외부 의존성 0" 불변식을 유지하기 위해 Korean UI 문자열을 포함하지 않는다.
 */
export const DEFAULT_TAB_ID = 'default' as const;

/**
 * 탭 접근 권한.
 *
 * - `'all'`          : 모든 학생이 카드를 읽고 쓸 수 있음 (기본값)
 * - `'teacher-only'` : 교사만 접근 가능 (학생 wall-state에서 제외)
 * - `'role-gated'`   : 역할 기반 접근 (v2.1+ 구체화 예정, Q1 DEFERRED)
 */
export type RealtimeWallTabPermission = 'all' | 'teacher-only' | 'role-gated';

/**
 * 보드 안 단일 탭의 메타데이터.
 *
 * 탭은 엔티티가 아니라 경량 타입으로 관리한다 (Option A 거절 이유:
 * 40+ flat-array consumer 동시 마이그레이션 부담, FR에서 per-tab layoutMode 미요구).
 * 탭 CRUD는 `realtimeWallRules.ts`의 validator를 통해 최대 8개 cap 강제.
 */
export interface RealtimeWallTabConfig {
  readonly id: string;
  readonly title: string;
  readonly permission: RealtimeWallTabPermission;
  readonly order: number;
}
