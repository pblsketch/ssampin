import { useState, useMemo, useEffect } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { studentKey } from '@domain/entities/TeachingClass';
import type { AttendanceStatus } from '@domain/entities/Attendance';
import { DEFAULT_OBSERVATION_TAGS } from '@domain/entities/Observation';

const STATUS_BADGE: Record<AttendanceStatus, string> = {
  present: 'bg-green-500/20 text-green-400',
  absent: 'bg-red-500/20 text-red-400',
  late: 'bg-amber-500/20 text-amber-400',
  earlyLeave: 'bg-orange-500/20 text-orange-400',
  classAbsence: 'bg-purple-500/20 text-purple-400',
};

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: '출석', absent: '결석', late: '지각', earlyLeave: '조퇴', classAbsence: '결과',
};

type CategoryFilter = 'all' | 'attendance' | 'observation';

interface MixedRecord {
  type: 'attendance' | 'observation';
  date: string;
  studentKey: string;
  studentName: string;
  studentNumber: number;
  // attendance fields
  period?: number;
  status?: AttendanceStatus;
  reason?: string;
  memo?: string;
  // observation fields
  id?: string;
  tags?: readonly string[];
  content?: string;
}

interface ClassRecordSearchViewProps {
  classId: string;
}

export function ClassRecordSearchView({ classId }: ClassRecordSearchViewProps) {
  const [studentFilter, setStudentFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [keyword, setKeyword] = useState('');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'semester' | 'month' | 'week' | 'custom'>('all');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [customEnd, setCustomEnd] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  const classes = useTeachingClassStore((s) => s.classes);
  const attendanceRecords = useTeachingClassStore((s) => s.attendanceRecords);
  const observationRecords = useObservationStore((s) => s.records);
  const loadObs = useObservationStore((s) => s.load);
  const customTags = useObservationStore((s) => s.customTags);

  useEffect(() => { void loadObs(); }, [loadObs]);

  const cls = useMemo(() => classes.find((c) => c.id === classId), [classes, classId]);
  const students = useMemo(() => {
    if (!cls) return [];
    return [...cls.students].filter((s) => !s.isVacant).sort((a, b) => a.number - b.number);
  }, [cls]);

  const studentNameMap = useMemo(() => {
    const m = new Map<string, { name: string; number: number }>();
    if (cls) {
      for (const s of cls.students) m.set(studentKey(s), { name: s.name, number: s.number });
    }
    return m;
  }, [cls]);

  const allTags = useMemo(() => [...DEFAULT_OBSERVATION_TAGS, ...customTags], [customTags]);

  /* 통합 레코드 생성 */
  const mixedRecords = useMemo(() => {
    const records: MixedRecord[] = [];

    // 출결 레코드 → 비출석만
    if (categoryFilter !== 'observation') {
      for (const ar of attendanceRecords) {
        if (ar.classId !== classId) continue;
        for (const sa of ar.students) {
          if (sa.status === 'present') continue;
          const sKey = studentKey(sa);
          const info = studentNameMap.get(sKey);
          records.push({
            type: 'attendance',
            date: ar.date,
            studentKey: sKey,
            studentName: info?.name ?? '?',
            studentNumber: info?.number ?? sa.number,
            period: ar.period,
            status: sa.status,
            reason: sa.reason,
            memo: sa.memo,
          });
        }
      }
    }

    // 특기사항 레코드
    if (categoryFilter !== 'attendance') {
      for (const or of observationRecords) {
        if (or.classId !== classId) continue;
        const info = studentNameMap.get(or.studentId);
        records.push({
          type: 'observation',
          date: or.date,
          studentKey: or.studentId,
          studentName: info?.name ?? '?',
          studentNumber: info?.number ?? 0,
          id: or.id,
          tags: or.tags,
          content: or.content,
        });
      }
    }

    return records.sort((a, b) => b.date.localeCompare(a.date));
  }, [attendanceRecords, observationRecords, classId, categoryFilter, studentNameMap]);

  /* 기간 필터 계산 */
  const dateRange = useMemo(() => {
    if (periodFilter === 'all') return { start: null as string | null, end: null as string | null };
    if (periodFilter === 'custom') return { start: customStart, end: customEnd };
    const now = new Date();
    if (periodFilter === 'week') {
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const start = new Date(now); start.setDate(now.getDate() - diff);
      const end = new Date(start); end.setDate(start.getDate() + 6);
      const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { start: fmt(start), end: fmt(end) };
    }
    if (periodFilter === 'month') return { start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, end: null };
    // semester
    const month = now.getMonth() + 1;
    const semStart = month >= 3 && month < 9 ? 3 : 9;
    const year = semStart === 9 && month < 3 ? now.getFullYear() - 1 : now.getFullYear();
    return { start: `${year}-${String(semStart).padStart(2, '0')}-01`, end: null };
  }, [periodFilter, customStart, customEnd]);

  /* 필터 적용 */
  const filtered = useMemo(() => {
    let result = mixedRecords;
    // 기간 필터
    if (dateRange.start) result = result.filter((r) => r.date >= dateRange.start!);
    if (dateRange.end) result = result.filter((r) => r.date <= dateRange.end!);
    if (studentFilter) result = result.filter((r) => r.studentKey === studentFilter);
    if (tagFilter.length > 0) {
      result = result.filter((r) =>
        r.type === 'observation' && r.tags?.some((t) => tagFilter.includes(t)),
      );
    }
    if (keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      result = result.filter((r) =>
        r.studentName.toLowerCase().includes(kw) ||
        r.content?.toLowerCase().includes(kw) ||
        r.memo?.toLowerCase().includes(kw),
      );
    }
    return result;
  }, [mixedRecords, studentFilter, tagFilter, keyword]);

  /* 날짜별 그룹핑 */
  const grouped = useMemo(() => {
    const groups: { date: string; records: MixedRecord[] }[] = [];
    let currentDate = '';
    for (const r of filtered) {
      if (r.date !== currentDate) {
        currentDate = r.date;
        groups.push({ date: r.date, records: [] });
      }
      groups[groups.length - 1]!.records.push(r);
    }
    return groups;
  }, [filtered]);

  return (
    <div className="space-y-3">
      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={studentFilter}
          onChange={(e) => setStudentFilter(e.target.value)}
          className="bg-sp-bg border border-sp-border rounded-lg px-2 py-1.5 text-xs text-sp-text focus:outline-none focus:border-sp-accent"
        >
          <option value="">전체 학생</option>
          {students.map((s) => (
            <option key={studentKey(s)} value={studentKey(s)}>{s.number}번 {s.name}</option>
          ))}
        </select>

        <div className="flex gap-1">
          {([
            { id: 'all' as const, label: '전체' },
            { id: 'attendance' as const, label: '출결' },
            { id: 'observation' as const, label: '특기사항' },
          ]).map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoryFilter(c.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                categoryFilter === c.id ? 'bg-sp-accent text-white' : 'bg-sp-surface text-sp-muted hover:text-sp-text'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {categoryFilter !== 'attendance' && (
          <div className="flex gap-1">
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setTagFilter((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                  tagFilter.includes(tag)
                    ? 'bg-sp-accent text-white'
                    : 'bg-sp-surface text-sp-muted hover:text-sp-text'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="키워드 검색..."
          className="bg-sp-bg border border-sp-border rounded-lg px-2 py-1.5 text-xs text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-sp-accent w-40"
        />

        <span className="text-[10px] text-sp-muted">{filtered.length}건</span>
      </div>

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
            onClick={() => setPeriodFilter(f.id)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
              periodFilter === f.id ? 'bg-sp-accent text-white' : 'bg-sp-surface text-sp-muted hover:text-sp-text'
            }`}
          >
            {f.label}
          </button>
        ))}
        {periodFilter === 'custom' && (
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

      {/* 타임라인 */}
      <div className="space-y-4">
        {grouped.length === 0 ? (
          <div className="py-12 text-center text-sm text-sp-muted">
            조건에 맞는 기록이 없습니다
          </div>
        ) : (
          grouped.map((group) => (
            <div key={group.date}>
              <div className="text-xs text-sp-muted font-medium mb-1.5 px-1">
                {group.date.replace(/^\d{4}-/, '').replace('-', '/')}
              </div>
              <div className="space-y-1.5">
                {group.records.map((r, i) => (
                  <div
                    key={`${r.type}-${r.date}-${r.studentKey}-${r.period ?? r.id ?? i}`}
                    className="bg-sp-surface border border-sp-border rounded-xl px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        r.type === 'attendance' ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'
                      }`}>
                        {r.type === 'attendance' ? '출결' : '특기'}
                      </span>
                      <span className="text-xs font-medium text-sp-text">
                        {r.studentName} <span className="text-sp-muted">{r.studentNumber}번</span>
                      </span>
                      {r.type === 'attendance' && r.status && (
                        <>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${STATUS_BADGE[r.status]}`}>
                            {STATUS_LABEL[r.status]}
                          </span>
                          {r.period && <span className="text-[10px] text-sp-muted">{r.period}교시</span>}
                          {r.reason && <span className="text-[10px] text-sp-muted">({r.reason})</span>}
                        </>
                      )}
                      {r.type === 'observation' && r.tags && (
                        <div className="flex gap-1">
                          {r.tags.map((tag) => (
                            <span key={tag} className="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-sp-accent/10 text-sp-accent">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {r.type === 'attendance' && r.memo && (
                      <p className="text-xs text-sp-muted pl-1">{r.memo}</p>
                    )}
                    {r.type === 'observation' && r.content && (
                      <p className="text-xs text-sp-text leading-relaxed whitespace-pre-wrap pl-1">
                        {r.content.length > 100 ? r.content.slice(0, 100) + '…' : r.content}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
