/**
 * 학생 응답 엔티티.
 *
 * DN-02: isCorrect는 quiz 타입(v2 5종: ox/multiple/short/blank/description)에만 boolean.
 * 설문 타입(v1 4종: single-choice/multi-choice/text/scale)은 undefined.
 * calcAccuracy()에서 isCorrect === undefined인 응답은 분모에서 제외.
 */
export interface Response {
  readonly id: string;
  readonly studentId: string;
  readonly questionId: string;
  /**
   * 응답 값.
   * - 주관식(text/short/blank/description): string
   * - 객관식(single-choice/multi-choice/multiple): readonly string[] (choice id 배열)
   * - OX: string ('O' | 'X')
   * - 척도(scale): number
   */
  readonly answer: string | readonly string[] | number;
  /** 응답 제출 시각 (ISO 8601). 빠른 풀이 점수 계산용 */
  readonly submittedAt: string;
  /**
   * 정답 여부.
   * - quiz 타입(ox/multiple/short/blank/description): boolean
   * - survey 타입(single-choice/multi-choice/text/scale): undefined
   */
  readonly isCorrect?: boolean;
  /** 이번 문항 획득 점수. survey 타입은 0 */
  readonly scoreEarned: number;
}
