import type { SyncResult } from '@adapters/stores/useDriveSyncStore';

const SYNC_FILE_LABELS: Record<string, string> = {
  'settings': '설정',
  'class-schedule': '학급 시간표',
  'teacher-schedule': '교사 시간표',
  'students': '학생 명단 (담임)',
  'seating': '좌석 배치',
  'events': '일정',
  'memos': '메모',
  'todos': '할 일',
  'student-records': '학생 기록',
  'bookmarks': '즐겨찾기',
  'surveys': '설문',
  'seat-constraints': '좌석 제한',
  'teaching-classes': '수업 관리 (학급)',
  'dday': 'D-Day',
  'curriculum-progress': '진도 관리',
  'attendance': '출결',
  'consultations': '상담 기록',
};

function getFileLabel(filename: string): string {
  return SYNC_FILE_LABELS[filename] ?? filename;
}

interface SyncResultSummaryProps {
  result: SyncResult;
  /** 모바일 환경에서 더 컴팩트하게 표시 */
  compact?: boolean;
}

export function SyncResultSummary({ result, compact }: SyncResultSummaryProps) {
  const isUpload = result.direction === 'upload';
  const successList = isUpload ? result.uploaded ?? [] : result.downloaded ?? [];
  const conflictList = result.conflicts ?? [];

  return (
    <div className={`${compact ? 'mt-2 p-2.5' : 'mt-3 p-3'} rounded-xl bg-sp-bg border border-sp-border text-xs`}>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sp-text">
          {isUpload ? '업로드 결과' : '다운로드 결과'}
        </span>
        <span className="text-sp-muted">
          {new Date(result.timestamp).toLocaleTimeString('ko-KR')}
        </span>
      </div>

      {/* 성공 */}
      {successList.length > 0 && (
        <div className="mb-1.5">
          <span className="text-green-400">성공 ({successList.length})</span>
          <span className="text-sp-muted ml-2">
            {successList.map(getFileLabel).join(', ')}
          </span>
        </div>
      )}

      {/* 스킵 */}
      {result.skipped.length > 0 && (
        <div className="mb-1.5">
          <span className="text-sp-muted">변경 없음 ({result.skipped.length})</span>
          <details className="inline">
            <summary className="text-sp-muted cursor-pointer ml-2 hover:text-sp-text transition-colors">
              상세보기
            </summary>
            <span className="text-sp-muted ml-2">
              {result.skipped.map(getFileLabel).join(', ')}
            </span>
          </details>
        </div>
      )}

      {/* 충돌 */}
      {conflictList.length > 0 && (
        <div className="mb-1.5">
          <span className="text-amber-400">충돌 ({conflictList.length})</span>
          <span className="text-sp-muted ml-2">
            {conflictList.map(getFileLabel).join(', ')}
          </span>
        </div>
      )}

      {/* 전체 성공 시 */}
      {successList.length > 0 && result.skipped.length === 0 && conflictList.length === 0 && (
        <div className="text-green-400">모든 데이터가 동기화되었습니다!</div>
      )}

      {/* 전체 스킵 시 */}
      {successList.length === 0 && conflictList.length === 0 && (
        <div className="text-sp-muted">
          {isUpload
            ? '업로드할 변경 사항이 없습니다.'
            : '다운로드할 새 데이터가 없습니다.'}
        </div>
      )}
    </div>
  );
}
