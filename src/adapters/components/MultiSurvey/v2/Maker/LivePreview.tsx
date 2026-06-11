/**
 * LivePreview — 360×640 학생 화면 1:1 mock
 *
 * DN-01: TimerScorePanel / ToggleGroup 변경 시 즉시 반영 (parent → props)
 *
 * sp-* 토큰: sp-bg, sp-card, sp-text, sp-accent, sp-border
 */

import { isQuizType, type Question, type Choice } from '@domain/entities/multiSurvey/Question';
import { QUESTION_TYPE_LABELS } from './QuestionTypeChip';

interface LivePreviewProps {
  readonly question: Question | null;
  readonly questionIndex: number;
  readonly totalQuestions: number;
  readonly cumulativeScore?: number;
  readonly showCumulativeScore?: boolean;
  /** 자동 넘김 ON일 때만 타이머 표시 (기본 false) */
  readonly showTimer?: boolean;
}

const PREVIEW_WIDTH = 360;
const PREVIEW_HEIGHT = 640;

function getChoiceList(question: Question): readonly Choice[] {
  if (question.type === 'multiple') return question.choices;
  if (question.type === 'single-choice' || question.type === 'multi-choice') {
    return question.options;
  }
  return [];
}

export function LivePreview({
  question,
  questionIndex,
  totalQuestions,
  cumulativeScore = 0,
  showCumulativeScore = true,
  showTimer = false,
}: LivePreviewProps): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs font-sp-medium text-sp-muted">학생 화면 미리보기</p>
      <div
        role="img"
        aria-label="학생 화면 라이브 미리보기"
        style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}
        className={[
          'flex flex-col bg-sp-bg border border-sp-border rounded-2xl overflow-hidden',
          'shadow-sp-md',
        ].join(' ')}
      >
        {/* 상단 바 */}
        <div className="shrink-0 px-4 py-3 bg-sp-card border-b border-sp-border flex items-center justify-between">
          <span className="text-xs font-sp-medium text-sp-muted tabular-nums">
            {totalQuestions > 0 ? `${questionIndex + 1} / ${totalQuestions}` : '문항 없음'}
          </span>
          {showCumulativeScore && (
            <span className="text-xs font-sp-semibold text-sp-accent tabular-nums">
              ★ {cumulativeScore}
            </span>
          )}
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {!question && (
            <div className="flex-1 flex items-center justify-center text-sm text-sp-muted text-center">
              왼쪽에서 문항을 선택하거나
              <br />
              새로 추가해주세요
            </div>
          )}

          {question && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs font-sp-medium text-sp-muted">
                  {QUESTION_TYPE_LABELS[question.type]}
                </span>
                {showTimer && (
                  <span className="text-xs text-sp-muted tabular-nums">
                    ⏱ {question.timerSeconds}s
                  </span>
                )}
                {isQuizType(question.type) && (
                  <span className="text-xs text-sp-muted tabular-nums">★ {question.score}</span>
                )}
              </div>

              <h3 className="text-base font-sp-semibold text-sp-text leading-snug whitespace-pre-wrap break-words">
                {question.text || '(제목 없음)'}
              </h3>

              {/* OX */}
              {question.type === 'ox' && (
                <div className="grid grid-cols-2 gap-3">
                  {(['O', 'X'] as const).map((ans) => (
                    <button
                      key={ans}
                      type="button"
                      disabled
                      className={[
                        'h-20 inline-flex items-center justify-center rounded-xl text-2xl font-sp-bold',
                        'bg-sp-card border border-sp-border text-sp-text',
                      ].join(' ')}
                    >
                      {ans}
                    </button>
                  ))}
                </div>
              )}

              {/* 객관식 (v2 multiple / v1 single/multi) */}
              {(question.type === 'multiple' ||
                question.type === 'single-choice' ||
                question.type === 'multi-choice') && (
                <ul className="flex flex-col gap-2">
                  {getChoiceList(question).map((choice, idx) => (
                    <li
                      key={choice.id}
                      className={[
                        'px-3 py-2 text-sm text-sp-text rounded-lg border border-sp-border bg-sp-card',
                      ].join(' ')}
                    >
                      <span className="font-sp-semibold text-sp-muted mr-2 tabular-nums">
                        {idx + 1}.
                      </span>
                      {choice.text || `보기 ${idx + 1}`}
                    </li>
                  ))}
                  {getChoiceList(question).length === 0 && (
                    <li className="text-xs text-sp-muted text-center py-3">보기를 추가하세요</li>
                  )}
                </ul>
              )}

              {/* 단답/빈칸 */}
              {(question.type === 'short' || question.type === 'blank') && (
                <div className="mt-2">
                  <div className="w-full px-3 py-3 text-sm text-sp-muted bg-sp-card border border-sp-border rounded-lg">
                    답을 입력하세요
                  </div>
                </div>
              )}

              {/* 서술형 */}
              {question.type === 'description' && (
                <div className="mt-2">
                  <div className="w-full h-32 px-3 py-3 text-sm text-sp-muted bg-sp-card border border-sp-border rounded-lg">
                    {question.minLength}~{question.maxLength}자 서술형 답안
                  </div>
                </div>
              )}

              {/* 척도 */}
              {question.type === 'scale' && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs text-sp-muted">
                    <span>
                      {question.scaleMin}
                      {question.scaleMinLabel ? ` · ${question.scaleMinLabel}` : ''}
                    </span>
                    <span>
                      {question.scaleMax}
                      {question.scaleMaxLabel ? ` · ${question.scaleMaxLabel}` : ''}
                    </span>
                  </div>
                  <div className="mt-2 h-2 bg-sp-card border border-sp-border rounded-pill" />
                </div>
              )}

              {/* 단답 주관식 */}
              {question.type === 'text' && (
                <div className="mt-2">
                  <div className="w-full px-3 py-3 text-sm text-sp-muted bg-sp-card border border-sp-border rounded-lg">
                    자유 응답
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
