import { useEffect, useState } from 'react';
import { useClock } from '@adapters/hooks/useClock';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useMemoStore } from '@adapters/stores/useMemoStore';
import { useMessageStore } from '@adapters/stores/useMessageStore';
import { getDayOfWeek, getCurrentPeriod } from '@domain/rules/periodRules';
import { calculateDDay } from '@domain/rules/ddayRules';
import { getColorsForCategory } from '@adapters/presenters/categoryPresenter';
import { WidgetContextMenu } from './WidgetContextMenu';
import { TodayClass } from '@widgets/items/TodayClass';
import { Seating } from '@widgets/items/Seating';
import { StudentRecords } from '@widgets/items/StudentRecords';
import { Meal } from '@widgets/items/Meal';
import { Memo } from '@widgets/items/Memo';
import { TodoWidget } from '@widgets/items/TodoWidget';
import type { ComponentType } from 'react';
import type { WidgetVisibleSections } from '@domain/entities/Settings';

/** 추가 위젯 카드 정의 (대시보드 카드 연동) */
const EXTRA_WIDGETS: { key: keyof WidgetVisibleSections; component: ComponentType }[] = [
  { key: 'todayClass', component: TodayClass },
  { key: 'meal', component: Meal },
  { key: 'todo', component: TodoWidget },
  { key: 'memo', component: Memo },
  { key: 'studentRecords', component: StudentRecords },
  { key: 'seating', component: Seating },
];
/** 과목명 → 텍스트 색상 클래스 */
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

/** 과목명 → 배경 색상 클래스 */
const SUBJECT_BG_CLASS: Record<string, string> = {
  국어: 'bg-yellow-500/20',
  영어: 'bg-green-500/20',
  수학: 'bg-blue-500/20',
  과학: 'bg-purple-500/20',
  사회: 'bg-orange-500/20',
  체육: 'bg-red-500/20',
  음악: 'bg-pink-500/20',
  미술: 'bg-indigo-500/20',
  창체: 'bg-teal-500/20',
  자율: 'bg-teal-500/20',
};

/** 요일 영어 키 → 한국어 */
const DAYS_KR = ['월', '화', '수', '목', '금'] as const;
type DayKr = (typeof DAYS_KR)[number];

/** 날짜 문자열 "YYYY-MM-DD" → "M/D(요일)" 형식 */
function formatEventDateWithDay(dateStr: string): string {
  const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];
  const date = new Date(dateStr + 'T00:00:00');
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dow = dayLabels[date.getDay()] ?? '';
  return `${month}/${day}(${dow})`;
}

function getSubjectColor(subject: string): string {
  return SUBJECT_COLOR_CLASS[subject] ?? 'text-slate-300';
}

function getSubjectBg(subject: string): string {
  return SUBJECT_BG_CLASS[subject] ?? '';
}

/** 오늘 날짜의 요일 인덱스(0=일) → 한국어 요일 */
function todayDowKr(): DayKr | null {
  const jsDay = new Date().getDay();
  const map: Record<number, DayKr> = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금' };
  return map[jsDay] ?? null;
}

interface ContextMenuState {
  x: number;
  y: number;
}

