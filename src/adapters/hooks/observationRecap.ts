/**
 * 관찰 기록 응원 2·3차(ADR-137) — 한 주 정리·학기 돌아보기 뷰모델 조립(순수 함수, 시험 대상).
 *
 * 모두 1차 셈 기준이다 — 출결 제외, 기록에 적은 날짜, 오늘 뒤 날짜 제외.
 * 줄 세우기 금지(ADR-134): 학생별 기록 건수·순위는 만들지 않는다. 초안 준비는 "N명 준비"와
 * 부족한 학생 번호뿐이다.
 */
import type { Student } from '@domain/entities/Student';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import type { LapMark } from '@domain/entities/ObservationLap';
import {
  HOMEROOM_CARD,
  homeroomEntries,
  isCountedHomeroomRecord,
  subjectCard,
  subjectEntries,
  type ObservationEntry,
} from '@domain/rules/observationEntries';
import {
  homeroomTiles,
  subjectTiles,
  teachingClassTitle,
} from '@domain/rules/observationCardRoster';
import { computeLap, findLapMark } from '@domain/rules/observationLaps';
import { computeStreak, grassDayCounts, termWeekdayColumns } from '@domain/rules/observationStreak';
import {
  draftReadiness,
  pastTermLapCount,
  sameSchoolYear,
  summarizeScenes,
  termDisplayName,
  type SceneSummary,
} from '@domain/rules/observationRetrospect';
import {
  weekDayCells,
  weekMetStudents,
  type WeekDayCell,
} from '@domain/rules/observationWeeklySummary';
import type { SchoolCalendarDays } from '@domain/rules/schoolCalendarDays';
import { isTeachingClassArchived } from '@domain/rules/teachingClassArchive';
import { isStudentActive } from '@domain/rules/studentActivity';
import type { LapCardViewModel } from './observationLapCards';

// ── 한 주 정리 ──

export interface WeekRecap {
  readonly weekStart: string;
  readonly cells: readonly WeekDayCell[];
  readonly metStudents: number;
}

/** 한 주 정리의 관찰 조각 — 그 주 기록이 하나도 없으면 null(조각을 그리지 않는다). */
export function buildWeekRecap(
  weekStart: string,
  today: string,
  entries: readonly ObservationEntry[],
  cal: SchoolCalendarDays,
): WeekRecap | null {
  const metStudents = weekMetStudents(entries, weekStart, today);
  if (metStudents === 0) return null;
  return { weekStart, cells: weekDayCells(weekStart, today, entries, cal), metStudents };
}

// ── 학기 돌아보기 ──

export interface GrassDay {
  readonly date: string;
  readonly count: number;
  readonly future: boolean;
  readonly inTerm: boolean;
}

export interface GrassWeek {
  readonly weekStart: string;
  readonly days: readonly GrassDay[];
}

export function buildGrassWeeks(
  entries: readonly ObservationEntry[],
  termStart: string,
  termEnd: string,
  today: string,
): GrassWeek[] {
  const until = today < termEnd ? today : termEnd;
  const counts = grassDayCounts(entries, termStart, until);
  return termWeekdayColumns(termStart, termEnd).map((w) => ({
    weekStart: w.weekStart,
    days: w.days.map((date) => ({
      date,
      count: counts.get(date) ?? 0,
      future: date > until,
      inTerm: date >= termStart && date <= termEnd,
    })),
  }));
}

export interface NotReadyStudent {
  readonly ref: string;
  readonly label: string;
  readonly displayName: string;
}

export interface RecapCard {
  readonly card: string;
  readonly contextKind: 'homeroom' | 'teaching';
  readonly contextId: string;
  readonly title: string;
  readonly completedLaps: number;
  /** 이번 학기만 — 이번 바퀴에서 아직 기록 전인 학생 수(끝낸 바퀴가 0일 때 "0번" 대신 보여 준다). 지난 학기는 null. */
  readonly remaining: number | null;
  readonly scenes: SceneSummary;
  /** 이번 학기만. 지난 학기는 null(지금 명렬과 달라졌을 수 있다). */
  readonly readiness: {
    readonly readyCount: number;
    readonly notReady: readonly NotReadyStudent[];
  } | null;
}

export interface TermRecap {
  readonly term: string;
  readonly termLabel: string;
  readonly isCurrent: boolean;
  readonly grassWeeks: readonly GrassWeek[];
  readonly recordedWeeks: number;
  readonly cards: readonly RecapCard[];
  /** 모든 카드의 끝낸 바퀴 합계(그림에 넣는 수) */
  readonly lapTotal: number;
}

interface HomeroomRecordLike {
  readonly id: string;
  readonly studentId: string;
  readonly category: string;
  readonly date: string;
  readonly createdAt?: string | number;
  readonly slots?: readonly string[];
}

interface ObservationRecordLike {
  readonly id: string;
  readonly studentId: string;
  readonly classId: string;
  readonly date: string;
  readonly createdAt?: string | number;
  readonly slots?: readonly string[];
}

export interface BuildTermRecapInput {
  readonly term: string;
  readonly termStart: string;
  readonly termEnd: string;
  readonly today: string;
  /** 지금 학기(앱이 판단한) — 지난 학기 담임 명렬을 지금 명렬로 볼 수 있는지 가른다 */
  readonly currentTerm: string;
  readonly homeroomTitle: string;
  readonly students: readonly Student[];
  /** 보관한 반까지 모두 */
  readonly classes: readonly TeachingClass[];
  readonly homeroomRecords: readonly HomeroomRecordLike[];
  readonly observationRecords: readonly ObservationRecordLike[];
  readonly marks: readonly LapMark[];
  readonly cal: SchoolCalendarDays;
  /** 이번 학기면 지금 반 카드(1차 계산 — 빼기 반영). 지난 학기면 무시. */
  readonly currentCards: readonly LapCardViewModel[];
}

