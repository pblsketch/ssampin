import { useState, useCallback, useMemo, useRef } from 'react';
import { allSlotsForContext, normalizeSlots } from '@domain/rules/observationSlots';
import type { Student } from '@domain/entities/Student';
import type { StudentRecord, AttendancePeriodEntry } from '@domain/entities/StudentRecord';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useToastStore } from '@adapters/components/common/Toast';
import {
  type RecordEditProps,
  initEditAttendancePeriods,
  ledgerAttendancePeriodsOf,
} from './recordUtils';

/**
 * 조회 화면 인라인 편집 상태 훅.
 *
 * SearchMode 가 개별 useState 9개 + 저장/취소 핸들러를 직접 들고
 * 자식 뷰에 프롭 20여 개로 흘려보내던 것을 캡슐화한다. 반환하는 `edit` 객체는
 * 기존 계약 {@link RecordEditProps} 그대로이므로 뷰는 객체 하나만 받으면 된다.
 *
 * 저장 시맨틱은 이동 전과 동일하다 — 출결은 updateAttendanceRecord(원본 출결부
 * 동기화)+되돌리기 토스트, 비출결은 updateRecord+저장 토스트.
 */
export function useRecordInlineEdit(studentMap: ReadonlyMap<string, Student>): {
  edit: RecordEditProps;
  /** 기록 카드의 ✏️ 버튼 — 해당 기록으로 편집 상태를 초기화한다. */
  handleEdit: (record: StudentRecord) => void;
} {
  const updateRecord = useStudentRecordsStore((s) => s.updateRecord);
  const customHomeroomSlots = useSettingsStore((st) => st.settings.homeroomRecordSlots);
  const availableSlots = useMemo(
    () => allSlotsForContext('homeroom', customHomeroomSlots ?? []),
    [customHomeroomSlots],
  );
  const updateAttendanceRecord = useStudentRecordsStore((s) => s.updateAttendanceRecord);
  const className = useSettingsStore((s) => s.settings.className);
  const regularPeriodCount = useSettingsStore((s) => s.settings.maxPeriods) ?? 7;
  const showToast = useToastStore((s) => s.show);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editSubcategory, setEditSubcategory] = useState('');
  const [editReportedToNeis, setEditReportedToNeis] = useState(false);
  const [editDocumentSubmitted, setEditDocumentSubmitted] = useState(false);
  const [editFollowUp, setEditFollowUp] = useState('');
  const [editFollowUpDate, setEditFollowUpDate] = useState('');
  const [editAttendancePeriods, setEditAttendancePeriods] = useState<AttendancePeriodEntry[]>([]);
  /** 관찰 장면 - 입력 화면과 같은 목록을 원본 수정에서도 고칠 수 있어야 한다(계획 §4.1). */
  const [editSlots, setEditSlots] = useState<string[]>([]);
  /** 출결부를 늦게 읽었을 때 "아직 그 기록을 편집 중인가"를 보는 값(렌더와 무관) */
  const editingIdRef = useRef<string | null>(null);
  /** 선생님이 교시 줄을 직접 고쳤는가 — 고친 뒤에는 출결부 값으로 다시 채우지 않는다 */
  const periodsTouchedRef = useRef(false);
  /** 옛 사본을 열 때 시작한 출결부 읽기 — 저장은 이것이 끝난 뒤에 한다 */
  const ledgerLoadRef = useRef<Promise<void> | null>(null);

  /**
   * 그 기록의 교시 목록 초기값. 교시 목록이 없는 옛 사본은 출결부에 실제로 있는 그 학생의
   * 그날 교시로 채운다 — 저장이 이 목록으로 하루를 통째로 바꾸므로, 지어낸 1교시 한 줄로
   * 저장하면 실제 조회·다른 교시 기록이 지워졌다(2026-11-11 확인).
   */
  const initialPeriodsOf = useCallback(
    (record: StudentRecord): AttendancePeriodEntry[] => {
      const studentNumber = studentMap.get(record.studentId)?.studentNumber;
      const ledgerPeriods =
        className && studentNumber != null
          ? ledgerAttendancePeriodsOf(
              useTeachingClassStore.getState().getDayAttendance(className, record.date),
              studentNumber,
            )
          : [];
      return initEditAttendancePeriods(record, ledgerPeriods);
    },
    [studentMap, className],
  );

  /** 편집 화면이 교시 줄을 바꿀 때 — 고쳤다는 표시를 남긴다 */
  const setEditAttendancePeriodsByUser = useCallback((next: AttendancePeriodEntry[]) => {
    periodsTouchedRef.current = true;
    setEditAttendancePeriods(next);
  }, []);

  const handleEdit = useCallback(
    (record: StudentRecord) => {
      setEditingId(record.id);
      editingIdRef.current = record.id;
      setEditContent(record.content);
      setEditCategory(record.category);
      setEditSubcategory(record.subcategory);
      setEditReportedToNeis(record.reportedToNeis ?? false);
      setEditDocumentSubmitted(record.documentSubmitted ?? false);
      setEditFollowUp(record.followUp ?? '');
      setEditFollowUpDate(record.followUpDate ?? '');
      setEditSlots([...(record.slots ?? [])]);
      periodsTouchedRef.current = false;
      ledgerLoadRef.current = null;
      if (record.category === 'attendance') {
        setEditAttendancePeriods(initialPeriodsOf(record));
        const teaching = useTeachingClassStore.getState();
        if (!(record.attendancePeriods?.length ?? 0) && !teaching.loaded) {
          // 출결부를 아직 안 읽었다 — 읽은 뒤 채운다. 그 사이 선생님이 줄을 고쳤으면 두고,
          // 저장은 읽기가 끝날 때까지 기다린다(onEditSave).
          const loading = teaching
            .load()
            .catch(() => undefined)
            .then(() => {
              if (editingIdRef.current === record.id && !periodsTouchedRef.current) {
                setEditAttendancePeriods(initialPeriodsOf(record));
              }
            });
          ledgerLoadRef.current = loading;
        }
      } else {
        setEditAttendancePeriods([]);
      }
    },
    [initialPeriodsOf],
  );

  const resetEditState = useCallback(() => {
    setEditingId(null);
    editingIdRef.current = null;
    periodsTouchedRef.current = false;
    ledgerLoadRef.current = null;
    setEditContent('');
    setEditCategory('');
    setEditSubcategory('');
    setEditReportedToNeis(false);
    setEditDocumentSubmitted(false);
    setEditFollowUp('');
    setEditFollowUpDate('');
    setEditAttendancePeriods([]);
    setEditSlots([]);
  }, []);

  const onEditSave = useCallback(
    async (record: StudentRecord) => {
      if (record.category === 'attendance') {
        const student = studentMap.get(record.studentId);
        // 옛 사본의 출결부 읽기가 아직이면 끝날 때까지 기다린다 — 기다리지 않으면 지어낸
        // 1교시 한 줄로 그날이 통째로 바뀐다.
        if (ledgerLoadRef.current) await ledgerLoadRef.current;
        // 줄을 안 고쳤으면 지금(읽기가 끝난 뒤) 출결부 기준으로 다시 계산한 목록을 쓴다.
        const nextPeriods = periodsTouchedRef.current
          ? editAttendancePeriods
          : initialPeriodsOf(record);
        // Snapshot for undo — 교시 목록이 없는 옛 사본은 빈 목록이 되어 검사(EMPTY)에 막혀
        // 되돌리기가 조용히 실패했다. 저장 전 출결부에 있던 그날 교시로 되돌린다.
        const snapshot = {
          nextPeriods: initialPeriodsOf(record),
          content: record.content,
          reportedToNeis: record.reportedToNeis ?? false,
          documentSubmitted: record.documentSubmitted ?? false,
        };
        try {
          await updateAttendanceRecord({
            record,
            nextPeriods,
            content: editContent,
            reportedToNeis: editReportedToNeis,
            documentSubmitted: editDocumentSubmitted,
            classId: className,
            date: record.date,
            studentNumber: student?.studentNumber,
            regularPeriodCount,
          });
          showToast('출결 기록을 저장했습니다', 'success', {
            label: '되돌리기',
            onClick: () => {
              // ★기준은 **저장된 뒤의** 기록이다. 저장 전 기록을 기준으로 넘기면 바뀐 것이 없다고
              //   보아(before==after) 메모·교시가 사본에 되돌아오지 않았다(출결부만 되돌아 어긋남).
              const saved =
                useStudentRecordsStore.getState().records.find((r) => r.id === record.id) ?? record;
              void updateAttendanceRecord({
                record: saved,
                nextPeriods: snapshot.nextPeriods,
                content: snapshot.content,
                reportedToNeis: snapshot.reportedToNeis,
                documentSubmitted: snapshot.documentSubmitted,
                classId: className,
                date: record.date,
                studentNumber: student?.studentNumber,
                regularPeriodCount,
              }).catch((err: unknown) => {
                console.error('[handleEditSave] 출결 기록 되돌리기 실패', err);
                showToast('되돌리지 못했습니다', 'error');
              });
            },
          });
        } catch (err) {
          console.error('[handleEditSave] 출결 기록 저장 실패', err);
          showToast('저장에 실패했습니다', 'error');
          return;
        }
      } else {
        // ★정규화 후 빈 배열이면 키 자체를 넣지 않는다. 부재 != 빈 배열 -
        //   빈 배열을 저장하면 병합에서 다른 기기의 장면을 덮는다(입력 경로와 같은 규칙).
        const normalizedSlots = normalizeSlots(editSlots, 'homeroom', customHomeroomSlots ?? []);
        // ★옛 slots 를 **먼저 떼어낸다.** `...record` 를 그대로 펼치면 옛 값이 실려 있어,
        //   칩을 전부 해제해도 조건부 spread 가 아무것도 안 덮어 옛 장면이 그대로 살아남는다
        //   (교사가 지운 장면이 조용히 되살아난다). 교과 `ObservationCard` 가 쓰는 방식과 같다.
        const { slots: _prevSlots, ...restRecord } = record;
        void _prevSlots;
        await updateRecord({
          ...restRecord,
          content: editContent,
          category: editCategory,
          subcategory: editSubcategory,
          followUp: editFollowUp.trim() || undefined,
          followUpDate: editFollowUpDate || undefined,
          ...(normalizedSlots.length > 0 ? { slots: normalizedSlots } : {}),
        });
        showToast('기록을 저장했습니다', 'success');
      }
      resetEditState();
    },
    [
      editContent,
      editCategory,
      editSubcategory,
      editReportedToNeis,
      editDocumentSubmitted,
      editFollowUp,
      editFollowUpDate,
      editAttendancePeriods,
      editSlots,
      customHomeroomSlots,
      className,
      regularPeriodCount,
      studentMap,
      initialPeriodsOf,
      updateRecord,
      updateAttendanceRecord,
      showToast,
      resetEditState,
    ],
  );

  const edit: RecordEditProps = {
    editingId,
    editContent,
    setEditContent,
    editCategory,
    setEditCategory,
    editSubcategory,
    setEditSubcategory,
    editReportedToNeis,
    setEditReportedToNeis,
    editDocumentSubmitted,
    setEditDocumentSubmitted,
    editFollowUp,
    setEditFollowUp,
    editFollowUpDate,
    setEditFollowUpDate,
    editAttendancePeriods,
    setEditAttendancePeriods: setEditAttendancePeriodsByUser,
    editSlots,
    setEditSlots,
    availableSlots,
    regularPeriodCount,
    onEditSave,
    onEditCancel: resetEditState,
  };

  return { edit, handleEdit };
}
