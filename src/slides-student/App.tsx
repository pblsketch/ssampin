/**
 * 학생 SPA 루트 컴포넌트.
 *
 * 상태 머신:
 *   idle → joining → joined-{lobby/active/archived}
 *
 * URL 쿼리 `?code=ABCDEF`로 자동 코드 prefill.
 *
 * Plan §2-1 학생 화면 흐름 + Design §8.6 매핑.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  SlidesStudentWsClient,
  inferWsUrl,
  type ConnectionState,
  type StudentReceivedMessage,
} from './wsClient';
import { JoinPage } from './pages/JoinPage';
import { LobbyPage } from './pages/LobbyPage';
import { SlidePage, type SlideViewState } from './pages/SlidePage';
import { EndPage } from './pages/EndPage';

type SessionStatus = 'lobby' | 'active' | 'archived';

type SlideShape = Extract<StudentReceivedMessage, { type: 'slide-changed' }>['slide'];

interface AppState {
  // 입장 전
  joining: boolean;
  joinError: string | null;
  // 입장 후
  studentToken: string | null;
  sessionStatus: SessionStatus | null;
  currentSlideIndex: number;
  currentSlide: SlideShape | null;
  activeOverlay: {
    overlayId: string;
    config: unknown;
    position: SlideViewState['position'];
  } | null;
  myResponses: Set<string>;
  closedOverlayResults: Map<string, unknown>;
  teacherConnected: boolean;
  responseStatusByOverlay: Map<string, 'recorded' | 'late' | 'rejected'>;
  errorMessage: string | null;
}

const INITIAL_STATE: AppState = {
  joining: false,
  joinError: null,
  studentToken: null,
  sessionStatus: null,
  currentSlideIndex: 0,
  currentSlide: null,
  activeOverlay: null,
  myResponses: new Set(),
  closedOverlayResults: new Map(),
  teacherConnected: true,
  responseStatusByOverlay: new Map(),
  errorMessage: null,
};

export function App(): JSX.Element {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [client, setClient] = useState<SlidesStudentWsClient | null>(null);

  // URL 쿼리에서 code prefill
  const initialCode = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    return params.get('code') ?? '';
  }, []);

  useEffect(() => {
    return () => client?.close();
  }, [client]);

  const handleJoin = (sessionCode: string, studentName: string): void => {
    setState((s) => ({ ...s, joining: true, joinError: null }));
    const newClient = new SlidesStudentWsClient(inferWsUrl(), {
      onConnectionStateChange: setConnectionState,
      onMessage: (msg) => handleMessage(msg, setState),
    });
    setClient(newClient);
    newClient.join({ sessionCode, studentName });
  };

  const handleSubmit = (overlayId: string, data: unknown): void => {
    if (!client || !state.activeOverlay) return;
    const sessionCode = readCodeFromUrl(); // 단순화: URL에 보관
    const ok = client.send({
      type: 'overlay-response',
      sessionCode,
      overlayId,
      studentToken: state.studentToken ?? '',
      clientResponseId: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      data: data as never,
    });
    if (ok) {
      setState((s) => {
        const next = new Set(s.myResponses);
        next.add(overlayId);
        return { ...s, myResponses: next };
      });
    }
  };

  const isOnLobby =
    state.sessionStatus === 'lobby' || (!state.sessionStatus && state.studentToken);
  const isActive = state.sessionStatus === 'active';
  const isArchived = state.sessionStatus === 'archived';

  if (!state.studentToken) {
    return (
      <JoinPage
        defaultCode={initialCode}
        joining={state.joining || connectionState === 'connecting'}
        error={state.joinError}
        onJoin={handleJoin}
      />
    );
  }

  if (isArchived) {
    return <EndPage />;
  }

  if (isOnLobby) {
    return <LobbyPage connectionState={connectionState} />;
  }

  if (isActive) {
    return (
      <SlidePage
        slide={state.currentSlide}
        activeOverlay={state.activeOverlay}
        myResponses={state.myResponses}
        teacherConnected={state.teacherConnected}
        connectionState={connectionState}
        responseStatusByOverlay={state.responseStatusByOverlay}
        onSubmit={handleSubmit}
      />
    );
  }

  // fallback — sessionStatus 미정 + token 있음 (드물게)
  return <LobbyPage connectionState={connectionState} />;
}

// ─────────────────────────────────────────────────────────────
function readCodeFromUrl(): string {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  return params.get('code') ?? '';
}

// ─────────────────────────────────────────────────────────────
// 메시지 핸들러
// ─────────────────────────────────────────────────────────────
function handleMessage(
  msg: StudentReceivedMessage,
  setState: React.Dispatch<React.SetStateAction<AppState>>,
): void {
  switch (msg.type) {
    case 'session-joined':
      setState((s) => ({
        ...s,
        joining: false,
        joinError: null,
        studentToken: msg.studentToken,
        sessionStatus: msg.sessionStatus,
        currentSlideIndex: msg.currentSlideIndex,
      }));
      return;

    case 'late-join-state':
      setState((s) => {
        const myResponses = new Set(s.myResponses);
        for (const r of msg.state.myResponses) myResponses.add(r.overlayId);
        const closed = new Map(s.closedOverlayResults);
        for (const c of msg.state.closedOverlays) closed.set(c.id, c.results);
        return {
          ...s,
          currentSlideIndex: msg.state.slideIndex,
          myResponses,
          closedOverlayResults: closed,
        };
      });
      return;

    case 'slide-changed':
      setState((s) => ({
        ...s,
        currentSlideIndex: msg.slideIndex,
        currentSlide: msg.slide,
        // 슬라이드 전환 시 활성 활동 클리어
        activeOverlay: null,
      }));
      return;

    case 'overlay-activated':
      setState((s) => ({
        ...s,
        activeOverlay: {
          overlayId: msg.overlayId,
          config: msg.config,
          position: msg.position,
        },
      }));
      return;

    case 'overlay-deactivated':
      setState((s) => {
        const closed = new Map(s.closedOverlayResults);
        closed.set(msg.overlayId, msg.results);
        return {
          ...s,
          activeOverlay:
            s.activeOverlay?.overlayId === msg.overlayId ? null : s.activeOverlay,
          closedOverlayResults: closed,
        };
      });
      return;

    case 'lesson-ended':
      setState((s) => ({ ...s, sessionStatus: 'archived', activeOverlay: null }));
      return;

    case 'teacher-disconnected':
      setState((s) => ({ ...s, teacherConnected: false }));
      return;

    case 'teacher-reconnected':
      setState((s) => ({ ...s, teacherConnected: true }));
      return;

    case 'response-accepted':
      setState((s) => {
        const next = new Map(s.responseStatusByOverlay);
        next.set(msg.overlayId, msg.status);
        return { ...s, responseStatusByOverlay: next };
      });
      return;

    case 'error':
      setState((s) => ({
        ...s,
        joining: false,
        joinError: s.studentToken ? s.joinError : msg.message,
        errorMessage: msg.message,
      }));
      return;

    case 'overlay-deadline':
      // Phase 3 예약 — 본 PR은 처리 X
      return;
  }
}
