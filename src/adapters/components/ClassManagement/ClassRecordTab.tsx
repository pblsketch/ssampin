import { useState } from 'react';
import { ClassRecordInputView } from './ClassRecordInputView';
import { ClassRecordStatsView } from './ClassRecordStatsView';
import { ClassRecordSearchView } from './ClassRecordSearchView';
import { ClassRecordDraftView } from './ClassRecordDraftView';

type RecordViewMode = 'input' | 'stats' | 'search' | 'draft';

const VIEW_TABS: { id: RecordViewMode; icon: string; label: string }[] = [
  { id: 'input', icon: '✏️', label: '입력' },
  { id: 'stats', icon: '📊', label: '통계' },
  { id: 'search', icon: '🔍', label: '조회' },
  { id: 'draft', icon: '📑', label: '생기부 초안' },
];

interface ClassRecordTabProps {
  classId: string;
  initialStudentViewMode?: 'list' | 'seating';
  onGoToRosterTab?: () => void;
  onGoToSeatingTab?: () => void;
}

export function ClassRecordTab({
  classId,
  initialStudentViewMode,
  onGoToRosterTab,
  onGoToSeatingTab,
}: ClassRecordTabProps) {
  const [viewMode, setViewMode] = useState<RecordViewMode>('input');

  return (
    <div className="h-full flex flex-col gap-3">
      {/* 모드 탭 */}
      <div className="flex items-center">
        <div
          className="flex gap-1 bg-sp-surface rounded-lg p-1"
          role="tablist"
          aria-label="수업 기록 보기 선택"
        >
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={viewMode === tab.id}
              onClick={() => setViewMode(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent ${
                viewMode === tab.id ? 'bg-sp-accent text-white' : 'text-sp-muted hover:text-sp-text'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 뷰 콘텐츠 */}
      <div className="flex-1 min-h-0">
        {viewMode === 'input' && (
          <ClassRecordInputView
            classId={classId}
            initialStudentViewMode={initialStudentViewMode}
            onGoToRosterTab={onGoToRosterTab}
            onGoToSeatingTab={onGoToSeatingTab}
          />
        )}
        {viewMode === 'stats' && <ClassRecordStatsView classId={classId} />}
        {viewMode === 'search' && <ClassRecordSearchView classId={classId} />}
        {viewMode === 'draft' && <ClassRecordDraftView classId={classId} />}
      </div>
    </div>
  );
}
