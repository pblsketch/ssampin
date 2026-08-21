import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import { getEventsForMonth, filterByCategory } from '@domain/rules/eventRules';
import { findDuplicateEventGroups, countDuplicateEvents } from '@domain/rules/eventDuplicateRules';
import {
  getCategoryColors,
  getCategoryDisplayName,
  isGoogleCalendarId,
} from '@adapters/presenters/categoryPresenter';
import { getKoreanHolidays } from '@domain/rules/holidayRules';
import { CalendarView } from './CalendarView';
import { SplitDivider } from '@adapters/components/common/SplitDivider';
import { EventList } from './EventList';
import { EventFormModal } from './EventFormModal';
import { CategoryManagementModal } from './CategoryManagementModal';
import { ExportModal } from './ExportModal';
import { ImportModal } from './ImportModal';
import { CoolImportButton } from '@adapters/components/CoolMessenger/CoolImportButton';
import { DayScheduleModal } from './DayScheduleModal';
import { toAddEventParams } from './eventFormMapping';
import { YearView } from './YearView';
import { SemesterView } from './SemesterView';
import { BulkDeleteByCategoryModal } from './BulkDeleteByCategoryModal';
import { BulkDeleteByDateRangeModal } from './BulkDeleteByDateRangeModal';
import { DuplicateCleanupModal } from './DuplicateCleanupModal';
import { useCalendarSyncStore } from '@adapters/stores/useCalendarSyncStore';
import { useNeisScheduleStore } from '@adapters/stores/useNeisScheduleStore';
import { GoogleBadge } from '@adapters/components/Calendar/GoogleBadge';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { NeisSchedulePanel } from './NeisSchedulePanel';
import { useToastStore } from '@adapters/components/common/Toast';
import { PageHeader } from '@adapters/components/common/PageHeader';
import { ScrollRow } from '@adapters/components/common/ScrollRow';
import { parseTerm } from '@domain/rules/academicCalendar';
import { useCurrentTerm } from '@adapters/hooks/useCurrentTerm';

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

/**
 * 달력 ↔ 일정 목록 폭 비율. 한쪽이 못 쓸 만큼 좁아지지 않게 30~75% 로 묶는다.
 *
 * 기본값 68% — 처음엔 기존과 같은 60% 로 뒀는데, 달력이 이 화면의 주인공이고 날짜 칸마다
 * 일정 제목이 들어가야 해서 좁으면 제목이 바로 잘린다(준일님, 2026-08-19). 오른쪽 목록은
 * 세로로 읽는 것이라 조금 좁아도 덜 답답하다.
 *
 * 사용자가 손잡이로 바꾼 값은 `localStorage` 에 남아 다음에 열 때 그대로 복원된다 —
 * 이 기본값은 **한 번도 조절하지 않은 사람**에게만 적용된다.
 */
