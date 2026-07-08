import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { detectStudentNumberIssues } from '@domain/rules/studentNumberRules';
import { useToastStore } from '@adapters/components/common/Toast';
import {
  ATTENDANCE_TYPES,
  ATTENDANCE_REASONS,
  synthesizeSubcategory,
} from '@domain/valueObjects/RecordCategory';
import type {
  StudentAttendance,
  AttendanceStatus,
  AttendanceReason,
} from '@domain/entities/Attendance';
import type { CounselingMethod, AttendancePeriodEntry } from '@domain/entities/StudentRecord';
import { DEFAULT_HOMEROOM_RECORD_TAGS } from '@domain/entities/StudentRecord';
import type { RecordPrefill } from '../HomeroomPage';
import { useRecordSaveStatus } from '@adapters/hooks/useRecordSaveStatus';
import { DEFAULT_TEMPLATES } from '@domain/valueObjects/DefaultTemplates';
import { InlineRecordEditor } from './InlineRecordEditor';
import { StudentRecordReferencePanel } from './StudentRecordReferencePanel';
import { PeriodChipGroup, type AccentColor } from './PeriodChipGroup';
import {
  type ModeProps,
  formatDateKR,
  createDateRange,
  METHOD_OPTIONS,
  getSubcategoryChipClass,
  getCategoryLabelColor,
  getRecordTagClass,
  getRecordChipLabel,
  initEditAttendancePeriods,
  renumberHomeroomStudents,
} from './recordUtils';
import { MultiDatePicker } from '@adapters/components/common/MultiDatePicker';
import { Notice } from '@adapters/components/common/Notice';
import { useMultiDateAttendanceIntentStore } from '@adapters/stores/useMultiDateAttendanceIntentStore';
import { useObservationAttachmentStore } from '@adapters/stores/useObservationAttachmentStore';
import {
  PendingAttachmentArea,
  type PendingAttachment,
} from '@adapters/components/ClassManagement/PendingAttachmentArea';
import {
  OBSERVATION_ATTACHMENT_LIMITS,
  validateAttachmentFile,
  canAddAttachment,
} from '@domain/rules/observationAttachmentRules';
import type { ObservationAttachmentSource } from '@domain/entities/ObservationAttachment';

export interface InputModeProps extends ModeProps {
  selectedDate: string;
  onDateChange?: (date: string) => void;
  prefill?: RecordPrefill | null;
  onPrefillConsumed?: () => void;
  /** dirty(미저장 변경) 상태가 바뀔 때 호출 — 이탈 경고용 */
  onDirtyChange?: (dirty: boolean) => void;
}

type RightTab = 'today' | 'history';

const LAST_PERIODS_KEY = 'ssampin:homeroom-last-periods';

const STATUS_FROM_TYPE: Record<string, AttendanceStatus> = {
  결석: 'absent',
  지각: 'late',
  조퇴: 'earlyLeave',
  결과: 'classAbsence',
};

const ACCENT_FROM_TYPE: Record<string, AccentColor> = {
  결석: 'red',
  지각: 'amber',
  조퇴: 'orange',
  결과: 'purple',
};

