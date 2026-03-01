import type { StudentRecord, AttendanceStats } from '../entities/StudentRecord';
import type { RecordCategory } from '../valueObjects/RecordCategory';

/**
 * 학생별 기록 필터
 */
export function filterByStudent(
  records: readonly StudentRecord[],
  studentId: string,
): readonly StudentRecord[] {
  return records.filter((r) => r.studentId === studentId);
}

/**
 * 카테고리 그룹별 기록 필터
 */
export function filterByCategory(
  records: readonly StudentRecord[],
  category: RecordCategory,
): readonly StudentRecord[] {
  return records.filter((r) => r.category === category);
}

/**
 * 서브카테고리별 기록 필터
 */
export function filterBySubcategory(
  records: readonly StudentRecord[],
  subcategory: string,
): readonly StudentRecord[] {
  return records.filter((r) => r.subcategory === subcategory);
}

/**
 * 기간별 기록 필터 (start <= date <= end)
 */
export function filterByDateRange(
  records: readonly StudentRecord[],
  start: Date,
  end: Date,
): readonly StudentRecord[] {
  const startStr = formatDate(start);
  const endStr = formatDate(end);
  return records.filter((r) => r.date >= startStr && r.date <= endStr);
}

/**
 * 학생별 출결 통계 계산
 */
export function getAttendanceStats(
  records: readonly StudentRecord[],
  studentId: string,
): AttendanceStats {
  const studentRecords = records.filter((r) => r.studentId === studentId);

  const absentSubs = ['생리결석', '병결', '무단결석'];
  const absent = studentRecords.filter(
    (r) => r.category === 'attendance' && absentSubs.includes(r.subcategory),
  ).length;

  const late = studentRecords.filter(
    (r) => r.category === 'attendance' && r.subcategory === '지각',
  ).length;

  const earlyLeave = studentRecords.filter(
    (r) => r.category === 'attendance' && r.subcategory === '조퇴',
  ).length;

  const resultAbsent = studentRecords.filter(
    (r) => r.category === 'attendance' && r.subcategory === '결과',
  ).length;

  const praise = studentRecords.filter(
    (r) => r.category === 'life' && r.subcategory === '칭찬',
  ).length;

  return { absent, late, earlyLeave, resultAbsent, praise };
}

/**
 * 기록을 날짜 최신순으로 정렬
 */
export function sortByDateDesc(
  records: readonly StudentRecord[],
): readonly StudentRecord[] {
  return [...records].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/**
 * Date → "YYYY-MM-DD" 포맷
 */
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
