import { useEffect, useMemo, useState } from 'react';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import type { Student } from '@domain/entities/Student';
import { filterActive } from '@domain/rules/studentActivity';
import {
  getCategorySummary,
  getWarningStudents,
  sortByDateDesc,
} from '@domain/rules/studentRecordRules';
import { useMobileStudentStore } from '@mobile/stores/useMobileStudentStore';
import { useMobileStudentRecordsStore } from '@mobile/stores/useMobileStudentRecordsStore';
import { EmptyState } from '@mobile/components/common/EmptyState';
import { CATEGORY_COLORS } from '@mobile/pages/students/shared';
import { DateRangePickerSheet } from '@mobile/components/common/DateRangePickerSheet';

// ============================================================
// 담임 — 반 전체 기록 모아보기 (Feature B §6.2.1, 풀스크린)
// StudentRecordsFullSheet(S1)의 칩/타임라인/RecordRow 패턴을 재사용하되,
// 학생 배지 + 학생 필터를 추가해 학급 전체로 확장한다.
// ============================================================

interface HomeroomRecordsOverviewPageProps {
  onClose: () => void;
}

interface MonthGroup {
  key: string;
  label: string;
  records: StudentRecord[];
}

function groupRecordsByMonth(records: readonly StudentRecord[]): MonthGroup[] {
  const map = new Map<string, StudentRecord[]>();
  for (const r of records) {
    const key = r.date.slice(0, 7);
    const arr = map.get(key);
    if (arr) arr.push(r);
    else map.set(key, [r]);
  }
  return Array.from(map.entries()).map(([key, recs]) => {
    const [y, m] = key.split('-');
    return { key, label: `${y}년 ${Number(m)}월`, records: recs };
  });
}