const SPLIT_STORAGE_KEY = 'ssampin:schedule-split';
const SPLIT_DEFAULT = 68;
const SPLIT_MIN = 30;
const SPLIT_MAX = 75;

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
    hideManyEvents,
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
  // 학기 뷰 기본값은 앱 전체가 쓰는 현재 학기를 따른다 — 여기서 월을 직접 세면 8월에 개학한
  // 학교가 일정만 1학기로 보이고 다른 화면과 답이 갈린다.
  const currentTerm = useCurrentTerm();
  const [semester, setSemester] = useState<'first' | 'second'>(() =>
    parseTerm(currentTerm)?.semester === 2 ? 'second' : 'first',
  );

  // 선택된 날짜, 카테고리 필터, 소스 필터
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  /* 구글 캘린더 카테고리 펼침 여부 (2026-08-18).
     연동한 계정 수만큼 이메일 알약이 필터 줄에 늘어서서 줄을 통째로 잡아먹었다.
     기본은 접어 두고, 계정별로 걸러 보고 싶을 때만 펼친다. */
  const [showGoogleCategories, setShowGoogleCategories] = useState(false);

  /*
    달력 ↔ 이번 달 일정 폭 비율 (2026-08-18).

    60:40 고정이었는데 "달력을 크게 보고 싶은 선생님도, 일정 목록을 넓게 보고 싶은 선생님도
    있다"는 지적을 받았다. 드래그로 조절하고 그 값을 기억한다.

    저장을 설정(settings)이 아니라 `localStorage` 에 두는 이유 — 이 값은 **이 컴퓨터의 이
    화면을 어떻게 보느냐**일 뿐이라 기기 간 동기화 대상이 아니다. 설정에 넣으면 동기화·스키마·
    충돌 해결까지 딸려 오는데 얻는 것이 없다. 시간표 탭 기억이 이미 같은 방식을 쓴다.
  */
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const [splitPercent, setSplitPercent] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(SPLIT_STORAGE_KEY));
      // 저장값이 깨졌거나 범위 밖이면 조용히 기본값으로 — 화면이 못 쓰게 되면 안 된다.
      if (Number.isFinite(saved) && saved >= SPLIT_MIN && saved <= SPLIT_MAX) return saved;
    } catch {
      /* 저장소를 못 쓰는 환경이면 기본값 */
    }
    return SPLIT_DEFAULT;
  });

  const handleSplitChange = useCallback((next: number) => {
    setSplitPercent(next);
    try {
      localStorage.setItem(SPLIT_STORAGE_KEY, String(next));
    } catch {
      /* 저장 실패해도 이번 세션 동안은 조절이 동작해야 한다 */
    }
  }, []);

  /* 필터 줄을 두 묶음으로 나눈다 — 내가 만든 카테고리는 그대로 늘어놓고,
     구글에서 온 것은 알약 하나 뒤로 접는다. */
  const ownCategories = useMemo(
    () => categories.filter((c) => !isGoogleCalendarId(c.id)),
    [categories],
  );
  const googleCategories = useMemo(
    () => categories.filter((c) => isGoogleCalendarId(c.id)),
    [categories],
  );

  // 구글 캘린더 연결 상태
  const {
    isConnected: googleConnected,
    syncState,
    syncNow: googleSyncNow,
    startAuth,
    isLoading: googleLoading,
    error: googleError,
  } = useCalendarSyncStore();
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

  /* 중복 일정 안내 (2026-08-21) — 배너는 이번 세션 동안만 닫힌다.
     정리하면 중복 자체가 사라져 배너도 같이 사라지므로 영구 저장까지는 필요 없다. */
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateNoticeDismissed, setDuplicateNoticeDismissed] = useState(false);

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

  /*
    겹쳐 보이는 일정 찾기 (2026-08-21, 문혜인 선생님 제보).

    구글 캘린더를 연동한 뒤 같은 일정이 2~3줄씩 겹쳐 보이던 문제다. 새로 생기는 것은
    `SyncFromGoogle` 에서 막았지만 이미 늘어난 사본은 선생님 자료라 임의로 지우지 않는다.
    대신 몇 건인지 알려 주고, 선생님이 눌렀을 때만 한 줄로 줄인다.
  */
  const duplicateGroups = useMemo(() => findDuplicateEventGroups(events), [events]);
  const duplicateCount = useMemo(() => countDuplicateEvents(duplicateGroups), [duplicateGroups]);

  // 이벤트 추가/수정 핸들러
  function handleEventSubmit(event: SchoolEvent) {
    if (editingEvent) {
      void updateEvent(event);
    } else {
      track('event_create', { category: event.category });
      void addEvent(toAddEventParams(event));
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
      <PageHeader
        icon="event_note"
        iconIsMaterial
        title="일정 관리"
        leftAddon={
          <div className="flex items-center bg-sp-surface/60 rounded-lg p-0.5 border border-sp-border gap-0.5">
            {(['month', 'semester', 'year'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`px-3 xl:px-4 py-1.5 rounded-md text-xs xl:text-sm transition-all duration-sp-base ease-sp-out ${
                  view === v
                    ? 'bg-sp-card shadow-sp-sm font-sp-semibold text-sp-text'
                    : 'font-sp-medium text-sp-muted hover:text-sp-text'
                }`}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>
        }
        rightActions={
          <>
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
                <span
                  className={`material-symbols-outlined text-icon-md ${syncState.status === 'syncing' ? 'animate-spin' : ''}`}
                >
                  sync
                </span>
                <span className="hidden sm:inline">
                  {syncState.status === 'syncing' ? '동기화 중...' : '구글 동기화'}
                </span>
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
                <span className="hidden sm:inline">
                  {googleLoading ? '연결 중...' : '구글 캘린더 연결'}
                </span>
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
            {/* 설정에서 켠 경우에만 보인다 (쿨메신저 안 쓰는 학교가 많다) */}
            <CoolImportButton variant="toolbar" hideLabelOnNarrow />
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
          </>
        }
      />

      {/* 구글 캘린더 오류 인라인 안내 */}
      {googleConnected && googleError && dismissedGoogleError !== googleError && (
        <div className="shrink-0 flex items-center gap-2 px-8 py-2 text-xs text-amber-400/70 bg-amber-400/5 border-b border-amber-400/10">
          <span className="material-symbols-outlined text-sm">warning</span>
          <span className="flex-1">
            구글 캘린더 동기화 오류 — 사용하지 않으시면 무시하셔도 괜찮아요
          </span>
          <button
            type="button"
            onClick={() => setDismissedGoogleError(googleError)}
            className="text-sp-muted hover:text-sp-text text-xs px-2 py-0.5 rounded hover:bg-sp-surface transition-colors"
          >
            닫기
          </button>
        </div>
      )}

      {/* 겹쳐 보이는 일정 안내 — 누르기 전에는 아무것도 바꾸지 않는다 */}
      {duplicateCount > 0 && !duplicateNoticeDismissed && (
        <div className="shrink-0 flex items-center gap-2 px-8 py-2 text-xs text-sp-text bg-sp-surface/60 border-b border-sp-border">
          <span className="material-symbols-outlined text-icon text-sp-muted">content_copy</span>
          <span className="flex-1 break-keep">
            같은 일정이 겹쳐서 <span className="font-bold">{duplicateCount}줄</span> 더 보이고
            있어요. 한 줄로 줄일 수 있습니다.
          </span>
          <button
            type="button"
            onClick={() => setShowDuplicateModal(true)}
            className="px-3 py-1 rounded-lg bg-sp-accent text-sp-accent-fg text-xs font-bold hover:bg-sp-accent/90 transition-colors"
          >
            정리하기
          </button>
          <button
            type="button"
            onClick={() => setDuplicateNoticeDismissed(true)}
            className="text-sp-muted hover:text-sp-text text-xs px-2 py-0.5 rounded hover:bg-sp-surface transition-colors"
          >
            나중에
          </button>
        </div>
      )}

      {/* 콘텐츠 */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto flex flex-col gap-4 sm:gap-5 lg:gap-6 lg:h-full">
          {/* 월간 뷰 */}
          {view === 'month' && (
            <>
              {/*
                카테고리 탭 (2026-08-21).

                두 줄 구조인 이유 — 예전에는 `구글` 알약을 펼치면 계정 알약들이 **같은 줄
                오른쪽에 이어 붙었다.** 그 줄은 넘치면 가로로 흐르는(`ScrollRow`) 줄이라
                화면 밖으로 밀려 나가 끝이 싹둑 잘려 보였고, 스크롤바도 숨겨져 있어
                "잘려서 몇 개가 나오는지 몰라요"(문혜인 선생님)라는 말이 나왔다.
                펼친 목록은 아래 줄로 내려 **줄바꿈**시키면 몇 개든 전부 보인다.
              */}
              <div className="flex flex-col gap-2 py-1.5 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <ScrollRow className="gap-3 flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => setSelectedCategory(null)}
                      className={`px-3 py-1.5 sm:px-5 sm:py-2 rounded-full text-sm font-bold shadow-sm ring-1 transition-colors ${
                        selectedCategory === null
                          ? 'bg-sp-accent text-white ring-sp-accent/30'
                          : 'bg-sp-card hover:bg-sp-surface text-sp-muted ring-sp-border/50'
                      }`}
                    >
                      전체
                    </button>

                    {ownCategories.map((cat) => {
                      const colors = getCategoryColors(cat.color);
                      const isActive = selectedCategory === cat.id;

                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setSelectedCategory(isActive ? null : cat.id)}
                          className={`px-3 py-1.5 sm:px-5 sm:py-2 rounded-full text-sm font-medium transition-colors ring-1 flex items-center gap-2 ${
                            isActive
                              ? 'bg-sp-accent text-white ring-sp-accent/30 font-bold'
                              : 'bg-sp-card hover:bg-sp-surface text-sp-muted ring-sp-border/50'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                          {cat.name}
                        </button>
                      );
                    })}

                    {/*
                    구글 캘린더 카테고리는 알약 하나로 접는다 (2026-08-18).

                    연동한 계정 수만큼 `someone@gmail.com` 알약이 늘어서서 필터 줄을 통째로
                    잡아먹었다(계정 3개면 줄의 대부분). 계정을 구분해 걸러 보는 일은 가끔이라
                    기본은 접어 두고 필요할 때만 펼친다. 펼쳤을 때도 이메일 전체가 아니라
                    짧은 표시 이름을 쓴다 — 카테고리 관리에서 이름을 직접 바꾸면 그 이름이 이긴다.
                  */}
                    {googleCategories.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowGoogleCategories((v) => !v)}
                        aria-expanded={showGoogleCategories}
                        className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-sm font-medium transition-colors ring-1 flex items-center gap-1.5 shrink-0 ${
                          googleCategories.some((c) => c.id === selectedCategory)
                            ? 'bg-sp-accent text-white ring-sp-accent/30 font-bold'
                            : 'bg-sp-card hover:bg-sp-surface text-sp-muted ring-sp-border/50'
                        }`}
                        title={
                          showGoogleCategories ? '구글 캘린더 접기' : '구글 캘린더 계정별로 보기'
                        }
                      >
                        <GoogleBadge />
                        구글
                        {googleCategories.length > 1 && (
                          <span className="tabular-nums">{googleCategories.length}</span>
                        )}
                        <span className="material-symbols-outlined text-icon-md leading-none">
                          {showGoogleCategories ? 'expand_less' : 'expand_more'}
                        </span>
                      </button>
                    )}
                  </ScrollRow>

                  {/* 우측 고정: 소스 필터 + 카테고리 관리 (좁은 창에서도 항상 접근 가능) */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* 소스 필터 (구글 또는 NEIS 연결 시) */}
                    {(googleConnected || neisEnabled) && (
                      <div className="flex items-center gap-1 border-l border-sp-border pl-3">
                        <button
                          type="button"
                          onClick={() => setSourceFilter('all')}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                            sourceFilter === 'all'
                              ? 'bg-sp-accent text-white'
                              : 'text-sp-muted hover:text-sp-text hover:bg-sp-surface'
                          }`}
                        >
                          전체
                        </button>
                        <button
                          type="button"
                          onClick={() => setSourceFilter('ssampin')}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                            sourceFilter === 'ssampin'
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
                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                              sourceFilter === 'google'
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
                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                              sourceFilter === 'neis'
                                ? 'bg-purple-500 text-white'
                                : 'text-sp-muted hover:text-sp-text hover:bg-sp-surface'
                            }`}
                          >
                            <span className="flex items-center gap-1">
                              <span className="text-tiny text-purple-300 bg-purple-500/15 px-1 py-0.5 rounded font-medium">
                                N
                              </span>
                              NEIS{neisSyncStatus === 'syncing' && ' ⟳'}
                            </span>
                          </button>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowCategoryModal(true)}
                      className="text-sp-muted text-sm font-medium hover:text-sp-accent transition-colors flex items-center gap-1 shrink-0 ml-1"
                    >
                      <span className="material-symbols-outlined text-icon-md">settings</span>
                      <span className="hidden md:inline">카테고리 관리</span>
                    </button>
                  </div>
                </div>

                {/* 펼친 구글 계정 목록 — 넘치면 잘리지 않고 아래로 줄바꿈된다 */}
                {showGoogleCategories && googleCategories.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pl-1">
                    <span className="text-xs text-sp-muted shrink-0">
                      구글 캘린더 {googleCategories.length}개
                    </span>
                    {googleCategories.map((cat) => {
                      const colors = getCategoryColors(cat.color);
                      const isActive = selectedCategory === cat.id;

                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setSelectedCategory(isActive ? null : cat.id)}
                          title={cat.name}
                          className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-sm font-medium transition-colors ring-1 flex items-center gap-2 max-w-[16rem] ${
                            isActive
                              ? 'bg-sp-accent text-white ring-sp-accent/30 font-bold'
                              : 'bg-sp-card hover:bg-sp-surface text-sp-muted ring-sp-border/50'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
                          <span className="truncate">
                            {getCategoryDisplayName(cat, googleCategories.length)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
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
                    <span className="text-xs text-sp-muted">{selectedIds.size}개 선택됨</span>
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
                        onClick={() => {
                          setShowBulkMenu(false);
                          setShowCategoryDeleteModal(true);
                        }}
                        className="w-full text-left px-4 py-2 text-xs text-sp-text hover:bg-sp-bg"
                      >
                        카테고리별 삭제
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowBulkMenu(false);
                          setShowDateRangeDeleteModal(true);
                        }}
                        className="w-full text-left px-4 py-2 text-xs text-sp-text hover:bg-sp-bg"
                      >
                        기간별 삭제
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/*
                분할 레이아웃: 달력 + 이번 달 일정. 폭은 손잡이로 조절한다.

                비율을 인라인 style 이 아니라 **CSS 변수**로 내리는 이유 — 인라인 폭은
                화면 크기별 분기를 못 탄다. 좁은 화면에서는 위아래로 쌓여야 하는데
                (`w-full`), 인라인으로 `width: 62%` 를 박으면 거기서도 62% 가 되어 버린다.
                변수로 두면 `lg:w-[var(--sp-split)]` 처럼 **넓을 때만** 적용할 수 있다.
              */}
              <div
                ref={splitContainerRef}
                style={{ '--sp-split': `${splitPercent}%` } as React.CSSProperties}
                className="flex flex-col lg:flex-row gap-4 lg:gap-0 lg:flex-1 lg:min-h-0"
              >
                <div className="lg:w-[var(--sp-split)] min-h-[480px] lg:min-h-0 flex flex-col lg:pr-3">
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

                <SplitDivider
                  value={splitPercent}
                  onChange={handleSplitChange}
                  containerRef={splitContainerRef}
                  min={SPLIT_MIN}
                  max={SPLIT_MAX}
                  defaultValue={SPLIT_DEFAULT}
                  ariaLabel="달력과 이번 달 일정의 폭 조절"
                />

                <div className="flex-1 min-w-0 min-h-[320px] lg:min-h-0 lg:overflow-hidden lg:pl-3">
                  <EventList
                    events={filteredEvents}
                    categories={categories}
                    holidays={monthHolidays}
                    allEvents={allVisibleEvents}
                    allHolidays={yearHolidays}
                    year={year}
                    month={month}
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
              onToggleSemester={() => setSemester((s) => (s === 'first' ? 'second' : 'first'))}
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
      {showCategoryModal && <CategoryManagementModal onClose={() => setShowCategoryModal(false)} />}

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

      {/* DayScheduleModal에서 열리는 자식 모달 — DOM 순서상 항상 뒤에 두어 z-stacking 보장 */}
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

      {/* NEIS 학사일정 패널 */}
      <NeisSchedulePanel open={showNeisPanel} onClose={() => setShowNeisPanel(false)} />

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

      {/* 중복 일정 정리 모달 */}
      {showDuplicateModal && (
        <DuplicateCleanupModal
          events={events}
          categories={categories}
          onCleanup={hideManyEvents}
          onClose={() => setShowDuplicateModal(false)}
        />
      )}
    </div>
  );
}
