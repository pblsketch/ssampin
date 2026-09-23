/**
 * 관찰 기록 응원 2·3차(ADR-137) — '오늘 챙길 학생'.
 *
 * 기록 알림과 **같은 기준**(방학 날 뺀 공백 날수, 관심 학생 절반 문턱, 반 범위 빼기·관심,
 * 오래된 순 → 관심 먼저 → 이름순)으로 고르되, 그날 처음 고른 명단을 **하루 동안 고정**한다.
 * 끝이 있는 하루치 목록이다 — 기록해도 새로 채우지 않는다(선생님 부담이 오너의 첫째 걱정).
 *
 * - 담임반: 그날 처음 조건이 맞은 때 한 번, 알림 강도의 담임 인원까지.
 * - 수업반: 그날 수업이 **끝난 뒤** 처음 판단할 때 그 반에서 최대 1명. 끝난 순서대로 채우고
 *   수업반 합계에 닿으면 더 고르지 않는다. 같은 반 수업이 두 번이어도 1명뿐이다.
 * - 알림 창의 '나중에'(미루기)·건너뛰기와는 상관없다. 알림 창·윈도우 알림은 따로 고른다.
 *
 * 이 파일은 계산만 한다. 명단을 이 컴퓨터에 두고 창끼리 나눠 읽는 일은 어댑터가 한다.
 */
import type {
  LastRecordDateProvider,
  ReminderPreset,
  ReminderSettings,
  ReminderStudent,
} from '../entities/RecordReminder';
import type { TeacherPeriod } from '../entities/Timetable';
import type { TeachingClass } from '../entities/TeachingClass';
import type { PeriodTime } from '../valueObjects/PeriodTime';
import { effectiveStaleDays, rankStalestStudents } from './recordReminderRules';
import type { SchoolCalendarDays } from './schoolCalendarDays';
import { findMatchingClass } from './matchingRules';
import { parseMinutes } from './periodRules';
import { filterActiveClasses } from './teachingClassArchive';

/** 하루 인원 — 알림 강도를 따른다(숫자는 조정 가능한 기본값). */
export const TODAY_STUDENT_CAPS: Record<
  Exclude<ReminderPreset, 'custom'>,
  { readonly homeroom: number; readonly subject: number }
> = {
  light: { homeroom: 1, subject: 2 },
  normal: { homeroom: 2, subject: 3 },
  thorough: { homeroom: 3, subject: 5 },
};

/** 직접 설정일 때 수업반 합계의 최대(조정 가능). */
export const CUSTOM_SUBJECT_CAP_MAX = 6;

export function todayStudentCaps(rr: Pick<ReminderSettings, 'preset' | 'perNudge'>): {
  readonly homeroom: number;
  readonly subject: number;
} {
  if (rr.preset !== 'custom') return TODAY_STUDENT_CAPS[rr.preset];
  const per = Math.min(3, Math.max(1, Math.floor(rr.perNudge)));
  return { homeroom: per, subject: Math.min(CUSTOM_SUBJECT_CAP_MAX, per * 2) };
}

/** 오늘 챙길 학생 한 명. 담임은 `classId` 가 null. */
export interface TodayStudentPick {
  readonly classId: string | null;
  /** 담임: `Student.id` / 수업반: `studentKey` */
  readonly ref: string;
}

/** 이 컴퓨터에 두는 그날 명단. */
export interface TodayStudentsState {
  readonly date: string;
  /** 담임을 이미 골랐는가(고른 학생이 0명이어도 true) */
  readonly homeroomPicked: boolean;
  readonly homeroom: readonly string[];
  /** 수업반 — 고른 순서 */
  readonly subject: readonly TodayStudentPick[];
  /** 이미 판단한 수업반 id(고른 학생이 없어도 넣는다) */
  readonly judgedClassIds: readonly string[];
}

export function emptyTodayStudents(date: string): TodayStudentsState {
  return { date, homeroomPicked: false, homeroom: [], subject: [], judgedClassIds: [] };
}

