import { useEffect, useMemo } from 'react';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useSeatingStore } from '@adapters/stores/useSeatingStore';
import { sortByDateDesc } from '@domain/rules/studentRecordRules';
import type { RecordCategory } from '@domain/valueObjects/RecordCategory';

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getTagClass(category: RecordCategory): string {
  const map: Record<RecordCategory, string> = {
    attendance: 'bg-red-500/15 text-red-400',
    counseling: 'bg-blue-500/15 text-blue-400',
    life: 'bg-green-500/15 text-green-400',
    etc: 'bg-gray-500/15 text-gray-400',
  };
  return `px-1.5 py-0.5 rounded text-[10px] font-medium ${map[category]}`;
}

const MAX_PREVIEW = 3;

export function DashboardStudentRecords() {
  const { records, loaded, load } = useStudentRecordsStore();
  const { students, load: loadSeating, loaded: seatingLoaded } =
    useSeatingStore();

  useEffect(() => {
    void load();
    void loadSeating();
  }, [load, loadSeating]);

  const studentMap = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students],
  );

  const today = todayString();
  const todayRecords = useMemo(
    () => sortByDateDesc(records.filter((r) => r.date === today)),
    [records, today],
  );

  if (!loaded || !seatingLoaded) return null;

  return (
    <div className="rounded-xl bg-sp-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-sp-text">👩‍🏫 오늘 기록</h3>
        {todayRecords.length > 0 && (
          <span className="text-xs text-sp-muted">{todayRecords.length}건</span>
        )}
      </div>

      {todayRecords.length === 0 ? (
        <div className="flex items-center justify-center py-6">
          <p className="text-sm text-sp-muted">오늘 기록이 없습니다</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {todayRecords.slice(0, MAX_PREVIEW).map((record) => {
            const student = studentMap.get(record.studentId);
            return (
              <li
                key={record.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5"
              >
                <span className={getTagClass(record.category)}>
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
              <span className="text-xs text-sp-muted">
                +{todayRecords.length - MAX_PREVIEW}건 더
              </span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