function inWindow(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

/**
 * 학기 돌아보기 — 이번 학기는 지금 반 카드, 지난 학기는 **그 학기에 기록이 있던 카드**(보관한 수업반
 * 포함 — 3월에 열어도 비지 않게). 지난 학기 바퀴 수는 저장된 끝 지점 수를 기본으로, 그 학기 명렬을
 * 지금도 알 수 있을 때만(수업반은 반에 남은 명렬, 담임반은 같은 학년도일 때) 1차 계산을 더한다.
 */
export function buildTermRecap(input: BuildTermRecapInput): TermRecap {
  const isCurrent = input.term === input.currentTerm;
  const until = input.today < input.termEnd ? input.today : input.termEnd;
  const hrCounted = input.homeroomRecords.filter(
    (r) => isCountedHomeroomRecord(r) && inWindow(r.date, input.termStart, until),
  );
  const obsInTerm = input.observationRecords.filter((r) =>
    inWindow(r.date, input.termStart, until),
  );
  const allEntries = [
    ...homeroomEntries(input.homeroomRecords),
    ...subjectEntries(input.observationRecords),
  ];
  const grassWeeks = buildGrassWeeks(allEntries, input.termStart, input.termEnd, input.today);
  const recordedWeeks = computeStreak(
    allEntries,
    until,
    input.termStart,
    input.cal,
  ).termRecordedWeeks;

  const hrSceneRecords = hrCounted.map((r) => ({ ref: r.studentId, slots: r.slots }));
  const obsSceneRecords = (classId: string) =>
    obsInTerm
      .filter((r) => r.classId === classId)
      .map((r) => ({ ref: r.studentId, slots: r.slots }));

  const cards: RecapCard[] = [];
  if (isCurrent) {
    for (const c of input.currentCards) {
      const sceneRecords =
        c.contextKind === 'homeroom' ? hrSceneRecords : obsSceneRecords(c.contextId);
      const scenes = summarizeScenes(
        sceneRecords,
        c.contextKind === 'homeroom' ? 'homeroom' : 'teaching',
      );
      // 구성원은 반 카드와 같다(재학 중·빠지지 않은 학생). 이름 표시는 칸이 이미 적용했다.
      const members = c.cells.filter((cell) => cell.state !== 'excluded');
      const byRef = new Map(members.map((m) => [m.ref, m]));
      const r = draftReadiness(
        members.map((m) => m.ref),
        sceneRecords,
      );
      cards.push({
        card: c.card,
        contextKind: c.contextKind,
        contextId: c.contextId,
        title: c.title,
        completedLaps: c.completedLaps,
        remaining: c.remaining,
        scenes,
        readiness: {
          readyCount: r.readyCount,
          notReady: r.notReadyRefs.map((ref) => ({
            ref,
            label: byRef.get(ref)?.label ?? '',
            displayName: byRef.get(ref)?.displayName ?? '',
          })),
        },
      });
    }
  } else {
    // 지난 학기 — 그 학기에 관찰 기록이 있던 카드.
    if (hrCounted.length > 0) {
      const mark = findLapMark(input.marks, HOMEROOM_CARD, input.term);
      const rosterKnown = sameSchoolYear(input.term, input.currentTerm);
      const computed = rosterKnown
        ? computeLap({
            card: HOMEROOM_CARD,
            term: input.term,
            termStart: input.termStart,
            today: until,
            entries: homeroomEntries(input.homeroomRecords),
            memberRefs: homeroomTiles(input.students.filter(isStudentActive)).map((t) => t.ref),
            mark,
          }).completedLaps
        : null;
      cards.push({
        card: HOMEROOM_CARD,
        contextKind: 'homeroom',
        contextId: 'homeroom',
        title: input.homeroomTitle,
        completedLaps: pastTermLapCount(mark?.completed ?? 0, computed),
        remaining: null,
        scenes: summarizeScenes(hrSceneRecords, 'homeroom'),
        readiness: null,
      });
    }
    const classIds = [...new Set(obsInTerm.map((r) => r.classId))];
    const byId = new Map(input.classes.map((c) => [c.id, c]));
    // 반 순서는 지금 목록 순서(보관한 반은 뒤)를 따른다.
    const ordered = classIds
      .map((id) => byId.get(id))
      .filter((c): c is TeachingClass => c !== undefined)
      .sort(
        (a, b) =>
          Number(isTeachingClassArchived(a)) - Number(isTeachingClassArchived(b)) ||
          input.classes.indexOf(a) - input.classes.indexOf(b),
      );
    for (const cls of ordered) {
      const card = subjectCard(cls.id);
      const mark = findLapMark(input.marks, card, input.term);
      const members = subjectTiles(cls.students).map((t) => t.ref);
      const computed =
        members.length > 0
          ? computeLap({
              card,
              term: input.term,
              termStart: input.termStart,
              today: until,
              entries: subjectEntries(input.observationRecords.filter((r) => r.classId === cls.id)),
              memberRefs: members,
              mark,
            }).completedLaps
          : null;
      cards.push({
        card,
        contextKind: 'teaching',
        contextId: cls.id,
        title: teachingClassTitle(cls.name, cls.subject),
        completedLaps: pastTermLapCount(mark?.completed ?? 0, computed),
        remaining: null,
        scenes: summarizeScenes(obsSceneRecords(cls.id), 'teaching'),
        readiness: null,
      });
    }
  }

  return {
    term: input.term,
    termLabel: termDisplayName(input.term),
    isCurrent,
    grassWeeks,
    recordedWeeks,
    cards,
    lapTotal: cards.reduce((sum, c) => sum + c.completedLaps, 0),
  };
}
