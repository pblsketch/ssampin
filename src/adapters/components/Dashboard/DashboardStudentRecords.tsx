import { useEffect, useMemo, useState } from 'react';
import { useStudentRecordsStore, RECORD_COLOR_MAP } from '@adapters/stores/useStudentRecordsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { sortByDateDesc } from '@domain/rules/studentRecordRules';

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const FALLBACK_COLOR = RECORD_COLOR_MAP['gray']!;

function getTagClass(color: string): string {
  const colorInfo = RECORD_COLOR_MAP[color] ?? FALLBACK_COLOR;
  return `px-1.5 py-0.5 rounded text-[10px] font-medium ${colorInfo.tagBg}`;
}

const MAX_PREVIEW = 3;

export function DashboardStudentRecords() {
  const [expanded, setExpanded] = useState(false);
  const { records, loaded, load, categories } = useStudentRecordsStore();
  const { students, load: loadStudents, loaded: studentsLoaded } =
    useStudentStore();

  useEffect(() => {
    void load();
    void loadStudents();
  }, [load, loadStudents]);

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
    () => sortByDateDesc(records.filter((r) => r.date === today)),
    [records, today],
  );

  if (!loaded || !studentsLoaded) return null;

  return (
    <div className="rounded-xl bg-sp-card p-4 h-full flex flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-sp-text">👩‍🏫 오늘 기록</h3>
        {todayRecords.length > 0 && (
          <span className="text-xs text-sp-muted">{todayRecords.length}건</span>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {todayRecords.length === 0 ? (
          <div className="flex items-center justify-center py-6">
            <p className="text-sm text-sp-muted">오늘 기록이 없습니다</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {(expanded ? todayRecords : todayRecords.slice(0, MAX_PREVIEW)).map((record) => {
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
            {todayRecords.length > MAX_PREVIEW && (
              <li className="text-right">
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs text-sp-accent hover:text-sp-accent/80 transition-colors"
                >
                  {expanded
                    ? '접기'
                    : `+${todayRecords.length - MAX_PREVIEW}건 더`}
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
