/**
 * 아이젠하워 4분면 분류 — 순수 규칙(WS4). 신규 저장 데이터 0(기존 priority + dueDate 재사용).
 *
 * 축:
 *  - 긴급(urgent): 마감 임박 — dueDate 가 오늘부터 URGENT_DAYS 일 이내(지난 마감 포함).
 *  - 중요(important): priority === 'high'.
 *
 * 4분면:
 *  - q1 긴급+중요(지금 하기)  - q2 중요(계획)  - q3 긴급(빠르게)  - q4 그 외(정리)
 */
import type { Todo, TodoPriority } from '@domain/entities/Todo';

export type EisenhowerQuadrant = 'q1' | 'q2' | 'q3' | 'q4';

/** 마감 임박 기준일수(오늘 포함 D-3 이내를 긴급으로 본다). */
export const URGENT_DAYS = 3;

function toMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** dueDate 까지 남은 일수(음수면 지난 마감). dueDate 없으면 null. */
export function daysUntilDue(todo: Todo, today: Date = new Date()): number | null {
  if (!todo.dueDate) return null;
  const due = new Date(todo.dueDate + 'T00:00:00');
  const diffMs = toMidnight(due).getTime() - toMidnight(today).getTime();
  return Math.round(diffMs / 86_400_000);
}

/** 마감 임박 여부(지난 마감 포함, dueDate 없으면 false). */
export function isUrgent(todo: Todo, today: Date = new Date()): boolean {
  const d = daysUntilDue(todo, today);
  return d !== null && d <= URGENT_DAYS;
}

/** 중요 여부(priority === 'high'). */
export function isImportant(todo: Todo): boolean {
  return todo.priority === 'high';
}

/** 4분면 분류. */
export function classifyQuadrant(todo: Todo, today: Date = new Date()): EisenhowerQuadrant {
  const urgent = isUrgent(todo, today);
  const important = isImportant(todo);
  if (urgent && important) return 'q1';
  if (!urgent && important) return 'q2';
  if (urgent && !important) return 'q3';
  return 'q4';
}

/** 분면별 todos 그룹(입력 순서 보존). */
export function groupByQuadrant(
  todos: readonly Todo[],
  today: Date = new Date(),
): Record<EisenhowerQuadrant, Todo[]> {
  const groups: Record<EisenhowerQuadrant, Todo[]> = { q1: [], q2: [], q3: [], q4: [] };
  for (const todo of todos) groups[classifyQuadrant(todo, today)].push(todo);
  return groups;
}

/**
 * 분면으로 드래그했을 때 적용할 변경(priority/dueDate) — 낙관적 업데이트 + 저장에 사용.
 * 중요 축: q1/q2 → high, q3/q4 → medium(= not high). 긴급 축: q1/q3 → 오늘, q2/q4 → 오늘+(URGENT_DAYS+4).
 */
export function quadrantTargetChanges(
  quadrant: EisenhowerQuadrant,
  today: Date = new Date(),
): { priority: TodoPriority; dueDate: string } {
  const important = quadrant === 'q1' || quadrant === 'q2';
  const urgent = quadrant === 'q1' || quadrant === 'q3';
  const base = toMidnight(today);
  const due = new Date(base);
  due.setDate(due.getDate() + (urgent ? 0 : URGENT_DAYS + 4));
  return { priority: important ? 'high' : 'medium', dueDate: ymd(due) };
}

/** 분면 메타(라벨·설명·강조색 토큰) — UI 표시용. */
export const QUADRANT_META: Record<
  EisenhowerQuadrant,
  { readonly title: string; readonly subtitle: string }
> = {
  q1: { title: '지금 하기', subtitle: '긴급 · 중요' },
  q2: { title: '계획하기', subtitle: '중요 · 여유' },
  q3: { title: '빠르게 처리', subtitle: '긴급 · 낮은 우선' },
  q4: { title: '천천히 / 정리', subtitle: '여유 · 낮은 우선' },
};
