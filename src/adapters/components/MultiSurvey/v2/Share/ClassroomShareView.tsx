/**
 * ClassroomShareView — 교실 모니터(별도 BrowserWindow) 진입 컴포넌트.
 *
 * 두 가지 데이터 소스를 지원한다:
 *   1. snapshot prop (IPC 모드) — ShareWindowApp에서 사용. 별도 BrowserWindow에서는
 *      Zustand store liveSession이 null이므로 IPC 스냅샷으로 모든 데이터를 수신한다.
 *   2. store (직접 모드) — 테스트/스토리북/메인 창 내 프리뷰에서 사용.
 *
 * entryCode 는 폐기 (2026-06-12 결정) — QR+URL 전용.
 * FALLBACK_ENTRY_URL: snapshot 없고 entryUrl prop도 없을 때만 사용.
 *
 * sp-* 토큰: sp-bg / sp-surface / sp-text / sp-accent / sp-highlight
 */

import { memo, useEffect, useState } from 'react';
import type { LivePhase } from '@domain/entities/multiSurvey/LiveSession';
import type { Question } from '@domain/entities/multiSurvey/Question';
import type { Response } from '@domain/entities/multiSurvey/Response';
import type { StudentProfile } from '@domain/entities/multiSurvey/LiveSession';
import {
  useMultiSurveyV2Store,
  selectActiveLiveSurvey,
} from '@adapters/stores/useMultiSurveyV2Store';
import type { ShareSnapshot } from './shareSnapshot';
import { ShareEntryCodeBar } from './ShareEntryCodeBar';
import { ShareLobbyScreen } from './ShareLobbyScreen';
import { ShareQuestionScreen } from './ShareQuestionScreen';
import { ShareAnswerReveal } from './ShareAnswerReveal';
import { ShareRoundResult } from './ShareRoundResult';
import { SharePodium } from './SharePodium';

interface ClassroomShareViewProps {
  /**
   * IPC 스냅샷 (Share window 모드).
   * 지정 시 store 읽기를 건너뛰고 스냅샷 데이터를 사용한다.
   */
  readonly snapshot?: ShareSnapshot;
  /** 학생 입장 URL (QR 인코딩 대상). snapshot.entryUrl 로 전달하거나 직접 지정. */
  readonly entryUrl?: string;
  /** 외부에서 주입하는 남은 시간(초). 미지정 시 question.timerSeconds 기반 자체 카운트다운. */
  readonly remainingSeconds?: number;
}

const FALLBACK_ENTRY_URL = 'https://ssampin.app/join';

/** phase 가 입장 URL 배너를 표시해야 하는지 결정 */
function shouldShowEntryBar(phase: LivePhase, allowReentry: boolean): boolean {
  if (phase === 'end' || phase === 'podium') return false;
  if (phase === 'lobby') return false; // lobby는 화면 본문에 QR 크게 노출
  return allowReentry; // T03 ON일 때만 진행 중 노출
}

