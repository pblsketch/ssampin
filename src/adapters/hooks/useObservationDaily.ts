/**
 * 관찰 기록 응원 2·3차(ADR-137) — 그날 흐름: 오늘 챙길 학생·오늘은 쉴게요·먼저 거는 말.
 *
 * - `useTodayStudentsEngine`: 오늘 챙길 학생을 고른다(메인 창·위젯 창 모두 — 이 컴퓨터 저장소에서
 *   합쳐지므로 두 창이 같은 명단을 본다). 기록·학사일정을 다 불러온 뒤에만 고른다 — 기록을 읽기
 *   전에 고르면 모든 학생이 오래 비어 보여 엉뚱한 학생이 하루 동안 고정된다.
 * - `useTodayStudentsView`: 카드의 칩 줄 뷰모델.
 * - `useTodayStudentRefs`: 반 카드의 종(오늘 챙길 학생의 빈칸에만).
 * - `useRestToday`: 오늘은 쉴게요 / 다시 켜기.
 * - `useObservationTalkEngine`: 그날 처음 화면에서 먼저 거는 말을 정한다(하루 한 번). 메인 창이면
 *   토스트도 한 번 띄운다. 창 열기는 `ObservationCheer/observationPanelNavigation`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { readTodoCompletionSince } from '@adapters/utils/todoCompletionSince';
import { workCountItems, workCountLine } from '@domain/rules/recapWorkCounts';
import { localWorkCounts, weekDateRange } from './recapWorkData';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useRecordReminderStore, isReminderPaused } from '@adapters/stores/useRecordReminderStore';
import { useModalCoordinatorStore } from '@adapters/stores/useModalCoordinatorStore';
import { isRestingToday, useObservationDayStore } from '@adapters/stores/useObservationDayStore';
import {
  useObservationCheerAvailable,
  useObservationTermWindow,
  useRegularTermEnd,
  useSchoolCalendarDays,
  useSchoolCalendarReady,
} from '@adapters/hooks/useObservationCheerContext';
import {
  DEFAULT_REMINDER_SETTINGS,
  isObservationCheerEnabled,
  type LastRecordDateProvider,
  type ReminderSettings,
} from '@domain/entities/RecordReminder';
import type { Student } from '@domain/entities/Student';
import { studentKey, type TeachingClass } from '@domain/entities/TeachingClass';
import {
  HOMEROOM_CARD,
  homeroomEntries,
  lastObservationDateByRef,
  subjectCard,
  subjectEntries,
  type ObservationEntry,
} from '@domain/rules/observationEntries';
import {
  homeroomTiles,
  shortClassName,
  subjectTiles,
  teachingClassTitle,
} from '@domain/rules/observationCardRoster';
import { scopedReminderConfig } from '@domain/rules/observationFocus';
import {
  activeExclusionKeys,
  homeroomExclusionKey,
  subjectExclusionKey,
} from '@domain/rules/reminderExclusion';
import { maskName } from '@domain/rules/recordReminderRules';
import { isSchoolDay } from '@domain/rules/schoolDays';
import { filterActiveClasses } from '@domain/rules/teachingClassArchive';
import { isStudentActive } from '@domain/rules/studentActivity';
import {
  advanceTodayStudents,
  endedLessonsToday,
  isTodayStudentsVisible,
  refsRecordedToday,
  todayStudentCaps,
  type PickPool,
} from '@domain/rules/todayStudents';
import { weeklyNoticeWeek, weeklySkippedWeek } from '@domain/rules/observationWeeklySummary';
import { buildWeekRecap, type WeekRecap } from '@adapters/hooks/observationRecap';
import { isRetrospectNoticeDay } from '@domain/rules/observationRetrospect';
import {
  decideTalk,
  markToastShown,
  pendingTalk,
  type TalkCandidate,
  type TalkOfDay,
} from '@domain/rules/proactiveTalk';
import { toLocalDateString } from '@shared/utils/localDate';

/** 1분마다 다시 본다(수업 끝남·자정 넘김). */
function useMinuteTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  return tick;
}

