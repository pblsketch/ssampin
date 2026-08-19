export type ProgressStatus = 'planned' | 'completed' | 'skipped';

export interface ProgressEntry {
  readonly id: string;
  readonly classId: string;
  readonly date: string;
  readonly period: number;
  readonly unit: string;
  readonly lesson: string;
  readonly status: ProgressStatus;
  readonly note: string;
}

/**
 * 그날 수업이 있었는지에 대한 **사용자 정정**.
 *
 * 앱은 시간표·공휴일·학사일정으로 수업일을 **추정**할 뿐이고, 그 추정은 틀릴 수 있다
 * (체육대회로 빠진 날, 시험기간에 오히려 수업한 날, 학교 사정으로 생긴 보강). 그래서 추정을
 * 사용자가 뒤집을 수 있어야 하고, 뒤집은 사실은 계산 결과가 아니라 **사용자가 준 사실**이므로
 * 저장한다. 반대로 계산 결과 자체는 저장하지 않는다(시간표·학사일정이 바뀌면 무효가 되므로).
 *
 * 판정 우선순위에서 이 값이 **가장 세다** — 사용자가 뒤집으면 공휴일이든 방학이든 그 결정이 이긴다.
 */
export interface LessonDayAdjustment {
  /**
   * 반 단위다. "체육대회라 1학년만 수업 없음"처럼 같은 날도 반마다 갈리기 때문에,
   * 전역으로 두면 손대지 않은 반까지 틀어진다.
   */
  readonly classId: string;
  /** 'YYYY-MM-DD' */
  readonly date: string;
  /**
   * `hasLesson`은 "그날 **시간표가 주는 교시 수를 되살린다**"는 뜻이다. "차시를 1 더한다"가
   * 아니다 — 2교시 연강인 반에서 1만 더하면 틀리고, 시간표상 0교시인 날엔 되살릴 것이 없다
   * (그런 날은 버튼 자체를 막는다. 눌러도 아무 일이 없으면 사용자는 고장으로 읽는다).
   */
  readonly kind: 'hasLesson' | 'noLesson';
  /**
   * ISO. **현재 이 값을 읽는 코드는 없다** — `curriculum-progress`는 항목 병합이 아니라
   * 통파일 LWW로 동기화되기 때문이다. 향후 항목 병합 도입 대비 + 사용자에게 "언제 고쳤는지"를
   * 보여줄 수 있게 남긴다. 지금은 장식이라는 사실을 숨기지 않는다.
   */
  readonly updatedAt: string;
}

export interface CurriculumProgressData {
  readonly entries: readonly ProgressEntry[];
  /**
   * 수업일 추정에 대한 사용자 정정 목록.
   *
   * ⚠️ optional이어야 한다(undefined = 정정 없음). 기존 저장 파일과의 하위호환 전제이며,
   * 구버전 앱으로 되돌아가도 이 키가 살아남아야 한다.
   *
   * ⚠️ 이 필드는 `entries`의 **형제**다. 진도를 저장하는 모든 경로가
   * `{ ...data, entries }` 형태를 지켜야 살아남는다 —
   * 잠금 장치: `src/usecases/classManagement/__tests__/curriculumProgressSiblingPreserve.test.ts`
   */
  readonly lessonDayAdjustments?: readonly LessonDayAdjustment[];
}
