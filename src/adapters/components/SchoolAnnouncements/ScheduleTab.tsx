import { useEffect, useMemo, useState } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { neisPort } from '@adapters/di/container';
import { NEIS_API_KEY } from '@domain/entities/Meal';
import {
  parseNeisScheduleRow,
  filterExcludedNeisEvents,
  deduplicateNeisEvents,
  classifyNeisEvent,
  getAcademicYearRange,
  NEIS_GROUP_LABELS,
  type NeisScheduleEvent,
  type NeisGroup,
} from '@domain/entities/NeisSchedule';
import { EmptyNotice } from './EmptyNotice';

/**
 * 학교 알리미 — 학사일정 탭.
 * NEIS 교육정보 개방포털의 학사일정을 조회 전용으로 표시한다(동기화 아님).
 * 시험 D-day 강조 + 다가오는 일정 목록. 키 불필요(NEIS 키 번들).
 */

type LoadState = 'loading' | 'loaded' | 'error' | 'no-school';

/** 오늘 0시 기준 D-day (양수=미래). dateStr: YYYY-MM-DD */
function calcDday(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function formatDday(n: number): string {
  if (n === 0) return 'D-DAY';
  return n > 0 ? `D-${n}` : `D+${-n}`;
}

function formatDateK(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}월 ${Number(d)}일`;
}

/** 그룹별 칩 색상 — 시험만 강조, 나머지는 중립 */
function groupChipClass(group: NeisGroup): string {
  return group === 'exam' ? 'bg-sp-accent/15 text-sp-accent' : 'bg-sp-text/5 text-sp-muted';
}

export function ScheduleTab() {
  const { settings } = useSettingsStore();
  const officeCode = settings.neis?.atptCode ?? '';
  const schoolCode = settings.neis?.schoolCode ?? '';

  const [state, setState] = useState<LoadState>('loading');
  const [events, setEvents] = useState<readonly NeisScheduleEvent[]>([]);

  useEffect(() => {
    if (!officeCode || !schoolCode) {
      setState('no-school');
      return;
    }
    let cancelled = false;
    setState('loading');
    const { fromDate, toDate } = getAcademicYearRange();
    void neisPort
      .getSchoolSchedule({ apiKey: NEIS_API_KEY, officeCode, schoolCode, fromDate, toDate })
      .then((rows) => {
        if (cancelled) return;
        const parsed = deduplicateNeisEvents(
          filterExcludedNeisEvents(rows.map(parseNeisScheduleRow)),
        );
        setEvents([...parsed].sort((a, b) => a.date.localeCompare(b.date)));
        setState('loaded');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [officeCode, schoolCode]);

  const todayStr = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(
      t.getDate(),
    ).padStart(2, '0')}`;
  }, []);

  const upcoming = useMemo(() => events.filter((e) => e.date >= todayStr), [events, todayStr]);
  const nextExams = useMemo(
    () => upcoming.filter((e) => classifyNeisEvent(e) === 'exam').slice(0, 3),
    [upcoming],
  );

  if (state === 'no-school') {
    return <EmptyNotice icon="school" text="설정에서 학교를 등록하면 학사일정을 볼 수 있어요." />;
  }
  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-sp-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (state === 'error') {
    return (
      <EmptyNotice icon="cloud_off" text="학사일정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." />
    );
  }
  if (events.length === 0) {
    return <EmptyNotice icon="event_busy" text="등록된 학사일정이 없어요." />;
  }

  return (
    <div className="space-y-8">
      {/* 다가오는 시험 D-day */}
      {nextExams.length > 0 && (
        <section>
          <h3 className="text-sm font-sp-semibold text-sp-text mb-3 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-icon text-sp-accent">
              event_upcoming
            </span>
            다가오는 시험
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {nextExams.map((e) => (
              <div key={e.eventId} className="bg-sp-card border border-sp-accent/30 rounded-xl p-4">
                <p className="text-2xl font-bold text-sp-accent">{formatDday(calcDday(e.date))}</p>
                <p className="text-sm font-sp-semibold text-sp-text mt-1 truncate">{e.title}</p>
                <p className="text-xs text-sp-muted mt-0.5">{formatDateK(e.date)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 다가오는 일정 목록 */}
      <section>
        <h3 className="text-sm font-sp-semibold text-sp-text mb-3 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-icon text-sp-muted">calendar_month</span>
          다가오는 일정
        </h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-sp-muted">남은 학사일정이 없어요.</p>
        ) : (
          <ul className="divide-y divide-sp-border rounded-xl border border-sp-border overflow-hidden">
            {upcoming.slice(0, 40).map((e) => {
              const group = classifyNeisEvent(e);
              return (
                <li key={e.eventId} className="flex items-center gap-3 px-4 py-3 bg-sp-card">
                  <span className="text-xs text-sp-muted w-16 shrink-0">{formatDateK(e.date)}</span>
                  <span
                    className={`text-caption px-2 py-0.5 rounded-full shrink-0 ${groupChipClass(group)}`}
                  >
                    {NEIS_GROUP_LABELS[group]}
                  </span>
                  <span className="text-sm text-sp-text flex-1 min-w-0 truncate">{e.title}</span>
                  <span className="text-xs text-sp-muted shrink-0">{formatDday(calcDday(e.date))}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
