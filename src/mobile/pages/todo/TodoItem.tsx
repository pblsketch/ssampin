import { useEffect, useMemo, useState } from 'react';
import { PRIORITY_CONFIG, calcDDay } from './priorityConfig';
import { useMobileStaffContactStore } from '@mobile/stores/useMobileStaffContactStore';
import { isCheckDue } from '@domain/rules/todoCheckRules';
import { toLocalDateString } from '@shared/utils/localDate';
import type { Todo, TodoRelatedPerson } from '@domain/entities/Todo';

/**
 * 관련인 이름 — **글자만, 읽기 전용.**
 *
 * 붙이고 떼는 것은 데스크톱 쌤핀에서만 한다. 여기서도 고칠 수 있게 하면 같은 항목을
 * 두 곳에서 고쳐 어느 쪽이 맞는지 알 수 없게 된다(연락처 화면이 이미 같은 이유로 읽기 전용이다).
 *
 * ★ 정본은 연락처다. `staffId` 로 지금 이름을 찾고, 할 일에 저장된 이름은 연락처에서
 *   지워졌을 때만 쓰는 폴백이다. **여기서 저장을 다시 하지 않는다.**
 */
function RelatedStaffNames({ related }: { related: readonly TodoRelatedPerson[] }) {
  const contacts = useMobileStaffContactStore((s) => s.contacts);
  const load = useMobileStaffContactStore((s) => s.load);

  // 연락처를 미리 읽어 두는 곳이 없어서, 이걸 빠뜨리면 살아 있는 교직원이 전부
  // 저장해 둔 옛 이름으로 보인다. store 에 중복 방지 가드가 있어 여러 번 불러도 안전하다.
  useEffect(() => {
    void load();
  }, [load]);

  const names = useMemo(
    () =>
      related.map((person) => {
        const contact = contacts.find((c) => c.id === person.staffId);
        return { staffId: person.staffId, name: contact?.name ?? person.nameSnapshot };
      }),
    [related, contacts],
  );

  if (names.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-sp-muted">
      <span className="material-symbols-outlined text-icon-sm">badge</span>
      {names.map((n) => n.name).join(', ')}
    </span>
  );
}

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleSubTask: (todoId: string, subTaskId: string) => void;
}

export function TodoItem({ todo, onToggle, onDelete, onToggleSubTask }: TodoItemProps) {
  const [expanded, setExpanded] = useState(false);
  const priority = todo.priority ?? 'none';
  const priorityCfg = PRIORITY_CONFIG[priority];
  const dday = todo.dueDate ? calcDDay(todo.dueDate) : null;
  const checkDue = todo.checkAt !== undefined && isCheckDue(todo, toLocalDateString());
  const relatedStaff = todo.relatedStaff ?? [];
  const subTasks = todo.subTasks ?? [];
  const hasSubTasks = subTasks.length > 0;
  const completedCount = subTasks.filter((st) => st.completed).length;

  return (
    <li
      className={`border-b border-black/5 dark:border-white/5 transition-opacity ${todo.completed ? 'opacity-40' : ''}`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        {/* 체크박스 */}
        <button
          onClick={() => onToggle(todo.id)}
          className="shrink-0 flex items-center justify-center"
          style={{ minWidth: 44, minHeight: 44 }}
          aria-label={todo.completed ? '완료 취소' : '완료'}
        >
          <div
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
              todo.completed
                ? 'bg-sp-accent border-sp-accent'
                : 'border-sp-border hover:border-sp-accent'
            }`}
          >
            {todo.completed && (
              <svg
                className="w-3.5 h-3.5 text-sp-accent-fg"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="2,6 5,9 10,3" />
              </svg>
            )}
          </div>
        </button>

        {/* 텍스트 + 배지 */}
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm leading-snug break-words ${
              todo.completed ? 'line-through text-sp-muted' : 'text-sp-text'
            }`}
          >
            {todo.text}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {/* 우선순위 배지 (none 제외) */}
            {priority !== 'none' && (
              <span className={`inline-flex items-center gap-0.5 text-xs ${priorityCfg.color}`}>
                {priorityCfg.icon && (
                  <span className="material-symbols-outlined text-icon-sm">{priorityCfg.icon}</span>
                )}
                {priorityCfg.label}
              </span>
            )}
            {/* D-Day 배지 */}
            {dday && <span className={`text-xs font-medium ${dday.colorClass}`}>{dday.label}</span>}
            {/* 다시 확인할 날 — 마감일과 다른 개념이라 아이콘을 따로 붙인다.
                오늘이거나 이미 지났으면 눈에 띄게. 데스크톱 목록과 같은 규칙을 쓴다. */}
            {todo.checkAt && (
              <span
                title={`다시 확인할 날 ${todo.checkAt}`}
                className={`inline-flex items-center gap-0.5 text-xs ${
                  checkDue ? 'text-sp-accent font-medium' : 'text-sp-muted'
                }`}
              >
                <span className="material-symbols-outlined text-icon-sm">event_repeat</span>
                {todo.checkAt.slice(5)}
              </span>
            )}
            {/* 관련인 — 이름만 보여준다. 편집은 데스크톱에서만. */}
            {relatedStaff.length > 0 && <RelatedStaffNames related={relatedStaff} />}
            {/* 하위 할일 배지 */}
            {hasSubTasks && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(!expanded);
                }}
                className="text-xs text-sp-muted hover:text-sp-accent flex items-center gap-0.5"
              >
                <svg
                  className="w-3 h-3"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <polyline points={expanded ? '3,5 6,8 9,5' : '5,3 8,6 5,9'} />
                </svg>
                {completedCount}/{subTasks.length}
              </button>
            )}
          </div>
        </div>

        {/* 삭제 버튼 */}
        <button
          onClick={() => onDelete(todo.id)}
          className="shrink-0 flex items-center justify-center text-sp-muted hover:text-sp-error transition-colors"
          style={{ minWidth: 44, minHeight: 44 }}
          aria-label="삭제"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="2,4 14,4" />
            <path d="M6,4V2h4v2" />
            <rect x="3" y="4" width="10" height="10" rx="1" />
            <line x1="6" y1="7" x2="6" y2="11" />
            <line x1="10" y1="7" x2="10" y2="11" />
          </svg>
        </button>
      </div>

      {/* 하위 할일 목록 */}
      {hasSubTasks && expanded && (
        <div className="px-4 pb-2 pl-14">
          <ul className="space-y-1">
            {subTasks.map((st) => (
              <li key={st.id} className="flex items-center gap-2">
                <button
                  onClick={() => onToggleSubTask(todo.id, st.id)}
                  className="shrink-0 flex items-center justify-center"
                  style={{ minWidth: 32, minHeight: 32 }}
                >
                  <div
                    className={`w-4 h-4 rounded border-[1.5px] flex items-center justify-center transition-colors ${st.completed ? 'bg-sp-accent/70 border-sp-accent/70' : 'border-sp-border hover:border-sp-accent'}`}
                  >
                    {st.completed && (
                      <svg
                        className="w-2.5 h-2.5 text-white"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="2,6 5,9 10,3" />
                      </svg>
                    )}
                  </div>
                </button>
                <span
                  className={`text-xs leading-snug ${st.completed ? 'line-through text-sp-muted' : 'text-sp-text/80'}`}
                >
                  {st.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
