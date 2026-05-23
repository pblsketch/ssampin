import { useState, useEffect, useCallback } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useDriveSyncStore } from '@adapters/stores/useDriveSyncStore';
import { FEATURE_FLAGS } from '@adapters/config/featureFlags';
import { getLastAttendanceMutationAt } from './shared/attendanceAutosave';
import { ClassList } from './ClassList';
import { ClassRosterTab } from './ClassRosterTab';
import { ClassRecordTab } from './ClassRecordTab';
import { ClassSeatingTab } from './ClassSeatingTab';
import { ProgressTab } from './ProgressTab';
import { ClassSurveyTab } from './ClassSurveyTab';
import { ClassAssignmentTab } from './ClassAssignmentTab';
import { AttendanceTab } from './AttendanceTab';
import { AddClassModal } from './AddClassModal';
import { PageHeader } from '@adapters/components/common/PageHeader';

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
  const syncSettings = useSettingsStore((s) => s.settings.sync);
  const driveStatus = useDriveSyncStore((s) => s.status);
  const driveLastSyncedAt = useDriveSyncStore((s) => s.lastSyncedAt);
  const syncToCloud = useDriveSyncStore((s) => s.syncToCloud);

  const [activeTab, setActiveTab] = useState<TabId>('roster');
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const hasUnfinishedDriveSync = useCallback(() => {
    if (!FEATURE_FLAGS.inlineAutosave || !syncSettings?.enabled || !syncSettings.autoSyncOnSave)
      return false;
    const lastMutationAt = getLastAttendanceMutationAt();
    const lastSyncedAt = driveLastSyncedAt ? Date.parse(driveLastSyncedAt) : 0;
    return driveStatus === 'syncing' || driveStatus === 'error' || lastSyncedAt < lastMutationAt;
  }, [driveLastSyncedAt, driveStatus, syncSettings?.autoSyncOnSave, syncSettings?.enabled]);

  const handleBeforeClassSwitch = useCallback(async () => {
    if (!hasUnfinishedDriveSync()) return true;
    const ok = window.confirm(
      '동기화 중입니다. 이대로 이동하면 다른 기기에서 이 변경이 보이지 않을 수 있습니다. 잠시 기다리시겠습니까?',
    );
    if (!ok) return false;
    await Promise.race([syncToCloud(), new Promise((resolve) => setTimeout(resolve, 5000))]);
    return true;
  }, [hasUnfinishedDriveSync, syncToCloud]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnfinishedDriveSync()) return;
      event.preventDefault();
      event.returnValue = '동기화 중입니다';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnfinishedDriveSync]);

  return (
    <div className="h-full flex flex-col -m-8">
      <PageHeader
        icon="menu_book"
        iconIsMaterial
        title="수업 관리"
        rightActions={
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 bg-sp-accent text-white px-3 xl:px-4 py-2 xl:py-2.5 rounded-xl text-xs xl:text-sm font-sp-semibold hover:brightness-110 shadow-sp-accent transition-all duration-sp-base ease-sp-out active:scale-95"
          >
            <span className="material-symbols-outlined text-icon">add</span>
            <span className="hidden sm:inline">학급 추가</span>
          </button>
        }
      />

      {/* 본문 */}
      <div className="flex-1 flex gap-6 min-h-0 p-8">
        {/* 왼쪽: 학급 리스트 */}
        <div className="w-72 shrink-0 bg-sp-card border border-sp-border rounded-xl overflow-hidden flex flex-col">
          <ClassList
            onAddClass={() => setShowAddModal(true)}
            onBeforeSelect={handleBeforeClassSwitch}
          />
        </div>

        {/* 오른쪽: 탭 콘텐츠 */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedClassId ? (
            <>
              {/* 탭 버튼 */}
              <div className="flex gap-2 mb-4" role="tablist" aria-label="수업 관리 탭">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent ${
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
                  <ClassRecordTab
                    classId={selectedClassId}
                    onGoToRosterTab={() => setActiveTab('roster')}
                    onGoToSeatingTab={() => setActiveTab('seating')}
                  />
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
      {showAddModal && <AddClassModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
}
