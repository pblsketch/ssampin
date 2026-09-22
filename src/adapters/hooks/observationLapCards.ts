/**
 * 관찰 기록 응원(ADR-135) — 반 카드 뷰모델 조립(순수 함수, 시험 대상).
 *
 * 카드 화면(`ObservationCheer/*`)과 메인 창의 바퀴 훅(`useObservationLapKeeper`)이 **같은 조립**을
 * 쓴다. 칸 상태·머리글·종·새 끝 지점이 모두 여기서 나온다.
 */
import type { Student } from '@domain/entities/Student';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import type { LapMark } from '@domain/entities/ObservationLap';
import type { NameExposure, ReminderSettings } from '@domain/entities/RecordReminder';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { ObservationRecord } from '@domain/entities/Observation';
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
  subjectTiles,
  teachingClassTitle,
  type CardTile,
} from '@domain/rules/observationCardRoster';
import { computeLap, findLapMark } from '@domain/rules/observationLaps';
import {
  activeExclusionKeys,
  homeroomExclusionKey,
  subjectExclusionKey,
} from '@domain/rules/reminderExclusion';
import { daysSinceLastRecord, maskName } from '@domain/rules/recordReminderRules';
import type { SchoolCalendarDays } from '@domain/rules/schoolCalendarDays';

export type LapCellState = 'filled' | 'empty' | 'excluded';

export interface LapCellViewModel {
  readonly ref: string;
  /** 칸 글자 — "15" 또는 섞인 반의 "3-15" */
  readonly label: string;
  /** 이름 표시 설정을 적용한 이름('표시 안 함'이면 빈 문자열) */
  readonly displayName: string;
  readonly state: LapCellState;
  /** 빈칸에만 — 기록 알림이 부를 학생 */
  readonly bell: boolean;
  /** 빼기 key(누른 카드의 반 범위) */
  readonly exclusionKey: string;
  /** 빠져 있으면 다시 들어오는 날 */
  readonly excludedUntil: string | null;
}

export interface LapCardViewModel {
  /** 'homeroom' | `subject:${classId}` */
  readonly card: string;
  readonly contextKind: 'homeroom' | 'teaching';
  /** 담임은 'homeroom', 수업반은 classId */
  readonly contextId: string;
  readonly title: string;
  readonly mixed: boolean;
  readonly cells: readonly LapCellViewModel[];
  /** 구성원 수(재학 중·빠지지 않은 학생) */
  readonly memberCount: number;
  readonly remaining: number;
  readonly justFinished: boolean;
  /** 계산상 새로 끝난 바퀴(저장 여부는 바퀴 훅이 정한다) */
  readonly newMark: LapMark | null;
  readonly newBoundaryRecordId: string | null;
}

export interface BuildLapCardsInput {
  readonly homeroom: { readonly title: string; readonly students: readonly Student[] } | null;
  readonly classes: readonly TeachingClass[];
  readonly homeroomRecords: readonly StudentRecord[];
  readonly observationRecords: readonly ObservationRecord[];
  readonly reminder: ReminderSettings;
  /** 기록 알림 '전체 일시정지' 중인가 */
  readonly reminderPaused: boolean;
  readonly marks: readonly LapMark[];
  readonly term: string;
  readonly termStart: string;
  readonly today: string;
  readonly now: Date;
  readonly calendar: SchoolCalendarDays;
}

function nameFor(name: string, exposure: NameExposure): string {
  return maskName(name, exposure);
}

function buildCard(
  base: {
    card: string;
    contextKind: 'homeroom' | 'teaching';
    contextId: string;
    title: string;
    tiles: readonly CardTile[];
    entries: readonly ObservationEntry[];
    keyOf: (ref: string) => string;
    bellTarget: 'homeroom' | 'subject';
    mixed: boolean;
  },
  input: BuildLapCardsInput,
  excluded: ReadonlySet<string>,
  untilByKey: ReadonlyMap<string, string>,
): LapCardViewModel {
  const memberRefs = base.tiles.map((t) => t.ref).filter((ref) => !excluded.has(base.keyOf(ref)));
  const lap = computeLap({
    card: base.card,
    term: input.term,
    termStart: input.termStart,
    today: input.today,
    entries: base.entries,
    memberRefs,
    mark: findLapMark(input.marks, base.card, input.term),
  });

  const rr = input.reminder;
  const bellsOn = rr.enabled && !input.reminderPaused && rr.targets.includes(base.bellTarget);
  const lastByRef = bellsOn ? lastObservationDateByRef(base.entries, input.today) : null;

  const cells = base.tiles.map((tile): LapCellViewModel => {
    const key = base.keyOf(tile.ref);
    const isExcluded = excluded.has(key);
    let state: LapCellState;
    if (isExcluded) state = 'excluded';
    else if (lap.justFinished)
      state = lap.recordedBeforeBoundaryRefs.has(tile.ref) ? 'filled' : 'empty';
    else state = lap.filledRefs.has(tile.ref) ? 'filled' : 'empty';

    const bell =
      state === 'empty' &&
      !lap.justFinished &&
      lastByRef !== null &&
      daysSinceLastRecord((r) => lastByRef.get(r) ?? null, tile.ref, input.now, input.calendar) >=
        rr.staleDays;

    return {
      ref: tile.ref,
      label: tile.label,
      displayName: nameFor(tile.name, rr.nameExposure),
      state,
      bell,
      exclusionKey: key,
      excludedUntil: isExcluded ? (untilByKey.get(key) ?? null) : null,
    };
  });

  return {
    card: base.card,
    contextKind: base.contextKind,
    contextId: base.contextId,
    title: base.title,
    mixed: base.mixed,
    cells,
    memberCount: memberRefs.length,
    remaining: lap.remaining,
    justFinished: lap.justFinished,
    newMark: lap.newMark,
    newBoundaryRecordId: lap.newBoundaryRecordId,
  };
}

/** 담임반(명렬이 있으면) + 보관하지 않은 수업반 순서로 카드를 만든다. */
export function buildLapCards(input: BuildLapCardsInput): LapCardViewModel[] {
  const excluded = activeExclusionKeys(input.reminder, input.today);
  const untilByKey = new Map<string, string>();
  for (const ex of input.reminder.exclusions ?? []) {
    if (input.today <= ex.until) untilByKey.set(ex.key, ex.until);
  }

  const cards: LapCardViewModel[] = [];
  if (input.homeroom !== null) {
    const tiles = homeroomTiles(input.homeroom.students);
    if (tiles.length > 0) {
      cards.push(
        buildCard(
          {
            card: HOMEROOM_CARD,
            contextKind: 'homeroom',
            contextId: 'homeroom',
            title: input.homeroom.title,
            tiles,
            entries: homeroomEntries(input.homeroomRecords),
            keyOf: homeroomExclusionKey,
            bellTarget: 'homeroom',
            mixed: false,
          },
          input,
          excluded,
          untilByKey,
        ),
      );
    }
  }

  const obs = subjectEntries(input.observationRecords);
  for (const cls of input.classes) {
    const tiles = subjectTiles(cls.students);
    if (tiles.length === 0) continue;
    const card = subjectCard(cls.id);
    cards.push(
      buildCard(
        {
          card,
          contextKind: 'teaching',
          contextId: cls.id,
          title: teachingClassTitle(cls.name, cls.subject),
          tiles,
          entries: obs.filter((e) => e.card === card),
          keyOf: (ref) => subjectExclusionKey(cls.id, ref),
          bellTarget: 'subject',
          mixed: tiles.some((t) => t.label.includes('-')),
        },
        input,
        excluded,
        untilByKey,
      ),
    );
  }
  return cards;
}
