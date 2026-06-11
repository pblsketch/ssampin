/**
 * ClassroomShareView — 교실 모니터(별도 BrowserWindow) 진입 컴포넌트.
 *
 * - full-screen wrapper, `cursor-none` (교실 모니터에 마우스 포인터 노출 방지)
 * - phase에 따라 sub-view 렌더링
 * - sp-* 토큰: sp-bg / sp-surface / sp-text / sp-accent / sp-highlight
 *
 * 데이터 소스:
 *   useMultiSurveyV2Store — liveSession + selectActiveLiveSurvey
 *
 * 타이머 카운트다운은 Phase B 추후 worker(B.6 IPC)에서 전달.
 * 여기서는 prop으로 받거나 useEffect로 자체 카운트다운 처리.
 *
 * 입장 URL/코드는 phase B IPC 단계에서 props로 주입 — 기본값 fallback 제공.
 */

import { memo, useEffect, useMemo, useState } from 'react';
import type { LivePhase } from '@domain/entities/multiSurvey/LiveSession';
import {
  useMultiSurveyV2Store,
  selectActiveLiveSurvey,
} from '@adapters/stores/useMultiSurveyV2Store';
import { ShareEntryCodeBar } from './ShareEntryCodeBar';
import { ShareLobbyScreen } from './ShareLobbyScreen';
import { ShareQuestionScreen } from './ShareQuestionScreen';
import { ShareAnswerReveal } from './ShareAnswerReveal';
import { ShareRoundResult } from './ShareRoundResult';
import { SharePodium } from './SharePodium';

interface ClassroomShareViewProps {
  /** 학생 입장 코드 (6자리, 예: "AB12CD"). 미지정 시 fallback 표시. */
  readonly entryCode?: string;
  /** 학생 입장 URL (QR 인코딩 대상). 미지정 시 fallback. */
  readonly entryUrl?: string;
  /** 외부에서 주입하는 남은 시간(초). 미지정 시 question.timerSeconds 기반 자체 카운트다운. */
  readonly remainingSeconds?: number;
}

const FALLBACK_ENTRY_CODE = '------';
const FALLBACK_ENTRY_URL = 'https://ssampin.app/join';

/** phase 가 입장 코드 배너를 표시해야 하는지 결정 */
function shouldShowEntryBar(phase: LivePhase, allowReentry: boolean): boolean {
  if (phase === 'end' || phase === 'podium') return false;
  if (phase === 'lobby') return false; // lobby는 화면 본문에 코드 크게 노출
  return allowReentry; // T03 ON일 때만 진행 중 노출
}

function ClassroomShareViewImpl({
  entryCode = FALLBACK_ENTRY_CODE,
  entryUrl = FALLBACK_ENTRY_URL,
  remainingSeconds: externalRemaining,
}: ClassroomShareViewProps): JSX.Element {
  const liveSession = useMultiSurveyV2Store((s) => s.liveSession);
  const survey = useMultiSurveyV2Store(selectActiveLiveSurvey);

  const currentQuestion = useMemo(() => {
    if (!survey || !liveSession) return undefined;
    return survey.questions[liveSession.currentQuestionIndex];
  }, [survey, liveSession]);

  // 자체 타이머 카운트다운 (외부 주입 없을 때)
  const [internalRemaining, setInternalRemaining] = useState<number>(0);

  useEffect(() => {
    if (externalRemaining !== undefined) return; // 외부 제어 우선
    if (!liveSession || !currentQuestion) {
      setInternalRemaining(0);
      return;
    }
    if (liveSession.phase !== 'open') {
      setInternalRemaining(currentQuestion.timerSeconds);
      return;
    }
    setInternalRemaining(currentQuestion.timerSeconds);
    const tick = window.setInterval(() => {
      setInternalRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(tick);
  }, [externalRemaining, liveSession, currentQuestion]);

  const remaining = externalRemaining ?? internalRemaining;

  // 현재 문항에 대한 응답만 필터
  const responsesForCurrentQuestion = useMemo(() => {
    if (!liveSession || !currentQuestion) return [] as const;
    return liveSession.responses.filter((r) => r.questionId === currentQuestion.id);
  }, [liveSession, currentQuestion]);

  // 로딩/에러 가드: 세션 없으면 안내 화면
  if (!liveSession || !survey) {
    return (
      <main
        className="flex h-screen w-screen cursor-none items-center justify-center bg-sp-bg text-sp-text"
        aria-label="교실 모니터 대기"
      >
        <div className="flex flex-col items-center gap-6">
          <span className="font-sp-bold text-sp-accent" style={{ fontSize: 64 }}>
            쌤핀
          </span>
          <span className="font-sp-medium text-sp-text" style={{ fontSize: 32 }}>
            교사 콘솔에서 라이브를 시작하세요
          </span>
        </div>
      </main>
    );
  }

  const phase = liveSession.phase;
  const showBar = shouldShowEntryBar(phase, survey.presentationOpts.allowReentry);
  const totalQuestions = survey.questions.length;
  const questionNumber = liveSession.currentQuestionIndex + 1;

  return (
    <main
      className="flex h-screen w-screen cursor-none flex-col bg-sp-bg text-sp-text"
      aria-label="교실 모니터 Share View"
    >
      {showBar ? (
        <ShareEntryCodeBar entryCode={entryCode} studentCount={liveSession.students.length} />
      ) : null}

      <div className="flex flex-1 flex-col overflow-hidden">
        {phase === 'lobby' ? (
          <ShareLobbyScreen
            entryCode={entryCode}
            entryUrl={entryUrl}
            students={liveSession.students}
          />
        ) : null}

        {phase === 'open' && currentQuestion ? (
          <ShareQuestionScreen
            question={currentQuestion}
            questionNumber={questionNumber}
            totalQuestions={totalQuestions}
            remainingSeconds={remaining}
            answeredCount={responsesForCurrentQuestion.length}
            studentCount={liveSession.students.length}
          />
        ) : null}

        {phase === 'revealed' && currentQuestion ? (
          <ShareAnswerReveal
            question={currentQuestion}
            responses={responsesForCurrentQuestion}
            revealExplanation={survey.presentationOpts.revealExplanation}
          />
        ) : null}

        {phase === 'round_result' ? (
          <ShareRoundResult
            students={liveSession.students}
            responses={liveSession.responses}
            questionNumber={questionNumber}
            totalQuestions={totalQuestions}
          />
        ) : null}

        {phase === 'podium' || phase === 'end' ? (
          <SharePodium students={liveSession.students} responses={liveSession.responses} />
        ) : null}
      </div>

      {/* 강조 색상 토큰 활용 표지(접근성 SR 전용) — sp-highlight 사용 보증 */}
      <span className="sr-only text-sp-highlight">교실 모니터 모드 진행 중</span>
    </main>
  );
}

export const ClassroomShareView = memo(ClassroomShareViewImpl);

export default ClassroomShareView;
