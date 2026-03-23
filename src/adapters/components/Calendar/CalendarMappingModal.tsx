import { useState, useEffect } from 'react';
import { useCalendarSyncStore } from '@adapters/stores/useCalendarSyncStore';
import type { CalendarMapping } from '@domain/entities/CalendarMapping';
import type { GoogleCalendarInfo } from '@domain/entities/GoogleCalendarInfo';

interface CalendarMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 최초 연결 직후 모드 (취소 불가, 반드시 선택) */
  isInitialSetup?: boolean;
}

export function CalendarMappingModal({ isOpen, onClose, isInitialSetup }: CalendarMappingModalProps) {
  const { mappings, googleCalendars, fetchGoogleCalendars, updateMappings, syncNow } = useCalendarSyncStore();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isLoadingCalendars, setIsLoadingCalendars] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    // 기존 매핑에서 선택된 캘린더 복원
    const enabledIds = new Set(
      mappings
        .filter(m => m.syncEnabled && m.googleCalendarId)
        .map(m => m.googleCalendarId!),
    );
    setSelected(enabledIds);
    setCalendarError(null);

    // 구글 캘린더 목록 가져오기
    setIsLoadingCalendars(true);
    fetchGoogleCalendars()
      .then(() => {
        setIsLoadingCalendars(false);
        // 최초 설정이고 매핑 없으면 primary 캘린더 자동 선택
        if (isInitialSetup && enabledIds.size === 0) {
          const cals = useCalendarSyncStore.getState().googleCalendars;
          const primary = cals.find(c => c.primary);
          if (primary) {
            setSelected(new Set([primary.id]));
          }
        }
      })
      .catch((err) => {
        setIsLoadingCalendars(false);
        setCalendarError(
          err instanceof Error ? err.message : '캘린더 목록을 가져오는 데 실패했습니다.',
        );
      });
  }, [isOpen, fetchGoogleCalendars, mappings, isInitialSetup]);

  if (!isOpen) return null;

  const toggleCalendar = (calId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(calId)) next.delete(calId);
      else next.add(calId);
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 선택된 캘린더로 매핑 생성
      const newMappings: CalendarMapping[] = googleCalendars
        .filter((cal: GoogleCalendarInfo) => selected.has(cal.id))
        .map((cal: GoogleCalendarInfo) => {
          // 기존 매핑이 있으면 유지
          const existing = mappings.find(m => m.googleCalendarId === cal.id);
          return existing ? { ...existing, syncEnabled: true } : {
            categoryId: cal.id,
            categoryName: cal.summary,
            googleCalendarId: cal.id,
            googleCalendarName: cal.summary,
            syncEnabled: true,
            syncDirection: 'bidirectional' as const,
          };
        });

      await updateMappings(newMappings);
      onClose();

      // 매핑 변경 후 동기화 시작
      void syncNow();
    } catch (err) {
      console.error('[CalendarPicker] save error:', err);
    }
    setIsSaving(false);
  };

  const getCalendarColor = (cal: GoogleCalendarInfo) =>
    cal.backgroundColor ?? '#3b82f6';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" aria-hidden="true">
      <div
        className="max-h-[80vh] w-full max-w-[480px] overflow-y-auto rounded-2xl bg-sp-card p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title-calendar-mapping"
      >
        <h2 id="modal-title-calendar-mapping" className="mb-1 text-lg font-bold text-sp-text">
          {isInitialSetup ? '동기화할 캘린더 선택' : '캘린더 선택'}
        </h2>
        <p className="mb-5 text-sm text-sp-muted">
          {isInitialSetup
            ? '가져올 구글 캘린더를 선택하세요. 선택한 캘린더의 일정이 쌤핀에 동기화됩니다.'
            : '동기화할 구글 캘린더를 선택하세요.'}
        </p>

        {/* 로딩 상태 */}
        {isLoadingCalendars && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-sp-muted">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-sp-muted/30 border-t-sp-muted" />
            캘린더 목록을 가져오는 중...
          </div>
        )}

        {/* 에러 상태 */}
        {calendarError && (
          <div className="space-y-3 py-4">
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">
              {calendarError}
            </div>
            <button
              onClick={() => {
                setCalendarError(null);
                setIsLoadingCalendars(true);
                fetchGoogleCalendars()
                  .then(() => setIsLoadingCalendars(false))
                  .catch((err) => {
                    setIsLoadingCalendars(false);
                    setCalendarError(
                      err instanceof Error ? err.message : '캘린더 목록을 가져오는 데 실패했습니다.',
                    );
                  });
              }}
              className="text-sm text-sp-accent hover:underline"
            >
              다시 시도
            </button>
          </div>
        )}

        {/* 캘린더 목록 */}
        {!isLoadingCalendars && !calendarError && googleCalendars.length > 0 && (
          <div className="space-y-2">
            {googleCalendars.map((cal: GoogleCalendarInfo) => (
              <button
                key={cal.id}
                onClick={() => toggleCalendar(cal.id)}
                className={`flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors ${
                  selected.has(cal.id)
                    ? 'bg-sp-accent/10 ring-1 ring-sp-accent/30'
                    : 'bg-sp-surface hover:bg-sp-surface/80'
                }`}
              >
                {/* 체크박스 */}
                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                    selected.has(cal.id)
                      ? 'border-sp-accent bg-sp-accent text-white'
                      : 'border-sp-border bg-sp-bg'
                  }`}
                >
                  {selected.has(cal.id) && (
                    <span className="material-symbols-outlined text-icon-sm">check</span>
                  )}
                </div>

                {/* 캘린더 컬러 인디케이터 */}
                <div
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: getCalendarColor(cal) }}
                />

                {/* 캘린더 이름 */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-sp-text">
                    {cal.summary}
                    {cal.primary && (
                      <span className="ml-1.5 text-xs text-sp-muted">(기본)</span>
                    )}
                  </p>
                  {cal.accessRole === 'reader' && (
                    <p className="text-xs text-sp-muted">읽기 전용</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* 캘린더 없음 */}
        {!isLoadingCalendars && !calendarError && googleCalendars.length === 0 && (
          <div className="py-8 text-center text-sm text-sp-muted">
            구글 캘린더를 찾을 수 없습니다.
          </div>
        )}

        {/* 버튼 */}
        <div className="mt-6 flex justify-end gap-3">
          {!isInitialSetup && (
            <button
              onClick={onClose}
              className="rounded-lg border border-sp-border px-4 py-2 text-sm text-sp-muted transition-colors hover:text-sp-text"
            >
              취소
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving || selected.size === 0}
            className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sp-accent/80 disabled:opacity-50"
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                저장 중...
              </span>
            ) : (
              isInitialSetup
                ? `${selected.size}개 캘린더 동기화 시작`
                : '저장'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
