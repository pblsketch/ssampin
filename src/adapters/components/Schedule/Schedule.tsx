import { useState, useEffect, useMemo, useCallback } from 'react';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import { getEventsForMonth, filterByCategory } from '@domain/rules/eventRules';
import { getCategoryColors } from '@adapters/presenters/categoryPresenter';
import { getKoreanHolidays } from '@domain/rules/holidayRules';
import { CalendarView } from './CalendarView';
import { EventList } from './EventList';
import { EventFormModal } from './EventFormModal';
import { CategoryManagementModal } from './CategoryManagementModal';
import { ExportModal } from './ExportModal';
import { ImportModal } from './ImportModal';
import { DayScheduleModal } from './DayScheduleModal';
import { YearView } from './YearView';
import { SemesterView } from './SemesterView';
import { BulkDeleteByCategoryModal } from './BulkDeleteByCategoryModal';
import { BulkDeleteByDateRangeModal } from './BulkDeleteByDateRangeModal';
import { useCalendarSyncStore } from '@adapters/stores/useCalendarSyncStore';
import { useNeisScheduleStore } from '@adapters/stores/useNeisScheduleStore';
import { GoogleBadge } from '@adapters/components/Calendar/GoogleBadge';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { NeisSchedulePanel } from './NeisSchedulePanel';
import { useToastStore } from '@adapters/components/common/Toast';
import { FormatHint } from '../common/FormatHint';

type ScheduleView = 'month' | 'semester' | 'year';
type SourceFilter = 'all' | 'ssampin' | 'google' | 'neis';

const VIEW_LABELS: Record<ScheduleView, string> = {
  month: '월간',
  semester: '학기',
  year: '연간',
};

