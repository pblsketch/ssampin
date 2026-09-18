/**
 * 컴시간 이번 주 변동(보강·교체) → 날짜 단위 변동 항목 초안 (순수 함수).
 *
 * 컴시간 일일자료로 계산한 "요일·교시" 단위 차이를 실제 날짜가 붙은 변동 항목으로 바꾼다.
 * 학기 기본 편성표는 건드리지 않는다 — 이번 주만의 일을 편성표에 덮으면 다음 주가 틀어진다.
 *
 * ⚠️ 이 파일은 domain 순수 규칙이므로 react/zustand/adapters/usecases/infra/shared 를 import 하지 않는다.
 *    (그래서 날짜 포맷도 다른 domain 규칙들처럼 여기서 직접 만든다.)
 *
 * 주(week) 월요일 계산의 정본은 이 파일의 `weekMondayOf` 다. 되돌린 주 표식·정리·확인 흐름은
 * 각자 계산하지 말고 이 함수를 쓴다 — 두 곳이 다르게 계산하면 표식이 어긋난다.
 */
import type { TimetableOverride, TimetableOverrideKind } from '../entities/Timetable';
import type { TimetableChange } from './timetableDiff';
import { DAYS_OF_WEEK } from '../valueObjects/DayOfWeek';

/** 자동 등록 항목에 붙는 사유 문구 (사용자가 표·목록에서 출처를 알아볼 수 있게 고정한다) */
export const COMCIGAN_WEEKLY_REASON = '컴시간 변동';

/** 등록 대상 범위 — 교사 시간표 변동과 학급 시간표 변동을 따로 저장한다 */
export type WeeklyOverrideScope = 'teacher' | 'class';

