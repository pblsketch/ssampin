/**
 * 한 주 정리·학기 돌아보기의 **관찰 밖 숫자 한 줄**을 화면 자료로 엮는다(돌아보기 spec 2·3).
 * 계산은 `@domain/rules/recapWorkCounts` 가 하고, 여기서는 기간·반 이름·안내 문구만 붙인다.
 */
import type { ProgressEntry } from '@domain/entities/CurriculumProgress';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import type { Todo } from '@domain/entities/Todo';
import {
  clampRangeToToday,
  completedLessonsByClass,
  countCompletedLessons,
  countCompletedTodos,
  isPartialTodoTerm,
  type DateRange,
  type WorkCounts,
} from '@domain/rules/recapWorkCounts';
import { addDaysIso } from '@domain/rules/schoolCalendarDays';
import { filterActiveClasses, filterArchivedClasses } from '@domain/rules/teachingClassArchive';

/** 월요일 시작 한 주(월~일). */
export function weekDateRange(weekStart: string): DateRange {
  return { start: weekStart, end: addDaysIso(weekStart, 6) };
}

/** 이 컴퓨터에 있는 자료(수업·할 일)만으로 센 숫자. 상담은 서버에서 따로 가져오므로 null. */
export function localWorkCounts(
  range: DateRange,
  today: string,
  todos: readonly Todo[],
  entries: readonly ProgressEntry[],
  since: string | null,
): WorkCounts {
  const r = clampRangeToToday(range, today);
  if (r === null) return { lessons: 0, todos: 0, consultations: null };
  return {
    lessons: countCompletedLessons(entries, r),
    todos: countCompletedTodos(todos, r, since),
    consultations: null,
  };
}

export interface ClassLessonCount {
  readonly classId: string;
  readonly name: string;
  readonly count: number;
}

/**
 * 반별 완료 차시 — 수업반 목록 순서(보관하지 않은 반 먼저, 보관한 반은 뒤), 0인 반은 뺀다.
 * 이름이 같은 반이 둘이면 과목을 붙여 가른다(예: 3학년 5반 국어·통합과학).
 */
export function classLessonCounts(
  entries: readonly ProgressEntry[],
  range: DateRange,
  today: string,
  classes: readonly TeachingClass[],
): ClassLessonCount[] {
  const r = clampRangeToToday(range, today);
  if (r === null) return [];
  const byClass = completedLessonsByClass(entries, r);
  const ordered = [...filterActiveClasses(classes), ...filterArchivedClasses(classes)];
  const nameCount = new Map<string, number>();
  for (const c of ordered) nameCount.set(c.name, (nameCount.get(c.name) ?? 0) + 1);
  const out: ClassLessonCount[] = [];
  for (const c of ordered) {
    const count = byClass.get(c.id) ?? 0;
    if (count === 0) continue;
    const dup = (nameCount.get(c.name) ?? 0) > 1 && c.subject.trim().length > 0;
    out.push({ classId: c.id, name: dup ? `${c.name} ${c.subject}` : c.name, count });
  }
  return out;
}

function monthDay(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${m ?? ''}월 ${d ?? ''}일`;
}

/**
 * 학기 중간부터 센 '끝낸 할 일' 안내(spec 3-3). 끝낸 할 일이 0이거나 온전한 학기면 null.
 * 기록 시작일을 읽을 수 없으면 날짜 없이 말한다.
 */
export function todoCountNote(
  termStart: string,
  since: string | null,
  todos: number,
): string | null {
  if (todos === 0 || !isPartialTodoTerm(termStart, since)) return null;
  return since === null
    ? '끝낸 할 일은 이 기능이 생긴 뒤부터 센 수예요'
    : `끝낸 할 일은 ${monthDay(since)}부터 센 수예요`;
}
