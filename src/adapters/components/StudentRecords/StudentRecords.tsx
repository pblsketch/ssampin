import { useEffect, useState, useMemo, useCallback } from 'react';
import { useStudentRecordsStore, SUBCATEGORY_MAP, CATEGORY_LABELS } from '@adapters/stores/useStudentRecordsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import type { RecordCategory } from '@domain/valueObjects/RecordCategory';
import { RECORD_CATEGORIES } from '@domain/valueObjects/RecordCategory';
import type { Student } from '@domain/entities/Student';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import {
  filterByStudent,
  filterByCategory,
  filterByDateRange,
  getAttendanceStats,
  sortByDateDesc,
} from '@domain/rules/studentRecordRules';

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

/** 서브카테고리 칩 색상 */
function getSubcategoryChipClass(
  category: RecordCategory,
  isSelected: boolean,
): string {
  const base = 'px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer select-none';
  const colorMap: Record<RecordCategory, { active: string; inactive: string }> = {
    attendance: {
      active: 'bg-red-500/80 text-white',
      inactive: 'bg-red-500/10 text-red-400 hover:bg-red-500/20',
    },
    counseling: {
      active: 'bg-blue-500/80 text-white',
      inactive: 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20',
    },
    life: {
      active: 'bg-green-500/80 text-white',
      inactive: 'bg-green-500/10 text-green-400 hover:bg-green-500/20',
    },
    etc: {
      active: 'bg-gray-500/80 text-white',
      inactive: 'bg-gray-500/10 text-gray-400 hover:bg-gray-500/20',
    },
  };
  const { active, inactive } = colorMap[category];
  return `${base} ${isSelected ? active : inactive}`;
}

/** 카테고리 라벨 색상 */
function getCategoryLabelColor(category: RecordCategory): string {
  const map: Record<RecordCategory, string> = {
    attendance: 'text-red-400',
    counseling: 'text-blue-400',
    life: 'text-green-400',
    etc: 'text-gray-400',
  };
  return map[category];
}

/** 조회모드에서 사용할 기록 태그 칩 */
function getRecordTagClass(category: RecordCategory): string {
  const map: Record<RecordCategory, string> = {
    attendance: 'bg-red-500/15 text-red-400',
    counseling: 'bg-blue-500/15 text-blue-400',
    life: 'bg-green-500/15 text-green-400',
    etc: 'bg-gray-500/15 text-gray-400',
  };
  return `px-2 py-0.5 rounded text-xs font-medium ${map[category]}`;
}

/* ──────────────────────── 메인 컴포넌트 ──────────────────────── */

type ViewMode = 'input' | 'progress' | 'search';

const MODE_TABS: { id: ViewMode; icon: string; label: string }[] = [
  { id: 'input', icon: '✏️', label: '입력' },
  { id: 'progress', icon: '📊', label: '통계' },
  { id: 'search', icon: '🔍', label: '조회' },
];

