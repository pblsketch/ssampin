import { useEffect, useMemo, useState, useRef } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import type { DayOfWeek } from '@domain/valueObjects/DayOfWeek';
import { DAYS_OF_WEEK } from '@domain/valueObjects/DayOfWeek';
import type { ProgressEntry } from '@domain/entities/CurriculumProgress';
import { findMatchingClass } from '@domain/rules/matchingRules';

/**
 * 오늘 수업 진도 위젯
 * 오늘 가르칠 학급별 진도 상태를 확인
 */
export function TodayProgress() {
  const { classes, progressEntries, load: loadClasses } = useTeachingClassStore();
  const { teacherSchedule, overrides, getEffectiveTeacherSchedule, load: loadSchedule } = useScheduleStore();

  useEffect(() => {
    void loadClasses();
    void loadSchedule();
  }, [loadClasses, loadSchedule]);

  // 위젯 모드에서 30초마다 진도 데이터 리로드
  useEffect(() => {
    const isWidget = new URLSearchParams(window.location.search).get('mode') === 'widget';
    if (!isWidget) return;

    const interval = setInterval(() => {
      void loadClasses();
    }, 30000);

    return () => clearInterval(interval);
  }, [loadClasses]);

  const today = useMemo((): DayOfWeek | null => {
    const dayIndex = new Date().getDay(); // 0=Sun, 1=Mon...6=Sat
    if (dayIndex === 0 || dayIndex === 6) return null;
    return DAYS_OF_WEEK[dayIndex - 1] ?? null;
  }, []);

  const isWeekend = today === null;

  const todayLessons = useMemo(() => {
    if (today === null) return [];
    const todayStr = new Date().toISOString().slice(0, 10);
    const periods = getEffectiveTeacherSchedule(todayStr);
    return periods
      .map((period, index) => {
        if (period === null) return null;
        const periodNumber = index + 1;
        const matchedClass = findMatchingClass(classes, period.classroom, period.subject);
        const progress: ProgressEntry | null = matchedClass !== null
          ? (progressEntries.find(
              (e) =>
                e.classId === matchedClass.id &&
                e.date === todayStr &&
                e.period === periodNumber,
            ) ?? null)
          : null;

        const prevProgress: ProgressEntry | null = matchedClass !== null
          ? (progressEntries
              .filter(
                (e) =>
                  e.classId === matchedClass.id &&
                  e.date < todayStr &&
                  e.status === 'completed',
              )
              .sort((a, b) => {
                if (b.date !== a.date) return b.date.localeCompare(a.date);
                return b.period - a.period;
              })[0] ?? null)
          : null;

        const nextProgress: ProgressEntry | null = matchedClass !== null
          ? (progressEntries
              .filter(
                (e) =>
                  e.classId === matchedClass.id &&
                  e.date > todayStr &&
                  e.status === 'planned',
              )
              .sort((a, b) => {
                if (a.date !== b.date) return a.date.localeCompare(b.date);
                return a.period - b.period;
              })[0] ?? null)
          : null;

        return {
          period: periodNumber,
          subject: period.subject,
          classroom: period.classroom,
          matchedClass,
          progress,
          prevProgress,
          nextProgress,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, teacherSchedule, overrides, classes, progressEntries]);

  const completedCount = useMemo(
    () => todayLessons.filter((l) => l.progress?.status === 'completed').length,
    [todayLessons],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height ?? 0;
      setIsCompact(height < 300);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (isWeekend) {
    return (
      <div ref={containerRef} className="rounded-xl bg-sp-card p-4 h-full flex flex-col">
        <div className="py-6 text-center text-sm text-sp-muted">
          🎉 오늘은 주말입니다
        </div>
      </div>
    );
  }

  if (todayLessons.length === 0) {
    return (
      <div ref={containerRef} className="rounded-xl bg-sp-card p-4 h-full flex flex-col">
        <div className="py-6 text-center text-sm text-sp-muted">
          오늘은 수업이 없습니다
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="rounded-xl bg-sp-card p-4 h-full flex flex-col">
      <div className="flex flex-col gap-2 flex-1 overflow-auto">
        {todayLessons.map((lesson) => {
          const statusBadge = lesson.matchedClass === null
            ? <span className="flex-shrink-0 text-caption text-sp-muted/40 italic">학급 미매칭</span>
            : getStatusBadge(lesson.progress?.status ?? null);
          const hasPrev = lesson.prevProgress !== null;
          const hasNext = lesson.nextProgress !== null;
          const hasToday = lesson.progress !== null;
          const hasAnyProgress = hasPrev || hasToday || hasNext;

          return (
            <div key={lesson.period} className="rounded-xl bg-sp-bg/50 p-3">
              {/* Header */}
              <div className="flex items-center gap-2 mb-1">
                <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-sp-accent/10 text-sp-accent text-xs font-bold flex items-center justify-center">
                  {lesson.period}
                </div>
                <span className="text-sm font-medium text-sp-text truncate flex-1">
                  {lesson.classroom} {lesson.subject}
                </span>
                {statusBadge}
              </div>

              {isCompact ? (
                /* Compact mode: single line like before */
                lesson.progress !== null ? (
                  <p className="ml-9 text-xs text-sp-muted mt-0.5 truncate">
                    {lesson.progress.unit} · {lesson.progress.lesson}
                  </p>
                ) : null
              ) : hasAnyProgress ? (
                <div className="ml-9 space-y-1 mt-1">
                  {/* Unit name */}
                  {hasToday && lesson.progress!.unit && (
                    <p className="text-xs font-medium text-sp-accent/80 mb-1">
                      📖 {lesson.progress!.unit}
                    </p>
                  )}

                  {/* Previous */}
                  {hasPrev && (
                    <div className="flex items-center gap-2 text-xs text-sp-muted/60">
                      <span className="w-14 shrink-0 text-right">지난 시간</span>
                      <span className="truncate">{lesson.prevProgress!.lesson}</span>
                      <span className="shrink-0">✅</span>
                    </div>
                  )}

                  {/* Today (highlighted) */}
                  {hasToday ? (
                    <div className="flex items-center gap-2 text-xs font-medium text-sp-text">
                      <span className="w-14 shrink-0 text-right text-sp-accent">👉 오늘</span>
                      <span className="truncate">{lesson.progress!.lesson}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-sp-muted/50">
                      <span className="w-14 shrink-0 text-right">👉 오늘</span>
                      <span className="italic">진도 미등록</span>
                    </div>
                  )}

                  {/* Next */}
                  {hasNext && (
                    <div className="flex items-center gap-2 text-xs text-sp-muted/60">
                      <span className="w-14 shrink-0 text-right">다음 시간</span>
                      <span className="truncate">{lesson.nextProgress!.lesson}</span>
                    </div>
                  )}

                  {/* Note */}
                  {hasToday && lesson.progress!.note && (
                    <p className="text-caption text-sp-muted/50 mt-1 ml-16">
                      📝 {lesson.progress!.note}
                    </p>
                  )}
                </div>
              ) : lesson.matchedClass === null ? (
                <p className="ml-9 text-xs text-sp-muted/40 italic mt-1">
                  수업 관리에서 학급을 등록해주세요
                </p>
              ) : (
                <p className="ml-9 text-xs text-sp-muted/50 italic mt-1">
                  📝 진도 미등록
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* 하단 진행 바 */}
      <div className="mt-3 pt-3 border-t border-sp-border/30">
        <div className="flex items-center justify-between text-xs text-sp-muted">
          <span>완료 {completedCount} / 전체 {todayLessons.length}</span>
          <div className="w-16 h-1.5 rounded-full bg-sp-surface overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-400 transition-all"
              style={{
                width: `${todayLessons.length > 0 ? (completedCount / todayLessons.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function getStatusBadge(status: 'planned' | 'completed' | 'skipped' | null): JSX.Element {
  if (status === 'completed') {
    return (
      <span className="flex-shrink-0 text-xs font-medium text-emerald-400 flex items-center gap-0.5">
        ✅ 완료
      </span>
    );
  }
  if (status === 'planned') {
    return (
      <span className="flex-shrink-0 text-xs font-medium text-amber-400 flex items-center gap-0.5">
        ⏳ 계획됨
      </span>
    );
  }
  if (status === 'skipped') {
    return (
      <span className="flex-shrink-0 text-xs font-medium text-sp-muted flex items-center gap-0.5">
        ⏭️ 건너뜀
      </span>
    );
  }
  // 미등록
  return (
    <span className="flex-shrink-0 text-xs text-sp-muted/50 flex items-center gap-0.5">
      📝 미등록
    </span>
  );
}
