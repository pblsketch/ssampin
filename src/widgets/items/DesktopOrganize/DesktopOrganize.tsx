import { useEffect, useRef, useState } from 'react';
import { useDesktopOrganizeStore } from '@adapters/stores/useDesktopOrganizeStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import type { GridResizePlan } from '@usecases/desktopOrganize/computeGridResizePlan';
import { DesktopOrganizeBox } from './DesktopOrganizeBox';
import { DesktopOrganizeGridSettings } from './DesktopOrganizeGridSettings';
import { ConfirmGridResizeModal } from './ConfirmGridResizeModal';
import { useIsWindows } from './usePlatformGuard';

const COACH_MARK_KEY = 'desktop-organize:coach-shown';
const UNDO_TOAST_DURATION_MS = 5000;

/**
 * 바탕화면 정리 (DesktopOrganize) 위젯 카드.
 *
 * - native-desktop 모드 위에 카테고리 박스 그리드를 깔아 둔다
 * - 박스는 시각적 영역만 — 사용자가 OS 바탕화면 아이콘을 박스 위로 직접 드래그
 * - hook 라우팅(LVM_HITTEST)은 그대로 유지: 박스 빈 공간 클릭은 widget으로 도달하지만 NoOp
 * - 편집 모드(카드 자체 ✏️ 토글)에서만 박스 제목 수정 + ⚙️ 그리드 설정 노출
 *
 * Widget.tsx는 절대 수정하지 않는다 (다른 세션 작업 영역).
 */
