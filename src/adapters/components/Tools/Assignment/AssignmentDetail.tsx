import { useState, useEffect, useRef, useCallback } from 'react';
import { useAssignmentStore } from '@adapters/stores/useAssignmentStore';
import { useOnlineStatus } from '@adapters/hooks/useOnlineStatus';
import { useToastStore } from '@adapters/components/common/Toast';
import type { SubmissionDetail } from '@usecases/assignment/GetSubmissions';
import { ShareLinkModal } from './ShareLinkModal';
import { OfflineNotice } from './OfflineNotice';
import ExcelJS from 'exceljs';

interface AssignmentDetailProps {
  onBack: () => void;
}

function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function TextViewerModal({ studentNumber, studentName, text, onClose }: {
  studentNumber: number;
  studentName: string;
  text: string;
  onClose: () => void;
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className={`bg-sp-card rounded-2xl ring-1 ring-sp-border shadow-2xl pointer-events-auto flex flex-col transition-all ${
          isFullscreen ? 'w-full h-full max-w-none rounded-none' : 'w-full max-w-lg max-h-[80vh]'
        }`}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-sp-border/40 shrink-0">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sp-accent text-[20px]">edit_note</span>
              <h3 className="text-base font-bold text-sp-text">
                {studentNumber}번 {studentName}
              </h3>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-1.5 rounded-lg hover:bg-sp-border/30 transition-colors"
                aria-label={isFullscreen ? '축소' : '전체화면'}
              >
                <span className="material-symbols-outlined text-sp-muted text-[18px]">
                  {isFullscreen ? 'close_fullscreen' : 'open_in_full'}
                </span>
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-sp-border/30 transition-colors"
                aria-label="닫기"
              >
                <span className="material-symbols-outlined text-sp-muted text-[18px]">close</span>
              </button>
            </div>
          </div>
          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <p className="text-sm text-sp-text whitespace-pre-wrap leading-relaxed">{text}</p>
          </div>
          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-sp-border/40 shrink-0">
            <span className="text-xs text-sp-muted">{text.length}자</span>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(text);
              }}
              className="px-3 py-1.5 text-xs text-sp-accent hover:bg-sp-accent/10 rounded-lg transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[14px]">content_copy</span>
              복사
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function SubmissionRow({ detail, onViewText }: { detail: SubmissionDetail; onViewText?: (d: SubmissionDetail) => void }) {
  const statusConfig = {
    submitted: { icon: '✅', color: 'text-emerald-400' },
    late: { icon: '⚠️', color: 'text-amber-400' },
    missing: { icon: '❌', color: 'text-red-400' },
  };
  const config = statusConfig[detail.status];

  const dateText = detail.submission
    ? (() => {
        const d = new Date(detail.submission.submittedAt);
        return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      })()
    : null;

  const hasText = !!detail.submission?.textContent;

  return (
    <div className="flex items-center px-5 py-3 hover:bg-sp-surface/50 transition-colors">
      <span className="text-sp-muted text-sm w-12">{detail.studentNumber}번</span>
      <span className="text-sp-text font-medium text-sm w-20">{detail.studentName}</span>
      <span className="mx-3">{config.icon}</span>
      {detail.status === 'missing' ? (
        <span className={`text-sm ${config.color}`}>미제출</span>
      ) : (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-sp-muted">{dateText}</span>
          {detail.submission?.fileName && (
            <span className="text-sp-muted/70 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">description</span>
              {detail.submission.fileName}
            </span>
          )}
          {hasText && (
            <button
              onClick={() => onViewText?.(detail)}
              className="text-sp-accent/80 hover:text-sp-accent flex items-center gap-1 text-xs font-medium transition-colors px-2 py-0.5 rounded bg-sp-accent/10 hover:bg-sp-accent/20"
            >
              <span className="material-symbols-outlined text-[14px]">edit_note</span>
              텍스트 보기
            </button>
          )}
          {detail.status === 'late' && (
            <span className="text-xs px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded font-medium">지각</span>
          )}
        </div>
      )}
    </div>
  );
}

