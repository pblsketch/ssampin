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
  readonly type: QuestionType;
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

export function QuestionTypeChip({ type, className }: QuestionTypeChipProps): JSX.Element {
  const meta = TYPE_META[type];
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
