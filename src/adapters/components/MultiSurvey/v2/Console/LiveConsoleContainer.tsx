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
          const session = await clientRef.current.registerSession(result.tunnelUrl);
          if (session && !cancelled) {
            setEntryUrl(session.shortUrl);
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
      if (!data.answer) return;
      const state = useMultiSurveyV2Store.getState();
      const live = state.liveSession;
      if (!live) return;
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
  const handleAdvance = useCallback(() => {
    const state = useMultiSurveyV2Store.getState();
    const live = state.liveSession;
    if (!live) return;
    const activeSurvey = state.sessions.find((s) => s.id === live.surveyId);
    if (!activeSurvey) return;
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
  }, [nextPhase]);

  // ── 세션 종료 (헤더/사이드 패널 "세션 종료") ──
  const handleEnd = useCallback(() => {
    void window.electronAPI?.liveMultiSurveyEndSession?.();
    void window.electronAPI?.stopLiveMultiSurvey?.();
    endLive();
  }, [endLive]);

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
  // entryUrl state를 ref로 동기화 (effect 의존성 없이 최신값 참조)
  useEffect(() => {
    entryUrlRef.current = entryUrl ?? '';
  });
  useEffect(() => {
    if (!liveSessionForSnapshot || !surveyForSnapshot) return;
    const snapshot = buildShareSnapshot(
      liveSessionForSnapshot,
      surveyForSnapshot,
      entryUrlRef.current,
    );
    window.electronAPI?.sendMultiSurveyShareSnapshot?.(snapshot);
  }, [liveSessionForSnapshot, surveyForSnapshot]);

  // ── 작업 1: [교실 화면 열기] 버튼 핸들러 ──
  const handleOpenShareWindow = useCallback(() => {
    void window.electronAPI?.openMultiSurveyShareWindow?.(entryUrlRef.current);
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
      entryUrl={entryUrl ?? ''}
      onAdvance={handleAdvance}
      onEnd={handleEnd}
      onRestart={handleRestart}
      onExit={onExit}
      focusModeActive={focusModeActive}
      onToggleFocusMode={handleToggleFocusMode}
      onOpenShareWindow={handleOpenShareWindow}
    />
  );
}
