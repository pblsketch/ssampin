/**
 * RealtimeWallBoardSettingsDrawer — 라이브 중 통합 설정 드로어
 *
 * 기존 3개 진입점(설정 수정 / 컬럼 편집 / 톱니 아이콘)을 하나의 우측 슬라이드-인
 * 드로어로 통합한다.
 *
 * 섹션 구성 (세로 스크롤):
 *   §1 기본 — 제목 input + 레이아웃 선택 (kanban/freeform/grid/stream)
 *   §2 컬럼 구성 — kanban 모드일 때만 노출 (RealtimeWallColumnEditorBody 재사용)
 *   §3 승인 정책 — manual/auto 라디오 + confirm-bulk 2-step
 *
 * 진입점에 따른 초기 스크롤:
 *   openSection='basic'   → 섹션 1
 *   openSection='columns' → 섹션 2
 *   openSection='approval'→ 섹션 3
 *
 * freeform 레이아웃 전환 경고:
 *   freeform으로 전환하거나 freeform에서 전환 시 승인 카드 ≥ 1 이면
 *   "카드 위치가 재배치됩니다. 계속하시겠어요?" 확인 대화.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  RealtimeWallColumn,
  RealtimeWallPost,
  RealtimeWallLayoutMode,
  WallApprovalMode,
} from '@domain/entities/RealtimeWall';
import type { RealtimeWallModerationMode } from '@domain/entities/RealtimeWallBoardSettings';
import {
  DEFAULT_WALL_BOARD_THEME,
  type WallBoardTheme,
} from '@domain/entities/RealtimeWallBoardTheme';
import {
  addWallColumn,
  approvalModeFromModerationMode,
  createDefaultFreeformPosition,
  moderationModeFromApprovalMode,
  REALTIME_WALL_MAX_COLUMNS,
  REALTIME_WALL_MIN_COLUMNS,
  removeWallColumn,
  renameWallColumn,
  reorderWallColumns,
  type RemoveColumnStrategy,
} from '@domain/rules/realtimeWallRules';
import { RealtimeWallBoardSettingsModerationToggle } from './RealtimeWallBoardSettingsModerationToggle';
import { RealtimeWallBoardDesignPanel } from './RealtimeWallBoardDesignPanel';
import { Drawer } from '@adapters/components/common/Drawer';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type BoardSettingsSection =
  | 'basic'
  | 'columns'
  | 'approval'
  | 'student-permissions'
  | 'design';

export interface RealtimeWallBoardSettingsDrawerProps {
  /** null이면 드로어 닫힘 */
  readonly openSection: BoardSettingsSection | null;

  // 현재 보드 상태 (읽기)
  readonly title: string;
  readonly layoutMode: RealtimeWallLayoutMode;
  readonly columns: readonly RealtimeWallColumn[];
  readonly posts: readonly RealtimeWallPost[];
  readonly approvalMode: WallApprovalMode;
  /**
   * v1.14 P3 — 학생 카드 추가 잠금 상태.
   * §12 Q7 확정(BoardSettingsDrawer) — §4 학생 권한 섹션에서 토글.
   */
  readonly studentFormLocked: boolean;

  readonly onClose: () => void;

  // §1 — 기본 변경 콜백 (드로어 내부에서 직접 상위 state 변경, 자동저장 effect가 담당)
  readonly onTitleChange: (title: string) => void;
  readonly onLayoutModeChange: (mode: RealtimeWallLayoutMode) => void;

  // §2 — 컬럼 편집 저장 (columns + posts 동시 반영)
  readonly onApplyColumnEdit: (
    nextColumns: readonly RealtimeWallColumn[],
    nextPosts: readonly RealtimeWallPost[],
  ) => void;

  // §3 — 승인 정책 적용
  readonly onApplyApprovalMode: (nextMode: WallApprovalMode, shouldBulkApprove: boolean) => void;

  // §4 — v1.14 P3: 학생 카드 추가 잠금 토글
  readonly onStudentFormLockedChange: (locked: boolean) => void;

  // §5 — v1.16.x 디자인 커스터마이징 (Design §5.2)
  /** 현재 보드 디자인 테마 (보드 settings.theme). undefined면 default 적용. */
  readonly theme?: WallBoardTheme;
  /**
   * 테마 변경 콜백 — Drawer 내부에서 100ms 디바운스 후 호출.
   * 부모는 이 콜백을 받아 (1) 보드 settings 갱신 + (2) boardSettings-changed broadcast.
   * Plan §A-2 mitigation — 라이브 세션 중 broadcast 폭주 방지.
   */
  readonly onThemeChange: (next: WallBoardTheme) => void;
}

