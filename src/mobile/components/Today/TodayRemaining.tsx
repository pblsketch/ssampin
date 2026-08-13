import { useEffect } from 'react';
import { useMobileTodoStore } from '@mobile/stores/useMobileTodoStore';
import { filterActive, groupByDate } from '@domain/rules/todoRules';

interface Props {
  /** 아직 출결을 입력하지 않은 수업 수 (0이면 줄이 뜨지 않는다) */
  attendanceMissingCount: number;
  /** 미입력 출결 요약 — 예: "3학년 2반 조회 · 2학년 5반 3교시" */
  attendanceMissingLabel?: string;
  onOpenAttendance: () => void;
  onOpenTodo: () => void;
}

/**
 * 홈 "오늘 남은 일".
 *
 * 왜 필요한가 — 마감이 지난 할 일이 있어도, 출결을 아직 안 넣었어도, 지금은 그 화면에
 * 직접 들어가야만 알 수 있다. 앱이 먼저 알려주는 지점이 없었다.
 *
 * 설계에서 지킨 것
 * - **남은 것만 보여준다.** 다 했으면 이 카드는 통째로 사라진다.
 *   "다 하셨어요!" 같은 칭찬이나 달성률·연속 기록은 넣지 않는다(게이미피케이션 금지).
 * - **일정 탭을 대체하지 않는다.** 오늘 급한 것만 요약하고, 전체 목록은 그대로 그 탭에 있다.
 * - 구간 나누기는 도메인 groupByDate 를 그대로 쓴다. 새로 만든 규칙이 없다.
 */
export function TodayRemaining({
  attendanceMissingCount,
  attendanceMissingLabel,
  onOpenAttendance,
  onOpenTodo,
}: Props) {
  const todos = useMobileTodoStore((s) => s.todos);
  const loadTodos = useMobileTodoStore((s) => s.load);

  useEffect(() => {
    void loadTodos();
  }, [loadTodos]);

  const active = filterActive(todos).filter((t) => !t.completed);
  const groups = groupByDate(active);
  const overdue = groups.overdue ?? [];
  const dueToday = groups.today ?? [];
  const urgentCount = overdue.length + dueToday.length;

  // 남은 게 없으면 아무것도 그리지 않는다.
  if (attendanceMissingCount === 0 && urgentCount === 0) return null;

  const todoSummary = [
    overdue.length > 0 ? `마감 지남 ${overdue.length}개` : null,
    dueToday.length > 0 ? `오늘 ${dueToday.length}개` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const todoNames = [...overdue, ...dueToday]
    .slice(0, 2)
    .map((t) => t.text)
    .join(' · ');

  return (
    <section className="px-4">
      <h3 className="text-xs font-semibold text-sp-muted mb-2 px-1">오늘 남은 일</h3>
      {/* space-y-3(12px) — 홈의 벤토 그리드가 gap-3 을 쓰므로 카드끼리는 12px 이 이 화면의
          기준이다. 처음에 space-y-2(8px)로 뒀더니 한 화면에 8·12·16px 세 종류가 섞여
          "카드 간격이 안 맞아 보인다"는 지적을 받았다. */}
      <div className="space-y-3">
        {attendanceMissingCount > 0 && (
          <button
            onClick={onOpenAttendance}
            className="w-full glass-card rounded-xl px-4 py-3 text-left active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-icon-lg text-sp-error shrink-0">
                error
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-sp-text">
                  출결 {attendanceMissingCount}건이 아직 비어 있어요
                </p>
                {attendanceMissingLabel && (
                  <p className="text-xs text-sp-muted mt-0.5 truncate">{attendanceMissingLabel}</p>
                )}
              </div>
              <span className="material-symbols-outlined text-sp-muted shrink-0">
                chevron_right
              </span>
            </div>
          </button>
        )}

        {urgentCount > 0 && (
          <button
            onClick={onOpenTodo}
            className="w-full glass-card rounded-xl px-4 py-3 text-left active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-icon-lg text-sp-warning shrink-0">
                task_alt
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-sp-text">할 일 — {todoSummary}</p>
                {todoNames && <p className="text-xs text-sp-muted mt-0.5 truncate">{todoNames}</p>}
              </div>
              <span className="material-symbols-outlined text-sp-muted shrink-0">
                chevron_right
              </span>
            </div>
          </button>
        )}
      </div>
    </section>
  );
}