function InputMode({
  students,
  records,
  categories,
  selectedDate,
  prefill,
  onPrefillConsumed,
  onDirtyChange,
}: InputModeProps) {
  const { addRecord, deleteRecord, updateRecord, updateAttendanceRecord } =
    useStudentRecordsStore();
  const { getDayAttendance, saveDayAttendance } = useTeachingClassStore();
  const bridgeHomeroomDayAttendance = useStudentRecordsStore((s) => s.bridgeHomeroomDayAttendance);
  const className = useSettingsStore((s) => s.settings.className);
  const maxPeriods = useSettingsStore((s) => s.settings.maxPeriods);
  const customHomeroomTags = useSettingsStore((s) => s.settings.homeroomRecordTags);
  const updateSettings = useSettingsStore((s) => s.update);
  const allHomeroomTags = useMemo(
    () => [...DEFAULT_HOMEROOM_RECORD_TAGS, ...(customHomeroomTags ?? [])],
    [customHomeroomTags],
  );
  const periodCount = maxPeriods ?? 7;
  const showToast = useToastStore((s) => s.show);

  // ── 출석번호 무결성 (한 명 → 전원 오염 방어) ──
  // 출결은 학생을 "번호"로 식별하므로, 번호가 비었거나 겹치면 한 명 저장이 같은 번호
  // 학생 전원에게 번진다. 화면에 표시되는 활성 학생 기준으로 충돌을 감지한다.
  const numberIssues = useMemo(
    () => detectStudentNumberIssues(students.map((s) => ({ number: s.studentNumber }))),
    [students],
  );
  // 번호 정리는 비활성 학생을 포함한 전체 명단에 적용해야 저장 시 명단이 잘리지 않는다.
  const allStudents = useStudentStore((s) => s.students);
  const updateStudents = useStudentStore((s) => s.updateStudents);
  const renumberPlan = useMemo(() => {
    const fixed = renumberHomeroomStudents(allStudents);
    let changed = 0;
    for (let i = 0; i < allStudents.length; i += 1) {
      if (allStudents[i]!.studentNumber !== fixed[i]!.studentNumber) changed += 1;
    }
    return { fixed, changed };
  }, [allStudents]);
  const [renumbering, setRenumbering] = useState(false);
  const [showRenumberConfirm, setShowRenumberConfirm] = useState(false);

  const handleRenumber = useCallback(async () => {
    setRenumbering(true);
    try {
      await updateStudents(renumberPlan.fixed);
      showToast('출석번호를 정리했어요. 이제 출결이 학생별로 따로 저장됩니다.', 'success');
      setShowRenumberConfirm(false);
    } catch {
      showToast('번호 정리에 실패했어요. 다시 시도해주세요.', 'error');
    } finally {
      setRenumbering(false);
    }
  }, [updateStudents, renumberPlan, showToast]);

  // ── 저장 상태 머신 (S3 저장 시맨틱 통일) ──
  const {
    saveStatus,
    markDirty,
    wrapSave,
    reset: resetSaveStatus,
    isDirty,
  } = useRecordSaveStatus();

  // dirty 상태 변경을 부모에게 알림 (이탈 경고용)
  useEffect(() => {
    onDirtyChange?.(isDirty());
  }, [saveStatus, isDirty, onDirtyChange]);

  // ── 첨부(작성 중 담아두고 단일 학생·비출결 저장 시 커밋) ──
  const addAttachment = useObservationAttachmentStore((s) => s.addAttachment);
  const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([]);
  const pendingFilesRef = useRef<PendingAttachment[]>([]);
  useEffect(() => {
    pendingFilesRef.current = pendingFiles;
  }, [pendingFiles]);
  const commitPendingAttachments = useCallback(
    async (recordId: string): Promise<void> => {
      for (const { file, source } of pendingFilesRef.current) {
        try {
          await addAttachment({ observationId: recordId, file, source });
        } catch (e) {
          showToast(e instanceof Error ? e.message : '첨부 저장 실패', 'error');
        }
      }
    },
    [addAttachment, showToast],
  );
  const handleAddPendingFiles = useCallback(
    (files: File[], source: ObservationAttachmentSource) => {
      setPendingFiles((prev) => {
        const next = [...prev];
        for (const f of files) {
          if (!canAddAttachment(next.length)) {
            showToast(
              `첨부는 기록 1건당 최대 ${OBSERVATION_ATTACHMENT_LIMITS.MAX_PER_OBSERVATION}개까지 가능합니다.`,
              'error',
            );
            break;
          }
          const v = validateAttachmentFile(f.name, f.size);
          if (!v.ok) {
            showToast(v.reason, 'error');
            continue;
          }
          next.push({ file: f, source });
        }
        return next;
      });
    },
    [showToast],
  );
  const removePendingFile = useCallback((idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [editingCategory, setEditingCategory] = useState('');
  const [editingSubcat, setEditingSubcat] = useState('');
  const [editingTags, setEditingTags] = useState<string[]>([]);
  const [editingReportedToNeis, setEditingReportedToNeis] = useState(false);
  const [editingDocumentSubmitted, setEditingDocumentSubmitted] = useState(false);
  const [editingAttendancePeriods, setEditingAttendancePeriods] = useState<AttendancePeriodEntry[]>(
    [],
  );
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [selectedSub, setSelectedSub] = useState<{
    categoryId: string;
    subcategory: string;
  } | null>(null);
  const [attendanceType, setAttendanceType] = useState<string | null>(null);
  const [selectedPeriods, setSelectedPeriods] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(LAST_PERIODS_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr)) {
        return new Set(arr.filter((n): n is number => typeof n === 'number'));
      }
    } catch {
      /* noop */
    }
    return new Set();
  });
  const [memo, setMemo] = useState('');
  // 통합 입력 태그(S4, 비출결 누가기록) — StudentRecord.tags? 에 저장. 분류(category)와 직교(P3).
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<CounselingMethod | undefined>(undefined);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [followUp, setFollowUp] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [reportedToNeis, setReportedToNeis] = useState(false);
  const [documentSubmitted, setDocumentSubmitted] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>('today');
  const [showTodayRecords, setShowTodayRecords] = useState(false);
  const [showMemoModal, setShowMemoModal] = useState(false);
  const [studentView, setStudentView] = useState<'default' | 'roster'>('default');

  // ── 여러 날(범위/다중) 등록 ──
  type DateMode = 'single' | 'range' | 'multi';
  const [dateMode, setDateMode] = useState<DateMode>('single');
  const [endDate, setEndDate] = useState(selectedDate);
  const [multiDateSet, setMultiDateSet] = useState<ReadonlySet<string>>(new Set());
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [skippedDates, setSkippedDates] = useState<string[]>([]);
  const [togglePulse, setTogglePulse] = useState(false);

  // 명령 팔레트 intent consume
  const intentPending = useMultiDateAttendanceIntentStore((s) => s.pending);
  const intentPreferredMode = useMultiDateAttendanceIntentStore((s) => s.preferredMode);
  const intentPreferredType = useMultiDateAttendanceIntentStore((s) => s.preferredAttendanceType);
  const consumeIntent = useMultiDateAttendanceIntentStore((s) => s.consume);

  useEffect(() => {
    if (!intentPending) return;
    // 출결 카테고리 자동 선택 + 다중 모드 ON
    setAttendanceType(intentPreferredType);
    setSelectedSub({ categoryId: 'attendance', subcategory: intentPreferredType });
    setDateMode(intentPreferredMode);
    setTogglePulse(true);
    const t = window.setTimeout(() => setTogglePulse(false), 1500);
    consumeIntent();
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentPending]);

  // selectedDate 변경 시 endDate 동기화 (range 모드)
  useEffect(() => {
    setEndDate(selectedDate);
  }, [selectedDate]);

  // attendanceType 신규 선택 시 토글 즉시 부각 (animate-pulse 1.5초)
  useEffect(() => {
    if (attendanceType) {
      setTogglePulse(true);
      const t = window.setTimeout(() => setTogglePulse(false), 1500);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [attendanceType]);

  // 호환 별칭 (기존 코드 영향 최소화) — true 시 multi 또는 range
  const dateRangeMode = dateMode !== 'single';

  // 모드별 날짜 리스트 + 유효성
  const rangeDates = useMemo(() => {
    if (dateMode === 'single') return [selectedDate];
    if (dateMode === 'range') {
      if (endDate < selectedDate) return [];
      return createDateRange(selectedDate, endDate);
    }
    // multi 모드
    return Array.from(multiDateSet).sort();
  }, [dateMode, selectedDate, endDate, multiDateSet]);

  const rangeError =
    dateMode === 'range' && endDate < selectedDate
      ? '종료일이 시작일보다 빠릅니다'
      : (dateMode === 'range' || dateMode === 'multi') && rangeDates.length > 30
        ? '30일을 초과하는 범위는 등록할 수 없습니다'
        : dateMode === 'multi' && rangeDates.length === 0
          ? '선택된 날짜가 없습니다'
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

    // 카테고리 설정 (Q2: 비출결은 분류만 — prefill 의 세부 분류는 태그로 흡수)
    if (prefill.category === 'attendance') {
      setSelectedSub({ categoryId: prefill.category, subcategory: prefill.subcategory });
    } else {
      setSelectedSub({
        categoryId: prefill.category,
        subcategory: synthesizeSubcategory(prefill.category),
      });
      if (prefill.subcategory && prefill.subcategory.trim()) {
        setSelectedTags((prev) =>
          prev.includes(prefill.subcategory) ? prev : [...prev, prefill.subcategory],
        );
      }
    }
    setAttendanceType(null);

    // 상담 방법 설정
    if (prefill.method) {
      setSelectedMethod(prefill.method);
    }

    // prefill 소비
    onPrefillConsumed?.();
  }, [prefill, students, onPrefillConsumed]);

  const toggleStudent = useCallback(
    (id: string) => {
      setSelectedStudents((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      markDirty();
    },
    [markDirty],
  );

  const clearAll = useCallback(() => {
    setSelectedStudents(new Set());
  }, []);

  const handleAttendanceTypeClick = useCallback(
    (type: string) => {
      // 출결과 일반 기록(상담/생활/기타)은 상호 배타다. 출결 유형을 고르면 다른 카테고리 선택을
      // 모두 해제하고(출결 사유도 리셋), 유형만 토글한다.
      setSelectedSub(null);
      setAttendanceType((prev) => (prev === type ? null : type));
      markDirty();
    },
    [markDirty],
  );

  const handleAttendanceReasonClick = useCallback(
    (reason: string) => {
      if (!attendanceType) return;
      const subcategory = `${attendanceType} (${reason})`;
      setSelectedSub((prev) =>
        prev?.categoryId === 'attendance' && prev.subcategory === subcategory
          ? null
          : { categoryId: 'attendance', subcategory },
      );
      markDirty();
    },
    [attendanceType, markDirty],
  );

  const handleCategoryClick = useCallback(
    (categoryId: string) => {
      // Q2: 비출결은 분류만 선택 — subcategory 는 카테고리별 sentinel 로 합성("보이지 않는 MCP 계약 슬롯").
      //   세부 분류는 아래 태그로 입력한다(category + tags 2축).
      setSelectedSub((prev) =>
        prev?.categoryId === categoryId
          ? null
          : { categoryId, subcategory: synthesizeSubcategory(categoryId) },
      );
      setAttendanceType(null);
      markDirty();
    },
    [markDirty],
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

  // 단일 날짜 저장 (기존 로직 + 출결 교시 fan-out)
  const saveForDate = useCallback(
    async (date: string): Promise<{ recordIds: string[]; affected: number }> => {
      if (selectedStudents.size === 0 || selectedSub === null)
        return { recordIds: [], affected: 0 };

      // ── 출결 카테고리: 교시별 fan-out 저장 ──
      if (selectedSub.categoryId === 'attendance' && attendanceType) {
        if (!className) {
          showToast('설정에서 담임반을 먼저 입력해주세요', 'info');
          return { recordIds: [], affected: 0 };
        }
        // 번호 충돌 시 출결 저장 차단 — 같은 번호 학생끼리 기록이 섞이는 것을 원천 차단.
        // (비출결 기록은 studentId 로 저장돼 안전하므로 막지 않는다.)
        if (numberIssues.hasCollisionRisk) {
          showToast('출석번호가 겹치거나 비어 있어요. 번호를 먼저 정리해주세요.', 'info');
          return { recordIds: [], affected: 0 };
        }
        const periods =
          selectedPeriods.size > 0
            ? Array.from(selectedPeriods)
            : Array.from({ length: periodCount }, (_, i) => i + 1);

        // "결석 (질병)" → "질병"
        const match = selectedSub.subcategory.match(/\(([^)]+)\)\s*$/);
        const reason = (match?.[1] ?? '기타') as AttendanceReason;
        const status = STATUS_FROM_TYPE[attendanceType] ?? 'absent';
        const memoText = memo.trim() || undefined;

        // 데이터 유실 방지: 병합 시드(그날 기존 출결)를 읽기 전에 스토어 로드를 보장한다.
        // 미로딩 상태의 빈 스냅샷으로 시드하면 saveDayAttendance 의 하루치 통째 교체가
        // 방금 입력하지 않은 다른 학생의 기존 기록을 지운다.
        const tcState = useTeachingClassStore.getState();
        if (!tcState.loaded) await tcState.load();
        const existing = getDayAttendance(className, date);
        const recordsByPeriod = new Map<number, StudentAttendance[]>();
        for (const r of existing) {
          recordsByPeriod.set(r.period, [...r.students]);
        }

        let affected = 0;
        for (const period of periods) {
          const arr = recordsByPeriod.get(period) ?? [];
          for (const studentId of selectedStudents) {
            const student = students.find((s) => s.id === studentId);
            if (!student?.studentNumber) continue;
            const next: StudentAttendance = {
              number: student.studentNumber,
              status,
              reason: status !== 'present' ? reason : undefined,
              memo: status !== 'present' ? memoText : undefined,
            };
            const idx = arr.findIndex((sa) => sa.number === student.studentNumber);
            if (idx >= 0) arr[idx] = next;
            else arr.push(next);
          }
          recordsByPeriod.set(period, arr);
        }

        await saveDayAttendance(className, date, recordsByPeriod);
        await bridgeHomeroomDayAttendance({ className, date, recordsByPeriod, students });

        try {
          localStorage.setItem(LAST_PERIODS_KEY, JSON.stringify(periods));
        } catch {
          /* noop */
        }

        // 영향받은 학생 수
        affected = Array.from(selectedStudents).filter((id) => {
          const s = students.find((st) => st.id === id);
          return !!s?.studentNumber;
        }).length;
        // 출결도 학생+날짜당 'att-{studentId}-{date}' StudentRecord 로 미러링되므로
        // (bridgeHomeroomDayAttendance), 단일 학생이면 그 결정론적 id 를 첨부 대상으로 반환한다.
        const singleAttId =
          selectedStudents.size === 1 ? Array.from(selectedStudents)[0] : undefined;
        const attRecordIds = singleAttId ? [`att-${singleAttId}-${date}`] : [];
        return { recordIds: attRecordIds, affected };
      }

      // ── 기존 경로 (상담/생활/기타) ──
      const method = selectedSub.categoryId === 'counseling' ? selectedMethod : undefined;
      const fu = followUp.trim() || undefined;
      const fuDate = followUpDate || undefined;
      const neisFlag = selectedSub.categoryId === 'attendance' ? reportedToNeis : undefined;
      const docFlag = selectedSub.categoryId === 'attendance' ? documentSubmitted : undefined;

      // 중복 감지(Q2): 비출결 subcategory 는 sentinel 단일값이라 분류만으로는 dedup 불가.
      //   같은 학생·날짜·분류에서 **내용과 태그가 동일**한 기록만 중복으로 본다(정확한 이중제출만 차단,
      //   내용·태그가 다르면 같은 분류라도 2건 허용 — false-dedup 방지).
      const memoTrim = memo.trim();
      const dedupTagKey = [...selectedTags].sort().join('');
      const existingSet = new Set(
        records
          .filter(
            (r) =>
              r.date === date &&
              r.category === selectedSub.categoryId &&
              r.content.trim() === memoTrim &&
              [...(r.tags ?? [])].sort().join('') === dedupTagKey,
          )
          .map((r) => r.studentId),
      );
      const newStudents = Array.from(selectedStudents).filter((id) => !existingSet.has(id));
      if (newStudents.length === 0) return { recordIds: [], affected: 0 };

      const recordIds = await Promise.all(
        newStudents.map((studentId) =>
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
        ),
      );
      // 통합 입력 태그(S4): 생성된 누가기록에 tags 를 patch한다.
      // 기존 addRecord 시그니처(useStudentRecordsStore)는 보존 — 별도 updateRecord 로만 추가(다른 세션 store 무수정).
      if (selectedTags.length > 0 && recordIds.length > 0) {
        const sr = useStudentRecordsStore.getState();
        await Promise.all(
          recordIds.map(async (rid) => {
            const rec = sr.records.find((r) => r.id === rid);
            if (rec) await sr.updateRecord({ ...rec, tags: [...selectedTags] });
          }),
        );
      }
      return { recordIds, affected: recordIds.length };
    },
    [
      selectedStudents,
      selectedSub,
      attendanceType,
      selectedPeriods,
      periodCount,
      className,
      students,
      getDayAttendance,
      saveDayAttendance,
      bridgeHomeroomDayAttendance,
      memo,
      selectedTags,
      records,
      selectedMethod,
      followUp,
      followUpDate,
      reportedToNeis,
      documentSubmitted,
      addRecord,
      showToast,
      numberIssues,
    ],
  );

  const resetForm = useCallback(() => {
    setSelectedStudents(new Set());
    setSelectedSub(null);
    setAttendanceType(null);
    setMemo('');
    setSelectedTags([]);
    setSelectedMethod(undefined);
    setShowFollowUp(false);
    setFollowUp('');
    setFollowUpDate('');
    setReportedToNeis(false);
    setDocumentSubmitted(false);
    setDateMode('single');
    setMultiDateSet(new Set());
    setPendingFiles([]);
    resetSaveStatus();
  }, [resetSaveStatus]);

  // 단일 날짜 저장
  const handleSave = useCallback(async () => {
    await wrapSave(async () => {
      const { recordIds } = await saveForDate(selectedDate);
      // 단일 학생·비출결 1건일 때만 첨부 커밋(대상 record 가 명확). 다중/출결이면 첨부 영역이 비활성이라 pending 이 비어있다.
      if (pendingFilesRef.current.length > 0 && recordIds.length === 1) {
        await commitPendingAttachments(recordIds[0]!);
      }
    });
    resetForm();
  }, [saveForDate, selectedDate, resetForm, commitPendingAttachments, wrapSave]);

  // 여러 날 일괄 저장 (확인 모달에서 호출)
  // 일괄([적용])은 자동저장 대상 아님 — 명시 [적용]=확정=저장으로 유지
  const handleBatchSave = useCallback(async () => {
    if (rangeDates.length === 0 || rangeError) return;
    await wrapSave(async () => {
      setBatchSaving(true);
      setBatchProgress({ current: 0, total: rangeDates.length });
      setSkippedDates([]);
      let totalCreated = 0;
      const newSkipped: string[] = [];
      for (let i = 0; i < rangeDates.length; i++) {
        const date = rangeDates[i]!;
        const { affected } = await saveForDate(date);
        if (affected === 0) newSkipped.push(date);
        else totalCreated += affected;
        setBatchProgress({ current: i + 1, total: rangeDates.length });
      }
      setBatchSaving(false);
      setBatchProgress(null);
      setSkippedDates(newSkipped);
      setShowBatchConfirm(false);
      resetForm();

      const registeredDays = rangeDates.length - newSkipped.length;
      const msg =
        newSkipped.length > 0
          ? `${rangeDates.length}일 중 ${registeredDays}일 등록 완료 (중복 ${newSkipped.length}일 제외)`
          : `${rangeDates.length}일 출결이 등록되었습니다`;
      showToast(msg, totalCreated > 0 ? 'success' : 'info');
    });
  }, [rangeDates, rangeError, saveForDate, resetForm, showToast, wrapSave]);

  // 저장 버튼 클릭 핸들러: 다중/범위 모드면 확인 모달, 아니면 바로 저장
  const handleSaveClick = useCallback(() => {
    if (dateMode !== 'single' && rangeDates.length > 1) {
      setShowBatchConfirm(true);
    } else if (dateMode === 'multi' && rangeDates.length === 1) {
      // multi 모드 1일도 일괄 저장 (선택된 1일)
      void handleBatchSave();
    } else {
      void handleSave();
    }
    // handleBatchSave 는 아래에서 정의되어 있으므로 의존성에서 일부러 제외하지 않음
  }, [dateMode, rangeDates.length, handleSave, handleBatchSave]);

  /* ── 키보드 단축키 (A/L/E/X 유형, Q/W/R/T 사유, 1~7 교시, 0/Space 전체, Enter 저장, Esc 리셋) ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = document.activeElement as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key.toLowerCase();

      // 출결 유형 토글
      if (key === 'a') {
        handleAttendanceTypeClick('결석');
        e.preventDefault();
        return;
      }
      if (key === 'l') {
        handleAttendanceTypeClick('지각');
        e.preventDefault();
        return;
      }
      if (key === 'e') {
        handleAttendanceTypeClick('조퇴');
        e.preventDefault();
        return;
      }
      if (key === 'x') {
        handleAttendanceTypeClick('결과');
        e.preventDefault();
        return;
      }

      // 출결 유형 선택된 상태에서만 교시/사유 단축키
      if (attendanceType) {
        if (key === 'q') {
          handleAttendanceReasonClick('질병');
          e.preventDefault();
          return;
        }
        if (key === 'w') {
          handleAttendanceReasonClick('인정');
          e.preventDefault();
          return;
        }
        if (key === 'r') {
          handleAttendanceReasonClick('미인정');
          e.preventDefault();
          return;
        }
        if (key === 't') {
          handleAttendanceReasonClick('기타');
          e.preventDefault();
          return;
        }

        if (/^[1-7]$/.test(key)) {
          const p = parseInt(key, 10);
          if (p <= periodCount) {
            setSelectedPeriods((prev) => {
              const next = new Set(prev);
              if (next.has(p)) next.delete(p);
              else next.add(p);
              return next;
            });
            e.preventDefault();
            return;
          }
        }
        if (key === '0' || e.key === ' ') {
          setSelectedPeriods((prev) => {
            if (prev.size === periodCount) return new Set();
            return new Set(Array.from({ length: periodCount }, (_, i) => i + 1));
          });
          e.preventDefault();
          return;
        }
      }

      if (e.key === 'Enter' && selectedSub && selectedStudents.size > 0) {
        handleSaveClick();
        e.preventDefault();
        return;
      }

      if (e.key === 'Escape') {
        setAttendanceType(null);
        setSelectedSub(null);
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [
    attendanceType,
    selectedSub,
    selectedStudents,
    handleAttendanceTypeClick,
    handleAttendanceReasonClick,
    handleSaveClick,
    periodCount,
  ]);

  const dateRecords = useMemo(() => {
    return records.filter((r) => r.date === selectedDate);
  }, [records, selectedDate]);

  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  // 출결 입력 중 번호 충돌이 있으면 저장 차단 (비출결 기록은 studentId 기반이라 안전 → 허용).
  const isAttendanceIntent = attendanceType !== null || selectedSub?.categoryId === 'attendance';
  const attendanceBlocked = numberIssues.hasCollisionRisk && isAttendanceIntent;
  const canSave =
    selectedStudents.size > 0 && selectedSub !== null && !rangeError && !attendanceBlocked;
  // 첨부는 대상 record 가 1건으로 명확할 때만(학생 1명·단일 날짜). 출결도 'att-{studentId}-{date}'
  // StudentRecord 로 미러링되므로 진단서·결석계 첨부가 가능하다.
  const canAttachHere =
    selectedStudents.size === 1 && dateMode === 'single' && selectedSub !== null;

  // 우측 패널에 표시할 학생 (1명 선택 시)
  const singleSelectedStudent = useMemo(() => {
    if (selectedStudents.size !== 1) return null;
    const selectedId = Array.from(selectedStudents)[0];
    return students.find((s) => s.id === selectedId) ?? null;
  }, [selectedStudents, students]);

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      {/* 출석번호 충돌 경고 — 같은 번호/빈 번호 학생끼리 출결이 섞이는 것을 막는다 */}
      {numberIssues.hasCollisionRisk && (
        <Notice variant="warning" title="출석번호가 겹치거나 비어 있어요">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sp-muted">
              번호가 같거나 비어 있는 학생끼리 출결이 섞여 저장될 수 있어요. 출결을 저장하려면 먼저
              번호를 정리해주세요. (상담·생활 기록은 영향 없어요.)
            </span>
            <button
              onClick={() => setShowRenumberConfirm(true)}
              className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-sp-accent text-white hover:bg-sp-accent/90 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">format_list_numbered</span>
              번호 정리하기
            </button>
          </div>
        </Notice>
      )}
      <div ref={containerRef} className="flex-1 flex min-h-0">
        {/* ── 좌측: 학생 선택 ── */}
        <div
          className="flex flex-col rounded-xl bg-sp-card p-5 min-w-0"
          style={{ width: `${leftPct}%` }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-sp-text flex items-center gap-2">
              <span className="material-symbols-outlined text-base">group</span>
              학생 선택
              <span className="text-sp-muted font-normal">({selectedStudents.size}명 선택됨)</span>
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
                const num = student.studentNumber ?? idx + 1;
                if (student.isVacant) {
                  return (
                    <div
                      key={student.id}
                      className="px-2 py-2.5 rounded-lg text-xs text-sp-muted/40 text-center bg-sp-surface/30"
                    >
                      {num}
                      <div className="text-caption truncate">결번</div>
                    </div>
                  );
                }
                const isSelected = selectedStudents.has(student.id);
                return (
                  <button
                    key={student.id}
                    onClick={() => toggleStudent(student.id)}
                    className={`px-1.5 py-2.5 rounded-lg text-xs font-medium transition-all text-center ${
                      isSelected
                        ? 'bg-sp-accent text-white ring-1 ring-sp-accent'
                        : 'bg-sp-surface text-sp-text hover:bg-sp-surface/80'
                    }`}
                  >
                    <div className="text-caption opacity-60 tabular-nums">{num}</div>
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
                        const num = student.studentNumber ?? offset + i + 1;
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
                            <span
                              className={`min-w-[2rem] text-right text-sm font-bold tabular-nums shrink-0 leading-none ${
                                isSelected ? 'text-sp-accent' : 'text-sp-muted/50'
                              }`}
                            >
                              {num}
                            </span>
                            <span
                              className={`text-sm font-medium leading-none truncate ${
                                isSelected ? 'text-sp-text' : 'text-sp-text/80'
                              }`}
                            >
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
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 카테고리 목록 */}
            <div className="space-y-3">
              {/* 출결 — 유형·사유·교시(구조 그대로 유지) */}
              {categories
                .filter((cat) => cat.id === 'attendance')
                .map((cat) => (
                  <div key={cat.id}>
                    <p
                      className={`text-xs font-semibold mb-1.5 ${getCategoryLabelColor(cat.color)}`}
                    >
                      {cat.name}
                    </p>
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
                        <PeriodChipGroup
                          periodCount={periodCount}
                          selected={selectedPeriods}
                          onChange={setSelectedPeriods}
                          accent={ACCENT_FROM_TYPE[attendanceType] ?? 'red'}
                        />
                      )}
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
                          <p className="mt-2 text-caption text-sp-muted leading-relaxed">
                            단축키: A 결석 · L 지각 · E 조퇴 · X 결과 · 1~7 교시 · 0 전체 · Q 질병 ·
                            ↵ 저장
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

              {/* 비출결 분류 — 단일 선택(Q2: 서브카테고리 칩 → 분류 선택, 세부는 아래 태그로) */}
              <div>
                <p className="text-xs font-semibold mb-1.5 text-sp-muted">분류</p>
                <div className="flex flex-wrap gap-1.5">
                  {categories
                    .filter((cat) => cat.id !== 'attendance')
                    .map((cat) => {
                      const isSelected = selectedSub?.categoryId === cat.id;
                      return (
                        <button
                          key={cat.id}
                          onClick={() => handleCategoryClick(cat.id)}
                          className={getSubcategoryChipClass(cat.color, isSelected)}
                        >
                          {isSelected && <span className="mr-1">✓</span>}
                          {cat.name.split(' (')[0]}
                        </button>
                      );
                    })}
                </div>
              </div>
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

            {/* 태그 (S4 통합 입력 — 비출결 누가기록, 다중 선택, 분류와 별도 축) */}
            {selectedSub && selectedSub.categoryId !== 'attendance' && (
              <div className="mb-3">
                <p className="text-xs text-sp-muted mb-1.5">태그 (선택)</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {allHomeroomTags.map((tag) => {
                    const isSelected = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => {
                          setSelectedTags((prev) =>
                            prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
                          );
                          markDirty();
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          isSelected
                            ? 'bg-sp-accent text-white'
                            : 'bg-sp-surface text-sp-muted hover:text-sp-text hover:bg-sp-surface/80'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                  <input
                    type="text"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const v = newTagInput.trim();
                        if (!v) return;
                        if (!allHomeroomTags.includes(v)) {
                          void updateSettings({
                            homeroomRecordTags: [...(customHomeroomTags ?? []), v],
                          });
                        }
                        setSelectedTags((prev) => (prev.includes(v) ? prev : [...prev, v]));
                        setNewTagInput('');
                        markDirty();
                      }
                    }}
                    placeholder="+ 태그"
                    aria-label="태그 직접 추가"
                    className="w-16 px-2 py-1 rounded-lg text-xs bg-sp-surface border border-dashed border-sp-border text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-sp-accent focus:w-24 transition-all"
                  />
                </div>
              </div>
            )}

            {/* 메모 */}
            <div className="relative">
              <textarea
                value={memo}
                onChange={(e) => {
                  setMemo(e.target.value);
                  markDirty();
                }}
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

            {/* 첨부 자료 (작성 중 담아두고 저장 시 함께 커밋) */}
            <div className="mt-3">
              <p className="text-xs text-sp-muted mb-1.5 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">attach_file</span>
                첨부 자료
              </p>
              <PendingAttachmentArea
                pendingFiles={pendingFiles}
                onAddFiles={handleAddPendingFiles}
                onRemove={removePendingFile}
                disabled={!canAttachHere}
                disabledHint="학생 1명을 고르고 단일 날짜로 기록할 때 자료를 첨부할 수 있어요"
              />
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

            {/* ── 여러 날 등록 — 출결 카테고리 또는 출결 유형 선택 시 노출 (FR-01) ── */}
            {(attendanceType || selectedSub?.categoryId === 'attendance') && (
              <div
                className={`mt-3 p-3 bg-sp-surface/50 border border-sp-border rounded-xl space-y-2 transition-shadow ${
                  togglePulse ? 'ring-2 ring-sp-accent animate-pulse' : ''
                }`}
                data-testid="multi-date-toggle-section"
              >
                <div className="flex items-center gap-2 text-sm">
                  <span className="material-symbols-outlined text-sm text-sp-accent">
                    date_range
                  </span>
                  <span className="text-sp-text font-medium">날짜 모드</span>
                  <span className="text-xs text-sp-muted">(교외체험학습·코로나 격리 등)</span>
                </div>

                {/* 모드 Pill 그룹 */}
                <div
                  role="radiogroup"
                  aria-label="날짜 선택 모드"
                  className="flex items-center gap-1 p-1 bg-sp-bg rounded-lg w-fit"
                >
                  {(['single', 'range', 'multi'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={dateMode === m}
                      onClick={() => setDateMode(m)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:outline-none ${
                        dateMode === m
                          ? 'bg-sp-accent text-white'
                          : 'text-sp-muted hover:text-sp-text'
                      }`}
                    >
                      {m === 'single' ? '단일' : m === 'range' ? '범위' : '다중'}
                    </button>
                  ))}
                </div>

                {/* range 모드: 시작 = 상단 날짜, 종료 = MultiDatePicker */}
                {dateMode === 'range' && (
                  <div className="ml-1 space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-sp-muted text-xs w-12">시작일</span>
                      <span className="text-sp-text font-medium">{formatDateKR(selectedDate)}</span>
                      <span className="text-sp-muted text-xs">(상단 날짜)</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-sp-muted text-xs w-12">종료일</span>
                      <div className="flex-1">
                        <MultiDatePicker
                          mode="single"
                          singleValue={endDate}
                          onSingleChange={setEndDate}
                          compact
                          portal
                        />
                      </div>
                    </div>
                    {rangeError ? (
                      <p className="text-xs text-red-400 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">error</span>
                        {rangeError}
                      </p>
                    ) : rangeDates.length > 1 ? (
                      <p className="text-xs text-sp-accent flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">info</span>
                        {formatDateKR(selectedDate)} ~ {formatDateKR(endDate)} ({rangeDates.length}
                        일)
                      </p>
                    ) : null}
                  </div>
                )}

                {/* multi 모드: 인라인 MultiDatePicker */}
                {dateMode === 'multi' && (
                  <div className="ml-1">
                    <MultiDatePicker
                      mode="multi"
                      multiValues={multiDateSet}
                      onMultiChange={setMultiDateSet}
                      onToast={showToast}
                      maxCount={30}
                    />
                    {rangeError ? (
                      <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">error</span>
                        {rangeError}
                      </p>
                    ) : rangeDates.length >= 1 ? (
                      <p className="mt-1 text-xs text-sp-accent flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">info</span>
                        {rangeDates.length}일 선택됨
                      </p>
                    ) : null}
                  </div>
                )}

                {/* 직전 등록에서 중복으로 건너뜀 날짜 안내 */}
                {skippedDates.length > 0 && (
                  <Notice
                    variant="warning"
                    title={`중복으로 건너뜀 (${skippedDates.length}일)`}
                    className="mt-1"
                  >
                    <span className="text-sp-muted">
                      {skippedDates.map((d) => formatDateKR(d)).join(', ')}
                    </span>
                  </Notice>
                )}
              </div>
            )}

            {/* 후속 조치 (인라인 토글) */}
            <div className="mt-3">
              <button
                onClick={() => setShowFollowUp(!showFollowUp)}
                className="flex items-center gap-1.5 text-xs text-sp-muted hover:text-sp-text transition-colors"
              >
                <span
                  className={`material-symbols-outlined text-sm transition-transform ${showFollowUp ? 'rotate-180' : ''}`}
                >
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

          {/* 저장 버튼 + 상태칩 (sticky) */}
          <div className="sticky bottom-0 bg-gradient-to-t from-sp-card to-transparent pt-6 pb-1 px-5 -mt-16 rounded-b-xl space-y-1.5">
            {/* 번호 충돌로 출결 저장이 막힌 경우 안내 */}
            {attendanceBlocked && (
              <button
                onClick={() => setShowRenumberConfirm(true)}
                className="w-full flex items-center justify-center gap-1 text-xs font-medium py-1 rounded-lg text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">warning</span>
                출석번호를 정리해야 출결을 저장할 수 있어요
              </button>
            )}
            {/* 저장 상태칩 — idle 이면 비노출 */}
            {saveStatus !== 'idle' && (
              <div
                aria-live="polite"
                className={`flex items-center justify-center gap-1 text-xs font-medium py-1 rounded-lg transition-all ${
                  saveStatus === 'saved'
                    ? 'text-green-400 bg-green-500/10'
                    : saveStatus === 'saving'
                      ? 'text-sp-muted bg-sp-surface/60'
                      : saveStatus === 'error'
                        ? 'text-red-400 bg-red-500/10'
                        : 'text-sp-accent bg-sp-accent/10'
                }`}
              >
                <span className="material-symbols-outlined text-sm">
                  {saveStatus === 'saved'
                    ? 'check_circle'
                    : saveStatus === 'saving'
                      ? 'progress_activity'
                      : saveStatus === 'error'
                        ? 'error'
                        : 'edit'}
                </span>
                {saveStatus === 'saved'
                  ? '저장됨 ✓'
                  : saveStatus === 'saving'
                    ? '저장 중...'
                    : saveStatus === 'error'
                      ? '저장 실패 — 다시 시도하세요'
                      : '변경됨'}
              </div>
            )}
            <button
              onClick={handleSaveClick}
              disabled={!canSave || saveStatus === 'saving'}
              className={`w-full py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                canSave && saveStatus !== 'saving'
                  ? 'bg-sp-accent text-white hover:bg-sp-accent/90 shadow-lg shadow-sp-accent/20'
                  : 'bg-sp-surface text-sp-muted cursor-not-allowed'
              }`}
            >
              <span
                className={`material-symbols-outlined text-base ${saveStatus === 'saving' ? 'animate-spin' : ''}`}
              >
                {saveStatus === 'saving' ? 'progress_activity' : 'save'}
              </span>
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
                  {dateMode === 'multi' ? (
                    <p className="text-sm text-sp-text">
                      <span className="text-sp-accent font-bold">{rangeDates.length}일</span> 선택됨
                      — {rangeDates.map((d) => formatDateKR(d)).join(', ')}
                    </p>
                  ) : (
                    <p className="text-sm text-sp-text">
                      <span className="font-medium">{formatDateKR(selectedDate)}</span>
                      {' ~ '}
                      <span className="font-medium">{formatDateKR(endDate)}</span>{' '}
                      <span className="text-sp-accent font-bold">({rangeDates.length}일)</span>
                    </p>
                  )}
                  <p className="text-sm text-sp-muted">
                    선택 학생{' '}
                    <span className="text-sp-text font-medium">{selectedStudents.size}명</span>
                    {' × '}
                    {rangeDates.length}일 = 총{' '}
                    <span className="text-sp-text font-bold">
                      {selectedStudents.size * rangeDates.length}건
                    </span>{' '}
                    등록
                  </p>
                  <p className="text-xs text-sp-muted">이미 등록된 날짜는 자동으로 건너뜁니다.</p>
                </div>

                {/* 진행률 바 (저장 중일 때만, 10일 이상이면 항상 표시) */}
                {batchSaving && batchProgress && (
                  <div className="mb-4 space-y-1.5">
                    <div className="flex justify-between text-xs text-sp-muted">
                      <span>등록 중...</span>
                      <span>
                        {batchProgress.current} / {batchProgress.total}일
                      </span>
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
                        <span className="material-symbols-outlined text-sm animate-spin">
                          progress_activity
                        </span>
                        {batchProgress
                          ? `${batchProgress.current}/${batchProgress.total}일`
                          : '등록 중...'}
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

        {/* ── 출석번호 정리 확인 모달 ── */}
        {showRenumberConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-sp-card border border-sp-border rounded-2xl p-6 w-96 shadow-2xl">
              <h3 className="text-base font-bold text-sp-text flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-sp-accent">
                  format_list_numbered
                </span>
                출석번호 정리
              </h3>
              <div className="space-y-2 mb-4 text-sm">
                <p className="text-sp-text">
                  번호가 비었거나 겹친 학생에게{' '}
                  <span className="text-sp-accent font-bold">사용하지 않는 번호</span>를 새로
                  부여해요. 이미 번호가 올바른 학생은 그대로 둡니다.
                </p>
                <p className="text-sp-muted">
                  번호가 바뀌는 학생:{' '}
                  <span className="text-sp-text font-medium">{renumberPlan.changed}명</span>
                </p>
                <p className="text-xs text-sp-muted">
                  예전에 이 반 출결을 입력한 적이 있다면, 번호가 바뀐 학생의 지난 기록은 한 번
                  확인해주세요.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowRenumberConfirm(false)}
                  disabled={renumbering}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-sp-surface text-sp-muted
                           hover:text-sp-text hover:bg-sp-surface/80 transition-all disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  onClick={() => void handleRenumber()}
                  disabled={renumbering || renumberPlan.changed === 0}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-sp-accent text-white
                           hover:bg-sp-accent/90 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {renumbering ? (
                    <>
                      <span className="material-symbols-outlined text-sm animate-spin">
                        progress_activity
                      </span>
                      정리 중...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">check</span>
                      번호 정리하기
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 리사이즈 핸들 (중↔우) */}
        <div
          onMouseDown={() => startDrag('right')}
          className="w-2 shrink-0 cursor-col-resize group flex items-center justify-center hover:bg-sp-accent/10 transition-colors"
        >
          <div className="w-0.5 h-8 rounded-full bg-sp-border group-hover:bg-sp-accent transition-colors" />
        </div>

        {/* ── 우측: 오늘 기록 / 이전 기록 ── */}
        <div
          className="rounded-xl bg-sp-card flex flex-col min-h-0 min-w-0"
          style={{ width: `${rightPct}%` }}
        >
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
                    onClick={() => {
                      setEditingRecordId(null);
                      setEditingReportedToNeis(false);
                      setEditingDocumentSubmitted(false);
                    }}
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
                        attendancePeriods={
                          editingRecord.category === 'attendance'
                            ? editingAttendancePeriods
                            : undefined
                        }
                        setAttendancePeriods={
                          editingRecord.category === 'attendance'
                            ? setEditingAttendancePeriods
                            : undefined
                        }
                        regularPeriodCount={periodCount}
                        editTags={editingRecord.category === 'attendance' ? undefined : editingTags}
                        setEditTags={
                          editingRecord.category === 'attendance' ? undefined : setEditingTags
                        }
                        availableTags={allHomeroomTags}
                        onSave={async () => {
                          if (editingRecord.category === 'attendance') {
                            const student = students.find((s) => s.id === editingRecord.studentId);
                            // Snapshot for undo
                            const snapshot = {
                              nextPeriods: [...(editingRecord.attendancePeriods ?? [])],
                              content: editingRecord.content,
                              reportedToNeis: editingRecord.reportedToNeis ?? false,
                              documentSubmitted: editingRecord.documentSubmitted ?? false,
                            };
                            try {
                              await updateAttendanceRecord({
                                record: editingRecord,
                                nextPeriods: editingAttendancePeriods,
                                content: editingContent,
                                reportedToNeis: editingReportedToNeis,
                                documentSubmitted: editingDocumentSubmitted,
                                classId: className,
                                date: editingRecord.date,
                                studentNumber: student?.studentNumber,
                                regularPeriodCount: periodCount,
                              });
                              showToast('출결 기록을 저장했습니다', 'success', {
                                label: '되돌리기',
                                onClick: () => {
                                  void updateAttendanceRecord({
                                    record: editingRecord,
                                    nextPeriods: snapshot.nextPeriods,
                                    content: snapshot.content,
                                    reportedToNeis: snapshot.reportedToNeis,
                                    documentSubmitted: snapshot.documentSubmitted,
                                    classId: className,
                                    date: editingRecord.date,
                                    studentNumber: student?.studentNumber,
                                    regularPeriodCount: periodCount,
                                  });
                                },
                              });
                            } catch (err) {
                              console.error('[InputMode] 출결 기록 저장 실패', err);
                              showToast('저장에 실패했습니다', 'error');
                              return;
                            }
                          } else {
                            // Q2: 비출결은 category + tags 편집. subcategory 는 sentinel 로 자동 유지(편집기에서 보존).
                            await updateRecord({
                              ...editingRecord,
                              content: editingContent,
                              category: editingCategory,
                              subcategory: editingSubcat,
                              tags: editingTags.length > 0 ? [...editingTags] : undefined,
                            });
                          }
                          setEditingRecordId(null);
                          setEditingReportedToNeis(false);
                          setEditingDocumentSubmitted(false);
                          setEditingAttendancePeriods([]);
                          setEditingTags([]);
                        }}
                        onCancel={() => {
                          setEditingRecordId(null);
                          setEditingReportedToNeis(false);
                          setEditingDocumentSubmitted(false);
                          setEditingAttendancePeriods([]);
                          setEditingTags([]);
                        }}
                      />
                    );
                  })()}
                </div>
              ) : dateRecords.length > 0 ? (
                /* 기록 목록 (토글) */
                <div className="p-4">
                  <button
                    onClick={() => setShowTodayRecords((v) => !v)}
                    className="flex items-center gap-1 text-xs font-semibold text-sp-muted mb-2 uppercase tracking-wide hover:text-sp-text transition-colors"
                  >
                    <span
                      className="material-symbols-outlined text-sm"
                      style={{
                        transition: 'transform 0.2s',
                        transform: showTodayRecords ? 'rotate(90deg)' : 'rotate(0deg)',
                      }}
                    >
                      chevron_right
                    </span>
                    {formatDateKR(selectedDate)} 기록 ({dateRecords.length}건)
                  </button>
                  {showTodayRecords && (
                    <div className="space-y-1">
                      {dateRecords.map((record) => {
                        const student = studentMap.get(record.studentId);
                        return (
                          <div
                            key={record.id}
                            className="group flex items-center gap-2 text-xs rounded-lg px-1.5 py-1 -mx-1.5 transition-colors hover:bg-sp-surface/50 focus-within:bg-sp-surface/50"
                          >
                            <span className={getRecordTagClass(record.category, categories)}>
                              {getRecordChipLabel(record, categories)}
                            </span>
                            <span className="text-sp-text font-medium">{student?.name ?? '?'}</span>
                            {record.content && (
                              <span className="text-sp-muted truncate flex-1">
                                {record.content}
                              </span>
                            )}
                            <div className="flex items-center gap-1.5 ml-auto flex-shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                              <button
                                onClick={() => {
                                  setEditingRecordId(record.id);
                                  setEditingContent(record.content);
                                  setEditingCategory(record.category);
                                  setEditingSubcat(record.subcategory);
                                  setEditingTags([...(record.tags ?? [])]);
                                  setEditingReportedToNeis(record.reportedToNeis ?? false);
                                  setEditingDocumentSubmitted(record.documentSubmitted ?? false);
                                  if (record.category === 'attendance') {
                                    setEditingAttendancePeriods(initEditAttendancePeriods(record));
                                  } else {
                                    setEditingAttendancePeriods([]);
                                  }
                                }}
                                className="text-sp-muted hover:text-sp-accent transition-colors"
                                title="수정"
                              >
                                <span className="material-symbols-outlined text-sm">edit</span>
                              </button>
                              <button
                                onClick={() => {
                                  if (window.confirm('이 기록을 삭제하시겠습니까?'))
                                    void deleteRecord(record.id);
                                }}
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
                  )}
                </div>
              ) : (
                /* 빈 상태 */
                <div className="flex flex-col items-center justify-center py-12 text-sp-muted">
                  <span className="material-symbols-outlined text-3xl mb-2">note_add</span>
                  <p className="text-sm">오늘 기록이 없습니다</p>
                  <p className="text-xs mt-1">좌측에서 학생과 카테고리를 선택하세요</p>
                </div>
              )
            ) : /* ── 이전 기록 탭 ── */
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
            )}
          </div>
        </div>
        {/* 메모 확대 모달 */}
        {showMemoModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => setShowMemoModal(false)}
          >
            <div
              className="bg-sp-card rounded-2xl shadow-2xl w-[640px] max-w-[90vw] max-h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
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
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name}
                      </option>
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
      {/* 메모 확대 모달 (fixed 포지션) */}
    </div>
  );
}

export { InputMode };
