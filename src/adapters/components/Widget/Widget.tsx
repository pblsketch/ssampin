import { useEffect, useRef, useState } from 'react';
import { useClock } from '@adapters/hooks/useClock';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useMemoStore } from '@adapters/stores/useMemoStore';
import { useMessageStore } from '@adapters/stores/useMessageStore';
import { getDayOfWeek, getCurrentPeriod } from '@domain/rules/periodRules';
import { calculateDDay } from '@domain/rules/ddayRules';
import { getCategoryInfo, getColorsForCategory } from '@adapters/presenters/categoryPresenter';
import { WidgetContextMenu } from './WidgetContextMenu';
import { useToastStore } from '@adapters/components/common/Toast';
import type { MemoColor } from '@domain/valueObjects/MemoColor';

/** 메모 색상 → Tailwind 클래스 맵 */
const MEMO_COLOR_CLASS: Record<MemoColor, string> = {
  yellow: 'bg-yellow-200/90 text-yellow-900',
  pink: 'bg-pink-200/90 text-pink-900',
  green: 'bg-green-200/90 text-green-900',
  blue: 'bg-blue-200/90 text-blue-900',
};

/** 과목명 → 색상 클래스 */
const SUBJECT_COLOR_CLASS: Record<string, string> = {
  국어: 'text-yellow-300',
  영어: 'text-green-300',
  수학: 'text-blue-300',
  과학: 'text-purple-300',
  사회: 'text-orange-300',
  체육: 'text-red-300',
  음악: 'text-pink-300',
  미술: 'text-indigo-300',
  창체: 'text-teal-300',
  자율: 'text-teal-300',
};

function getSubjectColor(subject: string): string {
  return SUBJECT_COLOR_CLASS[subject] ?? 'text-slate-300';
}

/** 날짜 문자열 "YYYY-MM-DD" → "MM/DD" 형식 */
function formatEventDate(dateStr: string): string {
  const parts = dateStr.split('-');
  const month = parts[1] ?? '';
  const day = parts[2] ?? '';
  return `${month}/${day}`;
}

interface ContextMenuState {
  x: number;
  y: number;
}

