/**
 * MakerLayout — 3-column 메이커 UI 컨테이너
 *
 * 구조:
 * - grid-cols-[240px_1fr_320px] 기본
 * - 1280px 미만에서는 COL-C(설정 패널)를 드로어로 전환
 *
 * 합성 컴포넌트:
 * - MakerHeader (sticky top)
 * - COL-A: QuestionList
 * - COL-B: QuestionEditor + LivePreview
 * - COL-C: RealtimeToolSettingsPanel (≥1280px: 인라인 / <1280px: drawer)
 *
 * sp-* 토큰: sp-bg, sp-border
 */

import { useEffect, useState } from 'react';
import { useMultiSurveyV2Store, selectSessionById } from '@adapters/stores/useMultiSurveyV2Store';
import type { MultiSurveyV2 } from '@domain/entities/multiSurvey/MultiSurveyV2';
import { MakerHeader } from './MakerHeader';
import { QuestionList } from './QuestionList';
import { QuestionEditor } from './QuestionEditor';
import { LivePreview } from './LivePreview';
import { RealtimeToolSettingsPanel } from './RealtimeToolSettingsPanel';

interface MakerLayoutProps {
  readonly sessionId: string;
  readonly onSave?: () => void;
  readonly onStartGame?: () => void;
}

const COL_C_BREAKPOINT = 1280;

function useIsWideViewport(): boolean {
  const [isWide, setIsWide] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= COL_C_BREAKPOINT;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handle = (): void => setIsWide(window.innerWidth >= COL_C_BREAKPOINT);
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);

  return isWide;
}

export function MakerLayout({ sessionId, onSave, onStartGame }: MakerLayoutProps): JSX.Element {
  const session: MultiSurveyV2 | undefined = useMultiSurveyV2Store((s) =>
    selectSessionById(s, sessionId),
  );
  const isWide = useIsWideViewport();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);

  // 첫 문항을 자동 선택 (선택 없을 때)
  useEffect(() => {
    if (!session) return;
    if (selectedQuestionId && session.questions.some((q) => q.id === selectedQuestionId)) {
      return;
    }
    setSelectedQuestionId(session.questions[0]?.id ?? null);
  }, [session, selectedQuestionId]);

  if (!session) {
    return (
      <div
        className="flex items-center justify-center h-full bg-sp-bg text-sp-text p-4"
        role="alert"
      >
        세션을 찾을 수 없습니다. (id: {sessionId})
      </div>
    );
  }

  const selectedQuestion = session.questions.find((q) => q.id === selectedQuestionId) ?? null;
  const selectedIndex = selectedQuestion
    ? session.questions.findIndex((q) => q.id === selectedQuestion.id)
    : 0;

  const gridCols = isWide ? 'grid-cols-[240px_1fr_320px]' : 'grid-cols-[240px_1fr]';

  return (
    <div className="flex flex-col h-full bg-sp-bg" role="application" aria-label="복합 설문 메이커">
      <MakerHeader session={session} onSave={onSave} onStartGame={onStartGame} />

      <div className={`grid ${gridCols} flex-1 min-h-0 border-t border-sp-border`}>
        {/* COL-A: 문항 목록 */}
        <div className="min-h-0 overflow-hidden">
          <QuestionList
            sessionId={sessionId}
            questions={session.questions}
            selectedQuestionId={selectedQuestionId}
            onSelectQuestion={setSelectedQuestionId}
          />
        </div>

        {/* COL-B: 편집 + 미리보기 */}
        <div className="min-h-0 overflow-y-auto p-4 flex flex-col xl:flex-row gap-4">
          <div className="flex-1 min-w-0">
            {selectedQuestion ? (
              <QuestionEditor sessionId={sessionId} question={selectedQuestion} />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-sp-muted">
                좌측에서 문항을 선택하거나 새로 추가해주세요
              </div>
            )}
          </div>

          <div className="shrink-0 self-start">
            <LivePreview
              question={selectedQuestion}
              questionIndex={selectedIndex}
              totalQuestions={session.questions.length}
              showCumulativeScore={session.presentationOpts.showCumulativeScore}
              showTimer={session.responseOpts.autoAdvance}
            />
          </div>
        </div>

        {/* COL-C: 인라인 (≥1280px) */}
        {isWide && (
          <div className="min-h-0 overflow-hidden">
            <RealtimeToolSettingsPanel
              sessionId={sessionId}
              presentationOpts={session.presentationOpts}
              responseOpts={session.responseOpts}
              displayOpts={session.displayOpts}
            />
          </div>
        )}
      </div>

      {/* COL-C 드로어 (<1280px) */}
      {!isWide && (
        <>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="설정 패널 열기"
            className={[
              'fixed bottom-6 right-6 z-40 px-4 py-2 rounded-full',
              'bg-sp-accent text-[color:var(--sp-accent-fg)] shadow-sp-md',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sp-bg',
            ].join(' ')}
          >
            설정
          </button>

          {drawerOpen && (
            <div
              className="fixed inset-0 z-sp-modal flex"
              role="dialog"
              aria-modal="true"
              aria-label="실시간 도구 설정"
            >
              <button
                type="button"
                aria-label="설정 패널 닫기"
                onClick={() => setDrawerOpen(false)}
                className="flex-1 bg-black/40"
              />
              <div className="w-[320px] max-w-full h-full bg-sp-bg border-l border-sp-border animate-slide-in-right motion-reduce:animate-none">
                <RealtimeToolSettingsPanel
                  sessionId={sessionId}
                  presentationOpts={session.presentationOpts}
                  responseOpts={session.responseOpts}
                  displayOpts={session.displayOpts}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
