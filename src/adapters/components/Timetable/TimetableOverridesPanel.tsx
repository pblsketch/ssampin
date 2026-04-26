import { useMemo, useState, useEffect } from 'react';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { toLocalDateString } from '@shared/utils/localDate';
import { getDayOfWeekFull } from '@domain/valueObjects/DayOfWeek';
import type { TimetableOverride, TimetableOverrideKind, TimetableOverrideScope } from '@domain/entities/Timetable';
import { Drawer } from '@adapters/components/common/Drawer';
import { IconButton } from '@adapters/components/common/IconButton';

type FilterMode = 'week' | 'month' | 'all' | 'past';

interface TimetableOverridesPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onAddNew: () => void;
  readonly onEdit: (override: TimetableOverride) => void;
}

const KIND_META: Record<TimetableOverrideKind, { label: string; icon: string; color: string }> = {
  swap: { label: '교체', icon: 'swap_horiz', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  substitute: { label: '보강', icon: 'person_add', color: 'text-green-400 bg-green-500/10 border-green-500/30' },
  cancel: { label: '자습/공강', icon: 'event_busy', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  custom: { label: '기타', icon: 'edit_note', color: 'text-sp-muted bg-sp-surface border-sp-border' },
};

const SCOPE_META: Record<TimetableOverrideScope, { label: string; color: string }> = {
  teacher: { label: '교사만', color: 'text-sky-300 bg-sky-500/15 border-sky-500/40' },
  class: { label: '학급만', color: 'text-fuchsia-300 bg-fuchsia-500/15 border-fuchsia-500/40' },
  both: { label: '공통', color: 'text-sp-text bg-sp-surface border-sp-border' },
};

function inferKind(o: TimetableOverride): TimetableOverrideKind {
  if (o.kind) return o.kind;
  // 기존 데이터 호환 추정: subject가 비어있으면 cancel, 아니면 custom
  if (!o.subject) return 'cancel';
  return 'custom';
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = getDayOfWeekFull(d);
  const m = d.getMonth() + 1;
  const day2 = d.getDate();
  return `${m}.${day2} (${day})`;
}

function getWeekRange(now: Date): { from: string; to: string } {
  const jsDay = now.getDay();
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: toLocalDateString(monday), to: toLocalDateString(sunday) };
}

function getMonthRange(now: Date): { from: string; to: string } {
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: toLocalDateString(first), to: toLocalDateString(last) };
}

