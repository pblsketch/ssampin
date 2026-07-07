import { useState, useCallback } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { resolvePreset, resolveClassroomPreset } from '@domain/valueObjects/SubjectColor';
import type { SubjectColorMap } from '@domain/valueObjects/SubjectColor';
import type { WeeklyProgressCell } from '@domain/rules/progressCalendarRules';
import type { ProgressStatus } from '@domain/entities/CurriculumProgress';
import type { ProgressEntryFieldValues } from '@adapters/components/ClassManagement/ProgressEntryFields';

/**
 * 진도 빠른 입력/편집 상태 머신 — A안(시간표 오버레이)과 B안(수업 관리 캘린더)이 공유한다.
 * 모달 상태 + 열기/저장/삭제 + 셀 강조색 계산을 한 곳에 모아 두 호스트의 중복을 제거한다.
 * 쓰기는 기존 스토어 액션(addProgressEntry/updateProgressEntry/deleteProgressEntry)만 재사용한다.
 */

export interface ProgressQuickEntryModalState {
  readonly mode: 'add' | 'edit';
  readonly cell: WeeklyProgressCell;
  readonly entryId?: string;
  readonly values: ProgressEntryFieldValues;
  readonly status: ProgressStatus;
}

interface UseProgressQuickEntryOptions {
  colorBy: 'subject' | 'classroom';
  subjectColors?: SubjectColorMap;
  classroomColors?: SubjectColorMap;
}

export function useProgressQuickEntry({
  colorBy,
  subjectColors,
  classroomColors,
}: UseProgressQuickEntryOptions) {
  const { progressEntries, addProgressEntry, updateProgressEntry, deleteProgressEntry } =
    useTeachingClassStore();
  const [modal, setModal] = useState<ProgressQuickEntryModalState | null>(null);

  const openAdd = useCallback((cell: WeeklyProgressCell) => {
    if (!cell.matchedClass) return;
    setModal({
      mode: 'add',
      cell,
      values: { date: cell.date, period: cell.period, unit: '', lesson: '', note: '' },
      status: 'planned',
    });
  }, []);

  const openEntry = useCallback(
    (cell: WeeklyProgressCell) => {
      if (!cell.matchedClass) return;
      const entry = cell.entries[0];
      if (!entry) {
        openAdd(cell);
        return;
      }
      setModal({
        mode: 'edit',
        cell,
        entryId: entry.id,
        values: {
          date: entry.date,
          period: entry.period,
          unit: entry.unit,
          lesson: entry.lesson,
          note: entry.note,
        },
        status: entry.status,
      });
    },
    [openAdd],
  );

  const close = useCallback(() => setModal(null), []);

  const submit = useCallback(
    async (values: ProgressEntryFieldValues, status: ProgressStatus) => {
      if (!modal?.cell.matchedClass) return;
      const classId = modal.cell.matchedClass.id;
      if (modal.mode === 'add') {
        await addProgressEntry(
          classId,
          values.date,
          values.period,
          values.unit,
          values.lesson,
          values.note || undefined,
        );
        // addProgressEntry는 상태를 'planned'로 고정하므로, 그 외 상태면 방금 만든 항목을 찾아 갱신
        if (status !== 'planned') {
          const created = useTeachingClassStore
            .getState()
            .progressEntries.find(
              (e) =>
                e.classId === classId &&
                e.date === values.date &&
                e.period === values.period &&
                e.unit === values.unit &&
                e.lesson === values.lesson,
            );
          if (created) await updateProgressEntry({ ...created, status });
        }
      } else if (modal.entryId) {
        const existing = progressEntries.find((e) => e.id === modal.entryId);
        if (existing) {
          await updateProgressEntry({
            ...existing,
            date: values.date,
            period: values.period,
            unit: values.unit,
            lesson: values.lesson,
            note: values.note,
            status,
          });
        }
      }
    },
    [modal, addProgressEntry, updateProgressEntry, progressEntries],
  );

  const remove = useCallback(async () => {
    if (modal?.mode === 'edit' && modal.entryId) {
      await deleteProgressEntry(modal.entryId);
      setModal(null);
    }
  }, [modal, deleteProgressEntry]);

  const accentFor = useCallback(
    (cell: WeeklyProgressCell) => {
      if (!cell.slot) return undefined;
      const p =
        colorBy === 'classroom'
          ? resolveClassroomPreset(cell.slot.classroom, classroomColors)
          : resolvePreset(cell.slot.subject, subjectColors);
      return { text: p.tw.text, bg: p.tw.bg, bgSolid: p.tw.bgSolid };
    },
    [colorBy, subjectColors, classroomColors],
  );

  return { modal, openAdd, openEntry, submit, remove, close, accentFor };
}