/** 오늘 'YYYY-MM-DD' — 분마다 다시 읽어 자정을 넘기면 바뀐다. */
export function useTodayString(): string {
  const tick = useMinuteTick();
  return useMemo(() => {
    void tick;
    return toLocalDateString(new Date());
  }, [tick]);
}

function useDocumentVisible(): boolean {
  const read = (): boolean =>
    typeof document === 'undefined' || document.visibilityState !== 'hidden';
  const [visible, setVisible] = useState(read);
  useEffect(() => {
    const update = (): void => setVisible(read());
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
    };
  }, []);
  return visible;
}

// ── 오늘은 쉴게요 ──

export function useRestToday(): {
  readonly resting: boolean;
  readonly rest: () => void;
  readonly unrest: () => void;
} {
  const restDay = useObservationDayStore((s) => s.restDay);
  const today = useTodayString();
  const rest = useCallback(() => {
    useObservationDayStore.getState().restToday(toLocalDateString(new Date()));
  }, []);
  const unrest = useCallback(() => useObservationDayStore.getState().clearRest(), []);
  return { resting: isRestingToday(restDay, today), rest, unrest };
}

// ── 오늘 챙길 학생 ──

/** 오늘 챙길 학생이 보이는 조건(spec §2). 학사일정·설정을 불러오기 전에는 false. */
export function useTodayStudentsVisible(): boolean {
  const rr = useSettingsStore((s) => s.settings.recordReminder) ?? DEFAULT_REMINDER_SETTINGS;
  const available = useObservationCheerAvailable();
  const pausedUntil = useRecordReminderStore((s) => s.pausedUntil);
  const restDay = useObservationDayStore((s) => s.restDay);
  const calendar = useSchoolCalendarDays();
  const ready = useSchoolCalendarReady();
  const today = useTodayString();
  // 일시정지는 낮에도 풀린다(예: '이번 주 일시정지'는 누른 시각 + 7일) — 분마다 다시 잰다.
  const tick = useMinuteTick();
  const paused = useMemo(() => {
    void tick;
    return isReminderPaused(pausedUntil, Date.now());
  }, [tick, pausedUntil]);
  return useMemo(() => {
    if (!ready) return false;
    return isTodayStudentsVisible({
      cheerEnabled: available && isObservationCheerEnabled(rr),
      reminder: rr,
      weekday: new Date(`${today}T00:00:00`).getDay(),
      schoolDay: isSchoolDay(today, calendar),
      reminderPaused: paused,
      resting: isRestingToday(restDay, today),
    });
  }, [ready, available, rr, today, calendar, paused, restDay]);
}

function homeroomPool(
  students: readonly Student[],
  records: Parameters<typeof homeroomEntries>[0],
  rr: ReminderSettings,
  excluded: ReadonlySet<string>,
  today: string,
): PickPool | null {
  const roster = students
    .filter(isStudentActive)
    .filter((s) => !excluded.has(homeroomExclusionKey(s.id)))
    .map((s) => ({ id: s.id, name: s.name }));
  if (roster.length === 0) return null;
  const last = lastObservationDateByRef(homeroomEntries(records), today);
  const provider: LastRecordDateProvider = (id) => last.get(id) ?? null;
  return { roster, provider, config: scopedReminderConfig(rr, { kind: 'homeroom' }) };
}

function subjectPool(
  cls: TeachingClass,
  entries: readonly ObservationEntry[],
  rr: ReminderSettings,
  excluded: ReadonlySet<string>,
  today: string,
): PickPool {
  const roster = cls.students
    .filter(isStudentActive)
    .filter((s) => !excluded.has(subjectExclusionKey(cls.id, studentKey(s))))
    .map((s) => ({ id: studentKey(s), name: s.name }));
  const card = subjectCard(cls.id);
  const last = lastObservationDateByRef(
    entries.filter((e) => e.card === card),
    today,
  );
  const provider: LastRecordDateProvider = (id) => last.get(id) ?? null;
  return {
    roster,
    provider,
    config: scopedReminderConfig(rr, { kind: 'subject', classId: cls.id }),
  };
}

/**
 * 오늘 챙길 학생을 고른다 — 창마다 한 번 단다(메인 창 호스트·위젯 창 호스트).
 * 보이는 조건이 맞을 때만, 기록·명렬·시간표를 다 불러온 뒤에만 고른다.
 */
