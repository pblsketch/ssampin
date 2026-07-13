import { useState, useMemo, useCallback } from 'react';
import { useStudentRecordsStore, RECORD_COLOR_MAP } from '@adapters/stores/useStudentRecordsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import { filterByStudent, getAttendanceStats } from '@domain/rules/studentRecordRules';
import { isStudentActive } from '@domain/rules/studentActivity';
/* eslint-disable no-restricted-imports */
import { exportStudentRecordsToExcel } from '@infrastructure/export/ExcelExporter';
/* eslint-enable no-restricted-imports */
import { StudentTimelineView } from './StudentTimelineView';
import { DefaultRecordListView } from './DefaultRecordListView';
import {
  type ModeProps,
  type RecordSortMode,
  RECORD_SORT_OPTIONS,
  sortRecordsInDateGroup,
} from './recordUtils';
import { RecordResultSummary } from '@adapters/components/common/records/RecordResultSummary';
import {
  RecordStudentJumpList,
  type JumpListItem,
} from '@adapters/components/common/records/RecordStudentJumpList';
import { studentRecordToDisplay } from '@adapters/presentation/displayRecord';
import { useRecordInlineEdit } from './useRecordInlineEdit';
import { useRecordFilters } from './useRecordFilters';
import { RecordFilterPopover } from './RecordFilterPopover';
import { useReviewQueue } from './useReviewQueue';
import { ReviewMode } from './ReviewMode';

