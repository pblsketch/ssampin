import { useEffect, useMemo, useState } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { emptySlots } from '@domain/rules/observationSlots';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import {
  useRecordReminderStore,
  isReminderPaused,
  isReminderSnoozed,
  isStudentSnoozed,
} from '@adapters/stores/useRecordReminderStore';
import { computeSnoozeUntil } from '@domain/rules/reminderSnoozeTimes';
import type { SnoozeWhen } from '@domain/rules/reminderSnoozeTimes';
import { DEFAULT_REMINDER_SETTINGS } from '@domain/entities/RecordReminder';
import type {
  LastRecordDateProvider,
  ReminderStudent,
  ReminderTarget,
} from '@domain/entities/RecordReminder';
import { DEFAULT_HOMEROOM_RECORD_TAGS } from '@domain/entities/StudentRecord';
import { DEFAULT_OBSERVATION_TAGS } from '@domain/entities/Observation';
import { studentKey } from '@domain/entities/TeachingClass';
import { isStudentActive } from '@domain/rules/studentActivity';
import {
  pickDueStudents,
  daysSinceLastRecord,
  formatDateStr,
  studentDedupKey,
  resolveSlotPromptText,
  appendUnclassifiedEvidence,
} from '@domain/rules/recordReminderRules';
import { detectJustFinishedClass } from '@domain/rules/reminderClassMatch';
import { countUnclassified } from '@domain/rules/threadSuggest';
import { teachingStudentRef } from '@domain/entities/RecordDraft';
import { useRecordEvidenceStore } from '@adapters/stores/useRecordEvidenceStore';
import { useInquiryThreadStore } from '@adapters/stores/useInquiryThreadStore';

/**
 * 학생 관찰 기록 알림 — 인앱 오케스트레이션 훅(P2·P4).
 *
 * 담임반(StudentRecord)과 수업반(ObservationRecord)을 모두 다룬다.
 *  - 담임반: 공백(마지막 기록일)이 임계를 넘긴 학생을 상시 감지.
 *  - 수업반(D1): '방금 끝난 수업'(시간표 연동)의 학생 중 관찰 공백이 큰 학생만 감지.
 * 각 대상은 서로 다른 저장처·태그를 쓰므로, `ReminderPromptItem.target`으로 라우팅한다.
 *
 * 발화 로직(도메인 순수함수)은 recordReminderRules/reminderClassMatch에 있고, 여기서는 스토어를 잇는다.
 * 인앱 프롬프트는 실명 그대로(교사가 직접 연 화면). 은은형 배지·OS 토스트에만 nameExposure 적용.
 */
export interface ReminderPromptItem {
  /** 고유 식별(dismiss/skip/rotation). 담임=studentId, 수업반=`subject:${classId}:${studentKey}`. */
  readonly key: string;
  /** 저장용 학생 id. 담임=Student.id, 수업반=studentKey(학년-반-번호). */
  readonly studentId: string;
  readonly studentName: string;
  readonly promptText: string;
  readonly target: ReminderTarget;
  /** 수업반일 때 TeachingClass.id. 담임이면 null. */
  readonly classId: string | null;
  /** 이 학생에 대한 태그 후보(담임=생활 태그, 수업반=교과 태그). */
  readonly tagOptions: readonly string[];
}

export interface ReminderSavePayload {
  tags: string[];
  content: string;
}

export interface UseReminderSchedulerResult {
  readonly dueNow: readonly ReminderPromptItem[];
  readonly missingCount: number;
  saveObservation: (item: ReminderPromptItem, payload: ReminderSavePayload) => Promise<void>;
  /** 전체를 1시간 뒤로 미룸(세션 배치 완료 등 기존 동작). */
  snooze: () => void;
  /** 전체를 선택 시각(1시간/오후/내일)으로 미룸. */
  snoozeAll: (when: SnoozeWhen) => void;
  /** 이 학생만 선택 시각으로 미룸(나머지는 계속 알림). */
  snoozeStudent: (item: ReminderPromptItem, when: SnoozeWhen) => void;
  skipStudent: (item: ReminderPromptItem) => void;
  nothingToday: (item: ReminderPromptItem) => void;
}

