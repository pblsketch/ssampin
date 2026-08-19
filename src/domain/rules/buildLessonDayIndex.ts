/**
 * 학기 전체를 훑어 **날짜 → 그 반의 수업 교시** 색인을 만드는 규칙.
 *
 * ## 왜 어댑터가 아니라 도메인인가
 *
 * 이 계산이 화면 쪽(훅) `useMemo` 안에 있으면 **정확도도 성능도 테스트로 잡을 수 없다.**
 * 여기에 필요한 재료(`getDayOfWeek`·`mergeOverridesIntoTeacherSchedule`·`getMatchingPeriodsDetailed`)가
 * 전부 도메인이라 외부 의존 없이 내려올 수 있어, 순수 함수로 두고 단위 테스트로 잠근다.
 * 어댑터는 스토어에서 재료를 꺼내 넘기는 얇은 층만 맡는다.
 *
 * ## 성능 — 학기 100일 × 반마다 시간표 병합을 그대로 돌리면 안 된다
 *
 * `getEffectiveTeacherSchedule`은 호출할 때마다 변동 목록 전체를 훑고, 학기는 100일쯤 된다.
 * 세 가지로 줄인다:
 *
 *  - **P1** 변동(override)을 날짜별 Map으로 **한 번만** 인덱싱한다. 날짜당 전체 스캔이 사라진다.
 *  - **P2** `mergeOverridesIntoTeacherSchedule`은 적용할 변동이 없으면 **base를 참조 그대로**
 *    돌려준다(`timetableRules.ts`). 즉 반환값이 base와 같은 객체면 그날은 요일 기본 시간표와
 *    동일하다는 뜻이고, **같은 요일끼리 결과를 재사용**할 수 있다. 학기 100일 중 변동이 걸린
 *    날은 보통 한 자리 수라 병합이 100회 → 7회 + 변동일 수로 줄어든다.
 *  - **P3** 매칭 결과도 같은 근거로 요일별 캐시에 담는다. `getMatchingPeriodsDetailed`에서
 *    `date`는 오직 요일 파생에만 쓰이므로(1·2단계는 주입받은 시간표만 본다) 요일이 같으면
 *    결과가 같다.
 *
 * ## 이 색인은 "예상"이다
 *
 * 미래 날짜에는 변동 시간표가 아직 없다. 그래서 미래 구간은 **기본 시간표 기준 예상**이며,
 * 결·보강이 생기면 달라진다. 화면은 이 사실을 숨기면 안 된다.
 *
 * Clean Architecture: 외부 의존 0 — `@domain/*`만 참조한다.
 */

import { getDayOfWeek } from './periodRules';
import { mergeOverridesIntoTeacherSchedule } from './timetableRules';
import { getMatchingPeriodsDetailed, type ProgressMatchStage } from './progressMatching';
import { isTeachingClassArchived } from './teachingClassArchive';
import type {
  ClassScheduleData,
  TeacherScheduleData,
  TimetableOverride,
} from '@domain/entities/Timetable';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import type { WeekendDay } from '@domain/valueObjects/DayOfWeek';

export interface LessonDayIndexInput {
  /** 학기 시작일 'YYYY-MM-DD' (학교가 알려준 개학일). */
  readonly termStart: string;
  /** 학기 종료일 'YYYY-MM-DD' (사용자가 확인한 값). */
  readonly termEnd: string;
  /** 주말 수업 설정. */
  readonly weekendDays?: readonly WeekendDay[];
  /** 교사 주간 기본 시간표(요일 → 교시별 슬롯). */
  readonly teacherSchedule: TeacherScheduleData;
  /** 담임반 시간표 — 교사 시간표 매칭이 0건일 때의 폴백. */
  readonly classSchedule: ClassScheduleData;
  /** 변동 시간표 원본. 인덱싱은 이 함수가 한다. */
  readonly overrides: readonly TimetableOverride[];
  /** 전체 수업반 — 보관 여부 판정에 쓴다. */
  readonly classes: readonly TeachingClass[];
  /** 계산 대상 반. 화면에서 지금 보고 있는 반 하나만 넘긴다(반 개수 배수를 만들지 않는다). */
  readonly targetClassId: string;
}

