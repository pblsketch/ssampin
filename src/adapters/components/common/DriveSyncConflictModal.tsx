import type { DriveSyncConflict } from '@domain/entities/DriveSyncState';
import { Modal } from '@adapters/components/common/Modal';
import { Notice } from '@adapters/components/common/Notice';
import { useRegisterModal } from '@adapters/hooks/useRegisterModal';

/** 동기화 파일명 → 한글 표시 매핑 */
const FILE_LABELS: Record<string, string> = {
  settings: '설정',
  'class-schedule': '학급 시간표',
  'teacher-schedule': '교사 시간표',
  students: '학생 명렬표',
  seating: '좌석배치',
  events: '일정',
  memos: '메모',
  todos: '할 일',
  'student-records': '담임 메모장',
  bookmarks: '북마크',
  surveys: '설문/체크리스트',
  'seat-constraints': '좌석 제약조건',
  'teaching-classes': '수업 반',
  dday: 'D-Day',
  'curriculum-progress': '수업 진도',
  attendance: '출석',
  consultations: '상담 예약',
  // 노트 (note-cloud-sync PDCA)
  'note-notebooks': '노트북 목록',
  'note-sections': '노트 섹션',
  'note-pages-meta': '노트 페이지 목록',
  // 동적 키(note-body--{pageId})는 본 매핑에 포함되지 않으며, line 70의 fallback으로
  // pageId가 그대로 표시된다. 페이지 제목 표시는 후속 UX 개선 항목.
};

interface Props {
  conflicts: DriveSyncConflict[];
  onResolve: (conflict: DriveSyncConflict, resolution: 'local' | 'remote') => void;
  onClose: () => void;
  /** 해결이 실패했거나 최신 상태로 다시 확인했을 때의 안내. 없으면 아무것도 보이지 않는다. */
  error?: string | null;
  /** 지금 처리 중인 파일 — 그동안 모든 단추를 잠근다(두 번 눌러 생기는 엇갈림 방지). */
  resolvingFilename?: string | null;
}

/**
 * 충돌 시각 표시. 시각을 알 수 없는 충돌(장부에 기준이 없는 파일 등)은 값이 날짜가 아니라
 * 'unknown'·'content-mismatch' 같은 표식이라, 그대로 Date 에 넣으면 "Invalid Date"가 찍힌다.
 */
function formatConflictTime(value: string): string {
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? '시각 알 수 없음' : time.toLocaleString('ko-KR');
}

export function DriveSyncConflictModal({
  conflicts,
  onResolve,
  onClose,
  error = null,
  resolvingFilename = null,
}: Props) {
  const busy = resolvingFilename !== null;
  // Phase 3: ModalCoordinator 큐 등록 (DRIVE_CONFLICT priority)
  const isHead = useRegisterModal('DRIVE_CONFLICT', conflicts.length > 0);
  return (
    <Modal
      isOpen={conflicts.length > 0 && isHead}
      onClose={onClose}
      title="동기화 충돌"
      srOnlyTitle
      size="lg"
      closeOnBackdrop={false}
    >
      <div className="flex flex-col max-h-[calc(100vh-96px)]">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-sp-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <span className="material-symbols-outlined text-amber-400">merge_type</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-sp-text">동기화 충돌</h3>
              <p className="text-xs text-sp-muted">
                {conflicts.length}개 파일에서 충돌이 발생했습니다
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="p-1 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* 해결 실패·다시 확인 안내 — 목록이 길어도 밀려나지 않게 스크롤 영역 밖에 둔다 */}
        {error && (
          <div role="alert" className="px-6 pt-4">
            <Notice variant="warning">{error}</Notice>
          </div>
        )}

        {/* 충돌 목록 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {conflicts.map((conflict) => (
            <div
              key={conflict.filename}
              className="p-4 rounded-lg bg-sp-surface border border-sp-border"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-sp-accent text-icon-md">
                  description
                </span>
                <span className="text-sm font-bold text-sp-text">
                  {FILE_LABELS[conflict.filename] ?? conflict.filename}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs mb-4">
                <div className="p-2 rounded bg-sp-bg">
                  <p className="text-sp-muted mb-1">이 기기 ({conflict.localDeviceName})</p>
                  <p className="text-sp-text font-medium">
                    {formatConflictTime(conflict.localModified)}
                  </p>
                </div>
                <div className="p-2 rounded bg-sp-bg">
                  <p className="text-sp-muted mb-1">클라우드 ({conflict.remoteDeviceName})</p>
                  <p className="text-sp-text font-medium">
                    {formatConflictTime(conflict.remoteModified)}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onResolve(conflict, 'local')}
                  disabled={busy}
                  className="flex-1 px-3 py-2 rounded-lg bg-sp-accent/10 text-sp-accent hover:bg-sp-accent/20 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {resolvingFilename === conflict.filename ? '처리 중…' : '이 기기 유지'}
                </button>
                <button
                  type="button"
                  onClick={() => onResolve(conflict, 'remote')}
                  disabled={busy}
                  className="flex-1 px-3 py-2 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  클라우드로 대체
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
