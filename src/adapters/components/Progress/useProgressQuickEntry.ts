import { useState, useCallback, useMemo } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { useProgressFanout } from './useProgressFanout';
import { describeFanoutResult } from '@domain/rules/progressFanout';
import { inferClassGrade, type StandardScope } from '@domain/rules/curriculumStandardRules';
import { coerceSchoolLevel } from '@domain/entities/RecordDraft';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
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
  const { classes, progressEntries, addProgressEntry, updateProgressEntry, deleteProgressEntry } =
    useTeachingClassStore();
  const { settings } = useSettingsStore();
  const showToast = useToastStore((s) => s.show);
  const [modal, setModal] = useState<ProgressQuickEntryModalState | null>(null);

  // "다른 반에도 함께 기록" — 지금 열린 셀의 반이 원본이 된다
  const {
    candidates: fanoutCandidates,
    selectedIds: fanoutSelectedIds,
    toggle: toggleFanoutClass,
    clear: clearFanoutClasses,
    buildPreview: buildFanoutPreview,
    applyFanout,
  } = useProgressFanout(modal?.cell.matchedClass?.id ?? null);

  const fanout = useMemo(
    () => ({
      candidates: fanoutCandidates,
      selectedIds: fanoutSelectedIds,
      onToggle: toggleFanoutClass,
      onClear: clearFanoutClasses,
      buildPreview: buildFanoutPreview,
    }),
    [
      fanoutCandidates,
      fanoutSelectedIds,
      toggleFanoutClass,
      clearFanoutClasses,
      buildFanoutPreview,
    ],
  );

  const openAdd = useCallback((cell: WeeklyProgressCell) => {
    if (!cell.matchedClass) return;
    setModal({
      mode: 'add',
      cell,
      values: {
        date: cell.date,
        period: cell.period,
        unit: '',
        lesson: '',
        note: '',
        standardCodes: [],
        standardText: '',
      },
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
          standardCodes: entry.standardCodes ?? [],
          standardText: entry.standardText ?? '',
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
          undefined,
          { standardCodes: values.standardCodes, standardText: values.standardText },
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
        // 선택한 다른 반에도 같은 진도를 기록 (날짜·교시는 그 반 시간표 기준)
        const fanoutResult = await applyFanout(values);
        const message = describeFanoutResult(fanoutResult);
        if (message) showToast(message, fanoutResult.added > 0 ? 'success' : 'info');
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
            // 선택 필드는 **비면 칸을 지운다** — 교사가 성취기준을 뺐는데 옛 값이 남으면 안 된다.
            ...(values.standardCodes && values.standardCodes.length > 0
              ? { standardCodes: [...values.standardCodes] }
              : { standardCodes: undefined }),
            ...(values.standardText && values.standardText.trim().length > 0
              ? { standardText: values.standardText.trim() }
              : { standardText: undefined }),
          });
        }
      }
    },
    [modal, addProgressEntry, updateProgressEntry, progressEntries, applyFanout, showToast],
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

  /**
   * 지금 열린 칸의 성취기준 범위 — 학교급·과목·학년. 두 호스트(캘린더·시간표)가 같은 값을 쓰도록
   * 여기서 한 번만 만든다.
   */
  const standardScope = useMemo<StandardScope | undefined>(() => {
    const matched = modal?.cell.matchedClass;
    if (!matched) return undefined;
    const cls = classes.find((c) => c.id === matched.id);
    return {
      schoolLevel: coerceSchoolLevel(settings.schoolLevel),
      subject: matched.subject,
      grade: inferClassGrade(matched.name, cls?.students.map((s) => s.grade) ?? []),
    };
  }, [modal, classes, settings.schoolLevel]);

  return { modal, openAdd, openEntry, submit, remove, close, accentFor, fanout, standardScope };
}
