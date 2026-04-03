import { useState, useMemo, useCallback, useRef } from 'react';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { ATTENDANCE_TYPES, ATTENDANCE_REASONS } from '@domain/valueObjects/RecordCategory';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import {
  filterByStudent,
  filterByCategory,
  filterBySubcategory,
  filterByDateRange,
  filterByKeyword,
  getAttendanceStats,
  sortByDateDesc,
} from '@domain/rules/studentRecordRules';
/* eslint-disable no-restricted-imports */
import { exportStudentRecordsToExcel } from '@infrastructure/export/ExcelExporter';
/* eslint-enable no-restricted-imports */
import { StudentTimelineView } from './StudentTimelineView';
import { DefaultRecordListView } from './DefaultRecordListView';
import {
  type ModeProps,
  type RecordSortMode,
  COUNSELING_METHODS,
  RECORD_SORT_OPTIONS,
  ATTENDANCE_SORT_ORDER,
  getAttendanceTypeFromSubcategory,
  getWeekRange,
  getMonthRange,
} from './recordUtils';
import { FilterSummaryStrip } from './FilterSummaryStrip';
import { ActionDashboard } from './ActionDashboard';
import { StudentJumpList } from './StudentJumpList';

function SearchMode({ students, records, categories }: ModeProps) {
  const { periodFilter, setPeriodFilter, deleteRecord, updateRecord, toggleFollowUpDone, toggleNeisReport } =
    useStudentRecordsStore();
  const showToast = useToastStore((s) => s.show);
  const [dismissedSearchGuide, setDismissedSearchGuide] = useState(
    () => localStorage.getItem('ssampin:record-search-guide-dismissed') === 'true',
  );
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('');
  const [selectedMethod, setSelectedMethod] = useState<string>('');
  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [followUpOnly, setFollowUpOnly] = useState(false);
  const [unreportedOnly, setUnreportedOnly] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editSubcategory, setEditSubcategory] = useState('');
  const [editReportedToNeis, setEditReportedToNeis] = useState(false);
  const [editDocumentSubmitted, setEditDocumentSubmitted] = useState(false);
  const [editFollowUp, setEditFollowUp] = useState('');
  const [editFollowUpDate, setEditFollowUpDate] = useState('');
  const [sortMode, setSortMode] = useState<RecordSortMode>('time');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // debounce keyword
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleKeywordChange = useCallback((val: string) => {
    setKeyword(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedKeyword(val), 300);
  }, []);

  const studentMap = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students],
  );

  // 선택된 카테고리의 서브카테고리 목록
  const subcategoryOptions = useMemo(() => {
    if (!selectedCategory) return [];
    const cat = categories.find((c) => c.id === selectedCategory);
    if (!cat) return [];
    if (cat.id === 'attendance') {
      const subs: string[] = [];
      for (const t of ATTENDANCE_TYPES) {
        for (const r of ATTENDANCE_REASONS) {
          subs.push(`${t} (${r})`);
        }
      }
      return subs;
    }
    return [...cat.subcategories];
  }, [selectedCategory, categories]);

  // 필터 적용 여부
  const hasFilters = selectedStudentId || selectedCategory || selectedSubcategory ||
    selectedMethod || debouncedKeyword || followUpOnly || unreportedOnly || periodFilter !== 'all';

  const resetFilters = useCallback(() => {
    setSelectedStudentId('');
    setSelectedCategory('');
    setSelectedSubcategory('');
    setSelectedMethod('');
    setKeyword('');
    setDebouncedKeyword('');
    setFollowUpOnly(false);
    setUnreportedOnly(false);
    setPeriodFilter('all');
    setCustomStartDate('');
    setCustomEndDate('');
  }, [setPeriodFilter]);

  const handleSummaryCategoryClick = useCallback((categoryId: string) => {
    setSelectedCategory((prev) => prev === categoryId ? '' : categoryId);
    setSelectedSubcategory('');
  }, []);

  const filtered = useMemo(() => {
    let result = [...records];

    if (selectedStudentId) {
      result = filterByStudent(result, selectedStudentId) as StudentRecord[];
    }
    if (selectedCategory) {
      result = filterByCategory(result, selectedCategory) as StudentRecord[];
    }
    if (selectedSubcategory) {
      result = filterBySubcategory(result, selectedSubcategory) as StudentRecord[];
    }
    if (selectedMethod) {
      result = result.filter((r) => r.method === selectedMethod);
    }
    if (debouncedKeyword) {
      result = filterByKeyword(result, debouncedKeyword) as StudentRecord[];
    }
    if (followUpOnly) {
      result = result.filter((r) => r.followUp && !r.followUpDone);
    }
    if (unreportedOnly) {
      result = result.filter((r) => r.category === 'attendance' && !r.reportedToNeis);
    }
    if (periodFilter === 'week') {
      const { start, end } = getWeekRange();
      result = filterByDateRange(result, start, end) as StudentRecord[];
    } else if (periodFilter === 'month') {
      const { start, end } = getMonthRange();
      result = filterByDateRange(result, start, end) as StudentRecord[];
    } else if (periodFilter === 'custom' && customStartDate) {
      const start = new Date(customStartDate + 'T00:00:00');
      const end = customEndDate ? new Date(customEndDate + 'T23:59:59') : new Date();
      result = filterByDateRange(result, start, end) as StudentRecord[];
    }

    return sortByDateDesc(result);
  }, [records, selectedStudentId, selectedCategory, selectedSubcategory, selectedMethod, debouncedKeyword, followUpOnly, unreportedOnly, periodFilter, customStartDate, customEndDate]);

  // 날짜별 그룹핑 + 정렬
  const grouped = useMemo(() => {
    const map = new Map<string, StudentRecord[]>();
    for (const record of filtered) {
      const existing = map.get(record.date);
      if (existing) existing.push(record);
      else map.set(record.date, [record]);
    }
    if (sortMode !== 'time') {
      for (const [, recs] of map) {
        recs.sort((a, b) => {
          if (sortMode === 'type') {
            const aType = getAttendanceTypeFromSubcategory(a.subcategory);
            const bType = getAttendanceTypeFromSubcategory(b.subcategory);
            const aOrder = aType ? (ATTENDANCE_SORT_ORDER[aType] ?? 99) : 99;
            const bOrder = bType ? (ATTENDANCE_SORT_ORDER[bType] ?? 99) : 99;
            if (aOrder !== bOrder) return aOrder - bOrder;
            return a.subcategory.localeCompare(b.subcategory);
          }
          const aNum = studentMap.get(a.studentId)?.studentNumber ?? 9999;
          const bNum = studentMap.get(b.studentId)?.studentNumber ?? 9999;
          return aNum - bNum;
        });
      }
    }
    return Array.from(map.entries());
  }, [filtered, sortMode, studentMap]);

  const handleEdit = useCallback((record: StudentRecord) => {
    setEditingId(record.id);
    setEditContent(record.content);
    setEditCategory(record.category);
    setEditSubcategory(record.subcategory);
    setEditReportedToNeis(record.reportedToNeis ?? false);
    setEditDocumentSubmitted(record.documentSubmitted ?? false);
    setEditFollowUp(record.followUp ?? '');
    setEditFollowUpDate(record.followUpDate ?? '');
  }, []);

  const handleEditSave = useCallback(async (record: StudentRecord) => {
    await updateRecord({
      ...record,
      content: editContent,
      category: editCategory,
      subcategory: editSubcategory,
      reportedToNeis: record.category === 'attendance' ? editReportedToNeis : record.reportedToNeis,
      documentSubmitted: record.category === 'attendance' ? editDocumentSubmitted : record.documentSubmitted,
      followUp: editFollowUp.trim() || undefined,
      followUpDate: editFollowUpDate || undefined,
    });
    setEditingId(null);
    setEditContent('');
    setEditCategory('');
    setEditSubcategory('');
    setEditReportedToNeis(false);
    setEditDocumentSubmitted(false);
    setEditFollowUp('');
    setEditFollowUpDate('');
  }, [editContent, editCategory, editSubcategory, editReportedToNeis, editDocumentSubmitted, editFollowUp, editFollowUpDate, updateRecord]);

  const handleExportFiltered = useCallback(async () => {
    const targetStudents = selectedStudentId
      ? students.filter((s) => s.id === selectedStudentId)
      : students;

    try {
      const buffer = await exportStudentRecordsToExcel(filtered, targetStudents, categories);

      if (window.electronAPI) {
        const filePath = await window.electronAPI.showSaveDialog({
          title: '내보내기',
          defaultPath: '담임메모_조회결과.xlsx',
          filters: [{ name: 'Excel 파일', extensions: ['xlsx'] }],
        });
        if (filePath) {
          await window.electronAPI.writeFile(filePath, buffer);
          showToast('파일이 저장되었습니다', 'success', {
            label: '파일 열기',
            onClick: () => window.electronAPI?.openFile(filePath),
          });
        }
      } else {
        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '담임메모_조회결과.xlsx';
        a.click();
        URL.revokeObjectURL(url);
        showToast('Excel 파일을 다운로드했습니다', 'success');
      }
    } catch {
      showToast('내보내기 중 오류가 발생했습니다', 'error');
    }
  }, [filtered, students, categories, selectedStudentId, showToast]);

  // 2-1: 타임라인 뷰 데이터 (학생 선택 시)
  const selectedStudent = selectedStudentId ? students.find((s) => s.id === selectedStudentId) : null;
  const studentStats = useMemo(() => {
    if (!selectedStudentId) return null;
    const stats = getAttendanceStats(records, selectedStudentId);
    const studentRecs = filterByStudent(records, selectedStudentId);
    const counseling = studentRecs.filter((r) => r.category === 'counseling').length;
    return { ...stats, counseling, total: studentRecs.length };
  }, [records, selectedStudentId]);

  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0">
      {/* 수정 안내 배너 (첫 방문 시) */}
      {!dismissedSearchGuide && (
        <div className="flex items-center gap-2 bg-sp-accent/10 border border-sp-accent/30
                        rounded-xl px-4 py-2.5 text-sm text-sp-accent">
          <span className="material-symbols-outlined text-base">tips_and_updates</span>
          <span>각 기록의 <span className="inline-flex items-center gap-0.5 mx-0.5"><span className="material-symbols-outlined text-sm">edit</span></span> 버튼으로 내용을 수정하고, <span className="inline-flex items-center gap-0.5 mx-0.5"><span className="material-symbols-outlined text-sm">delete</span></span> 버튼으로 삭제할 수 있습니다.</span>
          <button
            onClick={() => {
              setDismissedSearchGuide(true);
              localStorage.setItem('ssampin:record-search-guide-dismissed', 'true');
            }}
            className="ml-auto text-sp-muted hover:text-sp-text transition-colors flex-shrink-0"
            title="닫기"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* 2-4: 강화된 필터 바 */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* 키워드 검색 */}
        <div className="relative">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-sp-muted text-base">
            search
          </span>
          <input
            type="text"
            value={keyword}
            onChange={(e) => handleKeywordChange(e.target.value)}
            placeholder="키워드 검색..."
            className="bg-sp-surface border border-sp-border rounded-lg pl-8 pr-3 py-2 text-sm text-sp-text w-40 focus:outline-none focus:ring-1 focus:ring-sp-accent placeholder-sp-muted"
          />
        </div>

        {/* 학생 선택 */}
        <select
          value={selectedStudentId}
          onChange={(e) => setSelectedStudentId(e.target.value)}
          className="bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
        >
          <option value="">전체 학생</option>
          {students.map((s, idx) => (
            <option key={s.id} value={s.id}>{idx + 1} {s.name}</option>
          ))}
        </select>

        {/* 카테고리 필터 */}
        <select
          value={selectedCategory}
          onChange={(e) => { setSelectedCategory(e.target.value); setSelectedSubcategory(''); }}
          className="bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
        >
          <option value="">전체 카테고리</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>

        {/* 2-4: 서브카테고리 필터 */}
        {subcategoryOptions.length > 0 && (
          <select
            value={selectedSubcategory}
            onChange={(e) => setSelectedSubcategory(e.target.value)}
            className="bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
          >
            <option value="">전체 하위</option>
            {subcategoryOptions.map((sub) => (
              <option key={sub} value={sub}>{sub}</option>
            ))}
          </select>
        )}

        {/* 2-4: 상담 방법 필터 */}
        <select
          value={selectedMethod}
          onChange={(e) => setSelectedMethod(e.target.value)}
          className="bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
        >
          <option value="">전체 방법</option>
          {COUNSELING_METHODS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>

        {/* 2-3: 미완료 후속조치 필터 */}
        <button
          onClick={() => setFollowUpOnly(!followUpOnly)}
          className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            followUpOnly
              ? 'bg-sp-accent text-white'
              : 'bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border'
          }`}
        >
          {'\uD83D\uDCCC'} 미완료만
        </button>

        {/* 나이스 미반영 필터 */}
        <button
          onClick={() => setUnreportedOnly(!unreportedOnly)}
          className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            unreportedOnly
              ? 'bg-red-500 text-white'
              : 'bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border'
          }`}
        >
          나이스 미반영
        </button>

        {/* 기간 필터 */}
        <div className="flex items-center gap-1 bg-sp-surface rounded-lg p-1 ml-auto">
          {([
            { id: 'week', label: '이번 주' },
            { id: 'month', label: '이번 달' },
            { id: 'all', label: '전체' },
            { id: 'custom', label: '직접 지정' },
          ] as const).map((f) => (
            <button
              key={f.id}
              onClick={() => setPeriodFilter(f.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${periodFilter === f.id
                ? 'bg-sp-accent text-white'
                : 'text-sp-muted hover:text-sp-text'
                }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* 사용자 지정 날짜 범위 */}
        {periodFilter === 'custom' && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="bg-sp-surface border border-sp-border rounded-lg px-2 py-1.5 text-xs text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
            />
            <span className="text-xs text-sp-muted">~</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="bg-sp-surface border border-sp-border rounded-lg px-2 py-1.5 text-xs text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
            />
          </div>
        )}

        {/* 내보내기 + 필터 초기화 */}
        {filtered.length > 0 && (
          <button
            onClick={() => void handleExportFiltered()}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs
                       text-sp-muted hover:text-sp-text hover:bg-sp-surface
                       border border-sp-border transition-all"
          >
            <span className="material-symbols-outlined text-sm">download</span>
            Excel 내보내기
          </button>
        )}
        {hasFilters && (
          <button
            onClick={resetFilters}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            ✕ 필터 초기화
          </button>
        )}
      </div>

      {/* FilterSummaryStrip */}
      <FilterSummaryStrip
        filtered={filtered}
        students={students}
        categories={categories}
        onCategoryClick={handleSummaryCategoryClick}
      />

      {/* 정렬 컨트롤 */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-sp-muted">정렬:</span>
        <div className="flex gap-1 bg-sp-surface rounded-lg p-1">
          {RECORD_SORT_OPTIONS.map((opt) => (
            <button
              key={opt.mode}
              onClick={() => setSortMode(opt.mode)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                sortMode === opt.mode
                  ? 'bg-sp-accent text-white'
                  : 'text-sp-muted hover:text-sp-text'
              }`}
            >
              <span className="material-symbols-outlined text-sm">{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-sp-muted ml-auto">{filtered.length}건</span>
      </div>

      {/* 3-column body */}
      <div className="flex-1 flex gap-3 min-h-0">
        {/* Left: StudentJumpList */}
        <StudentJumpList
          students={students}
          records={records}
          selectedStudentId={selectedStudentId}
          onSelect={setSelectedStudentId}
        />

        {/* Center: Record list */}
        <div className="flex-1 min-w-0 min-h-0">
          {/* 2-1: 학생 선택 시 타임라인 뷰, 아니면 기존 뷰 */}
          {selectedStudentId && selectedStudent ? (
            <StudentTimelineView
              student={selectedStudent}
              records={filtered}
              categories={categories}
              studentMap={studentMap}
              stats={studentStats}
              onEdit={handleEdit}
              onDelete={deleteRecord}
              onToggleFollowUp={toggleFollowUpDone}
              onToggleNeisReport={toggleNeisReport}
              editingId={editingId}
              editContent={editContent}
              setEditContent={setEditContent}
              editCategory={editCategory}
              setEditCategory={setEditCategory}
              editSubcategory={editSubcategory}
              setEditSubcategory={setEditSubcategory}
              editReportedToNeis={editReportedToNeis}
              setEditReportedToNeis={setEditReportedToNeis}
              editDocumentSubmitted={editDocumentSubmitted}
              setEditDocumentSubmitted={setEditDocumentSubmitted}
              editFollowUp={editFollowUp}
              setEditFollowUp={setEditFollowUp}
              editFollowUpDate={editFollowUpDate}
              setEditFollowUpDate={setEditFollowUpDate}
              onEditSave={handleEditSave}
              onEditCancel={() => { setEditingId(null); setEditReportedToNeis(false); setEditDocumentSubmitted(false); setEditFollowUp(''); setEditFollowUpDate(''); }}
            />
          ) : (
            <DefaultRecordListView
              grouped={grouped}
              categories={categories}
              studentMap={studentMap}
              onEdit={handleEdit}
              onDelete={deleteRecord}
              onToggleFollowUp={toggleFollowUpDone}
              onToggleNeisReport={toggleNeisReport}
              editingId={editingId}
              editContent={editContent}
              setEditContent={setEditContent}
              editCategory={editCategory}
              setEditCategory={setEditCategory}
              editSubcategory={editSubcategory}
              setEditSubcategory={setEditSubcategory}
              editReportedToNeis={editReportedToNeis}
              setEditReportedToNeis={setEditReportedToNeis}
              editDocumentSubmitted={editDocumentSubmitted}
              setEditDocumentSubmitted={setEditDocumentSubmitted}
              editFollowUp={editFollowUp}
              setEditFollowUp={setEditFollowUp}
              editFollowUpDate={editFollowUpDate}
              setEditFollowUpDate={setEditFollowUpDate}
              onEditSave={handleEditSave}
              onEditCancel={() => { setEditingId(null); setEditReportedToNeis(false); setEditDocumentSubmitted(false); setEditFollowUp(''); setEditFollowUpDate(''); }}
            />
          )}
        </div>

        {/* Right: ActionDashboard (only when no student selected) */}
        {!selectedStudentId && (
          <ActionDashboard
            records={records}
            students={students}
            onFilterUnreported={() => setUnreportedOnly(true)}
            onFilterFollowUp={() => setFollowUpOnly(true)}
          />
        )}
      </div>
    </div>
  );
}

export { SearchMode };
