import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { ClassList } from './ClassList';
import { ClassRosterTab } from './ClassRosterTab';
import { ClassRecordTab } from './ClassRecordTab';
import { ClassSeatingTab } from './ClassSeatingTab';
import { ProgressTab } from './ProgressTab';
import { ClassSurveyTab } from './ClassSurveyTab';
import { ClassAssignmentTab } from './ClassAssignmentTab';
import { AttendanceTab } from './AttendanceTab';


type TabId = 'roster' | 'record' | 'attendance' | 'seating' | 'progress' | 'survey' | 'assignment';

interface TabConfig {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: readonly TabConfig[] = [
  { id: 'roster', label: '명렬 관리', icon: 'people' },
  { id: 'record', label: '수업 기록', icon: 'edit_note' },
  { id: 'attendance', label: '출석부', icon: 'fact_check' },
  { id: 'seating', label: '좌석배치', icon: 'grid_view' },
  { id: 'progress', label: '진도 관리', icon: 'trending_up' },
  { id: 'survey', label: '설문/체크', icon: 'checklist' },
  { id: 'assignment', label: '과제 수합', icon: 'attach_file' },
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
                        : 'text-sp-muted hover:text-sp-text hover:bg-sp-text/5'
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
                {activeTab === 'record' && (
                    <ClassRecordTab classId={selectedClassId} />
                )}
                {activeTab === 'attendance' && <AttendanceTab classId={selectedClassId} />}
                {activeTab === 'seating' && <ClassSeatingTab classId={selectedClassId} />}
                {activeTab === 'progress' && <ProgressTab classId={selectedClassId} />}
                {activeTab === 'survey' && <ClassSurveyTab classId={selectedClassId} />}
                {activeTab === 'assignment' && <ClassAssignmentTab classId={selectedClassId} />}
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
  const existingClasses = useTeachingClassStore((s) => s.classes);
  const { teacherSchedule } = useScheduleStore();

  const [mode, setMode] = useState<'select' | 'manual'>('select');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // 교사 시간표에서 고유한 classroom + subject 조합 추출
  const timetableClasses = useMemo(() => {
    const seen = new Map<string, { classroom: string; subject: string; periods: string[] }>();

    if (!teacherSchedule) return [];

    const days = ['월', '화', '수', '목', '금', '토'];
    for (const day of days) {
      const periods = teacherSchedule[day];
      if (!periods) continue;
      periods.forEach((slot, idx) => {
        if (!slot) return;
        const key = `${slot.classroom}__${slot.subject}`;
        if (!seen.has(key)) {
          seen.set(key, { classroom: slot.classroom, subject: slot.subject, periods: [] });
        }
        seen.get(key)!.periods.push(`${day} ${idx + 1}교시`);
      });
    }

    // 이미 등록된 학급+과목 조합은 제외 (같은 반이라도 과목이 다르면 표시)
    const existingKeys = new Set(existingClasses.map((c) => `${c.name}__${c.subject}`));
    return [...seen.values()].filter((item) => !existingKeys.has(`${item.classroom}__${item.subject}`));
  }, [teacherSchedule, existingClasses]);

  // 선택 항목에서 학급 일괄 추가
  const handleSaveSelected = useCallback(async () => {
    if (selectedItems.size === 0) return;
    setSaving(true);
    try {
      for (const key of selectedItems) {
        const item = timetableClasses.find((c) => `${c.classroom}__${c.subject}` === key);
        if (item) {
          await addClass(item.classroom, item.subject, []);
        }
      }
      // 마지막 추가된 학급 선택
      const updated = useTeachingClassStore.getState().classes;
      const lastClass = updated[updated.length - 1];
      if (lastClass) selectClass(lastClass.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }, [selectedItems, timetableClasses, addClass, selectClass, onClose]);

  // 수동 입력으로 학급 추가
  const handleSaveManual = useCallback(async () => {
    const trimmedName = name.trim();
    const trimmedSubject = subject.trim();
    if (!trimmedName || !trimmedSubject) return;
    setSaving(true);
    try {
      await addClass(trimmedName, trimmedSubject, []);
      const updated = useTeachingClassStore.getState().classes;
      const newClass = updated[updated.length - 1];
      if (newClass) selectClass(newClass.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }, [name, subject, addClass, selectClass, onClose]);

  const toggleItem = (key: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-sp-card border border-sp-border rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-base font-bold text-sp-text mb-4">학급 추가</h2>

        {/* 모드 전환 탭 */}
        <div className="flex gap-1 mb-4 bg-sp-surface rounded-lg p-0.5">
          <button
            onClick={() => setMode('select')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === 'select' ? 'bg-sp-accent text-white' : 'text-sp-muted hover:text-sp-text'
            }`}
          >
            시간표에서 선택
          </button>
          <button
            onClick={() => setMode('manual')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === 'manual' ? 'bg-sp-accent text-white' : 'text-sp-muted hover:text-sp-text'
            }`}
          >
            직접 입력
          </button>
        </div>

        {mode === 'select' ? (
          <>
            {timetableClasses.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-sp-muted mb-2">교사 시간표에 등록된 수업이 없습니다</p>
                <button
                  onClick={() => setMode('manual')}
                  className="text-xs text-sp-accent hover:underline"
                >
                  직접 입력하기 →
                </button>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {timetableClasses.map((item) => {
                  const key = `${item.classroom}__${item.subject}`;
                  const isChecked = selectedItems.has(key);
                  return (
                    <label
                      key={key}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                        isChecked ? 'bg-sp-accent/10 ring-1 ring-sp-accent/30' : 'hover:bg-sp-surface/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleItem(key)}
                        className="w-4 h-4 rounded border-sp-border text-sp-accent focus:ring-sp-accent"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-sp-text">{item.classroom}</span>
                          <span className="text-xs text-sp-muted bg-sp-surface px-1.5 py-0.5 rounded">
                            {item.subject}
                          </span>
                        </div>
                        <p className="text-[10px] text-sp-muted mt-0.5 truncate">
                          {item.periods.join(', ')}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => void handleSaveSelected()}
                disabled={selectedItems.size === 0 || saving}
                className="flex-1 text-sm bg-sp-accent text-white rounded-lg py-2 hover:bg-sp-accent/80 transition-colors disabled:opacity-40"
              >
                {saving ? '저장 중...' : `${selectedItems.size}개 추가`}
              </button>
              <button
                onClick={onClose}
                className="flex-1 text-sm bg-sp-border text-sp-muted rounded-lg py-2 hover:bg-sp-border/80 transition-colors"
              >
                취소
              </button>
            </div>
          </>
        ) : (
          <>
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
                onClick={() => void handleSaveManual()}
                disabled={!name.trim() || !subject.trim() || saving}
                className="flex-1 text-sm bg-sp-accent text-white rounded-lg py-2 hover:bg-sp-accent/80 transition-colors disabled:opacity-40"
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
          </>
        )}
      </div>
    </div>
  );
}
