/**
 * 할 일을 일정 달력 위에 겹쳐 그리기 (2026-08-27)
 *
 * 선생님 요청 — "할 일을 월간 캘린더 형태로 보고 싶어요". 구글 캘린더가 구글 Tasks 를
 * 다루는 방식과 같다: 마감일이 있는 할 일이 그 날짜 칸에 체크 칩으로 뜨고, 칩에서
 * 바로 완료할 수 있으며, 끌어다 놓으면 마감일이 바뀐다.
 *
 * ── 이 파일 하나에 몰아 둔 이유 ────────────────────────────────────
 *
 * 일정 화면(Schedule.tsx)·달력(CalendarView.tsx)·하루 상세(DayScheduleModal.tsx)
 * 세 군데가 할 일을 필요로 하는데, 각자 할 일 저장소를 부르게 두면 "일정인데 할 일을
 * 고치는 코드"가 세 군데로 번진다. 불러오기·판정·고치기를 여기 한 곳에 모으고
 * 바깥에는 훅 하나와 조각 컴포넌트 하나만 내보낸다.
 * 온라인 교무실 부서 일정(StaffRoomPlanOverlay)이 먼저 쓴 방식이다.
 *
 * ★ 할 일을 **일정(SchoolEvent)으로 바꾸지 않는다.** 이유는 domain/rules/todoCalendarRules.ts
 *   맨 위 주석 참고 — 구글 유령 일정·내보내기 유출·일괄삭제 오작동이 한꺼번에 걸린다.
 */
import { useCallback, useEffect, useMemo } from 'react';
import type { TodoCategory } from '@domain/entities/Todo';
import type { TodoCalendarChip } from '@domain/rules/todoCalendarRules';
import {
  canMoveTodoByDrag,
  getTodoChipsByDate,
  moveTodoDueDate,
} from '@domain/rules/todoCalendarRules';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { getCategoryColors } from '@adapters/presenters/categoryPresenter';
import { toLocalDateString } from '@shared/utils/localDate';

const NO_CHIPS: ReadonlyMap<string, readonly TodoCalendarChip[]> = new Map();
const NO_CATEGORIES: readonly TodoCategory[] = [];

export interface ScheduleTodoOverlay {
  /** 선생님이 이 기능을 켜 두었는가 */
  readonly enabled: boolean;
  /** 이 달 할 일을 날짜별로 묶은 것 */
  readonly chipsByDate: ReadonlyMap<string, readonly TodoCalendarChip[]>;
  readonly categories: readonly TodoCategory[];
  /** 이 달에 그려지는 할 일 총 개수 (필터 알약에 숫자로 띄운다) */
  readonly monthCount: number;
  /** 칩의 동그라미를 눌렀을 때 — 달력에서 바로 완료/해제 */
  readonly toggleTodo: (todoId: string) => void;
  /** 칩을 끌어다 다른 날에 놓았을 때 — 마감일 변경 (되돌리기 포함) */
  readonly moveTodo: (todoId: string, dropDateKey: string) => void;
}

/**
 * 이 달 할 일을 달력에 얹을 모양으로 준비한다.
 *
 * @param monthKey "YYYY-MM"
 */
