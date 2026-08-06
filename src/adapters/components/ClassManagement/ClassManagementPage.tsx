import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { isTeachingClassArchived } from '@domain/rules/teachingClassArchive';
import { formatTermKo } from '@domain/rules/academicCalendar';
import {
  getLastAttendanceSaveErrorAt,
  hasPendingAttendanceSave,
} from './shared/attendanceAutosave';
import { ClassList } from './ClassList';
import { ClassRosterTab } from './ClassRosterTab';
import { ClassRecordTab } from './ClassRecordTab';
import { ClassSeatingTab } from './ClassSeatingTab';
import { ProgressTab } from './ProgressTab';
import { ProgressCalendarView } from '@adapters/components/Progress/ProgressCalendarView';
import { ClassSurveyTab } from './ClassSurveyTab';
import { ClassAssignmentTab } from './ClassAssignmentTab';
import { ClassRubricTab } from './Rubric/ClassRubricTab';
import { ClassAssessmentManagementTab } from './GradeAnalysis/ClassAssessmentManagementTab';
import { AddClassModal } from './AddClassModal';
import { PageHeader } from '@adapters/components/common/PageHeader';
import { ScrollRow } from '@adapters/components/common/ScrollRow';

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
  const classes = useTeachingClassStore((s) => s.classes);
  const unarchiveClass = useTeachingClassStore((s) => s.unarchiveClass);
  const showToast = useToastStore((s) => s.show);
  const [activeTab, setActiveTab] = useState<TabId>('roster');
  const [showAddModal, setShowAddModal] = useState(false);
  const [isClassPanelCollapsed, setIsClassPanelCollapsed] = useState(false);
  const [recordInitialStudentView, setRecordInitialStudentView] = useState<'list' | 'seating'>(
    'list',
  );
  // 수업 관리 페이지 레벨: 전체 반 진도 캘린더 보기 (특정 학급에 종속되지 않음)
  const [showProgressCalendar, setShowProgressCalendar] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  /* ── 보관된 반 읽기 전용 방어 (school-year-archive plan §4 S1.3 — 3중 방어의 1·3겹) ── */
  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId),
    [classes, selectedClassId],
  );
  const isArchivedSelected = selectedClass !== undefined && isTeachingClassArchived(selectedClass);

  /**
   * 탭 콘텐츠 캡처 가드 — 보관된 반에서는 입력 컨트롤 조작을 원천 차단한다.
   * 조회는 그대로: 렌더·스크롤·보기 전환(role="tablist")·data-archive-allow 영역은 통과.
   * 저장 버튼 비활성만으로는 부족하다(자동저장·드래그 등 버튼 밖 입력 경로가 있다).
   */
  const blockInputIfArchived = useCallback(
    (e: React.SyntheticEvent) => {
      if (!isArchivedSelected) return;
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (target === e.currentTarget) return; // 스크롤바 등 컨테이너 자체 조작은 통과
      if (target.closest('[role="tablist"], [data-archive-allow]')) return; // 보기 전환 = 조회
      e.preventDefault();
      e.stopPropagation();
    },
    [isArchivedSelected],
  );

  const blockKeyIfArchived = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isArchivedSelected) return;
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest('[role="tablist"], [data-archive-allow]')) return;
      // 탐색·복사 키는 조회이므로 통과, 값 변경·활성화 키만 막는다
      if (e.ctrlKey || e.metaKey) return;
      const NAV_KEYS = new Set([
        'Tab',
        'Escape',
        'Shift',
        'Control',
        'Alt',
        'Meta',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Home',
        'End',
        'PageUp',
        'PageDown',
      ]);
      if (NAV_KEYS.has(e.key)) return;
      const isEditable = target.matches('input, textarea, select, [contenteditable="true"]');
      const isActivation =
        (e.key === 'Enter' || e.key === ' ') && target.matches('button, [role="button"], a');
      if (isEditable || isActivation) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [isArchivedSelected],
  );

  const handleUnarchiveSelected = useCallback(async () => {
    if (!selectedClass) return;
    await unarchiveClass(selectedClass.id);
    showToast(
      `'${selectedClass.name}(${selectedClass.subject})' 보관을 해제했어요 — 다시 기록할 수 있어요`,
    );
  }, [selectedClass, unarchiveClass, showToast]);

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
          <div className="flex items-center gap-2">
            {/* 전체 반 진도 캘린더 (수업 관리 레벨 — 특정 학급에 종속되지 않음) */}
            <button
              onClick={() => setShowProgressCalendar((v) => !v)}
              title="전체 반의 진도를 요일·교시 캘린더로 모아 봐요"
              className={`flex items-center gap-1.5 px-3 xl:px-4 py-2 xl:py-2.5 rounded-xl text-xs xl:text-sm font-sp-semibold transition-all duration-sp-base ease-sp-out active:scale-95 border ${
                showProgressCalendar
                  ? 'bg-sp-accent border-sp-accent text-white shadow-sp-accent'
                  : 'bg-sp-surface border-sp-border text-sp-text hover:bg-sp-card'
              }`}
            >
              <span className="material-symbols-outlined text-icon">calendar_month</span>
              <span className="hidden sm:inline">진도 캘린더</span>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 bg-sp-accent text-white px-3 xl:px-4 py-2 xl:py-2.5 rounded-xl text-xs xl:text-sm font-sp-semibold hover:brightness-110 shadow-sp-accent transition-all duration-sp-base ease-sp-out active:scale-95"
            >
              <span className="material-symbols-outlined text-icon">add</span>
              <span className="hidden sm:inline">학급 추가</span>
            </button>
          </div>
        }
      />

      {/* 본문 — 진도 캘린더 모드면 전체 반 캘린더를 풀폭으로, 아니면 학급별 관리 */}
      {showProgressCalendar ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 lg:p-8">
          <ProgressCalendarView />
        </div>
      ) : (
        <div className="flex-1 flex gap-4 lg:gap-6 min-h-0 p-4 lg:p-8">
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
            <div className="w-56 xl:w-72 shrink-0 bg-sp-card border border-sp-border rounded-xl overflow-hidden flex flex-col">
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
                {/* 보관됨 배지 — 읽기 전용 안내 + 즉시 해제 경로 */}
                {isArchivedSelected && selectedClass && (
                  <div className="mb-3 flex items-center gap-3 rounded-xl border border-sp-border bg-sp-surface px-4 py-2.5">
                    <span className="material-symbols-outlined text-sp-muted">inventory_2</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-sp-semibold text-sp-text">
                        보관됨
                        {selectedClass.archivedTerm
                          ? ` · ${formatTermKo(selectedClass.archivedTerm)}`
                          : ''}
                      </p>
                      <p className="text-xs text-sp-muted">
                        조회 전용이에요 — 출결·진도·기록은 그대로 볼 수 있고, 다시 기록하려면 보관을
                        해제하세요.
                      </p>
                    </div>
                    <button
                      onClick={() => void handleUnarchiveSelected()}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sp-semibold text-sp-accent bg-sp-card border border-sp-border hover:border-sp-accent transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">unarchive</span>
                      보관 해제
                    </button>
                  </div>
                )}

                {/* 탭 버튼 — 좁은 창에서 찌그러지지 않고 가로 스크롤 (반응형 패턴 A) */}
                <ScrollRow className="gap-2 mb-4" role="tablist" aria-label="수업 관리 탭">
                  {TABS.map((tab) => (
                    <button
                      key={tab.id}
                      role="tab"
                      aria-selected={activeTab === tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent ${
                        activeTab === tab.id
                          ? 'bg-sp-accent text-white'
                          : 'text-sp-muted hover:text-sp-text hover:bg-sp-text/5'
                      }`}
                    >
                      <span className="material-symbols-outlined text-lg">{tab.icon}</span>
                      {tab.label}
                    </button>
                  ))}
                </ScrollRow>

                {/* 탭 콘텐츠 — 보관된 반이면 캡처 가드로 입력을 차단한다(조회·스크롤·보기 전환은 통과) */}
                <div
                  className="flex-1 overflow-y-auto"
                  data-archived-readonly={isArchivedSelected || undefined}
                  onClickCapture={blockInputIfArchived}
                  onPointerDownCapture={blockInputIfArchived}
                  onMouseDownCapture={blockInputIfArchived}
                  onDragStartCapture={blockInputIfArchived}
                  onKeyDownCapture={blockKeyIfArchived}
                >
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
                <span className="material-symbols-outlined text-5xl mb-4 opacity-30">
                  menu_book
                </span>
                <p className="text-sm">학급을 선택하거나 추가해주세요</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 학급 추가 모달 */}
      {showAddModal && <AddClassModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
}
