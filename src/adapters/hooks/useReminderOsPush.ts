import { useCallback, useEffect } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import {
  useRecordReminderStore,
  isReminderPaused,
  isReminderSnoozed,
} from '@adapters/stores/useRecordReminderStore';
import { useReminderFireStore } from '@adapters/stores/useReminderFireStore';
import { useSchoolCalendarDays } from '@adapters/hooks/useObservationCheerContext';
import {
  homeroomEntries,
  lastObservationDateByRef,
  subjectCard,
  subjectEntries,
} from '@domain/rules/observationEntries';
import { activeExclusionKeys, subjectExclusionKey } from '@domain/rules/reminderExclusion';
import { scopedReminderConfig } from '@domain/rules/observationFocus';
import { isRestingToday, useObservationDayStore } from '@adapters/stores/useObservationDayStore';
import {
  DEFAULT_REMINDER_SETTINGS,
  isObservationCheerEnabled,
} from '@domain/entities/RecordReminder';
import type { LastRecordDateProvider, ReminderStudent } from '@domain/entities/RecordReminder';
import { isStudentActive } from '@domain/rules/studentActivity';
import {
  buildForwardSchedule,
  daysSinceLastRecord,
  effectiveStaleDays,
  formatDateStr,
} from '@domain/rules/recordReminderRules';
import { parseMinutes } from '@domain/rules/periodRules';
import { findMatchingClass } from '@domain/rules/matchingRules';
import { filterActiveClasses } from '@domain/rules/teachingClassArchive';
import { studentKey } from '@domain/entities/TeachingClass';

interface OsScheduleItem {
  reminderId: string;
  fireAt: number;
  title: string;
  body: string;
  studentDedupKey: string;
}

function nextLocalMidnight(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
}

/**
 * 학생 관찰 기록 알림 — OS 토스트 스케줄 push 훅(P3·P4, S1).
 *
 * MainApp이 살아있는 동안(mount·focus·system:resume·데이터 변화) forward 스케줄을 계산해
 * `window.electronAPI.scheduleReminders`로 main에 넘긴다. MainApp이 destroy(위젯/아이콘+memorySaver)
 * 돼도 main의 상시 타이머가 예정 시각에 발화한다.
 *  - 담임반: buildForwardSchedule(각 후보의 다음 발화 시각, 실명 노출 정책 적용).
 *  - 수업반(D1): 오늘 각 수업의 '종료 시각'에, 그 반에 관찰 공백 학생이 있으면 토스트 예약
 *    (반 이름+인원만, 학생 실명 미포함). 클릭 시 앱에서 그 반 학생 프롬프트로.
 *
 * 발화 후 main이 `reminder:fired`로 dedup 키를 알려주면 발화 장부(useReminderFireStore)에 기록.
 * 브라우저 모드(electronAPI 없음)에서는 조용히 no-op.
 */
