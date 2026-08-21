/**
 * toClassSummaries가 필요로 하는 최소 필드만 갖는 로컬 입력 타입.
 * (adapters 레이어의 TeachingClass 전체 — students, seating 등 —를 받지 않고
 * 구조적 타이핑으로 표시에 필요한 필드만 받는다. grade/classNum은 TeachingClass에
 * 직접 없을 수 있어 optional로 받아 없으면 0으로 채운다.)
 */
export interface ClassLike {
  readonly id: string;
  readonly name: string;
  readonly grade?: number;
  readonly classNum?: number;
}

export interface ClassSummary {
  readonly id: string;
  readonly name: string;
  readonly grade: number;
  readonly classNum: number;
}

/**
 * 학급 목록을 모델에 보낼 최소 표시 정보로 변환한다(순수 함수).
 * 학생 명단·좌석 배치 등 다른 필드는 전혀 담지 않는다.
 * grade/classNum이 없는 학급은 0으로 채운다(호출자가 필요 시 별도 필터링).
 */
export function toClassSummaries(classes: readonly ClassLike[]): {
  readonly classes: readonly ClassSummary[];
} {
  return {
    classes: classes.map((c) => ({
      id: c.id,
      name: c.name,
      grade: c.grade ?? 0,
      classNum: c.classNum ?? 0,
    })),
  };
}
