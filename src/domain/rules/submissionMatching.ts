/**
 * 제출물을 **어느 학생 것인지** 정하는 단일 규칙.
 *
 * 배경(2026-09-08 학생 번호 무결성 검토): 과제 조회가 마지막에 "번호만" 비교해서,
 * 1학년 1반 3번이 낸 과제가 1학년 2반 3번 학생 칸에도 같이 붙었다. 서로 다른 학생 ID와
 * 반 정보가 명시되어 있는데도 번호가 그걸 덮었다.
 *
 * 규칙:
 *  1. 학생 ID가 같으면 같은 학생이다(가장 확실).
 *  2. 양쪽에 학년·반이 있으면 **학년·반·번호가 모두** 같아야 한다.
 *  3. 한쪽에 학년·반이 없으면(담임반·구형 제출물) 번호로 잇는다.
 *  4. ★양쪽에 학년·반이 있는데 **서로 다르면** 번호가 같아도 절대 잇지 않는다.
 *  5. 제출물 하나는 학생 한 명에게만 붙는다(먼저 확정된 쪽이 가져간다).
 *
 * 순수 함수 — 스토어·IO·React 를 모른다.
 */

/** 과제 명단 한 줄에서 필요한 것만. */
export interface SubmissionMatchStudent {
  readonly id: string;
  readonly number: number;
  readonly grade?: number;
  readonly classNum?: number;
}

/** 제출물 한 건에서 필요한 것만. 학년·반은 학생 폼이 문자열로 보낸다. */
export interface SubmissionMatchCandidate {
  readonly studentId?: string;
  readonly studentNumber: number;
  readonly studentGrade?: string;
  readonly studentClass?: string;
}

function toNum(v: string | number | undefined | null): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** 명시적으로 어긋난 소속 — 양쪽에 학년·반이 있는데 다르다. 다른 학생이라는 뜻이다. */
export function hasConflictingAffiliation(
  student: SubmissionMatchStudent,
  submission: SubmissionMatchCandidate,
): boolean {
  const sg = toNum(student.grade);
  const sc = toNum(student.classNum);
  const bg = toNum(submission.studentGrade);
  const bc = toNum(submission.studentClass);
  if (sg === undefined || sc === undefined || bg === undefined || bc === undefined) return false;
  return sg !== bg || sc !== bc;
}

/** 양쪽 모두 학년·반이 있고 서로 같은가. */
function affiliationMatches(
  student: SubmissionMatchStudent,
  submission: SubmissionMatchCandidate,
): boolean {
  const sg = toNum(student.grade);
  const sc = toNum(student.classNum);
  const bg = toNum(submission.studentGrade);
  const bc = toNum(submission.studentClass);
  if (sg === undefined || sc === undefined || bg === undefined || bc === undefined) return false;
  return sg === bg && sc === bc;
}

/** 짝짓기 결과. 명단에 못 붙인 제출물은 숨기지 않고 그대로 돌려준다. */
export interface SubmissionMatchResult<B> {
  /** 학생 id → 제출물. 없는 학생은 미제출. */
  readonly byStudentId: ReadonlyMap<string, B>;
  /**
   * 어느 학생 것인지 **확정하지 못한** 제출물.
   * 소속이 어긋나거나, 소속 정보가 없는데 같은 번호 학생이 둘 이상이라 추측이 필요한 경우다.
   * ★번호만으로 추측해서 붙이지 않는다 — 화면이 교사에게 알리고 교사가 확인한다.
   */
  readonly unmatched: readonly B[];
}

/**
 * 명단과 제출물을 짝짓는다.
 *
 * 짝이 없는 학생은 `byStudentId` 에 없다(= 미제출). 짝이 없는 제출물은 `unmatched` 로 나온다
 * (명단 밖 제출·소속 불일치 — 여기서 억지로 붙이지 않는다).
 */
export function matchSubmissionsToStudents<
  S extends SubmissionMatchStudent,
  B extends SubmissionMatchCandidate,
>(students: readonly S[], submissions: readonly B[]): SubmissionMatchResult<B> {
  const byStudentId = new Map<string, B>();
  const taken = new Set<B>();

  const claim = (student: S, submission: B | undefined): void => {
    if (submission === undefined || taken.has(submission)) return;
    byStudentId.set(student.id, submission);
    taken.add(submission);
  };

  const remaining = (): readonly S[] => students.filter((s) => !byStudentId.has(s.id));

  // 명단 안에서 그 번호를 쓰는 학생이 몇 명인가 — 소속 없는 제출물을 번호로 이을 수 있는지 판정한다.
  const numberOwners = new Map<number, number>();
  for (const s of students) numberOwners.set(s.number, (numberOwners.get(s.number) ?? 0) + 1);

  // ① 학생 ID 일치 — 가장 확실
  for (const student of students) {
    claim(
      student,
      submissions.find(
        (b) => !taken.has(b) && typeof b.studentId === 'string' && b.studentId === student.id,
      ),
    );
  }

  // ② 학년·반·번호 복합키 일치
  for (const student of remaining()) {
    claim(
      student,
      submissions.find(
        (b) =>
          !taken.has(b) && b.studentNumber === student.number && affiliationMatches(student, b),
      ),
    );
  }

  // ③ 번호 일치 — 소속이 어긋나지 않고, 그 번호를 쓰는 학생이 명단에 한 명뿐일 때만.
  //    같은 번호 학생이 둘 이상이면 추측이 되므로 붙이지 않는다.
  for (const student of remaining()) {
    if ((numberOwners.get(student.number) ?? 0) !== 1) continue;
    claim(
      student,
      submissions.find(
        (b) =>
          !taken.has(b) &&
          b.studentNumber === student.number &&
          !hasConflictingAffiliation(student, b),
      ),
    );
  }

  return { byStudentId, unmatched: submissions.filter((b) => !taken.has(b)) };
}