export function AssignmentDetail({ onBack }: AssignmentDetailProps) {
  const {
    selectedAssignmentId,
    currentAssignment,
    submissions,
    isLoading,
    error,
    loadAssignmentDetail,
    startSubmissionPolling,
    deleteAssignment,
    getMissingListText,
  } = useAssignmentStore();
  const showToast = useToastStore((s) => s.show);

  const { isOnline, checkOnline } = useOnlineStatus();
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [textViewerTarget, setTextViewerTarget] = useState<SubmissionDetail | null>(null);
  const pollingCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!selectedAssignmentId) {
      onBack();
      return;
    }

    if (!isOnline) return;

    void loadAssignmentDetail(selectedAssignmentId).then(() => {
      setLastUpdated(new Date());
    });

    pollingCleanupRef.current = startSubmissionPolling(selectedAssignmentId);

    return () => {
      if (pollingCleanupRef.current) {
        pollingCleanupRef.current();
      }
    };
  }, [selectedAssignmentId, isOnline]);

  // Toast notification for new submissions
  useEffect(() => {
    function handleNewSubmission(e: Event) {
      const { names, count } = (e as CustomEvent<{ names: string; count: number }>).detail;
      showToast(`${names}이(가) 과제를 제출했습니다`, 'success');
      // Suppress unused variable warning
      void count;
    }
    window.addEventListener('ssampin:new-submission', handleNewSubmission);
    return () => window.removeEventListener('ssampin:new-submission', handleNewSubmission);
  }, [showToast]);

  async function handleCopyMissing() {
    if (!selectedAssignmentId) return;
    const text = await getMissingListText(selectedAssignmentId);
    await navigator.clipboard.writeText(text);
    showToast('미제출자 목록이 복사되었습니다', 'success');
  }

  function handleShareLink() {
    setShowShareModal(true);
  }

  async function handleRefresh() {
    if (!selectedAssignmentId) return;
    await loadAssignmentDetail(selectedAssignmentId);
    setLastUpdated(new Date());
  }

  const handleExportSubmissions = useCallback(async () => {
    if (!currentAssignment) return;

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('제출 현황');

    // 헤더
    const headerRow = ws.addRow(['번호', '이름', '상태', '제출일시', '파일명', '텍스트 내용']);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // 데이터
    const statusLabel = { submitted: '제출', late: '지각 제출', missing: '미제출' } as const;
    for (const detail of submissions) {
      const dateText = detail.submission
        ? new Date(detail.submission.submittedAt).toLocaleString('ko-KR')
        : '';
      ws.addRow([
        detail.studentNumber,
        detail.studentName,
        statusLabel[detail.status],
        dateText,
        detail.submission?.fileName ?? '',
        detail.submission?.textContent ?? '',
      ]);
    }

    // 열 너비
    ws.getColumn(1).width = 8;
    ws.getColumn(2).width = 12;
    ws.getColumn(3).width = 10;
    ws.getColumn(4).width = 20;
    ws.getColumn(5).width = 25;
    ws.getColumn(6).width = 50;

    // 텍스트 내용 열 줄바꿈
    ws.getColumn(6).alignment = { wrapText: true, vertical: 'top' };

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentAssignment.title}_제출현황.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('엑셀 파일이 다운로드되었습니다', 'success');
  }, [currentAssignment, submissions, showToast]);

  async function handleDelete() {
    if (!selectedAssignmentId) return;
    await deleteAssignment(selectedAssignmentId);
    onBack();
  }

  if (!isOnline) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={onBack} aria-label="뒤로" className="p-2 rounded-lg hover:bg-sp-card transition-colors">
              <span className="material-symbols-outlined text-sp-muted">arrow_back</span>
            </button>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <span>📝</span>
              <span>과제 상세</span>
            </h1>
          </div>
        </div>
        <OfflineNotice
          onRetry={() => {
            checkOnline();
            if (navigator.onLine && selectedAssignmentId) {
              void loadAssignmentDetail(selectedAssignmentId);
            }
          }}
        />
      </div>
    );
  }

  if (isLoading && !currentAssignment) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onBack} aria-label="뒤로" className="p-2 rounded-lg hover:bg-sp-card transition-colors">
            <span className="material-symbols-outlined text-sp-muted">arrow_back</span>
          </button>
          <div className="h-7 bg-sp-border/50 rounded w-40 animate-pulse" />
        </div>
        <div className="h-4 bg-sp-border/30 rounded w-60 mb-6 ml-12 animate-pulse" />
        <div className="bg-sp-card rounded-xl border border-sp-border/50 overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-sp-border/30">
            <div className="h-4 bg-sp-border/50 rounded w-20 animate-pulse" />
          </div>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center px-5 py-3 border-b border-sp-border/20">
              <div className="h-4 bg-sp-border/30 rounded w-10 mr-3 animate-pulse" />
              <div className="h-4 bg-sp-border/30 rounded w-16 mr-4 animate-pulse" />
              <div className="h-4 bg-sp-border/30 rounded w-24 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    const isGoogleError = error.includes('Google 계정');
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onBack} aria-label="뒤로" className="p-2 rounded-lg hover:bg-sp-card transition-colors">
            <span className="material-symbols-outlined text-sp-muted">arrow_back</span>
          </button>
          <h1 className="text-2xl font-bold text-white">과제 상세</h1>
        </div>
        {isGoogleError ? (
          <div className="p-6 bg-sp-card rounded-xl border border-sp-border/50 text-center">
            <div className="text-4xl mb-3">🔗</div>
            <h3 className="text-base font-bold text-sp-text mb-2">Google 계정 재연결이 필요합니다</h3>
            <p className="text-sm text-sp-muted mb-5">
              보안 업데이트로 인해 계정을 다시 연결해야 합니다.
            </p>
            <button
              onClick={onBack}
              className="px-6 py-3 bg-sp-accent text-white rounded-lg hover:bg-sp-accent/80 transition-colors flex items-center gap-2 mx-auto font-medium"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              목록으로 돌아가기
            </button>
          </div>
        ) : (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center justify-between" role="alert">
            <span className="text-red-400 text-sm">{error}</span>
            <button
              onClick={() => { if (selectedAssignmentId) void loadAssignmentDetail(selectedAssignmentId); }}
              className="text-red-400 hover:text-red-300 text-sm font-medium ml-3 whitespace-nowrap"
            >
              다시 시도
            </button>
          </div>
        )}
      </div>
    );
  }

  if (!currentAssignment) {
    return null;
  }

  const submittedCount = submissions.filter((s) => s.status !== 'missing').length;
  const totalCount = submissions.length;

  const deadline = new Date(currentAssignment.deadline);
  const deadlineText = `${deadline.getMonth() + 1}/${deadline.getDate()} ${String(deadline.getHours()).padStart(2, '0')}:${String(deadline.getMinutes()).padStart(2, '0')}`;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <button onClick={onBack} aria-label="뒤로" className="p-2 rounded-lg hover:bg-sp-card transition-colors">
            <span className="material-symbols-outlined text-sp-muted">arrow_back</span>
          </button>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span>📝</span>
            <span>{currentAssignment.title}</span>
          </h1>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            aria-label="메뉴"
            className="p-2 rounded-lg hover:bg-sp-card transition-colors"
          >
            <span className="material-symbols-outlined text-sp-muted">more_vert</span>
          </button>
          {showMenu && (
            <div className="absolute right-0 top-10 bg-sp-card border border-sp-border rounded-lg shadow-xl py-1 min-w-[140px] z-10">
              <button
                onClick={() => { setShowMenu(false); setShowDeleteConfirm(true); }}
                className="w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-sp-border/30 transition-colors"
              >
                과제 삭제
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Info line */}
      <div className="flex items-center gap-3 text-sm text-sp-muted mb-6 ml-12">
        <span>{currentAssignment.target.name} ({currentAssignment.totalCount}명)</span>
        <span className="text-sp-border">│</span>
        <span>마감: {deadlineText}</span>
        <span className="text-sp-border">│</span>
        <span>제출: {submittedCount}/{totalCount}명</span>
      </div>

      {/* Assignment description */}
      {currentAssignment.description && (
        <div className="bg-sp-surface/50 rounded-lg px-5 py-3 mb-4 ml-12">
          <p className="text-sm text-sp-muted leading-relaxed">{currentAssignment.description}</p>
        </div>
      )}

      {/* Submission list */}
      <div className="bg-sp-card rounded-xl border border-sp-border/50 overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-sp-border/30">
          <h2 className="text-sm font-semibold text-sp-muted uppercase tracking-wider">제출 현황</h2>
        </div>
        <div className="divide-y divide-sp-border/20 max-h-[50vh] overflow-y-auto">
          {submissions.map((detail) => (
            <SubmissionRow key={detail.studentId} detail={detail} onViewText={setTextViewerTarget} />
          ))}
          {submissions.length === 0 && (
            <div className="px-5 py-8 text-center text-sp-muted text-sm">
              제출 현황이 없습니다
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => void handleCopyMissing()}
          aria-label="미제출자 복사"
          className="px-4 py-2.5 bg-sp-card border border-sp-border rounded-lg text-sp-text text-sm hover:bg-sp-border/40 transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[16px]">content_copy</span>
          미제출자 복사
        </button>
        <button
          onClick={handleShareLink}
          aria-label="링크 공유"
          className="px-4 py-2.5 bg-sp-card border border-sp-border rounded-lg text-sp-text text-sm hover:bg-sp-border/40 transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[16px]">link</span>
          링크 공유
        </button>
        <button
          onClick={() => void handleExportSubmissions()}
          aria-label="엑셀 내보내기"
          className="px-4 py-2.5 bg-sp-card border border-sp-border rounded-lg text-sp-text text-sm hover:bg-sp-border/40 transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[16px]">download</span>
          내보내기
        </button>
        <button
          onClick={() => void handleRefresh()}
          aria-label="새로고침"
          className="px-4 py-2.5 bg-sp-card border border-sp-border rounded-lg text-sp-text text-sm hover:bg-sp-border/40 transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          새로고침
        </button>
      </div>

      {/* Footer status */}
      <p className="text-xs text-sp-muted/60 text-center">
        30초마다 자동 새로고침 · 마지막 업데이트: {lastUpdated ? formatTime(lastUpdated) : '--:--:--'}
      </p>

      {/* Share link modal */}
      {currentAssignment && (
        <ShareLinkModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          assignment={currentAssignment}
        />
      )}

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowDeleteConfirm(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-sp-card rounded-2xl ring-1 ring-sp-border shadow-2xl w-full max-w-sm pointer-events-auto p-6">
              <h3 className="text-lg font-bold text-sp-text mb-2">{`'${currentAssignment.title}' 과제를 삭제하시겠습니까?`}</h3>
              <p className="text-sm text-sp-muted mb-6">삭제된 과제는 복구할 수 없습니다. 드라이브에 저장된 파일은 유지됩니다.</p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-sp-muted hover:text-sp-text rounded-lg hover:bg-sp-border/30 transition-colors text-sm"
                >
                  취소
                </button>
                <button
                  onClick={() => void handleDelete()}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Text viewer modal */}
      {textViewerTarget?.submission?.textContent && (
        <TextViewerModal
          studentNumber={textViewerTarget.studentNumber}
          studentName={textViewerTarget.studentName}
          text={textViewerTarget.submission.textContent}
          onClose={() => setTextViewerTarget(null)}
        />
      )}
    </div>
  );
}
