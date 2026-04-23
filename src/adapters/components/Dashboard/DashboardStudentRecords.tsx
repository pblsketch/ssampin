import { useEffect, useMemo, useState } from 'react';
import { useStudentRecordsStore, RECORD_COLOR_MAP } from '@adapters/stores/useStudentRecordsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { sortByDateDesc } from '@domain/rules/studentRecordRules';

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateKR(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const FALLBACK_COLOR = RECORD_COLOR_MAP['gray']!;

function getTagClass(color: string): string {
  const colorInfo = RECORD_COLOR_MAP[color] ?? FALLBACK_COLOR;
  return `px-1.5 py-0.5 rounded text-caption font-medium ${colorInfo.tagBg}`;
}

type WidgetTab = 'all' | 'attendance' | 'counseling' | 'life';

const WIDGET_TABS: { id: WidgetTab; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'attendance', label: '출결' },
  { id: 'counseling', label: '상담' },
  { id: 'life', label: '생활' },
];

const MAX_PREVIEW = 3;

export function DashboardStudentRecords() {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<WidgetTab>('all');
  const { records, loaded, load, categories } = useStudentRecordsStore();
  const { students, load: loadStudents, loaded: studentsLoaded } = useStudentStore();

  useEffect(() => {
    void load();
    void loadStudents();
  }, [load, loadStudents]);

  // 담임 반 학생 ID로 필터링 — 다른 학급 학생 기록 제외
  const studentIds = useMemo(
    () => new Set(students.map((s) => s.id)),
    [students],
  );
  const homeroomRecords = useMemo(
    () => records.filter((r) => studentIds.has(r.studentId)),
    [records, studentIds],
  );

  const categoryColorMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.color])),
    [categories],
  );

  const studentMap = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students],
  );

  const today = todayString();
  const todayRecords = useMemo(
    () => sortByDateDesc(homeroomRecords.filter((r) => r.date === today)),
    [homeroomRecords, today],
  );

  // 2-3: 미완료 후속 조치
  const pendingFollowUps = useMemo(() => {
    return homeroomRecords.filter((r) => r.followUp && !r.followUpDone);
  }, [homeroomRecords]);

  // Filtered records based on active tab
  const filteredRecords = useMemo(() => {
    if (activeTab === 'all') return todayRecords;
    return todayRecords.filter((r) => r.category === activeTab);
  }, [todayRecords, activeTab]);

  // Attendance stats for attendance tab
  const attendanceStats = useMemo(() => {
    if (activeTab !== 'attendance') return null;
    const activeStudents = students.filter((s) => !s.isVacant);
    const todayAttendance = todayRecords.filter((r) => r.category === 'attendance');

    // Students who have attendance records today
    const studentsWithRecords = new Set(todayAttendance.map((r) => r.studentId));

    let absent = 0;
    let late = 0;
    let earlyLeave = 0;
    let resultAbsent = 0;

    for (const record of todayAttendance) {
      const sub = record.subcategory;
      const type = sub.includes(' (') ? sub.slice(0, sub.indexOf(' (')) : sub;
      if (type === '결석') absent++;
      else if (type === '지각') late++;
      else if (type === '조퇴') earlyLeave++;
      else if (type === '결과') resultAbsent++;
    }

    const present = activeStudents.length - studentsWithRecords.size;

    return { present, absent, late, earlyLeave, resultAbsent, todayAttendance };
  }, [activeTab, todayRecords, students]);

  if (!loaded || !studentsLoaded) return null;

  // Reset expanded state when changing tabs
  const handleTabChange = (tab: WidgetTab) => {
    setActiveTab(tab);
    setExpanded(false);
  };

  return (
    <div className="rounded-xl bg-sp-card p-4 h-full flex flex-col transition-shadow duration-sp-base ease-sp-out hover:shadow-sp-md">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-sp-text flex items-center gap-1.5"><span>👩‍🏫</span>오늘 기록</h3>
        {todayRecords.length > 0 && (
          <span className="text-xs text-sp-muted">{todayRecords.length}건</span>
        )}
      </div>

      {/* Tab UI */}
      <div className="flex gap-1 mb-3">
        {WIDGET_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`flex-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-sp-accent/20 text-sp-accent'
                : 'text-sp-muted hover:text-sp-text hover:bg-sp-text/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {/* Attendance tab: show stats */}
        {activeTab === 'attendance' && attendanceStats ? (
          <div>
            {/* Stats row */}
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              <div className="bg-green-500/10 rounded-lg p-2 text-center">
                <div className="text-green-400 text-sm font-bold">{attendanceStats.present}</div>
                <div className="text-caption text-sp-muted">출석</div>
              </div>
              <div className="bg-red-500/10 rounded-lg p-2 text-center">
                <div className="text-red-400 text-sm font-bold">{attendanceStats.absent}</div>
                <div className="text-caption text-sp-muted">결석</div>
              </div>
              <div className="bg-yellow-500/10 rounded-lg p-2 text-center">
                <div className="text-yellow-400 text-sm font-bold">{attendanceStats.late}</div>
                <div className="text-caption text-sp-muted">지각</div>
              </div>
              <div className="bg-orange-500/10 rounded-lg p-2 text-center">
                <div className="text-orange-400 text-sm font-bold">{attendanceStats.earlyLeave}</div>
                <div className="text-caption text-sp-muted">조퇴</div>
              </div>
            </div>
            {/* Attendance issue list */}
            {attendanceStats.todayAttendance.length > 0 ? (
              <ul className="space-y-1.5">
                {attendanceStats.todayAttendance.map((record) => {
                  const student = studentMap.get(record.studentId);
                  return (
                    <li
                      key={record.id}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                    >
                      <span className={getTagClass(categoryColorMap.get(record.category) ?? 'gray')}>
                        {record.subcategory}
                      </span>
                      <span className="text-sm text-sp-text font-medium">
                        {student?.name ?? '?'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="flex items-center justify-center py-4">
                <p className="text-xs text-sp-muted">오늘 출결 기록이 없습니다</p>
              </div>
            )}
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="flex items-center justify-center py-6">
            <p className="text-sm text-sp-muted">
              {activeTab === 'all' ? '오늘 기록이 없습니다' : '오늘 해당 기록이 없습니다'}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {(expanded ? filteredRecords : filteredRecords.slice(0, MAX_PREVIEW)).map((record) => {
              const student = studentMap.get(record.studentId);
              return (
                <li
                  key={record.id}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                >
                  <span className={getTagClass(categoryColorMap.get(record.category) ?? 'gray')}>
                    {record.subcategory}
                  </span>
                  <span className="text-sm text-sp-text font-medium">
                    {student?.name ?? '?'}
                  </span>
                  {record.content && (
                    <span className="text-xs text-sp-muted truncate flex-1">
                      {record.content}
                    </span>
                  )}
                </li>
              );
            })}
            {filteredRecords.length > MAX_PREVIEW && (
              <li className="text-right">
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs text-sp-accent hover:text-sp-accent/80 transition-colors"
                >
                  {expanded
                    ? '접기'
                    : `+${filteredRecords.length - MAX_PREVIEW}건 더`}
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

      {/* 2-3: 미완료 후속 조치 */}
      {pendingFollowUps.length > 0 && (
        <div className="mt-3 pt-3 border-t border-sp-border">
          <h4 className="text-xs font-bold text-sp-text mb-2">
            {'\uD83D\uDCCC'} 미완료 후속 조치 ({pendingFollowUps.length}건)
          </h4>
          <ul className="space-y-1.5">
            {pendingFollowUps.slice(0, 3).map((record) => {
              const student = studentMap.get(record.studentId);
              const isOverdue = record.followUpDate ? record.followUpDate < today : false;
              const isToday = record.followUpDate === today;
              const colorClass = isOverdue ? 'text-red-400' : isToday ? 'text-orange-400' : 'text-sp-muted';
              return (
                <li key={record.id} className="flex items-center gap-2 text-xs">
                  <span className={`font-medium ${colorClass}`}>
                    {record.followUpDate ? formatDateKR(record.followUpDate) : '-'}
                  </span>
                  <span className="text-sp-text font-medium">{student?.name ?? '?'}</span>
                  <span className="text-sp-muted truncate flex-1">{record.followUp}</span>
                </li>
              );
            })}
            {pendingFollowUps.length > 3 && (
              <li className="text-xs text-sp-muted">+{pendingFollowUps.length - 3}건 더</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
