/**
 * 관찰 기록 응원(ADR-135) — 화면·메인 창이 쓰는 훅 모음.
 *
 * - `useObservationLapCards`: 반 카드 뷰모델(칸 상태·머리글·종).
 * - `useMyGrass`: 내 잔디·연속 주 문구 종류.
 * - `useCheerLine`: 카드 핀 줄 — 오늘의 응원이 있으면 그것, 없으면 연속 주 문구.
 * - `useObservationLapKeeper`: **메인 창에만** 단다. 기록이 늘었을 때 새로 끝난 바퀴의 끝 지점을
 *   저장하고(이 컴퓨터에서 추가한 기록으로 끝났을 때만) 한 바퀴 응원을 한다.
 * - `useObservationCheerToasts`: 저장한 창에서 응원 토스트를 띄운다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { useLapMarkStore } from '@adapters/stores/useLapMarkStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { isRestingToday, useObservationDayStore } from '@adapters/stores/useObservationDayStore';
import { toLocalDateString } from '@shared/utils/localDate';
import {
  CHEER_EVENT,
  CHEER_STORAGE_KEY,
  isLocalObservationAdd,
  isSessionObservationAdd,
  readTodayCheerLine,
  recordLapCheer,
  type CheerLineState,
} from '@adapters/stores/observationCheerSignal';
import {
  useObservationCheerAvailable,
  useObservationTermWindow,
  useSchoolCalendarDays,
} from '@adapters/hooks/useObservationCheerContext';
import { useTodayStudentRefs } from '@adapters/hooks/useObservationDaily';
import { buildLapCards, type LapCardViewModel } from '@adapters/hooks/observationLapCards';
import { DEFAULT_REMINDER_SETTINGS } from '@domain/entities/RecordReminder';
import {
  HOMEROOM_CARD,
  homeroomEntries,
  isCountedHomeroomRecord,
  subjectCard,
  subjectEntries,
} from '@domain/rules/observationEntries';
import {
  computeStreak,
  grassDayCounts,
  pickCheerLine,
  termWeekdayColumns,
  type CheerLine,
} from '@domain/rules/observationStreak';
import { filterActiveClasses } from '@domain/rules/teachingClassArchive';
import {
  ZERO_RECORD_LINE,
  streakLine,
  termWeeksLine,
} from '@adapters/components/Dashboard/ObservationCheer/cheerMessages';

/** 응원·잔디를 보여 줄 수 있는가 — 정본은 `useObservationCheerContext`(순환 가져오기를 피해 옮김). */
export { useObservationCheerAvailable };

function homeroomTitle(className: string | undefined): string {
  const name = className?.trim() ?? '';
  return name.length > 0 ? `담임 · ${name}` : '담임반';
}

export function useObservationLapCards(): readonly LapCardViewModel[] {
  const rr = useSettingsStore((s) => s.settings.recordReminder) ?? DEFAULT_REMINDER_SETTINGS;
  const className = useSettingsStore((s) => s.settings.className);
  const students = useStudentStore((s) => s.students);
  const classes = useTeachingClassStore((s) => s.classes);
  const homeroomRecords = useStudentRecordsStore((s) => s.records);
  const observationRecords = useObservationStore((s) => s.records);
  const marks = useLapMarkStore((s) => s.marks);
  const todayStudentRefs = useTodayStudentRefs();
  const termWindow = useObservationTermWindow();

  useEffect(() => {
    void useLapMarkStore.getState().load();
    void useObservationStore.getState().load();
    void useStudentRecordsStore.getState().load();
  }, []);

  return useMemo(
    () =>
      buildLapCards({
        homeroom: students.length > 0 ? { title: homeroomTitle(className), students } : null,
        classes: filterActiveClasses(classes),
        homeroomRecords,
        observationRecords,
        reminder: rr,
        todayStudentRefs,
        marks,
        term: termWindow.term,
        termStart: termWindow.termStart,
        today: termWindow.today,
      }),
    [
      students,
      className,
      classes,
      homeroomRecords,
      observationRecords,
      rr,
      todayStudentRefs,
      marks,
      termWindow,
    ],
  );
}

export interface MyGrassDay {
  readonly date: string;
  readonly count: number;
  readonly future: boolean;
  /** 이번 학기 안의 날인가(첫 주·끝 주의 학기 밖 날은 칸을 비워 둔다) */
  readonly inTerm: boolean;
}

export interface MyGrassView {
  readonly weeks: readonly { readonly weekStart: string; readonly days: readonly MyGrassDay[] }[];
  readonly line: CheerLine;
  readonly lineText: string;
}

export function cheerLineText(line: CheerLine): string {
  if (line.kind === 'firstRecord') return ZERO_RECORD_LINE;
  if (line.kind === 'streak') return streakLine(line.weeks);
  return termWeeksLine(line.weeks);
}

/** 내 잔디 — 카드가 있든 없든 모든 관찰 기록을 센다(spec §8). */
export function useMyGrass(): MyGrassView {
  const homeroomRecords = useStudentRecordsStore((s) => s.records);
  const observationRecords = useObservationStore((s) => s.records);
  const termWindow = useObservationTermWindow();
  const calendar = useSchoolCalendarDays();

  return useMemo(() => {
    const entries = [...homeroomEntries(homeroomRecords), ...subjectEntries(observationRecords)];
    const counts = grassDayCounts(entries, termWindow.termStart, termWindow.today);
    const weeks = termWeekdayColumns(termWindow.termStart, termWindow.termEnd).map((w) => ({
      weekStart: w.weekStart,
      days: w.days.map((date) => ({
        date,
        count: counts.get(date) ?? 0,
        future: date > termWindow.today,
        inTerm: date >= termWindow.termStart && date <= termWindow.termEnd,
      })),
    }));
    const line = pickCheerLine(
      computeStreak(entries, termWindow.today, termWindow.termStart, calendar),
    );
    return { weeks, line, lineText: cheerLineText(line) };
  }, [homeroomRecords, observationRecords, termWindow, calendar]);
}

