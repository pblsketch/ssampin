/**
 * LiveConsoleContainer — "설문(퀴즈) 시작" 이후 라이브 세션 수명주기 관리.
 *
 * 책임:
 *  - 학생 접속 서버 기동 (live-multi-survey:start, stepMode=true) + 종료 시 정리
 *  - 터널 + 숏코드 발급 (LiveSessionClient) — 실패 시 로컬 Wi-Fi URL 폴백
 *  - IPC 이벤트 → useMultiSurveyV2Store 동기화 (roster → students, answer → responses)
 *  - phase 전이 시 학생 페이지 IPC 컨트롤 호출 (activate-session / reveal / advance / end-session)
 *
 * NOT 책임:
 *  - phase 머신 규칙 — useMultiSurveyV2Store.nextPhase (DN-09)
 *  - 정답 판정·점수 — domain/rules/multiSurveyRules (liveBridge 경유)
 *  - 콘솔 화면 렌더 — TeacherConsole 이하 합성 컴포넌트
 *
 * 보호 파일 가드: useSettingsStore / useModalCoordinatorStore 절대 import 금지.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useMultiSurveyV2Store,
  selectActiveLiveSurvey,
} from '@adapters/stores/useMultiSurveyV2Store';
import {
  mapQuestionsForLiveHTML,
  buildResponseFromLiveAnswer,
} from '@adapters/multiSurvey/live/liveBridge';
import { LiveSessionClient } from '@infrastructure/supabase/LiveSessionClient';
import { TeacherConsole } from './TeacherConsole';
import type { StudentInteraction } from '@domain/entities/multiSurvey/LiveSession';
import { buildShareSnapshot } from '../Share/shareSnapshot';
import { buildPersonalResults } from '@domain/rules/participationRules';
import type { ParticipationControl } from '@domain/entities/multiSurvey/ParticipationProtocol';

interface LiveConsoleContainerProps {
  /** 라이브 종료 후 메이커로 복귀 */
  readonly onExit: () => void;
}

type BootStatus = 'starting' | 'ready' | 'error';

