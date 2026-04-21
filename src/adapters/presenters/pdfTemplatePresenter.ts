import {
  STUDENT_STATUS_LABELS,
  type Student,
} from '@domain/entities/Student';

/**
 * Domain entity 배열을 pdfme `generate()` 의 inputs 형식으로 변환.
 *
 * 사용 예:
 *   const inputs = mapToInputs(students, studentToBasicInput);
 *   await renderTemplate({ template, inputs });
 */
export function mapToInputs<T>(
  items: readonly T[],
  mapper: (item: T, index: number) => Record<string, string>,
): Array<Record<string, string>> {
  return items.map((item, i) => mapper(item, i));
}

/** 학생 기록부에서 자주 쓰이는 필드 묶음. Phase 2 내장 서식의 reference 매퍼. */
export interface StudentBasicInputContext {
  schoolName?: string;
  className?: string;
  teacherName?: string;
  /** 생성 시각 (기본: new Date()) */
  generatedAt?: Date;
}

/**
 * `Student` 엔티티 → pdfme 입력 맵 (문자열화).
 *
 * undefined/빈 값은 모두 빈 문자열("")로 정규화하여 pdfme 스키마 누락 에러를 피함.
 * 날짜는 YYYY-MM-DD 를 YYYY.MM.DD 형식으로 표시.
 */
export function studentToBasicInput(
  student: Student,
  context: StudentBasicInputContext = {},
): Record<string, string> {
  const generatedAt = context.generatedAt ?? new Date();
  return {
    name: student.name,
    studentNumber:
      student.studentNumber !== undefined ? String(student.studentNumber) : '',
    phone: student.phone ?? '',
    parentPhone: student.parentPhone ?? '',
    parentPhoneLabel: student.parentPhoneLabel ?? '',
    parentPhone2: student.parentPhone2 ?? '',
    parentPhone2Label: student.parentPhone2Label ?? '',
    birthDate: formatBirthDate(student.birthDate),
    status: STUDENT_STATUS_LABELS[student.status ?? 'active'],
    statusNote: student.statusNote ?? '',
    schoolName: context.schoolName ?? '',
    className: context.className ?? '',
    teacherName: context.teacherName ?? '',
    generatedDate: formatKoreanDate(generatedAt),
  };
}

function formatBirthDate(value: string | undefined): string {
  if (!value) return '';
  // YYYY-MM-DD → YYYY.MM.DD
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return value;
  return `${m[1]}.${m[2]}.${m[3]}`;
}

function formatKoreanDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}년 ${m}월 ${day}일`;
}
