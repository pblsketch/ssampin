export interface TeachingClassStudent {
  readonly number: number;
  readonly name: string;
  readonly memo?: string;
  /** 학년 (소속 반이 다른 학생이 섞인 수업반용) */
  readonly grade?: number;
  /** 반 (소속 반이 다른 학생이 섞인 수업반용) */
  readonly classNum?: number;
  /** 결번 여부 */
  readonly isVacant?: boolean;
}

/** 학생 복합 키 (학년-반-번호) — 같은 번호의 다른 반 학생 구분용 */
export function studentKey(s: { number: number; grade?: number; classNum?: number }): string {
  if (s.grade != null && s.classNum != null) {
    return `${s.grade}-${s.classNum}-${s.number}`;
  }
  return String(s.number);
}

export interface TeachingClass {
  readonly id: string;
  readonly name: string;
  readonly subject: string;
  readonly students: readonly TeachingClassStudent[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TeachingClassesData {
  readonly classes: readonly TeachingClass[];
}