export function useReminderOsPush(onToastClicked?: (reminderId: string) => void): void {
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
  const firedKeys = useReminderFireStore((s) => s.firedKeys);
  const fireLoaded = useReminderFireStore((s) => s.loaded);
  // ADR-137 — '오늘은 쉴게요'는 그날 윈도우 알림을 조용히 한다(내일 예약은 그대로 둔다).
  const restDay = useObservationDayStore((s) => s.restDay);
  // ADR-135 — 방학 날은 공백 날수에 넣지 않는다(학사일정이 없으면 예전 그대로).
  const calendar = useSchoolCalendarDays();

  // 발화 장부 최초 로드.
  useEffect(() => {
    void useReminderFireStore.getState().load();
  }, []);

  // main이 토스트를 쏘면 dedup 키를 장부에 기록(중복 방지).
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onReminderFired) return;
    return api.onReminderFired((dedupKey, source) => {
      // 할 일 알람이 울린 것까지 기록 장부에 적으면 안 된다 — 출처로 가른다.
      // 키 접두 문자열로 가르지 않는 이유: 담임반 키는 `{sid}:{date}`, 수업반 키는
      // `subject:{clsId}:{today}` 라서 둘 다 'record' 로 시작하지 않는다.
      if (source !== 'record') return;
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
    // 시간표·변동시간표 변화 시 재-push되도록 deps에 포함(값은 getState로 읽음).
    void teacherSchedule;
    void scheduleOverrides;

    const api = window.electronAPI;
    if (!api?.scheduleReminders || !api.clearReminderSchedule) return;
    // 능동형 OFF·기능 OFF·스누즈·일시정지 중이면 스케줄을 비운다.
    if (
      !rr.enabled ||
      !rr.osToastEnabled ||
      isReminderPaused(pausedUntil, Date.now()) ||
      isReminderSnoozed(snoozeUntil, Date.now())
    ) {
      // ★ 출처를 반드시 지정한다. 인자를 빼면 할 일 알람 예약까지 같이 지워진다 —
      //   "스누즈를 눌렀더니 할 일 알람이 죽는" 구멍이 여기 있었다.
      api.clearReminderSchedule('record');
      return;
    }

    const now = new Date();
    const fired = new Set(firedKeys);
    const items: OsScheduleItem[] = [];
    const todayIso = formatDateStr(now);
    // ADR-135 — '당분간 빼기'한 학생은 윈도우 알림 예약에서도 뺀다.
    const excludedKeys = activeExclusionKeys(rr, todayIso);

    // ── 담임반: 각 후보의 다음 발화 시각 forward 스케줄 ──
    if (rr.targets.includes('homeroom')) {
      // ADR-135 — 출결 기록은 관찰로 세지 않는다(잔디의 종·인앱 알림과 같은 기준).
      const lastById = lastObservationDateByRef(homeroomEntries(records), todayIso);
      const provider: LastRecordDateProvider = (id) => lastById.get(id) ?? null;
      const roster: ReminderStudent[] = students
        .filter(isStudentActive)
        .filter((s) => !excludedKeys.has(s.id))
        .map((s) => ({ id: s.id, name: s.name }));
      for (const it of buildForwardSchedule(
        roster,
        provider,
        // 관심 학생 절반 문턱은 반 범위로 좁힌 설정으로 잰다(ADR-137).
        scopedReminderConfig(rr, { kind: 'homeroom' }),
        fired,
        cursor,
        now,
        (sid, date) => `${sid}:${date}`,
        calendar,
      )) {
        items.push({
          reminderId: it.reminderId,
          fireAt: it.fireAt,
          title: it.title,
          body: it.body,
          studentDedupKey: it.studentDedupKey,
        });
      }
    }

    // ── 수업반(D1): 오늘 각 수업 종료 시각에, 그 반 관찰 공백 학생이 있으면 예약 ──
    if (rr.targets.includes('subject')) {
      const pts = periodTimes ?? [];
      const y = now.getFullYear();
      const mo = now.getMonth();
      const d = now.getDate();
      const today = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const daySlots = useScheduleStore.getState().getEffectiveTeacherSchedule(today);

      // 관찰 마지막 기록일 맵: 카드별(`subject:${classId}`) → studentKey → date.
      const obsEntries = subjectEntries(observationRecords);

      for (let i = 0; i < daySlots.length; i++) {
        const slot = daySlots[i];
        if (!slot || !slot.classroom) continue;
        // 보관된 반은 기록 알림 대상이 아니다 — 활성 반만 매칭
        const cls = findMatchingClass(filterActiveClasses(classes), slot.classroom, slot.subject);
        if (!cls) continue;
        const pt = pts.find((p) => p.period === i + 1);
        if (!pt) continue;
        const endMin = parseMinutes(pt.end);
        const fireAt = new Date(y, mo, d, Math.floor(endMin / 60), endMin % 60).getTime();
        if (fireAt <= now.getTime()) continue; // 이미 끝난 수업은 건너뜀(인앱 D1이 흡수)

        const dedup = `subject:${cls.id}:${today}`;
        if (fired.has(dedup)) continue; // 하루 한 번(그 반)

        const card = subjectCard(cls.id);
        const obsLast = lastObservationDateByRef(
          obsEntries.filter((e) => e.card === card),
          today,
        );
        const provider: LastRecordDateProvider = (sKey) => obsLast.get(sKey) ?? null;
        const subjectCfg = scopedReminderConfig(rr, { kind: 'subject', classId: cls.id });
        const dueCount = cls.students
          .filter(isStudentActive)
          .filter((s) => !excludedKeys.has(subjectExclusionKey(cls.id, studentKey(s))))
          .filter(
            (s) =>
              daysSinceLastRecord(provider, studentKey(s), now, calendar) >=
              effectiveStaleDays(studentKey(s), subjectCfg),
          ).length;
        if (dueCount === 0) continue;

        items.push({
          reminderId: dedup,
          fireAt,
          title: '수업 관찰 기록 알림',
          body: `방금 '${cls.name}' 수업 — 관찰 기록이 뜸한 학생이 ${dueCount}명 있어요`,
          studentDedupKey: dedup,
        });
      }
    }

    // 쉬는 날에는 오늘 자정 전 예약을 뺀다 — 이미 예약해 둔 그날 알림도 이 재예약으로 지워진다.
    // 쉬기는 응원·잔디의 단추라, 응원·잔디를 끄면 함께 풀린다.
    const scheduled =
      isObservationCheerEnabled(rr) && isRestingToday(restDay, todayIso)
        ? items.filter((it) => it.fireAt >= nextLocalMidnight(now))
        : items;
    api.scheduleReminders('record', scheduled);
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
    firedKeys,
    pausedUntil,
    snoozeUntil,
    restDay,
    calendar,
  ]);

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