export function TimetableOverridesPanel({ open, onClose, onAddNew, onEdit }: TimetableOverridesPanelProps) {
  const { overrides, deleteOverride, classSchedule, teacherSchedule } = useScheduleStore();
  const { settings: _settings } = useSettingsStore();
  void _settings;
  const [filter, setFilter] = useState<FilterMode>('month');

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const today = toLocalDateString(new Date());

  const filtered = useMemo(() => {
    const now = new Date();
    let list = [...overrides];
    if (filter === 'week') {
      const { from, to } = getWeekRange(now);
      list = list.filter((o) => o.date >= from && o.date <= to);
    } else if (filter === 'month') {
      const { from, to } = getMonthRange(now);
      list = list.filter((o) => o.date >= from && o.date <= to);
    } else if (filter === 'past') {
      list = list.filter((o) => o.date < today);
    }
    return list.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.period - b.period;
    });
  }, [overrides, filter, today]);

  /** 기본 시간표에서 (date, period)에 해당하는 정보 조회 */
  const getBaseInfo = (
    o: TimetableOverride,
  ): { classSubject: string; classTeacher: string; teacherSubject: string; teacherClassroom: string } => {
    const d = new Date(o.date + 'T00:00:00');
    const day = getDayOfWeekFull(d);
    const cp = classSchedule[day]?.[o.period - 1];
    const tp = teacherSchedule[day]?.[o.period - 1];
    return {
      classSubject: cp?.subject ?? '',
      classTeacher: cp?.teacher ?? '',
      teacherSubject: tp?.subject ?? '',
      teacherClassroom: tp?.classroom ?? '',
    };
  };

  /** swap 페어의 짝을 찾기 */
  const findPair = (o: TimetableOverride): TimetableOverride | null => {
    if (!o.pairId) return null;
    return overrides.find((x) => x.pairId === o.pairId && x.id !== o.id) ?? null;
  };

  const handleDelete = async (o: TimetableOverride) => {
    const pair = findPair(o);
    if (pair) {
      if (!window.confirm('이 수업은 다른 교시와 짝을 이룬 교체입니다.\n짝까지 함께 삭제하시겠습니까?')) return;
      await deleteOverride(pair.id);
      await deleteOverride(o.id);
    } else {
      if (!window.confirm('이 변동을 삭제하시겠습니까?')) return;
      await deleteOverride(o.id);
    }
  };

  return (
    <Drawer isOpen={open} onClose={onClose} title="변동 시간표" srOnlyTitle side="right" size="lg">
      <div className="flex flex-col h-full">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-sp-border">
          <h3 className="text-base font-bold text-sp-text flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-400 text-lg">swap_horiz</span>
            변동 시간표
          </h3>
          <IconButton icon="close" label="닫기" variant="ghost" size="md" onClick={onClose} />
        </div>

        {/* 툴바 */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-sp-border">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterMode)}
            className="text-xs bg-sp-bg border border-sp-border rounded-lg px-2 py-1.5 text-sp-text focus:outline-none focus:border-sp-accent"
          >
            <option value="week">이번 주</option>
            <option value="month">이번 달</option>
            <option value="all">전체</option>
            <option value="past">지난 변동</option>
          </select>
          <div className="flex-1" />
          <button
            onClick={onAddNew}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-sp-accent text-white rounded-lg hover:bg-blue-600 transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            변동 추가
          </button>
        </div>

        {/* 범례 */}
        <div className="px-5 py-2 border-b border-sp-border bg-sp-bg/30 text-caption text-sp-muted flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-xs text-blue-400">swap_horiz</span>교체
          </span>
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-xs text-green-400">person_add</span>보강
          </span>
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-xs text-amber-400">event_busy</span>자습/공강
          </span>
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-xs">edit_note</span>기타
          </span>
        </div>

        {/* 리스트 */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sp-muted text-sm">
              <span className="material-symbols-outlined text-4xl text-sp-muted/40 mb-2 block">event_busy</span>
              등록된 변동 시간표가 없습니다.
              <div className="mt-1 text-xs text-sp-muted/70">"+ 변동 추가" 또는 시간표 셀 우클릭으로 등록하세요.</div>
            </div>
          ) : (
            <ul className="space-y-2">
              {filtered.map((o) => {
                const past = o.date < today;
                const kind = inferKind(o);
                const meta = KIND_META[kind];
                const base = getBaseInfo(o);
                const pair = findPair(o);
                const afterLabel = o.subject || '자습/공강';
                const effectiveScope: TimetableOverrideScope = o.scope ?? 'both';
                const scopeMeta = SCOPE_META[effectiveScope];
                const appliesTeacher = effectiveScope !== 'class';
                const appliesClass = effectiveScope !== 'teacher';

                return (
                  <li
                    key={o.id}
                    className={`px-3 py-3 bg-sp-bg border border-sp-border rounded-lg ${past ? 'opacity-60' : ''}`}
                  >
                    {/* 상단: 날짜·교시 + 유형 배지 + scope 배지 + 액션 */}
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs text-sp-muted font-medium">
                          {formatDateLabel(o.date)} · {o.period}교시
                        </span>
                        <span
                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-caption font-bold rounded border ${meta.color}`}
                        >
                          <span className="material-symbols-outlined text-detail">{meta.icon}</span>
                          {meta.label}
                        </span>
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 text-caption font-bold rounded border ${scopeMeta.color}`}
                          title={`적용 범위: ${scopeMeta.label}`}
                        >
                          {scopeMeta.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onEdit(o)}
                          className="px-2 py-1 text-detail text-sp-muted hover:text-sp-text hover:bg-sp-surface rounded transition-colors"
                          aria-label="수정"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => void handleDelete(o)}
                          className="px-2 py-1 text-detail text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                          aria-label="삭제"
                        >
                          삭제
                        </button>
                      </div>
                    </div>

                    {/* 교사 관점 */}
                    <div className={`flex items-baseline gap-2 mb-1 text-xs ${appliesTeacher ? '' : 'opacity-40'}`}>
                      <span className={`inline-block w-10 shrink-0 text-caption font-bold ${appliesTeacher ? 'text-sky-400' : 'text-sp-muted/50'}`}>
                        교사
                      </span>
                      {appliesTeacher ? (
                        <>
                          <span className="text-sp-muted">
                            {base.teacherSubject || '(빈 교시)'}
                            {base.teacherClassroom && <span className="ml-0.5 text-sp-muted/60">@{base.teacherClassroom}</span>}
                          </span>
                          <span className="text-sp-muted">→</span>
                          <span className="font-semibold text-sp-text">
                            {afterLabel}
                            {o.classroom && <span className="ml-0.5 text-sp-muted">@{o.classroom}</span>}
                          </span>
                        </>
                      ) : (
                        <span className="text-sp-muted/50 italic">변동 없음 (그대로: {base.teacherSubject || '(빈)'})</span>
                      )}
                    </div>

                    {/* 학급 관점 */}
                    <div className={`flex items-baseline gap-2 text-xs ${appliesClass ? '' : 'opacity-40'}`}>
                      <span className={`inline-block w-10 shrink-0 text-caption font-bold ${appliesClass ? 'text-fuchsia-400' : 'text-sp-muted/50'}`}>
                        학급
                      </span>
                      {appliesClass ? (
                        <>
                          <span className="text-sp-muted">
                            {base.classSubject || '(빈 교시)'}
                            {base.classTeacher && <span className="ml-0.5 text-sp-muted/60">· {base.classTeacher}</span>}
                          </span>
                          <span className="text-sp-muted">→</span>
                          <span className="font-semibold text-sp-text">{afterLabel}</span>
                        </>
                      ) : (
                        <span className="text-sp-muted/50 italic">변동 없음 (그대로: {base.classSubject || '(빈)'})</span>
                      )}
                    </div>

                    {/* 보강 교사 */}
                    {kind === 'substitute' && o.substituteTeacher && (
                      <div className="mt-1 text-detail text-green-400">
                        보강 교사: {o.substituteTeacher}
                      </div>
                    )}

                    {/* swap 페어 링크 */}
                    {pair && (
                      <div className="mt-1.5 px-2 py-1 bg-blue-500/5 border border-blue-500/20 rounded text-detail text-blue-300 flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">link</span>
                        짝: {formatDateLabel(pair.date)} {pair.period}교시와 교체
                      </div>
                    )}

                    {/* 사유 */}
                    {o.reason && (
                      <div className="text-xs text-sp-muted/80 mt-1">
                        사유: {o.reason}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Drawer>
  );
}