export function useTodayStudentsEngine(): void {
  const visible = useTodayStudentsVisible();
  const rr = useSettingsStore((s) => s.settings.recordReminder) ?? DEFAULT_REMINDER_SETTINGS;
  const periodTimes = useSettingsStore((s) => s.settings.periodTimes);
  const students = useStudentStore((s) => s.students);
  const studentsLoaded = useStudentStore((s) => s.loaded);
  const classes = useTeachingClassStore((s) => s.classes);
  const classesLoaded = useTeachingClassStore((s) => s.loaded);
  const records = useStudentRecordsStore((s) => s.records);
  const recordsLoaded = useStudentRecordsStore((s) => s.loaded);
  const observations = useObservationStore((s) => s.records);
  const observationsLoaded = useObservationStore((s) => s.loaded);
  const scheduleLoaded = useScheduleStore((s) => s.loaded);
  const teacherSchedule = useScheduleStore((s) => s.teacherSchedule);
  const overrides = useScheduleStore((s) => s.overrides);
  const calendar = useSchoolCalendarDays();
  const tick = useMinuteTick();

  const wantsHomeroom = rr.targets.includes('homeroom');
  const wantsSubject = rr.targets.includes('subject');

  useEffect(() => {
    if (!visible) return;
    if (!studentsLoaded) void useStudentStore.getState().load();
    if (!recordsLoaded) void useStudentRecordsStore.getState().load();
    if (wantsSubject) {
      if (!classesLoaded) void useTeachingClassStore.getState().load();
      if (!observationsLoaded) void useObservationStore.getState().load();
      if (!scheduleLoaded) void useScheduleStore.getState().load();
    }
  }, [
    visible,
    wantsSubject,
    studentsLoaded,
    recordsLoaded,
    classesLoaded,
    observationsLoaded,
    scheduleLoaded,
  ]);

  useEffect(() => {
    void tick;
    void teacherSchedule;
    void overrides;
    if (!visible) return;
    const homeroomReady = !wantsHomeroom || (studentsLoaded && recordsLoaded);
    const subjectReady = !wantsSubject || (classesLoaded && observationsLoaded && scheduleLoaded);
    if (!homeroomReady || !subjectReady) return;

    const now = new Date();
    const today = toLocalDateString(now);
    const excluded = activeExclusionKeys(rr, today);
    const homeroom = wantsHomeroom ? homeroomPool(students, records, rr, excluded, today) : null;
    const endedClasses: { classId: string; pool: PickPool }[] = [];
    if (wantsSubject) {
      const daySlots = useScheduleStore.getState().getEffectiveTeacherSchedule(today);
      const entries = subjectEntries(observations);
      const byId = new Map(filterActiveClasses(classes).map((c) => [c.id, c]));
      for (const lesson of endedLessonsToday(daySlots, classes, periodTimes ?? [], now)) {
        const cls = byId.get(lesson.classId);
        if (cls === undefined) continue;
        endedClasses.push({
          classId: cls.id,
          pool: subjectPool(cls, entries, rr, excluded, today),
        });
      }
    }
    const input = {
      today,
      now,
      cal: calendar,
      caps: todayStudentCaps(rr),
      homeroom,
      endedClasses,
    };
    useObservationDayStore
      .getState()
      .updateTodayStudents((prev) => advanceTodayStudents(prev, input));
  }, [
    visible,
    tick,
    rr,
    periodTimes,
    students,
    classes,
    records,
    observations,
    teacherSchedule,
    overrides,
    calendar,
    wantsHomeroom,
    wantsSubject,
    studentsLoaded,
    recordsLoaded,
    classesLoaded,
    observationsLoaded,
    scheduleLoaded,
  ]);
}

