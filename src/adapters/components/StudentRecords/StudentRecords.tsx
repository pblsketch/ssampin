import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useStudentRecordsStore, RECORD_COLOR_MAP } from '@adapters/stores/useStudentRecordsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useSeatingStore } from '@adapters/stores/useSeatingStore';
import { ATTENDANCE_TYPES, ATTENDANCE_REASONS } from '@domain/valueObjects/RecordCategory';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import type { Student } from '@domain/entities/Student';
import type { StudentRecord, CounselingMethod } from '@domain/entities/StudentRecord';
import { DEFAULT_TEMPLATES } from '@domain/valueObjects/DefaultTemplates';
import {
  filterByStudent,
  filterByCategory,
  filterBySubcategory,
  filterByDateRange,
  filterByKeyword,
  getAttendanceStats,
  getCategorySummary,
  getWarningStudents,
  sortByDateDesc,
} from '@domain/rules/studentRecordRules';
import { RecordCategoryManagementModal } from './RecordCategoryManagementModal';
import { DateNavigator } from './DateNavigator';

/* ──────────────────────── 유틸 ──────────────────────── */

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekRange(): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const start = new Date(now);
  start.setDate(now.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

function getMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start, end };
}

function formatDateKR(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function formatTimeKR(isoStr: string): string {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('ko-KR', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

const GRAY_COLOR = RECORD_COLOR_MAP['gray']!;

function getSubcategoryChipClass(color: string, isSelected: boolean): string {
  const base = 'px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer select-none';
  const c = RECORD_COLOR_MAP[color] ?? GRAY_COLOR;
  return `${base} ${isSelected ? c.activeBg : c.inactiveBg}`;
}

function getCategoryLabelColor(color: string): string {
  return RECORD_COLOR_MAP[color]?.text ?? GRAY_COLOR.text;
}

function getRecordTagClass(categoryId: string, categories: readonly RecordCategoryItem[]): string {
  const cat = categories.find((c) => c.id === categoryId);
  const c = RECORD_COLOR_MAP[cat?.color ?? 'gray'] ?? GRAY_COLOR;
  return `px-2 py-0.5 rounded text-xs font-medium ${c.tagBg}`;
}

function getCategoryDotColor(categoryId: string, categories: readonly RecordCategoryItem[]): string {
  const cat = categories.find((c) => c.id === categoryId);
  const colorMap: Record<string, string> = {
    red: 'bg-red-400',
    blue: 'bg-blue-400',
    green: 'bg-green-400',
    yellow: 'bg-yellow-400',
    purple: 'bg-purple-400',
    pink: 'bg-pink-400',
    indigo: 'bg-indigo-400',
    teal: 'bg-teal-400',
    gray: 'bg-gray-400',
  };
  return colorMap[cat?.color ?? 'gray'] ?? 'bg-gray-400';
}

/** 출결 유형별 태그 색상 (subcategory 파싱) */
const ATTENDANCE_TAG_COLORS: Record<string, string> = {
  '결석': 'bg-red-500/15 text-red-400',
  '지각': 'bg-yellow-500/15 text-yellow-400',
  '조퇴': 'bg-orange-500/15 text-orange-400',
  '결과': 'bg-purple-500/15 text-purple-400',
};

function getAttendanceTypeFromSubcategory(subcategory: string): string | null {
  const match = subcategory.match(/^(결석|지각|조퇴|결과)/);
  return match ? match[1]! : null;
}

/** 출결 레코드면 유형별 색상, 아니면 기존 카테고리 색상 */
function getSmartTagClass(record: { category: string; subcategory: string }, categories: readonly RecordCategoryItem[]): string {
  if (record.category === 'attendance') {
    const attType = getAttendanceTypeFromSubcategory(record.subcategory);
    if (attType && ATTENDANCE_TAG_COLORS[attType]) {
      return `px-2 py-0.5 rounded text-xs font-medium ${ATTENDANCE_TAG_COLORS[attType]}`;
    }
  }
  return getRecordTagClass(record.category, categories);
}

/** 출결 유형 정렬 우선순위 */
const ATTENDANCE_SORT_ORDER: Record<string, number> = {
  '결석': 0,
  '지각': 1,
  '조퇴': 2,
  '결과': 3,
};

type RecordSortMode = 'time' | 'type' | 'studentNumber';

const RECORD_SORT_OPTIONS: { mode: RecordSortMode; label: string; icon: string }[] = [
  { mode: 'time', label: '입력 시간', icon: 'schedule' },
  { mode: 'type', label: '유형별', icon: 'filter_list' },
  { mode: 'studentNumber', label: '학번순', icon: 'format_list_numbered' },
];

/* ──────────────────────── 메인 컴포넌트 ──────────────────────── */

type ViewMode = 'input' | 'progress' | 'search';

const MODE_TABS: { id: ViewMode; icon: string; label: string }[] = [
  { id: 'input', icon: '✏️', label: '입력' },
  { id: 'progress', icon: '📊', label: '통계' },
  { id: 'search', icon: '🔍', label: '조회' },
];

export function StudentRecords() {
  const { records, loaded, load, viewMode, setViewMode, categories } =
    useStudentRecordsStore();
  const { students, load: loadStudents, loaded: studentsLoaded } =
    useStudentStore();
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayString());

  useEffect(() => {
    void load();
    void loadStudents();
  }, [load, loadStudents]);

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
      {/* 헤더 */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-sp-text flex items-center gap-2">
          <span>👩‍🏫</span>
          <span>담임 메모장</span>
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCategoryModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-all"
            title="카테고리 관리"
          >
            <span className="material-symbols-outlined text-base">tune</span>
            <span className="text-xs">카테고리 관리</span>
          </button>
          <div className="flex gap-1 bg-sp-surface rounded-lg p-1">
            {MODE_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setViewMode(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === tab.id
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
      </div>

      <div className="flex gap-1 mb-6 border-b border-sp-border pb-3">
        <ClassTab label="담임" isActive />
      </div>

      {viewMode === 'input' && (
        <DateNavigator selectedDate={selectedDate} onDateChange={setSelectedDate} />
      )}

      {viewMode === 'input' && (
        <InputMode students={students} records={filteredRecords} categories={categories} selectedDate={selectedDate} />
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
    </div>
  );
}

/* ──────────────────────── 반 선택 탭 ──────────────────────── */

interface ClassTabProps {
  label: string;
  isActive: boolean;
}

function ClassTab({ label, isActive }: ClassTabProps) {
  return (
    <button
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${isActive
        ? 'bg-sp-accent text-white'
        : 'text-sp-muted hover:text-sp-text hover:bg-sp-surface'
        }`}
    >
      {label}
    </button>
  );
}

/* ──────────────────────── 입력 모드 ──────────────────────── */

interface ModeProps {
  students: readonly Student[];
  records: readonly StudentRecord[];
  categories: readonly RecordCategoryItem[];
}

interface InputModeProps extends ModeProps {
  selectedDate: string;
}

const METHOD_OPTIONS: { value: CounselingMethod; icon: string; label: string }[] = [
  { value: 'phone', icon: '\uD83D\uDCDE', label: '전화' },
  { value: 'face', icon: '\uD83E\uDD1D', label: '대면' },
  { value: 'online', icon: '\uD83D\uDCBB', label: '온라인' },
  { value: 'visit', icon: '\uD83C\uDFE0', label: '가정방문' },
  { value: 'text', icon: '\uD83D\uDCAC', label: '문자' },
  { value: 'other', icon: '\uD83D\uDCDD', label: '기타' },
];

function getMethodIcon(method: CounselingMethod | undefined): string {
  if (!method) return '';
  const found = METHOD_OPTIONS.find((m) => m.value === method);
  return found?.icon ?? '';
}

function InputMode({ students, records, categories, selectedDate }: InputModeProps) {
  const { addRecord, deleteRecord, updateRecord } = useStudentRecordsStore();
  const { seating } = useSeatingStore();
  const [studentViewMode, setStudentViewMode] = useState<'number' | 'seat'>('number');
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [editingCategory, setEditingCategory] = useState('');
  const [editingSubcat, setEditingSubcat] = useState('');
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [selectedSub, setSelectedSub] = useState<{
    categoryId: string;
    subcategory: string;
  } | null>(null);
  const [attendanceType, setAttendanceType] = useState<string | null>(null);
  const [memo, setMemo] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<CounselingMethod | undefined>(undefined);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [followUp, setFollowUp] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');

  const toggleStudent = useCallback((id: string) => {
    setSelectedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setSelectedStudents(new Set());
  }, []);

  const handleAttendanceTypeClick = useCallback((type: string) => {
    setAttendanceType((prev) => {
      if (prev === type) {
        setSelectedSub((s) => s?.categoryId === 'attendance' ? null : s);
        return null;
      }
      setSelectedSub((s) => s?.categoryId === 'attendance' ? null : s);
      return type;
    });
  }, []);

  const handleAttendanceReasonClick = useCallback((reason: string) => {
    if (!attendanceType) return;
    const subcategory = `${attendanceType} (${reason})`;
    setSelectedSub((prev) =>
      prev?.categoryId === 'attendance' && prev.subcategory === subcategory
        ? null
        : { categoryId: 'attendance', subcategory },
    );
  }, [attendanceType]);

  const handleSubcategoryClick = useCallback(
    (categoryId: string, sub: string) => {
      setSelectedSub((prev) =>
        prev?.categoryId === categoryId && prev.subcategory === sub
          ? null
          : { categoryId, subcategory: sub },
      );
      setAttendanceType(null);
    },
    [],
  );

  // 2-2: 템플릿 적용
  const handleTemplateSelect = useCallback((templateId: string) => {
    const tpl = DEFAULT_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;

    if (tpl.category === 'attendance') {
      // 출결 템플릿: subcategory가 비어있으면 유형 선택 안 함
      if (tpl.subcategory) {
        setSelectedSub({ categoryId: 'attendance', subcategory: tpl.subcategory });
      }
    } else {
      setSelectedSub({ categoryId: tpl.category, subcategory: tpl.subcategory });
    }
    setAttendanceType(null);
    if (tpl.method) {
      setSelectedMethod(tpl.method as CounselingMethod);
    }
    setMemo(tpl.contentTemplate);
  }, []);

  const handleSave = useCallback(async () => {
    if (selectedStudents.size === 0 || selectedSub === null) return;

    const method = selectedSub.categoryId === 'counseling' ? selectedMethod : undefined;
    const fu = followUp.trim() || undefined;
    const fuDate = followUpDate || undefined;
    const promises = Array.from(selectedStudents).map((studentId) =>
      addRecord(
        studentId,
        selectedSub.categoryId,
        selectedSub.subcategory,
        memo,
        selectedDate,
        method,
        fu,
        fuDate,
      ),
    );
    await Promise.all(promises);

    setSelectedStudents(new Set());
    setSelectedSub(null);
    setAttendanceType(null);
    setMemo('');
    setSelectedMethod(undefined);
    setShowFollowUp(false);
    setFollowUp('');
    setFollowUpDate('');
  }, [selectedStudents, selectedSub, memo, selectedDate, selectedMethod, followUp, followUpDate, addRecord]);

  const dateRecords = useMemo(() => {
    return records.filter((r) => r.date === selectedDate);
  }, [records, selectedDate]);

  const studentMap = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students],
  );

  const canSave = selectedStudents.size > 0 && selectedSub !== null;

  return (
    <div className="flex-1 flex gap-4 min-h-0">
      {/* 좌측: 학생 선택 */}
      <div className="flex-1 flex flex-col rounded-xl bg-sp-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-sp-text flex items-center gap-2">
            <span className="material-symbols-outlined text-base">group</span>
            학생 선택
            <span className="text-sp-muted font-normal">
              ({selectedStudents.size}명 선택됨)
            </span>
          </h3>
          <div className="flex items-center gap-2">
            {/* 뷰 토글 */}
            <div className="flex items-center rounded-lg bg-sp-surface p-0.5 gap-0.5">
              <button
                onClick={() => setStudentViewMode('number')}
                title="번호 순"
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                  studentViewMode === 'number'
                    ? 'bg-sp-accent text-white'
                    : 'text-sp-muted hover:text-sp-text'
                }`}
              >
                <span className="material-symbols-outlined text-sm leading-none">format_list_numbered</span>
                번호 순
              </button>
              <button
                onClick={() => setStudentViewMode('seat')}
                title="자리 배치"
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                  studentViewMode === 'seat'
                    ? 'bg-sp-accent text-white'
                    : 'text-sp-muted hover:text-sp-text'
                }`}
              >
                <span className="material-symbols-outlined text-sm leading-none">grid_view</span>
                자리 배치
              </button>
            </div>
            <button
              onClick={clearAll}
              className="text-xs text-sp-accent hover:text-sp-accent/80 transition-colors"
            >
              모두 해제
            </button>
          </div>
        </div>

        {studentViewMode === 'number' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 overflow-y-auto flex-1">
            {students.map((student, idx) => {
              const isSelected = selectedStudents.has(student.id);
              return (
                <button
                  key={student.id}
                  onClick={() => toggleStudent(student.id)}
                  className={`px-3 py-2.5 rounded-lg text-xs font-medium transition-all text-left whitespace-nowrap ${
                    isSelected
                      ? 'bg-sp-accent text-white ring-1 ring-sp-accent'
                      : 'bg-sp-surface text-sp-text hover:bg-sp-surface/80'
                  }`}
                >
                  <span className="text-caption opacity-60 mr-1">{idx + 1}</span>
                  {student.name}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-2 overflow-y-auto flex-1">
            {/* 교탁 표시 */}
            <div className="flex justify-center mb-1">
              <div className="px-4 py-1 rounded-md bg-sp-surface border border-sp-border text-xs text-sp-muted">
                교탁
              </div>
            </div>
            {/* 자리 배치 그리드 */}
            <div
              className="grid gap-2 flex-1"
              style={{
                gridTemplateColumns: `repeat(${seating.cols}, minmax(0, 1fr))`,
              }}
            >
              {Array.from({ length: seating.rows }, (_, rowIdx) =>
                Array.from({ length: seating.cols }, (_, colIdx) => {
                  const cellId = seating.seats[rowIdx]?.[colIdx] ?? null;
                  if (cellId === null) {
                    return (
                      <div
                        key={`empty-${rowIdx}-${colIdx}`}
                        className="rounded-lg bg-sp-surface/30 border border-sp-border/30 py-2.5"
                      />
                    );
                  }
                  const student = studentMap.get(cellId);
                  if (!student) {
                    return (
                      <div
                        key={`unknown-${rowIdx}-${colIdx}`}
                        className="rounded-lg bg-sp-surface/30 border border-sp-border/30 py-2.5"
                      />
                    );
                  }
                  const idx = students.indexOf(student);
                  const isSelected = selectedStudents.has(student.id);
                  return (
                    <button
                      key={student.id}
                      onClick={() => toggleStudent(student.id)}
                      className={`px-1 py-2 rounded-lg text-xs font-medium transition-all text-center leading-tight ${
                        isSelected
                          ? 'bg-sp-accent text-white ring-1 ring-sp-accent'
                          : 'bg-sp-surface text-sp-text hover:bg-sp-surface/80'
                      }`}
                    >
                      <div className="text-caption opacity-70">{idx + 1}</div>
                      <div>{student.name}</div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* 우측 패널 */}
      <div className="w-[380px] flex flex-col gap-3 shrink-0 overflow-y-auto">
        {/* 카드 1: 카테고리 선택 + 템플릿 */}
        <div className="rounded-xl bg-sp-card p-4 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-sp-text flex items-center gap-2">
              <span className="material-symbols-outlined text-base">category</span>
              카테고리
            </h3>
            <select
              onChange={(e) => {
                if (e.target.value) handleTemplateSelect(e.target.value);
                e.target.value = '';
              }}
              defaultValue=""
              className="bg-sp-surface border border-sp-border rounded-lg px-2 py-1 text-xs text-sp-muted focus:outline-none focus:ring-1 focus:ring-sp-accent"
            >
              <option value="">{'\uD83D\uDCDD'} 템플릿</option>
              {DEFAULT_TEMPLATES.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-3">
            {categories.map((cat) => (
              <div key={cat.id}>
                <p className={`text-xs font-semibold mb-1.5 ${getCategoryLabelColor(cat.color)}`}>
                  {cat.name}
                </p>
                {cat.id === 'attendance' ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {ATTENDANCE_TYPES.map((type) => {
                        const isTypeSelected = attendanceType === type;
                        return (
                          <button
                            key={type}
                            onClick={() => handleAttendanceTypeClick(type)}
                            className={getSubcategoryChipClass(cat.color, isTypeSelected)}
                          >
                            {isTypeSelected && <span className="mr-1">✓</span>}
                            {type}
                          </button>
                        );
                      })}
                    </div>
                    {attendanceType && (
                      <div className="ml-2 pl-3 border-l-2 border-red-500/30">
                        <p className="text-detail text-sp-muted mb-1">사유</p>
                        <div className="flex flex-wrap gap-1.5">
                          {ATTENDANCE_REASONS.map((reason) => {
                            const combined = `${attendanceType} (${reason})`;
                            const isReasonSelected =
                              selectedSub?.categoryId === 'attendance' &&
                              selectedSub.subcategory === combined;
                            return (
                              <button
                                key={reason}
                                onClick={() => handleAttendanceReasonClick(reason)}
                                className={getSubcategoryChipClass(cat.color, isReasonSelected)}
                              >
                                {isReasonSelected && <span className="mr-1">✓</span>}
                                {reason}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {cat.subcategories.map((sub) => {
                      const isSelected =
                        selectedSub?.categoryId === cat.id &&
                        selectedSub.subcategory === sub;
                      return (
                        <button
                          key={sub}
                          onClick={() => handleSubcategoryClick(cat.id, sub)}
                          className={getSubcategoryChipClass(cat.color, isSelected)}
                        >
                          {isSelected && <span className="mr-1">✓</span>}
                          {sub}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 카드 2: 메모 + 상담방법 + 후속조치 통합 */}
        <div className="rounded-xl bg-sp-card p-4 space-y-3">
          {/* 상담 방법 (인라인, counseling일 때만) */}
          {selectedSub?.categoryId === 'counseling' && (
            <div>
              <p className="text-xs text-sp-muted mb-1.5">상담 방법</p>
              <div className="flex flex-wrap gap-1.5">
                {METHOD_OPTIONS.map((opt) => {
                  const isSelected = selectedMethod === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setSelectedMethod(isSelected ? undefined : opt.value)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                        isSelected
                          ? 'bg-sp-accent text-white'
                          : 'bg-sp-surface text-sp-muted hover:text-sp-text hover:bg-sp-surface/80'
                      }`}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 메모 */}
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="메모 입력 (선택사항)"
            className="w-full h-20 bg-sp-surface border border-sp-border rounded-lg p-3 text-sm text-sp-text placeholder-sp-muted resize-none focus:outline-none focus:ring-1 focus:ring-sp-accent"
          />

          {/* 후속 조치 (인라인 토글) */}
          <div>
            <button
              onClick={() => setShowFollowUp(!showFollowUp)}
              className="flex items-center gap-1.5 text-xs text-sp-muted hover:text-sp-text transition-colors"
            >
              <span className={`material-symbols-outlined text-sm transition-transform ${showFollowUp ? 'rotate-180' : ''}`}>
                expand_more
              </span>
              {'\uD83D\uDCCC'} 후속 조치 추가
            </button>
            {showFollowUp && (
              <div className="mt-2 flex gap-2">
                <input
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value)}
                  placeholder="후속 조치 내용"
                  className="flex-1 bg-sp-surface border border-sp-border rounded-lg px-2.5 py-1.5 text-xs text-sp-text placeholder-sp-muted focus:outline-none focus:ring-1 focus:ring-sp-accent"
                />
                <input
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  className="bg-sp-surface border border-sp-border rounded-lg px-2 py-1.5 text-xs text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent w-32"
                />
              </div>
            )}
          </div>
        </div>

        {/* 날짜 기록 미리보기 (기록 있을 때만) */}
        {dateRecords.length > 0 && (
          <div className="rounded-xl bg-sp-card px-4 py-3">
            <p className="text-xs text-sp-muted mb-1.5">
              {'\uD83D\uDCCB'} {formatDateKR(selectedDate)} 기록 ({dateRecords.length}건)
            </p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {dateRecords.map((record) => {
                const student = studentMap.get(record.studentId);
                const isEditing = editingRecordId === record.id;
                return (
                  <div key={record.id} className={`group flex items-center gap-2 text-xs rounded-lg px-1.5 py-1 -mx-1.5 transition-colors ${
                    isEditing ? 'bg-sp-accent/10 ring-1 ring-sp-accent/30' : 'hover:bg-sp-surface/50'
                  }`}>
                    <span className={getRecordTagClass(record.category, categories)}>
                      {record.subcategory}
                    </span>
                    <span className="text-sp-text font-medium">{student?.name ?? '?'}</span>
                    {!isEditing && (
                      <>
                        {record.content && (
                          <span className="text-sp-muted truncate flex-1">{record.content}</span>
                        )}
                        <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
                          <button
                            onClick={() => {
                              setEditingRecordId(record.id);
                              setEditingContent(record.content);
                              setEditingCategory(record.category);
                              setEditingSubcat(record.subcategory);
                            }}
                            className="text-sp-muted hover:text-sp-accent transition-colors"
                            title="수정"
                          >
                            <span className="material-symbols-outlined text-sm">edit</span>
                          </button>
                          <button
                            onClick={() => { if (window.confirm('이 기록을 삭제하시겠습니까?')) void deleteRecord(record.id); }}
                            className="text-sp-muted hover:text-red-400 transition-colors"
                            title="삭제"
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </button>
                        </div>
                      </>
                    )}
                    {isEditing && (
                      <span className="ml-auto text-caption text-sp-accent font-medium">수정 중</span>
                    )}
                  </div>
                );
              })}
            </div>
            {/* 편집 에디터: 기록 리스트 바깥에 별도 카드로 렌더링 */}
            {editingRecordId && (() => {
              const editingRecord = dateRecords.find((r) => r.id === editingRecordId);
              if (!editingRecord) return null;
              return (
                <div className="mt-2">
                  <InlineRecordEditor
                    record={editingRecord}
                    categories={categories}
                    editContent={editingContent}
                    setEditContent={setEditingContent}
                    editCategory={editingCategory}
                    setEditCategory={setEditingCategory}
                    editSubcategory={editingSubcat}
                    setEditSubcategory={setEditingSubcat}
                    onSave={() => {
                      void updateRecord({ ...editingRecord, content: editingContent, category: editingCategory, subcategory: editingSubcat });
                      setEditingRecordId(null);
                    }}
                    onCancel={() => setEditingRecordId(null)}
                  />
                </div>
              );
            })()}
          </div>
        )}

        {/* 저장 */}
        <button
          onClick={() => void handleSave()}
          disabled={!canSave}
          className={`w-full py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${canSave
            ? 'bg-sp-accent text-white hover:bg-sp-accent/90 shadow-lg shadow-sp-accent/20'
            : 'bg-sp-surface text-sp-muted cursor-not-allowed'
            }`}
        >
          <span className="material-symbols-outlined text-base">save</span>
          저장하기
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────── 통계 모드 (2-5 강화) ──────────────────────── */

type StatsPeriod = 'week' | 'month' | 'custom' | 'all';
type StatsTab = 'attendance' | 'counseling' | 'life' | 'all';
type SortKey = 'number' | 'name' | 'absent' | 'late' | 'earlyLeave' | 'resultAbsent' | 'praise' | 'total'
  | 'counseling_count' | 'life_count' | 'all_count';
type SortDir = 'asc' | 'desc';

function toDateInputString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ProgressMode({ students, records }: ModeProps) {
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('all');
  const [statsTab, setStatsTab] = useState<StatsTab>('attendance');
  const [sortKey, setSortKey] = useState<SortKey>('number');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const monthRange = useMemo(() => getMonthRange(), []);
  const [customStart, setCustomStart] = useState<string>(toDateInputString(monthRange.start));
  const [customEnd, setCustomEnd] = useState<string>(toDateInputString(monthRange.end));

  const filteredRecords = useMemo(() => {
    if (statsPeriod === 'week') {
      const { start, end } = getWeekRange();
      return filterByDateRange(records, start, end) as StudentRecord[];
    }
    if (statsPeriod === 'month') {
      const { start, end } = getMonthRange();
      return filterByDateRange(records, start, end) as StudentRecord[];
    }
    if (statsPeriod === 'custom') {
      const start = new Date(customStart + 'T00:00:00');
      const end = new Date(customEnd + 'T23:59:59');
      return filterByDateRange(records, start, end) as StudentRecord[];
    }
    return records as StudentRecord[];
  }, [records, statsPeriod, customStart, customEnd]);

  // 2-5: 요약 카드
  const summary = useMemo(() => getCategorySummary(filteredRecords), [filteredRecords]);

  // 2-5: 주의 학생
  const warningStudents = useMemo(
    () => getWarningStudents(filteredRecords, students),
    [filteredRecords, students],
  );

  const statsRows = useMemo(() => {
    const rows = students.map((student, idx) => {
      const studentRecs = filterByStudent(filteredRecords, student.id);
      const stats = getAttendanceStats(filteredRecords, student.id);
      const counselingCount = studentRecs.filter((r) => r.category === 'counseling').length;
      const lifeCount = studentRecs.filter((r) => r.category === 'life').length;
      const totalRecords = studentRecs.length;
      return { student, stats, counselingCount, lifeCount, totalRecords, idx };
    });

    // 정렬
    const sorted = [...rows];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'number': cmp = a.idx - b.idx; break;
        case 'name': cmp = a.student.name.localeCompare(b.student.name); break;
        case 'absent': cmp = a.stats.absent - b.stats.absent; break;
        case 'late': cmp = a.stats.late - b.stats.late; break;
        case 'earlyLeave': cmp = a.stats.earlyLeave - b.stats.earlyLeave; break;
        case 'resultAbsent': cmp = a.stats.resultAbsent - b.stats.resultAbsent; break;
        case 'praise': cmp = a.stats.praise - b.stats.praise; break;
        case 'total': case 'all_count': cmp = a.totalRecords - b.totalRecords; break;
        case 'counseling_count': cmp = a.counselingCount - b.counselingCount; break;
        case 'life_count': cmp = a.lifeCount - b.lifeCount; break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [students, filteredRecords, sortKey, sortDir]);

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }, [sortKey]);

  const SortHeader = useCallback(({ label, sortId, className }: { label: string; sortId: SortKey; className?: string }) => (
    <th
      onClick={() => handleSort(sortId)}
      className={`p-3 font-medium border-b cursor-pointer hover:text-sp-text transition-colors select-none ${className ?? ''}`}
    >
      {label}
      {sortKey === sortId && (
        <span className="ml-1 text-sp-accent">{sortDir === 'asc' ? '▲' : '▼'}</span>
      )}
    </th>
  ), [handleSort, sortKey, sortDir]);

  const STATS_TABS: { id: StatsTab; label: string }[] = [
    { id: 'attendance', label: '출결' },
    { id: 'counseling', label: '상담' },
    { id: 'life', label: '생활' },
    { id: 'all', label: '전체' },
  ];

  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0">
      {/* 2-5: 요약 카드 */}
      <div className="grid grid-cols-4 gap-3">
        <SummaryCard label="총 기록" value={summary.total} icon="description" color="text-sp-accent" />
        <SummaryCard label="출결" value={summary.attendance} icon="event_busy" color="text-red-400" />
        <SummaryCard label="상담" value={summary.counseling} icon="psychology" color="text-blue-400" />
        <SummaryCard label="생활" value={summary.life} icon="school" color="text-green-400" />
      </div>

      {/* 기간 필터 + 카테고리 탭 */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* 2-5: 카테고리 탭 */}
        <div className="flex gap-1 bg-sp-surface rounded-lg p-1">
          {STATS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatsTab(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${statsTab === tab.id
                ? 'bg-sp-accent text-white'
                : 'text-sp-muted hover:text-sp-text'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1 bg-sp-surface rounded-lg p-1 ml-auto">
          {([
            { id: 'week', label: '이번 주' },
            { id: 'month', label: '이번 달' },
            { id: 'custom', label: '직접 설정' },
            { id: 'all', label: '전체' },
          ] as const).map((f) => (
            <button
              key={f.id}
              onClick={() => setStatsPeriod(f.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${statsPeriod === f.id
                ? 'bg-sp-accent text-white'
                : 'text-sp-muted hover:text-sp-text'
                }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {statsPeriod === 'custom' && (
          <div className="flex items-center gap-2 ml-2">
            <label className="text-xs text-sp-muted">시작일</label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-sp-surface border border-sp-border rounded-lg px-2 py-1.5 text-xs text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
            />
            <span className="text-xs text-sp-muted">~</span>
            <label className="text-xs text-sp-muted">종료일</label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-sp-surface border border-sp-border rounded-lg px-2 py-1.5 text-xs text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
            />
          </div>
        )}
      </div>

      {/* 통계 테이블 */}
      <div className="flex-1 overflow-auto rounded-xl bg-sp-card">
        <table className="w-full text-sm border-collapse timetable-grid">
          <thead>
            <tr className="text-sp-muted">
              <SortHeader label="번호" sortId="number" className="text-left" />
              <SortHeader label="이름" sortId="name" className="text-left" />
              {statsTab === 'attendance' && (
                <>
                  <SortHeader label="결석" sortId="absent" className="text-center border-l" />
                  <SortHeader label="지각" sortId="late" className="text-center border-l" />
                  <SortHeader label="조퇴" sortId="earlyLeave" className="text-center border-l" />
                  <SortHeader label="결과" sortId="resultAbsent" className="text-center border-l" />
                  <SortHeader label="칭찬" sortId="praise" className="text-center border-l" />
                </>
              )}
              {statsTab === 'counseling' && (
                <SortHeader label="상담 건수" sortId="counseling_count" className="text-center border-l" />
              )}
              {statsTab === 'life' && (
                <SortHeader label="생활 건수" sortId="life_count" className="text-center border-l" />
              )}
              <SortHeader label="전체" sortId="total" className="text-center border-l" />
            </tr>
          </thead>
          <tbody>
            {statsRows.map(({ student, stats, counselingCount, lifeCount, totalRecords, idx }) => (
              <tr key={student.id} className="hover:bg-sp-surface/30 transition-colors">
                <td className="p-3 text-sp-muted border-b">{idx + 1}</td>
                <td className="p-3 text-sp-text font-medium border-b">{student.name}</td>
                {statsTab === 'attendance' && (
                  <>
                    <td className="text-center p-3 border-b border-l"><StatBadge value={stats.absent} color="red" /></td>
                    <td className="text-center p-3 border-b border-l"><StatBadge value={stats.late} color="orange" /></td>
                    <td className="text-center p-3 border-b border-l"><StatBadge value={stats.earlyLeave} color="yellow" /></td>
                    <td className="text-center p-3 border-b border-l"><StatBadge value={stats.resultAbsent} color="purple" /></td>
                    <td className="text-center p-3 border-b border-l"><StatBadge value={stats.praise} color="green" /></td>
                  </>
                )}
                {statsTab === 'counseling' && (
                  <td className="text-center p-3 border-b border-l"><StatBadge value={counselingCount} color="blue" /></td>
                )}
                {statsTab === 'life' && (
                  <td className="text-center p-3 border-b border-l"><StatBadge value={lifeCount} color="green" /></td>
                )}
                <td className="text-center p-3 text-sp-muted border-b border-l">{totalRecords}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 2-5: 주의 학생 */}
      {warningStudents.length > 0 && (
        <div className="rounded-xl bg-sp-card p-4">
          <h3 className="text-sm font-bold text-sp-text flex items-center gap-2 mb-3">
            <span>{'\u26A0\uFE0F'}</span>
            주의 학생
          </h3>
          <div className="flex flex-wrap gap-2">
            {warningStudents.map((ws) => (
              <div
                key={ws.student.id}
                className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20"
              >
                <span className="text-sm font-medium text-red-400">{ws.student.name}</span>
                <span className="text-xs text-red-400/70 ml-2">{ws.reasons.join(', ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <div className="rounded-xl bg-sp-card p-4 flex items-center gap-3">
      <span className={`material-symbols-outlined text-2xl ${color}`}>{icon}</span>
      <div>
        <p className="text-xs text-sp-muted">{label}</p>
        <p className={`text-xl font-bold ${color}`}>{value}</p>
      </div>
    </div>
  );
}

interface StatBadgeProps {
  value: number;
  color: string;
}

function StatBadge({ value, color }: StatBadgeProps) {
  if (value === 0) {
    return <span className="text-sp-muted/40">-</span>;
  }
  const colorMap: Record<string, string> = {
    red: 'bg-red-500/15 text-red-400',
    orange: 'bg-orange-500/15 text-orange-400',
    yellow: 'bg-yellow-500/15 text-yellow-400',
    purple: 'bg-purple-500/15 text-purple-400',
    green: 'bg-green-500/15 text-green-400',
    blue: 'bg-blue-500/15 text-blue-400',
  };
  return (
    <span className={`inline-block min-w-[24px] px-1.5 py-0.5 rounded text-xs font-semibold ${colorMap[color] ?? ''}`}>
      {value}
    </span>
  );
}

/* ──────────────────────── 조회 모드 (2-1, 2-3, 2-4 강화) ──────────────────────── */

const COUNSELING_METHODS: { value: CounselingMethod; label: string }[] = [
  { value: 'phone', label: '전화' },
  { value: 'face', label: '대면' },
  { value: 'online', label: '온라인' },
  { value: 'visit', label: '가정방문' },
  { value: 'text', label: '문자' },
  { value: 'other', label: '기타' },
];

function SearchMode({ students, records, categories }: ModeProps) {
  const { periodFilter, setPeriodFilter, deleteRecord, updateRecord, toggleFollowUpDone } =
    useStudentRecordsStore();
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editSubcategory, setEditSubcategory] = useState('');
  const [sortMode, setSortMode] = useState<RecordSortMode>('time');

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
    selectedMethod || debouncedKeyword || followUpOnly || periodFilter !== 'all';

  const resetFilters = useCallback(() => {
    setSelectedStudentId('');
    setSelectedCategory('');
    setSelectedSubcategory('');
    setSelectedMethod('');
    setKeyword('');
    setDebouncedKeyword('');
    setFollowUpOnly(false);
    setPeriodFilter('all');
  }, [setPeriodFilter]);

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
    if (periodFilter === 'week') {
      const { start, end } = getWeekRange();
      result = filterByDateRange(result, start, end) as StudentRecord[];
    } else if (periodFilter === 'month') {
      const { start, end } = getMonthRange();
      result = filterByDateRange(result, start, end) as StudentRecord[];
    }

    return sortByDateDesc(result);
  }, [records, selectedStudentId, selectedCategory, selectedSubcategory, selectedMethod, debouncedKeyword, followUpOnly, periodFilter]);

  // 날짜별 그룹핑 + 그룹 내 정렬
  const grouped = useMemo(() => {
    const map = new Map<string, StudentRecord[]>();
    for (const record of filtered) {
      const existing = map.get(record.date);
      if (existing) existing.push(record);
      else map.set(record.date, [record]);
    }
    const entries = Array.from(map.entries());

    // 그룹 내 정렬
    if (sortMode === 'type') {
      for (const [, recs] of entries) {
        recs.sort((a, b) => {
          const ta = getAttendanceTypeFromSubcategory(a.subcategory);
          const tb = getAttendanceTypeFromSubcategory(b.subcategory);
          const oa = ta ? (ATTENDANCE_SORT_ORDER[ta] ?? 99) : 99;
          const ob = tb ? (ATTENDANCE_SORT_ORDER[tb] ?? 99) : 99;
          if (oa !== ob) return oa - ob;
          // 같은 유형이면 학번순
          const sa = studentMap.get(a.studentId)?.studentNumber ?? 0;
          const sb = studentMap.get(b.studentId)?.studentNumber ?? 0;
          return sa - sb;
        });
      }
    } else if (sortMode === 'studentNumber') {
      for (const [, recs] of entries) {
        recs.sort((a, b) => {
          const sa = studentMap.get(a.studentId)?.studentNumber ?? 0;
          const sb = studentMap.get(b.studentId)?.studentNumber ?? 0;
          return sa - sb;
        });
      }
    }
    // 'time' → 기본 정렬 유지 (sortByDateDesc)

    return entries;
  }, [filtered, sortMode, studentMap]);

  const handleEdit = useCallback((record: StudentRecord) => {
    setEditingId(record.id);
    setEditContent(record.content);
    setEditCategory(record.category);
    setEditSubcategory(record.subcategory);
  }, []);

  const handleEditSave = useCallback(async (record: StudentRecord) => {
    await updateRecord({
      ...record,
      content: editContent,
      category: editCategory,
      subcategory: editSubcategory,
    });
    setEditingId(null);
    setEditContent('');
    setEditCategory('');
    setEditSubcategory('');
  }, [editContent, editCategory, editSubcategory, updateRecord]);

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

        {/* 기간 필터 */}
        <div className="flex gap-1 bg-sp-surface rounded-lg p-1 ml-auto">
          {([
            { id: 'week', label: '이번 주' },
            { id: 'month', label: '이번 달' },
            { id: 'all', label: '전체' },
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

        {/* 2-4: 필터 초기화 */}
        {hasFilters && (
          <button
            onClick={resetFilters}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            ✕ 필터 초기화
          </button>
        )}
      </div>

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
      </div>

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
          editingId={editingId}
          editContent={editContent}
          setEditContent={setEditContent}
          editCategory={editCategory}
          setEditCategory={setEditCategory}
          editSubcategory={editSubcategory}
          setEditSubcategory={setEditSubcategory}
          onEditSave={handleEditSave}
          onEditCancel={() => setEditingId(null)}
        />
      ) : (
        <DefaultRecordListView
          grouped={grouped}
          categories={categories}
          studentMap={studentMap}
          onEdit={handleEdit}
          onDelete={deleteRecord}
          onToggleFollowUp={toggleFollowUpDone}
          editingId={editingId}
          editContent={editContent}
          setEditContent={setEditContent}
          editCategory={editCategory}
          setEditCategory={setEditCategory}
          editSubcategory={editSubcategory}
          setEditSubcategory={setEditSubcategory}
          onEditSave={handleEditSave}
          onEditCancel={() => setEditingId(null)}
        />
      )}
    </div>
  );
}

/* ──────────────────────── 2-1: 학생별 타임라인 뷰 ──────────────────────── */

interface RecordEditProps {
  editingId: string | null;
  editContent: string;
  setEditContent: (v: string) => void;
  editCategory: string;
  setEditCategory: (v: string) => void;
  editSubcategory: string;
  setEditSubcategory: (v: string) => void;
  onEditSave: (record: StudentRecord) => Promise<void>;
  onEditCancel: () => void;
}

interface StudentTimelineViewProps extends RecordEditProps {
  student: Student;
  records: readonly StudentRecord[];
  categories: readonly RecordCategoryItem[];
  studentMap: Map<string, Student>;
  stats: { absent: number; late: number; earlyLeave: number; resultAbsent: number; praise: number; counseling: number; total: number } | null;
  onEdit: (record: StudentRecord) => void;
  onDelete: (id: string) => Promise<void>;
  onToggleFollowUp: (id: string) => Promise<void>;
}

function StudentTimelineView({
  student, records, categories, stats,
  onEdit, onDelete, onToggleFollowUp,
  editingId, editContent, setEditContent,
  editCategory, setEditCategory, editSubcategory, setEditSubcategory,
  onEditSave, onEditCancel,
}: StudentTimelineViewProps) {
  const studentIdx = student.studentNumber ?? 0;

  // 날짜별 그룹핑
  const grouped = useMemo(() => {
    const map = new Map<string, StudentRecord[]>();
    for (const record of records) {
      const existing = map.get(record.date);
      if (existing) existing.push(record);
      else map.set(record.date, [record]);
    }
    return Array.from(map.entries());
  }, [records]);

  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-y-auto">
      {/* 프로필 카드 */}
      <div className="rounded-xl bg-sp-card p-4 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-sp-accent/20 flex items-center justify-center">
          <span className="text-lg font-bold text-sp-accent">{student.name.charAt(0)}</span>
        </div>
        <div>
          <h3 className="text-lg font-bold text-sp-text">{student.name}</h3>
          <p className="text-xs text-sp-muted">{studentIdx}번 · 총 {records.length}건 기록</p>
        </div>
      </div>

      {/* 타임라인 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {grouped.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-sp-muted">기록이 없습니다</p>
          </div>
        ) : (
          <div className="relative pl-6">
            {/* 세로선 */}
            <div className="absolute left-[11px] top-0 bottom-0 w-0.5 bg-sp-border" />

            {grouped.map(([date, dateRecords]) => (
              <div key={date} className="mb-6">
                {/* 날짜 구분 */}
                <div className="flex items-center gap-3 mb-3 -ml-6">
                  <div className="w-[22px] h-[22px] rounded-full bg-sp-surface border-2 border-sp-border flex items-center justify-center z-10">
                    <span className="text-micro text-sp-muted">{'\uD83D\uDCC5'}</span>
                  </div>
                  <span className="text-xs font-semibold text-sp-muted">{formatDateKR(date)}</span>
                </div>

                <div className="space-y-2 ml-2">
                  {dateRecords.map((record) => {
                    const isEditing = editingId === record.id;
                    return (
                      <div key={record.id} className="relative">
                        {/* 도트 */}
                        <div className={`absolute -left-[23px] top-3 w-2.5 h-2.5 rounded-full ${getCategoryDotColor(record.category, categories)} z-10`} />

                        <div className={`group rounded-lg bg-sp-card p-3 hover:bg-sp-card/80 transition-all ${
                          isEditing ? 'ring-1 ring-sp-accent/40' : editingId ? 'opacity-60' : ''
                        }`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={getSmartTagClass(record, categories)}>
                              {record.subcategory}
                            </span>
                            {record.method && (
                              <span className="text-xs text-sp-muted">
                                {getMethodIcon(record.method)}
                              </span>
                            )}
                            {record.followUp && (
                              <span className="text-xs" title={record.followUp}>
                                {record.followUpDone ? '\u2705' : '\uD83D\uDCCC'}
                              </span>
                            )}
                            <span className="text-detail text-sp-muted ml-auto">
                              {formatTimeKR(record.createdAt)}
                            </span>
                          </div>

                          {isEditing ? (
                            <InlineRecordEditor
                              record={record}
                              categories={categories}
                              editContent={editContent}
                              setEditContent={setEditContent}
                              editCategory={editCategory}
                              setEditCategory={setEditCategory}
                              editSubcategory={editSubcategory}
                              setEditSubcategory={setEditSubcategory}
                              onSave={() => void onEditSave(record)}
                              onCancel={onEditCancel}
                            />
                          ) : (
                            <>
                              {record.content && (
                                <p className="text-sm text-sp-muted">{record.content}</p>
                              )}
                              {record.followUp && (
                                <div className="mt-1 flex items-center gap-2 text-xs">
                                  <span className="text-sp-muted">{'\uD83D\uDCCC'} {record.followUp}</span>
                                  {record.followUpDate && (
                                    <span className="text-sp-muted">({formatDateKR(record.followUpDate)})</span>
                                  )}
                                  <button
                                    onClick={() => void onToggleFollowUp(record.id)}
                                    className={`px-1.5 py-0.5 rounded text-caption ${
                                      record.followUpDone
                                        ? 'bg-green-500/15 text-green-400'
                                        : 'bg-orange-500/15 text-orange-400 hover:bg-orange-500/25'
                                    }`}
                                  >
                                    {record.followUpDone ? '완료됨' : '완료'}
                                  </button>
                                </div>
                              )}
                              <div className="flex items-center gap-1 mt-1">
                                <button
                                  onClick={() => onEdit(record)}
                                  className="p-0.5 rounded text-sp-muted/50 hover:text-sp-accent hover:bg-sp-accent/10 transition-colors"
                                  title="수정"
                                >
                                  <span className="material-symbols-outlined text-sm">edit</span>
                                </button>
                                <button
                                  onClick={() => { if (window.confirm('이 기록을 삭제하시겠습니까?')) void onDelete(record.id); }}
                                  className="p-0.5 rounded text-sp-muted/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                  title="삭제"
                                >
                                  <span className="material-symbols-outlined text-sm">delete</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 하단 통계 요약 */}
      {stats && (
        <div className="rounded-xl bg-sp-card p-4 flex items-center gap-6">
          <span className="text-sm font-bold text-sp-text">{student.name} 현황</span>
          <div className="flex gap-4">
            <StatItem label="결석" value={stats.absent} color="text-red-400" />
            <StatItem label="지각" value={stats.late} color="text-orange-400" />
            <StatItem label="상담" value={stats.counseling} color="text-blue-400" />
            <StatItem label="칭찬" value={stats.praise} color="text-green-400" />
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────── 기본 기록 리스트 뷰 ──────────────────────── */

interface DefaultRecordListViewProps extends RecordEditProps {
  grouped: [string, StudentRecord[]][];
  categories: readonly RecordCategoryItem[];
  studentMap: Map<string, Student>;
  onEdit: (record: StudentRecord) => void;
  onDelete: (id: string) => Promise<void>;
  onToggleFollowUp: (id: string) => Promise<void>;
}

function DefaultRecordListView({
  grouped, categories, studentMap,
  onEdit, onDelete, onToggleFollowUp,
  editingId, editContent, setEditContent,
  editCategory, setEditCategory, editSubcategory, setEditSubcategory,
  onEditSave, onEditCancel,
}: DefaultRecordListViewProps) {
  return (
    <div className="flex-1 overflow-y-auto space-y-4">
      {grouped.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-sp-muted">기록이 없습니다</p>
        </div>
      ) : (
        grouped.map(([date, dateRecords]) => (
          <div key={date}>
            <h4 className="text-xs font-semibold text-sp-muted mb-2">
              {formatDateKR(date)}
            </h4>
            <div className="space-y-1.5">
              {dateRecords.map((record) => {
                const student = studentMap.get(record.studentId);
                const isEditing = editingId === record.id;
                return (
                  <div
                    key={record.id}
                    className={`group flex items-center gap-3 rounded-lg bg-sp-card p-3 hover:bg-sp-card/80 transition-all ${
                      isEditing ? 'ring-1 ring-sp-accent/40' : editingId ? 'opacity-60' : ''
                    }`}
                  >
                    <span
                      className="text-detail font-medium text-sp-muted rounded border border-sp-border bg-sp-surface px-1.5 py-0.5 whitespace-nowrap tabular-nums flex-shrink-0"
                      title="작성 시간"
                    >
                      {formatTimeKR(record.createdAt)}
                    </span>
                    <span className={getSmartTagClass(record, categories)}>
                      {record.subcategory}
                    </span>
                    {record.method && (
                      <span className="text-xs text-sp-muted" title={METHOD_OPTIONS.find((m) => m.value === record.method)?.label}>
                        {getMethodIcon(record.method)}
                      </span>
                    )}
                    {record.followUp && (
                      <button
                        onClick={() => void onToggleFollowUp(record.id)}
                        className="text-xs"
                        title={`${record.followUp}${record.followUpDate ? ` (${formatDateKR(record.followUpDate)})` : ''}`}
                      >
                        {record.followUpDone ? '\u2705' : '\uD83D\uDCCC'}
                      </button>
                    )}
                    <span className="text-sm text-sp-text font-medium min-w-[60px] flex items-center gap-1.5">
                      {student?.studentNumber != null && (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-sp-surface border border-sp-border text-detail font-bold text-sp-muted tabular-nums flex-shrink-0">
                          {student.studentNumber}
                        </span>
                      )}
                      {student?.name ?? '?'}
                    </span>
                    {isEditing ? (
                      <InlineRecordEditor
                        record={record}
                        categories={categories}
                        editContent={editContent}
                        setEditContent={setEditContent}
                        editCategory={editCategory}
                        setEditCategory={setEditCategory}
                        editSubcategory={editSubcategory}
                        setEditSubcategory={setEditSubcategory}
                        onSave={() => void onEditSave(record)}
                        onCancel={onEditCancel}
                      />
                    ) : (
                      <>
                        <span className="flex-1 text-sm text-sp-muted">{record.content || ''}</span>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => onEdit(record)}
                            className="p-1 rounded text-sp-muted/50 hover:text-sp-accent hover:bg-sp-accent/10 transition-colors"
                            title="수정"
                          >
                            <span className="material-symbols-outlined text-sm">edit</span>
                          </button>
                          <button
                            onClick={() => { if (window.confirm('이 기록을 삭제하시겠습니까?')) void onDelete(record.id); }}
                            className="p-1 rounded text-sp-muted/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="삭제"
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ──────────────────────── 공용 컴포넌트 ──────────────────────── */

interface StatItemProps {
  label: string;
  value: number;
  color: string;
}

function StatItem({ label, value, color }: StatItemProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-sp-muted">{label}</span>
      <span className={`text-sm font-bold ${color}`}>{value}</span>
    </div>
  );
}

/* ──────────────────────── 공용 인라인 편집 컴포넌트 ──────────────────────── */

interface InlineRecordEditorProps {
  record: StudentRecord;
  categories: readonly RecordCategoryItem[];
  editContent: string;
  setEditContent: (v: string) => void;
  editCategory: string;
  setEditCategory: (v: string) => void;
  editSubcategory: string;
  setEditSubcategory: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  compact?: boolean;
}

function InlineRecordEditor({
  categories,
  editContent,
  setEditContent,
  editCategory,
  setEditCategory,
  editSubcategory,
  setEditSubcategory,
  onSave,
  onCancel,
  compact,
}: InlineRecordEditorProps) {
  const cat = useMemo(() => categories.find((c) => c.id === editCategory), [editCategory, categories]);
  const isAttendance = editCategory === 'attendance';

  // Local attendance 2-level state
  const [localAttType, setLocalAttType] = useState('');
  const [localAttReason, setLocalAttReason] = useState('');

  // Initialize attendance state from editSubcategory when category switches to attendance
  useEffect(() => {
    if (!isAttendance) { setLocalAttType(''); setLocalAttReason(''); return; }
    const match = editSubcategory.match(/^(.+?)\s*\((.+?)\)$/);
    if (match) {
      setLocalAttType(match[1] ?? '');
      setLocalAttReason(match[2] ?? '');
    } else {
      setLocalAttType('');
      setLocalAttReason('');
    }
    // Only re-parse when category changes to attendance or on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editCategory]);

  const chipSize = compact ? 'text-detail px-2 py-0.5' : 'px-2.5 py-1 text-xs';

  return (
    <div className={compact
      ? 'bg-sp-surface/80 border border-sp-accent/30 rounded-lg p-2 space-y-1.5 animate-fade-in'
      : 'bg-sp-surface/80 border border-sp-accent/30 rounded-xl p-3 space-y-2.5 animate-fade-in'
    }>
      {/* 카테고리 */}
      <div>
        <p className={`text-sp-muted mb-1 ${compact ? 'text-caption' : 'text-detail'}`}>카테고리</p>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => {
            const isSelected = c.id === editCategory;
            const colorSet = RECORD_COLOR_MAP[c.color] ?? GRAY_COLOR;
            return (
              <button
                key={c.id}
                onClick={() => {
                  setEditCategory(c.id);
                  setEditSubcategory('');
                  setLocalAttType('');
                  setLocalAttReason('');
                }}
                className={`${chipSize} rounded-lg font-medium transition-all cursor-pointer select-none ${
                  isSelected ? colorSet.activeBg : colorSet.inactiveBg
                }`}
              >
                {c.name.split(' (')[0]}
              </button>
            );
          })}
        </div>
      </div>

      {/* 세부 항목 */}
      {cat && (
        <div>
          <p className={`text-sp-muted mb-1 ${compact ? 'text-caption' : 'text-detail'}`}>세부 항목</p>
          {isAttendance ? (
            <div className="space-y-1.5">
              {/* 출결 유형 */}
              <div className="flex flex-wrap gap-1.5">
                {ATTENDANCE_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setLocalAttType(t);
                      setLocalAttReason('');
                      setEditSubcategory('');
                    }}
                    className={getSubcategoryChipClass(cat.color, localAttType === t).replace(
                      compact ? '' : '',
                      ''
                    ) + (compact ? ' !text-detail !px-2 !py-0.5' : '')}
                  >
                    {localAttType === t && <span className="mr-0.5">✓</span>}{t}
                  </button>
                ))}
              </div>
              {/* 출결 사유 (유형 선택 시만) */}
              {localAttType && (
                <div className="ml-2 pl-3 border-l-2 border-red-500/30">
                  <p className="text-detail text-sp-muted mb-1">사유</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ATTENDANCE_REASONS.map((r) => {
                      const isReasonSelected = localAttReason === r;
                      return (
                        <button
                          key={r}
                          onClick={() => {
                            setLocalAttReason(r);
                            setEditSubcategory(`${localAttType} (${r})`);
                          }}
                          className={getSubcategoryChipClass(cat.color, isReasonSelected) + (compact ? ' !text-detail !px-2 !py-0.5' : '')}
                        >
                          {isReasonSelected && <span className="mr-0.5">✓</span>}{r}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {cat.subcategories.map((sub) => {
                const isSelected = editSubcategory === sub;
                return (
                  <button
                    key={sub}
                    onClick={() => setEditSubcategory(sub)}
                    className={getSubcategoryChipClass(cat.color, isSelected) + (compact ? ' !text-detail !px-2 !py-0.5' : '')}
                  >
                    {isSelected && <span className="mr-0.5">✓</span>}{sub}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 메모 */}
      <div>
        <p className={`text-sp-muted mb-1 ${compact ? 'text-caption' : 'text-detail'}`}>메모</p>
        <input
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          placeholder="메모 (선택)"
          className="w-full bg-sp-surface border border-sp-border rounded-lg text-sm text-sp-text px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-sp-accent"
        />
      </div>

      {/* 액션 버튼 */}
      <div className="flex justify-end gap-2 mt-1">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-sp-muted hover:text-sp-text hover:bg-sp-surface"
        >취소</button>
        <button
          onClick={onSave}
          disabled={!editSubcategory}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-sp-accent text-white hover:bg-sp-accent/80 disabled:opacity-50 disabled:cursor-not-allowed"
        >저장</button>
      </div>
    </div>
  );
}