/** 오늘 남은 응원(첫 기록·한 바퀴). 없으면 null. 다른 창에서 한 응원도 따라온다. */
export function useTodayCheer(): CheerLineState | null {
  const [cheer, setCheer] = useState<CheerLineState | null>(() => readTodayCheerLine());

  useEffect(() => {
    const refresh = (): void => setCheer(readTodayCheerLine());
    const onStorage = (e: StorageEvent): void => {
      if (e.key === CHEER_STORAGE_KEY) refresh();
    };
    window.addEventListener(CHEER_EVENT, refresh);
    window.addEventListener(`${CHEER_EVENT}:line`, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CHEER_EVENT, refresh);
      window.removeEventListener(`${CHEER_EVENT}:line`, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return cheer;
}

/** 카드 핀 줄 — 오늘의 응원(있으면) 또는 연속 주 문구. */
export function useCheerLine(): {
  readonly text: string;
  readonly pinState: 'idle' | 'wave' | 'celebrate';
} {
  const grass = useMyGrass();
  const cheer = useTodayCheer();
  if (cheer !== null) return { text: cheer.message, pinState: cheer.pinState };
  return { text: grass.lineText, pinState: 'idle' };
}

/**
 * 저장한 창에서 응원 토스트를 띄운다.
 * '오늘은 쉴게요'를 누른 날은 띄우지 않는다(ADR-137) — 응원 자체(핀 줄 문구·한 번만 하는 표시)는
 * 그대로 남아, 쉬기를 풀어도 지난 응원을 뒤늦게 띄우지 않는다.
 */
export function useObservationCheerToasts(): void {
  useEffect(() => {
    const onCheer = (e: Event): void => {
      const detail = (e as CustomEvent<CheerLineState>).detail;
      if (detail === undefined) return;
      const restDay = useObservationDayStore.getState().restDay;
      if (isRestingToday(restDay, toLocalDateString(new Date()))) return;
      useToastStore.getState().showCheer(detail.message, detail.pinState);
    };
    window.addEventListener(CHEER_EVENT, onCheer);
    return () => window.removeEventListener(CHEER_EVENT, onCheer);
  }, []);
}

/**
 * 메인 창에만 단다 — **이 컴퓨터에서 관찰 기록이 새로 추가됐을 때만**, 그 기록이 들어간 카드만
 * 바퀴를 판정해, 새 끝 지점이 이 컴퓨터에서 추가한 기록이면 저장하고 응원한다(spec §5·§9).
 *
 * ★"기록이 늘었다"로 판정하면 안 된다. 빼기로 계산상 한 바퀴가 끝나 보이는 카드가 있을 때
 *   휴대폰에서 동기화된 기록이나 출결 기록이 들어와도 저장·응원해 버려, 다시 넣어도 원래대로
 *   돌아오지 않는다. 다른 반에 추가한 기록이 이 반의 바퀴를 저장해도 안 된다.
 */
export function useObservationLapKeeper(): void {
  const available = useObservationCheerAvailable();
  const cards = useObservationLapCards();
  const homeroomRecords = useStudentRecordsStore((s) => s.records);
  const observationRecords = useObservationStore((s) => s.records);
  const recordsLoaded = useStudentRecordsStore((s) => s.loaded);
  const observationsLoaded = useObservationStore((s) => s.loaded);
  // 저장된 끝 지점을 읽기 전에 판정하면 끝난 바퀴를 처음부터 다시 세게 된다.
  const lapsLoaded = useLapMarkStore((s) => s.loaded);
  const seenIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!recordsLoaded || !observationsLoaded || !lapsLoaded) return;
    const ids = new Set<string>();
    for (const r of homeroomRecords) ids.add(r.id);
    for (const r of observationRecords) ids.add(r.id);
    const prev = seenIdsRef.current;
    seenIdsRef.current = ids;
    // 처음 불러온 때는 판정하지 않는다 — 기록이 "늘어난" 것이 아니다.
    if (prev === null || !available) return;
    const newLocalIds = new Set<string>();
    for (const id of ids) {
      if (!prev.has(id) && isLocalObservationAdd(id)) newLocalIds.add(id);
    }
    if (newLocalIds.size === 0) return;
    const touchedCards = new Set<string>();
    for (const r of homeroomRecords) {
      if (newLocalIds.has(r.id) && isCountedHomeroomRecord(r)) touchedCards.add(HOMEROOM_CARD);
    }
    for (const r of observationRecords) {
      if (newLocalIds.has(r.id)) touchedCards.add(subjectCard(r.classId));
    }

    for (const card of cards) {
      if (!touchedCards.has(card.card)) continue;
      const mark = card.newMark;
      const boundaryId = card.newBoundaryRecordId;
      if (mark === null || boundaryId === null) continue;
      if (!isLocalObservationAdd(boundaryId)) continue;
      void useLapMarkStore
        .getState()
        .recordMark(mark)
        .then((changed) => {
          if (!changed) return;
          recordLapCheer(
            `${mark.card}|${mark.term}|${mark.completed}`,
            card.title,
            isSessionObservationAdd(boundaryId),
          );
        })
        .catch(() => {
          // 끝 지점 저장이 실패해도 화면은 계산대로 보인다. 다음 기록 때 다시 판정한다.
        });
    }
  }, [
    homeroomRecords,
    observationRecords,
    recordsLoaded,
    observationsLoaded,
    lapsLoaded,
    available,
    cards,
  ]);
}
