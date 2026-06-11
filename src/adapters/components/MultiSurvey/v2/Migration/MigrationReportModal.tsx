/**
 * MigrationReportModal — v1 → v2 마이그레이션 결과 알림 모달
 *
 * Phase B B.6 (component-tree §5):
 *  - useMigrationReport().shouldShow === true 일 때 1회 표시.
 *  - 성공 톤(failedCount === 0)/경고 톤(failedCount > 0) 분기.
 *  - "다시 안 보기" 체크 → dismissForever.
 *  - ESC / 백드롭 클릭 / X 버튼으로 닫기.
 *  - 백업 경로 안내, 실패 사유 리스트(최대 5개 노출 + 토글).
 *
 * 절대 금지: 하드코딩 HEX, any, 영어 UI 텍스트, barrel(@domain/entities/multiSurvey) import.
 *
 * TODO(Plan D10): 다중 모달이 동시에 떠야 할 때 ModalCoordinator 우선순위 큐에
 * 등록한다. 현재는 단일 Dialog 패턴 — `shouldShow` 단일 신호만 구독.
 */

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import type {
  FailedMigrationItem,
  MigrationReport,
} from '@domain/entities/multiSurvey/MigrationReport';
import { useMigrationReport } from '@adapters/hooks/useMigrationReport';

/** 실패 사유 리스트 초기 노출 개수 */
const FAILED_PREVIEW_COUNT = 5;

interface MigrationReportModalProps {
  /**
   * 테스트/스토리북 주입용. 미지정 시 `useMigrationReport()` 결과를 사용.
   */
  readonly api?: ReturnType<typeof useMigrationReport>;
}

interface ResolvedApi {
  readonly report: MigrationReport | null;
  readonly shouldShow: boolean;
  readonly dismiss: () => void;
  readonly dismissForever: () => void;
}

/**
 * 본체 — Hook 호출은 컴포넌트 최상단(조건부 호출 금지).
 * 테스트에서는 `api` prop으로 주입해 Hook 분리.
 */
