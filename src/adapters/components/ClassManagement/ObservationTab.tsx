import { useState, useEffect, useMemo } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { studentKey } from '@domain/entities/TeachingClass';
import { ObservationPanel } from './ObservationPanel';
import { UnifiedExportModal } from './UnifiedExportModal';

interface ObservationTabProps {
  classId: string;
}

type ViewMode = 'student' | 'timeline';
type PeriodFilter = 'all' | 'month' | 'week';

function filterByPeriod<T extends { date: string }>(records: T[], filter: PeriodFilter): T[] {
  if (filter === 'all') return records;
  const now = new Date();
  const cutoff =
    filter === 'month'
      ? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
      : new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  return records.filter((r) => r.date >= cutoff);
}

export function ObservationTab({ classId }: ObservationTabProps) {
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('student');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');

  const classes = useTeachingClassStore((s) => s.classes);
  const records = useObservationStore((s) => s.records);
  const load = useObservationStore((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  const cls = useMemo(() => classes.find((c) => c.id === classId), [classes, classId]);

  const students = useMemo(() => {
    if (!cls) return [];
    return [...cls.students]
      .filter((s) => !s.isVacant && (!s.status || s.status === 'active'))
      .sort((a, b) => a.number - b.number);
  }, [cls]);

  const recordCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of records) {
      if (r.classId !== classId) continue;
      map.set(r.studentId, (map.get(r.studentId) ?? 0) + 1);
    }
    return map;
  }, [records, classId]);

  const lastDateMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of records) {
      if (r.classId !== classId) continue;
      const prev = map.get(r.studentId);
      if (!prev || r.date > prev) {
        map.set(r.studentId, r.date);
      }
    }
    return map;
  }, [records, classId]);

  const getFreshnessColor = (sid: string): string => {
    const lastDate = lastDateMap.get(sid);
    if (!lastDate) return '';
    const diff = Math.floor(
      (Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diff <= 7) return 'bg-green-500/20 text-green-400';
    if (diff <= 14) return 'bg-amber-500/20 text-amber-400';
    return 'bg-red-500/20 text-red-400';
  };

  // Timeline: all records for this class, filtered by period, sorted by date desc
  const timelineRecords = useMemo(() => {
    const filtered = records.filter((r) => r.classId === classId);
    const periodFiltered = filterByPeriod(filtered, periodFilter);
    return periodFiltered.sort((a, b) => b.date.localeCompare(a.date));
  }, [records, classId, periodFilter]);

  // Group timeline records by date
  const timelineByDate = useMemo(() => {
    const groups = new Map<string, typeof timelineRecords>();
    for (const r of timelineRecords) {
      const arr = groups.get(r.date) ?? [];
      arr.push(r);
      groups.set(r.date, arr);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [timelineRecords]);

  const studentMap = useMemo(() => {
    const map = new Map<string, { name: string; number: number }>();
    if (cls) {
      for (const s of cls.students) {
        map.set(studentKey(s), { name: s.name, number: s.number });
      }
    }
    return map;
  }, [cls]);

  const periodChips: { label: string; value: PeriodFilter }[] = [
    { label: '전체', value: 'all' },
    { label: '이번 달', value: 'month' },
    { label: '최근 7일', value: 'week' },
  ];

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-sp-text">{cls?.name ?? '수업반'}</h3>
          <span className="text-xs text-sp-muted">{students.length}명</span>
          {/* View mode toggle */}
          <div className="ml-2 flex items-center rounded-lg border border-sp-border bg-sp-surface p-0.5">
            <button
              onClick={() => setViewMode('student')}
              title="학생별"
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
                viewMode === 'student'
                  ? 'bg-sp-accent/20 text-sp-accent'
                  : 'text-sp-muted hover:text-sp-text'
              }`}
            >
              {/* person icon */}
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              학생별
            </button>
            <button
              onClick={() => setViewMode('timeline')}
              title="타임라인"
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
                viewMode === 'timeline'
                  ? 'bg-sp-accent/20 text-sp-accent'
                  : 'text-sp-muted hover:text-sp-text'
              }`}
            >
              {/* timeline/list icon */}
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h10M4 18h6" />
              </svg>
              타임라인
            </button>
          </div>
        </div>
        <button
          onClick={() => setShowExport(true)}
          className="rounded-lg p-1.5 text-sp-muted transition-colors hover:bg-sp-accent/10 hover:text-sp-accent"
          title="내보내기"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
          </svg>
        </button>
      </div>

      {/* Period filter chips */}
      <div className="flex items-center gap-1.5">
        {periodChips.map((chip) => (
          <button
            key={chip.value}
            onClick={() => setPeriodFilter(chip.value)}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              periodFilter === chip.value
                ? 'bg-sp-accent/20 text-sp-accent'
                : 'bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Body */}
      {viewMode === 'student' ? (
        <div className="flex flex-1 gap-3 overflow-hidden">
          {/* Left: student list */}
          <div className="flex flex-1 flex-col rounded-xl border border-sp-border bg-sp-card overflow-hidden">
            <div className="flex-1 overflow-y-auto p-2">
              {students.length === 0 ? (
                <div className="flex h-full items-center justify-center text-xs text-sp-muted">
                  학생이 없습니다. 명렬/출석 탭에서 학생을 추가하세요
                </div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {students.map((s) => {
                    const sid = studentKey(s);
                    const count = recordCountMap.get(sid) ?? 0;
                    const isSelected = selectedStudentId === sid;
                    return (
                      <button
                        key={sid}
                        onClick={() => setSelectedStudentId(sid)}
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                          isSelected
                            ? 'bg-sp-accent/10 text-sp-text'
                            : 'text-sp-text hover:bg-sp-border/30'
                        }`}
                      >
                        <span className="w-[3rem] shrink-0 text-xs text-sp-muted">
                          {s.number}번
                        </span>
                        <span className="flex-1 text-sm">{s.name}</span>
                        {count > 0 ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${getFreshnessColor(sid)}`}
                          >
                            {count}건
                          </span>
                        ) : (
                          <span className="text-xs text-sp-muted/50">기록 없음</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right: observation panel */}
          {selectedStudentId && (
            <div className="w-[340px] shrink-0">
              <ObservationPanel
                classId={classId}
                studentId={selectedStudentId}
                onClose={() => setSelectedStudentId(null)}
              />
            </div>
          )}
        </div>
      ) : (
        /* Timeline view */
        <div className="flex-1 overflow-y-auto rounded-xl border border-sp-border bg-sp-card p-3">
          {timelineByDate.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-sp-muted">
              기록이 없습니다
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {timelineByDate.map(([date, dateRecords]) => (
                <div key={date}>
                  {/* Date header */}
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs font-semibold text-sp-accent">{date}</span>
                    <div className="h-px flex-1 bg-sp-border" />
                    <span className="text-[10px] text-sp-muted">{dateRecords.length}건</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {dateRecords.map((record) => {
                      const student = studentMap.get(record.studentId);
                      return (
                        <div
                          key={record.id}
                          className="rounded-xl border border-sp-border bg-sp-surface p-3"
                        >
                          <div className="mb-1.5 flex flex-wrap items-center gap-2">
                            <span className="text-xs font-medium text-sp-text">
                              {student ? `${student.name} (${student.number}번)` : record.studentId}
                            </span>
                            {record.tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-sp-accent/10 px-1.5 py-0.5 text-[9px] font-medium text-sp-accent"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                          {record.content && (
                            <p className="whitespace-pre-wrap text-xs leading-relaxed text-sp-text">
                              {record.content}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Export modal */}
      {showExport && (
        <UnifiedExportModal
          classId={classId}
          defaultTab="observation"
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
