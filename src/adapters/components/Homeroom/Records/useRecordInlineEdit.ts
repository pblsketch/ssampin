import { useState, useCallback } from 'react';
import type { Student } from '@domain/entities/Student';
import type { StudentRecord, AttendancePeriodEntry } from '@domain/entities/StudentRecord';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { type RecordEditProps, initEditAttendancePeriods } from './recordUtils';

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

  const handleEdit = useCallback((record: StudentRecord) => {
    setEditingId(record.id);
    setEditContent(record.content);
    setEditCategory(record.category);
    setEditSubcategory(record.subcategory);
    setEditReportedToNeis(record.reportedToNeis ?? false);
    setEditDocumentSubmitted(record.documentSubmitted ?? false);
    setEditFollowUp(record.followUp ?? '');
    setEditFollowUpDate(record.followUpDate ?? '');
    if (record.category === 'attendance') {
      setEditAttendancePeriods(initEditAttendancePeriods(record));
    } else {
      setEditAttendancePeriods([]);
    }
  }, []);

  const resetEditState = useCallback(() => {
    setEditingId(null);
    setEditContent('');
    setEditCategory('');
    setEditSubcategory('');
    setEditReportedToNeis(false);
    setEditDocumentSubmitted(false);
    setEditFollowUp('');
    setEditFollowUpDate('');
    setEditAttendancePeriods([]);
  }, []);

  const onEditSave = useCallback(
    async (record: StudentRecord) => {
      if (record.category === 'attendance') {
        const student = studentMap.get(record.studentId);
        // Snapshot for undo
        const snapshot = {
          nextPeriods: [...(record.attendancePeriods ?? [])],
          content: record.content,
          reportedToNeis: record.reportedToNeis ?? false,
          documentSubmitted: record.documentSubmitted ?? false,
        };
        try {
          await updateAttendanceRecord({
            record,
            nextPeriods: editAttendancePeriods,
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
              void updateAttendanceRecord({
                record,
                nextPeriods: snapshot.nextPeriods,
                content: snapshot.content,
                reportedToNeis: snapshot.reportedToNeis,
                documentSubmitted: snapshot.documentSubmitted,
                classId: className,
                date: record.date,
                studentNumber: student?.studentNumber,
                regularPeriodCount,
              });
            },
          });
        } catch (err) {
          console.error('[handleEditSave] 출결 기록 저장 실패', err);
          showToast('저장에 실패했습니다', 'error');
          return;
        }
      } else {
        await updateRecord({
          ...record,
          content: editContent,
          category: editCategory,
          subcategory: editSubcategory,
          followUp: editFollowUp.trim() || undefined,
          followUpDate: editFollowUpDate || undefined,
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
      className,
      regularPeriodCount,
      studentMap,
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
    setEditAttendancePeriods,
    regularPeriodCount,
    onEditSave,
    onEditCancel: resetEditState,
  };

  return { edit, handleEdit };
}
