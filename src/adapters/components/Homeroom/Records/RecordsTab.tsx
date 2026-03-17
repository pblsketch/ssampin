import { useEffect, useState, useMemo } from 'react';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { RecordCategoryManagementModal } from '@adapters/components/StudentRecords/RecordCategoryManagementModal';
import { DateNavigator } from '@adapters/components/StudentRecords/DateNavigator';
import { InputMode } from './InputMode';
import { ProgressMode } from './ProgressMode';
import { SearchMode } from './SearchMode';
import { RecordsExportModal } from './RecordsExportModal';
import { todayString } from './recordUtils';
import type { RecordPrefill } from '../HomeroomPage';

type ViewMode = 'input' | 'progress' | 'search';

const MODE_TABS: { id: ViewMode; icon: string; label: string }[] = [
  { id: 'input', icon: '✏️', label: '입력' },
  { id: 'progress', icon: '📊', label: '통계' },
  { id: 'search', icon: '🔍', label: '조회' },
];

interface RecordsTabProps {
  prefill?: RecordPrefill | null;
  onPrefillConsumed?: () => void;
}

export function RecordsTab({ prefill, onPrefillConsumed }: RecordsTabProps) {
  const { records, loaded, load, viewMode, setViewMode, categories } =
    useStudentRecordsStore();
  const { students, load: loadStudents, loaded: studentsLoaded } =
    useStudentStore();
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayString());

  useEffect(() => {
    void load();
    void loadStudents();
  }, [load, loadStudents]);

  /* ── prefill 수신 시 input 모드로 전환 + 날짜 설정 ── */
  useEffect(() => {
    if (!prefill) return;
    setViewMode('input');
    setSelectedDate(prefill.date);
  }, [prefill, setViewMode]);

  // 담임 반 학생 ID로 필터링 — 다른 학급 학생 기록 제외
  const studentIds = useMemo(
    () => new Set(students.map((s) => s.id)),
    [students],
  );
  const filteredRecords = useMemo(
    () => records.filter((r) => studentIds.has(r.studentId)),
    [records, studentIds],
  );

  if (!loaded || !studentsLoaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sp-muted text-sm">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 서브탭 + 카테고리 관리 */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1 bg-sp-surface rounded-lg p-1">
          {MODE_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setViewMode(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === tab.id
                ? 'bg-sp-accent text-white'
                : 'text-sp-muted hover:text-white'
                }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-sp-muted hover:text-white hover:bg-sp-surface transition-all"
            title="내보내기"
          >
            <span className="material-symbols-outlined text-base">download</span>
            <span className="text-xs">내보내기</span>
          </button>
          <button
            onClick={() => setShowCategoryModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-sp-muted hover:text-white hover:bg-sp-surface transition-all"
            title="카테고리 관리"
          >
            <span className="material-symbols-outlined text-base">tune</span>
            <span className="text-xs">카테고리 관리</span>
          </button>
        </div>
      </div>

      {viewMode === 'input' && (
        <DateNavigator selectedDate={selectedDate} onDateChange={setSelectedDate} />
      )}

      {viewMode === 'input' && (
        <InputMode students={students} records={filteredRecords} categories={categories} selectedDate={selectedDate} prefill={prefill} onPrefillConsumed={onPrefillConsumed} />
      )}
      {viewMode === 'progress' && (
        <ProgressMode students={students} records={filteredRecords} categories={categories} />
      )}
      {viewMode === 'search' && (
        <SearchMode students={students} records={filteredRecords} categories={categories} />
      )}

      {showCategoryModal && (
        <RecordCategoryManagementModal onClose={() => setShowCategoryModal(false)} />
      )}
      {showExportModal && (
        <RecordsExportModal
          records={filteredRecords}
          students={students}
          categories={categories}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}

// 하위 호환
export { RecordsTab as StudentRecords };
