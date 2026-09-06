import { useCallback, useState } from 'react';
import { flushAllDrafts } from '@adapters/components/RecordDraft/draftFlushRegistry';
import type { RecordFlowIntent } from '@adapters/components/RecordDraft/recordFlowIntent';
import { useToastStore } from '@adapters/components/common/Toast';
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
  /**
   * 화면 왕복 요청(계획 §4.3). 교과 맥락의 주인은 이 탭이다 - 입력과 보드가 서로를 직접
   * 부르지 않고 여기를 거친다. 그래야 이동 보호(dirty guard·초안 flush)를 한 자리에서 건다.
   */
  const [flowIntent, setFlowIntent] = useState<RecordFlowIntent | null>(null);

  /**
   * 모든 왕복 이동이 지나는 **하나의 전환 함수**(계획 §4.3).
   * ★새 CTA 가 기존 보호를 우회하지 않게 여기로 모은다. 초안 자동저장 대기분을 먼저 밀어 넣고
   *   실패하면 이동하지 않고 원래 화면에 머문다.
   */
  const goWithIntent = useCallback(async (intent: RecordFlowIntent): Promise<void> => {
    const flushed = await flushAllDrafts();
    if (!flushed) {
      useToastStore.getState().show('저장하지 못한 초안이 있어 이동하지 않았습니다.', 'error');
      return;
    }
    setFlowIntent(intent);
    if (intent.mode === 'board') setViewMode('draft');
    else if (intent.mode === 'source' || intent.mode === 'compose') setViewMode('input');
  }, []);

  const handleIntentConsumed = useCallback((requestId: string) => {
    // 처리된 요청은 비운다. 남겨 두면 리렌더마다 같은 이동이 되살아난다.
    setFlowIntent((prev) => (prev?.requestId === requestId ? null : prev));
  }, []);

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
            onRequestFlow={goWithIntent}
            flowIntent={flowIntent}
            onFlowIntentConsumed={handleIntentConsumed}
          />
        )}
        {viewMode === 'stats' && <ClassRecordStatsView classId={classId} />}
        {viewMode === 'search' && <ClassRecordSearchView classId={classId} />}
        {viewMode === 'draft' && (
          <ClassRecordDraftView
            classId={classId}
            flowIntent={flowIntent}
            onFlowIntentConsumed={handleIntentConsumed}
            onRequestFlow={goWithIntent}
          />
        )}
      </div>
    </div>
  );
}
