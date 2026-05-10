/**
 * MemorySessionRepository — `ISessionRepository`의 in-memory 구현.
 *
 * **임시 구현**: 본 PR 범위는 WS 서버 동작 검증. 영속화는 별도 PR에서
 * `JsonInteractiveLessonRepository`(IStoragePort 위)로 교체 예정.
 *
 * 메모리 한계: 앱 재시작 시 모든 세션 정보 소실. F8-3 과거 세션 결과 조회는
 * JSON 영속 PR 이후에 가능.
 */

import type {
  LessonSession,
  LessonSessionSnapshot,
} from '@domain/entities/InteractiveSlides';
import type { ISessionRepository } from '@domain/ports/ISessionRepository';
import type {
  LessonId,
  SessionId,
} from '@domain/valueObjects/InteractiveSlidesIds';

export class MemorySessionRepository implements ISessionRepository {
  private sessions = new Map<SessionId, LessonSession>();
  private snapshots = new Map<SessionId, LessonSessionSnapshot>();

  saveSession(session: LessonSession): Promise<void> {
    this.sessions.set(session.id, session);
    return Promise.resolve();
  }

  saveSnapshot(snapshot: LessonSessionSnapshot): Promise<void> {
    this.snapshots.set(snapshot.session.id, snapshot);
    this.sessions.set(snapshot.session.id, snapshot.session);
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

  /** 진행 중 세션 중 동일 shortCode 검색 (StartLessonSession.findActiveByShortCode 용) */
  findActiveByShortCode(code: string): LessonSession | null {
    for (const s of this.sessions.values()) {
      if (s.status === 'archived') continue;
      if ((s.shortCode as string) === code) return s;
    }
    return null;
  }
}
