/**
 * RealtimeWallTeacherActionBar — 교사 우측 슬림 세로 Action Bar (Padlet 정합).
 *
 * 2026-04-26 사용자 피드백 라운드 — 결함 #1 ("교사·학생 보드 디자인 다름") 대응:
 *   기존: QR/URL/짧은코드/대기열/하단버튼이 보드 영역 위에 누적 렌더 → 보드 절반만 차지.
 *   변경: 보드 영역은 학생과 픽셀 동일하게 풀 사이즈로 두고, 교사 전용 컨트롤만
 *         슬림 세로 strip(width 56px)에 모은다. 각 아이콘은 Drawer 또는 토글 트리거.
 *
 * 2026-04-26 결함 #5 — "수업 마무리" 제거 + "내보내기" 신설:
 *   기존 'flag' 아이콘(수업 마무리)은 결과 뷰 진입 + 라이브 종료 이중 책임 — 라이브
 *   종료는 공유 Drawer §0의 "참여 종료" 버튼으로 충분히 처리됨. 결과 복기는 향후
 *   별도 진입(보드 목록의 "결과 보기")으로 분리. 본 ActionBar에서는 책임 분리 위해
 *   완전 제거하고, 그 자리에 "내보내기"(PDF/엑셀) 진입을 둔다.
 *
 * 책임:
 *   - 우측 고정 세로 strip — 보드 컨테이너 우측 56px 차지.
 *   - 6개 액션: 공유 / 디자인 / 컬럼(kanban only) / 대기열(승인 큐 — 카운트 배지) /
 *               추가 잠금 토글 / 내보내기(PDF/엑셀).
 *   - 학생 트래커는 카드 우클릭 컨텍스트 메뉴에서 진입하므로 ActionBar 미포함.
 *
 * 디자인 가드레일:
 *   - rounded-sp-* 금지 (memory feedback) → rounded-xl/lg 기본 키만.
 *   - sp-* 토큰 우선, 한국어 tooltip + aria-label.
 *   - WCAG 2.5.5 — 각 버튼 44×44 최소 (h-11 w-11).
 *   - z-index: dropdown 레벨 (보드 위, drawer 아래) — z-30.
 *
 * 회귀 위험 mitigation:
 *   - LayoutMode === 'kanban'일 때만 컬럼 편집 노출 (다른 레이아웃에서는 의미 없음).
 *   - 대기열 배지는 pendingCount > 0일 때만 노출 (`auto` 모드에서는 항상 0).
 *   - 학생 추가 잠금은 toggle button (라이브가 아니면 disabled).
 *   - 내보내기는 라이브 여부와 무관하게 항상 활성 — 보드에 카드가 0장이어도
 *     Drawer 안에서 "내보낼 카드가 없습니다" 안내가 떠 사용자가 혼란 없도록.
 */

import type { RealtimeWallLayoutMode } from '@domain/entities/RealtimeWall';

interface RealtimeWallTeacherActionBarProps {
  readonly layoutMode: RealtimeWallLayoutMode;
  readonly isLiveMode: boolean;
  readonly pendingCount: number;
  readonly studentFormLocked: boolean;
  readonly onOpenShare: () => void;
  readonly onOpenDesign: () => void;
  readonly onOpenColumns: () => void;
  readonly onOpenApprovalQueue: () => void;
  readonly onToggleStudentLock: () => void;
  readonly onOpenExport: () => void;
  /** Step 1 — 교사 카드 추가 버튼 클릭 핸들러 */
  readonly onAddTeacherCard: () => void;
}

interface ActionItem {
  readonly key: string;
  readonly icon: string;
  readonly label: string;
  readonly onClick: () => void;
  readonly badge?: number;
  readonly disabled?: boolean;
  readonly toneActive?: boolean;
  readonly toneAccent?: boolean;
}

export function RealtimeWallTeacherActionBar({
  layoutMode,
  isLiveMode,
  pendingCount,
  studentFormLocked,
  onOpenShare,
  onOpenDesign,
  onOpenColumns,
  onOpenApprovalQueue,
  onToggleStudentLock,
  onOpenExport,
  onAddTeacherCard,
}: RealtimeWallTeacherActionBarProps) {
  const items: ActionItem[] = [
    {
      key: 'teacher-card',
      icon: 'edit_note',
      label: '선생님 카드 추가',
      onClick: onAddTeacherCard,
      toneAccent: false,
    },
    {
      key: 'share',
      icon: 'share',
      label: isLiveMode ? '공유 — QR / 주소' : '공유 (라이브 시작 후 사용 가능)',
      onClick: onOpenShare,
      disabled: !isLiveMode,
    },
    {
      key: 'design',
      icon: 'palette',
      label: '디자인 — 배경 / 색상',
      onClick: onOpenDesign,
    },
  ];

  if (layoutMode === 'kanban') {
    items.push({
      key: 'columns',
      icon: 'view_column',
      label: '컬럼 편집',
      onClick: onOpenColumns,
    });
  }

  items.push(
    {
      key: 'queue',
      icon: 'fact_check',
      label: pendingCount > 0
        ? `승인 대기 — ${pendingCount}장`
        : '승인 정책 / 대기열',
      onClick: onOpenApprovalQueue,
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
    {
      key: 'lock',
      icon: studentFormLocked ? 'lock' : 'lock_open',
      label: studentFormLocked
        ? '학생 카드 추가 잠겨 있음 — 클릭하여 풀기'
        : '학생 카드 추가 가능 — 클릭하여 잠그기',
      onClick: onToggleStudentLock,
      toneActive: studentFormLocked,
      disabled: !isLiveMode,
    },
    {
      key: 'export',
      icon: 'file_download',
      label: '보드 내보내기 (PDF/엑셀)',
      onClick: onOpenExport,
      toneAccent: true,
    },
  );

  return (
    <aside
      className="flex w-14 shrink-0 flex-col items-center gap-1.5 rounded-xl border border-sp-border bg-sp-surface/90 py-2 backdrop-blur"
      aria-label="교사 도구 모음"
    >
      {items.map(({ key, ...rest }) => (
        <ActionButton key={key} {...rest} />
      ))}
    </aside>
  );
}

type ActionButtonProps = Omit<ActionItem, 'key'>;

function ActionButton({
  icon,
  label,
  onClick,
  badge,
  disabled,
  toneActive,
  toneAccent,
}: ActionButtonProps) {
  const baseClasses = [
    'relative flex h-11 w-11 items-center justify-center rounded-lg border transition',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent/60',
  ];

  if (disabled) {
    baseClasses.push('cursor-not-allowed border-transparent text-sp-muted/40');
  } else if (toneActive) {
    baseClasses.push('border-sp-accent/40 bg-sp-accent/15 text-sp-accent');
  } else if (toneAccent) {
    baseClasses.push(
      'border-transparent text-sp-muted hover:border-sp-highlight/40 hover:bg-sp-highlight/10 hover:text-sp-highlight',
    );
  } else {
    baseClasses.push(
      'border-transparent text-sp-muted hover:border-sp-accent/40 hover:bg-sp-accent/10 hover:text-sp-accent',
    );
  }

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={baseClasses.join(' ')}
    >
      <span className="material-symbols-outlined text-[22px]">{icon}</span>
      {typeof badge === 'number' && badge > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white shadow-sm">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}
