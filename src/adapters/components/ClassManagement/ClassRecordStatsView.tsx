import { useState, useMemo } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { studentKey } from '@domain/entities/TeachingClass';
import type { AttendanceStatus } from '@domain/entities/Attendance';
import { DEFAULT_OBSERVATION_TAGS } from '@domain/entities/Observation';

type PeriodFilter = 'all' | 'semester' | 'month' | 'week' | 'custom';

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function getFilterRange(filter: PeriodFilter): { start: string | null; end: string | null } {
  if (filter === 'all') return { start: null, end: null };
  const now = new Date();
  if (filter === 'week') {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const start = new Date(now);
    start.setDate(now.getDate() - diff);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return {
      start: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
      end: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`,
    };
  }
  if (filter === 'month') {
    return { start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, end: null };
  }
  if (filter === 'semester') {
    const month = now.getMonth() + 1;
    const semStart = month >= 3 && month < 9 ? 3 : 9;
    const year = semStart === 9 && month < 3 ? now.getFullYear() - 1 : now.getFullYear();
    return { start: `${year}-${String(semStart).padStart(2, '0')}-01`, end: null };
  }
  return { start: null, end: null }; // custom handled separately
}

const ATT_STATUSES: { key: AttendanceStatus; label: string; color: string }[] = [
  { key: 'present', label: '출석', color: 'text-green-400' },
  { key: 'absent', label: '결석', color: 'text-red-400' },
  { key: 'late', label: '지각', color: 'text-amber-400' },
  { key: 'earlyLeave', label: '조퇴', color: 'text-orange-400' },
  { key: 'classAbsence', label: '결과', color: 'text-purple-400' },
];

interface ClassRecordStatsViewProps {
  classId: string;
}

export function ClassRecordStatsView({ classId }: ClassRecordStatsViewProps) {
  const [filter, setFilter] = useState<PeriodFilter>('all');
  const [customStart, setCustomStart] = useState(getMonthStart);
  const [customEnd, setCustomEnd] = useState(todayString);

  const classes = useTeachingClassStore((s) => s.classes);
  const attendanceRecords = useTeachingClassStore((s) => s.attendanceRecords);
  const observationRecords = useObservationStore((s) => s.records);

  const cls = useMemo(() => classes.find((c) => c.id === classId), [classes, classId]);
  const students = useMemo(() => {
    if (!cls) return [];
    return [...cls.students]
      .filter((s) => !s.isVacant && (!s.status || s.status === 'active'))
      .sort((a, b) => a.number - b.number);
  }, [cls]);

  const dateRange = useMemo(() => {
    if (filter === 'custom') return { start: customStart, end: customEnd };
    return getFilterRange(filter);
  }, [filter, customStart, customEnd]);

  /* 출결 통계 */
  const attendanceStats = useMemo(() => {
    const stats = new Map<string, Record<AttendanceStatus, number>>();
    for (const s of students) {
      stats.set(studentKey(s), { present: 0, absent: 0, late: 0, earlyLeave: 0, classAbsence: 0 });
    }
    const filtered = attendanceRecords.filter((r) => r.classId === classId && (!dateRange.start || r.date >= dateRange.start) && (!dateRange.end || r.date <= dateRange.end));
    for (const record of filtered) {
      for (const sa of record.students) {
        const key = studentKey(sa);
        const entry = stats.get(key);
        if (entry) entry[sa.status]++;
      }
    }
    return stats;
  }, [attendanceRecords, classId, students, dateRange]);

  /* 특기사항 통계 */
  const obsStats = useMemo(() => {
    const stats = new Map<string, { total: number; tags: Record<string, number> }>();
    for (const s of students) {
      const tagMap: Record<string, number> = {};
      for (const t of DEFAULT_OBSERVATION_TAGS) tagMap[t] = 0;
      stats.set(studentKey(s), { total: 0, tags: tagMap });
    }
    const filtered = observationRecords.filter((r) => r.classId === classId && (!dateRange.start || r.date >= dateRange.start) && (!dateRange.end || r.date <= dateRange.end));
    for (const r of filtered) {
      const entry = stats.get(r.studentId);
      if (!entry) continue;
      entry.total++;
      for (const tag of r.tags) {
        entry.tags[tag] = (entry.tags[tag] ?? 0) + 1;
      }
    }
    return stats;
  }, [observationRecords, classId, students, dateRange]);

  return (
    <div className="space-y-4">
      {/* 기간 필터 */}
      <div className="flex items-center gap-1 flex-wrap">
        {([
          { id: 'all' as const, label: '전체' },
          { id: 'semester' as const, label: '이번 학기' },
          { id: 'month' as const, label: '이번 달' },
          { id: 'week' as const, label: '이번 주' },
          { id: 'custom' as const, label: '직접 설정' },
        ]).map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f.id ? 'bg-sp-accent text-white' : 'bg-sp-surface text-sp-muted hover:text-sp-text'
            }`}
          >
            {f.label}
          </button>
        ))}
        {filter === 'custom' && (
          <div className="flex items-center gap-1.5 ml-2">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-sp-bg border border-sp-border rounded-lg px-2 py-1 text-xs text-sp-text focus:outline-none focus:border-sp-accent"
              style={{ colorScheme: 'dark' }}
            />
            <span className="text-xs text-sp-muted">~</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-sp-bg border border-sp-border rounded-lg px-2 py-1 text-xs text-sp-text focus:outline-none focus:border-sp-accent"
              style={{ colorScheme: 'dark' }}
            />
          </div>
        )}
      </div>

      {/* 출결 통계 */}
      <div className="bg-sp-card border border-sp-border rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-sp-bg/50 border-b border-sp-border">
          <h3 className="text-sm font-semibold text-sp-text flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base">how_to_reg</span>
            출결 통계
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-sp-muted bg-sp-bg/30">
                <th className="px-4 py-2 text-left font-medium">번호</th>
                <th className="px-4 py-2 text-left font-medium">이름</th>
                {ATT_STATUSES.map((s) => (
                  <th key={s.key} className={`px-3 py-2 text-center font-medium ${s.color}`}>{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-sp-border/50">
              {students.map((s) => {
                const sKey = studentKey(s);
                const stat = attendanceStats.get(sKey);
                return (
                  <tr key={sKey} className="hover:bg-sp-text/[0.02]">
                    <td className="px-4 py-2 text-sp-muted">{s.number}</td>
                    <td className="px-4 py-2 text-sp-text">{s.name}</td>
                    {ATT_STATUSES.map((as) => (
                      <td key={as.key} className={`px-3 py-2 text-center ${as.color} font-medium`}>
                        {stat?.[as.key] ?? 0}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 특기사항 통계 */}
      <div className="bg-sp-card border border-sp-border rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-sp-bg/50 border-b border-sp-border">
          <h3 className="text-sm font-semibold text-sp-text flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base">edit_note</span>
            특기사항 통계
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-sp-muted bg-sp-bg/30">
                <th className="px-4 py-2 text-left font-medium">번호</th>
                <th className="px-4 py-2 text-left font-medium">이름</th>
                <th className="px-3 py-2 text-center font-medium text-sp-accent">기록 수</th>
                {DEFAULT_OBSERVATION_TAGS.map((tag) => (
                  <th key={tag} className="px-3 py-2 text-center font-medium">{tag}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-sp-border/50">
              {students.map((s) => {
                const sKey = studentKey(s);
                const stat = obsStats.get(sKey);
                return (
                  <tr key={sKey} className="hover:bg-sp-text/[0.02]">
                    <td className="px-4 py-2 text-sp-muted">{s.number}</td>
                    <td className="px-4 py-2 text-sp-text">{s.name}</td>
                    <td className="px-3 py-2 text-center text-sp-accent font-medium">{stat?.total ?? 0}</td>
                    {DEFAULT_OBSERVATION_TAGS.map((tag) => (
                      <td key={tag} className="px-3 py-2 text-center text-sp-muted">
                        {stat?.tags[tag] ?? 0}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