export interface LessonDayEntry {
  /** 1-based 교시 번호들. */
  readonly periods: readonly number[];
  /** 어느 근거로 이 날이 들어갔는지. 2·3단계는 화면에서 구분 표시해야 한다. */
  readonly matchStage: ProgressMatchStage;
}

/**
 * 폭주 방지 상한. 한 학기는 아무리 길어도 이보다 짧다 — 날짜가 뒤집히거나 잘못된 값이
 * 들어와도 무한 루프로 가지 않게 한다.
 */
const MAX_DAYS = 400;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NO_OVERRIDES: readonly TimetableOverride[] = [];

function parseIso(value: string): Date | null {
  if (!ISO_DATE_RE.test(value)) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 학기 구간의 수업일 색인. 수업이 없는 날은 아예 담기지 않는다(키가 없으면 수업 없음).
 *
 * 빈 Map을 돌려주는 경우: 날짜 형식이 잘못됨 · 시작이 끝보다 늦음 · 대상 반이 없거나 보관됨.
 * 예외를 던지지 않는다.
 */
export function buildLessonDayIndex(
  input: LessonDayIndexInput,
): ReadonlyMap<string, LessonDayEntry> {
  const result = new Map<string, LessonDayEntry>();

  const start = parseIso(input.termStart);
  const end = parseIso(input.termEnd);
  if (start === null || end === null || start.getTime() > end.getTime()) return result;

  const target = input.classes.find((c) => c.id === input.targetClassId);
  // 보관된 반은 새 진도의 대상이 아니다 — 판정은 공용 헬퍼만 쓴다(직접 비교 금지).
  if (target === undefined || isTeachingClassArchived(target)) return result;

  // P1 — 변동을 날짜별로 한 번만 모은다.
  const overridesByDate = new Map<string, TimetableOverride[]>();
  for (const o of input.overrides) {
    const list = overridesByDate.get(o.date);
    if (list === undefined) overridesByDate.set(o.date, [o]);
    else list.push(o);
  }

  // P2·P3 — 변동이 걸리지 않은 날짜는 요일 단위로 결과를 재사용한다.
  // 값이 null이면 "그 요일엔 이 반 수업이 없다"는 뜻이며, 그것도 캐시 대상이다.
  const byDayOfWeek = new Map<string, LessonDayEntry | null>();

  const cursor = new Date(start.getTime());
  let guard = 0;

  while (cursor.getTime() <= end.getTime() && guard < MAX_DAYS) {
    guard += 1;
    const iso = toIso(cursor);
    const dayOfWeek = getDayOfWeek(cursor, input.weekendDays);

    if (dayOfWeek !== null) {
      const base = input.teacherSchedule[dayOfWeek] ?? [];
      const overridesForDate = overridesByDate.get(iso) ?? NO_OVERRIDES;
      const merged = mergeOverridesIntoTeacherSchedule(base, overridesForDate);

      // 참조가 그대로면 그날은 요일 기본 시간표와 완전히 동일하다(P2의 근거).
      const reusable = merged === base;
      const cached = reusable ? byDayOfWeek.get(dayOfWeek) : undefined;

      let entry: LessonDayEntry | null;
      if (reusable && cached !== undefined) {
        entry = cached;
      } else {
        const detailed = getMatchingPeriodsDetailed({
          date: iso,
          className: target.name,
          classSubject: target.subject,
          dayTeacherSchedule: merged,
          classSchedule: input.classSchedule,
          weekendDays: input.weekendDays,
        });
        entry =
          detailed.matchStage === null || detailed.periods.length === 0
            ? null
            : { periods: detailed.periods, matchStage: detailed.matchStage };
        if (reusable) byDayOfWeek.set(dayOfWeek, entry);
      }

      if (entry !== null) result.set(iso, entry);
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}