export function StudentRecords() {
  const { records, loaded, load, viewMode, setViewMode } =
    useStudentRecordsStore();
  const { students, load: loadStudents, loaded: studentsLoaded } =
    useStudentStore();

  useEffect(() => {
    void load();
    void loadStudents();
  }, [load, loadStudents]);

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
        {/* 모드 탭 */}
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
      </div>

      {/* 반 선택 탭 */}
      <div className="flex gap-1 mb-6 border-b border-sp-border pb-3">
        <ClassTab label="담임" isActive />
      </div>

      {/* 모드별 콘텐츠 */}
      {viewMode === 'input' && (
        <InputMode students={students} records={records} />
      )}
      {viewMode === 'progress' && (
        <ProgressMode students={students} records={records} />
      )}
      {viewMode === 'search' && (
        <SearchMode students={students} records={records} />
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
        : 'text-sp-muted hover:text-white hover:bg-sp-surface'
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
}

function InputMode({ students }: ModeProps) {
  const { addRecord } = useStudentRecordsStore();
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(
    new Set(),
  );
  const [selectedSub, setSelectedSub] = useState<{
    category: RecordCategory;
    subcategory: string;
  } | null>(null);
  const [memo, setMemo] = useState('');

  const toggleStudent = useCallback((id: string) => {
    setSelectedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setSelectedStudents(new Set());
  }, []);

  const handleSubcategoryClick = useCallback(
    (category: RecordCategory, sub: string) => {
      setSelectedSub((prev) =>
        prev?.category === category && prev.subcategory === sub
          ? null
          : { category, subcategory: sub },
      );
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (selectedStudents.size === 0 || selectedSub === null) return;

    const today = todayString();
    const promises = Array.from(selectedStudents).map((studentId) =>
      addRecord(
        studentId,
        selectedSub.category,
        selectedSub.subcategory,
        memo,
        today,
      ),
    );
    await Promise.all(promises);

    // 초기화
    setSelectedStudents(new Set());
    setSelectedSub(null);
    setMemo('');
  }, [selectedStudents, selectedSub, memo, addRecord]);

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
          <button
            onClick={clearAll}
            className="text-xs text-sp-accent hover:text-sp-accent/80 transition-colors"
          >
            모두 해제
          </button>
        </div>

        {/* 학생 격자 (5열) */}
        <div className="grid grid-cols-5 gap-2 overflow-y-auto flex-1">
          {students.map((student, idx) => {
            const isSelected = selectedStudents.has(student.id);
            return (
              <button
                key={student.id}
                onClick={() => toggleStudent(student.id)}
                className={`px-2 py-2.5 rounded-lg text-xs font-medium transition-all text-center ${isSelected
                  ? 'bg-sp-accent text-white ring-1 ring-sp-accent'
                  : 'bg-sp-surface text-sp-text hover:bg-sp-surface/80'
                  }`}
              >
                {idx + 1}
                {student.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* 우측: 카테고리 + 메모 + 저장 */}
      <div className="w-[380px] flex flex-col gap-4 shrink-0">
        {/* 카테고리 선택 */}
        <div className="rounded-xl bg-sp-card p-5 flex-1 overflow-y-auto">
          <h3 className="text-sm font-bold text-sp-text flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-base">
              category
            </span>
            카테고리 선택
          </h3>

          <div className="space-y-4">
            {RECORD_CATEGORIES.map((cat) => (
              <div key={cat}>
                <p
                  className={`text-xs font-semibold mb-2 ${getCategoryLabelColor(cat)}`}
                >
                  {CATEGORY_LABELS[cat]}
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUBCATEGORY_MAP[cat].map((sub) => {
                    const isSelected =
                      selectedSub?.category === cat &&
                      selectedSub.subcategory === sub;
                    return (
                      <button
                        key={sub}
                        onClick={() => handleSubcategoryClick(cat, sub)}
                        className={getSubcategoryChipClass(cat, isSelected)}
                      >
                        {isSelected && (
                          <span className="mr-1">✓</span>
                        )}
                        {sub}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 메모 */}
        <div className="rounded-xl bg-sp-card p-5">
          <h3 className="text-sm font-bold text-sp-text flex items-center gap-2 mb-3">
            <span>✏️</span>
            메모 내용
          </h3>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="추가 메모가 있으면 입력하세요... (선택사항)"
            className="w-full h-24 bg-sp-surface border border-sp-border rounded-lg p-3 text-sm text-sp-text placeholder-sp-muted resize-none focus:outline-none focus:ring-1 focus:ring-sp-accent"
          />
        </div>

        {/* 저장 버튼 */}
        <button
          onClick={() => void handleSave()}
          disabled={!canSave}
          className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${canSave
            ? 'bg-sp-accent text-white hover:bg-sp-accent/90 shadow-lg shadow-sp-accent/20'
            : 'bg-sp-surface text-sp-muted cursor-not-allowed'
            }`}
        >
          <span className="material-symbols-outlined text-base">save</span>
          저장하기
        </button>

        <p className="text-center text-xs text-sp-muted">
          💡 카테고리만 선택해도 바로 저장할 수 있어요
        </p>
      </div>
    </div>
  );
}

/* ──────────────────────── 통계 모드 ──────────────────────── */

type StatsPeriod = 'week' | 'month' | 'custom' | 'all';

function toDateInputString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ProgressMode({ students, records }: ModeProps) {
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('all');
  const monthRange = useMemo(() => getMonthRange(), []);
  const [customStart, setCustomStart] = useState<string>(
    toDateInputString(monthRange.start),
  );
  const [customEnd, setCustomEnd] = useState<string>(
    toDateInputString(monthRange.end),
  );

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

  const statsRows = useMemo(() => {
    return students.map((student) => {
      const stats = getAttendanceStats(filteredRecords, student.id);
      const totalRecords = filterByStudent(filteredRecords, student.id).length;
      return { student, stats, totalRecords };
    });
  }, [students, filteredRecords]);

  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0">
      {/* 기간 필터 바 */}
      <div className="flex items-center gap-3 flex-wrap">
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
                : 'text-sp-muted hover:text-white'
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
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-sp-border text-sp-muted">
              <th className="text-left p-3 font-medium">번호</th>
              <th className="text-left p-3 font-medium">이름</th>
              <th className="text-center p-3 font-medium">결석</th>
              <th className="text-center p-3 font-medium">지각</th>
              <th className="text-center p-3 font-medium">조퇴</th>
              <th className="text-center p-3 font-medium">결과</th>
              <th className="text-center p-3 font-medium">칭찬</th>
              <th className="text-center p-3 font-medium">전체</th>
            </tr>
          </thead>
          <tbody>
            {statsRows.map(({ student, stats, totalRecords }, idx) => (
              <tr
                key={student.id}
                className="border-b border-sp-border/50 hover:bg-sp-surface/30 transition-colors"
              >
                <td className="p-3 text-sp-muted">{idx + 1}</td>
                <td className="p-3 text-sp-text font-medium">{student.name}</td>
                <td className="text-center p-3">
                  <StatBadge value={stats.absent} color="red" />
                </td>
                <td className="text-center p-3">
                  <StatBadge value={stats.late} color="orange" />
                </td>
                <td className="text-center p-3">
                  <StatBadge value={stats.earlyLeave} color="yellow" />
                </td>
                <td className="text-center p-3">
                  <StatBadge value={stats.resultAbsent} color="purple" />
                </td>
                <td className="text-center p-3">
                  <StatBadge value={stats.praise} color="green" />
                </td>
                <td className="text-center p-3 text-sp-muted">{totalRecords}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
  };
  return (
    <span
      className={`inline-block min-w-[24px] px-1.5 py-0.5 rounded text-xs font-semibold ${colorMap[color] ?? ''}`}
    >
      {value}
    </span>
  );
}

/* ──────────────────────── 조회 모드 ──────────────────────── */

function SearchMode({ students, records }: ModeProps) {
  const { periodFilter, setPeriodFilter, deleteRecord } =
    useStudentRecordsStore();
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<
    RecordCategory | ''
  >('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const { updateRecord } = useStudentRecordsStore();

  const studentMap = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students],
  );

  const filtered = useMemo(() => {
    let result = [...records];

    // 학생 필터
    if (selectedStudentId) {
      result = filterByStudent(result, selectedStudentId) as StudentRecord[];
    }

    // 카테고리 필터
    if (selectedCategory) {
      result = filterByCategory(
        result,
        selectedCategory,
      ) as StudentRecord[];
    }

    // 기간 필터
    if (periodFilter === 'week') {
      const { start, end } = getWeekRange();
      result = filterByDateRange(result, start, end) as StudentRecord[];
    } else if (periodFilter === 'month') {
      const { start, end } = getMonthRange();
      result = filterByDateRange(result, start, end) as StudentRecord[];
    }

    return sortByDateDesc(result);
  }, [records, selectedStudentId, selectedCategory, periodFilter]);

  // 날짜별 그룹핑
  const grouped = useMemo(() => {
    const map = new Map<string, StudentRecord[]>();
    for (const record of filtered) {
      const existing = map.get(record.date);
      if (existing) {
        existing.push(record);
      } else {
        map.set(record.date, [record]);
      }
    }
    return Array.from(map.entries());
  }, [filtered]);

  const handleEdit = useCallback(
    (record: StudentRecord) => {
      setEditingId(record.id);
      setEditContent(record.content);
    },
    [],
  );

  const handleEditSave = useCallback(
    async (record: StudentRecord) => {
      await updateRecord({ ...record, content: editContent });
      setEditingId(null);
      setEditContent('');
    },
    [editContent, updateRecord],
  );

  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0">
      {/* 필터 바 */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* 학생 선택 */}
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

        {/* 카테고리 필터 */}
        <select
          value={selectedCategory}
          onChange={(e) =>
            setSelectedCategory(e.target.value as RecordCategory | '')
          }
          className="bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
        >
          <option value="">전체 카테고리</option>
          {RECORD_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {CATEGORY_LABELS[cat]}
            </option>
          ))}
        </select>

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
                : 'text-sp-muted hover:text-white'
                }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* 기록 타임라인 */}
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
                      className="group flex items-center gap-3 rounded-lg bg-sp-card p-3 hover:bg-sp-card/80 transition-colors"
                    >
                      <span
                        className="text-[11px] font-medium text-sp-muted rounded border border-sp-border bg-sp-surface px-1.5 py-0.5 whitespace-nowrap tabular-nums flex-shrink-0"
                        title="작성 시간"
                      >
                        {formatTimeKR(record.createdAt)}
                      </span>
                      <span className={getRecordTagClass(record.category)}>
                        {record.subcategory}
                      </span>
                      <span className="text-sm text-sp-text font-medium min-w-[60px]">
                        {student?.name ?? '?'}
                      </span>
                      {isEditing ? (
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="flex-1 bg-sp-surface border border-sp-border rounded px-2 py-1 text-sm text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
                          />
                          <button
                            onClick={() => void handleEditSave(record)}
                            className="text-xs text-sp-accent hover:text-sp-accent/80"
                          >
                            저장
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs text-sp-muted hover:text-white"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="flex-1 text-sm text-sp-muted">
                            {record.content || ''}
                          </span>
                          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-2 transition-opacity">
                            <button
                              onClick={() => handleEdit(record)}
                              className="text-xs text-sp-muted hover:text-sp-accent transition-colors"
                            >
                              수정
                            </button>
                            <button
                              onClick={() => void deleteRecord(record.id)}
                              className="text-xs text-sp-muted hover:text-red-400 transition-colors"
                            >
                              삭제
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

      {/* 통계 요약 */}
      {selectedStudentId && (
        <StatsCard studentId={selectedStudentId} records={records} students={students} />
      )}
    </div>
  );
}

/* ──────────────────────── 통계 요약 카드 ──────────────────────── */

interface StatsCardProps {
  studentId: string;
  records: readonly StudentRecord[];
  students: readonly Student[];
}

function StatsCard({ studentId, records, students }: StatsCardProps) {
  const stats = useMemo(
    () => getAttendanceStats(records, studentId),
    [records, studentId],
  );
  const student = students.find((s) => s.id === studentId);

  return (
    <div className="rounded-xl bg-sp-card p-4 flex items-center gap-6">
      <span className="text-sm font-bold text-sp-text">
        {student?.name ?? '?'} 현황
      </span>
      <div className="flex gap-4">
        <StatItem label="결석" value={stats.absent} color="text-red-400" />
        <StatItem label="지각" value={stats.late} color="text-orange-400" />
        <StatItem label="조퇴" value={stats.earlyLeave} color="text-yellow-400" />
        <StatItem label="칭찬" value={stats.praise} color="text-green-400" />
      </div>
    </div>
  );
}

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
