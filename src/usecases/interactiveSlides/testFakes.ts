/**
 * 테스트용 in-memory fakes for ports.
 * 단위 테스트에서 UseCase 의존성으로 주입.
 */

import type {
  LessonSession,
  LessonSessionSnapshot,
  OverlayResults,
  SessionStudent,
  SlideOverlay,
  StudentResponse,
} from '@domain/entities/InteractiveSlides';
import type {
  ILiveResponseStore,
  LiveOverlayState,
} from '@domain/ports/ILiveResponseStore';
import type { ISessionRepository } from '@domain/ports/ISessionRepository';
import type {
  IRealtimeBroadcaster,
  ServerToStudentMessage,
  ServerToTeacherMessage,
} from '@domain/ports/IRealtimeBroadcaster';
import type {
  LessonId,
  OverlayId,
  SessionId,
  StudentToken,
} from '@domain/valueObjects/InteractiveSlidesIds';

// ─────────────────────────────────────────────────────────────
export class FakeSessionRepository implements ISessionRepository {
  readonly sessions = new Map<SessionId, LessonSession>();
  readonly snapshots = new Map<SessionId, LessonSessionSnapshot>();

  saveSession(session: LessonSession): Promise<void> {
    this.sessions.set(session.id, session);
    return Promise.resolve();
  }
  saveSnapshot(snapshot: LessonSessionSnapshot): Promise<void> {
    this.snapshots.set(snapshot.session.id, snapshot);
    return Promise.resolve();
  }
  loadSession(id: SessionId): Promise<LessonSession | null> {
    return Promise.resolve(this.sessions.get(id) ?? null);
  }
  loadSnapshot(id: SessionId): Promise<LessonSessionSnapshot | null> {
    return Promise.resolve(this.snapshots.get(id) ?? null);
  }
  listByLessonId(lessonId: LessonId): Promise<readonly LessonSession[]> {
    const out: LessonSession[] = [];
    for (const s of this.sessions.values()) {
      if (s.lessonId === lessonId) out.push(s);
    }
    return Promise.resolve(out);
  }
  delete(id: SessionId): Promise<void> {
    this.sessions.delete(id);
    this.snapshots.delete(id);
    return Promise.resolve();
  }
  listExpired(beforeMs: number): Promise<readonly SessionId[]> {
    const out: SessionId[] = [];
    for (const s of this.sessions.values()) {
      if (s.archivedAt !== null && s.archivedAt < beforeMs) out.push(s.id);
    }
    return Promise.resolve(out);
  }
}

// ─────────────────────────────────────────────────────────────
export class FakeLiveResponseStore implements ILiveResponseStore {
  private students = new Map<SessionId, Map<StudentToken, SessionStudent>>();
  private overlays = new Map<SessionId, Map<OverlayId, LiveOverlayState>>();
  private responses = new Map<SessionId, Map<string, StudentResponse>>(); // key: overlayId:studentToken
  private results = new Map<SessionId, Map<OverlayId, OverlayResults>>();

  initSession(sessionId: SessionId): void {
    this.students.set(sessionId, new Map());
    this.overlays.set(sessionId, new Map());
    this.responses.set(sessionId, new Map());
    this.results.set(sessionId, new Map());
  }
  hasSession(sessionId: SessionId): boolean {
    return this.students.has(sessionId);
  }
  disposeSession(sessionId: SessionId): void {
    this.students.delete(sessionId);
    this.overlays.delete(sessionId);
    this.responses.delete(sessionId);
    this.results.delete(sessionId);
  }