function formatMonthDay(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

export function HomeroomRecordsOverviewPage({ onClose }: HomeroomRecordsOverviewPageProps) {
  const students = useMobileStudentStore((s) => s.students);
  const studentsLoaded = useMobileStudentStore((s) => s.loaded);
  const loadStudents = useMobileStudentStore((s) => s.load);

  const records = useMobileStudentRecordsStore((s) => s.records);
  const recordsLoaded = useMobileStudentRecordsStore((s) => s.loaded);
  const loadRecords = useMobileStudentRecordsStore((s) => s.load);
  const categories = useMobileStudentRecordsStore((s) => s.categories);

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [studentFilter, setStudentFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);
  const [rangeSheetOpen, setRangeSheetOpen] = useState(false);

  useEffect(() => {
    void loadStudents();
    void loadRecords();
  }, [loadStudents, loadRecords]);

  const activeStudents = useMemo(() => {
    return filterActive(students).sort((a, b) => (a.studentNumber ?? 0) - (b.studentNumber ?? 0));
  }, [students]);

  const studentMap = useMemo(() => {
    const map = new Map<string, Student>();
    for (const s of activeStudents) map.set(s.id, s);
    return map;
  }, [activeStudents]);

  const activeIds = useMemo(() => new Set(activeStudents.map((s) => s.id)), [activeStudents]);

  const homeroomRecords = useMemo(
    () => records.filter((r) => activeIds.has(r.studentId)),
    [records, activeIds],
  );

  // §7.4 — 기간이 설정되면 1차 필터로 적용해 이 페이지 전체(digest·주의 학생·카테고리 카운트·
  // 타임라인)가 그 기간 기준으로 계산되게 한다(없으면 전체 기간 그대로).
  const periodRecords = useMemo(() => {
    if (!dateRange) return homeroomRecords;
    return homeroomRecords.filter((r) => r.date >= dateRange.start && r.date <= dateRange.end);
  }, [homeroomRecords, dateRange]);

  const categorySummary = useMemo(() => getCategorySummary(periodRecords), [periodRecords]);
  const warningStudents = useMemo(
    () => getWarningStudents(periodRecords, activeStudents),
    [periodRecords, activeStudents],
  );

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of periodRecords) {
      counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
    }
    return counts;
  }, [periodRecords]);

  const filteredRecords = useMemo(() => {
    let result = periodRecords;
    if (selectedCategory !== 'all') {
      result = result.filter((r) => r.category === selectedCategory);
    }
    if (studentFilter) {
      result = result.filter((r) => r.studentId === studentFilter);
    }
    return sortByDateDesc(result);
  }, [periodRecords, selectedCategory, studentFilter]);

  const monthGroups = useMemo(() => groupRecordsByMonth(filteredRecords), [filteredRecords]);

  const isLoading = !studentsLoaded || !recordsLoaded;
  const filteredStudentName = studentFilter ? (studentMap.get(studentFilter)?.name ?? null) : null;

  return (
    <div className="flex flex-col h-full">
      <header className="glass-header flex items-center gap-3 px-4 py-3 shrink-0">
        <button
          onClick={onClose}
          className="text-sp-muted active:scale-95 transition-transform"
          style={{ minWidth: 44, minHeight: 44, marginLeft: -8 }}
          aria-label="뒤로가기"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-sp-text">
            반 전체 기록 · {homeroomRecords.length}건
          </h2>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="px-4 py-3 space-y-3 animate-pulse" aria-label="기록을 불러오는 중입니다">
            <p className="text-xs text-sp-muted">기록을 불러오는 중입니다</p>
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="h-10 rounded-lg bg-sp-surface border border-sp-border" />
            ))}
          </div>
        ) : activeStudents.length === 0 ? (
          <EmptyState icon="group_off" text="등록된 학생이 없습니다." />
        ) : (
          <>
            {/* 요약 digest — 비대화형 */}
            <p className="text-sp-muted text-xs flex flex-wrap gap-x-3 px-4 pt-3">
              <span>출결 {categorySummary.attendance}</span>
              <span>상담 {categorySummary.counseling}</span>
              <span>생활 {categorySummary.life}</span>
              <span>기타 {categorySummary.etc}</span>
            </p>

            {/* 주의 학생 줄 — 결석/지각 초과 학생, 이름 탭 시 필터 */}
            {warningStudents.length > 0 && (
              <p className="text-amber-600 dark:text-amber-400 text-xs flex items-center gap-1 flex-wrap px-4 pt-2">
                <span className="material-symbols-outlined text-sm" aria-hidden>
                  warning
                </span>
                <span>결석·지각 잦음:</span>
                {warningStudents.map((w) => (
                  <button
                    key={w.student.id}
                    type="button"
                    onClick={() => setStudentFilter(w.student.id)}
                    className="underline underline-offset-2 min-h-[32px] px-0.5"
                  >
                    {w.student.name}({w.reasons.join(', ')})
                  </button>
                ))}
              </p>
            )}

            {/* 기간 필터 — 트리거(미설정) 또는 활성 칩(설정됨), design §7.4 */}
            <div className="px-4 pt-2">
              {dateRange ? (
                <button
                  type="button"
                  onClick={() => setDateRange(null)}
                  aria-label="기간 필터 해제"
                  className="inline-flex items-center gap-1.5 shrink-0 min-h-[44px] px-3 py-2 rounded-lg text-xs font-medium bg-sp-accent text-sp-accent-fg"
                >
                  {formatMonthDay(dateRange.start)}~{formatMonthDay(dateRange.end)}
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setRangeSheetOpen(true)}
                  className="inline-flex items-center gap-1.5 shrink-0 min-h-[44px] px-3 py-2 rounded-lg text-xs font-medium border border-sp-border text-sp-muted"
                >
                  <span className="material-symbols-outlined text-sm">date_range</span>
                  기간
                </button>
              )}
            </div>

            {rangeSheetOpen && (
              <DateRangePickerSheet
                initialStart={dateRange?.start}
                initialEnd={dateRange?.end}
                onApply={(start, end) => setDateRange({ start, end })}
                onClose={() => setRangeSheetOpen(false)}
              />
            )}

            {/* 카테고리 필터 칩 — S1과 동일 규격 */}
            <div
              className="flex gap-1.5 px-4 py-3 overflow-x-auto no-scrollbar"
              role="tablist"
              aria-label="기록 분류 필터"
            >
              <button
                type="button"
                role="tab"
                aria-selected={selectedCategory === 'all'}
                onClick={() => setSelectedCategory('all')}
                className={`shrink-0 min-h-[44px] px-3 py-2 rounded-lg text-xs font-medium border ${
                  selectedCategory === 'all'
                    ? 'bg-sp-accent text-sp-accent-fg border-sp-accent'
                    : 'border-sp-border text-sp-muted'
                }`}
              >
                전체 {periodRecords.length}
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedCategory === cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`shrink-0 min-h-[44px] px-3 py-2 rounded-lg text-xs font-medium border ${
                    selectedCategory === cat.id
                      ? 'bg-sp-accent text-sp-accent-fg border-sp-accent'
                      : 'border-sp-border text-sp-muted'
                  }`}
                >
                  {cat.name.split('(')[0]?.trim()} {categoryCounts.get(cat.id) ?? 0}
                </button>
              ))}
            </div>

            {/* 활성 학생 필터 칩 (§4.1 "활성" 규격 재사용) */}
            {studentFilter && filteredStudentName && (
              <div className="px-4 pb-2">
                <button
                  type="button"
                  onClick={() => setStudentFilter(null)}
                  aria-label="학생 필터 해제"
                  className="inline-flex items-center gap-1.5 shrink-0 min-h-[44px] px-3 py-2 rounded-lg text-xs font-medium bg-sp-accent text-sp-accent-fg"
                >
                  학생: {filteredStudentName}
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
            )}

            {/* 타임라인 */}
            <div className="px-4 pb-4 space-y-4">
              {homeroomRecords.length === 0 ? (
                <EmptyState
                  mascot
                  text="아직 기록이 없습니다."
                  hint="학생 상세에서 기록을 추가해보세요."
                />
              ) : filteredRecords.length === 0 ? (
                <EmptyState icon="filter_alt_off" text="해당 조건의 기록이 없습니다." />
              ) : (
                monthGroups.map((group) => (
                  <div key={group.key}>
                    <p className="text-sp-muted text-xs font-semibold mb-2 px-1 sticky top-0 bg-sp-card py-1 -mx-1">
                      {group.label}
                    </p>
                    <div className="space-y-2">
                      {group.records.map((rec) => {
                        const student = studentMap.get(rec.studentId);
                        if (!student) return null;
                        return (
                          <RecordRow
                            key={rec.id}
                            record={rec}
                            student={student}
                            categories={categories}
                            onFilterStudent={() => setStudentFilter(student.id)}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// 기록 행 — 학생 배지 + 날짜 + 분류 라벨 + 내용. 행 전체가 버튼(탭 시 해당 학생으로 필터).
// ------------------------------------------------------------
function RecordRow({
  record,
  student,
  categories,
  onFilterStudent,
}: {
  record: StudentRecord;
  student: Student;
  categories: readonly RecordCategoryItem[];
  onFilterStudent: () => void;
}) {
  const cat = categories.find((c) => c.id === record.category);
  const colorClass = CATEGORY_COLORS[cat?.color ?? 'gray'] ?? 'bg-gray-400';
  const label =
    record.category === 'attendance' ? record.subcategory : (record.tags?.join(' · ') ?? '');

  return (
    <button
      type="button"
      onClick={onFilterStudent}
      aria-label={`${student.studentNumber ?? 0}번 ${student.name} 학생으로 필터`}
      className="w-full bg-white/5 backdrop-blur-sm border border-white/10 flex rounded-xl overflow-hidden text-left"
    >
      <div className={`w-1 shrink-0 ${colorClass}`} />
      <div className="flex-1 p-3 min-h-[44px]">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-xs font-medium text-sp-accent">
            {student.studentNumber ?? 0}번 {student.name}
          </span>
          <span className="text-xs text-sp-muted tabular-nums">{formatMonthDay(record.date)}</span>
          {label && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/5 text-sp-muted">
              {label}
            </span>
          )}
        </div>
        <p className="text-sp-text text-sm whitespace-pre-wrap break-words">{record.content}</p>
      </div>
    </button>
  );
}