export function MigrationReportModal({ api }: MigrationReportModalProps = {}): JSX.Element | null {
  // Hook은 항상 호출하되, 외부 주입(api)이 있으면 그것을 우선 사용한다.
  const hookApi = useMigrationReport();
  const resolved: ResolvedApi = api ?? hookApi;

  const { report, shouldShow, dismiss, dismissForever } = resolved;

  const [dismissForeverChecked, setDismissForeverChecked] = useState<boolean>(false);
  const [showAllFailed, setShowAllFailed] = useState<boolean>(false);

  const headingId = useId();

  const handleClose = useCallback((): void => {
    if (dismissForeverChecked) {
      dismissForever();
    } else {
      dismiss();
    }
  }, [dismissForeverChecked, dismiss, dismissForever]);

  // ESC 키로 닫기
  useEffect(() => {
    if (!shouldShow) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [shouldShow, handleClose]);

  const visibleFailedItems: readonly FailedMigrationItem[] = useMemo(() => {
    if (!report) return [];
    if (showAllFailed) return report.failedItems;
    return report.failedItems.slice(0, FAILED_PREVIEW_COUNT);
  }, [report, showAllFailed]);

  if (!shouldShow || !report) return null;

  const isAllSuccess = report.failedCount === 0;
  const remainingFailedCount = Math.max(report.failedItems.length - visibleFailedItems.length, 0);

  // 톤: 성공이면 sp-accent, 부분 실패면 sp-highlight 강조.
  const accentRingClass = isAllSuccess ? 'ring-1 ring-sp-accent/40' : 'ring-1 ring-sp-highlight/50';
  const accentTextClass = isAllSuccess ? 'text-sp-accent' : 'text-sp-highlight';
  const headlineLabel = isAllSuccess ? '변환 완료' : '일부 항목 보관됨';

  const overlay = (
    <div
      className="fixed inset-0 z-sp-modal flex items-center justify-center bg-black/60 backdrop-blur-sm motion-reduce:backdrop-blur-none px-4"
      data-migration-report-backdrop
      onMouseDown={(e) => {
        // 백드롭 자체를 mousedown한 경우에만 닫기 (본체 드래그 보호).
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className={[
          'relative w-full max-w-lg max-h-[80vh] flex flex-col',
          'bg-sp-card border border-sp-border rounded-xl shadow-sp-lg',
          accentRingClass,
          'animate-scale-in motion-reduce:animate-none',
          'transition-colors duration-sp-base ease-sp-out',
        ].join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="shrink-0 flex items-start justify-between gap-3 px-5 py-4 border-b border-sp-border">
          <div className="min-w-0">
            <p className={`text-xs font-sp-medium ${accentTextClass}`}>{headlineLabel}</p>
            <h2 id={headingId} className="mt-0.5 text-base font-sp-bold text-sp-text">
              마이그레이션 결과
            </h2>
            <p className="mt-1 text-detail text-sp-muted">
              총 <span className="text-sp-text font-sp-medium">{report.totalCount}</span>건 중{' '}
              <span className={`${accentTextClass} font-sp-medium`}>{report.successCount}</span>건
              변환, <span className="text-sp-text font-sp-medium">{report.failedCount}</span>건 보관
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="모달 닫기"
            className="shrink-0 p-1.5 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors duration-sp-base ease-sp-out"
          >
            <span className="material-symbols-outlined text-icon-lg" aria-hidden="true">
              close
            </span>
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 백업 경로 */}
          <section
            aria-label="백업 위치"
            className="rounded-lg border border-sp-border bg-sp-surface/40 px-3 py-2.5"
          >
            <p className="text-detail text-sp-muted">백업 위치</p>
            <p className="mt-0.5 text-xs text-sp-text font-mono break-all">{report.backupPath}</p>
            <p className="mt-1 text-detail text-sp-muted">
              원본 v1 데이터는 위 경로에 안전하게 보관되었습니다.
            </p>
          </section>

          {/* 실패 사유 리스트 */}
          {report.failedItems.length > 0 && (
            <section aria-label="변환 실패 항목" className="space-y-2">
              <h3 className="text-xs font-sp-semibold text-sp-text">
                보관된 항목
                <span className="ml-1 text-sp-muted font-sp-normal">
                  ({report.failedItems.length}건)
                </span>
              </h3>
              <ul className="space-y-1.5">
                {visibleFailedItems.map((item) => (
                  <li
                    key={item.sourceId}
                    className="rounded-lg border border-sp-border bg-sp-surface/30 px-3 py-2"
                  >
                    <p className="text-detail text-sp-muted font-mono break-all">{item.sourceId}</p>
                    <p className="mt-0.5 text-xs text-sp-text">{item.reason}</p>
                  </li>
                ))}
              </ul>
              {remainingFailedCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllFailed(true)}
                  className="text-detail text-sp-muted hover:text-sp-text underline-offset-2 hover:underline transition-colors duration-sp-base ease-sp-out"
                >
                  외 {remainingFailedCount}건 더보기
                </button>
              )}
              {showAllFailed && report.failedItems.length > FAILED_PREVIEW_COUNT && (
                <button
                  type="button"
                  onClick={() => setShowAllFailed(false)}
                  className="text-detail text-sp-muted hover:text-sp-text underline-offset-2 hover:underline transition-colors duration-sp-base ease-sp-out"
                >
                  접기
                </button>
              )}
            </section>
          )}

          {/* 안내 문구 */}
          {isAllSuccess ? (
            <p className="text-xs text-sp-muted">
              모든 v1 세션이 v2 포맷으로 안전하게 변환되었습니다.
            </p>
          ) : (
            <p className="text-xs text-sp-muted">
              보관된 항목은 v2로 변환되지 않았지만, 백업 경로에서 원본을 그대로 확인할 수 있습니다.
            </p>
          )}
        </div>

        {/* 푸터 */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-3 border-t border-sp-border">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dismissForeverChecked}
              onChange={(e) => setDismissForeverChecked(e.target.checked)}
              className="w-4 h-4 rounded border-sp-border bg-sp-surface text-sp-accent focus:ring-sp-accent"
            />
            <span className="text-xs text-sp-muted">다시 안 보기</span>
          </label>
          <button
            type="button"
            onClick={handleClose}
            className={[
              'px-4 py-2 rounded-lg text-sm font-sp-semibold',
              'bg-sp-accent text-sp-accent-fg hover:opacity-90',
              'transition-all duration-sp-base ease-sp-out active:scale-95',
            ].join(' ')}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );

  // SSR/테스트 환경 호환: document 없으면 inline 렌더.
  if (typeof document === 'undefined') {
    return overlay;
  }
  return createPortal(overlay, document.body);
}

export default MigrationReportModal;
