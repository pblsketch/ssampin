import type { StudentRecord, AttendanceStats } from '../entities/StudentRecord';
import type { Student } from '../entities/Student';

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
  category: string,
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
 * 출결 서브카테고리에서 유형을 추출한다.
 * 새 형식: "결석 (질병)" → "결석"
 * 구 형식: "생리결석", "병결", "무단결석" → "결석" / "지각" → "지각" 등
 */
function extractAttendanceType(subcategory: string): string {
  // 새 형식: "유형 (사유)"
  const parenIdx = subcategory.indexOf(' (');
  if (parenIdx !== -1) return subcategory.slice(0, parenIdx);
  // 구 형식 하위호환
  if (['생리결석', '병결', '무단결석'].includes(subcategory)) return '결석';
  return subcategory;
}

/**
 * 학생별 출결 통계 계산
 */
export function getAttendanceStats(
  records: readonly StudentRecord[],
  studentId: string,
): AttendanceStats {
  const studentRecords = records.filter((r) => r.studentId === studentId);
  const attendance = studentRecords.filter((r) => r.category === 'attendance');

  const absent = attendance.filter(
    (r) => extractAttendanceType(r.subcategory) === '결석',
  ).length;

  const late = attendance.filter(
    (r) => extractAttendanceType(r.subcategory) === '지각',
  ).length;

  const earlyLeave = attendance.filter(
    (r) => extractAttendanceType(r.subcategory) === '조퇴',
  ).length;

  const resultAbsent = attendance.filter(
    (r) => extractAttendanceType(r.subcategory) === '결과',
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
 * 키워드 검색 (content 필드에서 대소문자 무시)
 */
export function filterByKeyword(
  records: readonly StudentRecord[],
  keyword: string,
): readonly StudentRecord[] {
  const lower = keyword.toLowerCase();
  return records.filter((r) => r.content.toLowerCase().includes(lower));
}

/**
 * 카테고리별 요약 통계
 */
export interface CategorySummary {
  readonly total: number;
  readonly attendance: number;
  readonly counseling: number;
  readonly life: number;
  readonly etc: number;
}

export function getCategorySummary(
  records: readonly StudentRecord[],
): CategorySummary {
  let attendance = 0;
  let counseling = 0;
  let life = 0;
  let etc = 0;
  for (const r of records) {
    if (r.category === 'attendance') attendance++;
    else if (r.category === 'counseling') counseling++;
    else if (r.category === 'life') life++;
    else etc++;
  }
  return { total: records.length, attendance, counseling, life, etc };
}

/**
 * 주의 학생 판정 (결석/지각 초과)
 */
export interface WarningStudent {
  readonly student: Student;
  readonly absent: number;
  readonly late: number;
  readonly reasons: string[];
}

export function getWarningStudents(
  records: readonly StudentRecord[],
  students: readonly Student[],
  thresholds: { absent: number; late: number } = { absent: 3, late: 5 },
): readonly WarningStudent[] {
  const result: WarningStudent[] = [];
  for (const student of students) {
    const stats = getAttendanceStats(records, student.id);
    const reasons: string[] = [];
    if (stats.absent >= thresholds.absent) {
      reasons.push(`결석 ${stats.absent}회`);
    }
    if (stats.late >= thresholds.late) {
      reasons.push(`지각 ${stats.late}회`);
    }
    if (reasons.length > 0) {
      result.push({
        student,
        absent: stats.absent,
        late: stats.late,
        reasons,
      });
    }
  }
  return result;
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
