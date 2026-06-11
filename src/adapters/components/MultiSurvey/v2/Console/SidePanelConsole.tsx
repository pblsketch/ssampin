/**
 * SidePanelConsole — 콘솔 우측 사이드 패널.
 *
 * 섹션:
 * - 응답 현황 (현재 문항 응답 수 / 전체 학생 수)
 * - 문항 목록 (currentQuestionIndex 강조)
 * - 컨트롤 (다음 문항, 일시정지, 종료)
 *
 * Phase 전이는 useMultiSurveyV2Store.nextPhase 호출. lobby/open/revealed/round_result/podium/end
 * 모든 phase에서 표시되지만, 컨트롤 활성 조건은 phase별로 다름.
 *
 * sp-* 토큰: sp-surface / sp-border / sp-text / sp-muted
 */

import { memo, useCallback } from 'react';
import type { MultiSurveyV2 } from '@domain/entities/multiSurvey/MultiSurveyV2';
import type { LiveSession } from '@domain/entities/multiSurvey/LiveSession';
import type { Response } from '@domain/entities/multiSurvey/Response';
import { useMultiSurveyV2Store } from '@adapters/stores/useMultiSurveyV2Store';

interface SidePanelConsoleProps {
  readonly survey: MultiSurveyV2;
  readonly live: LiveSession;
  readonly responsesForCurrent: readonly Response[];
  /** 다음 단계 진행 — 학생 페이지 IPC 동기화 포함. 미지정 시 store.nextPhase 직접 호출 */
  readonly onAdvance?: () => void;
  readonly onPause?: () => void;
  readonly onEnd?: () => void;
}

function phaseToLabel(phase: LiveSession['phase']): string {
  switch (phase) {
    case 'lobby':
      return '입장 대기';
    case 'open':
      return '문항 진행 중';
    case 'revealed':
      return '정답 공개';
    case 'round_result':
      return '중간 순위';
    case 'podium':
      return '최종 결과';
    case 'end':
      return '종료';
  }
}

function nextActionLabel(phase: LiveSession['phase']): string {
  switch (phase) {
    case 'lobby':
      return '수업 시작';
    case 'open':
      return '정답 공개';
    case 'revealed':
      return '다음 문항';
    case 'round_result':
      return '다음 문항';
    case 'podium':
      return '세션 종료';
    case 'end':
      return '완료됨';
  }
}

function SidePanelConsoleImpl({
  survey,
  live,
  responsesForCurrent,
  onAdvance,
  onPause,
  onEnd,
}: SidePanelConsoleProps): JSX.Element {
  const nextPhase = useMultiSurveyV2Store((s) => s.nextPhase);

  const handleNext = useCallback(() => {
    if (onAdvance) {
      onAdvance();
      return;
    }
    nextPhase();
  }, [onAdvance, nextPhase]);

  const expected = live.students.length;
  const responseCount = responsesForCurrent.length;
  const canPause = live.phase === 'open';
  const canAdvance = live.phase !== 'end';

  return (
    <aside
      className="flex h-full flex-col gap-6 bg-sp-surface p-6 text-sp-text"
      aria-label="콘솔 사이드 패널"
    >
      <section aria-label="현재 상태">
        <span className="block font-sp-medium text-sp-muted" style={{ fontSize: 12 }}>
          현재 단계
        </span>
        <span className="block font-sp-bold text-sp-text" style={{ fontSize: 20 }}>
          {phaseToLabel(live.phase)}
        </span>
      </section>

      <section aria-label="응답 현황">
        <span className="block font-sp-medium text-sp-muted" style={{ fontSize: 12 }}>
          이번 문항 응답
        </span>
        <span className="block font-sp-bold text-sp-text" style={{ fontSize: 20 }}>
          {responseCount} / {expected}명
        </span>
      </section>

      <section aria-label="문항 목록" className="flex flex-1 flex-col gap-2 overflow-auto">
        <span className="block font-sp-medium text-sp-muted" style={{ fontSize: 12 }}>
          문항 목록
        </span>
        <ol className="flex flex-col gap-1">
          {survey.questions.map((q, i) => {
            const active = i === live.currentQuestionIndex;
            return (
              <li
                key={q.id}
                className={
                  active
                    ? 'rounded-lg border border-sp-border bg-sp-surface px-3 py-2 font-sp-semibold text-sp-text'
                    : 'rounded-lg px-3 py-2 font-sp-medium text-sp-muted'
                }
                style={{ fontSize: 14 }}
                aria-current={active ? 'true' : undefined}
              >
                <span className="mr-2">{i + 1}.</span>
                <span>{q.text}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-label="컨트롤" className="flex flex-col gap-2 border-t border-sp-border pt-4">
        <button
          type="button"
          onClick={handleNext}
          disabled={!canAdvance}
          className="rounded-lg border border-sp-border bg-sp-surface px-4 py-3 font-sp-semibold text-sp-text hover:border-sp-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-sp-base"
          style={{ fontSize: 16 }}
        >
          {nextActionLabel(live.phase)}
        </button>
        {onPause && (
          <button
            type="button"
            onClick={onPause}
            disabled={!canPause}
            className="rounded-lg border border-sp-border bg-sp-surface px-4 py-3 font-sp-medium text-sp-text hover:border-sp-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-sp-base"
            style={{ fontSize: 14 }}
          >
            일시정지
          </button>
        )}
        <button
          type="button"
          onClick={onEnd}
          className="rounded-lg border border-sp-border bg-sp-surface px-4 py-3 font-sp-medium text-sp-muted hover:border-sp-muted transition-colors duration-sp-base"
          style={{ fontSize: 14 }}
        >
          세션 종료
        </button>
      </section>
    </aside>
  );
}

export const SidePanelConsole = memo(SidePanelConsoleImpl);
