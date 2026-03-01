import { useState, useEffect, useMemo, useCallback } from 'react';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import { getEventsForMonth, filterByCategory } from '@domain/rules/eventRules';
import { getCategoryColors } from '@adapters/presenters/categoryPresenter';
import { getKoreanHolidays } from '@domain/rules/holidayRules';
import { CalendarView } from './CalendarView';
import { EventList } from './EventList';
import { EventFormModal } from './EventFormModal';
import { CategoryFormModal } from './CategoryFormModal';
import { ExportModal } from './ExportModal';
import { ImportModal } from './ImportModal';

function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function Schedule() {
  const {
    events,
    categories,
    loaded,
    load,
    addEvent,
    updateEvent,
    deleteEvent,
    addCategory,
    showExportModal,
    showImportModal,
    shareFile,
    setShowExportModal,
    setShowImportModal,
    setShareFile,
    triggerImport,
    downloadTemplate,
  } = useEventsStore();

  // 현재 표시 월
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  // 선택된 날짜, 카테고리 필터
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // 모달 상태
  const [showEventModal, setShowEventModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<SchoolEvent | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  // 월 네비게이션
  const goPrevMonth = useCallback(() => {
    setMonth((prev) => {
      if (prev === 0) {
        setYear((y) => y - 1);
        return 11;
      }
      return prev - 1;
    });
    setSelectedDate(null);
  }, []);

  const goNextMonth = useCallback(() => {
    setMonth((prev) => {
      if (prev === 11) {
        setYear((y) => y + 1);
        return 0;
      }
      return prev + 1;
    });
    setSelectedDate(null);
  }, []);

  // 필터링된 이벤트
  const filteredEvents = useMemo(() => {
    let result = getEventsForMonth(events, year, month);

    if (selectedCategory) {
      result = filterByCategory(result, selectedCategory);
    }

    return result;
  }, [events, year, month, selectedCategory]);

  // 해당 월의 공휴일
  const monthHolidays = useMemo(() => {
    const allHolidays = getKoreanHolidays(year);
    const mm = month + 1;
    return allHolidays.filter((h) => {
      const hMonth = parseInt(h.date.split('-')[1]!, 10);
      return hMonth === mm;
    });
  }, [year, month]);

  // 이벤트 추가/수정 핸들러
  function handleEventSubmit(event: SchoolEvent) {
    if (editingEvent) {
      void updateEvent(event);
    } else {
      void addEvent({
        title: event.title,
        date: event.date,
        category: event.category,
        description: event.description,
        endDate: event.endDate,
        time: event.time,
        location: event.location,
        isDDay: event.isDDay,
        alerts: event.alerts ? [...event.alerts] : undefined,
        recurrence: event.recurrence,
      });
    }
    setShowEventModal(false);
    setEditingEvent(null);
  }

  function handleEditEvent(event: SchoolEvent) {
    setEditingEvent(event);
    setShowEventModal(true);
  }

  function handleDeleteEvent(id: string) {
    void deleteEvent(id);
  }

  function handleAddCategory(name: string, color: string) {
    void addCategory(name, color);
    setShowCategoryModal(false);
  }

  function handleDateSelect(date: Date) {
    setSelectedDate(date);
  }

  async function handleImportClick() {
    const file = await triggerImport();
    if (file) {
      setShareFile(file);
      setShowImportModal(true);
    }
  }

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sp-muted text-lg">로딩 중...</p>
      </div>
    );
  }

  const initialDate = selectedDate ? formatDateStr(selectedDate) : undefined;

  return (
    <div className="flex flex-col h-full -m-8">
      {/* 헤더 */}
      <header className="h-20 shrink-0 px-8 flex items-center justify-between border-b border-sp-border bg-sp-bg">
        <h2 className="text-white text-2xl font-bold flex items-center gap-3">
          <span className="text-3xl">📋</span> 일정 관리
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void downloadTemplate()}
            className="flex items-center gap-1.5 border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-surface px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">description</span>
            <span>양식 다운로드</span>
          </button>
          <button
            type="button"
            onClick={handleImportClick}
            className="flex items-center gap-1.5 border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-surface px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            <span>가져오기</span>
          </button>
          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-1.5 border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-surface px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">upload</span>
            <span>내보내기</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingEvent(null);
              setShowEventModal(true);
            }}
            className="flex items-center gap-2 bg-sp-accent hover:bg-blue-600 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-sp-accent/20"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            <span className="text-sm font-bold">일정 추가</span>
          </button>
        </div>
      </header>

      {/* 콘텐츠 */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-7xl mx-auto flex flex-col gap-6 h-full">
          {/* 카테고리 탭 */}
          <div className="flex items-center justify-between overflow-x-auto pb-2">
            <div className="flex gap-3">
              {/* 전체 버튼 */}
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className={`px-5 py-2 rounded-full text-sm font-bold shadow-sm ring-1 transition-colors ${selectedCategory === null
                  ? 'bg-slate-700 text-white ring-slate-600'
                  : 'bg-sp-card hover:bg-slate-700 text-slate-300 ring-slate-700/50'
                  }`}
              >
                전체
              </button>

              {/* 카테고리 버튼들 */}
              {categories.map((cat) => {
                const colors = getCategoryColors(cat.color);
                const isActive = selectedCategory === cat.id;

                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() =>
                      setSelectedCategory(isActive ? null : cat.id)
                    }
                    className={`px-5 py-2 rounded-full text-sm font-medium transition-colors ring-1 flex items-center gap-2 ${isActive
                      ? 'bg-slate-700 text-white ring-slate-600 font-bold'
                      : 'bg-sp-card hover:bg-slate-700 text-slate-300 ring-slate-700/50'
                      }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                    {cat.name}
                  </button>
                );
              })}
            </div>

            {/* 카테고리 추가 */}
            <button
              type="button"
              onClick={() => setShowCategoryModal(true)}
              className="text-sp-muted text-sm font-medium hover:text-sp-accent transition-colors flex items-center gap-1 shrink-0"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              카테고리 추가
            </button>
          </div>

          {/* 분할 레이아웃: 캘린더(60%) + 이벤트리스트(40%) */}
          <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
            {/* 캘린더 */}
            <div className="lg:w-[60%]">
              <CalendarView
                year={year}
                month={month}
                events={events}
                categories={categories}
                selectedDate={selectedDate}
                onSelectDate={handleDateSelect}
                onPrevMonth={goPrevMonth}
                onNextMonth={goNextMonth}
              />
            </div>

            {/* 이벤트 리스트 */}
            <div className="lg:w-[40%] min-h-0 overflow-hidden">
              <EventList
                events={filteredEvents}
                categories={categories}
                holidays={monthHolidays}
                onEdit={handleEditEvent}
                onDelete={handleDeleteEvent}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 하단 알림 바 */}
      <div className="bg-slate-800 border-t border-slate-700 h-12 flex items-center justify-between px-8 text-sm text-slate-300 shrink-0">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-yellow-400 text-[20px]">
            notifications_active
          </span>
          <p>
            알림 설정:{' '}
            <span className="font-bold text-white">30분 전, 1일 전</span>
          </p>
        </div>
        <button
          type="button"
          className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
        >
          <span className="material-symbols-outlined text-[20px]">settings</span>
        </button>
      </div>

      {/* 모달들 */}
      {showEventModal && (
        <EventFormModal
          categories={categories}
          editEvent={editingEvent}
          initialDate={initialDate}
          onSubmit={handleEventSubmit}
          onClose={() => {
            setShowEventModal(false);
            setEditingEvent(null);
          }}
        />
      )}

      {showCategoryModal && (
        <CategoryFormModal
          onSubmit={handleAddCategory}
          onClose={() => setShowCategoryModal(false)}
        />
      )}

      {showExportModal && (
        <ExportModal
          categories={categories}
          events={events}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {showImportModal && shareFile && (
        <ImportModal
          shareFile={shareFile}
          myCategories={categories}
          myEvents={events}
          onClose={() => {
            setShowImportModal(false);
            setShareFile(null);
          }}
        />
      )}
    </div>
  );
}
