import { useState, useEffect, useCallback } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import {
  getLastAttendanceSaveErrorAt,
  hasPendingAttendanceSave,
} from './shared/attendanceAutosave';
import { ClassList } from './ClassList';
import { ClassRosterTab } from './ClassRosterTab';
import { ClassRecordTab } from './ClassRecordTab';
import { ClassSeatingTab } from './ClassSeatingTab';
import { ProgressTab } from './ProgressTab';
import { ClassSurveyTab } from './ClassSurveyTab';
import { ClassAssignmentTab } from './ClassAssignmentTab';
import { ClassRubricTab } from './Rubric/ClassRubricTab';
import { ClassAssessmentManagementTab } from './GradeAnalysis/ClassAssessmentManagementTab';
import { AddClassModal } from './AddClassModal';
import { PageHeader } from '@adapters/components/common/PageHeader';

type TabId =
  | 'roster'
  | 'record'
  | 'seating'
  | 'progress'
  | 'survey'
  | 'assignment'
  | 'rubric'
  | 'assessment';

interface TabConfig {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: readonly TabConfig[] = [
  { id: 'roster', label: '명렬 관리', icon: 'people' },
  { id: 'record', label: '수업 기록', icon: 'edit_note' },
  { id: 'seating', label: '좌석배치', icon: 'grid_view' },
  { id: 'progress', label: '진도 관리', icon: 'trending_up' },
  { id: 'survey', label: '설문/체크', icon: 'checklist' },
  { id: 'assignment', label: '과제 수합', icon: 'attach_file' },
  { id: 'rubric', label: '수행평가', icon: 'grading' },
  { id: 'assessment', label: '성적', icon: 'analytics' },
] as const;

export function ClassManagementPage() {
  const load = useTeachingClassStore((s) => s.load);
  const selectedClassId = useTeachingClassStore((s) => s.selectedClassId);
  const [activeTab, setActiveTab] = useState<TabId>('roster');
  const [showAddModal, setShowAddModal] = useState(false);
  const [isClassPanelCollapsed, setIsClassPanelCollapsed] = useState(false);
  const [recordInitialStudentView, setRecordInitialStudentView] = useState<'list' | 'seating'>(
    'list',
  );

  useEffect(() => {
    void load();
  }, [load]);

  const hasUnsafeLocalAttendanceSave = useCallback(() => {
    return hasPendingAttendanceSave() || getLastAttendanceSaveErrorAt() > 0;
  }, []);

  const handleBeforeClassSwitch = useCallback(async () => {
    if (!hasUnsafeLocalAttendanceSave()) return true;
    return window.confirm(
      '출결이 아직 이 기기에 저장되지 않았습니다. 이동하면 변경 내용이 사라질 수 있습니다. 그래도 이동할까요?',
    );
  }, [hasUnsafeLocalAttendanceSave]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsafeLocalAttendanceSave()) return;
      event.preventDefault();
      event.returnValue = '출결이 아직 이 기기에 저장되지 않았습니다';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsafeLocalAttendanceSave]);

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
        {/* 왼쪽: 학급 리스트 (접기/펼치기) */}
        {isClassPanelCollapsed ? (
          <div className="w-12 shrink-0 bg-sp-card border border-sp-border rounded-xl flex flex-col items-center py-3 gap-3">
            <button
              onClick={() => setIsClassPanelCollapsed(false)}
              title="학급 목록 펼치기"
              aria-label="학급 목록 펼치기"
              className="p-1.5 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent"
            >
              <span className="material-symbols-outlined text-lg">chevron_right</span>
            </button>
            <span className="material-symbols-outlined text-sp-muted text-lg">menu_book</span>
            <span className="text-xs text-sp-muted font-medium [writing-mode:vertical-rl] tracking-wide">
              학급 목록
            </span>
          </div>
        ) : (
          <div className="w-72 shrink-0 bg-sp-card border border-sp-border rounded-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-sp-border">
              <span className="text-xs font-sp-semibold text-sp-muted">학급 목록</span>
              <button
                onClick={() => setIsClassPanelCollapsed(true)}
                title="학급 목록 접기"
                aria-label="학급 목록 접기"
                className="p-1 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent"
              >
                <span className="material-symbols-outlined text-lg">chevron_left</span>
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <ClassList
                onAddClass={() => setShowAddModal(true)}
                onBeforeSelect={handleBeforeClassSwitch}
              />
            </div>
          </div>
        )}

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
                    initialStudentViewMode={recordInitialStudentView}
                    onGoToSeatingTab={() => setActiveTab('seating')}
                  />
                )}
                {activeTab === 'seating' && (
                  <ClassSeatingTab
                    classId={selectedClassId}
                    onOpenRecordSeatView={() => {
                      setRecordInitialStudentView('seating');
                      setActiveTab('record');
                    }}
                  />
                )}
                {activeTab === 'progress' && <ProgressTab classId={selectedClassId} />}
                {activeTab === 'survey' && <ClassSurveyTab classId={selectedClassId} />}
                {activeTab === 'assignment' && <ClassAssignmentTab classId={selectedClassId} />}
                {activeTab === 'rubric' && (
                  <ClassRubricTab
                    classId={selectedClassId}
                    onGoToRosterTab={() => setActiveTab('roster')}
                  />
                )}
                {activeTab === 'assessment' && (
                  <ClassAssessmentManagementTab
                    classId={selectedClassId}
                    onGoToRosterTab={() => setActiveTab('roster')}
                    onGoToRubricTab={() => setActiveTab('rubric')}
                  />
                )}
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
