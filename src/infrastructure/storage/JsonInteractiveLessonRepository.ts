/**
 * JsonInteractiveLessonRepository — `ISessionRepository`의 JSON 파일 영속화 구현.
 *
 * 메인 프로세스 전용 (fs 직접 접근). 메모리 어댑터 교체용.
 *
 * 경로 정책 (Plan §3 + Design §5.5):
 *   {userData}/data/lessonSessions/{sessionId}.session.json   — 메타 (빈번 쓰기, 작음)
 *   {userData}/data/lessonSessions/{sessionId}.snapshot.json  — 종료 1회만 쓰기 (큼)
 *
 * 분리 이유: saveSession은 슬라이드 전환마다 호출되는 hot path. 스냅샷은
 * 학생 응답·이미지·집계 결과 모두 포함해 수 MB까지 가능 → 매번 같이 쓰면 디스크 폭증.
 */

import fs from 'fs';
import path from 'path';

import type {
  LessonSession,
  LessonSessionSnapshot,
} from '@domain/entities/InteractiveSlides';
import type { ISessionRepository } from '@domain/ports/ISessionRepository';
import type {
  LessonId,
  SessionId,
} from '@domain/valueObjects/InteractiveSlidesIds';

const SESSION_FILE_EXT = '.session.json';
const SNAPSHOT_FILE_EXT = '.snapshot.json';

/** 경로 컴포넌트 sanitization (URL-safe 영숫자/`_`/`-`만 허용) */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

function assertSafeId(id: string, label: string): void {
  if (!SAFE_ID.test(id)) {
    throw new Error(`Invalid ${label} (must match ${SAFE_ID}): ${id}`);
  }
}

export class JsonInteractiveLessonRepository implements ISessionRepository {
  private readonly sessionsDir: string;

  /**
   * @param userDataDir Electron `app.getPath('userData')` 결과
   *                    (테스트에서는 os.tmpdir() 하위 임시 폴더 주입 가능)
   */
  constructor(userDataDir: string) {
    this.sessionsDir = path.join(userDataDir, 'data', 'lessonSessions');
  }

  private sessionFile(id: SessionId): string {
    assertSafeId(id as string, 'sessionId');
    return path.join(this.sessionsDir, `${id}${SESSION_FILE_EXT}`);
  }

  private snapshotFile(id: SessionId): string {
    assertSafeId(id as string, 'sessionId');
    return path.join(this.sessionsDir, `${id}${SNAPSHOT_FILE_EXT}`);
  }

  private async ensureDir(): Promise<void> {
    await fs.promises.mkdir(this.sessionsDir, { recursive: true });
  }

  async saveSession(session: LessonSession): Promise<void> {
    await this.ensureDir();
    const target = this.sessionFile(session.id);
    await writeJsonAtomic(target, session);
  }

  async saveSnapshot(snapshot: LessonSessionSnapshot): Promise<void> {
    await this.ensureDir();
    const sessionTarget = this.sessionFile(snapshot.session.id);
    const snapshotTarget = this.snapshotFile(snapshot.session.id);
    // 메타 + 스냅샷 모두 갱신 (스냅샷의 session 필드가 진실 소스)
    await writeJsonAtomic(sessionTarget, snapshot.session);
    await writeJsonAtomic(snapshotTarget, snapshot);
  }

  async loadSession(id: SessionId): Promise<LessonSession | null> {
    return readJsonOrNull<LessonSession>(this.sessionFile(id));
  }

  async loadSnapshot(id: SessionId): Promise<LessonSessionSnapshot | null> {
    return readJsonOrNull<LessonSessionSnapshot>(this.snapshotFile(id));
  }

  async listByLessonId(lessonId: LessonId): Promise<readonly LessonSession[]> {
    const all = await this.listAllSessionMetas();
    return all.filter((s) => s.lessonId === lessonId);
  }

  async delete(id: SessionId): Promise<void> {
    for (const target of [this.sessionFile(id), this.snapshotFile(id)]) {
      try {
        await fs.promises.unlink(target);
      } catch (err) {
        if (!isEnoent(err)) throw err;
      }
    }
  }

  async listExpired(beforeMs: number): Promise<readonly SessionId[]> {
    const all = await this.listAllSessionMetas();
    const out: SessionId[] = [];
    for (const s of all) {
      if (s.archivedAt !== null && s.archivedAt < beforeMs) out.push(s.id);
    }
    return out;
  }

  /**
   * 진행 중 세션 중 동일 shortCode 검색
   * (StartLessonSession.findActiveByShortCode가 호출 — Plan §11.3 코드 충돌 방지).
   */
  async findActiveByShortCode(code: string): Promise<LessonSession | null> {
    const all = await this.listAllSessionMetas();
    for (const s of all) {
      if (s.status === 'archived') continue;
      if ((s.shortCode as string) === code) return s;
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────
  // Internal: 메타 파일 디렉토리 스캔
  // ─────────────────────────────────────────────────────────────
  private async listAllSessionMetas(): Promise<readonly LessonSession[]> {
    let entries: string[];
    try {
      entries = await fs.promises.readdir(this.sessionsDir);
    } catch (err) {
      if (isEnoent(err)) return [];
      throw err;
    }
    const metaFiles = entries.filter((e) => e.endsWith(SESSION_FILE_EXT));
    const out: LessonSession[] = [];
    for (const file of metaFiles) {
      const session = await readJsonOrNull<LessonSession>(
        path.join(this.sessionsDir, file),
      );
      if (session) out.push(session);
    }
    return out;
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function readJsonOrNull<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err) {
    if (isEnoent(err)) return null;
    // 손상된 JSON은 null로 fallback (보수적)
    if (err instanceof SyntaxError) return null;
    throw err;
  }
}

/**
 * Atomic write: tmp 파일에 쓰고 rename.
 * 쓰기 도중 앱 크래시 시 절반 쓴 파일 잔류 방지 (회귀 위험 #5).
 */
async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const tmp = `${filePath}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.promises.rename(tmp, filePath);
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'ENOENT'
  );
}
