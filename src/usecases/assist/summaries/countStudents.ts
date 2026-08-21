/**
 * 이미 학급 단위로 걸러진 학생 배열의 인원수를 센다(순수 함수).
 *
 * 학급 필터링(어느 학급 학생만 넘길지)은 호출자 책임이다 — 이 함수는
 * "받은 배열의 길이 + 표시용 학급명"만 조립한다. 학생 이름·학번 등 식별
 * 정보는 인자로 받되 결과에는 절대 담지 않는다(집계 수치만 반환).
 */
export function countStudents<T>(
  students: readonly T[],
  className: string,
): { readonly className: string; readonly count: number } {
  return {
    className,
    count: students.length,
  };
}
