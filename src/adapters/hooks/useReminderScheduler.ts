import { useMemo } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import {
  useRecordReminderStore,
  isReminderPaused,
  isReminderSnoozed,
} from '@adapters/stores/useRecordReminderStore';
import { DEFAULT_REMINDER_SETTINGS } from '@domain/entities/RecordReminder';
import type { LastRecordDateProvider, ReminderStudent } from '@domain/entities/RecordReminder';
import { DEFAULT_HOMEROOM_RECORD_TAGS } from '@domain/entities/StudentRecord';
import { isStudentActive } from '@domain/rules/studentActivity';
import {
  pickDueStudents,
  daysSinceLastRecord,
  formatDateStr,
  studentDedupKey,
  resolvePromptText,
} from '@domain/rules/recordReminderRules';

/**
 * 학생 관찰 기록 알림 — 인앱 오케스트레이션 훅(P2).
 *
 * 설정(Settings.recordReminder)+담임 명단+기록+런타임 상태를 모아
 *  - `dueNow`   : 지금 물어볼 학생(팝업/팝오버용, 실명 — 교사가 직접 연 화면)
 *  - `missingCount` : 공백 임계를 넘긴 학생 수(은은형 배지, 이름 없음)
 * 를 계산하고, 저장/스누즈/건너뛰기 액션을 제공한다.
 *
 * 발화 로직(도메인 순수함수)은 recordReminderRules에 있고, 여기서는 스토어를 잇는다(adapters).
 * OS 토스트 발화(P3)·수업반(P4)은 별도. 실명 노출 정책(nameExposure)은 은은형 배지·OS 토스트에만
 * 적용하며, 교사가 직접 연 인앱 프롬프트에는 실명을 그대로 보여준다.
 */
export interface ReminderPromptItem {
  readonly studentId: string;
  readonly studentName: string;
  readonly promptText: string;
}

export interface UseReminderSchedulerResult {
  readonly dueNow: readonly ReminderPromptItem[];
  readonly missingCount: number;
  readonly tagOptions: readonly string[];
  saveObservation: (
    studentId: string,
    payload: { tags: string[]; content: string },
  ) => Promise<void>;
  snooze: () => void;
  skipStudent: (studentId: string) => void;
  nothingToday: (studentId: string) => void;
}

export function useReminderScheduler(): UseReminderSchedulerResult {
  const rr = useSettingsStore((s) => s.settings.recordReminder) ?? DEFAULT_REMINDER_SETTINGS;
  const students = useStudentStore((s) => s.students);
  const records = useStudentRecordsStore((s) => s.records);
  const cursor = useRecordReminderStore((s) => s.rotationCursor);
  const snoozeUntil = useRecordReminderStore((s) => s.snoozeUntil);
  const pausedUntil = useRecordReminderStore((s) => s.pausedUntil);
  const skippedKeys = useRecordReminderStore((s) => s.skippedKeys);

  const { dueNow, missingCount } = useMemo(() => {
    const empty = { dueNow: [] as ReminderPromptItem[], missingCount: 0 };
    if (!rr.enabled || !rr.targets.includes('homeroom')) return empty;

    const now = new Date();
    const today = formatDateStr(now);
    // 마지막 기록일 맵을 records 스냅샷에서 1회 계산(O(records)).
    const lastDateById = new Map<string, string>();
    for (const rec of records) {
      const prev = lastDateById.get(rec.studentId);
      if (prev === undefined || rec.date > prev) lastDateById.set(rec.studentId, rec.date);
    }
    const provider: LastRecordDateProvider = (id) => lastDateById.get(id) ?? null;
    const reminderStudents: ReminderStudent[] = students
      .filter(isStudentActive)
      .map((s) => ({ id: s.id, name: s.name }));

    const missing = reminderStudents.filter(
      (s) => daysSinceLastRecord(provider, s.id, now) >= rr.staleDays,
    ).length;

    // 스누즈/일시정지 중에는 팝업 대상을 비우되, 배지 카운트(은은형)는 유지한다.
    if (
      isReminderPaused(pausedUntil, now.getTime()) ||
      isReminderSnoozed(snoozeUntil, now.getTime())
    ) {
      return { dueNow: [] as ReminderPromptItem[], missingCount: missing };
    }

    const skippedSet = new Set(skippedKeys);
    const candidates = reminderStudents.filter(
      (s) => !skippedSet.has(studentDedupKey(s.id, today)),
    );
    const due = pickDueStudents(candidates, provider, rr, cursor, now);
    const items: ReminderPromptItem[] = due.map((r, i) => ({
      studentId: r.student.id,
      studentName: r.student.name,
      promptText: resolvePromptText(cursor + i, r.student.name),
    }));
    return { dueNow: items, missingCount: missing };
  }, [rr, students, records, cursor, snoozeUntil, pausedUntil, skippedKeys]);

  const saveObservation = async (
    studentId: string,
    payload: { tags: string[]; content: string },
  ) => {
    const today = formatDateStr(new Date());
    await useStudentRecordsStore.getState().addRecordWithTags({
      studentId,
      category: 'life',
      content: payload.content,
      date: today,
      tags: payload.tags,
    });
    useRecordReminderStore.getState().advanceCursor();
  };

  const snooze = () => useRecordReminderStore.getState().snooze();

  const skipStudent = (studentId: string) => {
    const today = formatDateStr(new Date());
    useRecordReminderStore.getState().skipStudent(studentId, today);
    useRecordReminderStore.getState().advanceCursor();
  };

  // "오늘은 특이사항 없음" — 무리하게 기록을 만들지 않고 오늘 순회에서만 제외한다.
  const nothingToday = (studentId: string) => skipStudent(studentId);

  return {
    dueNow,
    missingCount,
    tagOptions: DEFAULT_HOMEROOM_RECORD_TAGS,
    saveObservation,
    snooze,
    skipStudent,
    nothingToday,
  };
}
