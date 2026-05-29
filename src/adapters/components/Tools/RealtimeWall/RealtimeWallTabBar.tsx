import type { RealtimeWallTabConfig } from '@domain/entities/RealtimeWallTabConfig';

/**
 * RealtimeWallTabBar — β-Step8 (학생 variant) / β-Step13 (교사 variant 확장 예정)
 *
 * Plan §2.2 Step 8: 학생 SPA tab strip.
 * Plan §2.2 Step 13: 교사 측 cap 8 표시 + 권한 토글 + 일괄 패널 (G013 에서 확장).
 *
 * 학생 variant (variant='student' / 기본값):
 *   - read-only tab strip — 추가/삭제/이름변경 미노출
 *   - 활성 탭 underline + accent 색상
 *   - `permission='teacher-only'` 는 보드 broadcast 단에서 이미 제외됨 (정합 검증만)
 *
 * 교사 variant (variant='teacher'):
 *   - β-Step13 (G013) 에서 cap 8 표시 + + 버튼 + 권한 토글 + 이름변경 추가 예정
 *   - 본 단계는 학생과 동일 표시 + max cap 표시만 가능 (extensible props)
 *
 * 회귀 보호:
 *   - 회귀 #1 status filter 무관 — 본 컴포넌트는 탭 단위 표시 전용
 *   - 회귀 #11 viewerRole 비대칭 — variant prop 으로 명시 분기 (default 'student')
 *
 * Stateless — 모든 state 는 부모가 보유. props 만으로 렌더.
 */

export interface RealtimeWallTabBarProps {
  /** 노출할 탭 (BroadcastWallState 가 teacher-only 제외 + order sort 후 전달) */
  readonly tabs: readonly RealtimeWallTabConfig[];
  /** 현재 활성 탭 ID — `parseTabAwareWallState` 가 정정한 값 */
  readonly activeTabId: string;
  /** 탭 클릭 시 호출 (활성 탭 변경) */
  readonly onTabChange: (tabId: string) => void;
  /**
   * Render variant — 기본 'student'. 'teacher' 는 G013 (β-Step13) 에서 확장:
   * + 버튼 / 권한 토글 / 이름변경 추가.
   */
  readonly variant?: 'student' | 'teacher';
  /**
   * 최대 탭 개수 (Plan §2.2 Step 3: cap 8). teacher variant 에서 `tabs.length/maxTabs`
   * 표시 활용. student variant 는 무시.
   */
  readonly maxTabs?: number;
}

const PERMISSION_LABEL: Record<RealtimeWallTabConfig['permission'], string> = {
  all: '모두',
  'teacher-only': '교사만',
  'role-gated': '제한',
};

export function RealtimeWallTabBar({
  tabs,
  activeTabId,
  onTabChange,
  variant = 'student',
  maxTabs,
}: RealtimeWallTabBarProps) {
  // 탭이 1개 이하면 strip 자체를 미노출 (UI 잡음 제거).
  // 단 교사 모드에서는 항상 노출 (+ 버튼 진입점 필요).
  if (tabs.length <= 1 && variant === 'student') {
    return null;
  }

  return (
    <div
      role="tablist"
      aria-label="보드 탭"
      data-tab-bar={variant}
      className="flex items-center gap-1 overflow-x-auto border-b border-sp-border bg-sp-card/60 px-3 py-1.5 text-sm backdrop-blur-sm"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const showPermissionBadge = variant === 'teacher' && tab.permission !== 'all';
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            onClick={() => onTabChange(tab.id)}
            className={[
              'inline-flex shrink-0 items-center gap-1 rounded-md px-3 py-1 font-semibold transition',
              isActive
                ? 'border-b-2 border-sp-accent bg-sp-accent/10 text-sp-accent'
                : 'border-b-2 border-transparent text-sp-muted hover:text-sp-text',
            ].join(' ')}
          >
            <span className="truncate max-w-[140px]">{tab.title}</span>
            {showPermissionBadge && (
              <span
                className="rounded-full bg-sp-surface px-1.5 py-0.5 text-detail text-sp-muted"
                title={`탭 권한: ${PERMISSION_LABEL[tab.permission]}`}
              >
                {PERMISSION_LABEL[tab.permission]}
              </span>
            )}
          </button>
        );
      })}
      {variant === 'teacher' && maxTabs !== undefined && (
        <span
          className="ml-auto shrink-0 text-detail text-sp-muted"
          aria-label={`탭 ${tabs.length}/${maxTabs}`}
        >
          {tabs.length}/{maxTabs}
        </span>
      )}
    </div>
  );
}
