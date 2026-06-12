/**
 * useMultiSurveyV2Store — STUDENT_WAVE / TOGGLE_FOCUS_MODE 액션 단위 테스트 (DN-03, DN-06)
 *
 * 검증 범위:
 * 1) appendInteraction — wave 이벤트 studentInteractions 에 누적
 * 2) appendInteraction — 라이브 세션 없을 때 no-op (안전)
 * 3) appendInteraction — 여러 wave 순서 보존
 * 4) setFocusModeActive(true) — focusModeActive 플래그 업데이트
 * 5) setFocusModeActive(false) — 되돌리기 가능
 * 6) setFocusModeActive — 라이브 세션 없을 때 no-op (안전)
 * 7) startLive — focusModeActive 는 displayOpts.teacherFocusMode 에서 초기화
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useMultiSurveyV2Store } from '../useMultiSurveyV2Store';
import type { StudentInteraction } from '@domain/entities/multiSurvey/LiveSession';

// ── 픽스처 ──────────────────────────────────────────────────────────────────

const NOW_ISO = '2026-06-12T10:00:00.000Z';

function makeWaveInteraction(studentId: string, at = NOW_ISO): StudentInteraction {
  return { studentId, kind: 'wave', at };
}

// ── store 초기화 헬퍼 ────────────────────────────────────────────────────────

function resetStore(): void {
  useMultiSurveyV2Store.setState({
    realtimeToolV2Enabled: false,
    migrationStatus: 'idle',
    sessions: [],
    loaded: false,
    selectedSessionId: null,
    liveSession: null,
    questionOpenedAt: {},
    _rng: undefined,
  });
}

// ── 라이브 세션 시작 헬퍼 ────────────────────────────────────────────────────

function startTestLiveSession(teacherFocusMode = false): void {
  const { createSession, updateDisplayOpts, startLive } = useMultiSurveyV2Store.getState();
  const session = createSession({
    title: '테스트',
    idGen: () => 'sess-1',
    now: () => new Date(NOW_ISO),
  });
  if (teacherFocusMode) {
    updateDisplayOpts(session.id, { teacherFocusMode: true });
  }
  startLive(session.id);
}

// ── 테스트 ──────────────────────────────────────────────────────────────────

describe('useMultiSurveyV2Store — appendInteraction (DN-03)', () => {
  beforeEach(resetStore);

  it('1) wave 이벤트가 studentInteractions 에 누적된다', () => {
    startTestLiveSession();
    const { appendInteraction } = useMultiSurveyV2Store.getState();
    appendInteraction(makeWaveInteraction('student-A'));

    const live = useMultiSurveyV2Store.getState().liveSession;
    expect(live?.studentInteractions).toHaveLength(1);
    expect(live?.studentInteractions[0]).toMatchObject({
      studentId: 'student-A',
      kind: 'wave',
      at: NOW_ISO,
    });
  });

  it('2) 라이브 세션 없을 때 appendInteraction 은 no-op (오류 없음)', () => {
    // liveSession = null 상태
    expect(() => {
      useMultiSurveyV2Store.getState().appendInteraction(makeWaveInteraction('student-B'));
    }).not.toThrow();
    expect(useMultiSurveyV2Store.getState().liveSession).toBeNull();
  });

  it('3) 여러 wave 이벤트가 순서대로 누적된다', () => {
    startTestLiveSession();
    const { appendInteraction } = useMultiSurveyV2Store.getState();
    appendInteraction(makeWaveInteraction('student-A', '2026-06-12T10:00:01.000Z'));
    appendInteraction(makeWaveInteraction('student-B', '2026-06-12T10:00:02.000Z'));
    appendInteraction(makeWaveInteraction('student-A', '2026-06-12T10:00:03.000Z'));

    const live = useMultiSurveyV2Store.getState().liveSession;
    const interactions = live?.studentInteractions ?? [];
    expect(interactions).toHaveLength(3);
    expect(interactions[0]?.studentId).toBe('student-A');
    expect(interactions[1]?.studentId).toBe('student-B');
    expect(interactions[2]?.studentId).toBe('student-A');
  });
});

describe('useMultiSurveyV2Store — setFocusModeActive (DN-06)', () => {
  beforeEach(resetStore);

  it('4) setFocusModeActive(true) 로 focusModeActive 가 true 로 설정된다', () => {
    startTestLiveSession();
    useMultiSurveyV2Store.getState().setFocusModeActive(true);

    const live = useMultiSurveyV2Store.getState().liveSession;
    expect(live?.focusModeActive).toBe(true);
  });

  it('5) setFocusModeActive(false) 로 되돌릴 수 있다', () => {
    startTestLiveSession();
    useMultiSurveyV2Store.getState().setFocusModeActive(true);
    useMultiSurveyV2Store.getState().setFocusModeActive(false);

    const live = useMultiSurveyV2Store.getState().liveSession;
    expect(live?.focusModeActive).toBe(false);
  });

  it('6) 라이브 세션 없을 때 setFocusModeActive 는 no-op (오류 없음)', () => {
    expect(() => {
      useMultiSurveyV2Store.getState().setFocusModeActive(true);
    }).not.toThrow();
    expect(useMultiSurveyV2Store.getState().liveSession).toBeNull();
  });

  it('7) startLive — focusModeActive 는 displayOpts.teacherFocusMode 값으로 초기화된다', () => {
    // teacherFocusMode=true 인 세션
    const { createSession, updateDisplayOpts, startLive } = useMultiSurveyV2Store.getState();
    const session = createSession({
      title: '집중 모드 ON 세션',
      idGen: () => 'sess-focus',
      now: () => new Date(NOW_ISO),
    });
    updateDisplayOpts(session.id, { teacherFocusMode: true });
    startLive(session.id);

    const live = useMultiSurveyV2Store.getState().liveSession;
    expect(live?.focusModeActive).toBe(true);
  });
});