export interface TodayStudentChip {
  /** 'homeroom' | `subject:${classId}` */
  readonly card: string;
  readonly contextKind: 'homeroom' | 'teaching';
  /** 담임은 'homeroom', 수업반은 classId */
  readonly contextId: string;
  readonly ref: string;
  /** 칩 글자 — "15" 또는 "3-15" */
  readonly label: string;
  /** 수업반 칩에 붙이는 짧은 반 이름('3-2반'). 담임은 null. */
  readonly classShort: string | null;
  /** 수업반의 전체 이름('3학년 2반 통합과학') — 이름표·스크린리더용. 담임은 null. */
  readonly classLabel: string | null;
  /** 이름 표시 설정을 적용한 이름('표시 안 함'이면 빈 문자열) */
  readonly displayName: string;
  readonly done: boolean;
}

/** 카드의 '오늘 챙길 학생' 칩 줄. 보이는 조건이 안 맞거나 명단이 비면 빈 배열. */
export function useTodayStudentsView(): readonly TodayStudentChip[] {
  const visible = useTodayStudentsVisible();
  const state = useObservationDayStore((s) => s.todayStudents);
  const rr = useSettingsStore((s) => s.settings.recordReminder) ?? DEFAULT_REMINDER_SETTINGS;
  const students = useStudentStore((s) => s.students);
  const classes = useTeachingClassStore((s) => s.classes);
  const records = useStudentRecordsStore((s) => s.records);
  const observations = useObservationStore((s) => s.records);
  const today = useTodayString();

  return useMemo(() => {
    if (!visible || state === null || state.date !== today) return [];
    const chips: TodayStudentChip[] = [];
    if (state.homeroom.length > 0) {
      const tiles = new Map(homeroomTiles(students).map((t) => [t.ref, t]));
      const done = refsRecordedToday(homeroomEntries(records), today);
      for (const ref of state.homeroom) {
        const tile = tiles.get(ref);
        if (tile === undefined) continue;
        chips.push({
          card: HOMEROOM_CARD,
          contextKind: 'homeroom',
          contextId: 'homeroom',
          ref,
          label: tile.label,
          classShort: null,
          classLabel: null,
          displayName: maskName(tile.name, rr.nameExposure),
          done: done.has(ref),
        });
      }
    }
    if (state.subject.length > 0) {
      const byId = new Map(classes.map((c) => [c.id, c]));
      const entries = subjectEntries(observations);
      for (const pick of state.subject) {
        if (pick.classId === null) continue;
        const cls = byId.get(pick.classId);
        if (cls === undefined) continue;
        const tile = subjectTiles(cls.students).find((t) => t.ref === pick.ref);
        if (tile === undefined) continue;
        const card = subjectCard(cls.id);
        const done = refsRecordedToday(
          entries.filter((e) => e.card === card),
          today,
        );
        chips.push({
          card,
          contextKind: 'teaching',
          contextId: cls.id,
          ref: pick.ref,
          label: tile.label,
          classShort: shortClassName(cls.name),
          classLabel: teachingClassTitle(cls.name, cls.subject),
          displayName: maskName(tile.name, rr.nameExposure),
          done: done.has(pick.ref),
        });
      }
    }
    return chips;
  }, [visible, state, today, rr, students, classes, records, observations]);
}

/** 반 카드의 종 — 카드마다 오늘 챙길 학생 ref. 보이는 조건이 안 맞으면 빈 맵. */
export function useTodayStudentRefs(): ReadonlyMap<string, ReadonlySet<string>> {
  const visible = useTodayStudentsVisible();
  const state = useObservationDayStore((s) => s.todayStudents);
  const today = useTodayString();
  return useMemo(() => {
    const map = new Map<string, Set<string>>();
    if (!visible || state === null || state.date !== today) return map;
    const add = (card: string, ref: string): void => {
      let set = map.get(card);
      if (set === undefined) {
        set = new Set<string>();
        map.set(card, set);
      }
      set.add(ref);
    };
    for (const ref of state.homeroom) add(HOMEROOM_CARD, ref);
    for (const p of state.subject) if (p.classId !== null) add(subjectCard(p.classId), p.ref);
    return map;
  }, [visible, state, today]);
}

// ── 먼저 거는 말 ──

