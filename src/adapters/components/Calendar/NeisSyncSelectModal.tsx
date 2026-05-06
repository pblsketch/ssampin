import { useMemo, useState } from 'react';
import {
  classifyNeisEvent,
  shouldSyncToGoogle,
  NEIS_GROUP_LABELS,
} from '@domain/entities/NeisSchedule';
import type { NeisGroup } from '@domain/entities/NeisSchedule';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useNeisScheduleStore } from '@adapters/stores/useNeisScheduleStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

const GROUP_ORDER: readonly NeisGroup[] = ['holiday', 'exam', 'vacation', 'event', 'etc'];

const GROUP_ACCENT: Readonly<Record<NeisGroup, string>> = {
  holiday: 'text-red-300',
  exam: 'text-orange-300',
  vacation: 'text-yellow-300',
  event: 'text-green-300',
  etc: 'text-sp-muted',
};

/**
 * 그룹별 펼침 + 그룹내 개별 체크박스로 NEIS 학사일정의 구글 캘린더 동기화 대상을 세밀 조정.
 *
 * UX:
 *  - 검색창으로 제목 빠른 필터
 *  - 그룹 헤더에 토글 + 카운트 (전체 N건 중 K건 선택됨)
 *  - 그룹 펼치면 개별 체크박스 (오늘 포함 미래 일정만 우선 정렬)
 *  - 변경은 즉시 settings에 영구 저장. 모달 닫으면 그대로 반영됨.
 *  - 변경 사항을 실제 구글 캘린더에 반영하려면 모달 닫은 뒤 카드의 "구글 캘린더로 다시 동기화" 버튼.
 */
