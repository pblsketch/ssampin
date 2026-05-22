import { useEffect, useMemo, useState } from 'react';
import { useStudentRecordsStore, RECORD_COLOR_MAP } from '@adapters/stores/useStudentRecordsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { sortByDateDesc } from '@domain/rules/studentRecordRules';
import { isStudentActive } from '@domain/rules/studentActivity';
import type { StudentRecord } from '@domain/entities/StudentRecord';

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateKR(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const FALLBACK_COLOR = RECORD_COLOR_MAP['gray']!;

type FormState = {
  studentId: string;
  category: string;
  subcategory: string;
  content: string;
  date: string;
};

const EMPTY_FORM: FormState = {
  studentId: '',
  category: '',
  subcategory: '',
  content: '',
  date: todayString(),
};

/** 담임 메모장 확장 에디터 — WidgetModal(isCompactMode=false)에서 렌더됨 */
export function StudentRecordsEditor() {
  const { records, loaded, load, categories, addRecord, updateRecord, deleteRecord } =
    useStudentRecordsStore();
  const { students, load: loadStudents, loaded: studentsLoaded } = useStudentStore();

  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');

  useEffect(() => {
    void load();
    void loadStudents();
  }, [load, loadStudents]);

  // 담임 반 학생만 (활성)
  const homeroomStudents = useMemo(() => students.filter(isStudentActive), [students]);

  const studentIds = useMemo(() => new Set(homeroomStudents.map((s) => s.id)), [homeroomStudents]);

  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  const categoryColorMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.color])),
    [categories],
  );

  // 담임 반 기록만, 최신순 정렬
  const homeroomRecords = useMemo(
    () => sortByDateDesc(records.filter((r) => studentIds.has(r.studentId))),
    [records, studentIds],
  );

  const filteredRecords = useMemo(() => {
    if (filterCategory === 'all') return homeroomRecords;
    return homeroomRecords.filter((r) => r.category === filterCategory);
  }, [homeroomRecords, filterCategory]);

  // 선택된 카테고리의 세부 항목
  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === form.category),
    [categories, form.category],
  );

  const resetForm = () => {
    setForm({ ...EMPTY_FORM, date: todayString() });
    setEditingId(null);
  };

  const loadRecordIntoForm = (record: StudentRecord) => {
    setEditingId(record.id);
    setForm({
      studentId: record.studentId,
      category: record.category,
      subcategory: record.subcategory,
      content: record.content,
      date: record.date,
    });
  };

  const handleCategoryChange = (categoryId: string) => {
    setForm((prev) => ({ ...prev, category: categoryId, subcategory: '' }));
  };

  const isFormValid = form.studentId && form.category && form.subcategory;

  const handleSubmit = async () => {
    if (!isFormValid) return;
    if (editingId) {
      const existing = records.find((r) => r.id === editingId);
      if (!existing) return;
      await updateRecord({
        ...existing,
        studentId: form.studentId,
        category: form.category,
        subcategory: form.subcategory,
        content: form.content,
        date: form.date,
      });
    } else {
      await addRecord(form.studentId, form.category, form.subcategory, form.content, form.date);
    }
    resetForm();
  };

  const handleDelete = async (record: StudentRecord) => {
    await deleteRecord(record.id);
    // 5초 되돌리기 Undo toast (명세: 5000ms 명시)
    useToastStore.getState().show(
      '기록 삭제됨',
      'success',
      {
        label: '되돌리기',
        onClick: () => {
          void addRecord(
            record.studentId,
            record.category,
            record.subcategory,
            record.content,
            record.date,
          );
        },
      },
      5000,
    );
    if (editingId === record.id) resetForm();
  };

  if (!loaded || !studentsLoaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-sp-muted">불러오는 중...</p>
      </div>
    );
  }

  const colorSet = (colorKey: string) => RECORD_COLOR_MAP[colorKey] ?? FALLBACK_COLOR;

  return (
    <div className="flex h-full gap-4 p-1 min-h-0">
      {/* ── 왼쪽: 기록 목록 ── */}
      <div className="flex flex-col w-1/2 min-h-0">
        {/* 카테고리 필터 탭 */}
        <div className="flex flex-wrap gap-1 mb-3 shrink-0">
          <button
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              filterCategory === 'all'
                ? 'bg-sp-accent/20 text-sp-accent'
                : 'text-sp-muted hover:text-sp-text hover:bg-sp-text/5'
            }`}
            onClick={() => setFilterCategory('all')}
          >
            전체
          </button>
          {categories.map((cat) => {
            const cs = colorSet(cat.color);
            const isActive = filterCategory === cat.id;
            return (
              <button
                key={cat.id}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors min-w-6 min-h-6 ${
                  isActive ? cs.activeBg : cs.inactiveBg
                }`}
                onClick={() => setFilterCategory(cat.id)}
              >
                {cat.name.split(' (')[0]}
              </button>
            );
          })}
        </div>

        {/* 기록 목록 */}
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
          {filteredRecords.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-sp-muted">기록이 없습니다</p>
            </div>
          ) : (
            filteredRecords.map((record) => {
              const student = studentMap.get(record.studentId);
              const colorKey = categoryColorMap.get(record.category) ?? 'gray';
              const cs = colorSet(colorKey);
              const isSelected = editingId === record.id;
              return (
                <div
                  key={record.id}
                  className={`flex items-start gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition-colors group ${
                    isSelected ? 'bg-sp-accent/10 ring-1 ring-sp-accent/30' : 'hover:bg-sp-text/5'
                  }`}
                  onClick={() => {
                    if (isSelected) {
                      resetForm();
                    } else {
                      loadRecordIntoForm(record);
                    }
                  }}
                >
                  {/* 날짜 */}
                  <span className="text-caption text-sp-muted whitespace-nowrap mt-0.5 w-8 shrink-0">
                    {formatDateKR(record.date)}
                  </span>
                  {/* 세부 카테고리 태그 */}
                  <span
                    className={`px-1.5 py-0.5 rounded text-caption font-medium whitespace-nowrap shrink-0 ${cs.tagBg}`}
                  >
                    {record.subcategory}
                  </span>
                  {/* 학생 이름 */}
                  <span className="text-sm text-sp-text font-medium whitespace-nowrap shrink-0">
                    {student?.name ?? '?'}
                  </span>
                  {/* 내용 미리보기 */}
                  {record.content && (
                    <span className="text-xs text-sp-muted truncate flex-1 mt-0.5">
                      {record.content}
                    </span>
                  )}
                  {/* 삭제 버튼 */}
                  <button
                    className="ml-auto shrink-0 min-w-6 min-h-6 flex items-center justify-center rounded hover:bg-red-500/15 text-sp-muted hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    title="삭제"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDelete(record);
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                      delete
                    </span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 구분선 */}
      <div className="w-px bg-sp-border shrink-0" />

      {/* ── 오른쪽: 입력 폼 ── */}
      <div className="flex flex-col w-1/2 min-h-0 gap-3">
        <h4 className="text-sm font-bold text-sp-text shrink-0">
          {editingId ? '기록 수정' : '새 기록 추가'}
        </h4>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {/* 학생 선택 */}
          <div>
            <label className="block text-xs text-sp-muted mb-1">학생</label>
            <select
              value={form.studentId}
              onChange={(e) => setForm((prev) => ({ ...prev, studentId: e.target.value }))}
              className="w-full bg-sp-surface border border-sp-border rounded-lg text-sm text-sp-text px-3 py-2 focus:outline-none focus:ring-1 focus:ring-sp-accent min-h-6"
            >
              <option value="">학생 선택</option>
              {homeroomStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.studentNumber != null ? `${s.studentNumber}번 ` : ''}
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* 카테고리 선택 */}
          <div>
            <label className="block text-xs text-sp-muted mb-1">카테고리</label>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => {
                const cs = colorSet(cat.color);
                const isActive = form.category === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => handleCategoryChange(cat.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer select-none min-w-6 min-h-6 ${
                      isActive ? cs.activeBg : cs.inactiveBg
                    }`}
                  >
                    {cat.name.split(' (')[0]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 세부 항목 선택 */}
          {selectedCategory && (
            <div>
              <label className="block text-xs text-sp-muted mb-1">세부 항목</label>
              {selectedCategory.subcategories.length === 0 ? (
                <p className="text-xs text-sp-muted/60">세부 항목이 없습니다</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {selectedCategory.subcategories.map((sub) => {
                    const cs = colorSet(selectedCategory.color);
                    const isActive = form.subcategory === sub;
                    return (
                      <button
                        key={sub}
                        onClick={() => setForm((prev) => ({ ...prev, subcategory: sub }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer select-none min-w-6 min-h-6 ${
                          isActive ? cs.activeBg : cs.inactiveBg
                        }`}
                      >
                        {isActive && <span className="mr-0.5">✓</span>}
                        {sub}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 내용 입력 */}
          <div>
            <label className="block text-xs text-sp-muted mb-1">내용</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
              placeholder="메모 (선택)"
              rows={3}
              className="w-full bg-sp-surface border border-sp-border rounded-lg text-sm text-sp-text px-3 py-2 resize-y focus:outline-none focus:ring-1 focus:ring-sp-accent min-h-[60px]"
            />
          </div>

          {/* 날짜 */}
          <div>
            <label className="block text-xs text-sp-muted mb-1">날짜</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
              className="w-full bg-sp-surface border border-sp-border rounded-lg text-sm text-sp-text px-3 py-2 focus:outline-none focus:ring-1 focus:ring-sp-accent min-h-6"
            />
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="flex gap-2 shrink-0 pt-1">
          {editingId ? (
            <>
              <button
                onClick={resetForm}
                className="flex-1 py-2 rounded-lg text-xs font-medium text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors min-h-6"
              >
                취소
              </button>
              <button
                onClick={() => void handleSubmit()}
                disabled={!isFormValid}
                className="flex-1 py-2 rounded-lg text-xs font-medium bg-sp-accent text-white hover:bg-sp-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-6"
              >
                저장
              </button>
            </>
          ) : (
            <button
              onClick={() => void handleSubmit()}
              disabled={!isFormValid}
              className="flex-1 py-2 rounded-lg text-xs font-medium bg-sp-accent text-white hover:bg-sp-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-6"
            >
              추가
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