// ---------------------------------------------------------------------------
// 레이아웃 메타
// ---------------------------------------------------------------------------

const LAYOUT_OPTIONS: Array<{
  mode: RealtimeWallLayoutMode;
  label: string;
  desc: string;
  icon: string;
}> = [
  { mode: 'kanban', label: '칸반', desc: '컬럼별 카드 분류', icon: 'view_kanban' },
  { mode: 'freeform', label: '자유 배치', desc: '카드 위치 자유롭게', icon: 'grid_view' },
  { mode: 'grid', label: '그리드', desc: '격자 정렬 보기', icon: 'apps' },
  { mode: 'stream', label: '스트림', desc: '실시간 피드 형태', icon: 'dynamic_feed' },
];

// ---------------------------------------------------------------------------
// 확인 대화 타입
// ---------------------------------------------------------------------------

type DrawerConfirmStage =
  | { kind: 'idle' }
  | { kind: 'freeform-warn'; pendingMode: RealtimeWallLayoutMode }
  | { kind: 'bulk-approve'; pendingCount: number };

// ---------------------------------------------------------------------------
// 메인 컴포넌트
// ---------------------------------------------------------------------------

export function RealtimeWallBoardSettingsDrawer({
  openSection,
  title,
  layoutMode,
  columns,
  posts,
  approvalMode,
  studentFormLocked,
  onClose,
  onTitleChange,
  onLayoutModeChange,
  onApplyColumnEdit,
  onApplyApprovalMode,
  onStudentFormLockedChange,
  theme,
  onThemeChange,
}: RealtimeWallBoardSettingsDrawerProps) {
  const isOpen = openSection !== null;

  // §3 draft — 드로어가 열릴 때마다 현재 approvalMode로 초기화
  const [draftApprovalMode, setDraftApprovalMode] = useState<WallApprovalMode>(approvalMode);
  // 확인 대화 단계
  const [confirmStage, setConfirmStage] = useState<DrawerConfirmStage>({ kind: 'idle' });
  // §5 디자인 reset 확인 다이얼로그
  const [resetThemeOpen, setResetThemeOpen] = useState(false);

  // 섹션 refs — scrollIntoView 대상
  const basicRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const approvalRef = useRef<HTMLDivElement>(null);
  const studentPermissionsRef = useRef<HTMLDivElement>(null);
  const designRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // §5 — Drawer 내부 100ms 디바운스 + 즉시 낙관적 UI 갱신을 위한 local draft.
  // 클릭 즉시 미리보기 갱신 → 100ms 후 부모 onThemeChange 호출(=broadcast).
  // Plan §A-2 / Design §결정 7 — broadcast 폭주 mitigation.
  const effectiveTheme = theme ?? DEFAULT_WALL_BOARD_THEME;
  const [draftTheme, setDraftTheme] = useState<WallBoardTheme>(effectiveTheme);
  const debounceTimerRef = useRef<number | null>(null);

  // 외부 theme 변경(다른 클라이언트로부터 broadcast 등) 동기화
  useEffect(() => {
    setDraftTheme(effectiveTheme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTheme.colorScheme, effectiveTheme.background.presetId, effectiveTheme.accent]);

  // unmount 시 pending 디바운스 cleanup
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, []);

  const handleThemeChangeDebounced = useCallback(
    (next: WallBoardTheme) => {
      setDraftTheme(next); // 낙관적 갱신 — 미리보기 즉시 반영
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = window.setTimeout(() => {
        debounceTimerRef.current = null;
        onThemeChange(next);
      }, 100);
    },
    [onThemeChange],
  );

  const handleThemeReset = useCallback(() => {
    setResetThemeOpen(true);
  }, []);

  const handleConfirmThemeReset = useCallback(() => {
    setDraftTheme(DEFAULT_WALL_BOARD_THEME);
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    onThemeChange(DEFAULT_WALL_BOARD_THEME);
    setResetThemeOpen(false);
  }, [onThemeChange]);

  const resolveTargetRef = (section: BoardSettingsSection | null) => {
    switch (section) {
      case 'columns':
        return columnsRef;
      case 'approval':
        return approvalRef;
      case 'student-permissions':
        return studentPermissionsRef;
      case 'design':
        return designRef;
      default:
        return basicRef;
    }
  };

  // 드로어가 열릴 때 초기화 + 해당 섹션으로 스크롤
  useEffect(() => {
    if (!isOpen) return;
    setDraftApprovalMode(approvalMode);
    setConfirmStage({ kind: 'idle' });

    // 다음 렌더 사이클에서 ref가 마운트된 후 스크롤
    const timer = window.setTimeout(() => {
      resolveTargetRef(openSection).current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(timer);
  // openSection이 같은 섹션으로 다시 열릴 때도 스크롤해야 하므로 isOpen도 포함
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, openSection]);

  // openSection이 바뀔 때 (드로어가 열린 채로 다른 섹션 요청 시) 스크롤
  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      resolveTargetRef(openSection).current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSection]);

  if (!isOpen) return null;

  // ---------------------------------------------------------------------------
  // §1 핸들러 — 레이아웃 변경 (freeform 전환 경고)
  // ---------------------------------------------------------------------------

  const approvedCount = posts.filter((p) => p.status === 'approved').length;
  const isFreeformTransition = (next: RealtimeWallLayoutMode) =>
    next === 'freeform' || layoutMode === 'freeform';

  const handleLayoutChange = (next: RealtimeWallLayoutMode) => {
    if (next === layoutMode) return;
    if (isFreeformTransition(next) && approvedCount > 0) {
      setConfirmStage({ kind: 'freeform-warn', pendingMode: next });
      return;
    }
    onLayoutModeChange(next);
  };

  const handleConfirmFreeformSwitch = () => {
    if (confirmStage.kind !== 'freeform-warn') return;
    const next = confirmStage.pendingMode;
    // 승인 카드 freeform position 재계산
    let approvedIndex = 0;
    const nextPosts = posts.map((p) => {
      if (p.status !== 'approved') return p;
      const pos = createDefaultFreeformPosition(approvedIndex++);
      return { ...p, freeform: pos };
    });
    onLayoutModeChange(next);
    onApplyColumnEdit(columns, nextPosts);
    setConfirmStage({ kind: 'idle' });
  };

  const handleCancelFreeformSwitch = () => {
    setConfirmStage({ kind: 'idle' });
  };

  // ---------------------------------------------------------------------------
  // §3 핸들러 — 승인 정책
  // ---------------------------------------------------------------------------

  const pendingCount = posts.filter((p) => p.status === 'pending').length;

  const handleApprovalSave = () => {
    if (approvalMode === 'manual' && draftApprovalMode === 'auto' && pendingCount > 0) {
      setConfirmStage({ kind: 'bulk-approve', pendingCount });
      return;
    }
    onApplyApprovalMode(draftApprovalMode, false);
    // 드로어는 열려 있음 (닫지 않음)
    setConfirmStage({ kind: 'idle' });
  };

  const handleBulkApprove = () => {
    onApplyApprovalMode('auto', true);
    setConfirmStage({ kind: 'idle' });
  };

  const handleKeepPending = () => {
    onApplyApprovalMode('auto', false);
    setConfirmStage({ kind: 'idle' });
  };

  const handleCancelBulk = () => {
    setConfirmStage({ kind: 'idle' });
    onClose();
  };

  // ---------------------------------------------------------------------------
  // 렌더
  // ---------------------------------------------------------------------------

  return (
    <>
      <Drawer isOpen={isOpen} onClose={onClose} title="보드 설정" srOnlyTitle side="right" size="md">
        {/* 헤더 */}
        <div className="flex shrink-0 items-center gap-2.5 border-b border-sp-border px-5 py-4">
          <span className="material-symbols-outlined text-xl text-sp-accent">tune</span>
          <h3 className="text-base font-bold text-sp-text">보드 설정</h3>
          <IconButton icon="close" label="닫기" variant="ghost" size="sm" onClick={onClose} className="ml-auto" />
        </div>

        {/* 본문 스크롤 영역 */}
        <div
          ref={scrollContainerRef}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
        >
          {/* ================================================================
              §1 기본 설정
              ================================================================ */}
          <div ref={basicRef} className="mb-6">
            <SectionHeader icon="edit_note" label="기본 설정" />

            {/* 제목 */}
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-semibold text-sp-muted">
                담벼락 제목
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                maxLength={50}
                placeholder="실시간 담벼락"
                className="w-full rounded-lg border border-sp-border bg-sp-surface px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
              />
              <p className="mt-1 text-right text-caption text-sp-muted">{title.length}/50</p>
            </div>

            {/* 레이아웃 */}
            <div>
              <p className="mb-1.5 text-xs font-semibold text-sp-muted">레이아웃</p>
              <div className="grid grid-cols-2 gap-2">
                {LAYOUT_OPTIONS.map(({ mode, label, desc, icon }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleLayoutChange(mode)}
                    className={[
                      'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition',
                      layoutMode === mode
                        ? 'border-sp-accent bg-sp-accent/10 text-sp-accent'
                        : 'border-sp-border bg-sp-surface text-sp-muted hover:border-sp-accent/40 hover:text-sp-text',
                    ].join(' ')}
                  >
                    <span className="material-symbols-outlined text-lg">{icon}</span>
                    <span className="text-xs font-bold">{label}</span>
                    <span className="text-caption leading-tight opacity-70">{desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ================================================================
              §2 컬럼 구성 (kanban 전용)
              ================================================================ */}
          {layoutMode === 'kanban' && (
            <div ref={columnsRef} className="mb-6">
              <SectionHeader icon="view_column" label="컬럼 구성" />
              <ColumnEditorBody
                columns={columns}
                posts={posts}
                onApply={onApplyColumnEdit}
              />
            </div>
          )}

          {/* ================================================================
              §3 승인 정책
              ================================================================ */}
          <div ref={approvalRef} className="mb-2">
            <SectionHeader icon="fact_check" label="승인 정책" />

            {confirmStage.kind === 'bulk-approve' ? (
              <BulkApproveConfirm
                pendingCount={confirmStage.pendingCount}
                onApprove={handleBulkApprove}
                onKeepPending={handleKeepPending}
                onCancel={handleCancelBulk}
              />
            ) : (
              <>
                {/* v2.1 (Phase A-A5) — moderation 프리셋 토글
                    Padlet 정합 'off' / 'manual' 양자택일. approvalMode와 통합 매핑. */}
                <RealtimeWallBoardSettingsModerationToggle
                  value={moderationModeFromApprovalMode(draftApprovalMode)}
                  onChange={(nextMode: RealtimeWallModerationMode) => {
                    setDraftApprovalMode(approvalModeFromModerationMode(nextMode));
                  }}
                />

                {/* 키워드 필터 — 준비 중 (현 정책 유지) */}
                <label className="mt-2 flex cursor-not-allowed items-start gap-3 rounded-lg border border-sp-border/60 bg-sp-surface/40 p-3 opacity-60">
                  <input type="radio" disabled className="mt-1" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-sp-muted">키워드 필터</p>
                    <p className="mt-0.5 text-xs text-sp-muted/60">준비 중</p>
                  </div>
                </label>

                {pendingCount > 0 && approvalMode === 'manual' && draftApprovalMode === 'auto' && (
                  <p className="mt-2 text-xs text-amber-400">
                    대기 중 카드 {pendingCount}장 — 저장 시 처리 방법을 선택합니다.
                  </p>
                )}

                <div className="mt-3 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={handleApprovalSave}
                    disabled={draftApprovalMode === approvalMode}
                    className="rounded-lg bg-sp-accent px-4 py-2 text-xs font-bold text-white transition hover:bg-sp-accent/85 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    저장
                  </button>
                </div>
              </>
            )}
          </div>

          {/* ================================================================
              §4 학생 권한 (v1.14 P3)
              ================================================================ */}
          <div ref={studentPermissionsRef} className="mb-6 mt-6">
            <SectionHeader icon="lock_person" label="학생 권한" />
            <StudentFormLockToggle
              locked={studentFormLocked}
              onChange={onStudentFormLockedChange}
            />
          </div>

          {/* ================================================================
              §5 디자인 (v1.16.x — 보드 디자인 커스터마이징)
              ================================================================ */}
          <div ref={designRef} className="mb-2 mt-6">
            <SectionHeader icon="palette" label="디자인" />
            <RealtimeWallBoardDesignPanel
              value={draftTheme}
              onChange={handleThemeChangeDebounced}
              onReset={handleThemeReset}
            />
          </div>
        </div>
      </Drawer>

      {/* §5 디자인 — 기본값 복원 확인 다이얼로그 */}
      <Modal
        isOpen={resetThemeOpen}
        onClose={() => setResetThemeOpen(false)}
        title="디자인 기본값으로 복원"
        srOnlyTitle
        size="sm"
        closeOnBackdrop={false}
      >
        <div className="p-5">
          <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-sp-accent/30 bg-sp-accent/10 p-3">
            <span className="material-symbols-outlined mt-0.5 text-lg text-sp-accent">
              palette
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-sp-text">디자인을 기본값으로 되돌릴까요?</p>
              <p className="mt-1 text-xs text-sp-muted">
                색상 스킴과 배경이 기본값(밝은 모드 + 기본 종이)으로 돌아갑니다. 다른 설정(승인 정책 등)은 그대로 유지돼요.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setResetThemeOpen(false)}
              className="rounded-lg border border-sp-border px-4 py-2 text-xs text-sp-muted transition hover:border-sp-accent hover:text-sp-accent"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleConfirmThemeReset}
              className="rounded-lg bg-sp-accent px-4 py-2 text-xs font-bold text-white transition hover:bg-sp-accent/85"
            >
              복원
            </button>
          </div>
        </div>
      </Modal>

      {/* freeform 전환 경고 오버레이 */}
      <Modal
        isOpen={confirmStage.kind === 'freeform-warn'}
        onClose={handleCancelFreeformSwitch}
        title="레이아웃 변경 확인"
        srOnlyTitle
        size="sm"
        closeOnBackdrop={false}
      >
        <div className="p-5">
          <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <span className="material-symbols-outlined mt-0.5 text-lg text-amber-400">
              warning
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-sp-text">카드 위치가 재배치됩니다</p>
              <p className="mt-1 text-xs text-sp-muted">
                자유 배치 레이아웃으로 전환하면 승인된 카드 {approvedCount}장의
                위치가 기본 격자 배치로 재설정됩니다. 계속하시겠어요?
              </p>
            </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleCancelFreeformSwitch}
                className="rounded-lg border border-sp-border px-4 py-2 text-xs text-sp-muted transition hover:border-sp-accent hover:text-sp-accent"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmFreeformSwitch}
                className="rounded-lg bg-sp-accent px-4 py-2 text-xs font-bold text-sp-accent-fg transition hover:bg-sp-accent/85"
              >
                계속
              </button>
            </div>
        </div>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// SectionHeader — 섹션 구분 헤더