export function NeisSyncSelectModal({ open, onClose }: Props) {
  const events = useEventsStore((s) => s.events);
  const settings = useNeisScheduleStore((s) => s.settings);
  const setGoogleSyncGroup = useNeisScheduleStore((s) => s.setGoogleSyncGroup);
  const toggleEventInclusion = useNeisScheduleStore((s) => s.toggleEventInclusion);
  const resetGroupSelection = useNeisScheduleStore((s) => s.resetGroupSelection);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<NeisGroup>>(new Set());

  const neisEvents: SchoolEvent[] = useMemo(
    () =>
      events
        .filter((e) => e.category === 'neis-schedule' && e.neis)
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date)),
    [events],
  );

  const grouped = useMemo(() => {
    const buckets: Record<NeisGroup, SchoolEvent[]> = {
      holiday: [], exam: [], vacation: [], event: [], etc: [],
    };
    for (const ev of neisEvents) {
      if (!ev.neis) continue;
      const g = classifyNeisEvent({ title: ev.title, subtractDayType: ev.neis.subtractDayType });
      buckets[g].push(ev);
    }
    return buckets;
  }, [neisEvents]);

  const filteredFor = (group: NeisGroup): SchoolEvent[] => {
    if (!query.trim()) return grouped[group];
    const q = query.trim().toLowerCase();
    return grouped[group].filter(
      (ev) => ev.title.toLowerCase().includes(q) || ev.date.includes(q),
    );
  };

  const isEventOn = (ev: SchoolEvent): boolean => {
    if (!ev.neis) return false;
    return shouldSyncToGoogle(
      { eventId: ev.neis.eventId, title: ev.title, subtractDayType: ev.neis.subtractDayType },
      settings,
    );
  };

  const groupOnCount = (group: NeisGroup): number =>
    grouped[group].filter(isEventOn).length;

  const totalOn = neisEvents.filter(isEventOn).length;

  const toggleExpanded = (group: NeisGroup) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-sp-modal bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-sp-modal flex items-center justify-center p-4">
        <div
          className="w-full max-w-lg max-h-[80vh] flex flex-col bg-sp-card rounded-xl border border-sp-border shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-sp-border">
            <div>
              <h3 className="text-base font-bold text-sp-text">동기화 대상 세부 선택</h3>
              <p className="text-xs text-sp-muted mt-0.5">
                전체 {neisEvents.length}건 중 <span className="text-sp-text font-medium">{totalOn}건</span> 선택됨
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="p-1.5 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors"
            >
              <span className="material-symbols-outlined text-icon-lg">close</span>
            </button>
          </div>

          {/* 검색 + 액션 */}
          <div className="shrink-0 px-5 py-3 border-b border-sp-border space-y-2">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-sp-muted text-icon-md pointer-events-none">
                search
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="제목 또는 날짜로 검색..."
                className="w-full pl-10 pr-3 py-2 rounded-lg bg-sp-surface border border-sp-border text-sm text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <button
              type="button"
              onClick={() => void resetGroupSelection()}
              className="text-detail text-sp-muted hover:text-sp-text transition-colors underline-offset-2 hover:underline"
            >
              개별 선택 초기화 (그룹 토글로 복귀)
            </button>
          </div>

          {/* 본문 — 그룹별 */}
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
            {GROUP_ORDER.map((group) => {
              const items = filteredFor(group);
              const total = grouped[group].length;
              const onCount = groupOnCount(group);
              const isOpen = expanded.has(group);
              return (
                <div key={group} className="rounded-lg border border-sp-border overflow-hidden">
                  {/* 그룹 헤더 */}
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-sp-surface/40">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(group)}
                      className="p-1 rounded hover:bg-sp-text/5 transition-colors"
                      aria-label={isOpen ? '그룹 접기' : '그룹 펼치기'}
                      disabled={total === 0}
                    >
                      <span className="material-symbols-outlined text-icon">
                        {isOpen ? 'expand_less' : 'expand_more'}
                      </span>
                    </button>
                    <span className={`text-sm font-medium ${GROUP_ACCENT[group]}`}>
                      {NEIS_GROUP_LABELS[group]}
                    </span>
                    <span className="text-xs text-sp-muted">
                      {onCount}/{total}
                    </span>
                    <div className="flex-1" />
                    <label className="inline-flex items-center cursor-pointer">
                      <span className="text-xs text-sp-muted mr-2">그룹</span>
                      <input
                        type="checkbox"
                        checked={settings.googleSyncGroups[group]}
                        onChange={(e) => void setGoogleSyncGroup(group, e.target.checked)}
                        className="w-4 h-4 rounded border-sp-border bg-sp-bg text-blue-500 focus:ring-blue-500"
                      />
                    </label>
                  </div>
                  {/* 그룹내 개별 (펼쳤을 때만) */}
                  {isOpen && total > 0 && (
                    <div className="divide-y divide-sp-border">
                      {items.length === 0 ? (
                        <p className="px-3 py-3 text-detail text-sp-muted">검색 결과 없음</p>
                      ) : (
                        items.map((ev) => {
                          const on = isEventOn(ev);
                          return (
                            <label
                              key={ev.id}
                              className="flex items-center gap-3 px-3 py-2 hover:bg-sp-text/5 transition-colors cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => void toggleEventInclusion(ev.neis!.eventId, !on)}
                                className="w-4 h-4 rounded border-sp-border bg-sp-bg text-blue-500 focus:ring-blue-500"
                              />
                              <span className="text-detail text-sp-muted shrink-0 w-20">{ev.date}</span>
                              <span className="text-sm text-sp-text truncate">{ev.title}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {neisEvents.length === 0 && (
              <p className="text-center text-sm text-sp-muted py-8">
                NEIS 학사일정이 아직 동기화되지 않았어요.
              </p>
            )}
          </div>

          {/* 푸터 */}
          <div className="shrink-0 px-5 py-3 border-t border-sp-border">
            <p className="text-detail text-sp-muted text-center">
              변경은 즉시 저장됩니다. 구글 캘린더에 반영하려면 닫은 뒤 카드의 <span className="text-sp-text">&quot;구글 캘린더로 다시 동기화&quot;</span> 버튼을 눌러주세요.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
