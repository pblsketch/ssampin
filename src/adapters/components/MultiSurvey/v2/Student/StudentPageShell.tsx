/**
 * StudentPageShell — 학생 페이지 전체 wrapper.
 *
 * - 정적 HTML 생성 대상 (electron/ipc/_studentPageChrome.ts injectDesignTokens 와 함께 사용).
 * - LivePhase에 따라 EntryForm → ProfileForm → WaitScreen → QuestionView → ResultView → Podium 라우팅.
 * - 학생 페이지 컨텍스트 — CSS 변수 fallback HEX 허용 (DN-10 예외).
 *
 * 부모(student 엔트리포인트)가 LiveSession + 현재 학생 식별자를 props로 주입.
 * IPC 발송(STUDENT_WAVE, TOGGLE_FOCUS_MODE 수신, 응답 submit) 콜백은 부모가 책임.
 */

import { memo, useMemo } from 'react';
import type {
  LiveSession,
  LivePhase,
  StudentProfile,
} from '@domain/entities/multiSurvey/LiveSession';
import type { Question } from '@domain/entities/multiSurvey/Question';
import type { Response as MultiSurveyResponse } from '@domain/entities/multiSurvey/Response';
import type { PresentationOpts, ResponseOpts } from '@domain/entities/multiSurvey/MultiSurveyV2';
import { StudentEntryForm } from './StudentEntryForm';
import { StudentProfileForm, type StudentProfileSubmit } from './StudentProfileForm';
import { StudentWaitScreen } from './StudentWaitScreen';
import { QuestionView, type StudentAnswerValue } from './QuestionView';
import { ResultView } from './ResultView';
import { StudentPodium, type PodiumEntry } from './StudentPodium';
import { WaitingOverlay } from './WaitingOverlay';

/** 12종 아바타 emoji 매핑 — AvatarPicker의 키와 동기 유지 필수 */
const AVATAR_EMOJI: Readonly<Record<string, string>> = {
  cat: '🐱',
  dog: '🐶',
  fox: '🦊',
  panda: '🐼',
  tiger: '🐯',
  rabbit: '🐰',
  bear: '🐻',
  koala: '🐨',
  frog: '🐸',
  monkey: '🐵',
  penguin: '🐧',
  unicorn: '🦄',
};

interface StudentPageShellProps {
  /** 현재 단계 (라이브 세션이 없으면 'entry') */
  readonly stage: 'entry' | 'profile' | LivePhase;
  readonly liveSession?: LiveSession;
  /**
   * 현재 문항 — 부모(student 엔트리포인트)가 MultiSurveyV2.questions 에서
   * liveSession.currentQuestionIndex 로 lookup 해서 주입. open/revealed/round_result 단계 필수.
   */
  readonly currentQuestion?: Question;
  /** 총 문항 수 (부모가 MultiSurveyV2.questions.length 주입) */
  readonly totalQuestions?: number;
  /** 학생 본인 프로필 (profile 단계 이후 필수) */
  readonly myProfile?: StudentProfile;
  /** 본인의 마지막 응답 (revealed 단계에서 사용) */
  readonly myLastResponse?: MultiSurveyResponse;
  /** 본인 누적 점수 */
  readonly myCumulativeScore?: number;
  /** 본인 순위 (podium 단계) */
  readonly myRank?: number;
  /** 발표 설정 (T01/T02/T03) */
  readonly presentationOpts?: PresentationOpts;
  /** 응답 설정 (T04 explicit submit) */
  readonly responseOpts?: ResponseOpts;
  /** 현재 문항의 남은 시간(초) */
  readonly remainingSec?: number;
  /** 응답한 학생 수 (waiting overlay에서 사용) */
  readonly answeredCount?: number;
  /** 입장한 학생 수 */
  readonly connectedCount?: number;
  /** 최종 시상대 상위 3명 */
  readonly podiumTop?: readonly PodiumEntry[];
  /** 에러 메시지 (입장/프로필) */
  readonly entryError?: string;
  readonly profileError?: string;

  // ── 콜백 ──
  /** 입장 코드 6자리 제출 */
  readonly onEntrySubmit: (code: string) => void;
  /** 프로필 제출 (닉네임 + pin4 + 아바타) */
  readonly onProfileSubmit: (profile: StudentProfileSubmit) => void;
  /** 응답 제출 — survey/quiz 9종 공통 */
  readonly onAnswerSubmit: (questionId: string, answer: StudentAnswerValue) => void;
  /** STUDENT_WAVE IPC 발송 (DN-03) — 학생 대기 화면 탭 시 */
  readonly onWave: () => void;
}