/** 저장 전 초안 (id·createdAt 은 저장 계층이 붙인다) */
export interface WeeklyOverrideDraft {
  readonly date: string;
  readonly period: number;
  /** 빈 문자열 = 자습/공강 */
  readonly subject: string;
  readonly classroom?: string;
  readonly substituteTeacher?: string;
  readonly kind: TimetableOverrideKind;
  readonly scope: WeeklyOverrideScope;
  readonly reason: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toDateString(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * 그 주 월요일 날짜('YYYY-MM-DD'). 일요일은 **그 전 월요일**이 시작인 주로 본다
 * (시간표 화면의 주 계산과 같은 규칙 — 화면과 저장이 다른 주를 가리키면 안 된다).
 */
export function weekMondayOf(date: Date): string {
  const jsDay = date.getDay(); // 0=일 … 6=토
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() + mondayOffset);
  return toDateString(monday);
}

/** 토·일 여부. 주말에는 자동 등록을 하지 않는다(이번 주 자료의 주차가 미실측). */
export function isWeekendDate(date: Date): boolean {
  const jsDay = date.getDay();
  return jsDay === 0 || jsDay === 6;
}

/** 월요일 문자열 + 요일 → 실제 날짜 문자열. 월~금이 아니면 null. */
function dateOfDay(weekMonday: string, day: string): string | null {
  const idx = DAYS_OF_WEEK.indexOf(day as (typeof DAYS_OF_WEEK)[number]);
  if (idx < 0) return null;
  const parts = weekMonday.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return toDateString(new Date(y, m - 1, d + idx));
}

/** 교사 시간표 셀 표기('과목@교실' 또는 '과목') → 과목·교실 */
export function parseTeacherCellKey(key: string): { subject: string; classroom: string } {
  if (key === '') return { subject: '', classroom: '' };
  const at = key.indexOf('@');
  if (at < 0) return { subject: key, classroom: '' };
  return { subject: key.slice(0, at), classroom: key.slice(at + 1) };
}

/** 학급 시간표 셀 표기('과목/교사' 또는 '과목') → 과목·교사 */
export function parseClassCellKey(key: string): { subject: string; teacher: string } {
  if (key === '') return { subject: '', teacher: '' };
  const slash = key.indexOf('/');
  if (slash < 0) return { subject: key, teacher: '' };
  return { subject: key.slice(0, slash), teacher: key.slice(slash + 1) };
}

/**
 * 변동 유형 판정.
 * - 이번 주에 수업이 없어짐 → 자습/공강
 * - 원래 없던 수업이 생김 → 보강
 * - 과목이 다른 과목으로 바뀜 → 교체
 * 맞교환 짝(pairId)은 만들지 않는다 — 컴시간 자료에는 어느 칸끼리 맞바꾼 것인지가 없고,
 * 틀린 짝은 한 번의 삭제로 두 칸을 함께 지운다.
 */
export function inferWeeklyKind(before: string, after: string): TimetableOverrideKind {
  if (after === '') return 'cancel';
  if (before === '') return 'substitute';
  return 'swap';
}

export interface BuildWeeklyOverridesInput {
  /** 확인 시각(이 날짜가 속한 주에 등록한다) */
  readonly baseDate: Date;
  /** 교사 시간표 이번 주 변동 */
  readonly teacherChanges?: readonly TimetableChange[];
  /** 학급 시간표 이번 주 변동 */
  readonly classChanges?: readonly TimetableChange[];
  /** 저장된 교시 수 — 이 범위를 넘는 칸은 버린다 */
  readonly maxPeriods: number;
}

export interface BuildWeeklyOverridesResult {
  /** 대상 주의 월요일('YYYY-MM-DD') */
  readonly weekMonday: string;
  /** 등록할 초안. 주말이면 빈 배열 */
  readonly drafts: readonly WeeklyOverrideDraft[];
}

/**
 * 이번 주 변동 목록을 변동 항목 초안으로 바꾼다.
 * 주말(토·일)에는 빈 목록을 돌려준다 — 컴시간 이번 주 자료가 주말에 어느 주를 가리키는지
 * 실측되지 않아, 잘못된 날짜에 붙는 것을 막는다.
 */
export function buildComciganWeeklyOverrides(
  input: BuildWeeklyOverridesInput,
): BuildWeeklyOverridesResult {
  const weekMonday = weekMondayOf(input.baseDate);
  if (isWeekendDate(input.baseDate)) return { weekMonday, drafts: [] };

  const drafts: WeeklyOverrideDraft[] = [];

  const push = (change: TimetableChange, scope: WeeklyOverrideScope): void => {
    if (change.period < 1 || change.period > input.maxPeriods) return;
    const date = dateOfDay(weekMonday, change.day);
    if (!date) return;

    const kind = inferWeeklyKind(change.before, change.after);
    if (scope === 'teacher') {
      const { subject, classroom } = parseTeacherCellKey(change.after);
      drafts.push({
        date,
        period: change.period,
        subject,
        classroom,
        kind,
        scope,
        reason: COMCIGAN_WEEKLY_REASON,
      });
      return;
    }
    const { subject, teacher } = parseClassCellKey(change.after);
    drafts.push({
      date,
      period: change.period,
      subject,
      substituteTeacher: teacher,
      kind,
      scope,
      reason: COMCIGAN_WEEKLY_REASON,
    });
  };

  for (const change of input.teacherChanges ?? []) push(change, 'teacher');
  for (const change of input.classChanges ?? []) push(change, 'class');

  // 결정적 출력(날짜 → 교시 → 범위)
  return {
    weekMonday,
    drafts: drafts.sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.period - b.period || a.scope.localeCompare(b.scope),
    ),
  };
}

// ---------------------------------------------------------------------------
// 저장본과의 조정 — 컴시간발 항목만 교체하고 사용자 항목은 건드리지 않는다
// ---------------------------------------------------------------------------

/** 그 주의 마지막 등록 대상 날짜(금요일). 컴시간 격자는 월~금만 제공한다. */
export function weekFridayOf(weekMonday: string): string {
  const parts = weekMonday.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  return toDateString(new Date(y, m - 1, d + 4));
}

function isComciganMade(override: TimetableOverride): boolean {
  return override.source === 'comcigan';
}

/** 사용자가 직접 만든 항목인가 (출처 없는 기존 데이터 = 사용자 제작) */
function isUserMade(override: TimetableOverride): boolean {
  return !isComciganMade(override);
}

