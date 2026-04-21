import { getActiveDays } from '../valueObjects/DayOfWeek';
import type { WeekendDay } from '../valueObjects/DayOfWeek';
import type {
  ClassScheduleData,
  TeacherScheduleData,
  ClassPeriod,
  TeacherPeriod,
  TimetableOverride,
} from '../entities/Timetable';

/**
 * 비어있는 학급 시간표 생성 (순수 함수)
 */
export function createEmptyClassSchedule(maxPeriods: number, weekendDays?: readonly WeekendDay[]): ClassScheduleData {
  const activeDays = getActiveDays(weekendDays);
  const data: Record<string, ClassPeriod[]> = {};
  for (const day of activeDays) {
    data[day] = Array.from({ length: maxPeriods }, () => ({ subject: '', teacher: '' }));
  }
  return data as ClassScheduleData;
}

/**
 * 기존 string[] 포맷의 학급 시간표를 ClassPeriod[] 포맷으로 마이그레이션
 */
export function migrateClassScheduleData(
  raw: Record<string, readonly (string | ClassPeriod)[]>,
  weekendDays?: readonly WeekendDay[],
): ClassScheduleData {
  const activeDays = getActiveDays(weekendDays);
  const data: Record<string, ClassPeriod[]> = {};
  for (const day of activeDays) {
    const dayArr = raw[day] ?? [];
    data[day] = dayArr.map((item) => {
      if (typeof item === 'string') {
        return { subject: item, teacher: '' };
      }
      return { subject: item.subject ?? '', teacher: item.teacher ?? '' };
    });
  }
  return data as ClassScheduleData;
}

/**
 * 비어있는 교사 시간표 생성 (순수 함수)
 */
export function createEmptyTeacherSchedule(maxPeriods: number, weekendDays?: readonly WeekendDay[]): TeacherScheduleData {
  const activeDays = getActiveDays(weekendDays);
  const data: Record<string, (null)[]> = {};
  for (const day of activeDays) {
    data[day] = Array.from({ length: maxPeriods }, () => null);
  }
  return data as TeacherScheduleData;
}

// ---------------------------------------------------------------------------
// 변동(교체) 시간표 — 순수 함수들
// ---------------------------------------------------------------------------

/**
 * overrides 배열에 새 항목을 upsert한다.
 * 같은 date+period가 이미 존재하면 id는 기존 id를 유지하고 값만 교체 (updatedAt 갱신).
 * 없으면 새로 추가한다.
 *
 * @param existing  현재 overrides 배열 (불변)
 * @param input     date, period 포함 전체 필드 (id, createdAt, updatedAt 제외)
 * @param now       현재 시각 ISO 문자열 (테스트 주입용)
 * @param idFactory id 생성기 (테스트 주입용)
 */
export function upsertOverride(
  existing: readonly TimetableOverride[],
  input: Omit<TimetableOverride, 'id' | 'createdAt' | 'updatedAt'>,
  now: string,
  idFactory: () => string,
): { overrides: readonly TimetableOverride[]; replacedId: string | null } {
  // upsert 키: date + period + scope. scope가 다르면 별도 항목으로 보존.
  const inputScope = input.scope ?? 'both';
  const idx = existing.findIndex(
    (o) => o.date === input.date && o.period === input.period && (o.scope ?? 'both') === inputScope,
  );
  if (idx >= 0) {
    const prev = existing[idx]!;
    const replaced: TimetableOverride = {
      ...input,
      id: prev.id,
      createdAt: prev.createdAt,
      updatedAt: now,
    };
    const next = existing.map((o, i) => (i === idx ? replaced : o));
    return { overrides: next, replacedId: prev.id };
  }
  const created: TimetableOverride = {
    ...input,
    id: idFactory(),
    createdAt: now,
  };
  return { overrides: [...existing, created], replacedId: null };
}

/**
 * 해당 override가 주어진 scope(view)에 적용되는지 판정.
 * 기존 데이터(undefined)는 'both'로 간주 (backward compat).
 */
function appliesToScope(
  override: TimetableOverride,
  view: 'teacher' | 'class',
): boolean {
  const s = override.scope ?? 'both';
  if (s === 'both') return true;
  return s === view;
}

/** 교사용 유효 시간표 계산 (순수 함수) */
export function mergeOverridesIntoTeacherSchedule(
  base: readonly (TeacherPeriod | null)[],
  overridesForDate: readonly TimetableOverride[],
): readonly (TeacherPeriod | null)[] {
  const applicable = overridesForDate.filter((o) => appliesToScope(o, 'teacher'));
  if (applicable.length === 0) return base;
  const periods: (TeacherPeriod | null)[] = [...base];
  for (const override of applicable) {
    const idx = override.period - 1;
    if (idx < 0 || idx >= periods.length) continue;
    if (override.subject) {
      periods[idx] = {
        subject: override.subject,
        classroom: override.classroom ?? '',
      };
    } else {
      periods[idx] = null;
    }
  }
  return periods;
}

/** 학급용 유효 시간표 계산 (순수 함수) */
export function mergeOverridesIntoClassSchedule(
  base: readonly ClassPeriod[],
  overridesForDate: readonly TimetableOverride[],
): readonly ClassPeriod[] {
  const applicable = overridesForDate.filter((o) => appliesToScope(o, 'class'));
  if (applicable.length === 0) return base;
  const periods: ClassPeriod[] = [...base];
  for (const override of applicable) {
    const idx = override.period - 1;
    if (idx < 0 || idx >= periods.length) continue;
    if (override.subject) {
      periods[idx] = {
        subject: override.subject,
        teacher: base[idx]?.teacher ?? '',
      };
    } else {
      periods[idx] = { subject: '', teacher: '' };
    }
  }
  return periods;
}

/** 날짜 범위 필터 (inclusive, YYYY-MM-DD 문자열 비교) */
export function filterOverridesInRange(
  overrides: readonly TimetableOverride[],
  from: string,
  to: string,
): readonly TimetableOverride[] {
  return overrides.filter((o) => o.date >= from && o.date <= to);
}

/**
 * 같은 date+period 중복 중 가장 최신 하나만 남긴다.
 * 승자 결정 규칙:
 *   1) max(updatedAt ?? createdAt) 최신 승자
 *   2) 동률이면 id 사전순 가장 큰 항목 승자
 *   3) 그래도 동률이면 원본 배열 뒤쪽 항목 승자 (last-in-wins)
 */
export function dedupeOverridesKeepLatest(
  overrides: readonly TimetableOverride[],
): readonly TimetableOverride[] {
  const winners = new Map<string, { index: number; override: TimetableOverride }>();
  const timestampOf = (o: TimetableOverride): string => o.updatedAt ?? o.createdAt;
  overrides.forEach((o, index) => {
    const key = `${o.date}__${o.period}__${o.scope ?? 'both'}`;
    const cur = winners.get(key);
    if (!cur) {
      winners.set(key, { index, override: o });
      return;
    }
    const curTs = timestampOf(cur.override);
    const newTs = timestampOf(o);
    if (newTs > curTs) {
      winners.set(key, { index, override: o });
    } else if (newTs === curTs) {
      if (o.id > cur.override.id) {
        winners.set(key, { index, override: o });
      } else if (o.id === cur.override.id) {
        winners.set(key, { index, override: o }); // last-in-wins
      }
    }
  });
  // 원본 순서를 최대한 보존: 승자 index 오름차순 정렬
  return Array.from(winners.values())
    .sort((a, b) => a.index - b.index)
    .map((w) => w.override);
}
