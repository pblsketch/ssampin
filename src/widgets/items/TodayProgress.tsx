import { useEffect, useMemo } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import type { DayOfWeek } from '@domain/valueObjects/DayOfWeek';
import { DAYS_OF_WEEK } from '@domain/valueObjects/DayOfWeek';
import type { ProgressEntry } from '@domain/entities/CurriculumProgress';

/**
 * 오늘 수업 진도 위젯
 * 오늘 가르칠 학급별 진도 상태를 확인
 */
export function TodayProgress() {
  const { classes, progressEntries, load: loadClasses } = useTeachingClassStore();
  const { teacherSchedule, load: loadSchedule } = useScheduleStore();

  useEffect(() => {
    void loadClasses();
    void loadSchedule();
  }, [loadClasses, loadSchedule]);

  const today = useMemo((): DayOfWeek | null => {
    const dayIndex = new Date().getDay(); // 0=Sun, 1=Mon...6=Sat
    if (dayIndex === 0 || dayIndex === 6) return null;
    return DAYS_OF_WEEK[dayIndex - 1] ?? null;
  }, []);

  const isWeekend = today === null;

  const todayLessons = useMemo(() => {
    if (today === null) return [];
    const periods = teacherSchedule[today] ?? [];
    return periods
      .map((period, index) => {
        if (period === null) return null;
        const periodNumber = index + 1;
        const matchedClass = classes.find((cls) => cls.name === period.classroom) ?? null;
        const todayStr = new Date().toISOString().slice(0, 10);
        const progress: ProgressEntry | null = matchedClass !== null
          ? (progressEntries.find(
              (e) =>
                e.classId === matchedClass.id &&
                e.date === todayStr &&
                e.period === periodNumber,
            ) ?? null)
          : null;
        return {
          period: periodNumber,
          subject: period.subject,
          classroom: period.classroom,
          progress,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [today, teacherSchedule, classes, progressEntries]);

  const completedCount = useMemo(
    () => todayLessons.filter((l) => l.progress?.status === 'completed').length,
    [todayLessons],
  );

  if (isWeekend) {
    return (
      <div className="rounded-xl bg-sp-card p-4 h-full flex flex-col">
        <div className="py-6 text-center text-sm text-sp-muted">
          🎉 오늘은 주말입니다
        </div>
      </div>
    );
  }

  if (todayLessons.length === 0) {
    return (
      <div className="rounded-xl bg-sp-card p-4 h-full flex flex-col">
        <div className="py-6 text-center text-sm text-sp-muted">
          오늘은 수업이 없습니다
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-sp-card p-4 h-full flex flex-col">
      <div className="flex flex-col gap-2 flex-1 overflow-auto">
        {todayLessons.map((lesson) => {
          const statusBadge = getStatusBadge(lesson.progress?.status ?? null);
          return (
            <div key={lesson.period} className="flex items-start gap-3">
              {/* 교시 번호 */}
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-sp-accent/10 text-sp-accent text-xs font-bold flex items-center justify-center">
                {lesson.period}
              </div>
              {/* 학급 + 진도 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-sp-text truncate">
                    {lesson.classroom} {lesson.subject}
                  </span>
                  {statusBadge}
                </div>
                {lesson.progress !== null && (
                  <p className="text-xs text-sp-muted mt-0.5 truncate">
                    {lesson.progress.unit} · {lesson.progress.lesson}
                  </p>
                )}
              </div>
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