export interface ReconcileWeeklyInput {
  readonly existing: readonly TimetableOverride[];
  readonly weekMonday: string;
  readonly drafts: readonly WeeklyOverrideDraft[];
  /** 현재 시각 ISO (테스트 주입용) */
  readonly now: string;
  /** id 생성기 (테스트 주입용) */
  readonly idFactory: () => string;
}

export interface ReconcileWeeklyResult {
  readonly overrides: readonly TimetableOverride[];
  /** 실제로 등록한 칸 수 */
  readonly applied: number;
  /** 사용자가 직접 만든 변동이 있어 건너뛴 칸 수 */
  readonly skipped: number;
  /** 저장이 필요한지 (변화 없으면 저장하지 않는다 — 불필요한 동기화 쓰기 금지) */
  readonly changed: boolean;
}

/**
 * 그 주의 컴시간발 항목 전체를 새 결과로 교체하고, 지난 주 이전 컴시간발 항목을 정리한다.
 *
 * ⚠️ 단건 추가 경로(`upsertOverride`)를 쓰지 않는 이유: 그 규칙은 같은 날짜·교시·범위를 만나면
 * 기존 항목의 값을 갈아치운다. 그대로 쓰면 사용자가 직접 만든 변동이 사라진다.
 * 여기서는 같은 칸에 사용자 항목이 있으면 **등록을 건너뛴다**.
 */
export function reconcileComciganWeeklyOverrides(
  input: ReconcileWeeklyInput,
): ReconcileWeeklyResult {
  const { existing, weekMonday, drafts, now, idFactory } = input;
  const weekFriday = weekFridayOf(weekMonday);

  // 이 주의 컴시간발 항목은 교체 대상, 지난 주 이전 컴시간발 항목은 정리 대상.
  // 사용자 항목과 다음 주 이후 컴시간발 항목은 그대로 남긴다.
  const kept = existing.filter((o) => {
    if (isUserMade(o)) return true;
    if (o.date < weekMonday) return false;
    if (o.date <= weekFriday) return false;
    return true;
  });

  const userKeyed = new Set(
    existing.filter(isUserMade).map((o) => `${o.date}__${o.period}__${o.scope ?? 'both'}`),
  );

  const added: TimetableOverride[] = [];
  let skipped = 0;
  for (const draft of drafts) {
    // 같은 칸에 사용자 항목이 있으면 건너뛴다. 범위가 'both'인 사용자 항목은 교사·학급 양쪽에
    // 걸리므로 어느 쪽 초안이든 막는다.
    if (
      userKeyed.has(`${draft.date}__${draft.period}__${draft.scope}`) ||
      userKeyed.has(`${draft.date}__${draft.period}__both`)
    ) {
      skipped += 1;
      continue;
    }
    added.push({
      id: idFactory(),
      date: draft.date,
      period: draft.period,
      subject: draft.subject,
      ...(draft.classroom ? { classroom: draft.classroom } : {}),
      ...(draft.substituteTeacher ? { substituteTeacher: draft.substituteTeacher } : {}),
      reason: draft.reason,
      kind: draft.kind,
      scope: draft.scope,
      source: 'comcigan',
      createdAt: now,
    });
  }

  const removedCount = existing.length - kept.length;
  return {
    overrides: [...kept, ...added],
    applied: added.length,
    skipped,
    changed: removedCount > 0 || added.length > 0,
  };
}

export interface RemoveWeeklyResult {
  readonly overrides: readonly TimetableOverride[];
  readonly removed: number;
}

/** 되돌리기 — 그 주의 컴시간발 항목만 지운다. 사용자 항목은 남긴다. */
export function removeComciganWeeklyOverrides(
  existing: readonly TimetableOverride[],
  weekMonday: string,
): RemoveWeeklyResult {
  const weekFriday = weekFridayOf(weekMonday);
  const overrides = existing.filter(
    (o) => !(isComciganMade(o) && o.date >= weekMonday && o.date <= weekFriday),
  );
  return { overrides, removed: existing.length - overrides.length };
}
