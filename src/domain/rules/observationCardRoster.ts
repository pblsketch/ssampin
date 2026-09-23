/**
 * 관찰 기록 응원(ADR-135) — 반 카드의 칸 목록(학생 순서·번호 이름표).
 *
 * - 번호는 명렬표 번호 규칙(`numberActiveRoster`)으로 정한다. 배열 위치를 번호로 쓰지 않는다.
 * - 여러 학급 학생이 섞인 수업반(학년·반 묶음이 둘 이상)은 번호만으로 구별이 안 되므로
 *   칸에 "반-번호"(예: 3-15)를 적고, 학년 → 반 → 번호 순으로 놓는다.
 * - 재학 중이 아닌 학생은 칸이 없다.
 */
import type { Student } from '../entities/Student';
import { studentKey, type TeachingClassStudent } from '../entities/TeachingClass';
import { numberActiveRoster } from './rosterNumbering';

export interface CardTile {
  /** 담임: `Student.id` / 수업반: `studentKey` */
  readonly ref: string;
  readonly name: string;
  readonly number: number;
  /** 칸에 적을 글자 — 보통 "15", 섞인 반은 "3-15" */
  readonly label: string;
}

/**
 * 수업반 카드 이름 — "반 이름 과목". 반 이름에 과목이 이미 들어 있으면(예: "선택 문학"·"문학")
 * 과목을 다시 붙이지 않는다.
 */
export function teachingClassTitle(name: string, subject: string): string {
  const n = name.trim();
  const s = subject.trim();
  if (s.length === 0 || n.includes(s)) return n;
  if (n.length === 0) return s;
  return `${n} ${s}`;
}

/**
 * 칩처럼 좁은 자리에 붙이는 짧은 반 이름 — '3학년 2반'·'3-2' → '3-2반', '2반' → '2반'.
 * 모양을 모르면 이름 그대로. 과목은 붙이지 않는다(전체 이름은 이름표·스크린리더에 둔다).
 */
export function shortClassName(name: string): string {
  const n = name.trim();
  const gradeClass = /(\d+)\s*학년\s*(\d+)\s*반/.exec(n) ?? /^(\d+)\s*-\s*(\d+)$/.exec(n);
  if (gradeClass) return `${gradeClass[1]}-${gradeClass[2]}반`;
  return n;
}

export function homeroomTiles(students: readonly Student[]): CardTile[] {
  return numberActiveRoster(students)
    .map((e) => ({
      ref: e.student.id,
      name: e.student.name,
      number: e.number,
      label: String(e.number),
    }))
    .sort((a, b) => a.number - b.number);
}

export function subjectTiles(students: readonly TeachingClassStudent[]): CardTile[] {
  const numbered = numberActiveRoster(students);
  const groups = new Set(
    numbered
      .map((e) => e.student)
      .filter((s) => s.grade !== undefined && s.classNum !== undefined)
      .map((s) => `${s.grade}-${s.classNum}`),
  );
  const mixed = groups.size > 1;
  // 학년까지 섞였으면 "학년-반-번호"(1학년 3반과 2학년 3반의 15번이 같은 이름표가 되지 않게).
  const grades = new Set(numbered.map((e) => e.student.grade).filter((g) => g !== undefined));
  const mixedGrades = grades.size > 1;
  const labelOf = (s: TeachingClassStudent, n: number): string => {
    if (!mixed || s.classNum === undefined) return String(n);
    return mixedGrades && s.grade !== undefined
      ? `${s.grade}-${s.classNum}-${n}`
      : `${s.classNum}-${n}`;
  };
  return numbered
    .map((e) => ({
      tile: {
        ref: studentKey(e.student),
        name: e.student.name,
        number: e.number,
        label: labelOf(e.student, e.number),
      },
      grade: e.student.grade ?? 0,
      classNum: e.student.classNum ?? 0,
    }))
    .sort((a, b) =>
      mixed
        ? a.grade - b.grade || a.classNum - b.classNum || a.tile.number - b.tile.number
        : a.tile.number - b.tile.number,
    )
    .map((x) => x.tile);
}