export function LiveConsoleContainer({ onExit }: LiveConsoleContainerProps): JSX.Element {
  const liveId = useMultiSurveyV2Store((s) => s.liveSession?.id ?? null);
  const survey = useMultiSurveyV2Store(selectActiveLiveSurvey);
  const nextPhase = useMultiSurveyV2Store((s) => s.nextPhase);
  const endLive = useMultiSurveyV2Store((s) => s.endLive);
  const startLive = useMultiSurveyV2Store((s) => s.startLive);
  const appendStudent = useMultiSurveyV2Store((s) => s.appendStudent);
  const appendResponse = useMultiSurveyV2Store((s) => s.appendResponse);
  const appendInteraction = useMultiSurveyV2Store((s) => s.appendInteraction);
  const setFocusModeActive = useMultiSurveyV2Store((s) => s.setFocusModeActive);
  const focusModeActive = useMultiSurveyV2Store((s) => s.liveSession?.focusModeActive ?? false);

  const [status, setStatus] = useState<BootStatus>('starting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [entryUrl, setEntryUrl] = useState<string | null>(null);
  /** 짧은 입장 코드. 발급 실패 시 null — 그때는 주소만 안내한다. */
  const [entryCode, setEntryCode] = useState<string | null>(null);
  /** 코드 변경에 필요한 원본 터널 주소 */
  const tunnelUrlRef = useRef<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const actionBusy = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);
  /** 교실 화면(별도 창)이 열려 있는가 */
  const [shareWindowOpen, setShareWindowOpen] = useState(false);

  const clientRef = useRef(new LiveSessionClient());
  /** 라이브 중 survey 식별 안정화 — effect 의존성에서 객체 identity 제외 */
  const surveyRef = useRef(survey);
  surveyRef.current = survey;

  // ── 학생 접속 서버 기동/정리 (liveId 단위 — StrictMode 이중 mount 시 stop→재기동으로 안전) ──
  useEffect(() => {
    if (!liveId) return;
    const activeSurvey = surveyRef.current;
    if (!activeSurvey) return;

    let cancelled = false;
    setStatus('starting');
    setErrorMessage(null);
    setEntryUrl(null);
    setEntryCode(null);
    tunnelUrlRef.current = null;

    const boot = async (): Promise<void> => {
      const api = window.electronAPI;
      if (!api?.startLiveMultiSurvey) {
        if (!cancelled) {
          setStatus('error');
          setErrorMessage('학생 참여 기능은 데스크톱 앱에서만 사용할 수 있습니다.');
        }
        return;
      }
      try {
        const info = await api.startLiveMultiSurvey({
          questions: mapQuestionsForLiveHTML(activeSurvey.questions),
          stepMode: true,
          ...(activeSurvey.purpose
            ? {
                participation: {
                  roomId: liveId,
                  title: activeSurvey.title,
                  purpose: activeSurvey.purpose,
                  competitionMode: !!activeSurvey.competitionMode,
                },
              }
            : {}),
        });
        if (cancelled) return;
        if (info.localIPs.length === 0) {
          setStatus('error');
          setErrorMessage('Wi-Fi에 연결되어 있지 않습니다. 학생들과 같은 네트워크에 연결해주세요.');
          return;
        }
        setEntryUrl(`http://${info.localIPs[0]}:${info.port}`);
        setStatus('ready');
      } catch {
        if (!cancelled) {
          setStatus('error');
          setErrorMessage('학생 접속 서버를 시작할 수 없습니다. 잠시 후 다시 시도해주세요.');
        }
        return;
      }

      // 터널 + 짧은 주소 — 베스트에포트 (실패해도 로컬 Wi-Fi URL로 계속)
      try {
        const available = await window.electronAPI?.multiSurveyTunnelAvailable?.();
        if (!available) await window.electronAPI?.multiSurveyTunnelInstall?.();
        const result = await window.electronAPI?.multiSurveyTunnelStart?.();
        if (result && !cancelled) {
          setEntryUrl(result.tunnelUrl);
          tunnelUrlRef.current = result.tunnelUrl;
          const session = await clientRef.current.registerSession(result.tunnelUrl);
          if (session && !cancelled) {
            setEntryUrl(session.shortUrl);
            // 코드를 따로 보관한다 — 대기실·교실 화면에서 주소와 분리해 크게 보여준다.
            setEntryCode(session.code);
          }
        }
      } catch {
        // 로컬 URL 폴백 유지 — 별도 안내 불필요 (QR이 로컬 URL을 가리킴)
      }
    };
    void boot();

    return () => {
      cancelled = true;
      // liveId 교체("다시 하기")·언마운트 양쪽 모두 서버 정리 (중복 호출 안전 — main이 세션 부재 시 no-op)
      void window.electronAPI?.stopLiveMultiSurvey?.();
    };
  }, [liveId]);

  // ── IPC 이벤트 → store 동기화 ──
  useEffect(() => {
    if (!liveId) return;
    const api = window.electronAPI;
    if (!api) return;
    const unsubs: Array<() => void> = [];

    const unsubRoster = api.onLiveMultiSurveyRoster?.((data) => {
      // appendStudent 가 studentId 중복을 자체 차단 — 신규 입장자만 누적
      for (const entry of data.roster) {
        appendStudent({
          studentId: entry.sessionId,
          nickname: entry.nickname,
          pin4: '',
          avatarKey: '',
          isRealName: false,
        });
      }
    });
    if (unsubRoster) unsubs.push(unsubRoster);

    const unsubAnswered = api.onLiveMultiSurveyStudentAnswered?.((data) => {
      if (data.votes) {
        const store = useMultiSurveyV2Store.getState();
        const live = store.liveSession;
        const q = store.sessions.find((s) => s.id === live?.surveyId)?.questions[
          data.questionIndex
        ];
        if (live && q && data.roomId === live.id) {
          useMultiSurveyV2Store.setState({
            liveSession: {
              ...live,
              votesByQuestion: { ...live.votesByQuestion, [q.id]: data.votes },
            },
          });
          useMultiSurveyV2Store.getState().saveParticipationResult();
        }
        return;
      }
      if (!data.answer) return;
      const state = useMultiSurveyV2Store.getState();
      const live = state.liveSession;
      if (!live) return;
      if (data.roomId && data.roomId !== live.id) return;
      const activeSurvey = state.sessions.find((s) => s.id === live.surveyId);
      const question = activeSurvey?.questions[data.questionIndex];
      if (!question) return;
      const response = buildResponseFromLiveAnswer({
        question,
        studentId: data.sessionId,
        payload: data.answer,
      });
      if (response) state.appendResponse(response);
    });
    if (unsubAnswered) unsubs.push(unsubAnswered);

    // DN-03: 학생 wave → store appendInteraction (메모리 전용 누적)
    const unsubWave = api.onLiveMultiSurveyStudentWave?.((data) => {
      const interaction: StudentInteraction = {
        studentId: data.studentId,
        kind: 'wave',
        at: new Date().toISOString(),
      };
      appendInteraction(interaction);
    });
    if (unsubWave) unsubs.push(unsubWave);

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [liveId, appendStudent, appendResponse, appendInteraction]);

  // ── phase 전이: 학생 페이지 IPC 동기화 + store nextPhase ──
  const runParticipationAction = useCallback(
    async (kind: 'advance' | 'reopen' | 'end' | 'close' | 'results' | 'answer') => {
      if (actionBusy.current) return;
      const store = useMultiSurveyV2Store.getState();
      const live = store.liveSession;
      const active = store.sessions.find((s) => s.id === live?.surveyId);
      const control = window.electronAPI?.participationControl;
      if (!live || !active?.purpose || !control) return;
      actionBusy.current = true;
      setBusy(true);
      setActionError(null);
      const command = (action: ParticipationControl['action']) =>
        control({
          roomId: live.id,
          questionIndex: live.currentQuestionIndex,
          attempt: live.attempt ?? 1,
          action,
        });
      /** 마감 시점에 서버가 들고 있던 답을 store 로 옮긴다 (막판 제출 회수) */
      const drainClosedAnswers = async (): Promise<void> => {
        const closed = await command('close');
        const question = active.questions[live.currentQuestionIndex];
        if (!question) return;
        for (const item of closed.answers) {
          const response = buildResponseFromLiveAnswer({
            question,
            studentId: item.studentId,
            payload: item.answer,
          });
          if (response) store.appendResponse(response);
        }
      };
      /** 지금 공개 수준에 맞는 개인 결과를 학생 기기로 내려보낸다 */
      const publish = async (revealAnswer: boolean): Promise<void> => {
        const updated = useMultiSurveyV2Store.getState().liveSession;
        if (!updated) return;
        await control({
          roomId: live.id,
          questionIndex: live.currentQuestionIndex,
          attempt: live.attempt ?? 1,
          action: 'publish',
          results: buildPersonalResults({ ...updated, phase: 'revealed' }, active, {
            revealAnswer,
          }),
        });
      };
      try {
        if (kind === 'close') {
          // 마감만 한다 — 결과도 정답도 아직 공개하지 않는다.
          await drainClosedAnswers();
          store.closeResponses();
          store.saveParticipationResult();
        } else if (kind === 'results') {
          store.publishResults();
          await publish(false);
        } else if (kind === 'answer') {
          store.publishAnswer();
          await publish(true);
        } else if (kind === 'reopen') {
          await command('reopen');
          store.reopenDiscussion();
        } else if (kind === 'end') {
          if (live.phase === 'open') {
            await drainClosedAnswers();
            store.closeResponses();
          }
          // 활동을 끝낼 때는 정답까지 공개한다 — 마무리 화면에서 돌아봐야 한다.
          if (live.phase !== 'lobby') await publish(true);
          await command('end');
          store.endLive();
        } else if (live.phase === 'lobby') {
          await command('activate');
          store.nextPhase();
        } else if (live.phase === 'open') {
          // 아직 마감 전인데 [다음 문항]을 눌렀다면 마감까지 한 번에 처리한다.
          await drainClosedAnswers();
          store.closeResponses();
          await command('advance');
          store.nextPhase();
          store.saveParticipationResult();
        } else if (live.phase === 'revealed') {
          await command('advance');
          store.nextPhase();
          store.saveParticipationResult();
        } else if (live.phase === 'podium') {
          store.endLive();
        }
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : '진행 상태를 바꾸지 못했어요. 다시 시도해 주세요.',
        );
      } finally {
        actionBusy.current = false;
        setBusy(false);
      }
    },
    [],
  );

  const handleAdvance = useCallback(() => {
    const state = useMultiSurveyV2Store.getState();
    const live = state.liveSession;
    if (!live) return;
    const activeSurvey = state.sessions.find((s) => s.id === live.surveyId);
    if (!activeSurvey) return;
    if (activeSurvey.purpose) {
      void runParticipationAction('advance');
      return;
    }
    const isLast = live.currentQuestionIndex >= activeSurvey.questions.length - 1;
    const api = window.electronAPI;

    switch (live.phase) {
      case 'lobby':
        void api?.liveMultiSurveyActivateSession?.();
        break;
      case 'open':
        void api?.liveMultiSurveyReveal?.();
        break;
      case 'revealed':
        // T10 ON이면 round_result 로 가는 중간 단계 — 학생 페이지는 revealed 유지
        if (!activeSurvey.displayOpts.showPerQuestionScore) {
          if (isLast) void api?.liveMultiSurveyEndSession?.();
          else void api?.liveMultiSurveyAdvance?.();
        }
        break;
      case 'round_result':
        if (isLast) void api?.liveMultiSurveyEndSession?.();
        else void api?.liveMultiSurveyAdvance?.();
        break;
      case 'podium':
        // podium → end: 학생 페이지는 이미 ended — 서버만 정리
        void api?.stopLiveMultiSurvey?.();
        break;
      case 'end':
        break;
    }
    nextPhase();
  }, [nextPhase, runParticipationAction]);

  const handleCloseResponses = useCallback(() => {
    void runParticipationAction('close');
  }, [runParticipationAction]);
  const handlePublishResults = useCallback(() => {
    void runParticipationAction('results');
  }, [runParticipationAction]);
  const handlePublishAnswer = useCallback(() => {
    void runParticipationAction('answer');
  }, [runParticipationAction]);

  // ── 세션 종료 (헤더/사이드 패널 "세션 종료") ──
  const handleEnd = useCallback(() => {
    if (surveyRef.current?.purpose) {
      void runParticipationAction('end');
      return;
    }
    void window.electronAPI?.liveMultiSurveyEndSession?.();
    void window.electronAPI?.stopLiveMultiSurvey?.();
    endLive();
  }, [endLive, runParticipationAction]);

  // ── DN-06: 집중 모드 토글 ──
  const handleToggleFocusMode = useCallback(
    (active: boolean) => {
      void window.electronAPI?.liveMultiSurveyToggleFocusMode?.(active);
      setFocusModeActive(active);
    },
    [setFocusModeActive],
  );

  // ── 작업 1: Share window 스냅샷 push ──
  // liveSession 또는 survey 변경 시마다 Share window로 스냅샷 전송.
  // Share window가 없으면 main process 핸들러가 silently drop.
  const liveSessionForSnapshot = useMultiSurveyV2Store((s) => s.liveSession);
  const surveyForSnapshot = useMultiSurveyV2Store(selectActiveLiveSurvey);
  const entryUrlRef = useRef<string>('');
  const entryCodeRef = useRef<string | null>(null);
  // entryUrl/entryCode state를 ref로 동기화 (effect 의존성 없이 최신값 참조)
  useEffect(() => {
    entryUrlRef.current = entryUrl ?? '';
    entryCodeRef.current = entryCode;
  });
  useEffect(() => {
    if (!liveSessionForSnapshot || !surveyForSnapshot) return;
    const snapshot = buildShareSnapshot(
      liveSessionForSnapshot,
      surveyForSnapshot,
      entryUrlRef.current,
      entryCodeRef.current,
    );
    window.electronAPI?.sendMultiSurveyShareSnapshot?.(snapshot);
  }, [liveSessionForSnapshot, surveyForSnapshot, entryCode, entryUrl]);

  // ── 작업 1: [교실 화면 열기] 버튼 핸들러 ──
  // 창을 연 직후 지금 상태를 한 번 더 보낸다 — 대기 화면에서 열면
  // 다음 변화(학생 입장 등)까지 아무 일도 없어 빈 화면처럼 보이기 때문이다.
  const handleOpenShareWindow = useCallback(async () => {
    setShareWindowOpen(true);
    await window.electronAPI?.openMultiSurveyShareWindow?.(entryUrlRef.current);
    const state = useMultiSurveyV2Store.getState();
    const live = state.liveSession;
    const active = live ? state.sessions.find((s) => s.id === live.surveyId) : undefined;
    if (!live || !active) return;
    window.electronAPI?.sendMultiSurveyShareSnapshot?.(
      buildShareSnapshot(live, active, entryUrlRef.current, entryCodeRef.current),
    );
  }, []);

  const handleCloseShareWindow = useCallback(() => {
    setShareWindowOpen(false);
    void window.electronAPI?.closeMultiSurveyShareWindow?.();
  }, []);

  // 운영체제 닫기 단추로 교실 창을 닫아도 교사 화면이 알아야 한다.
  // (옛 구조에서는 지역 state 라 [교실 화면 닫기] 가 남아 있었다.)
  useEffect(() => {
    const unsub = window.electronAPI?.onMultiSurveyShareWindowClosed?.(() => {
      setShareWindowOpen(false);
    });
    return unsub;
  }, []);

  // ── 입장 코드를 기억하기 쉬운 이름으로 바꾸기 ──
  // 검증은 기존 규칙(validateCustomCode)을 그대로 쓴다 — 새 규칙을 만들지 않는다.
  const handleChangeEntryCode = useCallback(async (nextCode: string): Promise<boolean> => {
    const tunnelUrl = tunnelUrlRef.current;
    if (!tunnelUrl) {
      setCodeError('인터넷으로 참여하는 주소가 아직 없어서 코드를 바꿀 수 없어요.');
      return false;
    }
    try {
      const result = await clientRef.current.setCustomCode(tunnelUrl, nextCode);
      setEntryUrl(result.shortUrl);
      setEntryCode(result.code);
      setCodeError(null);
      return true;
    } catch (e) {
      setCodeError(e instanceof Error ? e.message : '코드를 바꾸지 못했어요.');
      return false;
    }
  }, []);

  // ── "다시 하기" — 같은 설문으로 새 라이브 세션 재기동 ──
  // liveId 변경 → 기동 effect cleanup(서버 정리) 후 재실행
  const handleRestart = useCallback(() => {
    if (!survey) return;
    startLive(survey.id);
  }, [survey, startLive]);

  // ── 서버 기동 실패 ──
  if (status === 'error') {
    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-4 bg-sp-bg p-8 text-sp-text"
        role="alert"
      >
        <span className="font-sp-bold text-sp-text" style={{ fontSize: 24 }}>
          라이브를 시작하지 못했어요
        </span>
        <span className="font-sp-medium text-sp-muted" style={{ fontSize: 16 }}>
          {errorMessage}
        </span>
        <button
          type="button"
          onClick={onExit}
          className="mt-2 rounded-lg bg-sp-accent px-6 py-3 font-sp-semibold text-[color:var(--sp-accent-fg)] shadow-sp-sm hover:shadow-sp-md transition-shadow duration-sp-base motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sp-bg"
          style={{ fontSize: 16 }}
        >
          편집 화면으로 돌아가기
        </button>
      </div>
    );
  }

  // ── 서버 기동 중 ──
  if (status === 'starting') {
    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-3 bg-sp-bg text-sp-text"
        role="status"
        aria-live="polite"
      >
        <div
          className="h-6 w-6 rounded-full border-2 border-sp-border border-t-sp-accent animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        <span className="font-sp-semibold" style={{ fontSize: 20 }}>
          학생 접속 준비 중...
        </span>
        <span className="font-sp-medium text-sp-muted" style={{ fontSize: 14 }}>
          잠시만 기다려주세요
        </span>
      </div>
    );
  }

  return (
    <TeacherConsole
      busy={busy}
      actionError={actionError}
      onReopen={() => {
        void runParticipationAction('reopen');
      }}
      entryUrl={entryUrl ?? ''}
      entryCode={entryCode}
      onChangeEntryCode={handleChangeEntryCode}
      entryCodeError={codeError}
      onAdvance={handleAdvance}
      onEnd={handleEnd}
      onRestart={handleRestart}
      onExit={onExit}
      focusModeActive={focusModeActive}
      onToggleFocusMode={handleToggleFocusMode}
      onOpenShareWindow={() => {
        void handleOpenShareWindow();
      }}
      onCloseShareWindow={handleCloseShareWindow}
      shareWindowOpen={shareWindowOpen}
      onClose={handleCloseResponses}
      onPublishResults={handlePublishResults}
      onPublishAnswer={handlePublishAnswer}
    />
  );
}