export function Widget() {
  const clock = useClock();
  const { classSchedule, teacherSchedule, load: loadSchedule } = useScheduleStore();
  const { settings, load: loadSettings } = useSettingsStore();
  const { load: loadTodos } = useTodoStore();
  const { events, categories, load: loadEvents } = useEventsStore();
  const { load: loadMemos } = useMemoStore();
  const { message, loadMessage } = useMessageStore();

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const vis = settings.widget.visibleSections;

  // 위젯 모드: body/html 배경을 투명하게 (Electron transparent 창이 바탕화면을 비춰보이도록)
  useEffect(() => {
    document.documentElement.style.backgroundColor = 'transparent';
    document.body.style.backgroundColor = 'transparent';
    return () => {
      document.documentElement.style.backgroundColor = '';
      document.body.style.backgroundColor = '';
    };
  }, []);

  // 데이터 로드
  useEffect(() => {
    void loadSchedule();
    void loadSettings();
    void loadTodos();
    void loadEvents();
    void loadMemos();
    void loadMessage();
  }, [loadSchedule, loadSettings, loadTodos, loadEvents, loadMemos, loadMessage]);

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
  const todayDow = getDayOfWeek(now); // '월'|'화'|... or null
  const currentPeriod = getCurrentPeriod(settings.periodTimes, now);
  const isWeekend = todayDow === null;

  // 일주일 시간표: 최대 교시 수 계산
  const maxPeriods = settings.periodTimes.length || 6;

  // 가까운 일정 (미래, max 8)
  const upcomingEvents = [...events]
    .map((ev) => ({ ev, dday: calculateDDay(ev.date, now) }))
    .filter(({ dday }) => dday >= 0)
    .sort((a, b) => a.dday - b.dday)
    .slice(0, 8);

  // 오늘 요일 (한국어)
  const todayKr = todayDowKr();

  // 메인 콘텐츠 영역 표시 여부
  const showTimetable = vis.teacherTimetable || vis.classTimetable;
  const showMainContent = showTimetable || vis.events;

  // 추가 위젯 카드 필터
  const visibleExtras = EXTRA_WIDGETS.filter(({ key }) => vis[key]);
  const showExtras = visibleExtras.length > 0;

  return (
    <>
      <div
        className="w-full h-screen backdrop-blur-md rounded-2xl shadow-2xl border border-slate-700/50 flex flex-col overflow-hidden text-slate-100 relative select-none"
        onContextMenu={handleContextMenu}
        style={{
          fontFamily: "'Noto Sans KR', sans-serif",
          backgroundColor: `rgba(15, 23, 42, ${settings.widget.opacity})`,
        }}
      >
        {/* ── 헤더 (드래그 영역) ── */}
        <div
          className={[
            'flex-shrink-0 px-6 pt-5 text-center',
            showMainContent || vis.periodBar ? 'pb-3 border-b border-slate-700/40' : 'pb-5',
          ].join(' ')}
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          onDoubleClick={handleHeaderDoubleClick}
        >
          {/* 날짜 + 시간 */}
          {vis.dateTime && (
            <div className="flex items-baseline justify-center gap-3 mb-2">
              <span className="text-slate-400 text-lg font-medium">
                {clock.date} ({clock.dayOfWeek})
              </span>
              <span className="text-4xl font-bold tracking-tight text-slate-100 leading-none">
                {clock.time}
              </span>
            </div>
          )}

          {/* 날씨 정보 필 */}
          {vis.weather && (
            <div
              className="flex justify-center flex-wrap gap-2"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-slate-800/60 rounded-full text-xs text-slate-300 border border-slate-700/40">
                ☁ 2°C~10°C
              </span>
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-slate-800/60 rounded-full text-xs text-slate-300 border border-slate-700/40">
                💧 85%
              </span>
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-slate-800/60 rounded-full text-xs text-slate-300 border border-slate-700/40">
                🍃 미세먼지 좋음
              </span>
            </div>
          )}

          {/* 전체 화면 전환 버튼 */}
          <button
            className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-slate-700/60 transition-colors text-slate-500 hover:text-slate-300"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            onClick={() => window.electronAPI?.toggleWidget()}
            title="전체 화면으로 전환"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              open_in_full
            </span>
          </button>
        </div>

        {/* ── 메시지 배너 ── */}
        {vis.message && message && (
          <div className="flex-shrink-0 mx-4 mt-3">
            <div className="bg-teal-900/50 border border-teal-500/30 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <span className="material-symbols-outlined text-teal-400 flex-shrink-0" style={{ fontSize: 16 }}>
                campaign
              </span>
              <p className="text-sm text-teal-200 leading-relaxed flex-1 truncate">{message}</p>
            </div>
          </div>
        )}

        {/* ── 메인 콘텐츠 ── */}
        {showMainContent && (
          <div className="flex-1 flex gap-3 px-4 pt-3 pb-2 min-h-0 overflow-hidden">
            {/* ─ 시간표 영역 (교사 + 학급) ─ */}
            {showTimetable && (
              <div className="flex flex-col gap-2" style={{ flex: vis.events ? '0 0 58%' : '1 1 0' }}>
                {/* 교사 시간표 */}
                {vis.teacherTimetable && (
                  <div className="flex flex-col min-h-0" style={{ flex: '1 1 0' }}>
                    <p className="text-xs font-bold text-slate-400 mb-2 tracking-wide">
                      교사 시간표
                    </p>
                    <div className="flex-1 bg-slate-800/40 rounded-xl border border-slate-700/40 overflow-hidden">
                      {isWeekend ? (
                        <div className="h-full flex items-center justify-center">
                          <p className="text-slate-500 text-sm">주말입니다</p>
                        </div>
                      ) : (
                        <table className="w-full h-full text-center" style={{ tableLayout: 'fixed' }}>
                          <thead>
                            <tr className="border-b border-slate-700/50">
                              <th className="py-2 text-xs text-slate-500 font-medium" style={{ width: '14%' }}>교시</th>
                              {DAYS_KR.map((day) => (
                                <th key={day} className={['py-2 text-xs font-semibold', day === todayKr ? 'text-amber-400' : 'text-slate-400'].join(' ')}>
                                  {day}
                                  {day === todayKr && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-amber-400 inline-block align-middle" />}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from({ length: maxPeriods }, (_, idx) => {
                              const periodNum = idx + 1;
                              const isCurrent = currentPeriod === periodNum;
                              return (
                                <tr key={periodNum} className={['border-b border-slate-700/30 last:border-0', isCurrent ? 'bg-amber-500/10' : ''].join(' ')}>
                                  <td className={['text-xs font-mono py-1.5', isCurrent ? 'text-amber-400 font-bold' : 'text-slate-500'].join(' ')}>{periodNum}</td>
                                  {DAYS_KR.map((day) => {
                                    const dayPeriods = (teacherSchedule[day] as readonly ({ subject: string; classroom: string } | null)[] | undefined) ?? [];
                                    const tp = dayPeriods[idx] ?? null;
                                    const subject = tp?.subject ?? '';
                                    const isToday = day === todayKr;
                                    const isTodayCurrent = isToday && isCurrent;
                                    return (
                                      <td key={day} className="py-1 px-0.5">
                                        {subject ? (
                                          <span
                                            className={['inline-block text-xs font-medium rounded px-1 py-0.5 leading-tight', isTodayCurrent ? 'bg-amber-500/30 text-amber-200 ring-1 ring-amber-400/50' : `${getSubjectBg(subject)} ${getSubjectColor(subject)}`].join(' ')}
                                            title={tp?.classroom || undefined}
                                          >
                                            {subject}
                                          </span>
                                        ) : (
                                          <span className="text-slate-700 text-xs">—</span>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                )}

                {/* 학급 시간표 */}
                {vis.classTimetable && (
                  <div className="flex flex-col min-h-0" style={{ flex: '1 1 0' }}>
                    <p className="text-xs font-bold text-slate-400 mb-2 tracking-wide">
                      학급 시간표
                    </p>
                    <div className="flex-1 bg-slate-800/40 rounded-xl border border-slate-700/40 overflow-hidden">
                      {isWeekend ? (
                        <div className="h-full flex items-center justify-center">
                          <p className="text-slate-500 text-sm">주말입니다</p>
                        </div>
                      ) : (
                        <table className="w-full h-full text-center" style={{ tableLayout: 'fixed' }}>
                          <thead>
                            <tr className="border-b border-slate-700/50">
                              <th className="py-2 text-xs text-slate-500 font-medium" style={{ width: '14%' }}>교시</th>
                              {DAYS_KR.map((day) => (
                                <th key={day} className={['py-2 text-xs font-semibold', day === todayKr ? 'text-amber-400' : 'text-slate-400'].join(' ')}>
                                  {day}
                                  {day === todayKr && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-amber-400 inline-block align-middle" />}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from({ length: maxPeriods }, (_, idx) => {
                              const periodNum = idx + 1;
                              const isCurrent = currentPeriod === periodNum;
                              return (
                                <tr key={periodNum} className={['border-b border-slate-700/30 last:border-0', isCurrent ? 'bg-amber-500/10' : ''].join(' ')}>
                                  <td className={['text-xs font-mono py-1.5', isCurrent ? 'text-amber-400 font-bold' : 'text-slate-500'].join(' ')}>{periodNum}</td>
                                  {DAYS_KR.map((day) => {
                                    const daySubjects = (classSchedule[day] as readonly string[] | undefined) ?? [];
                                    const subject = daySubjects[idx] ?? '';
                                    const isToday = day === todayKr;
                                    const isTodayCurrent = isToday && isCurrent;
                                    return (
                                      <td key={day} className="py-1 px-0.5">
                                        {subject ? (
                                          <span
                                            className={['inline-block text-xs font-medium rounded px-1 py-0.5 leading-tight', isTodayCurrent ? 'bg-amber-500/30 text-amber-200 ring-1 ring-amber-400/50' : `${getSubjectBg(subject)} ${getSubjectColor(subject)}`].join(' ')}
                                          >
                                            {subject}
                                          </span>
                                        ) : (
                                          <span className="text-slate-700 text-xs">—</span>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─ 학교 교육 활동 계획 ─ */}
            {vis.events && (
              <div className="flex flex-col" style={{ flex: '1 1 0' }}>
                <p className="text-xs font-bold text-slate-400 mb-2 tracking-wide">
                  학교 교육 활동 계획
                </p>
                <div
                  className="flex-1 bg-slate-800/40 rounded-xl border border-slate-700/40 overflow-y-auto"
                  style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: '#2a3548 transparent',
                  }}
                >
                  {upcomingEvents.length === 0 ? (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-slate-500 text-xs italic">다가오는 일정이 없습니다</p>
                    </div>
                  ) : (
                    <div className="p-2 space-y-1">
                      {upcomingEvents.map(({ ev, dday }) => {
                        const colors = getColorsForCategory(ev.category, categories);
                        const isToday = dday === 0;
                        return (
                          <div
                            key={ev.id}
                            className={[
                              'flex items-start gap-2 px-2 py-2 rounded-lg transition-colors',
                              isToday ? 'bg-blue-500/10 border border-blue-500/20' : 'hover:bg-slate-700/30',
                            ].join(' ')}
                          >
                            <span
                              className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${colors.dot}`}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-1.5 flex-wrap">
                                <span className="text-xs text-slate-400 font-mono flex-shrink-0">
                                  {formatEventDateWithDay(ev.date)}
                                </span>
                                {isToday && (
                                  <span className="text-xs text-blue-400 font-bold">D-Day</span>
                                )}
                                {!isToday && dday <= 7 && (
                                  <span className={`text-xs font-mono ${colors.text}`}>
                                    D-{dday}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-slate-200 font-medium leading-tight truncate mt-0.5">
                                {ev.title}
                              </p>
                              {ev.description && (
                                <p className="text-xs text-slate-400 leading-snug mt-0.5 line-clamp-2 break-words">
                                  {ev.description}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 추가 위젯 카드 그리드 ── */}
        {showExtras && (
          <div
            className={[
              'px-4 pb-2 overflow-y-auto',
              showMainContent ? '' : 'flex-1',
            ].join(' ')}
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#2a3548 transparent',
              maxHeight: showMainContent ? '40%' : undefined,
            }}
          >
            <div className="grid grid-cols-2 gap-2">
              {visibleExtras.map(({ key, component: Comp }) => (
                <div key={key} className="min-h-0">
                  <Comp />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 하단 교시 시간 정보 바 ── */}
        {vis.periodBar && (
          <div className="flex-shrink-0 px-4 pb-3">
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/40 px-4 py-2.5">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {settings.periodTimes.map((pt, idx) => {
                  const isCurrent = currentPeriod === pt.period;
                  // 점심시간 표시: 이전 교시와 현재 교시 사이에 10분 이상 차이가 있으면 점심
                  const prevPt = idx > 0 ? settings.periodTimes[idx - 1] : null;
                  const showLunch =
                    prevPt &&
                    (() => {
                      const prevEndParts = prevPt.end.split(':').map(Number);
                      const currStartParts = pt.start.split(':').map(Number);
                      const prevEndMin = (prevEndParts[0] ?? 0) * 60 + (prevEndParts[1] ?? 0);
                      const currStartMin = (currStartParts[0] ?? 0) * 60 + (currStartParts[1] ?? 0);
                      return currStartMin - prevEndMin >= 20;
                    })();

                  return (
                    <span key={pt.period} className="flex items-center gap-x-3">
                      {showLunch && (
                        <span className="text-xs text-slate-500 font-medium">
                          점심 {prevPt?.end}~{pt.start}
                        </span>
                      )}
                      <span
                        className={[
                          'text-xs whitespace-nowrap',
                          isCurrent
                            ? 'text-amber-400 font-semibold'
                            : 'text-slate-500',
                        ].join(' ')}
                      >
                        {pt.period}교시 {pt.start}~{pt.end}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        )}
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