function ClassroomShareViewImpl({
  snapshot,
  entryUrl: entryUrlProp,
  remainingSeconds: externalRemaining,
}: ClassroomShareViewProps): JSX.Element {
  // store 모드 (snapshot 없을 때만 구독 — 별도 창에서는 null)
  const storeSession = useMultiSurveyV2Store((s) => s.liveSession);
  const storeSurvey = useMultiSurveyV2Store(selectActiveLiveSurvey);

  // 데이터 소스 결정
  const isSnapshotMode = snapshot !== undefined;

  const phase: LivePhase = isSnapshotMode ? snapshot.phase : (storeSession?.phase ?? 'lobby');

  const currentQuestion: Question | undefined | null = isSnapshotMode
    ? snapshot.currentQuestion
    : storeSurvey && storeSession
      ? storeSurvey.questions[storeSession.currentQuestionIndex]
      : undefined;

  const students: readonly StudentProfile[] = isSnapshotMode
    ? snapshot.students
    : (storeSession?.students ?? []);

  const allResponses: readonly Response[] = isSnapshotMode
    ? snapshot.allResponses
    : (storeSession?.responses ?? []);

  const responsesForCurrentQuestion: readonly Response[] = isSnapshotMode
    ? snapshot.responsesForCurrent
    : (() => {
        if (!storeSession || !currentQuestion) return [];
        return storeSession.responses.filter((r) => r.questionId === currentQuestion.id);
      })();

  const questionNumber = isSnapshotMode
    ? snapshot.questionNumber
    : storeSession
      ? storeSession.currentQuestionIndex + 1
      : 1;

  const totalQuestions = isSnapshotMode
    ? snapshot.totalQuestions
    : (storeSurvey?.questions.length ?? 0);

  const revealExplanation = isSnapshotMode
    ? snapshot.revealExplanation
    : (storeSurvey?.presentationOpts.revealExplanation ?? false);

  const allowReentry = isSnapshotMode
    ? snapshot.allowReentry
    : (storeSurvey?.presentationOpts.allowReentry ?? false);

  const entryUrl = isSnapshotMode ? snapshot.entryUrl : (entryUrlProp ?? FALLBACK_ENTRY_URL);

  // 자체 타이머 카운트다운 (외부 주입 없을 때)
  const [internalRemaining, setInternalRemaining] = useState<number>(0);

  useEffect(() => {
    if (externalRemaining !== undefined) return; // 외부 제어 우선
    if (!currentQuestion) {
      setInternalRemaining(0);
      return;
    }
    if (phase !== 'open') {
      setInternalRemaining(currentQuestion.timerSeconds);
      return;
    }
    setInternalRemaining(currentQuestion.timerSeconds);
    const tick = window.setInterval(() => {
      setInternalRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(tick);
  }, [externalRemaining, phase, currentQuestion]);

  const remaining = externalRemaining ?? internalRemaining;

  // 로딩/에러 가드: 세션 없으면 안내 화면
  // snapshot 모드: snapshot은 항상 있음 (ShareWindowApp에서 null 가드 완료)
  // store 모드: storeSession/storeSurvey null 체크
  const hasData = isSnapshotMode || (storeSession !== null && storeSurvey !== null);

  if (!hasData) {
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

  const showBar = shouldShowEntryBar(phase, allowReentry);

  // round_result: snapshot 모드에서는 allResponses 전달, store 모드는 storeSession.responses
  const responsesForRoundResult = isSnapshotMode ? allResponses : (storeSession?.responses ?? []);
  const studentsForResult = isSnapshotMode ? students : (storeSession?.students ?? []);
  // podium/end: 전체 응답 기반 포디움
  const responsesForPodium = isSnapshotMode ? allResponses : (storeSession?.responses ?? []);

  return (
    <main
      className="flex h-screen w-screen cursor-none flex-col bg-sp-bg text-sp-text"
      aria-label="교실 모니터 Share View"
    >
      {showBar ? <ShareEntryCodeBar entryUrl={entryUrl} studentCount={students.length} /> : null}

      <div className="flex flex-1 flex-col overflow-hidden">
        {phase === 'lobby' ? <ShareLobbyScreen entryUrl={entryUrl} students={students} /> : null}

        {phase === 'open' && currentQuestion ? (
          <ShareQuestionScreen
            question={currentQuestion}
            questionNumber={questionNumber}
            totalQuestions={totalQuestions}
            remainingSeconds={remaining}
            answeredCount={responsesForCurrentQuestion.length}
            studentCount={students.length}
          />
        ) : null}

        {phase === 'revealed' && currentQuestion ? (
          <ShareAnswerReveal
            question={currentQuestion}
            responses={responsesForCurrentQuestion}
            revealExplanation={revealExplanation}
          />
        ) : null}

        {phase === 'round_result' ? (
          <ShareRoundResult
            students={studentsForResult}
            responses={responsesForRoundResult}
            questionNumber={questionNumber}
            totalQuestions={totalQuestions}
          />
        ) : null}

        {phase === 'podium' || phase === 'end' ? (
          <SharePodium students={studentsForResult} responses={responsesForPodium} />
        ) : null}
      </div>

      {/* 강조 색상 토큰 활용 표지(접근성 SR 전용) — sp-highlight 사용 보증 */}
      <span className="sr-only text-sp-highlight">교실 모니터 모드 진행 중</span>
    </main>
  );
}

export const ClassroomShareView = memo(ClassroomShareViewImpl);

export default ClassroomShareView;
