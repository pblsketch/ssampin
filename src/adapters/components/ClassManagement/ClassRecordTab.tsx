import { useState } from 'react';
import { ClassRecordInputView } from './ClassRecordInputView';
import { ClassRecordStatsView } from './ClassRecordStatsView';
import { ClassRecordSearchView } from './ClassRecordSearchView';

type RecordViewMode = 'input' | 'stats' | 'search';

const VIEW_TABS: { id: RecordViewMode; icon: string; label: string }[] = [
  { id: 'input', icon: '✏️', label: '입력' },
  { id: 'stats', icon: '📊', label: '통계' },
  { id: 'search', icon: '🔍', label: '조회' },
];

interface ClassRecordTabProps {
  classId: string;
}

export function ClassRecordTab({ classId }: ClassRecordTabProps) {
  const [viewMode, setViewMode] = useState<RecordViewMode>('input');

  return (
    <div className="h-full flex flex-col gap-3">
      {/* 모드 탭 */}
      <div className="flex items-center">
        <div className="flex gap-1 bg-sp-surface rounded-lg p-1">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setViewMode(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                viewMode === tab.id
                  ? 'bg-sp-accent text-white'
                  : 'text-sp-muted hover:text-sp-text'
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
        {viewMode === 'input' && <ClassRecordInputView classId={classId} />}
        {viewMode === 'stats' && <ClassRecordStatsView classId={classId} />}
        {viewMode === 'search' && <ClassRecordSearchView classId={classId} />}
      </div>
    </div>
  );
}