export function Widget() {
  const clock = useClock();
  const { classSchedule, teacherSchedule, load: loadSchedule } = useScheduleStore();
  const { settings, load: loadSettings } = useSettingsStore();
  const { todos, load: loadTodos } = useTodoStore();
  const { events, categories, load: loadEvents } = useEventsStore();
  const { memos, load: loadMemos } = useMemoStore();
  const { message, loadMessage } = useMessageStore();
  const showToast = useToastStore((state) => state.show);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<number>(650);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 데이터 로드
  useEffect(() => {
    void loadSchedule();
    void loadSettings();
    void loadTodos();
    void loadEvents();
    void loadMemos();
    void loadMessage();
  }, [loadSchedule, loadSettings, loadTodos, loadEvents, loadMemos, loadMessage]);

  // ResizeObserver로 컨테이너 높이 감지 및 스낵바 제공
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const height = entry.contentRect.height;
        setContainerHeight(height);

        // 이전 타이머 취소
        if (resizeTimeoutRef.current) {
          clearTimeout(resizeTimeoutRef.current);
        }

        // 크기 조절 멈춘 직후 Toast 알림
        resizeTimeoutRef.current = setTimeout(() => {
          let visibleSections = '위젯: 시계, 메시지, 시간표, 일정 표시';
          if (height > 600) {
            visibleSections = '위젯: 전체 정보 표시 (할 일, 메모 포함)';
          } else if (height > 500) {
            visibleSections = '위젯: 할 일 표시됨 (메모 숨김)';
          } else if (height <= 500 && height > 400) {
            visibleSections = '위젯: 기본 일정만 표시 (할 일, 메모 숨김)';
          } else if (height <= 400) {
            visibleSections = '위젯: 최소 화면 모드';
          }

          showToast(`위젯 세로 길이: ${Math.round(height)}px - ${visibleSections}`, 'info');
        }, 800);
      }
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
    };
  }, [showToast]);

  // 우클릭 컨텍스트 메뉴
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  // 더블클릭 → 전체 앱으로 전환
  const handleHeaderDoubleClick = () => {
    window.electronAPI?.toggleWidget();
  };

  // 현재 교시 계산
  const now = new Date();
  const todayDow = getDayOfWeek(now);
  const currentPeriod = getCurrentPeriod(settings.periodTimes, now);

  // 오늘 시간표 데이터 (classSchedule 우선, teacherSchedule 보조)
  const todayClassPeriods: string[] = todayDow
    ? ((classSchedule[todayDow] as string[] | undefined) ?? [])
    : [];
  const todayTeacherPeriods = todayDow
    ? (teacherSchedule[todayDow] ?? [])
    : [];

  // 높이별 표시 섹션 결정
  const showTodo = containerHeight >= 500;
  const showMemo = containerHeight > 600;
  const showMessage = containerHeight > 400;

  // 완료된 투두 카운트
  const completedCount = todos.filter((t) => t.completed).length;
  const totalCount = todos.length;

  // 가까운 일정 (미래, max 4)
  const upcomingEvents = [...events]
    .map((ev) => ({ ev, dday: calculateDDay(ev.date, now) }))
    .filter(({ dday }) => dday >= 0)
    .sort((a, b) => a.dday - b.dday)
    .slice(0, 4);

  return (
    <>
      <div
        ref={containerRef}
        className="w-full h-screen bg-[#0f172a]/80 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-700/50 flex flex-col overflow-hidden text-slate-100 relative select-none"
        onContextMenu={handleContextMenu}
        style={{ fontFamily: "'Noto Sans KR', sans-serif" }}
      >
        {/* ── 헤더 ── */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 flex-shrink-0"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          onDoubleClick={handleHeaderDoubleClick}
        >
          <div className="flex items-center gap-2">
            <span
              className="material-symbols-outlined text-blue-400"
              style={{ fontSize: 18 }}
            >
              push_pin
            </span>
            <span className="font-bold text-sm text-slate-100">쌤핀</span>
          </div>
          <button
            className="p-1 rounded-md hover:bg-slate-700/60 transition-colors text-slate-400 hover:text-slate-200"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            onClick={() => window.electronAPI?.toggleWidget()}
            title="전체 화면으로 전환"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              open_in_full
            </span>
          </button>
        </div>

        {/* ── 스크롤 컨텐츠 ── */}
        <div
          className="flex-1 overflow-y-auto widget-scrollbar"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#2a3548 transparent',
          }}
        >
          {/* 섹션 1: 날짜 / 시간 / 날씨 */}
          <div className="px-4 py-4 text-center">
            <p className="text-xs text-slate-400 mb-1">
              {clock.date} ({clock.dayOfWeek})
            </p>
            <p className="text-5xl font-bold tracking-tight text-slate-100 leading-none mb-3">
              {clock.time}
            </p>
            {/* 날씨 필 */}
            <div className="flex justify-center flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-slate-800/50 rounded-full text-xs text-slate-300">
                🌤 2~10°C
              </span>
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-slate-800/50 rounded-full text-xs text-slate-300">
                💧 85%
              </span>
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-slate-800/50 rounded-full text-xs text-slate-300">
                🍃 좋음
              </span>
            </div>
          </div>

          {/* 섹션 2: 메시지 배너 */}
          {showMessage && message && (
            <>
              <div className="mx-3 h-px bg-slate-700/50" />
              <div className="px-4 py-3">
                <div className="bg-teal-900/40 border border-teal-500/20 rounded-xl p-3">
                  <p className="text-xs text-teal-300 leading-relaxed">{message}</p>
                </div>
              </div>
            </>
          )}

          {/* 섹션 3: 시간표 */}
          <div className="mx-3 h-px bg-slate-700/50" />
          <div className="px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              시간표
            </p>
            <div className="space-y-1">
              {settings.periodTimes.map((pt, idx) => {
                const subject = todayClassPeriods[idx] ?? '';
                const teacherPeriod = todayTeacherPeriods[idx] ?? null;
                const isCurrent = currentPeriod === pt.period;
                const isEmpty = !subject;

                return (
                  <div
                    key={pt.period}
                    className={[
                      'flex items-center gap-3 px-2 py-1.5 rounded-lg transition-colors',
                      isCurrent
                        ? 'bg-amber-500/10 border border-amber-500/20'
                        : 'hover:bg-slate-800/50',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'font-mono text-xs w-4 text-right flex-shrink-0',
                        isCurrent ? 'text-amber-400' : 'text-slate-500',
                      ].join(' ')}
                    >
                      {pt.period}
                    </span>
                    <span
                      className={[
                        'flex-1 font-medium text-sm',
                        isEmpty
                          ? 'text-slate-600 italic'
                          : isCurrent
                            ? `text-amber-200 ${getSubjectColor(subject)}`
                            : `text-slate-300 ${getSubjectColor(subject)}`,
                      ].join(' ')}
                    >
                      {isEmpty ? '공강' : subject}
                    </span>
                    {teacherPeriod && (
                      <span className="text-xs text-slate-500 font-mono flex-shrink-0">
                        {teacherPeriod.classroom}
                      </span>
                    )}
                    {isCurrent && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 animate-pulse" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 섹션 4: 일정 */}
          <div className="mx-3 h-px bg-slate-700/50" />
          <div className="px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              일정
            </p>
            {upcomingEvents.length === 0 ? (
              <p className="text-xs text-slate-600 italic">다가오는 일정이 없습니다</p>
            ) : (
              <div className="space-y-1.5">
                {upcomingEvents.map(({ ev, dday }) => {
                  const colors = getColorsForCategory(ev.category, categories);
                  const catInfo = getCategoryInfo(ev.category, categories);
                  return (
                    <div
                      key={ev.id}
                      className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-800/50 transition-colors"
                    >
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot}`}
                      />
                      <span className="font-mono text-xs text-slate-500 flex-shrink-0 w-10">
                        {formatEventDate(ev.date)}
                      </span>
                      <span className="flex-1 text-sm text-slate-300 truncate">
                        {ev.title}
                      </span>
                      {ev.isDDay && dday === 0 && (
                        <span className="text-xs text-red-400 font-bold flex-shrink-0">
                          D-Day
                        </span>
                      )}
                      {dday > 0 && dday <= 7 && (
                        <span className={`text-xs font-mono flex-shrink-0 ${colors.text}`}>
                          D-{dday}
                        </span>
                      )}
                      <span className="text-xs text-slate-600 flex-shrink-0 hidden">
                        {catInfo.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 섹션 5: 할 일 */}
          {showTodo && (
            <>
              <div className="mx-3 h-px bg-slate-700/50" />
              <div className="px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    할 일
                  </p>
                  {totalCount > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                      {completedCount}/{totalCount} 완료
                    </span>
                  )}
                </div>
                {todos.length === 0 ? (
                  <p className="text-xs text-slate-600 italic">할 일이 없습니다</p>
                ) : (
                  <div className="space-y-1">
                    {todos.slice(0, 5).map((todo) => (
                      <div
                        key={todo.id}
                        className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-800/50 transition-colors"
                      >
                        <div
                          className={[
                            'w-3.5 h-3.5 rounded flex-shrink-0 mt-0.5 border',
                            todo.completed
                              ? 'bg-blue-500 border-blue-500 flex items-center justify-center'
                              : 'border-slate-600',
                          ].join(' ')}
                        >
                          {todo.completed && (
                            <span
                              className="material-symbols-outlined text-white"
                              style={{ fontSize: 10 }}
                            >
                              check
                            </span>
                          )}
                        </div>
                        <span
                          className={[
                            'text-sm leading-snug flex-1',
                            todo.completed
                              ? 'line-through text-slate-600'
                              : 'text-slate-300',
                          ].join(' ')}
                        >
                          {todo.text}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* 섹션 6: 메모 */}
          {showMemo && (
            <>
              <div className="mx-3 h-px bg-slate-700/50" />
              <div className="px-4 py-3 pb-10">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  메모
                </p>
                {memos.length === 0 ? (
                  <p className="text-xs text-slate-600 italic">메모가 없습니다</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {memos.slice(0, 2).map((memo) => (
                      <div
                        key={memo.id}
                        className={[
                          'min-h-[80px] rounded-lg shadow-sm p-2.5',
                          MEMO_COLOR_CLASS[memo.color] ?? 'bg-yellow-200/90 text-yellow-900',
                        ].join(' ')}
                      >
                        <p className="text-xs leading-relaxed line-clamp-4 break-words">
                          {memo.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* 하단 페이드 그라디언트 */}
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#0f172a]/90 to-transparent pointer-events-none rounded-b-2xl" />
      </div>

      {/* 컨텍스트 메뉴 */}
      {contextMenu && (
        <WidgetContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleCloseContextMenu}
        />
      )}
    </>
  );
}