export function DesktopOrganize() {
  const config = useDesktopOrganizeStore((s) => s.config);
  const load = useDesktopOrganizeStore((s) => s.load);
  const setTitle = useDesktopOrganizeStore((s) => s.setTitle);
  const applyGridResize = useDesktopOrganizeStore((s) => s.applyGridResize);
  const planResize = useDesktopOrganizeStore((s) => s.planResize);
  const setBoxTransparent = useDesktopOrganizeStore((s) => s.setBoxTransparent);
  const undo = useDesktopOrganizeStore((s) => s.undo);
  const isWindows = useIsWindows();

  // 안내 배너 노출 조건 — Windows + native-desktop 아닐 때만.
  // 위젯 본 동작은 native-desktop 모드에서만 일어나므로 normal/topmost 모드에서는
  // 사용자에게 모드 전환을 권유한다. (Design §3.3.2)
  const desktopMode = useSettingsStore((s) => s.settings.widget.desktopMode);
  const isNativeDesktopMode = desktopMode === 'native-desktop';

  const [isEditMode, setIsEditMode] = useState(false);
  const [showGridSettings, setShowGridSettings] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<GridResizePlan | null>(null);
  const [showCoachMark, setShowCoachMark] = useState(false);
  const [undoToast, setUndoToast] = useState<{ expiresAt: number } | null>(null);
  const [, forceTick] = useState(0);

  const settingsBtnRef = useRef<HTMLButtonElement>(null);

  // 첫 활성화 시 영속 데이터 로드
  useEffect(() => {
    void load();
  }, [load]);

  // 첫 실행 코치마크 (1회성, localStorage)
  useEffect(() => {
    if (config && typeof window !== 'undefined') {
      try {
        const shown = window.localStorage.getItem(COACH_MARK_KEY);
        if (!shown) {
          setShowCoachMark(true);
        }
      } catch {
        // localStorage 접근 실패 무시
      }
    }
  }, [config]);

  const dismissCoachMark = () => {
    setShowCoachMark(false);
    try {
      window.localStorage.setItem(COACH_MARK_KEY, '1');
    } catch {
      // ignore
    }
  };

  // undo 토스트 카운트다운 (1초마다 강제 리렌더)
  useEffect(() => {
    if (!undoToast) return;
    const interval = window.setInterval(() => {
      if (Date.now() >= undoToast.expiresAt) {
        setUndoToast(null);
        window.clearInterval(interval);
      } else {
        forceTick((t) => t + 1);
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [undoToast]);

  // 편집 모드 OFF → 그리드 설정 팝오버 자동 닫힘
  useEffect(() => {
    if (!isEditMode) {
      setShowGridSettings(false);
    }
  }, [isEditMode]);

  if (!config) {
    // 첫 로딩 중: 빈 카드로 표시 (skeleton). 다른 위젯 카드들도 동일 패턴.
    return null;
  }

  const handleApplyPlan = (plan: GridResizePlan) => {
    if (plan.truncated.length > 0) {
      // 잘림 있음 → 사용자 확인 모달 경유
      setPendingPlan(plan);
      setShowGridSettings(false);
    } else {
      // 잘림 없음 → 즉시 적용
      void applyGridResize(plan).then(() => {
        // undo 토스트 노출
        setUndoToast({ expiresAt: Date.now() + UNDO_TOAST_DURATION_MS });
      });
      setShowGridSettings(false);
    }
  };

  const handleConfirmPendingPlan = () => {
    if (!pendingPlan) return;
    void applyGridResize(pendingPlan).then(() => {
      setUndoToast({ expiresAt: Date.now() + UNDO_TOAST_DURATION_MS });
    });
    setPendingPlan(null);
  };

  const handleUndo = async () => {
    const ok = await undo();
    if (ok) {
      setUndoToast(null);
    }
  };

  const cellCount = config.cols * config.rows;
  const undoSecondsLeft = undoToast
    ? Math.max(0, Math.ceil((undoToast.expiresAt - Date.now()) / 1000))
    : 0;

  return (
    <div className="rounded-xl bg-transparent p-4 h-full flex flex-col relative">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h3 className="text-sm font-bold text-sp-text flex items-center gap-1.5">
          <span aria-hidden="true">📌</span>
          바탕화면 정리
        </h3>
        <div className="flex items-center gap-1">
          {/* ⚙️ 그리드 설정 — 편집 모드에서만 노출 */}
          {isEditMode && (
            <button
              ref={settingsBtnRef}
              type="button"
              onClick={() => setShowGridSettings((s) => !s)}
              aria-label="그리드 설정"
              aria-expanded={showGridSettings}
              className={[
                'p-1 rounded transition-colors motion-reduce:transition-none',
                showGridSettings
                  ? 'text-sp-accent bg-sp-accent/15'
                  : 'text-sp-muted hover:text-sp-text',
              ].join(' ')}
              title="그리드 설정"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                settings
              </span>
            </button>
          )}
          {/* ✏️ 편집 모드 토글 */}
          <button
            type="button"
            onClick={() => setIsEditMode((m) => !m)}
            aria-label={isEditMode ? '편집 모드 종료' : '편집 모드'}
            aria-pressed={isEditMode}
            className={[
              'p-1 rounded transition-colors motion-reduce:transition-none',
              isEditMode
                ? 'text-sp-accent bg-sp-accent/15'
                : 'text-sp-muted hover:text-sp-text',
            ].join(' ')}
            title={isEditMode ? '편집 종료' : '편집'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              {isEditMode ? 'close' : 'edit'}
            </span>
          </button>
        </div>
      </div>

      {/* 비-Windows 안내 */}
      {!isWindows && (
        <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-sp-highlight/10 border border-sp-highlight/30 shrink-0">
          <p className="text-xs text-sp-highlight leading-snug">
            Windows 전용 기능 — 그리드와 제목은 미리 설정할 수 있어요
          </p>
        </div>
      )}

      {/* 모드 전환 안내 배너 — Windows + native-desktop 아닐 때만.
          Design §3.3.2 — 위젯 모드/대시보드에서는 박스 그리드만 보이고 실제 분류
          동작은 native-desktop 모드에서만 일어나므로 사용자에게 모드 전환을 권유. */}
      {isWindows && !isNativeDesktopMode && (
        <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-sp-card/60 border border-sp-border shrink-0 flex items-center gap-2">
          <p className="text-xs text-sp-muted leading-snug flex-1">
            💡 박스 위로 바탕화면 아이콘을 직접 분류하려면{' '}
            <span className="text-sp-text font-bold">바탕화면 아이콘 아래 모드</span>가 필요해요. 설정에서 켤 수 있어요.
          </p>
          <button
            type="button"
            onClick={() => {
              // 'settings#widget' fragment로 위젯 탭 직접 진입.
              // App.tsx의 onNavigateToPage 핸들러가 fragment를 파싱해 SettingsPage를
              // 'widget' 탭으로 mount한다.
              void window.electronAPI?.navigateToPage?.('settings#widget');
            }}
            className="text-xs text-sp-accent hover:text-sp-accent/80 font-bold whitespace-nowrap transition-colors motion-reduce:transition-none"
            aria-label="설정 열기"
          >
            설정 열기 →
          </button>
        </div>
      )}

      {/* 그리드 본문 */}
      <div
        className="flex-1 min-h-0 grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${config.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${config.rows}, minmax(0, 1fr))`,
        }}
        role="group"
        aria-label={`${config.cols}×${config.rows} 카테고리 그리드`}
      >
        {Array.from({ length: cellCount }, (_, i) => (
          <DesktopOrganizeBox
            key={i}
            index={i}
            title={config.boxTitles[i] ?? ''}
            isEditMode={isEditMode}
            isTransparent={config.boxTransparent}
            onTitleChange={(idx, title) => void setTitle(idx, title)}
          />
        ))}
      </div>

      {/* 1회성 코치마크 */}
      {showCoachMark && !isEditMode && (
        <div
          role="dialog"
          aria-label="처음 사용 안내"
          className="absolute bottom-3 left-1/2 -translate-x-1/2 max-w-[90%] px-3 py-2 rounded-lg bg-sp-bg/95 border border-sp-accent/40 shadow-2xl z-10 motion-reduce:transition-none"
        >
          <p className="text-xs text-sp-text leading-snug mb-1.5">
            박스 위에 바탕화면 아이콘을 올려놓아 분류할 수 있어요.<br />
            파일을 끌어다 놓는 기능은 지원하지 않아요.
          </p>
          <button
            type="button"
            onClick={dismissCoachMark}
            className="text-xs text-sp-accent hover:text-sp-accent/80 transition-colors motion-reduce:transition-none"
          >
            알겠어요
          </button>
        </div>
      )}

      {/* 그리드 설정 팝오버 */}
      {showGridSettings && isEditMode && (
        <DesktopOrganizeGridSettings
          anchorRect={settingsBtnRef.current?.getBoundingClientRect() ?? null}
          currentConfig={config}
          planResize={planResize}
          onApply={handleApplyPlan}
          onToggleBoxTransparent={(v) => void setBoxTransparent(v)}
          onClose={() => setShowGridSettings(false)}
        />
      )}

      {/* 그리드 축소 확인 모달 */}
      <ConfirmGridResizeModal
        isOpen={pendingPlan !== null}
        plan={pendingPlan}
        onCancel={() => setPendingPlan(null)}
        onConfirm={handleConfirmPendingPlan}
      />

      {/* 5초 undo 토스트 */}
      {undoToast && undoSecondsLeft > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="absolute bottom-3 right-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-sp-bg/95 border border-sp-border shadow-2xl z-10"
        >
          <span className="text-xs text-sp-text">
            그리드를 변경했어요 ({undoSecondsLeft}초)
          </span>
          <button
            type="button"
            onClick={() => void handleUndo()}
            className="text-xs text-sp-accent hover:text-sp-accent/80 font-medium transition-colors motion-reduce:transition-none"
          >
            되돌리기
          </button>
        </div>
      )}
    </div>
  );
}