/** 오늘 챙길 학생이 보이는 조건(spec §2) — 모두 만족해야 한다. */
export interface TodayStudentsVisibility {
  readonly cheerEnabled: boolean;
  readonly reminder: Pick<ReminderSettings, 'enabled' | 'weekdays'>;
  /** 오늘 요일(0=일) */
  readonly weekday: number;
  readonly schoolDay: boolean;
  /** 기록 알림 '전체 일시정지' 중 */
  readonly reminderPaused: boolean;
  /** 오늘은 쉴게요 중 */
  readonly resting: boolean;
}

export function isTodayStudentsVisible(v: TodayStudentsVisibility): boolean {
  if (!v.cheerEnabled || !v.reminder.enabled) return false;
  if (v.reminder.weekdays.length > 0 && !v.reminder.weekdays.includes(v.weekday)) return false;
  return v.schoolDay && !v.reminderPaused && !v.resting;
}

/** 한 반(또는 담임반)에서 고를 재료. `config` 는 그 반 범위로 좁힌 설정이다. */
export interface PickPool {
  /** 재학 중이고 빠지지 않은 학생 — id 는 ref */
  readonly roster: readonly ReminderStudent[];
  readonly provider: LastRecordDateProvider;
  readonly config: Pick<ReminderSettings, 'excludedStudentIds' | 'focusedStudentIds' | 'staleDays'>;
}

/** 공백 날수가 (관심 학생이면 절반) 문턱 이상인 학생을 기존 알림 순서로 `limit` 명까지. */
export function pickStaleRefs(
  pool: PickPool,
  limit: number,
  now: Date,
  cal: SchoolCalendarDays,
): string[] {
  if (limit <= 0) return [];
  return rankStalestStudents(pool.roster, pool.provider, pool.config, now, cal)
    .filter((r) => r.daysSinceLastRecord >= effectiveStaleDays(r.student.id, pool.config))
    .slice(0, limit)
    .map((r) => r.student.id);
}

const HHMM_RE = /^\d{1,2}:\d{2}$/;

/** 오늘 끝난 수업의 반 — 끝난 순서, 같은 반은 처음 끝난 수업 하나. */
export interface EndedLesson {
  readonly classId: string;
  /** 끝난 시각(자정 뒤 분) */
  readonly endMinutes: number;
}

/**
 * 오늘 교사 시간표(교체·보강이 반영된 그날 것)에서 `now` 까지 끝난 수업반 수업.
 * 보관한 반과 이어진 수업은 뺀다. 매핑이 안 되는 수업(공강·모호)도 뺀다.
 */
export function endedLessonsToday(
  daySlots: readonly (TeacherPeriod | null)[],
  classes: readonly TeachingClass[],
  periodTimes: readonly PeriodTime[],
  now: Date,
): EndedLesson[] {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const active = filterActiveClasses(classes);
  const byClass = new Map<string, number>();
  daySlots.forEach((slot, i) => {
    if (!slot || !slot.classroom) return;
    const pt = periodTimes.find((p) => p.period === i + 1);
    // 끝 시각을 아직 안 적은 교시(설정에서 새로 더한 교시는 빈 값이다)는 끝났다고 보지 않는다 —
    // 빈 값을 0분(자정)으로 읽으면 아침부터 그 반을 판단해 버린다.
    if (!pt || !HHMM_RE.test(pt.end)) return;
    const end = parseMinutes(pt.end);
    if (!Number.isFinite(end) || end > nowMinutes) return;
    const cls = findMatchingClass(active, slot.classroom, slot.subject);
    if (!cls) return;
    const prev = byClass.get(cls.id);
    if (prev === undefined || end < prev) byClass.set(cls.id, end);
  });
  return [...byClass.entries()]
    .map(([classId, endMinutes]) => ({ classId, endMinutes }))
    .sort((a, b) => a.endMinutes - b.endMinutes || a.classId.localeCompare(b.classId));
}

export interface AdvanceTodayInput {
  readonly today: string;
  readonly now: Date;
  readonly cal: SchoolCalendarDays;
  readonly caps: { readonly homeroom: number; readonly subject: number };
  /** 알림 대상에 담임반이 있고 명렬이 있을 때만 */
  readonly homeroom: PickPool | null;
  /** 끝난 순서의 수업반 — 알림 대상에 수업반이 있을 때만. 풀이 없으면(명렬 없음) 빼고 넘긴다. */
  readonly endedClasses: readonly { readonly classId: string; readonly pool: PickPool }[];
}

