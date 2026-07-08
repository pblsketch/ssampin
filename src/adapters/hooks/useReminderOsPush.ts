import { useCallback, useEffect } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import {
  useRecordReminderStore,
  isReminderPaused,
  isReminderSnoozed,
} from '@adapters/stores/useRecordReminderStore';
import { useReminderFireStore } from '@adapters/stores/useReminderFireStore';
import { DEFAULT_REMINDER_SETTINGS } from '@domain/entities/RecordReminder';
import type { LastRecordDateProvider, ReminderStudent } from '@domain/entities/RecordReminder';
import { isStudentActive } from '@domain/rules/studentActivity';
import { buildForwardSchedule } from '@domain/rules/recordReminderRules';

/**
 * 학생 관찰 기록 알림 — OS 토스트 스케줄 push 훅(P3, S1).
 *
 * MainApp이 살아있는 동안(mount·focus·system:resume·데이터 변화) forward 스케줄을
 * domain 순수함수로 계산해 `window.electronAPI.scheduleReminders`로 main에 넘긴다.
 * 이후 MainApp이 destroy(위젯/아이콘+memorySaver)돼도 main의 상시 타이머가 예정 시각에 발화한다.
 *
 * 발화 후 main이 `reminder:fired`로 알려주면 발화 장부(useReminderFireStore)에 기록해
 * 중복 발화를 막는다. 실명 노출(nameExposure)은 buildForwardSchedule 내부에서 body에 적용된다.
 *
 * 브라우저 모드(electronAPI 없음)에서는 조용히 no-op.
 */
export function useReminderOsPush(onToastClicked?: (reminderId: string) => void): void {
  const rr = useSettingsStore((s) => s.settings.recordReminder) ?? DEFAULT_REMINDER_SETTINGS;
  const students = useStudentStore((s) => s.students);
  const records = useStudentRecordsStore((s) => s.records);
  const cursor = useRecordReminderStore((s) => s.rotationCursor);
  const snoozeUntil = useRecordReminderStore((s) => s.snoozeUntil);
  const pausedUntil = useRecordReminderStore((s) => s.pausedUntil);
  const firedKeys = useReminderFireStore((s) => s.firedKeys);
  const fireLoaded = useReminderFireStore((s) => s.loaded);

  // 발화 장부 최초 로드.
  useEffect(() => {
    void useReminderFireStore.getState().load();
  }, []);

  // main이 토스트를 쏘면 dedup 키를 장부에 기록(중복 방지).
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onReminderFired) return;
    return api.onReminderFired((dedupKey) => {
      void useReminderFireStore.getState().markFired(dedupKey);
    });
  }, []);

  // 토스트 클릭 시 opaque reminderId 수신 → 호출부(팝업)에 전달(팝업 재노출 등, 레이어 M2).
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onReminderClick || !onToastClicked) return;
    return api.onReminderClick((reminderId) => onToastClicked(reminderId));
  }, [onToastClicked]);

  const push = useCallback(() => {
    const api = window.electronAPI;
    if (!api?.scheduleReminders || !api.clearReminderSchedule) return;
    // 능동형 OFF·기능 OFF·스누즈·일시정지 중이면 스케줄을 비운다(인앱 팝업과 동일하게 억제).
    if (
      !rr.enabled ||
      !rr.osToastEnabled ||
      !rr.targets.includes('homeroom') ||
      isReminderPaused(pausedUntil, Date.now()) ||
      isReminderSnoozed(snoozeUntil, Date.now())
    ) {
      api.clearReminderSchedule();
      return;
    }
    const now = new Date();
    const lastDateById = new Map<string, string>();
    for (const rec of records) {
      const prev = lastDateById.get(rec.studentId);
      if (prev === undefined || rec.date > prev) lastDateById.set(rec.studentId, rec.date);
    }
    const provider: LastRecordDateProvider = (id) => lastDateById.get(id) ?? null;
    const reminderStudents: ReminderStudent[] = students
      .filter(isStudentActive)
      .map((s) => ({ id: s.id, name: s.name }));

    const items = buildForwardSchedule(
      reminderStudents,
      provider,
      rr,
      new Set(firedKeys),
      cursor,
      now,
      (sid, date) => `${sid}:${date}`,
    );
    api.scheduleReminders(
      items.map((it) => ({
        reminderId: it.reminderId,
        fireAt: it.fireAt,
        title: it.title,
        body: it.body,
        studentDedupKey: it.studentDedupKey,
      })),
    );
  }, [rr, students, records, cursor, firedKeys, pausedUntil, snoozeUntil]);

  // 데이터/설정 변화 시 재계산·재-push (발화 장부 로드 후).
  useEffect(() => {
    if (fireLoaded) push();
  }, [push, fireLoaded]);

  // 창 포커스·절전 복귀 시에도 재-push(스케줄 신선도 유지).
  useEffect(() => {
    const api = window.electronAPI;
    const offResume = api?.onSystemResume?.(() => push());
    const onFocus = () => push();
    window.addEventListener('focus', onFocus);
    return () => {
      offResume?.();
      window.removeEventListener('focus', onFocus);
    };
  }, [push]);
}