export function useScheduleTodoOverlay(monthKey: string): ScheduleTodoOverlay {
  const enabled = useSettingsStore((s) => s.settings.scheduleShowTodos ?? true);
  const includeCompleted = useSettingsStore((s) => s.settings.scheduleShowCompletedTodos === true);

  const todos = useTodoStore((s) => s.todos);
  const categories = useTodoStore((s) => s.categories);
  const loadTodos = useTodoStore((s) => s.load);
  const toggleTodoInStore = useTodoStore((s) => s.toggleTodo);
  const updateTodo = useTodoStore((s) => s.updateTodo);
  const showToast = useToastStore((s) => s.show);

  // 꺼 두었으면 저장소를 읽지도 않는다 — 안 쓰는 선생님에게는 없는 기능이어야 한다.
  // (`load` 는 이미 불러왔으면 그 자리에서 돌아오므로 중복 호출 걱정은 없다.)
  useEffect(() => {
    if (!enabled) return;
    void loadTodos();
  }, [enabled, loadTodos]);

  const chipsByDate = useMemo(() => {
    if (!enabled) return NO_CHIPS;
    return getTodoChipsByDate(todos, monthKey, toLocalDateString(), { includeCompleted });
  }, [enabled, todos, monthKey, includeCompleted]);

  const monthCount = useMemo(() => {
    let n = 0;
    for (const bucket of chipsByDate.values()) n += bucket.length;
    return n;
  }, [chipsByDate]);

  const toggleTodo = useCallback(
    (todoId: string) => {
      const target = todos.find((t) => t.id === todoId);
      if (!target) return;

      void toggleTodoInStore(todoId);

      // 반복 할 일을 끝내면 **다음 회차가 새로 생긴다**(ManageTodos.toggleTodo).
      // 달력에서는 그 새 칩이 다른 날짜에 불쑥 나타나므로, 왜 생겼는지 말해 준다.
      if (!target.completed && target.recurrence) {
        showToast(`'${target.text}' 완료 — 다음 회차를 새로 만들었습니다`, 'success');
        return;
      }
      showToast(
        target.completed ? `'${target.text}' 완료를 해제했습니다` : `'${target.text}' 완료`,
        'success',
        { label: '되돌리기', onClick: () => void toggleTodoInStore(todoId) },
        4000,
      );
    },
    [todos, toggleTodoInStore, showToast],
  );

  const moveTodo = useCallback(
    (todoId: string, dropDateKey: string) => {
      const target = todos.find((t) => t.id === todoId);
      if (!target) return;

      const check = canMoveTodoByDrag(target);
      if (!check.ok) {
        showToast(check.reason, 'info');
        return;
      }

      const moved = moveTodoDueDate(target, dropDateKey);
      if (!moved) return;

      void updateTodo(todoId, moved);

      const [, mm, dd] = dropDateKey.split('-');
      const label = `${Number(mm)}월 ${Number(dd)}일`;
      showToast(
        `'${target.text}' 마감일을 ${label}로 옮겼습니다`,
        'success',
        {
          label: '되돌리기',
          onClick: () =>
            void updateTodo(todoId, {
              dueDate: target.dueDate,
              ...(target.startDate !== undefined ? { startDate: target.startDate } : {}),
            }),
        },
        5000,
      );
    },
    [todos, updateTodo, showToast],
  );

  if (!enabled) {
    return {
      enabled: false,
      chipsByDate: NO_CHIPS,
      categories: NO_CATEGORIES,
      monthCount: 0,
      toggleTodo,
      moveTodo,
    };
  }

  return { enabled, chipsByDate, categories, monthCount, toggleTodo, moveTodo };
}

/**
 * 할 일 칩의 색.
 *
 * 지난 마감은 카테고리 색을 **덮어쓴다** — 이 화면에서 가장 먼저 눈에 띄어야 하는 정보라
 * 분류(카테고리)보다 상태(늦음)가 우선이다.
 */
export function getTodoChipColors(
  chip: TodoCalendarChip,
  categories: readonly TodoCategory[],
): { readonly chip: string; readonly dot: string; readonly text: string } {
  if (chip.overdue) {
    return { chip: 'bg-red-500/15', dot: 'bg-red-500', text: 'text-red-400' };
  }
  const found = chip.categoryId ? categories.find((c) => c.id === chip.categoryId) : undefined;
  const colors = getCategoryColors(found?.color ?? 'gray');
  return { chip: colors.chip, dot: colors.dot, text: colors.text };
}

/**
 * 하루 상세 창에 붙이는 그 날의 할 일 목록.
 *
 * 달력 칸은 두세 줄밖에 안 보여서 넘친 할 일이 `+2개 더` 뒤로 숨는다. 날짜를 눌러 연
 * 이 창에서는 **그 날 전부**를 보여 주고, 여기서도 바로 완료할 수 있게 한다.
 */
export function ScheduleDayTodos({ dateKey }: { dateKey: string }) {
  const monthKey = dateKey.slice(0, 7);
  const { enabled, chipsByDate, categories, toggleTodo } = useScheduleTodoOverlay(monthKey);

  const todays = chipsByDate.get(dateKey) ?? [];
  if (!enabled || todays.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-sp-border bg-sp-surface p-3">
      <h4 className="flex items-center gap-1.5 text-xs font-sp-semibold text-sp-muted">
        <span className="material-symbols-outlined text-icon-sm">checklist</span>할 일
        <span className="tabular-nums">{todays.length}</span>
      </h4>
      <ul className="mt-2 space-y-1">
        {todays.map((chip) => {
          const colors = getTodoChipColors(chip, categories);
          return (
            <li key={chip.todoId} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleTodo(chip.todoId)}
                aria-label={chip.completed ? `'${chip.title}' 완료 해제` : `'${chip.title}' 완료`}
                aria-pressed={chip.completed}
                className={`shrink-0 rounded-full p-0.5 transition-colors hover:bg-sp-text/10 ${
                  chip.completed ? 'text-sp-accent' : colors.text
                }`}
              >
                <span className="material-symbols-outlined text-icon-sm leading-none">
                  {chip.completed ? 'check_circle' : 'radio_button_unchecked'}
                </span>
              </button>
              <span
                className={`min-w-0 flex-1 truncate text-xs ${
                  chip.completed ? 'text-sp-muted line-through' : 'text-sp-text'
                }`}
              >
                {chip.title}
              </span>
              {chip.time && <span className="shrink-0 text-xs text-sp-muted">{chip.time}</span>}
              {chip.overdue && (
                <span className="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] text-red-400">
                  지남
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-sp-muted">
        할 일 화면에서 만든 항목입니다. 내용을 고치려면 할 일에서 열어주세요.
      </p>
    </div>
  );
}
