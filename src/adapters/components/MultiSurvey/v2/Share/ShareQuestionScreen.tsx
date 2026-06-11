/**
 * ShareQuestionScreen — 문항 진행 중 교실 모니터 화면.
 *
 * - 문항 텍스트 48px, 보기 36px, 타이머 64px (component-tree §4)
 * - 응답 진행률 실시간 (aria-live="polite")
 * - sp-* 토큰: sp-bg / sp-card / sp-text / sp-accent / sp-border
 */

import { memo, useMemo } from 'react';
import type { Question } from '@domain/entities/multiSurvey/Question';

interface ShareQuestionScreenProps {
  readonly question: Question;
  /** 1-based 현재 문항 번호 */
  readonly questionNumber: number;
  /** 전체 문항 수 */
  readonly totalQuestions: number;
  /** 남은 시간(초) */
  readonly remainingSeconds: number;
  /** 응답 제출 학생 수 */
  readonly answeredCount: number;
  /** 입장 학생 총 수 */
  readonly studentCount: number;
}

function getOptionsForDisplay(question: Question): readonly { id: string; text: string }[] {
  switch (question.type) {
    case 'ox':
      return [
        { id: 'O', text: 'O' },
        { id: 'X', text: 'X' },
      ];
    case 'single-choice':
    case 'multi-choice':
      return question.options;
    case 'multiple':
      return question.choices;
    case 'scale': {
      const items: { id: string; text: string }[] = [];
      for (let v = question.scaleMin; v <= question.scaleMax; v += 1) {
        items.push({ id: String(v), text: String(v) });
      }
      return items;
    }
    default:
      return [];
  }
}

function getTypeLabel(type: Question['type']): string {
  switch (type) {
    case 'ox':
      return 'OX 퀴즈';
    case 'multiple':
      return '객관식';
    case 'short':
      return '단답형';
    case 'blank':
      return '빈칸 채우기';
    case 'description':
      return '서술형';
    case 'single-choice':
      return '단일 선택';
    case 'multi-choice':
      return '복수 선택';
    case 'text':
      return '주관식';
    case 'scale':
      return '척도';
  }
}

function ShareQuestionScreenImpl({
  question,
  questionNumber,
  totalQuestions,
  remainingSeconds,
  answeredCount,
  studentCount,
}: ShareQuestionScreenProps): JSX.Element {
  const options = useMemo(() => getOptionsForDisplay(question), [question]);
  const typeLabel = getTypeLabel(question.type);
  const isTextOnly =
    question.type === 'short' ||
    question.type === 'text' ||
    question.type === 'blank' ||
    question.type === 'description';

  return (
    <section
      className="flex h-full w-full flex-col gap-10 bg-sp-bg px-16 py-12 text-sp-text"
      aria-label="문항 진행 화면"
    >
      {/* 상단 메타 + 타이머 */}
      <div className="flex w-full items-center justify-between">
        <div className="flex items-baseline gap-4">
          <span
            className="rounded-sp-pill border border-sp-border bg-sp-card px-6 py-2 font-sp-semibold text-sp-text"
            style={{ fontSize: 28 }}
          >
            문항 {questionNumber} / {totalQuestions}
          </span>
          <span className="font-sp-medium text-sp-text" style={{ fontSize: 24 }}>
            {typeLabel}
          </span>
        </div>
        <div
          className="flex items-baseline gap-3"
          aria-live="polite"
          aria-label={`남은 시간 ${remainingSeconds}초`}
        >
          <span className="font-sp-bold text-sp-accent" style={{ fontSize: 64 }}>
            {remainingSeconds}
          </span>
          <span className="font-sp-semibold text-sp-text" style={{ fontSize: 28 }}>
            초
          </span>
        </div>
      </div>

      {/* 문항 텍스트 카드 */}
      <div className="rounded-sp-xl border border-sp-border bg-sp-card p-12 shadow-sp-md">
        <p
          className="break-keep font-sp-bold text-sp-text"
          style={{ fontSize: 48, lineHeight: 1.35 }}
        >
          {question.text}
        </p>
      </div>

      {/* 보기 또는 응답 안내 */}
      <div className="flex-1">
        {isTextOnly ? (
          <div className="flex h-full items-center justify-center rounded-sp-xl border border-sp-border bg-sp-card p-10">
            <span className="font-sp-medium text-sp-muted" style={{ fontSize: 32 }}>
              학생 휴대전화에서 직접 입력
            </span>
          </div>
        ) : (
          <div
            className="grid gap-6"
            style={{
              gridTemplateColumns:
                options.length <= 2
                  ? 'repeat(2, minmax(0, 1fr))'
                  : 'repeat(auto-fit, minmax(360px, 1fr))',
            }}
            role="list"
            aria-label="보기 목록"
          >
            {options.map((opt, idx) => (
              <div
                key={opt.id}
                role="listitem"
                className="flex items-center gap-6 rounded-sp-xl border border-sp-border bg-sp-card p-8 shadow-sp-sm"
              >
                <span
                  className="flex items-center justify-center rounded-sp-pill bg-sp-accent font-sp-bold"
                  style={{
                    width: 64,
                    height: 64,
                    fontSize: 32,
                    color: 'var(--sp-accent-fg)',
                  }}
                >
                  {idx + 1}
                </span>
                <span
                  className="break-keep font-sp-semibold text-sp-text"
                  style={{ fontSize: 36, lineHeight: 1.3 }}
                >
                  {opt.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 응답 진행률 */}
      <div
        className="flex items-baseline justify-end gap-3"
        aria-live="polite"
        aria-label={`응답한 학생 ${answeredCount}명 / 전체 ${studentCount}명`}
      >
        <span className="font-sp-bold text-sp-accent" style={{ fontSize: 48 }}>
          {answeredCount}
        </span>
        <span className="font-sp-semibold text-sp-text" style={{ fontSize: 28 }}>
          / {studentCount}명 응답
        </span>
      </div>
    </section>
  );
}

export const ShareQuestionScreen = memo(ShareQuestionScreenImpl);