function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function Schedule() {
  const { track } = useAnalytics();
  const showToast = useToastStore((s) => s.show);
  const {
    events,
    categories,
    loaded,
    load,
    addEvent,
    updateEvent,
    deleteEvent,
    deleteManyEvents,
    deleteEventsByCategory,
    deleteEventsByDateRange,
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

  // 뷰 모드
  const [view, setView] = useState<ScheduleView>('month');
  const [semester, setSemester] = useState<'first' | 'second'>(() => {
    const m = new Date().getMonth();
    return m >= 2 && m <= 7 ? 'first' : 'second';
  });

  // 선택된 날짜, 카테고리 필터, 소스 필터
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

  // 구글 캘린더 연결 상태
  const { isConnected: googleConnected, syncState, syncNow: googleSyncNow, startAuth, isLoading: googleLoading, error: googleError } = useCalendarSyncStore();
  // 학교급 (custom이면 NEIS 숨김)
  const schoolLevel = useSettingsStore((s) => s.settings.schoolLevel);
  // NEIS 학사일정 상태
  const neisEnabled = useNeisScheduleStore((s) => s.settings.enabled);
  const neisSyncStatus = useNeisScheduleStore((s) => s.syncStatus);
  const neisSyncedCount = useNeisScheduleStore((s) => s.settings.syncedCount);

  // NEIS 패널 상태
  const [showNeisPanel, setShowNeisPanel] = useState(false);

  // 구글 캘린더 에러 닫기 상태
  const [dismissedGoogleError, setDismissedGoogleError] = useState<string | null>(null);

  // 에러가 바뀌면 닫기 상태 초기화
  useEffect(() => {
    if (googleError && googleError !== dismissedGoogleError) {
      setDismissedGoogleError(null);
    }
  }, [googleError, dismissedGoogleError]);

  // 모달 상태
  const [showEventModal, setShowEventModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<SchoolEvent | null>(null);

  // 일괄 삭제 상태
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [showCategoryDeleteModal, setShowCategoryDeleteModal] = useState(false);
  const [showDateRangeDeleteModal, setShowDateRangeDeleteModal] = useState(false);

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

  // 월 드릴다운 (연간/학기 뷰에서 월 클릭)
  const handleNavigateToMonth = useCallback((m: number) => {
    setMonth(m);
    setView('month');
    setSelectedDate(null);
  }, []);

  // 필터링된 이벤트
  const filteredEvents = useMemo(() => {
    // 숨긴 NEIS 일정 제외
    let result = getEventsForMonth(
      events.filter((e) => !e.isHidden),
      year,
      month,
    );

    if (selectedCategory) {
      result = filterByCategory(result, selectedCategory);
    }

    if (sourceFilter === 'google') {
      result = result.filter((e) => e.source === 'google');
    } else if (sourceFilter === 'ssampin') {
      result = result.filter((e) => e.source !== 'google' && e.source !== 'neis');
    } else if (sourceFilter === 'neis') {
      result = result.filter((e) => e.source === 'neis');
    }

    return result;
  }, [events, year, month, selectedCategory, sourceFilter]);

  // 해당 연도 전체 공휴일
  const yearHolidays = useMemo(() => getKoreanHolidays(year), [year]);

  // 해당 월의 공휴일
  const monthHolidays = useMemo(() => {
    const mm = month + 1;
    return yearHolidays.filter((h) => {
      const hMonth = parseInt(h.date.split('-')[1]!, 10);
      return hMonth === mm;
    });
  }, [yearHolidays, month]);

  // 검색용 전체 이벤트 (숨긴 일정 제외)
  const allVisibleEvents = useMemo(() => events.filter((e) => !e.isHidden), [events]);

  // 이벤트 추가/수정 핸들러
  function handleEventSubmit(event: SchoolEvent) {
    if (editingEvent) {
      void updateEvent(event);
    } else {
      track('event_create', { category: event.category });
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
    // NEIS 일정은 숨기기 처리 (isHidden=true)
    const event = events.find((e) => e.id === id);
    if (event?.source === 'neis') {
      void updateEvent({ ...event, isHidden: true });
      return;
    }
    void deleteEvent(id);
  }

  function handleSkipDate(eventId: string, dateToSkip: string) {
    const event = events.find((e) => e.id === eventId);
    if (!event || !event.recurrence) return;

    const currentExcludes = event.excludeDates ?? [];
    if (currentExcludes.includes(dateToSkip)) return; // 이미 제외됨

    void updateEvent({
      ...event,
      excludeDates: [...currentExcludes, dateToSkip],
    });
  }

  function handleDateSelect(date: Date) {
    setSelectedDate(date);
  }

  async function handleImportClick() {
    try {
      const file = await triggerImport();
      if (file) {
        setShareFile(file);
        setShowImportModal(true);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '파일을 불러올 수 없습니다', 'error');
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    const externalCount = events.filter(
      (e) => selectedIds.has(e.id) && (e.source === 'neis' || e.source === 'google'),
    ).length;
    let msg = `선택한 ${selectedIds.size}개의 일정을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`;
    if (externalCount > 0) {
      msg += `\n\n주의: 외부 연동 일정 ${externalCount}개가 포함되어 있습니다. 삭제해도 다음 동기화 시 다시 나타날 수 있습니다.`;
    }
    if (!confirm(msg)) return;
    const count = await deleteManyEvents([...selectedIds]);
    alert(`${count}개의 일정이 삭제되었습니다.`);
    setSelectedIds(new Set());
    setIsSelectMode(false);
  }

  function handleToggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
      <header className="shrink-0 px-8 py-4 flex flex-wrap items-center gap-3 border-b border-sp-border bg-sp-bg">
        <div className="flex items-center gap-4 mr-auto">
          <h2 className="text-sp-text text-xl xl:text-2xl font-bold flex items-center gap-2">
            <span className="text-2xl xl:text-3xl">📋</span> 일정 관리
          </h2>

          {/* 뷰 전환 탭 — Cal.com pill 그룹 패턴 */}
          <div className="flex items-center bg-sp-surface/60 rounded-sp-md p-0.5 border border-sp-border gap-0.5">
            {(['month', 'semester', 'year'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`px-3 xl:px-4 py-1.5 rounded-sp-sm text-xs xl:text-sm transition-all duration-sp-base ease-sp-out ${
                  view === v
                    ? 'bg-sp-card shadow-sp-sm font-sp-semibold text-sp-text'
                    : 'font-sp-medium text-sp-muted hover:text-sp-text'
                }`}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5 xl:gap-2 flex-wrap">
          {/* NEIS 학사일정 버튼 — custom(직접 설정)일 때 숨김 */}
          {schoolLevel !== 'custom' && (
            <button
              type="button"
              onClick={() => setShowNeisPanel(true)}
              className={`flex items-center gap-1.5 border px-3 xl:px-4 py-2 xl:py-2.5 rounded-xl text-xs xl:text-sm font-semibold transition-all ${
                neisEnabled
                  ? 'border-purple-500/30 text-purple-400 hover:bg-purple-500/10'
                  : 'border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-surface'
              }`}
              title="NEIS 학사일정 설정"
            >
              {neisSyncStatus === 'syncing' ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-purple-400/30 border-t-purple-400" />
              ) : (
                <span className="material-symbols-outlined text-icon">school</span>
              )}
              <span className="hidden sm:inline">NEIS</span>
              {neisEnabled && neisSyncedCount > 0 && (
                <span className="text-purple-300 text-caption bg-purple-500/15 px-1.5 py-0.5 rounded">
                  {neisSyncedCount}
                </span>
              )}
            </button>
          )}
          {/* 구글 캘린더 버튼 */}
          {googleConnected ? (
            <button
              type="button"
              onClick={() => void googleSyncNow()}
              disabled={syncState.status === 'syncing'}
              className="flex items-center gap-1.5 border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 px-3 xl:px-4 py-2 xl:py-2.5 rounded-xl text-xs xl:text-sm font-semibold transition-all disabled:opacity-50"
              title="구글 캘린더 동기화"
            >
              <span className={`material-symbols-outlined text-icon-md ${syncState.status === 'syncing' ? 'animate-spin' : ''}`}>
                sync
              </span>
              <span className="hidden sm:inline">{syncState.status === 'syncing' ? '동기화 중...' : '구글 동기화'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void startAuth()}
              disabled={googleLoading}
              className="flex items-center gap-1.5 border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 px-3 xl:px-4 py-2 xl:py-2.5 rounded-xl text-xs xl:text-sm font-semibold transition-all disabled:opacity-50"
              title="구글 캘린더 연결"
            >
              {googleLoading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-400/30 border-t-blue-400" />
              ) : (
                <span className="material-symbols-outlined text-icon-md">add_link</span>
              )}
              <span className="hidden sm:inline">{googleLoading ? '연결 중...' : '구글 캘린더 연결'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void downloadTemplate()}
            className="flex items-center gap-1.5 border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-surface px-3 xl:px-4 py-2 xl:py-2.5 rounded-xl text-xs xl:text-sm font-semibold transition-all"
            title="양식 다운로드"
          >
            <span className="material-symbols-outlined text-icon-md">description</span>
            <span className="hidden lg:inline">양식 다운로드</span>
          </button>
          <button
            type="button"
            onClick={handleImportClick}
            className="flex items-center gap-1.5 border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-surface px-3 xl:px-4 py-2 xl:py-2.5 rounded-xl text-xs xl:text-sm font-semibold transition-all"
            title="가져오기"
          >
            <span className="material-symbols-outlined text-icon-md">download</span>
            <span className="hidden lg:inline">가져오기</span>
          </button>
          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-1.5 border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-surface px-3 xl:px-4 py-2 xl:py-2.5 rounded-xl text-xs xl:text-sm font-semibold transition-all"
            title="내보내기"
          >
            <span className="material-symbols-outlined text-icon-md">upload</span>
            <span className="hidden lg:inline">내보내기</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingEvent(null);
              setShowEventModal(true);
            }}
            className="flex items-center gap-1.5 bg-sp-accent hover:bg-blue-600 text-white px-4 xl:px-5 py-2 xl:py-2.5 rounded-xl transition-all shadow-lg shadow-sp-accent/20"
            title="일정 추가"
          >
            <span className="material-symbols-outlined text-icon-lg">add</span>
            <span className="text-xs xl:text-sm font-bold">일정 추가</span>
          </button>
        </div>
      </header>

      {/* 가져오기 지원 형식 힌트 */}
      <div className="shrink-0 px-8 py-1.5 border-b border-sp-border/50">
        <FormatHint formats=".ssampin, .xlsx" />
      </div>

      {/* 구글 캘린더 오류 인라인 안내 */}
      {googleConnected && googleError && dismissedGoogleError !== googleError && (
        <div className="shrink-0 flex items-center gap-2 px-8 py-2 text-xs text-amber-400/70 bg-amber-400/5 border-b border-amber-400/10">
          <span className="material-symbols-outlined text-sm">warning</span>
          <span className="flex-1">구글 캘린더 동기화 오류 — 사용하지 않으시면 무시하셔도 괜찮아요</span>
          <button
            type="button"
            onClick={() => setDismissedGoogleError(googleError)}
            className="text-sp-muted hover:text-sp-text text-xs px-2 py-0.5 rounded hover:bg-sp-surface transition-colors"
          >
            닫기
          </button>
        </div>
      )}

      {/* 콘텐츠 */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-7xl mx-auto flex flex-col gap-6 h-full">

          {/* 월간 뷰 */}
          {view === 'month' && (
            <>
              {/* 카테고리 탭 */}
              <div className="flex items-center justify-between overflow-x-auto pb-2">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(null)}
                    className={`px-5 py-2 rounded-full text-sm font-bold shadow-sm ring-1 transition-colors ${selectedCategory === null
                      ? 'bg-sp-accent text-white ring-sp-accent/30'
                      : 'bg-sp-card hover:bg-sp-surface text-sp-muted ring-sp-border/50'
                      }`}
                  >
                    전체
                  </button>

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
                          ? 'bg-sp-accent text-white ring-sp-accent/30 font-bold'
                          : 'bg-sp-card hover:bg-sp-surface text-sp-muted ring-sp-border/50'
                          }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                        {cat.name}
                      </button>
                    );
                  })}
                </div>

                {/* 소스 필터 (구글 또는 NEIS 연결 시) */}
                {(googleConnected || neisEnabled) && (
                  <div className="flex items-center gap-1 ml-4 border-l border-sp-border pl-4">
                    <button
                      type="button"
                      onClick={() => setSourceFilter('all')}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${sourceFilter === 'all'
                        ? 'bg-sp-accent text-white'
                        : 'text-sp-muted hover:text-sp-text hover:bg-sp-surface'
                        }`}
                    >
                      전체
                    </button>
                    <button
                      type="button"
                      onClick={() => setSourceFilter('ssampin')}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${sourceFilter === 'ssampin'
                        ? 'bg-sp-accent text-white'
                        : 'text-sp-muted hover:text-sp-text hover:bg-sp-surface'
                        }`}
                    >
                      쌤핀
                    </button>
                    {googleConnected && (
                      <button
                        type="button"
                        onClick={() => setSourceFilter('google')}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${sourceFilter === 'google'
                          ? 'bg-sp-accent text-white'
                          : 'text-sp-muted hover:text-sp-text hover:bg-sp-surface'
                          }`}
                      >
                        <span className="flex items-center gap-1">
                          <GoogleBadge /> 구글
                        </span>
                      </button>
                    )}
                    {neisEnabled && (
                      <button
                        type="button"
                        onClick={() => setSourceFilter('neis')}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${sourceFilter === 'neis'
                          ? 'bg-purple-500 text-white'
                          : 'text-sp-muted hover:text-sp-text hover:bg-sp-surface'
                          }`}
                      >
                        <span className="flex items-center gap-1">
                          <span className="text-tiny text-purple-300 bg-purple-500/15 px-1 py-0.5 rounded font-medium">N</span>
                          NEIS{neisSyncStatus === 'syncing' && ' ⟳'}
                        </span>
                      </button>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowCategoryModal(true)}
                  className="text-sp-muted text-sm font-medium hover:text-sp-accent transition-colors flex items-center gap-1 shrink-0"
                >
                  <span className="material-symbols-outlined text-icon-md">settings</span>
                  카테고리 관리
                </button>
              </div>

              {/* 일괄 관리 도구바 */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsSelectMode(!isSelectMode);
                    setSelectedIds(new Set());
                  }}
                  className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                    isSelectMode
                      ? 'bg-sp-accent text-white'
                      : 'bg-sp-card text-sp-muted hover:text-sp-text border border-sp-border'
                  }`}
                >
                  {isSelectMode ? '선택 취소' : '선택'}
                </button>

                {isSelectMode && selectedIds.size > 0 && (
                  <>
                    <span className="text-xs text-sp-muted">
                      {selectedIds.size}개 선택됨
                    </span>
                    <button
                      type="button"
                      onClick={handleBulkDelete}
                      className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
                    >
                      선택 삭제
                    </button>
                  </>
                )}

                {/* 일괄 삭제 드롭다운 */}
                <div className="relative ml-auto">
                  <button
                    type="button"
                    onClick={() => setShowBulkMenu(!showBulkMenu)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-sp-card text-sp-muted hover:text-sp-text border border-sp-border"
                  >
                    일괄 삭제 ▾
                  </button>
                  {showBulkMenu && (
                    <div className="absolute right-0 top-full mt-1 w-48 bg-sp-card border border-sp-border rounded-lg shadow-xl z-20 py-1">
                      <button
                        type="button"
                        onClick={() => { setShowBulkMenu(false); setShowCategoryDeleteModal(true); }}
                        className="w-full text-left px-4 py-2 text-xs text-sp-text hover:bg-sp-bg"
                      >
                        카테고리별 삭제
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowBulkMenu(false); setShowDateRangeDeleteModal(true); }}
                        className="w-full text-left px-4 py-2 text-xs text-sp-text hover:bg-sp-bg"
                      >
                        기간별 삭제
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 분할 레이아웃: 캘린더(60%) + 이벤트리스트(40%) */}
              <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
                <div className="lg:w-[60%] min-h-0 flex flex-col">
                  <CalendarView
                    year={year}
                    month={month}
                    events={allVisibleEvents}
                    categories={categories}
                    selectedDate={selectedDate}
                    onSelectDate={handleDateSelect}
                    onPrevMonth={goPrevMonth}
                    onNextMonth={goNextMonth}
                  />
                </div>

                <div className="lg:w-[40%] min-h-0 overflow-hidden">
                  <EventList
                    events={filteredEvents}
                    categories={categories}
                    holidays={monthHolidays}
                    allEvents={allVisibleEvents}
                    allHolidays={yearHolidays}
                    year={year}
                    onEdit={handleEditEvent}
                    onDelete={handleDeleteEvent}
                    isSelectMode={isSelectMode}
                    selectedIds={selectedIds}
                    onToggleSelect={handleToggleSelect}
                  />
                </div>
              </div>
            </>
          )}

          {/* 학기 뷰 */}
          {view === 'semester' && (
            <SemesterView
              year={year}
              semester={semester}
              events={events}
              categories={categories}
              onNavigateToMonth={handleNavigateToMonth}
              onToggleSemester={() =>
                setSemester((s) => (s === 'first' ? 'second' : 'first'))
              }
            />
          )}

          {/* 연간 뷰 */}
          {view === 'year' && (
            <YearView
              year={year}
              events={events}
              categories={categories}
              onNavigateToMonth={handleNavigateToMonth}
              onPrevYear={() => setYear((y) => y - 1)}
              onNextYear={() => setYear((y) => y + 1)}
            />
          )}
        </div>
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
        <CategoryManagementModal
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

      {selectedDate && (
        <DayScheduleModal
          date={selectedDate}
          events={allVisibleEvents}
          categories={categories}
          onClose={() => setSelectedDate(null)}
          onAddEvent={() => {
            setEditingEvent(null);
            setShowEventModal(true);
          }}
          onEditEvent={handleEditEvent}
          onDeleteEvent={handleDeleteEvent}
          onSkipDate={handleSkipDate}
        />
      )}

      {/* NEIS 학사일정 패널 */}
      <NeisSchedulePanel
        open={showNeisPanel}
        onClose={() => setShowNeisPanel(false)}
      />

      {/* 카테고리별 삭제 모달 */}
      {showCategoryDeleteModal && (
        <BulkDeleteByCategoryModal
          categories={categories}
          events={events}
          onDelete={deleteEventsByCategory}
          onClose={() => setShowCategoryDeleteModal(false)}
        />
      )}

      {/* 기간별 삭제 모달 */}
      {showDateRangeDeleteModal && (
        <BulkDeleteByDateRangeModal
          events={events}
          onDelete={deleteEventsByDateRange}
          onClose={() => setShowDateRangeDeleteModal(false)}
        />
      )}
    </div>
  );
}
