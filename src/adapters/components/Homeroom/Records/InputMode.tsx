import { useState, useMemo, useCallback, useEffect } from 'react';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { ATTENDANCE_TYPES, ATTENDANCE_REASONS } from '@domain/valueObjects/RecordCategory';
import type { CounselingMethod } from '@domain/entities/StudentRecord';
import type { RecordPrefill } from '../HomeroomPage';
import { DEFAULT_TEMPLATES } from '@domain/valueObjects/DefaultTemplates';
import { InlineRecordEditor } from './InlineRecordEditor';
import {
  type ModeProps,
  formatDateKR,
  METHOD_OPTIONS,
  getSubcategoryChipClass,
  getCategoryLabelColor,
  getRecordTagClass,
} from './recordUtils';

export interface InputModeProps extends ModeProps {
  selectedDate: string;
  prefill?: RecordPrefill | null;
  onPrefillConsumed?: () => void;
}

function InputMode({ students, records, categories, selectedDate, prefill, onPrefillConsumed }: InputModeProps) {
  const { addRecord, deleteRecord, updateRecord } = useStudentRecordsStore();
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

  /* ── prefill 적용 ── */
  useEffect(() => {
    if (!prefill) return;

    // 학생 선택
    const student = students.find((s) => s.id === prefill.studentId);
    if (student) {
      setSelectedStudents(new Set([student.id]));
    }

    // 카테고리 + 서브카테고리 설정
    setSelectedSub({ categoryId: prefill.category, subcategory: prefill.subcategory });
    setAttendanceType(null);

    // 상담 방법 설정
    if (prefill.method) {
      setSelectedMethod(prefill.method);
    }

    // prefill 소비
    onPrefillConsumed?.();
  }, [prefill, students, onPrefillConsumed]);

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
          <button
            onClick={clearAll}
            className="text-xs text-sp-accent hover:text-sp-accent/80 transition-colors"
          >
            모두 해제
          </button>
        </div>
        <div className="grid grid-cols-5 gap-2 overflow-y-auto flex-1">
          {students.map((student, idx) => {
            if (student.isVacant) {
              return (
                <div
                  key={student.id}
                  className="px-2 py-2.5 rounded-lg text-xs text-sp-muted/40 text-center bg-sp-surface/30"
                >
                  {idx + 1}
                  <div className="text-[10px] truncate">결번</div>
                </div>
              );
            }
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

export { InputMode };
