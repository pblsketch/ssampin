import type { DriveSyncConflict } from '@domain/entities/DriveSyncState';

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
};

interface Props {
  conflicts: DriveSyncConflict[];
  onResolve: (conflict: DriveSyncConflict, resolution: 'local' | 'remote') => void;
  onClose: () => void;
}

export function DriveSyncConflictModal({ conflicts, onResolve, onClose }: Props) {
  if (conflicts.length === 0) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-sp-card rounded-xl ring-1 ring-sp-border w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-sp-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <span className="material-symbols-outlined text-amber-400">merge_type</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-sp-text">동기화 충돌</h3>
              <p className="text-xs text-sp-muted">{conflicts.length}개 파일에서 충돌이 발생했습니다</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* 충돌 목록 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {conflicts.map((conflict) => (
            <div key={conflict.filename} className="p-4 rounded-lg bg-sp-surface border border-sp-border">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-sp-accent text-[18px]">description</span>
                <span className="text-sm font-bold text-sp-text">
                  {FILE_LABELS[conflict.filename] ?? conflict.filename}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs mb-4">
                <div className="p-2 rounded bg-sp-bg">
                  <p className="text-sp-muted mb-1">이 기기 ({conflict.localDeviceName})</p>
                  <p className="text-sp-text font-medium">
                    {new Date(conflict.localModified).toLocaleString('ko-KR')}
                  </p>
                </div>
                <div className="p-2 rounded bg-sp-bg">
                  <p className="text-sp-muted mb-1">클라우드 ({conflict.remoteDeviceName})</p>
                  <p className="text-sp-text font-medium">
                    {new Date(conflict.remoteModified).toLocaleString('ko-KR')}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onResolve(conflict, 'local')}
                  className="flex-1 px-3 py-2 rounded-lg bg-sp-accent/10 text-sp-accent hover:bg-sp-accent/20 text-xs font-medium transition-colors"
                >
                  이 기기 유지
                </button>
                <button
                  type="button"
                  onClick={() => onResolve(conflict, 'remote')}
                  className="flex-1 px-3 py-2 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-xs font-medium transition-colors"
                >
                  클라우드로 대체
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
