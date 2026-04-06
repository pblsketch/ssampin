import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { ATTENDANCE_TYPES, ATTENDANCE_REASONS } from '@domain/valueObjects/RecordCategory';
import type { CounselingMethod } from '@domain/entities/StudentRecord';
import type { RecordPrefill } from '../HomeroomPage';
import { DEFAULT_TEMPLATES } from '@domain/valueObjects/DefaultTemplates';
import { InlineRecordEditor } from './InlineRecordEditor';
import { StudentRecordReferencePanel } from './StudentRecordReferencePanel';
import {
  type ModeProps,
  formatDateKR,
  createDateRange,
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

type RightTab = 'today' | 'history';

function InputMode({ students, records, categories, selectedDate, prefill, onPrefillConsumed }: InputModeProps) {
  const { addRecord, deleteRecord, updateRecord } = useStudentRecordsStore();
  const showToast = useToastStore((s) => s.show);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [editingCategory, setEditingCategory] = useState('');
  const [editingSubcat, setEditingSubcat] = useState('');
  const [editingReportedToNeis, setEditingReportedToNeis] = useState(false);
  const [editingDocumentSubmitted, setEditingDocumentSubmitted] = useState(false);
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
  const [reportedToNeis, setReportedToNeis] = useState(false);
  const [documentSubmitted, setDocumentSubmitted] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>('today');
  const [showMemoModal, setShowMemoModal] = useState(false);
  const [studentView, setStudentView] = useState<'default' | 'roster'>('default');

  // ── 여러 날(범위) 등록 ──
  const [dateRangeMode, setDateRangeMode] = useState(false);
  const [endDate, setEndDate] = useState(selectedDate);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [skippedDates, setSkippedDates] = useState<string[]>([]);

  // selectedDate 변경 시 endDate 동기화
  useEffect(() => {
    setEndDate(selectedDate);
  }, [selectedDate]);

  // 범위 모드 날짜 리스트 + 유효성
  const rangeDates = useMemo(() => {
    if (!dateRangeMode) return [selectedDate];
    if (endDate < selectedDate) return [];
    return createDateRange(selectedDate, endDate);
  }, [dateRangeMode, selectedDate, endDate]);

  const rangeError = dateRangeMode && endDate < selectedDate
    ? '종료일이 시작일보다 빠릅니다'
    : dateRangeMode && rangeDates.length > 30
      ? '30일을 초과하는 범위는 등록할 수 없습니다'
      : null;

  // 3컬럼 리사이즈 (퍼센트 기반)
  const [leftPct, setLeftPct] = useState(38);
  const [rightPct, setRightPct] = useState(24);
  const draggingHandle = useRef<'left' | 'right' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingHandle.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;

      if (draggingHandle.current === 'left') {
        // 좌측 핸들: 좌측 영역 크기 조절 (최소 20%, 최대 = 100 - rightPct - 25)
        setLeftPct(Math.min(100 - rightPct - 25, Math.max(20, pct)));
      } else {
        // 우측 핸들: 우측 영역 크기 조절 (100 - pct, 최소 18%, 최대 = 100 - leftPct - 25)
        const newRight = 100 - pct;
        setRightPct(Math.min(100 - leftPct - 25, Math.max(18, newRight)));
      }
    };
    const handleMouseUp = () => {
      draggingHandle.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [leftPct, rightPct]);

  const startDrag = useCallback((handle: 'left' | 'right') => {
    draggingHandle.current = handle;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const centerPct = 100 - leftPct - rightPct;

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

  // 단일 날짜 저장 (기존 로직)
  const saveForDate = useCallback(async (date: string) => {
    if (selectedStudents.size === 0 || selectedSub === null) return 0;

    const method = selectedSub.categoryId === 'counseling' ? selectedMethod : undefined;
    const fu = followUp.trim() || undefined;
    const fuDate = followUpDate || undefined;
    const neisFlag = selectedSub.categoryId === 'attendance' ? reportedToNeis : undefined;
    const docFlag = selectedSub.categoryId === 'attendance' ? documentSubmitted : undefined;

    // 중복 감지: 해당 날짜에 같은 학생+카테고리+서브카테고리 기록이 있으면 건너뜀
    const existingSet = new Set(
      records
        .filter(
          (r) =>
            r.date === date &&
            r.category === selectedSub.categoryId &&
            r.subcategory === selectedSub.subcategory,
        )
        .map((r) => r.studentId),
    );
    const newStudents = Array.from(selectedStudents).filter((id) => !existingSet.has(id));
    if (newStudents.length === 0) return 0;

    const promises = newStudents.map((studentId) =>
      addRecord(
        studentId,
        selectedSub.categoryId,
        selectedSub.subcategory,
        memo,
        date,
        method,
        fu,
        fuDate,
        neisFlag,
        docFlag,
      ),
    );
    await Promise.all(promises);
    return newStudents.length;
  }, [selectedStudents, selectedSub, memo, records, selectedMethod, followUp, followUpDate, reportedToNeis, documentSubmitted, addRecord]);

  const resetForm = useCallback(() => {
    setSelectedStudents(new Set());
    setSelectedSub(null);
    setAttendanceType(null);
    setMemo('');
    setSelectedMethod(undefined);
    setShowFollowUp(false);
    setFollowUp('');
    setFollowUpDate('');
    setReportedToNeis(false);
    setDocumentSubmitted(false);
    setDateRangeMode(false);
  }, []);

  // 단일 날짜 저장
  const handleSave = useCallback(async () => {
    await saveForDate(selectedDate);
    resetForm();
  }, [saveForDate, selectedDate, resetForm]);

  // 여러 날 일괄 저장 (확인 모달에서 호출)
  const handleBatchSave = useCallback(async () => {
    if (rangeDates.length === 0 || rangeError) return;
    setBatchSaving(true);
    setBatchProgress({ current: 0, total: rangeDates.length });
    setSkippedDates([]);
    let totalCreated = 0;
    const newSkipped: string[] = [];
    for (let i = 0; i < rangeDates.length; i++) {
      const date = rangeDates[i]!;
      const created = await saveForDate(date);
      if (created === 0) newSkipped.push(date);
      else totalCreated += created;
      setBatchProgress({ current: i + 1, total: rangeDates.length });
    }
    setBatchSaving(false);
    setBatchProgress(null);
    setSkippedDates(newSkipped);
    setShowBatchConfirm(false);
    resetForm();

    const registeredDays = rangeDates.length - newSkipped.length;
    const msg = newSkipped.length > 0
      ? `${rangeDates.length}일 중 ${registeredDays}일 등록 완료 (중복 ${newSkipped.length}일 제외)`
      : `${rangeDates.length}일 출결이 등록되었습니다`;
    showToast(msg, totalCreated > 0 ? 'success' : 'info');
  }, [rangeDates, rangeError, saveForDate, resetForm, showToast]);

  // 저장 버튼 클릭 핸들러: 범위 모드면 확인 모달, 아니면 바로 저장
  const handleSaveClick = useCallback(() => {
    if (dateRangeMode && rangeDates.length > 1) {
      setShowBatchConfirm(true);
    } else {
      void handleSave();
    }
  }, [dateRangeMode, rangeDates.length, handleSave]);

  const dateRecords = useMemo(() => {
    return records.filter((r) => r.date === selectedDate);
  }, [records, selectedDate]);

  const studentMap = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students],
  );

  const canSave = selectedStudents.size > 0 && selectedSub !== null && !rangeError;

  // 우측 패널에 표시할 학생 (1명 선택 시)
  const singleSelectedStudent = useMemo(() => {
    if (selectedStudents.size !== 1) return null;
    const selectedId = Array.from(selectedStudents)[0];
    return students.find((s) => s.id === selectedId) ?? null;
  }, [selectedStudents, students]);

  return (
    <div ref={containerRef} className="flex-1 flex min-h-0">
      {/* ── 좌측: 학생 선택 ── */}
      <div className="flex flex-col rounded-xl bg-sp-card p-5 min-w-0" style={{ width: `${leftPct}%` }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-sp-text flex items-center gap-2">
            <span className="material-symbols-outlined text-base">group</span>
            학생 선택
            <span className="text-sp-muted font-normal">
              ({selectedStudents.size}명 선택됨)
            </span>
          </h3>
          <div className="flex items-center gap-2">
            {/* 보기 전환 토글 */}
            <div className="flex items-center bg-sp-surface rounded-lg p-0.5">
              <button
                onClick={() => setStudentView('default')}
                className={`p-1 rounded transition-colors ${
                  studentView === 'default'
                    ? 'bg-sp-accent/20 text-sp-accent'
                    : 'text-sp-muted hover:text-sp-text'
                }`}
                title="기본 보기"
              >
                <span className="material-symbols-outlined text-sm">grid_view</span>
              </button>
              <button
                onClick={() => setStudentView('roster')}
                className={`p-1 rounded transition-colors ${
                  studentView === 'roster'
                    ? 'bg-sp-accent/20 text-sp-accent'
                    : 'text-sp-muted hover:text-sp-text'
                }`}
                title="명렬표 보기"
              >
                <span className="material-symbols-outlined text-sm">format_list_numbered</span>
              </button>
            </div>
            {selectedStudents.size === 1 && (
              <button
                onClick={() => setRightTab('history')}
                className="flex items-center gap-1 text-xs text-sp-accent hover:text-sp-accent/80 transition-colors"
                title="선택한 학생의 이전 기록 보기"
              >
                <span className="material-symbols-outlined text-sm">history</span>
                이전 기록
              </button>
            )}
            <button
              onClick={clearAll}
              className="text-xs text-sp-accent hover:text-sp-accent/80 transition-colors"
            >
              모두 해제
            </button>
          </div>
        </div>
        {studentView === 'default' ? (
          /* ── 기본 보기 ── */
          <div className="grid grid-cols-4 gap-2 overflow-y-auto flex-1">
            {students.map((student, idx) => {
              const num = student.studentNumber ?? (idx + 1);
              if (student.isVacant) {
                return (
                  <div
                    key={student.id}
                    className="px-2 py-2.5 rounded-lg text-xs text-sp-muted/40 text-center bg-sp-surface/30"
                  >
                    {num}
                    <div className="text-[10px] truncate">결번</div>
                  </div>
                );
              }
              const isSelected = selectedStudents.has(student.id);
              return (
                <button
                  key={student.id}
                  onClick={() => toggleStudent(student.id)}
                  className={`px-1.5 py-2.5 rounded-lg text-xs font-medium transition-all text-center ${isSelected
                    ? 'bg-sp-accent text-white ring-1 ring-sp-accent'
                    : 'bg-sp-surface text-sp-text hover:bg-sp-surface/80'
                    }`}
                >
                  <div className="text-[10px] opacity-60 tabular-nums">{num}</div>
                  <div className="truncate">{student.name}</div>
                </button>
              );
            })}
          </div>
        ) : (
          /* ── 명렬표 보기 (2단 리스트) ── */
          <div className="overflow-y-auto flex-1">
            <div className="grid grid-cols-2 gap-x-3">
              {[0, 1].map((col) => {
                const half = Math.ceil(students.length / 2);
                const slice = students.slice(col * half, (col + 1) * half);
                const offset = col * half;
                return (
                  <div key={col} className="flex flex-col">
                    {slice.map((student, i) => {
                      const num = student.studentNumber ?? (offset + i + 1);
                      if (student.isVacant) {
                        return (
                          <div
                            key={student.id}
                            className="flex items-center gap-2 px-2 py-1.5 border-l-2 border-transparent opacity-30"
                          >
                            <span className="min-w-[2rem] text-right text-sm font-bold tabular-nums text-sp-muted shrink-0">
                              {num}
                            </span>
                            <span className="text-xs text-sp-muted italic">결번</span>
                          </div>
                        );
                      }
                      const isSelected = selectedStudents.has(student.id);
                      return (
                        <button
                          key={student.id}
                          onClick={() => toggleStudent(student.id)}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-all text-left w-full border-l-2 ${
                            isSelected
                              ? 'bg-sp-accent/15 border-sp-accent'
                              : 'hover:bg-sp-surface/60 border-transparent'
                          }`}
                        >
                          <span className={`min-w-[2rem] text-right text-sm font-bold tabular-nums shrink-0 leading-none ${
                            isSelected ? 'text-sp-accent' : 'text-sp-muted/50'
                          }`}>
                            {num}
                          </span>
                          <span className={`text-sm font-medium leading-none truncate ${
                            isSelected ? 'text-sp-text' : 'text-sp-text/80'
                          }`}>
                            {student.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 리사이즈 핸들 (좌↔중) */}
      <div
        onMouseDown={() => startDrag('left')}
        className="w-2 shrink-0 cursor-col-resize group flex items-center justify-center hover:bg-sp-accent/10 transition-colors"
      >
        <div className="w-0.5 h-8 rounded-full bg-sp-border group-hover:bg-sp-accent transition-colors" />
      </div>

      {/* ── 중앙: 카테고리 + 메모 입력 ── */}
      <div className="flex flex-col min-h-0 relative min-w-0" style={{ width: `${centerPct}%` }}>
        <div className="rounded-xl bg-sp-card p-5 flex-1 overflow-y-auto pb-20">
          {/* 카테고리 헤더 + 템플릿 */}
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

          {/* 카테고리 목록 */}
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

          {/* 구분선 */}
          <div className="border-t border-sp-border my-4" />

          {/* 상담 방법 (counseling일 때만) */}
          {selectedSub?.categoryId === 'counseling' && (
            <div className="mb-3">
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
          <div className="relative">
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="메모 입력 (선택사항)"
              className="w-full h-20 bg-sp-surface border border-sp-border rounded-lg p-3 pr-9 text-sm text-sp-text placeholder-sp-muted resize-none focus:outline-none focus:ring-1 focus:ring-sp-accent"
            />
            <button
              onClick={() => setShowMemoModal(true)}
              className="absolute top-2 right-2 p-1 rounded text-sp-muted hover:text-sp-accent hover:bg-sp-accent/10 transition-colors"
              title="크게 보기"
            >
              <span className="material-symbols-outlined text-base">open_in_full</span>
            </button>
          </div>

          {/* 나이스 반영 & 서류 제출 체크 (출결일 때만) */}
          {selectedSub?.categoryId === 'attendance' && (
            <div className="mt-3 space-y-2">
              <label className="flex items-center gap-2 text-sm text-sp-muted cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={reportedToNeis}
                  onChange={(e) => setReportedToNeis(e.target.checked)}
                  className="w-4 h-4 rounded border-sp-border text-sp-accent
                             focus:ring-sp-accent focus:ring-offset-0 bg-sp-bg accent-blue-500"
                />
                <span className="flex items-center gap-1">
                  나이스 반영 완료
                  <span className="text-xs text-sp-muted/60">(나중에 변경 가능)</span>
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm text-sp-muted cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={documentSubmitted}
                  onChange={(e) => setDocumentSubmitted(e.target.checked)}
                  className="w-4 h-4 rounded border-sp-border text-sp-accent
                             focus:ring-sp-accent focus:ring-offset-0 bg-sp-bg accent-blue-500"
                />
                <span className="flex items-center gap-1">
                  출결 서류 제출 확인
                  <span className="text-xs text-sp-muted/60">(나중에 변경 가능)</span>
                </span>
              </label>
            </div>
          )}

          {/* ── 여러 날 등록 (출결일 때만) ── */}
          {selectedSub?.categoryId === 'attendance' && (
            <div className="mt-3 p-3 bg-sp-surface/50 border border-sp-border rounded-xl space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={dateRangeMode}
                  onChange={(e) => setDateRangeMode(e.target.checked)}
                  className="w-4 h-4 rounded border-sp-border text-sp-accent
                             focus:ring-sp-accent focus:ring-offset-0 bg-sp-bg accent-blue-500"
                />
                <span className="flex items-center gap-1 text-sp-text font-medium">
                  <span className="material-symbols-outlined text-sm">date_range</span>
                  여러 날 한 번에 등록
                </span>
                <span className="text-xs text-sp-muted">(교외체험학습 등)</span>
              </label>

              {dateRangeMode && (
                <div className="ml-6 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-sp-muted text-xs w-12">시작일</span>
                    <span className="text-sp-text font-medium">{formatDateKR(selectedDate)}</span>
                    <span className="text-sp-muted text-xs">(상단 날짜)</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-sp-muted text-xs w-12">종료일</span>
                    <input
                      type="date"
                      value={endDate}
                      min={selectedDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="px-2 py-1 bg-sp-bg border border-sp-border rounded-lg text-sm text-sp-text
                                 focus:outline-none focus:ring-1 focus:ring-sp-accent"
                    />
                  </div>
                  {rangeError ? (
                    <p className="text-xs text-red-400 flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">error</span>
                      {rangeError}
                    </p>
                  ) : rangeDates.length > 1 && (
                    <p className="text-xs text-sp-accent flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">info</span>
                      {formatDateKR(selectedDate)} ~ {formatDateKR(endDate)} ({rangeDates.length}일)
                    </p>
                  )}
                  {/* 직전 등록에서 중복으로 건너뜀 날짜 안내 */}
                  {skippedDates.length > 0 && (
                    <div className="mt-1 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                      <p className="text-xs text-amber-400 flex items-center gap-1 mb-1">
                        <span className="material-symbols-outlined text-sm">warning</span>
                        중복으로 건너뜀 ({skippedDates.length}일)
                      </p>
                      <p className="text-xs text-sp-muted leading-relaxed">
                        {skippedDates.map((d) => formatDateKR(d)).join(', ')}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 후속 조치 (인라인 토글) */}
          <div className="mt-3">
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

        {/* 저장 버튼 (sticky) */}
        <div className="sticky bottom-0 bg-gradient-to-t from-sp-card to-transparent pt-6 pb-1 px-5 -mt-16 rounded-b-xl">
          <button
            onClick={handleSaveClick}
            disabled={!canSave}
            className={`w-full py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${canSave
              ? 'bg-sp-accent text-white hover:bg-sp-accent/90 shadow-lg shadow-sp-accent/20'
              : 'bg-sp-surface text-sp-muted cursor-not-allowed'
              }`}
          >
            <span className="material-symbols-outlined text-base">save</span>
            {dateRangeMode && rangeDates.length > 1
              ? `${rangeDates.length}일 일괄 저장`
              : '저장하기'}
          </button>
        </div>

        {/* ── 여러 날 일괄 등록 확인 모달 ── */}
        {showBatchConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-sp-card border border-sp-border rounded-2xl p-6 w-96 shadow-2xl">
              <h3 className="text-base font-bold text-sp-text flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-sp-accent">date_range</span>
                여러 날 일괄 등록
              </h3>
              <div className="space-y-2 mb-4">
                <p className="text-sm text-sp-text">
                  <span className="font-medium">{formatDateKR(selectedDate)}</span>
                  {' ~ '}
                  <span className="font-medium">{formatDateKR(endDate)}</span>
                  {' '}
                  <span className="text-sp-accent font-bold">({rangeDates.length}일)</span>
                </p>
                <p className="text-sm text-sp-muted">
                  선택 학생 <span className="text-sp-text font-medium">{selectedStudents.size}명</span>
                  {' × '}
                  {rangeDates.length}일 = 총 <span className="text-sp-text font-bold">{selectedStudents.size * rangeDates.length}건</span> 등록
                </p>
                <p className="text-xs text-sp-muted">
                  이미 등록된 날짜는 자동으로 건너뜁니다.
                </p>
              </div>

              {/* 진행률 바 (저장 중일 때만, 10일 이상이면 항상 표시) */}
              {batchSaving && batchProgress && (
                <div className="mb-4 space-y-1.5">
                  <div className="flex justify-between text-xs text-sp-muted">
                    <span>등록 중...</span>
                    <span>{batchProgress.current} / {batchProgress.total}일</span>
                  </div>
                  <div className="h-2 bg-sp-surface rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sp-accent rounded-full transition-all duration-300"
                      style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setShowBatchConfirm(false)}
                  disabled={batchSaving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-sp-surface text-sp-muted
                             hover:text-sp-text hover:bg-sp-surface/80 transition-all disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  onClick={() => void handleBatchSave()}
                  disabled={batchSaving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-sp-accent text-white
                             hover:bg-sp-accent/90 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {batchSaving ? (
                    <>
                      <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                      {batchProgress ? `${batchProgress.current}/${batchProgress.total}일` : '등록 중...'}
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">check</span>
                      등록하기
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 리사이즈 핸들 (중↔우) */}
      <div
        onMouseDown={() => startDrag('right')}
        className="w-2 shrink-0 cursor-col-resize group flex items-center justify-center hover:bg-sp-accent/10 transition-colors"
      >
        <div className="w-0.5 h-8 rounded-full bg-sp-border group-hover:bg-sp-accent transition-colors" />
      </div>

      {/* ── 우측: 오늘 기록 / 이전 기록 ── */}
      <div className="rounded-xl bg-sp-card flex flex-col min-h-0 min-w-0" style={{ width: `${rightPct}%` }}>
        {/* 탭 헤더 */}
        <div className="flex border-b border-sp-border shrink-0">
          <button
            onClick={() => setRightTab('today')}
            className={`flex-1 py-3 text-xs font-semibold text-center transition-colors ${
              rightTab === 'today'
                ? 'text-sp-accent border-b-2 border-sp-accent'
                : 'text-sp-muted hover:text-sp-text'
            }`}
          >
            오늘 기록
          </button>
          {selectedStudents.size === 1 && (
            <button
              onClick={() => setRightTab('history')}
              className={`flex-1 py-3 text-xs font-semibold text-center transition-colors ${
                rightTab === 'history'
                  ? 'text-sp-accent border-b-2 border-sp-accent'
                  : 'text-sp-muted hover:text-sp-text'
              }`}
            >
              이전 기록
            </button>
          )}
        </div>

        {/* 탭 콘텐츠 */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {rightTab === 'today' ? (
            /* ── 오늘 기록 탭 ── */
            editingRecordId ? (
              /* 편집 모드 */
              <div className="p-4 flex flex-col gap-3">
                <button
                  onClick={() => { setEditingRecordId(null); setEditingReportedToNeis(false); setEditingDocumentSubmitted(false); }}
                  className="flex items-center gap-1 text-xs text-sp-muted hover:text-sp-text transition-colors self-start"
                >
                  <span className="material-symbols-outlined text-sm">arrow_back</span>
                  목록으로
                </button>
                {(() => {
                  const editingRecord = dateRecords.find((r) => r.id === editingRecordId);
                  if (!editingRecord) return null;
                  return (
                    <InlineRecordEditor
                      record={editingRecord}
                      categories={categories}
                      editContent={editingContent}
                      setEditContent={setEditingContent}
                      editCategory={editingCategory}
                      setEditCategory={setEditingCategory}
                      editSubcategory={editingSubcat}
                      setEditSubcategory={setEditingSubcat}
                      editReportedToNeis={editingReportedToNeis}
                      setEditReportedToNeis={setEditingReportedToNeis}
                      editDocumentSubmitted={editingDocumentSubmitted}
                      setEditDocumentSubmitted={setEditingDocumentSubmitted}
                      onSave={() => {
                        void updateRecord({
                          ...editingRecord,
                          content: editingContent,
                          category: editingCategory,
                          subcategory: editingSubcat,
                          reportedToNeis: editingRecord.category === 'attendance' ? editingReportedToNeis : editingRecord.reportedToNeis,
                          documentSubmitted: editingRecord.category === 'attendance' ? editingDocumentSubmitted : editingRecord.documentSubmitted,
                        });
                        setEditingRecordId(null);
                        setEditingReportedToNeis(false);
                        setEditingDocumentSubmitted(false);
                      }}
                      onCancel={() => { setEditingRecordId(null); setEditingReportedToNeis(false); setEditingDocumentSubmitted(false); }}
                    />
                  );
                })()}
              </div>
            ) : dateRecords.length > 0 ? (
              /* 기록 목록 */
              <div className="p-4">
                <p className="text-xs text-sp-muted mb-2">
                  {'\uD83D\uDCCB'} {formatDateKR(selectedDate)} 기록 ({dateRecords.length}건)
                </p>
                <div className="space-y-1">
                  {dateRecords.map((record) => {
                    const student = studentMap.get(record.studentId);
                    return (
                      <div key={record.id} className="group flex items-center gap-2 text-xs rounded-lg px-1.5 py-1 -mx-1.5 transition-colors hover:bg-sp-surface/50">
                        <span className={getRecordTagClass(record.category, categories)}>
                          {record.subcategory}
                        </span>
                        <span className="text-sp-text font-medium">{student?.name ?? '?'}</span>
                        {record.content && (
                          <span className="text-sp-muted truncate flex-1">{record.content}</span>
                        )}
                        <div className="flex items-center gap-1.5 ml-auto flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              setEditingRecordId(record.id);
                              setEditingContent(record.content);
                              setEditingCategory(record.category);
                              setEditingSubcat(record.subcategory);
                              setEditingReportedToNeis(record.reportedToNeis ?? false);
                              setEditingDocumentSubmitted(record.documentSubmitted ?? false);
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
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* 빈 상태 */
              <div className="flex flex-col items-center justify-center py-12 text-sp-muted">
                <span className="material-symbols-outlined text-3xl mb-2">note_add</span>
                <p className="text-sm">오늘 기록이 없습니다</p>
                <p className="text-xs mt-1">좌측에서 학생과 카테고리를 선택하세요</p>
              </div>
            )
          ) : (
            /* ── 이전 기록 탭 ── */
            singleSelectedStudent ? (
              <StudentRecordReferencePanel
                student={singleSelectedStudent}
                records={records}
                categories={categories}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-sp-muted">
                <span className="material-symbols-outlined text-3xl mb-2">person_search</span>
                <p className="text-sm">학생 1명을 선택하세요</p>
              </div>
            )
          )}
        </div>
      </div>
      {/* 메모 확대 모달 */}
      {showMemoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowMemoModal(false)}>
          <div className="bg-sp-card rounded-2xl shadow-2xl w-[640px] max-w-[90vw] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-sp-border">
              <h3 className="text-sm font-bold text-sp-text flex items-center gap-2">
                <span className="material-symbols-outlined text-base">edit_note</span>
                메모 입력
              </h3>
              <div className="flex items-center gap-2">
                <select
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const tpl = DEFAULT_TEMPLATES.find((t) => t.id === e.target.value);
                    if (tpl) setMemo(tpl.contentTemplate);
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
                <button
                  onClick={() => setShowMemoModal(false)}
                  className="p-1 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>
            </div>
            <div className="flex-1 p-5">
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="메모를 입력하세요..."
                autoFocus
                className="w-full h-full min-h-[300px] bg-sp-surface border border-sp-border rounded-xl p-4 text-sm text-sp-text placeholder-sp-muted resize-none focus:outline-none focus:ring-2 focus:ring-sp-accent"
              />
            </div>
            <div className="flex justify-end px-5 py-3 border-t border-sp-border">
              <button
                onClick={() => setShowMemoModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-sp-accent text-white hover:bg-sp-accent/80 transition-colors"
              >
                완료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { InputMode };