/** 오늘 아직 열어 보지 않은 먼저 거는 말(핀 줄 문구). 쉬는 날·꺼짐이면 null. */
export function usePendingTalk(): TalkOfDay | null {
  const talk = useObservationDayStore((s) => s.talk);
  const restDay = useObservationDayStore((s) => s.restDay);
  const available = useObservationCheerAvailable();
  const today = useTodayString();
  if (!available || isRestingToday(restDay, today)) return null;
  return pendingTalk(talk, today);
}

/** 이 시각 전에는 먼저 거는 말을 정하지 않는다(조정 가능). */
export const TALK_EARLIEST_HOUR = 5;

/**
 * 메인 창은 조건이 이만큼 이어진 뒤에 정하고 알린다. 앱을 켤 때 기록 알림 창은 같은 자료를 다 읽은
 * 바로 그 순간에 뜨므로, 곧바로 정하면 알림 창이 뜨기 직전에 말이 먼저 나가 둘이 겹친다(실화면에서 잡음).
 */
export const TALK_SETTLE_MS = 3000;

function anyModalOpen(): boolean {
  return useModalCoordinatorStore.getState().entries.some((e) => e.isOpen);
}

/**
 * 한 주 정리에 보여 줄 것이 있는가 — 틀(조각 목록)이 판단한다(spec §8). 호스트가
 * `ObservationCheer/recapPieces` 의 판단을 넘긴다. 기본은 관찰 조각만 본다.
 */
export type WeeklyHasContent = (
  weekStart: string,
  observation: WeekRecap | null,
  /** 이 컴퓨터 자료(수업·할 일)만으로 만든 숫자 한 줄 — 상담은 넣지 않는다(돌아보기 spec 2-4) */
  workLine: string | null,
) => boolean;

const observationOnly: WeeklyHasContent = (_week, observation) => observation !== null;

/** 알릴 날 보여 줄 것이 없어 넘긴 주 — 다시 알리지 않되 '알린 주'로는 세지 않는다. */
export const WEEKLY_SKIPPED_KIND = 'weekly-skipped';

/** 알림 표시 key → 그 주(알린 주·넘긴 주). 한 주 정리 key 가 아니면 null. */
function weekOfNotifiedKey(key: string): string | null {
  for (const prefix of ['weekly:', `${WEEKLY_SKIPPED_KIND}:`]) {
    if (key.startsWith(prefix)) return key.slice(prefix.length);
  }
  return null;
}

/**
 * 그날 처음 화면에서 먼저 거는 말을 정한다(하루 한 번). 창마다 한 번 단다.
 * @param mode 'main' 이면 알림 창·다른 안내 창이 닫힌 뒤 토스트를 한 번 띄운다.
 */
