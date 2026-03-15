import { useState, useEffect, useCallback } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { ClassList } from './ClassList';
import { ClassRosterTab } from './ClassRosterTab';
import { ClassSeatingTab } from './ClassSeatingTab';
import { ProgressTab } from './ProgressTab';
import { ClassSurveyTab } from './ClassSurveyTab';

type TabId = 'roster' | 'seating' | 'progress' | 'survey';

interface TabConfig {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: readonly TabConfig[] = [
  { id: 'roster', label: '명렬표', icon: 'people' },
  { id: 'seating', label: '좌석배치', icon: 'grid_view' },
  { id: 'progress', label: '진도 관리', icon: 'trending_up' },
  { id: 'survey', label: '설문/체크', icon: 'checklist' },
] as const;

export function ClassManagementPage() {
  const load = useTeachingClassStore((s) => s.load);
  const selectedClassId = useTeachingClassStore((s) => s.selectedClassId);

  const [activeTab, setActiveTab] = useState<TabId>('roster');
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-sp-accent text-2xl">menu_book</span>
          <h1 className="text-xl font-bold text-sp-text">수업 관리</h1>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-sp-accent text-white rounded-lg hover:bg-sp-accent/80 transition-colors text-sm font-medium"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          학급 추가
        </button>
      </div>

      {/* 본문 */}
      <div className="flex-1 flex gap-6 min-h-0">
        {/* 왼쪽: 학급 리스트 */}
        <div className="w-72 shrink-0 bg-sp-card border border-sp-border rounded-xl overflow-hidden flex flex-col">
          <ClassList onAddClass={() => setShowAddModal(true)} />
        </div>

        {/* 오른쪽: 탭 콘텐츠 */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedClassId ? (
            <>
              {/* 탭 버튼 */}
              <div className="flex gap-2 mb-4">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'bg-sp-accent text-white'
                        : 'text-sp-muted hover:text-sp-text hover:bg-white/5'
                    }`}
                  >
                    <span className="material-symbols-outlined text-lg">{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* 탭 콘텐츠 */}
              <div className="flex-1 overflow-y-auto">
                {activeTab === 'roster' && <ClassRosterTab classId={selectedClassId} />}
                {activeTab === 'seating' && <ClassSeatingTab classId={selectedClassId} />}
                {activeTab === 'progress' && <ProgressTab classId={selectedClassId} />}
                {activeTab === 'survey' && <ClassSurveyTab classId={selectedClassId} />}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-sp-muted">
              <span className="material-symbols-outlined text-5xl mb-4 opacity-30">menu_book</span>
              <p className="text-sm">학급을 선택하거나 추가해주세요</p>
            </div>
          )}
        </div>
      </div>

      {/* 학급 추가 모달 */}
      {showAddModal && (
        <AddClassModal onClose={() => setShowAddModal(false)} />
      )}
    </div>
  );
}

/* ────────────────────────────────────────────── */
/* 학급 추가 모달 (인라인)                         */
/* ────────────────────────────────────────────── */

interface AddClassModalProps {
  onClose: () => void;
}

function AddClassModal({ onClose }: AddClassModalProps) {
  const addClass = useTeachingClassStore((s) => s.addClass);
  const selectClass = useTeachingClassStore((s) => s.selectClass);

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    const trimmedSubject = subject.trim();
    if (!trimmedName || !trimmedSubject) return;
    setSaving(true);
    try {
      await addClass(trimmedName, trimmedSubject, []);
      // 새로 추가된 학급을 자동 선택
      // addClass 후 store가 업데이트되므로 마지막 항목을 선택
      const updated = useTeachingClassStore.getState().classes;
      const newClass = updated[updated.length - 1];
      if (newClass) {
        selectClass(newClass.id);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }, [name, subject, addClass, selectClass, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && name.trim() && subject.trim()) {
      void handleSave();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  }, [handleSave, onClose, name, subject]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div
        className="bg-sp-card border border-sp-border rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6"
        onKeyDown={handleKeyDown}
      >
        <h2 className="text-base font-bold text-sp-text mb-4">학급 추가</h2>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-sp-muted mb-1">학급명</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 2-1"
              autoFocus
              className="w-full bg-sp-bg border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-sp-accent"
            />
          </div>
          <div>
            <label className="block text-xs text-sp-muted mb-1">과목</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="예: 수학"
              className="w-full bg-sp-bg border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-sp-accent"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={() => void handleSave()}
            disabled={!name.trim() || !subject.trim() || saving}
            className="flex-1 text-sm bg-sp-accent text-white rounded-lg py-2 hover:bg-sp-accent/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 text-sm bg-sp-border text-sp-muted rounded-lg py-2 hover:bg-sp-border/80 transition-colors"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