function SearchMode({ students, records, categories }: ModeProps) {
  const { deleteRecord, toggleFollowUpDone, toggleNeisReport, toggleDocumentSubmitted } =
    useStudentRecordsStore();
  const showToast = useToastStore((s) => s.show);
  const [dismissedSearchGuide, setDismissedSearchGuide] = useState(
    () => localStorage.getItem('ssampin:record-search-guide-dismissed') === 'true',
  );
  const [sortMode, setSortMode] = useState<RecordSortMode>('occurredAt');

  // 찾아보기/검토 모드 (리디자인 4단계, 안 B) — 기본은 찾아보기, 검토 대기 건수는 배지로
  const [activeView, setActiveView] = useState<'browse' | 'review'>('browse');
  const queue = useReviewQueue(records);

  // 필터 상태·파생값(리디자인 3단계 — SearchMode 본체는 레이아웃 배치만 담당)
  const filters = useRecordFilters(records, categories);
  const {
    periodFilter,
    setPeriodFilter,
    keyword,
    handleKeywordChange,
    selectedStudentId,
    setSelectedStudentId,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    filtered,
    hasFilters,
    resetFilters,
  } = filters;

  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  // 인라인 편집 상태 묶음 — 뷰에는 edit 객체 하나로 전달(useRecordInlineEdit 훅)
  const { edit, handleEdit } = useRecordInlineEdit(studentMap);

  // 좌측 학생 점프 리스트 아이템 — 학생별 건수·경고 점(나이스 미반영/기한 초과 후속조치)
  const jumpItems = useMemo<JumpListItem[]>(() => {
    const counts = new Map<string, number>();
    const warnings = new Map<string, { unreported: number; overdueFollowUp: number }>();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    for (const r of records) {
      counts.set(r.studentId, (counts.get(r.studentId) ?? 0) + 1);

      const w = warnings.get(r.studentId) ?? { unreported: 0, overdueFollowUp: 0 };
      if (r.category === 'attendance' && !r.reportedToNeis) {
        w.unreported++;
      }
      if (r.followUp && !r.followUpDone && r.followUpDate && r.followUpDate < todayStr) {
        w.overdueFollowUp++;
      }
      warnings.set(r.studentId, w);
    }

    const items: JumpListItem[] = [];
    students.forEach((student, idx) => {
      if (!isStudentActive(student)) return;
      const w = warnings.get(student.id);
      const hasWarning = !!w && (w.unreported > 0 || w.overdueFollowUp > 0);
      items.push({
        key: student.id,
        label: student.name,
        number: idx + 1,
        count: counts.get(student.id) ?? 0,
        hasWarning,
        warningTitle: hasWarning
          ? [
              w.unreported > 0 ? `나이스 미반영 ${w.unreported}건` : '',
              w.overdueFollowUp > 0 ? `기한 초과 ${w.overdueFollowUp}건` : '',
            ]
              .filter(Boolean)
              .join(', ')
          : undefined,
      });
    });
    return items;
  }, [students, records]);

  // 날짜별 그룹핑 + 정렬
  const grouped = useMemo(() => {
    const map = new Map<string, StudentRecord[]>();
    for (const record of filtered) {
      const existing = map.get(record.date);
      if (existing) existing.push(record);
      else map.set(record.date, [record]);
    }
    for (const [date, recs] of map) {
      map.set(date, sortRecordsInDateGroup(recs, sortMode, studentMap));
    }
    return Array.from(map.entries());
  }, [filtered, sortMode, studentMap]);

  // 공용 요약 띠용 표시 ViewModel(담임 누가기록 → DisplayRecord)
  const displayRecords = useMemo(
    () => filtered.map((r) => studentRecordToDisplay(r, { categories, studentMap })),
    [filtered, categories, studentMap],
  );

  const handleExportFiltered = useCallback(async () => {
    const targetStudents = selectedStudentId
      ? students.filter((s) => s.id === selectedStudentId)
      : students;

    try {
      const buffer = await exportStudentRecordsToExcel(filtered, targetStudents, categories);

      if (window.electronAPI) {
        const saved = await window.electronAPI.showSaveDialog({
          title: '내보내기',
          defaultPath: '담임메모_조회결과.xlsx',
          filters: [{ name: 'Excel 파일', extensions: ['xlsx'] }],
        });
        if (saved) {
          await window.electronAPI.writeFile(saved.handle, buffer);
          showToast('파일이 저장되었습니다', 'success', {
            label: '파일 열기',
            onClick: () => window.electronAPI?.openFile(saved.handle),
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
  const selectedStudent = selectedStudentId
    ? students.find((s) => s.id === selectedStudentId)
    : null;
  const studentStats = useMemo(() => {
    if (!selectedStudentId) return null;
    const stats = getAttendanceStats(records, selectedStudentId);
    const studentRecs = filterByStudent(records, selectedStudentId);
    const counseling = studentRecs.filter((r) => r.category === 'counseling').length;
    return { ...stats, counseling, total: studentRecs.length };
  }, [records, selectedStudentId]);

  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0">
      {/* 찾아보기/검토 모드 세그먼트 — 검토 지표는 찾아보기 화면에서 걷어내고 배지 하나로(안 B) */}
      <div className="flex items-center gap-1 bg-sp-surface rounded-lg p-1 self-start">
        <button
          type="button"
          onClick={() => setActiveView('browse')}
          aria-pressed={activeView === 'browse'}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent ${
            activeView === 'browse'
              ? 'bg-sp-accent text-sp-accent-fg'
              : 'text-sp-muted hover:text-sp-text'
          }`}
        >
          <span className="material-symbols-outlined text-sm">manage_search</span>
          찾아보기
        </button>
        <button
          type="button"
          onClick={() => setActiveView('review')}
          aria-pressed={activeView === 'review'}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent ${
            activeView === 'review'
              ? 'bg-sp-accent text-sp-accent-fg'
              : 'text-sp-muted hover:text-sp-text'
          }`}
        >
          <span className="material-symbols-outlined text-sm">checklist</span>
          검토
          {queue.counts.total > 0 && (
            <span
              className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-caption font-bold tabular-nums ${
                activeView === 'review'
                  ? 'bg-sp-accent-fg text-sp-accent'
                  : 'bg-amber-500/15 text-amber-600'
              }`}
            >
              {queue.counts.total}
            </span>
          )}
        </button>
      </div>

      {activeView === 'review' ? (
        /* ── 검토 모드: 좌측 학생 사이드바(공유) + 통합 처리 큐 ── */
        <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0">
          <div className="w-full lg:w-[180px] lg:shrink-0">
            <RecordStudentJumpList
              items={jumpItems}
              selectedKey={selectedStudentId}
              onSelect={setSelectedStudentId}
            />
          </div>
          <ReviewMode
            queue={queue}
            categories={categories}
            studentMap={studentMap}
            selectedStudentId={selectedStudentId}
            edit={edit}
            onEdit={handleEdit}
          />
        </div>
      ) : (
        <>
          {/* 수정 안내 배너 (첫 방문 시) */}
          {!dismissedSearchGuide && (
            <div
              className="flex items-center gap-2 bg-sp-accent/10 border border-sp-accent/30
                        rounded-xl px-4 py-2.5 text-sm text-sp-accent"
            >
              <span className="material-symbols-outlined text-base">tips_and_updates</span>
              <span>
                각 기록의{' '}
                <span className="inline-flex items-center gap-0.5 mx-0.5">
                  <span className="material-symbols-outlined text-sm">edit</span>
                </span>{' '}
                버튼으로 내용을 수정하고,{' '}
                <span className="inline-flex items-center gap-0.5 mx-0.5">
                  <span className="material-symbols-outlined text-sm">delete</span>
                </span>{' '}
                버튼으로 삭제할 수 있습니다.
              </span>
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

            {/* 학생 선택 — lg 이상에서는 좌측 학생 점프 리스트와 중복이라 lg 미만(사이드바가 세로로 밀릴 때)에서만 노출 */}
            <div className="lg:hidden">
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
              >
                <option value="">전체 학생</option>
                {students.map((s, idx) => (
                  <option key={s.id} value={s.id}>
                    {idx + 1} {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 필터 더보기 — 카테고리·하위 분류·상담 방법·상태 토글 (리디자인 3단계) */}
            <RecordFilterPopover categories={categories} filters={filters} />

            {/* 기간 필터 */}
            <div className="flex items-center gap-1 bg-sp-surface rounded-lg p-1 ml-auto">
              {(
                [
                  { id: 'week', label: '이번 주' },
                  { id: 'month', label: '이번 달' },
                  { id: 'semester', label: '이번 학기' },
                  { id: 'all', label: '전체' },
                  { id: 'custom', label: '직접 지정' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setPeriodFilter(f.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    periodFilter === f.id
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

          {/* 결과 요약 띠 (공용) — 카테고리 색칩 클릭 시 해당 카테고리 필터 토글 */}
          <RecordResultSummary
            records={displayRecords}
            chipClassName={(key) => {
              const color = categories.find((c) => c.id === key)?.color ?? 'gray';
              return (RECORD_COLOR_MAP[color] ?? RECORD_COLOR_MAP['gray']!).tagBg;
            }}
            onKindClick={filters.toggleCategory}
            activeKind={filters.selectedCategory}
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
          <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0">
            {/* Left: 학생 점프 리스트 (공용 부품 — 수업 조회와 동일) */}
            <div className="w-full lg:w-[180px] lg:shrink-0">
              <RecordStudentJumpList
                items={jumpItems}
                selectedKey={selectedStudentId}
                onSelect={setSelectedStudentId}
              />
            </div>

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
                  onToggleDocumentSubmitted={toggleDocumentSubmitted}
                  edit={edit}
                />
              ) : (
                <DefaultRecordListView
                  grouped={grouped}
                  categories={categories}
                  studentMap={studentMap}
                  hasActiveFilters={!!hasFilters}
                  onResetFilters={resetFilters}
                  onEdit={handleEdit}
                  onDelete={deleteRecord}
                  onToggleFollowUp={toggleFollowUpDone}
                  onToggleNeisReport={toggleNeisReport}
                  onToggleDocumentSubmitted={toggleDocumentSubmitted}
                  edit={edit}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export { SearchMode };
