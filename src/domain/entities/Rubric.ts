/**
 * 수행평가 채점 (rubric-grading) 도메인 엔티티.
 *
 * 계획서: docs/01-plan/features/rubric-grading.plan.md (Plan v1.1)
 * - D1: 점수는 단순 합계만 (환산·등급 없음)
 * - D5: 수준마다 성취 설명 선택 입력
 * - D7: 수준은 루브릭 공통 축이 아니라 평가 요소에 종속 —
 *       요소마다 수준 개수·이름·배점이 모두 다를 수 있다
 * - D8: '미채점'과 구분되는 '결시' 상태 (합계 산출 제외)
 */

/** 평가 요소 하나에 속한 수준 (요소별 독립 — D7) */
export interface RubricLevel {
  readonly id: string;
  /** 수준 이름 (예: 탁월함/잘함/보통/노력 필요) */
  readonly name: string;
  /** 배점 */
  readonly score: number;
  /** 성취 설명 (선택 입력 — 비워두면 출력물에서 생략, D5) */
  readonly description?: string;
}

/** 평가 요소 — 자기만의 수준 목록을 가진다 (D7) */
export interface RubricCriterion {
  readonly id: string;
  /** 요소 이름 (예: 주장의 명확성) */
  readonly name: string;
  /** 표시 순서 (0-based) */
  readonly order: number;
  readonly levels: readonly RubricLevel[];
}

/** 루브릭 (평가 기준표) — 수업반 스코프 */
export interface Rubric {
  readonly id: string;
  /** 소속 수업반 (TeachingClass.id) */
  readonly classId: string;
  readonly title: string;
  readonly description?: string;
  readonly criteria: readonly RubricCriterion[];
  /**
   * 연결된 2022 개정 성취기준 코드(예: '[12언매01-01]'). 평가계획서(HWP·PDF)를 파싱해 루브릭을 만들 때
   * 파서가 읽은 코드를 **버리지 않고** 여기 싣는다(전에는 과목 추정에만 쓰고 버렸다). 손으로 만든
   * 루브릭은 나중에 붙인다. 코드만 — 원문은 별도 번들에서 찾고 AI 에는 원문을 보내지 않는다.
   * 구 데이터에는 없다(선택). 채점(`RubricGrading`)과 무관하다.
   */
  readonly standardCodes?: readonly string[];
  /**
   * 교사가 **직접 적은** 성취기준 문장. 2026학년도 중3·고3처럼 2022 개정 자료가 아직 없는
   * 학년에서 쓴다. ⚠️ 이 문장도 성취기준 원문일 수 있으므로 AI 로 보내지 않는다.
   */
  readonly standardText?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * 채점 상태 (D8).
 * - graded: 모든 요소 채점 완료
 * - partial: 일부 요소만 채점됨
 * - absent: 결시 — 채점 입력 비활성, 합계 산출 제외
 */
export type RubricGradingStatus = 'graded' | 'partial' | 'absent';

/** 학생 1명에 대한 채점 기록 */
export interface RubricGrading {
  readonly id: string;
  readonly rubricId: string;
  readonly classId: string;
  /** 학생 복합 키 (TeachingClass studentKey) */
  readonly studentId: string;
  readonly status: RubricGradingStatus;
  /** criterionId → 체크한 levelId */
  readonly marks: Readonly<Record<string, string>>;
  /** criterionId → 요소별 특이사항 메모 */
  readonly criterionNotes: Readonly<Record<string, string>>;
  /** 학생별 총평 — 피드백 출력물 마무리 문단용 (D6) */
  readonly overallFeedback?: string;
  readonly gradedAt: string;
}

/** 로컬 JSON 저장 단위 ('rubrics' 키) */
export type RubricsData = {
  rubrics: readonly Rubric[];
  gradings: readonly RubricGrading[];
};