/**
 * 명단을 한 걸음 진행한다 — 날짜가 바뀌면 새로 시작하고, 이미 고른 것은 바꾸지 않는다.
 * 바뀐 것이 없으면 **같은 객체**를 돌려준다(호출자가 쓰기를 건너뛸 수 있다).
 */
export function advanceTodayStudents(
  prev: TodayStudentsState | null,
  input: AdvanceTodayInput,
): TodayStudentsState {
  const base = prev !== null && prev.date === input.today ? prev : emptyTodayStudents(input.today);
  let next = base;

  if (!next.homeroomPicked && input.homeroom !== null) {
    next = {
      ...next,
      homeroomPicked: true,
      homeroom: pickStaleRefs(input.homeroom, input.caps.homeroom, input.now, input.cal),
    };
  }

  const judged = new Set(next.judgedClassIds);
  const subject = [...next.subject];
  let changed = false;
  for (const { classId, pool } of input.endedClasses) {
    if (judged.has(classId)) continue;
    judged.add(classId);
    changed = true;
    if (subject.length >= input.caps.subject) continue;
    const [ref] = pickStaleRefs(pool, 1, input.now, input.cal);
    if (ref !== undefined) subject.push({ classId, ref });
  }
  if (changed) next = { ...next, subject, judgedClassIds: [...judged] };
  return next;
}

/**
 * 두 창이 같은 날 따로 진행한 명단을 합친다 — 이미 고른 것은 지우지 않는다.
 * 날짜가 다르면 더 늦은 날 것을 쓴다.
 */
export function mergeTodayStudents(
  a: TodayStudentsState | null,
  b: TodayStudentsState,
): TodayStudentsState {
  if (a === null || a.date !== b.date) return a !== null && a.date > b.date ? a : b;
  const homeroomPicked = a.homeroomPicked || b.homeroomPicked;
  const homeroom = a.homeroomPicked ? a.homeroom : b.homeroom;
  const subject = [...a.subject];
  const seen = new Set(subject.map((p) => p.classId));
  for (const p of b.subject) {
    if (!seen.has(p.classId)) {
      subject.push(p);
      seen.add(p.classId);
    }
  }
  const judged = [...new Set([...a.judgedClassIds, ...b.judgedClassIds])];
  return { date: a.date, homeroomPicked, homeroom, subject, judgedClassIds: judged };
}

/** 저장소에서 읽은 값이 명단 모양인가 — 깨진 값은 버린다. */
export function parseTodayStudents(value: unknown): TodayStudentsState | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v['date'] !== 'string') return null;
  const strings = (x: unknown): string[] =>
    Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : [];
  const subject: TodayStudentPick[] = [];
  if (Array.isArray(v['subject'])) {
    for (const p of v['subject'] as unknown[]) {
      if (typeof p !== 'object' || p === null) continue;
      const q = p as Record<string, unknown>;
      if (typeof q['classId'] === 'string' && typeof q['ref'] === 'string') {
        subject.push({ classId: q['classId'], ref: q['ref'] });
      }
    }
  }
  return {
    date: v['date'],
    homeroomPicked: v['homeroomPicked'] === true,
    homeroom: strings(v['homeroom']),
    subject,
    judgedClassIds: strings(v['judgedClassIds']),
  };
}

/** 로컬 날짜 'YYYY-MM-DD'(ms). */
function localDateOfMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 오늘 기록이 생긴 학생 — 기록 날짜가 오늘이거나, 오늘 저장된 기록(한 카드의 기록만 넘긴다).
 * 칩의 완료 표시에만 쓴다. 명단은 새로 채우지 않는다.
 */
export function refsRecordedToday(
  entries: readonly { readonly ref: string; readonly date: string; readonly createdAt: number }[],
  today: string,
): Set<string> {
  const out = new Set<string>();
  for (const e of entries) {
    if (e.date === today || (e.createdAt > 0 && localDateOfMs(e.createdAt) === today)) {
      out.add(e.ref);
    }
  }
  return out;
}
