/**
 * 학교 평가 운영계획 도메인 엔티티 (evaluation-rubric-import).
 *
 * 계획서: docs/01-plan/features/evaluation-rubric-import.plan.md (§8)
 * 학교알리미에 공시된 "교과별(학년별) 교수·학습 및 평가계획" hwp 를 파싱한 결과를
 * 루브릭 초안으로 옮기기 위한 순수 데이터 구조다.
 *
 * 설계 원칙(Scope Guard §14):
 * - tableHtml(HTML) 을 도메인에 담지 않는다 — 평가영역명 등 **텍스트만** 보관.
 * - 점수(척도)는 문서에 없으므로 담지 않는다(교사 입력).
 * - 표시는 원문 markdown 으로(뷰어), 도메인은 추출된 텍스트만.
 */

/** 평가계획 첨부파일 1건 (목록 표시·다운로드 식별용) */
export interface EvaluationPlanDoc {
  readonly seq: string;
  readonly filename: string;
  readonly sizeKB?: number;
}

/** 학교 검색 결과 1건 (학교알리미 SHL_IDF_CD 브리지) */
export interface EvaluationSchool {
  readonly shlIdfCd: string;
  readonly name: string;
  readonly address: string;
  /** 학교급(표시용 — '중학교'/'고등학교' 등, 비어 있을 수 있음) */
  readonly kind: string;
}

/**
 * 평가영역 1개 — 루브릭 평가요소(criterion) 후보.
 * ratio/semester 는 문서에서 인식된 경우에만 채워지는 보조 정보(표시·필터용).
 */
export interface EvaluationArea {
  /** 평가영역/평가요소 이름 (criterion.name 후보) */
  readonly name: string;
  /** 반영비율 원문(예: '30%', '20') — 인식 안 되면 생략 */
  readonly ratio?: string;
  /** 학기 — 표에 학기열이 있을 때만. 미인식 시 null */
  readonly semester?: '1' | '2' | null;
}

/**
 * 한 학년 묶음의 평가 정보. 통합형(B)은 한 문서에 여러 학년/과목,
 * 분리형(A)은 보통 한 학년·한 과목.
 */
export interface EvaluationPlanGrade {
  /** 1~6 (학년 라벨 추출 실패 시 null) */
  readonly grade: number | null;
  /** 화면 라벨 (예: '1학년', 학년 미상이면 '학년 미상') */
  readonly label: string;
  /** 이 묶음에서 추출된 과목(등장 순서) */
  readonly subjects: readonly string[];
  /** 과목명 → 평가영역 목록 */
  readonly areasBySubject: Readonly<Record<string, readonly EvaluationArea[]>>;
}

/* ──────────────── 루브릭 후보 (채점기준표 = 루브릭) ──────────────── */

/** 루브릭 수준 초안 — 채점기준표의 한 채점 단계 (점수·설명 포함) */
export interface RubricLevelDraft {
  readonly name: string;
  readonly score: number;
  readonly description?: string;
}

/** 루브릭 평가요소(criterion) 초안 — 자기 수준 목록을 가진다 */
export interface RubricCriterionDraft {
  readonly name: string;
  readonly levels: readonly RubricLevelDraft[];
}

/**
 * 불러오기로 만들 루브릭 후보 1건.
 * - 채점기준표 출처: criteria 의 levels 에 실제 배점·채점기준 설명이 채워진다(hasScores=true).
 * - 평가영역 목록 출처(단순 양식): criteria 는 이름만, levels 는 빌더 기본 수준(hasScores=false).
 */
export interface RubricCandidate {
  /** 과목 (성취기준 코드/캡션 기반, 미상이면 null) */
  readonly subject: string | null;
  /** 학년 (없으면 null) */
  readonly grade: number | null;
  /** 루브릭 제목 후보 (수행평가 항목명 또는 "${과목} 수행평가") */
  readonly title: string;
  readonly criteria: readonly RubricCriterionDraft[];
  /** 채점기준표에서 점수까지 추출됐는지 (false면 교사가 배점 입력) */
  readonly hasScores: boolean;
}

/** 다운로드+파싱된 평가계획 1건 */
export interface ParsedEvaluationPlan {
  readonly filename: string;
  /** 뷰어 표시용 원문 markdown (parseBuffer 결과) */
  readonly markdown: string;
  /**
   * 루브릭 후보 — 채점기준표(점수 포함) 우선, 없으면 단순 평가영역 목록을 후보로 변환.
   * 비어 있으면 호출부는 원문 뷰어로 폴백(AC4/AC7).
   */
  readonly candidates: readonly RubricCandidate[];
  /** 구조화된 학년/과목/영역 (단순 양식 — 진단/호환용) */
  readonly grades: readonly EvaluationPlanGrade[];
  /** 분리형(단일 과목) 문서 여부 */
  readonly isSingleSubject: boolean;
  /** 이미지 문서/추출 품질 저하 — 자동 추출 불가 안내 + 원문 보기 폴백 신호 */
  readonly needsOcr: boolean;
}
