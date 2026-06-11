/**
 * PhaseIndicator — 4단계 진행 상태 표시 (상단 바).
 *
 * 4단계: 입장 → 문항 → 정답 공개 → 결과
 * - showRoundResult(T10) ON 시 '결과' 위치에 '중간 순위' 단계가 합쳐서 표시되고,
 *   round_result도 동일 위치로 매핑.
 * - 현재 phase 단계에 sp-accent, 비활성은 sp-muted.
 *
 * sp-* 토큰: sp-accent / sp-muted / sp-text / sp-border
 */

import { memo } from 'react';
import type { LivePhase } from '@domain/entities/multiSurvey/LiveSession';

interface PhaseIndicatorProps {
  readonly currentPhase: LivePhase;
  /** T10 displayOpts.showPerQuestionScore — true면 round_result 단계가 시각적으로 추가됨 */
  readonly showRoundResult: boolean;
}

type Step = { readonly key: string; readonly label: string; readonly phases: readonly LivePhase[] };

function buildSteps(showRoundResult: boolean): readonly Step[] {
  const base: Step[] = [
    { key: 'lobby', label: '입장', phases: ['lobby'] },
    { key: 'open', label: '문항', phases: ['open'] },
    { key: 'revealed', label: '정답 공개', phases: ['revealed'] },
  ];
  if (showRoundResult) {
    base.push({ key: 'round_result', label: '중간 순위', phases: ['round_result'] });
  }
  base.push({ key: 'podium', label: '결과', phases: ['podium', 'end'] });
  return base;
}

function PhaseIndicatorImpl({ currentPhase, showRoundResult }: PhaseIndicatorProps): JSX.Element {
  const steps = buildSteps(showRoundResult);

  return (
    <nav
      className="flex w-full items-center justify-between bg-sp-bg px-8 py-4"
      aria-label="진행 단계"
    >
      <ol className="flex w-full items-center gap-4">
        {steps.map((step, index) => {
          const active = step.phases.includes(currentPhase);
          return (
            <li key={step.key} className="flex flex-1 items-center gap-3">
              <span
                className={
                  active
                    ? 'flex h-9 w-9 items-center justify-center rounded-full bg-sp-accent font-sp-semibold text-[color:var(--sp-accent-fg)]'
                    : 'flex h-9 w-9 items-center justify-center rounded-full border border-sp-border font-sp-semibold text-sp-muted'
                }
                style={{ fontSize: 16 }}
                aria-current={active ? 'step' : undefined}
              >
                {index + 1}
              </span>
              <span
                className={
                  active ? 'font-sp-semibold text-sp-text' : 'font-sp-medium text-sp-muted'
                }
                style={{ fontSize: 16 }}
              >
                {step.label}
              </span>
              {index < steps.length - 1 && (
                <div className="ml-2 h-px flex-1 bg-sp-border" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export const PhaseIndicator = memo(PhaseIndicatorImpl);