// ---------------------------------------------------------------------------

function SectionHeader({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="mb-3 flex items-center gap-2 border-b border-sp-border pb-2">
      <span className="material-symbols-outlined text-base text-sp-accent">{icon}</span>
      <h3 className="text-sm font-bold text-sp-text">{label}</h3>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StudentFormLockToggle — v1.14 P3: 학생 카드 추가 잠금 체크박스
// ---------------------------------------------------------------------------

interface StudentFormLockToggleProps {
  readonly locked: boolean;
  readonly onChange: (locked: boolean) => void;
}

function StudentFormLockToggle({ locked, onChange }: StudentFormLockToggleProps) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-sp-border bg-sp-surface p-3 transition hover:border-sp-accent/40">
      <input
        type="checkbox"
        checked={locked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 accent-sp-accent"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-sp-text">학생 카드 추가 잠금</p>
        <p className="mt-0.5 text-xs text-sp-muted">
          잠그면 학생은 새 카드를 올릴 수 없어요. 이미 올라온 카드는 그대로 유지됩니다.
        </p>
      </div>
    </label>
  );
}

// ---------------------------------------------------------------------------
// BulkApproveConfirm — manual→auto 전환 시 일괄 승인 확인 (2-step)
// ---------------------------------------------------------------------------

interface BulkApproveConfirmProps {
  pendingCount: number;
  onApprove: () => void;
  onKeepPending: () => void;
  onCancel: () => void;
}

function BulkApproveConfirm({
  pendingCount,
  onApprove,
  onKeepPending,
  onCancel,
}: BulkApproveConfirmProps) {
  return (
    <div>
      <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-sp-accent/30 bg-sp-accent/10 p-3">
        <span className="material-symbols-outlined mt-0.5 text-lg text-sp-accent">info</span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-sp-text">
            대기 중 카드 {pendingCount}장을 자동 승인하시겠어요?
          </p>
          <p className="mt-1 text-xs text-sp-muted">
            자동 승인으로 바꾸면, 이미 대기열에 쌓인 카드들을 한 번에 보드에 올릴 수
            있습니다. 개별 검토를 원하시면 [각 카드 개별 검토]를 선택하세요.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-sp-border px-4 py-2 text-xs text-sp-muted transition hover:border-sp-accent hover:text-sp-accent"
        >
          취소
        </button>
        <button
          type="button"
          onClick={onKeepPending}
          className="rounded-lg border border-sp-border px-4 py-2 text-xs text-sp-muted transition hover:border-sp-accent hover:text-sp-accent"
        >
          각 카드 개별 검토
        </button>
        <button
          type="button"
          onClick={onApprove}
          className="rounded-lg bg-sp-accent px-4 py-2 text-xs font-bold text-white transition hover:bg-sp-accent/85"
        >
          승인
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ColumnEditorBody — 컬럼 편집 body (드로어 껍데기 없이 섹션 내부만)
// ---------------------------------------------------------------------------

export interface ColumnEditorBodyProps {
  readonly columns: readonly RealtimeWallColumn[];
  readonly posts: readonly RealtimeWallPost[];
  readonly onApply: (
    nextColumns: readonly RealtimeWallColumn[],
    nextPosts: readonly RealtimeWallPost[],
  ) => void;
}

export function ColumnEditorBody({ columns, posts, onApply }: ColumnEditorBodyProps) {
  const [draftColumns, setDraftColumns] = useState<readonly RealtimeWallColumn[]>(columns);
  const [draftPosts, setDraftPosts] = useState<readonly RealtimeWallPost[]>(posts);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [newTitleInput, setNewTitleInput] = useState('');
  const [removeStage, setRemoveStage] = useState<ColumnRemoveStage>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);

  // 외부 columns/posts 변경 시 동기화 (드로어가 열려 있는 동안 상위에서 변경될 수 있음)
  useEffect(() => {
    setDraftColumns(columns);
    setDraftPosts(posts);
    setRenamingId(null);
    setRenameInput('');
    setNewTitleInput('');
    setRemoveStage({ kind: 'idle' });
    setError(null);
  }, [columns, posts]);

  const approvedCountByColumn = new Map<string, number>();
  for (const p of draftPosts) {
    if (p.status === 'approved' || p.status === 'pending') {
      approvedCountByColumn.set(p.kanban.columnId, (approvedCountByColumn.get(p.kanban.columnId) ?? 0) + 1);
    }
  }

  const canAddMore = draftColumns.length < REALTIME_WALL_MAX_COLUMNS;
  const canRemove = draftColumns.length > REALTIME_WALL_MIN_COLUMNS;

  const handleAdd = () => {
    const trimmed = newTitleInput.trim();
    if (trimmed.length === 0) { setError('컬럼 이름을 입력해주세요.'); return; }
    if (!canAddMore) { setError(`컬럼은 최대 ${REALTIME_WALL_MAX_COLUMNS}개까지 만들 수 있어요.`); return; }
    const next = addWallColumn(draftColumns, trimmed);
    if (next.length === draftColumns.length) { setError('이 컬럼을 추가할 수 없어요.'); return; }
    setDraftColumns(next);
    setNewTitleInput('');
    setError(null);
  };

  const handleStartRename = (col: RealtimeWallColumn) => {
    setRenamingId(col.id);
    setRenameInput(col.title);
    setError(null);
  };

  const handleCommitRename = () => {
    if (!renamingId) return;
    const trimmed = renameInput.trim();
    if (trimmed.length === 0) { setError('컬럼 이름을 비울 수 없어요.'); return; }
    setDraftColumns(renameWallColumn(draftColumns, renamingId, trimmed));
    setRenamingId(null);
    setRenameInput('');
    setError(null);
  };

  const handleCancelRename = () => {
    setRenamingId(null);
    setRenameInput('');
    setError(null);
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draftColumns.length) return;
    setDraftColumns(reorderWallColumns(draftColumns, index, target));
    setError(null);
  };

  const handleStartRemove = (col: RealtimeWallColumn) => {
    if (!canRemove) { setError(`컬럼은 최소 ${REALTIME_WALL_MIN_COLUMNS}개가 필요해요.`); return; }
    const cardCount = approvedCountByColumn.get(col.id) ?? 0;
    setRemoveStage({ kind: 'confirm-remove', columnId: col.id, columnTitle: col.title, cardCount });
    setError(null);
  };

  const handleConfirmRemove = (strategy: RemoveColumnStrategy) => {
    if (removeStage.kind !== 'confirm-remove') return;
    const result = removeWallColumn(draftColumns, draftPosts, removeStage.columnId, strategy);
    setDraftColumns(result.columns);
    setDraftPosts(result.posts);
    setRemoveStage({ kind: 'idle' });
  };

  const handleSave = () => {
    onApply(draftColumns, draftPosts);
  };

  if (removeStage.kind === 'confirm-remove') {
    return (
      <ColumnRemoveConfirmPanel
        columnTitle={removeStage.columnTitle}
        cardCount={removeStage.cardCount}
        otherColumns={draftColumns.filter((c) => c.id !== removeStage.columnId)}
        onConfirm={handleConfirmRemove}
        onCancel={() => setRemoveStage({ kind: 'idle' })}
      />
    );
  }

  return (
    <div>
      <ul className="space-y-2">
        {draftColumns.map((col, index) => {
          const isRenaming = renamingId === col.id;
          const cardCount = approvedCountByColumn.get(col.id) ?? 0;
          return (
            <li
              key={col.id}
              className="flex items-center gap-2 rounded-lg border border-sp-border bg-sp-surface px-3 py-2"
            >
              {/* 순서 */}
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => handleMove(index, -1)}
                  disabled={index === 0}
                  aria-label="위로"
                  className="rounded p-0.5 text-sp-muted transition hover:text-sp-text disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-sm">arrow_upward</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(index, 1)}
                  disabled={index === draftColumns.length - 1}
                  aria-label="아래로"
                  className="rounded p-0.5 text-sp-muted transition hover:text-sp-text disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-sm">arrow_downward</span>
                </button>
              </div>

              <span className="w-5 text-center text-detail text-sp-muted">{index + 1}</span>

              {isRenaming ? (
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <input
                    type="text"
                    value={renameInput}
                    onChange={(e) => setRenameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); handleCommitRename(); }
                      else if (e.key === 'Escape') { e.preventDefault(); handleCancelRename(); }
                    }}
                    autoFocus
                    maxLength={20}
                    className="min-w-0 flex-1 rounded border border-sp-accent/50 bg-sp-bg px-2 py-1 text-sm text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
                  />
                  <button
                    type="button"
                    onClick={handleCommitRename}
                    className="rounded bg-sp-accent px-2 py-1 text-detail font-semibold text-white transition hover:bg-sp-accent/85"
                  >
                    확인
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelRename}
                    className="rounded border border-sp-border px-2 py-1 text-detail text-sp-muted transition hover:text-sp-text"
                  >
                    취소
                  </button>
                </div>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-sp-text">{col.title}</span>
                  {cardCount > 0 && (
                    <span className="shrink-0 rounded bg-sp-surface px-1.5 py-0.5 text-caption text-sp-muted">
                      {cardCount}장
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleStartRename(col)}
                    aria-label="이름 변경"
                    className="rounded p-1 text-sp-muted transition hover:bg-sp-bg hover:text-sp-text"
                  >
                    <span className="material-symbols-outlined text-sm">edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStartRemove(col)}
                    disabled={!canRemove}
                    aria-label="삭제"
                    className="rounded p-1 text-sp-muted transition hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* + 컬럼 추가 */}
      <div className="mt-3 flex items-center gap-2">
        <input
          type="text"
          value={newTitleInput}
          onChange={(e) => setNewTitleInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
          maxLength={20}
          placeholder={canAddMore ? '새 컬럼 이름' : '최대 6개까지 가능해요'}
          disabled={!canAddMore}
          className="min-w-0 flex-1 rounded-lg border border-sp-border bg-sp-surface px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!canAddMore || newTitleInput.trim().length === 0}
          className="rounded-lg bg-sp-accent px-3 py-2 text-xs font-bold text-white transition hover:bg-sp-accent/85 disabled:cursor-not-allowed disabled:opacity-40"
        >
          + 추가
        </button>
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-400" role="alert">{error}</p>
      )}
      <p className="mt-2 text-detail text-sp-muted">
        위/아래 화살표로 컬럼 순서를 바꿀 수 있어요.
        컬럼은 최소 {REALTIME_WALL_MIN_COLUMNS}개, 최대 {REALTIME_WALL_MAX_COLUMNS}개까지 가능합니다.
      </p>

      {/* 저장 버튼 */}
      <div className="mt-3 flex items-center justify-end">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg bg-sp-accent px-4 py-2 text-xs font-bold text-white transition hover:bg-sp-accent/85"
        >
          저장
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 내부 타입 / 헬퍼
// ---------------------------------------------------------------------------

type ColumnRemoveStage =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'confirm-remove';
      readonly columnId: string;
      readonly columnTitle: string;
      readonly cardCount: number;
    };

interface ColumnRemoveConfirmPanelProps {
  readonly columnTitle: string;
  readonly cardCount: number;
  readonly otherColumns: readonly RealtimeWallColumn[];
  readonly onConfirm: (strategy: RemoveColumnStrategy) => void;
  readonly onCancel: () => void;
}

function ColumnRemoveConfirmPanel({
  columnTitle,
  cardCount,
  otherColumns,
  onConfirm,
  onCancel,
}: ColumnRemoveConfirmPanelProps) {
  const [moveTargetId, setMoveTargetId] = useState<string>(() => otherColumns[0]?.id ?? '');
  const hasCards = cardCount > 0;

  return (
    <div>
      <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
        <span className="material-symbols-outlined mt-0.5 text-lg text-red-300">warning</span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-sp-text">
            &lsquo;{columnTitle}&rsquo; 컬럼을 삭제할까요?
          </p>
          {hasCards ? (
            <p className="mt-1 text-xs text-sp-muted">
              이 컬럼에 {cardCount}장의 카드가 있어요. 카드 처리 방법을 선택해주세요.
            </p>
          ) : (
            <p className="mt-1 text-xs text-sp-muted">컬럼 안에 카드는 없어요.</p>
          )}
        </div>
      </div>

      {hasCards ? (
        <div className="space-y-2">
          <div className="rounded-lg border border-sp-border bg-sp-surface p-3">
            <p className="text-sm font-semibold text-sp-text">다른 컬럼으로 이동</p>
            <p className="mt-0.5 text-xs text-sp-muted">카드를 선택한 컬럼 뒤로 옮깁니다.</p>
            <div className="mt-2 flex items-center gap-2">
              <select
                value={moveTargetId}
                onChange={(e) => setMoveTargetId(e.target.value)}
                className="min-w-0 flex-1 rounded border border-sp-border bg-sp-bg px-2 py-1.5 text-xs text-sp-text"
              >
                {otherColumns.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onConfirm({ kind: 'move-to', targetColumnId: moveTargetId })}
                disabled={!moveTargetId}
                className="rounded bg-sp-accent px-3 py-1.5 text-detail font-bold text-white transition hover:bg-sp-accent/85 disabled:cursor-not-allowed disabled:opacity-40"
              >
                이동
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onConfirm({ kind: 'hide' })}
            className="w-full rounded-lg border border-sp-border bg-sp-surface p-3 text-left transition hover:border-amber-500/50"
          >
            <p className="text-sm font-semibold text-sp-text">카드 숨김 처리</p>
            <p className="mt-0.5 text-xs text-sp-muted">
              카드는 숨김 처리되어 보드에서 사라지지만, 나중에 복구할 수 있어요.
            </p>
          </button>

          <button
            type="button"
            onClick={() => onConfirm({ kind: 'delete' })}
            className="w-full rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-left transition hover:border-red-500/60"
          >
            <p className="text-sm font-semibold text-red-300">카드 영구 삭제</p>
            <p className="mt-0.5 text-xs text-sp-muted">카드가 완전히 삭제됩니다. 되돌릴 수 없어요.</p>
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onConfirm({ kind: 'delete' })}
            className="rounded-lg bg-red-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-500/85"
          >
            삭제
          </button>
        </div>
      )}

      <div className="mt-3 flex items-center justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-sp-border px-4 py-2 text-xs text-sp-muted transition hover:border-sp-accent hover:text-sp-accent"
        >
          취소
        </button>
      </div>
    </div>
  );
}
