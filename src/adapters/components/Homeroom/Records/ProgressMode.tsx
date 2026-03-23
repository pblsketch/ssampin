import { useState, useMemo, useCallback } from 'react';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import {
  filterByStudent,
  filterByDateRange,
  getAttendanceStats,
  getCategorySummary,
  getWarningStudents,
} from '@domain/rules/studentRecordRules';
import { SummaryCard, StatBadge } from './RecordStatCards';
import { type ModeProps, getWeekRange, getMonthRange } from './recordUtils';

type StatsPeriod = 'week' | 'month' | 'custom' | 'all';
type StatsTab = 'attendance' | 'counseling' | 'life' | 'all';
type SortKey = 'number' | 'name' | 'absent' | 'late' | 'earlyLeave' | 'resultAbsent' | 'praise' | 'total'
  | 'counseling_count' | 'life_count' | 'all_count';
type SortDir = 'asc' | 'desc';

function toDateInputString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ProgressMode({ students, records }: ModeProps) {
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('all');
  const [statsTab, setStatsTab] = useState<StatsTab>('attendance');
  const [sortKey, setSortKey] = useState<SortKey>('number');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const monthRange = useMemo(() => getMonthRange(), []);
  const [customStart, setCustomStart] = useState<string>(toDateInputString(monthRange.start));
  const [customEnd, setCustomEnd] = useState<string>(toDateInputString(monthRange.end));

  const filteredRecords = useMemo(() => {
    if (statsPeriod === 'week') {
      const { start, end } = getWeekRange();
      return filterByDateRange(records, start, end) as StudentRecord[];
    }
    if (statsPeriod === 'month') {
      const { start, end } = getMonthRange();
      return filterByDateRange(records, start, end) as StudentRecord[];
    }
    if (statsPeriod === 'custom') {
      const start = new Date(customStart + 'T00:00:00');
      const end = new Date(customEnd + 'T23:59:59');
      return filterByDateRange(records, start, end) as StudentRecord[];
    }
    return records as StudentRecord[];
  }, [records, statsPeriod, customStart, customEnd]);

  // 2-5: 요약 카드
  const summary = useMemo(() => getCategorySummary(filteredRecords), [filteredRecords]);

  // 2-5: 주의 학생
  const warningStudents = useMemo(
    () => getWarningStudents(filteredRecords, students),
    [filteredRecords, students],
  );

  const statsRows = useMemo(() => {
    const rows = students.map((student, idx) => {
      const studentRecs = filterByStudent(filteredRecords, student.id);
      const stats = getAttendanceStats(filteredRecords, student.id);
      const counselingCount = studentRecs.filter((r) => r.category === 'counseling').length;
      const lifeCount = studentRecs.filter((r) => r.category === 'life').length;
      const totalRecords = studentRecs.length;
      return { student, stats, counselingCount, lifeCount, totalRecords, idx };
    });

    // 정렬
    const sorted = [...rows];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'number': cmp = a.idx - b.idx; break;
        case 'name': cmp = a.student.name.localeCompare(b.student.name); break;
        case 'absent': cmp = a.stats.absent - b.stats.absent; break;
        case 'late': cmp = a.stats.late - b.stats.late; break;
        case 'earlyLeave': cmp = a.stats.earlyLeave - b.stats.earlyLeave; break;
        case 'resultAbsent': cmp = a.stats.resultAbsent - b.stats.resultAbsent; break;
        case 'praise': cmp = a.stats.praise - b.stats.praise; break;
        case 'total': case 'all_count': cmp = a.totalRecords - b.totalRecords; break;
        case 'counseling_count': cmp = a.counselingCount - b.counselingCount; break;
        case 'life_count': cmp = a.lifeCount - b.lifeCount; break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [students, filteredRecords, sortKey, sortDir]);

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }, [sortKey]);

  const SortHeader = useCallback(({ label, sortId, className }: { label: string; sortId: SortKey; className?: string }) => (
    <th
      onClick={() => handleSort(sortId)}
      className={`p-3 font-medium border-b cursor-pointer hover:text-sp-text transition-colors select-none ${className ?? ''}`}
    >
      {label}
      {sortKey === sortId && (
        <span className="ml-1 text-sp-accent">{sortDir === 'asc' ? '▲' : '▼'}</span>
      )}
    </th>
  ), [handleSort, sortKey, sortDir]);

  const STATS_TABS: { id: StatsTab; label: string }[] = [
    { id: 'attendance', label: '출결' },
    { id: 'counseling', label: '상담' },
    { id: 'life', label: '생활' },
    { id: 'all', label: '전체' },
  ];

  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0">
      {/* 2-5: 요약 카드 */}
      <div className="grid grid-cols-4 gap-3">
        <SummaryCard label="총 기록" value={summary.total} icon="description" color="text-sp-accent" />
        <SummaryCard label="출결" value={summary.attendance} icon="event_busy" color="text-red-400" />
        <SummaryCard label="상담" value={summary.counseling} icon="psychology" color="text-blue-400" />
        <SummaryCard label="생활" value={summary.life} icon="school" color="text-green-400" />
      </div>

      {/* 기간 필터 + 카테고리 탭 */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* 2-5: 카테고리 탭 */}
        <div className="flex gap-1 bg-sp-surface rounded-lg p-1">
          {STATS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatsTab(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${statsTab === tab.id
                ? 'bg-sp-accent text-white'
                : 'text-sp-muted hover:text-sp-text'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1 bg-sp-surface rounded-lg p-1 ml-auto">
          {([
            { id: 'week', label: '이번 주' },
            { id: 'month', label: '이번 달' },
            { id: 'custom', label: '직접 설정' },
            { id: 'all', label: '전체' },
          ] as const).map((f) => (
            <button
              key={f.id}
              onClick={() => setStatsPeriod(f.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${statsPeriod === f.id
                ? 'bg-sp-accent text-white'
                : 'text-sp-muted hover:text-sp-text'
                }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {statsPeriod === 'custom' && (
          <div className="flex items-center gap-2 ml-2">
            <label className="text-xs text-sp-muted">시작일</label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-sp-surface border border-sp-border rounded-lg px-2 py-1.5 text-xs text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
            />
            <span className="text-xs text-sp-muted">~</span>
            <label className="text-xs text-sp-muted">종료일</label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-sp-surface border border-sp-border rounded-lg px-2 py-1.5 text-xs text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
            />
          </div>
        )}
      </div>

      {/* 통계 테이블 */}
      <div className="flex-1 overflow-auto rounded-xl bg-sp-card">
        <table className="w-full text-sm border-collapse timetable-grid">
          <thead>
            <tr className="text-sp-muted">
              <SortHeader label="번호" sortId="number" className="text-left" />
              <SortHeader label="이름" sortId="name" className="text-left" />
              {statsTab === 'attendance' && (
                <>
                  <SortHeader label="결석" sortId="absent" className="text-center border-l" />
                  <SortHeader label="지각" sortId="late" className="text-center border-l" />
                  <SortHeader label="조퇴" sortId="earlyLeave" className="text-center border-l" />
                  <SortHeader label="결과" sortId="resultAbsent" className="text-center border-l" />
                  <SortHeader label="칭찬" sortId="praise" className="text-center border-l" />
                </>
              )}
              {statsTab === 'counseling' && (
                <SortHeader label="상담 건수" sortId="counseling_count" className="text-center border-l" />
              )}
              {statsTab === 'life' && (
                <SortHeader label="생활 건수" sortId="life_count" className="text-center border-l" />
              )}
              <SortHeader label="전체" sortId="total" className="text-center border-l" />
            </tr>
          </thead>
          <tbody>
            {statsRows.map(({ student, stats, counselingCount, lifeCount, totalRecords, idx }) => (
              <tr key={student.id} className="hover:bg-sp-surface/30 transition-colors">
                <td className="p-3 text-sp-muted border-b">{idx + 1}</td>
                <td className="p-3 text-sp-text font-medium border-b">{student.name}</td>
                {statsTab === 'attendance' && (
                  <>
                    <td className="text-center p-3 border-b border-l"><StatBadge value={stats.absent} color="red" /></td>
                    <td className="text-center p-3 border-b border-l"><StatBadge value={stats.late} color="orange" /></td>
                    <td className="text-center p-3 border-b border-l"><StatBadge value={stats.earlyLeave} color="yellow" /></td>
                    <td className="text-center p-3 border-b border-l"><StatBadge value={stats.resultAbsent} color="purple" /></td>
                    <td className="text-center p-3 border-b border-l"><StatBadge value={stats.praise} color="green" /></td>
                  </>
                )}
                {statsTab === 'counseling' && (
                  <td className="text-center p-3 border-b border-l"><StatBadge value={counselingCount} color="blue" /></td>
                )}
                {statsTab === 'life' && (
                  <td className="text-center p-3 border-b border-l"><StatBadge value={lifeCount} color="green" /></td>
                )}
                <td className="text-center p-3 text-sp-muted border-b border-l">{totalRecords}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 2-5: 주의 학생 */}
      {warningStudents.length > 0 && (
        <div className="rounded-xl bg-sp-card p-4">
          <h3 className="text-sm font-bold text-sp-text flex items-center gap-2 mb-3">
            <span>{'\u26A0\uFE0F'}</span>
            주의 학생
          </h3>
          <div className="flex flex-wrap gap-2">
            {warningStudents.map((ws) => (
              <div
                key={ws.student.id}
                className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20"
              >
                <span className="text-sm font-medium text-red-400">{ws.student.name}</span>
                <span className="text-xs text-red-400/70 ml-2">{ws.reasons.join(', ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export { ProgressMode };
