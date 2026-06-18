/**
 * 학생 식별 키 — 성적 매칭용 (순수 함수).
 *
 * 계획서: docs/01-plan/features/grade-analysis.plan.md (§4.2)
 * 교과 수업반은 여러 학급 학생이 섞일 수 있으므로 학년+반+번호+이름을 키로 한다.
 * 기존 TeachingClass.studentKey(학년-반-번호)에 이름을 더해 Excel import/export
 * 매칭 안정성을 높인다. 외부 의존성 import 금지.
 */

export interface GradeStudentRef {
  readonly number: number;
  readonly name: string;
  readonly grade?: number;
  readonly classNum?: number;
}

const SEP = '-';

const isNumeric = (value: string | undefined): boolean =>
  value !== undefined && /^\d+$/.test(value);

/**
 * 학생 키 생성: 학년·반이 있으면 'g-c-n-name', 없으면 'n-name'.
 * 이름의 공백은 매칭 안정성을 위해 제거한다.
 */
export function gradeStudentKey(ref: GradeStudentRef): string {
  const name = ref.name.replace(/\s/g, '');
  if (ref.grade != null && ref.classNum != null) {
    return [ref.grade, ref.classNum, ref.number, name].join(SEP);
  }
  return [ref.number, name].join(SEP);
}

/**
 * 키 파싱(best-effort). 숫자 접두부 기준으로 파싱하며,
 * 이름에 '-'가 포함돼도 마지막 필드로 복원한다. 형식이 아니면 null.
 */
export function parseGradeStudentKey(key: string): GradeStudentRef | null {
  const parts = key.split(SEP);
  if (parts.length >= 4 && isNumeric(parts[0]) && isNumeric(parts[1]) && isNumeric(parts[2])) {
    return {
      grade: Number(parts[0]),
      classNum: Number(parts[1]),
      number: Number(parts[2]),
      name: parts.slice(3).join(SEP),
    };
  }
  if (parts.length >= 2 && isNumeric(parts[0])) {
    return {
      number: Number(parts[0]),
      name: parts.slice(1).join(SEP),
    };
  }
  return null;
}