  addStudent(sessionId: SessionId, student: SessionStudent): void {
    this.students.get(sessionId)?.set(student.studentToken, student);
  }
  markStudentPresence(
    sessionId: SessionId,
    token: StudentToken,
    online: boolean,
  ): void {
    const s = this.students.get(sessionId)?.get(token);
    if (s) {
      this.students
        .get(sessionId)!
        .set(token, { ...s, presence: online ? 'online' : 'offline' });
    }
  }
  listStudents(sessionId: SessionId): readonly SessionStudent[] {
    return Array.from(this.students.get(sessionId)?.values() ?? []);
  }
  studentCount(sessionId: SessionId): number {
    return this.students.get(sessionId)?.size ?? 0;
  }
  findRecentlyDisconnected(): SessionStudent | null {
    return null; // 본 fake에서는 미구현
  }

  activateOverlay(
    sessionId: SessionId,
    overlay: SlideOverlay,
    activatedAt: number,
  ): void {
    this.overlays.get(sessionId)?.set(overlay.id, {
      overlay,
      slideId: overlay.slideId,
      activatedAt,
      deactivatedAt: null,
    });
  }
  markDeactivated(
    sessionId: SessionId,
    overlayId: OverlayId,
    deactivatedAt: number,
  ): void {
    const cur = this.overlays.get(sessionId)?.get(overlayId);
    if (cur) {
      this.overlays.get(sessionId)!.set(overlayId, { ...cur, deactivatedAt });
    }
  }
  getOverlayState(
    sessionId: SessionId,
    overlayId: OverlayId,
  ): LiveOverlayState | null {
    return this.overlays.get(sessionId)?.get(overlayId) ?? null;
  }
  listActiveOverlays(sessionId: SessionId): readonly LiveOverlayState[] {
    const all = Array.from(this.overlays.get(sessionId)?.values() ?? []);
    return all.filter((o) => o.deactivatedAt === null);
  }
  listClosedOverlayResults(sessionId: SessionId): readonly OverlayResults[] {
    return Array.from(this.results.get(sessionId)?.values() ?? []);
  }
  setOverlayResults(sessionId: SessionId, results: OverlayResults): void {
    this.results.get(sessionId)?.set(results.overlayId, results);
  }

  upsertResponse(sessionId: SessionId, response: StudentResponse): void {
    const key = `${response.overlayId}:${response.studentToken}`;
    this.responses.get(sessionId)?.set(key, response);
  }
  listResponses(
    sessionId: SessionId,
    overlayId: OverlayId,
  ): readonly StudentResponse[] {
    const out: StudentResponse[] = [];
    for (const r of this.responses.get(sessionId)?.values() ?? []) {
      if (r.overlayId === overlayId) out.push(r);
    }
    return out;
  }
  listAllResponses(sessionId: SessionId): readonly StudentResponse[] {
    return Array.from(this.responses.get(sessionId)?.values() ?? []);
  }
  respondCount(sessionId: SessionId, overlayId: OverlayId): number {
    return this.listResponses(sessionId, overlayId).length;
  }
}

// ─────────────────────────────────────────────────────────────
export class FakeBroadcaster implements IRealtimeBroadcaster {
  readonly studentBroadcasts: { sessionId: SessionId; msg: ServerToStudentMessage }[] = [];
  readonly studentDirect: {
    sessionId: SessionId;
    token: StudentToken;
    msg: ServerToStudentMessage;
  }[] = [];
  readonly teacherMessages: { sessionId: SessionId; msg: ServerToTeacherMessage }[] = [];

  broadcastToStudents(sessionId: SessionId, message: ServerToStudentMessage): void {
    this.studentBroadcasts.push({ sessionId, msg: message });
  }
  sendToStudent(
    sessionId: SessionId,
    token: StudentToken,
    message: ServerToStudentMessage,
  ): void {
    this.studentDirect.push({ sessionId, token, msg: message });
  }
  sendToTeacher(sessionId: SessionId, message: ServerToTeacherMessage): void {
    this.teacherMessages.push({ sessionId, msg: message });
  }

  reset(): void {
    this.studentBroadcasts.length = 0;
    this.studentDirect.length = 0;
    this.teacherMessages.length = 0;
  }
}
