/**
 * MemoryLiveResponseStore — `ILiveResponseStore` 구현체.
 *
 * 진행 중 세션의 라이브 상태(학생/오버레이/응답)를 메모리에 보관.
 * 디스크 R/W 없음 — `EndLessonSession` 유스케이스가 종료 시 스냅샷으로 변환해 영속.
 *
 * 메인 프로세스에서 단일 인스턴스. WS 서버(`electron/ipc/interactiveSlides.ts`)가
 * 보유. 세션 종료 시 `disposeSession`으로 메모리 회수.
 *
 * Plan §3 (라이브 응답: 메모리 + 종료 시 스냅샷) + Design §5.6 매핑.
 */

import type {
  OverlayResults,
  SessionStudent,
  SlideOverlay,
  StudentResponse,
} from '@domain/entities/InteractiveSlides';
import type {
  ILiveResponseStore,
  LiveOverlayState,
} from '@domain/ports/ILiveResponseStore';
import type {
  OverlayId,
  SessionId,
  SlideId,
  StudentToken,
} from '@domain/valueObjects/InteractiveSlidesIds';

interface SessionState {
  // studentToken → SessionStudent
  readonly students: Map<StudentToken, SessionStudent>;
  // 오프라인 전이 시각 (rejoin 식별용)
  readonly disconnectedAt: Map<StudentToken, number>;
  // overlayId → 라이브 상태 (active or closed)
  readonly overlays: Map<OverlayId, LiveOverlayState>;
  // (overlayId, studentToken) → 최신 응답 (upsert)
  readonly responses: Map<string, StudentResponse>;
  // overlayId → freeze된 OverlayResults
  readonly results: Map<OverlayId, OverlayResults>;
}

function responseKey(overlayId: OverlayId, token: StudentToken): string {
  return `${overlayId}::${token}`;
}

function newSessionState(): SessionState {
  return {
    students: new Map(),
    disconnectedAt: new Map(),
    overlays: new Map(),
    responses: new Map(),
    results: new Map(),
  };
}

export class MemoryLiveResponseStore implements ILiveResponseStore {
  private sessions = new Map<SessionId, SessionState>();

  // ─── Session lifecycle ───
  initSession(sessionId: SessionId): void {
    this.sessions.set(sessionId, newSessionState());
  }
  hasSession(sessionId: SessionId): boolean {
    return this.sessions.has(sessionId);
  }
  disposeSession(sessionId: SessionId): void {
    this.sessions.delete(sessionId);
  }

  // ─── Students ───
  addStudent(sessionId: SessionId, student: SessionStudent): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;
    state.students.set(student.studentToken, student);
    // 새로 추가되거나 재참여한 학생은 disconnect 기록 제거
    state.disconnectedAt.delete(student.studentToken);
  }

  markStudentPresence(
    sessionId: SessionId,
    token: StudentToken,
    online: boolean,
  ): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;
    const cur = state.students.get(token);
    if (!cur) return;
    state.students.set(token, {
      ...cur,
      presence: online ? 'online' : 'offline',
    });
    if (online) {
      state.disconnectedAt.delete(token);
    } else {
      // 정확한 disconnect 시각은 ws.on('close') 콜백에서 알 수 있음 — 호출자가 직전에 호출
      state.disconnectedAt.set(token, Date.now());
    }
  }

  listStudents(sessionId: SessionId): readonly SessionStudent[] {
    const state = this.sessions.get(sessionId);
    if (!state) return [];
    return Array.from(state.students.values());
  }

  studentCount(sessionId: SessionId): number {
    return this.sessions.get(sessionId)?.students.size ?? 0;
  }

  /**
   * rejoin 윈도우(60초) 내 disconnect한 학생 조회.
   * `join-session.rejoin.previousToken`이 이 호출과 매칭되면
   * 같은 학생으로 식별 — 새 token을 재발급하지 않고 기존 token 재사용.
   */
  findRecentlyDisconnected(
    sessionId: SessionId,
    token: StudentToken,
    nowMs: number,
    windowMs: number,
  ): SessionStudent | null {
    const state = this.sessions.get(sessionId);
    if (!state) return null;
    const disAt = state.disconnectedAt.get(token);
    if (disAt === undefined) return null;
    if (nowMs - disAt > windowMs) return null;
    const student = state.students.get(token);
    if (!student) return null;
    return student;
  }

  // ─── Overlays ───
  activateOverlay(
    sessionId: SessionId,
    overlay: SlideOverlay,
    activatedAt: number,
  ): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;
    state.overlays.set(overlay.id, {
      overlay,
      slideId: overlay.slideId as SlideId,
      activatedAt,
      deactivatedAt: null,
    });
  }

  markDeactivated(
    sessionId: SessionId,
    overlayId: OverlayId,
    deactivatedAt: number,
  ): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;
    const cur = state.overlays.get(overlayId);
    if (!cur || cur.deactivatedAt !== null) return;
    state.overlays.set(overlayId, { ...cur, deactivatedAt });
  }

  getOverlayState(
    sessionId: SessionId,
    overlayId: OverlayId,
  ): LiveOverlayState | null {
    return this.sessions.get(sessionId)?.overlays.get(overlayId) ?? null;
  }

  listActiveOverlays(sessionId: SessionId): readonly LiveOverlayState[] {
    const state = this.sessions.get(sessionId);
    if (!state) return [];
    const out: LiveOverlayState[] = [];
    for (const ov of state.overlays.values()) {
      if (ov.deactivatedAt === null) out.push(ov);
    }
    return out;
  }

  listClosedOverlayResults(sessionId: SessionId): readonly OverlayResults[] {
    const state = this.sessions.get(sessionId);
    if (!state) return [];
    return Array.from(state.results.values());
  }

  setOverlayResults(sessionId: SessionId, results: OverlayResults): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;
    state.results.set(results.overlayId, results);
  }

  // ─── Responses ───
  upsertResponse(sessionId: SessionId, response: StudentResponse): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;
    state.responses.set(
      responseKey(response.overlayId, response.studentToken),
      response,
    );
  }

  listResponses(
    sessionId: SessionId,
    overlayId: OverlayId,
  ): readonly StudentResponse[] {
    const state = this.sessions.get(sessionId);
    if (!state) return [];
    const out: StudentResponse[] = [];
    for (const r of state.responses.values()) {
      if (r.overlayId === overlayId) out.push(r);
    }
    return out;
  }

  listAllResponses(sessionId: SessionId): readonly StudentResponse[] {
    const state = this.sessions.get(sessionId);
    if (!state) return [];
    return Array.from(state.responses.values());
  }

  respondCount(sessionId: SessionId, overlayId: OverlayId): number {
    return this.listResponses(sessionId, overlayId).length;
  }
}
