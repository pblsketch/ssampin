/**
 * MiniCalendarExpanded — WidgetModal 안에서 노출되는 큰 미니 캘린더 + 일정 패널.
 *
 * 좌측: 큰 월 캘린더 (날짜 + 일정 점 + 카테고리 색상)
 * 우측: 선택된 날짜의 일정 목록 + 인라인 추가 폼 + 항목별 편집/삭제
 *
 * 일정 데이터: `useEventsStore` 직접 사용 (스키마 변경 없음 — AC18 보존)
 *
 * widget-expanded-editors Plan v0.1 Phase 2A.
 *
 * 단순화 정책: EventFormModal(common/Modal 기반 portal)을 nested 로 띄우지 않고,
 * 본 컴포넌트 내부에 작은 quick-form 직접 노출. 알림·반복·교시는 본 quick-form 에서 생략 —
 * 깊은 편집은 "/schedule" 페이지(=다가오는 일정 위젯 expanded 와 분리)로 안내.
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { getCategoryInfo, getCategoryColors } from '@adapters/presenters/categoryPresenter';
import { getHolidayMapForMonth } from '@domain/rules/holidayRules';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function MiniCalendarExpanded() {
  const events = useEventsStore((s) => s.events);
  const categories = useEventsStore((s) => s.categories);
  const loaded = useEventsStore((s) => s.loaded);
  const load = useEventsStore((s) => s.load);
  const addEvent = useEventsStore((s) => s.addEvent);
  const updateEvent = useEventsStore((s) => s.updateEvent);
  const deleteEvent = useEventsStore((s) => s.deleteEvent);

  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string>(() => ymd(new Date()));
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));
  const goToday = () => {
    const today = new Date();
    setViewDate(today);
    setSelectedDate(ymd(today));
  };

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const todayStr = ymd(new Date());
    const holidayMap = getHolidayMapForMonth(year, month);

    type Day = {
      date: number;
      dateStr: string;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSunday: boolean;
      isSaturday: boolean;
      isHoliday: boolean;
      eventColors: string[];
      eventCount: number;
    };
    const days: Day[] = [];

    // 이전 달 채우기
    const prevLastDay = new Date(year, month, 0).getDate();
    for (let i = startDow - 1; i >= 0; i--) {
      const d = prevLastDay - i;
      days.push({
        date: d,
        dateStr: '',
        isCurrentMonth: false,
        isToday: false,
        isSunday: false,
        isSaturday: false,
        isHoliday: false,
        eventColors: [],
        eventCount: 0,
      });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${pad2(month + 1)}-${pad2(d)}`;
      const dow = new Date(year, month, d).getDay();
      const dayEvents = events.filter(
        (e) =>
          !e.isHidden &&
          (e.date === dateStr || (e.endDate && e.date <= dateStr && e.endDate >= dateStr)),
      );
      const colors = dayEvents
        .map((e) => {
          const info = getCategoryInfo(e.category, categories);
          return getCategoryColors(info.color).dot;
        })
        .filter((c, i, arr) => arr.indexOf(c) === i)
        .slice(0, 3);

      days.push({
        date: d,
        dateStr,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        isSunday: dow === 0,
        isSaturday: dow === 6,
        isHoliday: holidayMap.has(dateStr),
        eventColors: colors,
        eventCount: dayEvents.length,
      });
    }

    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      days.push({
        date: d,
        dateStr: '',
        isCurrentMonth: false,
        isToday: false,
        isSunday: false,
        isSaturday: false,
        isHoliday: false,
        eventColors: [],
        eventCount: 0,
      });
    }
    return days;
  }, [year, month, events, categories]);

  const selectedEvents = useMemo(() => {
    return events
      .filter((e) => !e.isHidden)
      .filter(
        (e) =>
          e.date === selectedDate ||
          (e.endDate && e.date <= selectedDate && e.endDate >= selectedDate),
      )
      .sort((a, b) => {
        const ta = a.startTime ?? a.time?.split(' - ')[0]?.trim() ?? '';
        const tb = b.startTime ?? b.time?.split(' - ')[0]?.trim() ?? '';
        if (ta && tb) return ta.localeCompare(tb);
        if (ta) return -1;
        if (tb) return 1;
        return a.title.localeCompare(b.title);
      });
  }, [selectedDate, events]);

  const handleDelete = useCallback(
    (event: SchoolEvent) => {
      void deleteEvent(event.id);
      useToastStore.getState().show(
        '일정 삭제됨',
        'success',
        {
          label: '되돌리기',
          onClick: () => {
            void addEvent({
              title: event.title,
              date: event.date,
              category: event.category,
              description: event.description,
              endDate: event.endDate,
              time: event.time,
              location: event.location,
              isDDay: event.isDDay,
              alerts: event.alerts,
              recurrence: event.recurrence,
              period: event.period,
              periodEnd: event.periodEnd,
            });
          },
        },
        5000,
      );
    },
    [deleteEvent, addEvent],
  );

  return (
    // 좁은 폭(위젯 우측 사이드 레이아웃 등)에서는 세로 스택으로 자동 전환.
    // md(768px) 이상에서만 좌(캘린더) + 우(일정 패널) split.
    <div className="flex flex-col md:flex-row h-full min-h-0 gap-4">
      {/* 좌측(또는 상단): 큰 캘린더 */}
      <div className="flex-1 min-w-0 min-h-[280px] flex flex-col bg-sp-card rounded-xl p-4">
        {/* 헤더 */}
        <div className="mb-3 flex items-center justify-between shrink-0">
          <h3 className="text-base font-bold text-sp-text flex items-center gap-1.5">
            <span>📅</span>
            {year}년 {month + 1}월
          </h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={prevMonth}
              className="min-w-6 min-h-6 inline-flex items-center justify-center rounded text-sp-muted hover:text-sp-text hover:bg-sp-surface/50 transition-colors"
              aria-label="이전 달"
            >
              <span className="material-symbols-outlined text-base">chevron_left</span>
            </button>
            <button
              type="button"
              onClick={goToday}
              className="min-h-6 px-2 py-1 text-xs rounded text-sp-text hover:bg-sp-surface/50 transition-colors"
            >
              오늘
            </button>
            <button
              type="button"
              onClick={nextMonth}
              className="min-w-6 min-h-6 inline-flex items-center justify-center rounded text-sp-muted hover:text-sp-text hover:bg-sp-surface/50 transition-colors"
              aria-label="다음 달"
            >
              <span className="material-symbols-outlined text-base">chevron_right</span>
            </button>
          </div>
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 mb-1 shrink-0">
          {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
            <div
              key={d}
              className={`text-center text-xs font-medium py-1 ${
                i === 0 ? 'text-red-400/80' : i === 6 ? 'text-blue-400/80' : 'text-sp-muted'
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* 큰 날짜 그리드 */}
        <div className="grid grid-cols-7 grid-rows-6 gap-1 flex-1 min-h-0">
          {calendarDays.map((day, idx) => {
            const isSelected = day.isCurrentMonth && day.dateStr === selectedDate;
            return (
              <button
                key={idx}
                type="button"
                disabled={!day.isCurrentMonth}
                onClick={() => {
                  if (!day.isCurrentMonth) return;
                  setSelectedDate(day.dateStr);
                  setShowAddForm(false);
                  setEditingEventId(null);
                }}
                className={`relative flex flex-col items-center justify-start pt-1 rounded-md min-w-6 min-h-6 transition-colors ${
                  !day.isCurrentMonth ? 'opacity-20' : ''
                } ${day.isCurrentMonth ? 'hover:bg-sp-accent/10 cursor-pointer' : ''} ${
                  isSelected ? 'bg-sp-accent/15 ring-1 ring-sp-accent' : ''
                }`}
              >
                <span
                  className={`text-sm flex items-center justify-center w-6 h-6 rounded-full ${
                    day.isToday
                      ? 'bg-sp-accent text-sp-accent-fg font-bold'
                      : day.isHoliday || day.isSunday
                        ? 'text-red-400'
                        : day.isSaturday
                          ? 'text-blue-400'
                          : 'text-sp-text/85'
                  }`}
                >
                  {day.date}
                </span>
                {day.eventColors.length > 0 && (
                  <div className="flex gap-0.5 mt-1">
                    {day.eventColors.map((c, i) => (
                      <div key={i} className={`w-1.5 h-1.5 rounded-full ${c}`} />
                    ))}
                  </div>
                )}
                {day.eventCount > 0 && (
                  <span className="text-[10px] text-sp-muted mt-0.5">{day.eventCount}건</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 우측(또는 하단): 일정 패널 — 좁은 폭에서는 모달 전체 폭, md+ 에서 320px 고정 */}
      <div className="w-full md:w-80 md:shrink-0 flex flex-col bg-sp-card rounded-xl p-4 min-h-0">
        <div className="mb-3 flex items-center justify-between shrink-0">
          <h3 className="text-sm font-bold text-sp-text">{selectedDate} 일정</h3>
          <button
            type="button"
            onClick={() => {
              setShowAddForm((v) => !v);
              setEditingEventId(null);
            }}
            className="min-h-6 px-2 py-1 text-xs rounded bg-sp-accent text-sp-accent-fg hover:bg-sp-accent/80 transition-colors inline-flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">add</span>새 일정
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto widget-scroll -mr-2 pr-2 space-y-2">
          {showAddForm && (
            <QuickEventForm
              mode="add"
              date={selectedDate}
              categories={categories}
              defaultCategory={categories[0]?.id ?? 'school'}
              onSubmit={async (data) => {
                await addEvent(data);
                setShowAddForm(false);
              }}
              onCancel={() => setShowAddForm(false)}
            />
          )}

          {selectedEvents.length === 0 && !showAddForm && (
            <p className="py-4 text-center text-xs text-sp-muted">일정이 없습니다</p>
          )}

          {selectedEvents.map((event) => {
            const isEditing = editingEventId === event.id;
            return isEditing ? (
              <QuickEventForm
                key={event.id}
                mode="edit"
                event={event}
                date={event.date}
                categories={categories}
                defaultCategory={event.category}
                onSubmit={async (data) => {
                  await updateEvent({
                    ...event,
                    title: data.title,
                    date: data.date,
                    category: data.category,
                    time: data.time,
                    location: data.location,
                  });
                  setEditingEventId(null);
                }}
                onCancel={() => setEditingEventId(null)}
              />
            ) : (
              <EventRow
                key={event.id}
                event={event}
                categories={categories}
                onEdit={() => {
                  setEditingEventId(event.id);
                  setShowAddForm(false);
                }}
                onDelete={() => handleDelete(event)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── 일정 행 (보기 모드) ─── */

interface EventRowProps {
  event: SchoolEvent;
  categories: ReturnType<typeof useEventsStore.getState>['categories'];
  onEdit: () => void;
  onDelete: () => void;
}
function EventRow({ event, categories, onEdit, onDelete }: EventRowProps) {
  const info = getCategoryInfo(event.category, categories);
  const colors = getCategoryColors(info.color);
  const timeLabel = event.startTime ?? event.time?.split(' - ')[0]?.trim() ?? null;

  return (
    <div className="group flex items-center gap-2 rounded-lg border border-sp-border/30 bg-sp-bg/40 hover:border-sp-accent/40 hover:bg-sp-bg/70 transition-colors px-2 py-1.5 min-h-6">
      <div className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
      {timeLabel && <span className="text-xs text-sp-accent font-mono shrink-0">{timeLabel}</span>}
      <span className="flex-1 truncate text-sm text-sp-text">{event.title}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        className="min-w-6 min-h-6 inline-flex items-center justify-center rounded text-sp-muted hover:text-sp-text hover:bg-sp-surface/50 transition-colors"
        aria-label="편집"
      >
        <span className="material-symbols-outlined text-sm">edit</span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="min-w-6 min-h-6 inline-flex items-center justify-center rounded text-sp-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
        aria-label="삭제"
      >
        <span className="material-symbols-outlined text-sm">delete</span>
      </button>
    </div>
  );
}

/* ─── 빠른 입력 폼 (추가/편집 공용) ─── */

interface QuickEventFormProps {
  mode: 'add' | 'edit';
  event?: SchoolEvent;
  date: string;
  categories: ReturnType<typeof useEventsStore.getState>['categories'];
  defaultCategory: string;
  onSubmit: (data: {
    title: string;
    date: string;
    category: string;
    time?: string;
    location?: string;
  }) => Promise<void>;
  onCancel: () => void;
}
function QuickEventForm({
  mode,
  event,
  date,
  categories,
  defaultCategory,
  onSubmit,
  onCancel,
}: QuickEventFormProps) {
  const [title, setTitle] = useState(event?.title ?? '');
  const [formDate, setFormDate] = useState(date);
  const [category, setCategory] = useState(event?.category ?? defaultCategory);
  const [time, setTime] = useState(event?.startTime ?? '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [busy, setBusy] = useState(false);

  const canSubmit = title.trim().length > 0 && !busy;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onSubmit({
        title: title.trim(),
        date: formDate,
        category,
        time: time || undefined,
        location: location.trim() || undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-sp-accent/40 bg-sp-bg/60 p-2 space-y-2">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleSubmit();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="일정 제목"
        autoFocus
        className="w-full min-h-6 rounded bg-sp-card border border-sp-border px-2 py-1.5 text-sm text-sp-text focus:outline-none focus:border-sp-accent transition-colors"
      />
      <div className="flex gap-1.5 flex-wrap">
        <input
          type="date"
          value={formDate}
          onChange={(e) => setFormDate(e.target.value)}
          className="min-h-6 rounded bg-sp-card border border-sp-border px-2 py-1 text-xs text-sp-text focus:outline-none focus:border-sp-accent transition-colors [color-scheme:dark]"
        />
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="min-h-6 rounded bg-sp-card border border-sp-border px-2 py-1 text-xs text-sp-text focus:outline-none focus:border-sp-accent transition-colors [color-scheme:dark]"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="min-h-6 rounded bg-sp-card border border-sp-border px-2 py-1 text-xs text-sp-text focus:outline-none focus:border-sp-accent transition-colors"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <input
        type="text"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="장소 (선택)"
        className="w-full min-h-6 rounded bg-sp-card border border-sp-border px-2 py-1 text-xs text-sp-text focus:outline-none focus:border-sp-accent transition-colors"
      />
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-6 px-2 py-1 text-xs rounded text-sp-muted hover:text-sp-text hover:bg-sp-surface/50 transition-colors disabled:opacity-50"
        >
          취소
        </button>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          className="min-h-6 px-3 py-1 text-xs rounded bg-sp-accent text-sp-accent-fg hover:bg-sp-accent/80 disabled:opacity-40 transition-colors"
        >
          {mode === 'add' ? '추가' : '저장'}
        </button>
      </div>
    </div>
  );
}
