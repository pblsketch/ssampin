/**
 * QuestionTypeChip — 9종 문항 유형 색상 칩
 *
 * 사용자 결정 3-A:
 * - v2 quiz 5종 — 의미 색상:
 *     ox=sp-info(violet) / multiple=sp-success(green) / short=sp-highlight(amber) /
 *     blank=sp-accent(blue) / description=sp-warning(orange)
 * - v1 survey 4종: 모두 회색톤 (sp-muted 계열, 옅은 강도 차이로 구분)
 *
 * Phase B B.7 S1-A/B 수정 (2026-05-30):
 *  - sp-info / sp-success / sp-warning 데스크톱 테마에 신설 (src/index.css)
 *  - description 회색톤 → sp-warning 의미 색상으로 교체 (Q11 결정 3-A 준수)
 */

import type { QuestionType } from '@domain/entities/multiSurvey/Question';

interface QuestionTypeChipProps {
  /**
   * 문항 유형. 저장된 데이터에는 이 앱이 모르는 유형이 들어있을 수 있으므로
   * (더 새 버전에서 만든 문항) 문자열도 받아 안내로 대체한다.
   */
  readonly type: QuestionType | (string & {});
  readonly className?: string;
}

interface TypeMeta {
  readonly label: string;
  /** Tailwind 클래스 (sp-* 토큰 또는 하드코딩 금지 — 의미 색상 토큰만 사용) */
  readonly bgClass: string;
  readonly textClass: string;
  readonly borderClass: string;
}

const TYPE_META: Record<QuestionType, TypeMeta> = {
  order: {
    label: '순서 배열',
    bgClass: 'bg-sp-accent/10',
    textClass: 'text-sp-accent',
    borderClass: 'border-sp-accent/30',
  },
  ranking: {
    label: '순위 매기기',
    bgClass: 'bg-sp-accent/10',
    textClass: 'text-sp-accent',
    borderClass: 'border-sp-accent/30',
  },
  pin: {
    label: '이미지 위치',
    bgClass: 'bg-sp-accent/10',
    textClass: 'text-sp-accent',
    borderClass: 'border-sp-accent/30',
  },
  numeric: {
    label: '숫자',
    bgClass: 'bg-sp-accent/10',
    textClass: 'text-sp-accent',
    borderClass: 'border-sp-accent/30',
  },
  allocation: {
    label: '점수 배분',
    bgClass: 'bg-sp-accent/10',
    textClass: 'text-sp-accent',
    borderClass: 'border-sp-accent/30',
  },
  matrix: {
    label: '2축 평가',
    bgClass: 'bg-sp-accent/10',
    textClass: 'text-sp-accent',
    borderClass: 'border-sp-accent/30',
  },
  quadrant: {
    label: '2×2 매트릭스',
    bgClass: 'bg-sp-accent/10',
    textClass: 'text-sp-accent',
    borderClass: 'border-sp-accent/30',
  },
  valueline: {
    label: '가치수직선',
    bgClass: 'bg-sp-accent/10',
    textClass: 'text-sp-accent',
    borderClass: 'border-sp-accent/30',
  },
  brainstorm: {
    label: '아이디어·질문',
    bgClass: 'bg-sp-accent/10',
    textClass: 'text-sp-accent',
    borderClass: 'border-sp-accent/30',
  },
  rating: {
    label: '여러 항목 척도',
    bgClass: 'bg-sp-accent/10',
    textClass: 'text-sp-accent',
    borderClass: 'border-sp-accent/30',
  },
  // v2 quiz 5종 — 색상 매핑
  ox: {
    label: 'OX',
    bgClass: 'bg-sp-info/15',
    textClass: 'text-sp-info',
    borderClass: 'border-sp-info/40',
  },
  multiple: {
    label: '객관식',
    bgClass: 'bg-sp-success/15',
    textClass: 'text-sp-success',
    borderClass: 'border-sp-success/40',
  },
  short: {
    label: '단답형',
    bgClass: 'bg-sp-highlight/15',
    textClass: 'text-sp-highlight',
    borderClass: 'border-sp-highlight/40',
  },
  blank: {
    label: '빈칸',
    bgClass: 'bg-sp-accent/15',
    textClass: 'text-sp-accent',
    borderClass: 'border-sp-accent/40',
  },
  description: {
    label: '서술형',
    bgClass: 'bg-sp-warning/15',
    textClass: 'text-sp-warning',
    borderClass: 'border-sp-warning/40',
  },
  // v2 의견 수집 2종 — 정답이 없는 계열임을 점선 테두리로 구분
  wordcloud: {
    label: '워드클라우드',
    bgClass: 'bg-sp-info/10',
    textClass: 'text-sp-info',
    borderClass: 'border-dashed border-sp-info/40',
  },
  qna: {
    label: '질문받기',
    bgClass: 'bg-sp-highlight/10',
    textClass: 'text-sp-highlight',
    borderClass: 'border-dashed border-sp-highlight/40',
  },
  // v1 survey 4종 — 모두 회색톤
  'single-choice': {
    label: '단일선택',
    bgClass: 'bg-sp-muted/10',
    textClass: 'text-sp-muted',
    borderClass: 'border-sp-muted/30',
  },
  'multi-choice': {
    label: '복수선택',
    bgClass: 'bg-sp-muted/15',
    textClass: 'text-sp-muted',
    borderClass: 'border-sp-muted/35',
  },
  text: {
    label: '주관식',
    bgClass: 'bg-sp-muted/10',
    textClass: 'text-sp-muted',
    borderClass: 'border-sp-muted/25',
  },
  scale: {
    label: '척도',
    bgClass: 'bg-sp-muted/15',
    textClass: 'text-sp-muted',
    borderClass: 'border-sp-muted/30',
  },
};

/**
 * 알 수 없는 유형용 표시.
 * 더 새 버전에서 만든 문항을 만나도 화면이 깨지지 않게 한다(예외 대신 안내).
 */
const UNKNOWN_TYPE_META: TypeMeta = {
  label: '알 수 없는 유형',
  bgClass: 'bg-sp-muted/10',
  textClass: 'text-sp-muted',
  borderClass: 'border-dashed border-sp-muted/30',
};

export function QuestionTypeChip({ type, className }: QuestionTypeChipProps): JSX.Element {
  const meta = (TYPE_META as Record<string, TypeMeta | undefined>)[type] ?? UNKNOWN_TYPE_META;
  const classes = [
    'inline-flex items-center px-2 py-0.5 text-xs font-sp-medium rounded-sp-sm border',
    meta.bgClass,
    meta.textClass,
    meta.borderClass,
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      className={classes}
      role="status"
      aria-label={`문항 유형: ${meta.label}`}
      data-question-type={type}
    >
      {meta.label}
    </span>
  );
}

export const QUESTION_TYPE_LABELS: Readonly<Record<QuestionType, string>> = Object.freeze(
  Object.fromEntries(
    (Object.keys(TYPE_META) as QuestionType[]).map((t) => [t, TYPE_META[t].label]),
  ) as Record<QuestionType, string>,
);

/** 알 수 없는 유형에도 안전한 라벨 조회 */
export function questionTypeLabel(type: QuestionType | (string & {})): string {
  return (
    (TYPE_META as Record<string, TypeMeta | undefined>)[type]?.label ?? UNKNOWN_TYPE_META.label
  );
}