export function useObservationTalkEngine(
  mode: 'main' | 'widget',
  showToast?: (talk: TalkOfDay) => void,
  weeklyHasContent: WeeklyHasContent = observationOnly,
): void {
  const available = useObservationCheerAvailable();
  const ready = useSchoolCalendarReady();
  const visible = useDocumentVisible();
  const restDay = useObservationDayStore((s) => s.restDay);
  const talkState = useObservationDayStore((s) => s.talk);
  const recordsLoaded = useStudentRecordsStore((s) => s.loaded);
  const observationsLoaded = useObservationStore((s) => s.loaded);
  const records = useStudentRecordsStore((s) => s.records);
  const observations = useObservationStore((s) => s.records);
  // 관찰 밖 숫자(수업·할 일)도 '알릴지'를 바꾼다 — 다 불러오기 전에 정하면 할 일만 있는 주가 넘긴 주로 굳는다.
  const todosLoaded = useTodoStore((s) => s.loaded);
  const todos = useTodoStore((s) => s.todos);
  const classesLoaded = useTeachingClassStore((s) => s.loaded);
  const progressEntries = useTeachingClassStore((s) => s.progressEntries);
  const modalOpen = useModalCoordinatorStore((s) => s.entries.some((e) => e.isOpen));
  const calendar = useSchoolCalendarDays();
  const termWindow = useObservationTermWindow();
  const regularEnd = useRegularTermEnd(termWindow.term);
  const today = useTodayString();
  const tick = useMinuteTick();

  useEffect(() => {
    if (!recordsLoaded) void useStudentRecordsStore.getState().load();
    if (!observationsLoaded) void useObservationStore.getState().load();
    if (!todosLoaded) void useTodoStore.getState().load();
    if (!classesLoaded) void useTeachingClassStore.getState().load();
  }, [recordsLoaded, observationsLoaded, todosLoaded, classesLoaded]);

  // 정하기 — 불러오기·보이기·쉬지 않음·(메인 창) 다른 창이 없음이 모두 맞을 때.
  useEffect(() => {
    void tick;
    if (!available || !ready || !visible || !recordsLoaded || !observationsLoaded) return;
    if (!todosLoaded || !classesLoaded) return;
    if (isRestingToday(restDay, today)) return;
    // 켜 둔 채 자정을 넘긴 바탕화면 위젯 창은 늘 '보인다' — 선생님이 오기 전 새벽에 정하지 않는다.
    if (new Date().getHours() < TALK_EARLIEST_HOUR) return;
    if (mode === 'main' && modalOpen) return;
    if (talkState.decidedDate === today) return;
    const decide = (): void => {
      const entries = [...homeroomEntries(records), ...subjectEntries(observations)];
      // 알린 주와 넘긴 주 모두 다시 알리지 않는다. 넘긴 주는 따로 적어 [이번 주 정리]가 열 '알린 주'와 섞지 않는다.
      const notifiedWeeks = new Set(
        talkState.notified.map((k) => weekOfNotifiedKey(k)).filter((w): w is string => w !== null),
      );
      const since = readTodoCompletionSince();
      const hasContent = (w: string): boolean =>
        weeklyHasContent(
          w,
          buildWeekRecap(w, today, entries, calendar),
          workCountLine(
            workCountItems(localWorkCounts(weekDateRange(w), today, todos, progressEntries, since)),
          ),
        );
      const candidates: TalkCandidate[] = [];
      const week = weeklyNoticeWeek(today, calendar, notifiedWeeks, hasContent);
      if (week !== null) candidates.push({ kind: 'weekly', key: week });
      if (isRetrospectNoticeDay(today, regularEnd, calendar)) {
        candidates.push({ kind: 'retrospect', key: termWindow.term });
      }
      const skipped = weeklySkippedWeek(today, calendar, hasContent);
      const handled: TalkCandidate[] =
        skipped === null ? [] : [{ kind: WEEKLY_SKIPPED_KIND, key: skipped }];
      useObservationDayStore
        .getState()
        .updateTalk((s) => decideTalk(s, today, candidates, handled));
    };
    if (mode !== 'main') {
      decide();
      return;
    }
    // 메인 창 — 조금 기다렸다가 그때도 다른 안내 창이 없으면 정한다.
    const id = setTimeout(() => {
      if (!anyModalOpen()) decide();
    }, TALK_SETTLE_MS);
    return () => clearTimeout(id);
  }, [
    tick,
    available,
    ready,
    visible,
    recordsLoaded,
    observationsLoaded,
    todosLoaded,
    classesLoaded,
    restDay,
    today,
    mode,
    modalOpen,
    talkState,
    records,
    observations,
    todos,
    progressEntries,
    calendar,
    regularEnd,
    termWindow.term,
    weeklyHasContent,
  ]);

  // 메인 창 토스트 — 한 번, 다른 안내 창이 닫힌 뒤.
  useEffect(() => {
    if (mode !== 'main' || showToast === undefined) return;
    if (!available || !visible || modalOpen || isRestingToday(restDay, today)) return;
    if (pendingTalk(talkState, today) === null || talkState.toastShown) return;
    // 위젯 창이 먼저 정해 둔 말도 앱을 켜는 순간엔 알림 창과 겹칠 수 있다 — 같은 만큼 기다린다.
    const id = setTimeout(() => {
      if (anyModalOpen()) return;
      const latest = useObservationDayStore.getState().talk;
      const pending = pendingTalk(latest, today);
      if (pending === null || latest.toastShown) return;
      useObservationDayStore.getState().updateTalk((s) => markToastShown(s, today));
      showToast(pending);
    }, TALK_SETTLE_MS);
    return () => clearTimeout(id);
  }, [mode, showToast, available, visible, modalOpen, restDay, today, talkState]);
}