function StudentPageShellImpl(props: StudentPageShellProps): JSX.Element {
  const {
    stage,
    liveSession,
    currentQuestion,
    totalQuestions,
    myProfile,
    myLastResponse,
    myCumulativeScore,
    myRank,
    presentationOpts,
    responseOpts,
    remainingSec,
    answeredCount,
    connectedCount,
    podiumTop,
    entryError,
    profileError,
    onEntrySubmit,
    onProfileSubmit,
    onAnswerSubmit,
    onWave,
  } = props;

  const avatarEmoji = useMemo<string>(() => {
    if (myProfile === undefined) return '🙂';
    return AVATAR_EMOJI[myProfile.avatarKey] ?? '🙂';
  }, [myProfile]);

  // ──────────────────────────────────────────────
  // Stage 라우팅
  // ──────────────────────────────────────────────

  // entry: 입장 코드 입력
  if (stage === 'entry') {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center px-6"
        style={{ backgroundColor: 'var(--color-bg, #0a0e17)' }}
      >
        <div className="w-full max-w-md">
          <h1
            className="mb-6 text-center font-sp-bold"
            style={{ color: 'var(--color-text, #e2e8f0)', fontSize: 28 }}
          >
            쌤핀 입장
          </h1>
          <StudentEntryForm onSubmit={onEntrySubmit} errorMessage={entryError} />
        </div>
      </div>
    );
  }

  // profile: 닉네임 + pin4 + 아바타
  if (stage === 'profile') {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center px-6 py-6"
        style={{ backgroundColor: 'var(--color-bg, #0a0e17)' }}
      >
        <div className="w-full max-w-md">
          <h1
            className="mb-6 text-center font-sp-bold"
            style={{ color: 'var(--color-text, #e2e8f0)', fontSize: 24 }}
          >
            프로필 설정
          </h1>
          <StudentProfileForm onSubmit={onProfileSubmit} errorMessage={profileError} />
        </div>
      </div>
    );
  }

  // lobby: 대기 화면
  if (stage === 'lobby' && myProfile !== undefined) {
    return (
      <StudentWaitScreen
        profile={myProfile}
        avatarEmoji={avatarEmoji}
        onWave={onWave}
        connectedCount={connectedCount ?? 0}
      />
    );
  }

  // open: 문항 응답 — currentQuestion은 부모가 별도 props로 주입 필요 (Phase B 후속)
  if (stage === 'open' && currentQuestion !== undefined && liveSession !== undefined) {
    const totalQs = totalQuestions ?? 0;
    const answered = myLastResponse?.questionId === currentQuestion.id;
    if (answered) {
      return (
        <div
          className="flex min-h-screen items-center justify-center px-6"
          style={{ backgroundColor: 'var(--color-bg, #0a0e17)' }}
        >
          <div className="w-full max-w-md">
            <WaitingOverlay answeredCount={answeredCount ?? 0} totalCount={connectedCount ?? 0} />
          </div>
        </div>
      );
    }
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-start px-4 py-6"
        style={{ backgroundColor: 'var(--color-bg, #0a0e17)' }}
      >
        <div className="w-full max-w-md">
          <QuestionView
            question={currentQuestion}
            questionIndex={liveSession.currentQuestionIndex}
            totalQuestions={totalQs}
            remainingSec={remainingSec ?? currentQuestion.timerSeconds}
            onAnswerChange={() => {}}
            onSubmit={(ans) => onAnswerSubmit(currentQuestion.id, ans)}
            explicitSubmit={responseOpts?.explicitSubmitButton === true}
          />
        </div>
      </div>
    );
  }

  // revealed / round_result: 결과 표시
  if (
    (stage === 'revealed' || stage === 'round_result') &&
    currentQuestion !== undefined &&
    myLastResponse !== undefined
  ) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-start px-4 py-6"
        style={{ backgroundColor: 'var(--color-bg, #0a0e17)' }}
      >
        <div className="w-full max-w-md">
          <ResultView
            question={currentQuestion}
            isCorrect={myLastResponse.isCorrect}
            scoreEarned={myLastResponse.scoreEarned}
            cumulativeScore={myCumulativeScore ?? 0}
            showExplanation={presentationOpts?.revealExplanation === true}
            showCumulativeScore={presentationOpts?.showCumulativeScore === true}
          />
        </div>
      </div>
    );
  }

  // podium: 최종 결과
  if (
    stage === 'podium' &&
    myProfile !== undefined &&
    podiumTop !== undefined &&
    myRank !== undefined
  ) {
    const me: PodiumEntry = {
      studentId: myProfile.studentId,
      nickname: myProfile.nickname,
      avatarEmoji,
      score: myCumulativeScore ?? 0,
      rank: myRank,
    };
    return (
      <StudentPodium
        top={podiumTop}
        me={me}
        totalParticipants={liveSession?.students.length ?? 0}
      />
    );
  }

  // end: 종료 메시지
  if (stage === 'end') {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-4 px-6"
        style={{ backgroundColor: 'var(--color-bg, #0a0e17)' }}
      >
        <span style={{ fontSize: 56 }} aria-hidden="true">
          👋
        </span>
        <p
          className="font-sp-bold text-sp-text"
          style={{ color: 'var(--color-text, #e2e8f0)', fontSize: 22 }}
        >
          세션이 종료되었습니다
        </p>
        <p
          className="font-sp-medium text-sp-muted"
          style={{ color: 'var(--color-muted, #94a3b8)', fontSize: 14 }}
        >
          수고했어요!
        </p>
      </div>
    );
  }

  // Fallback — 로딩
  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{ backgroundColor: 'var(--color-bg, #0a0e17)' }}
    >
      <p
        className="font-sp-medium text-sp-muted"
        style={{ color: 'var(--color-muted, #94a3b8)', fontSize: 14 }}
        role="status"
        aria-live="polite"
      >
        준비 중...
      </p>
    </div>
  );
}

export const StudentPageShell = memo(StudentPageShellImpl);