export function useReminderScheduler(): UseReminderSchedulerResult {
  const rr = useSettingsStore((s) => s.settings.recordReminder) ?? DEFAULT_REMINDER_SETTINGS;
  const periodTimes = useSettingsStore((s) => s.settings.periodTimes);
  const students = useStudentStore((s) => s.students);
  const records = useStudentRecordsStore((s) => s.records);
  const observationRecords = useObservationStore((s) => s.records);
  const classes = useTeachingClassStore((s) => s.classes);
  const teacherSchedule = useScheduleStore((s) => s.teacherSchedule);
  const scheduleOverrides = useScheduleStore((s) => s.overrides);
  const cursor = useRecordReminderStore((s) => s.rotationCursor);
  const snoozeUntil = useRecordReminderStore((s) => s.snoozeUntil);
  const pausedUntil = useRecordReminderStore((s) => s.pausedUntil);
  const skippedKeys = useRecordReminderStore((s) => s.skippedKeys);
  const studentSnoozes = useRecordReminderStore((s) => s.studentSnoozes);
  // 주제(탐구 흐름)로 아직 안 묶은 근거 건수를 문구에 덧붙이기 위한 재료.
  // ★선정에는 쓰지 않는다 — 문구만 바꾼다(ADR-072 결정 6).
  const evidenceRecords = useRecordEvidenceStore((s) => s.records);
  const inquiryThreads = useInquiryThreadStore((s) => s.records);
  const threadIdSet = useMemo(() => new Set(inquiryThreads.map((t) => t.id)), [inquiryThreads]);

  const subjectEnabled = rr.enabled && rr.targets.includes('subject');

  // 수업반 대상이면 관련 스토어를 로드하고, '수업 직후' 창을 놓치지 않게 주기적으로 재평가한다.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!subjectEnabled) return;
    void useObservationStore.getState().load();
    void useTeachingClassStore.getState().load();
    void useScheduleStore.getState().load();
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [subjectEnabled]);

  // 미분류 근거 꼬리 문구의 재료. 알림이 켜져 있을 때만 읽는다(둘 다 통째로 읽는 파일이라
  // 알림을 안 쓰는 교사에게 괜한 읽기를 시키지 않는다). 실패해도 알림은 그대로 뜬다 —
  // 꼬리가 안 붙을 뿐이다.
  useEffect(() => {
    if (!rr.enabled) return;
    void useRecordEvidenceStore.getState().load();
    void useInquiryThreadStore.getState().load();
  }, [rr.enabled]);

  const { dueNow, missingCount } = useMemo(() => {
    // deps 재평가 트리거(값은 getState로 읽음): 시간 경과·시간표·변동시간표 변화.
    void tick;
    void teacherSchedule;
    void scheduleOverrides;
    const empty = { dueNow: [] as ReminderPromptItem[], missingCount: 0 };
    if (!rr.enabled) return empty;

    const now = new Date();
    const nowMs = now.getTime();
    const today = formatDateStr(now);
    const paused = isReminderPaused(pausedUntil, nowMs);
    const snoozed = isReminderSnoozed(snoozeUntil, nowMs);
    const skipSet = new Set(skippedKeys);
    const active = !paused && !snoozed;

    let missing = 0;
    let homeroomItems: ReminderPromptItem[] = [];
    let subjectItems: ReminderPromptItem[] = [];

    // ── 담임반 (StudentRecord, 상시 공백감지) ──
    if (rr.targets.includes('homeroom')) {
      const lastById = new Map<string, string>();
      for (const rec of records) {
        const prev = lastById.get(rec.studentId);
        if (prev === undefined || rec.date > prev) lastById.set(rec.studentId, rec.date);
      }
      const provider: LastRecordDateProvider = (id) => lastById.get(id) ?? null;
      const roster: ReminderStudent[] = students
        .filter(isStudentActive)
        .map((s) => ({ id: s.id, name: s.name }));
      missing += roster.filter(
        (s) => daysSinceLastRecord(provider, s.id, now) >= rr.staleDays,
      ).length;

      if (active) {
        const candidates = roster.filter(
          (s) =>
            !skipSet.has(studentDedupKey(s.id, today)) &&
            !isStudentSnoozed(studentSnoozes, s.id, nowMs),
        );
        const due = pickDueStudents(candidates, provider, rr, cursor, now);
        homeroomItems = due.map((r, i) => ({
          key: r.student.id,
          studentId: r.student.id,
          studentName: r.student.name,
          // 빈 슬롯이 있으면 그걸 가리키는 문구를, 없으면 기존 문구를 쓴다.
          // ★선정은 바꾸지 않는다 — 위 pickDueStudents 결과 그대로다. 문구만 갈아 끼운다.
          // ★빈 슬롯 판정은 기본 어휘만 본다(emptySlots). 교사가 추가한 칸은 재촉하지 않는다.
          // 끝에 "미분류 근거 N건"을 덧붙인다(0건이면 원문 그대로) — 주제 묶기가 학기말 배치로
          // 몰리지 않게 지나가는 길에 조금씩만 재촉한다.
          promptText: appendUnclassifiedEvidence(
            resolveSlotPromptText(
              cursor + i,
              r.student.name,
              emptySlots(
                records.filter((rec) => rec.studentId === r.student.id),
                'homeroom',
              )[0],
            ),
            countUnclassified(evidenceRecords, r.student.id, threadIdSet),
          ),
          target: 'homeroom' as const,
          classId: null,
          tagOptions: DEFAULT_HOMEROOM_RECORD_TAGS,
        }));
      }
    }

    // ── 수업반 (ObservationRecord, D1: 방금 끝난 수업만) ──
    if (rr.targets.includes('subject') && active) {
      // 변동 시간표(교체·보강)까지 반영된 그 날의 교사 시간표로 '방금 끝난 수업'을 찾는다.
      const daySlots = useScheduleStore.getState().getEffectiveTeacherSchedule(today);
      const finished = detectJustFinishedClass(daySlots, classes, periodTimes ?? [], now);
      if (finished) {
        // 관찰 마지막 기록일 맵 (해당 수업반).
        const obsLast = new Map<string, string>();
        for (const rec of observationRecords) {
          if (rec.classId !== finished.id) continue;
          const prev = obsLast.get(rec.studentId);
          if (prev === undefined || rec.date > prev) obsLast.set(rec.studentId, rec.date);
        }
        const obsProvider: LastRecordDateProvider = (sKey) => obsLast.get(sKey) ?? null;
        const roster: ReminderStudent[] = finished.students
          .filter(isStudentActive)
          .map((s) => ({ id: studentKey(s), name: s.name }));
        const keyOf = (sid: string) => `subject:${finished.id}:${sid}`;
        const candidates = roster.filter(
          (s) =>
            !skipSet.has(studentDedupKey(keyOf(s.id), today)) &&
            !isStudentSnoozed(studentSnoozes, keyOf(s.id), nowMs),
        );
        const due = pickDueStudents(candidates, obsProvider, rr, cursor, now);
        subjectItems = due.map((r) => ({
          key: keyOf(r.student.id),
          studentId: r.student.id,
          studentName: r.student.name,
          // 수업반 근거는 'tc:{classId}:{studentKey}' 로 저장된다 — 담임 학생 id 와 키 체계가
          // 다르므로 여기서 같은 규칙으로 만들어 세야 남의 학생 건수를 세지 않는다.
          promptText: appendUnclassifiedEvidence(
            `방금 '${finished.name}' 수업에서 ${r.student.name} 학생, 눈에 띈 점이 있었나요?`,
            countUnclassified(
              evidenceRecords,
              teachingStudentRef(finished.id, r.student.id),
              threadIdSet,
            ),
          ),
          target: 'subject' as const,
          classId: finished.id,
          tagOptions: DEFAULT_OBSERVATION_TAGS,
        }));
      }
    }

    // 수업 직후(subject)를 먼저, 그다음 담임반.
    return { dueNow: [...subjectItems, ...homeroomItems], missingCount: missing };
  }, [
    rr,
    periodTimes,
    students,
    records,
    observationRecords,
    classes,
    teacherSchedule,
    scheduleOverrides,
    cursor,
    snoozeUntil,
    pausedUntil,
    skippedKeys,
    studentSnoozes,
    tick,
    evidenceRecords,
    threadIdSet,
  ]);

  const saveObservation = async (item: ReminderPromptItem, payload: ReminderSavePayload) => {
    const today = formatDateStr(new Date());
    if (item.target === 'subject' && item.classId) {
      await useObservationStore.getState().addRecord({
        studentId: item.studentId,
        classId: item.classId,
        date: today,
        content: payload.content,
        tags: payload.tags,
      });
    } else {
      await useStudentRecordsStore.getState().addRecordWithTags({
        studentId: item.studentId,
        category: 'life',
        content: payload.content,
        date: today,
        tags: payload.tags,
      });
    }
    useRecordReminderStore.getState().advanceCursor();
  };

  const snooze = () => useRecordReminderStore.getState().snooze();

  const snoozeAll = (when: SnoozeWhen) =>
    useRecordReminderStore.getState().snoozeUntilMs(computeSnoozeUntil(new Date(), when));

  const snoozeStudent = (item: ReminderPromptItem, when: SnoozeWhen) => {
    useRecordReminderStore
      .getState()
      .snoozeStudentUntil(item.key, computeSnoozeUntil(new Date(), when));
    useRecordReminderStore.getState().advanceCursor();
  };

  const skipStudent = (item: ReminderPromptItem) => {
    const today = formatDateStr(new Date());
    useRecordReminderStore.getState().skipStudent(item.key, today);
    useRecordReminderStore.getState().advanceCursor();
  };

  // "오늘은 특이사항 없음" — 무리하게 기록을 만들지 않고 오늘 순회에서만 제외한다.
  const nothingToday = (item: ReminderPromptItem) => skipStudent(item);

  return {
    dueNow,
    missingCount,
    saveObservation,
    snooze,
    snoozeAll,
    snoozeStudent,
    skipStudent,
    nothingToday,
  };
}
