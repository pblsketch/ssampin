/**
 * 쿨메신저 쪽지함(.udb) 읽기 전용 리더.
 *
 * ## 절대 규칙: 원본은 쓰기 모드로 열지 않는다
 * 남의 앱 데이터다. 쪽지함이 깨지면 선생님이 업무 연락을 잃는다.
 * `.udb` + `-wal` + `-shm` 세 파일을 임시 폴더에 **복사한 뒤 복사본을 읽기 전용으로** 연다.
 * (`-wal`은 아직 본 파일에 반영 안 된 최신 쪽지가 들어 있어서 같이 복사해야 한다.)
 *
 * ## 새 의존성이 필요 없다
 * Electron 43이 품은 Node 24에 `node:sqlite`가 **기본 내장**이다.
 * `better-sqlite3` 같은 네이티브 모듈을 넣지 않는다 — 설치 파일이 무거워지고
 * `electron-rebuild`가 필요해진다.
 *
 * ## 원본
 * `coolm-helper`의 `parser/db_reader.py`를 TypeScript로 옮긴 것.
 *
 *   Copyright (c) 2026 dacisosl · MIT License
 *   https://github.com/dacisosl/coolm-helper
 *
 * @see docs/01-plan/features/coolmessenger-import.plan.md
 */
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** 쿨메신저가 쪽지함을 두는 곳 */
export function defaultMemoDir(): string | null {
  const local = process.env.LOCALAPPDATA;
  if (!local) return null;
  return join(local, 'CoolMessenger', 'Memo');
}

/** 쪽지함 구조가 예상과 다를 때 (쿨메신저 업데이트 등) — 조용히 실패하지 않고 이걸 던진다 */
export class CoolSchemaMismatchError extends Error {
  constructor(detail: string) {
    super(`쿨메신저 쪽지함 구조가 예상과 다릅니다: ${detail}`);
    this.name = 'CoolSchemaMismatchError';
  }
}

/** 쪽지함을 못 찾았을 때 */
export class CoolMemoNotFoundError extends Error {
  constructor(memoDir: string) {
    super(`쪽지함 파일(.udb)을 찾을 수 없습니다: ${memoDir}`);
    this.name = 'CoolMemoNotFoundError';
  }
}

/** 쪽지 한 건 */
export interface CoolMessage {
  readonly key: number;
  readonly sender: string;
  /** 받은 시각 (ISO 8601 — IPC로 넘기기 위해 문자열) */
  readonly receivedAt: string;
  readonly title: string;
  readonly body: string;
  readonly isUnread: boolean;
}

/** `tbl_recv`에 반드시 있어야 하는 칸 */
const REQUIRED_RECV_COLUMNS = [
  'MessageKey',
  'Sender',
  'ReceiveDate',
  'Title',
  'MessageText',
] as const;

/** 안읽은 쪽지 안전 상한 (사실상 무제한) */
const UNREAD_CAP = 200;

/** 목록에서 미리 읽어올 본문 길이 — 전문을 다 읽으면 큰 쪽지함에서 몇 초씩 걸린다 */
const BODY_PREVIEW_CHARS = 600;

/**
 * `2026/07/16 17:04:52 (목)` → Date (지역시간)
 *
 * 쿨메신저가 쓰는 형식이다. 뒤의 요일 표기는 무시한다.
 */
export function parseReceiveDate(raw: string): Date | null {
  const m = /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/.exec(String(raw));
  if (!m) return null;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 폴더에서 가장 최근 수정된 .udb를 고른다 (구버전 파일이 같이 있을 수 있다) */
export function findActiveUdb(memoDir: string): string {
  let candidates: string[];
  try {
    candidates = readdirSync(memoDir).filter((f) => f.toLowerCase().endsWith('.udb'));
  } catch {
    throw new CoolMemoNotFoundError(memoDir);
  }
  if (candidates.length === 0) throw new CoolMemoNotFoundError(memoDir);

  let best = '';
  let bestTime = -1;
  for (const name of candidates) {
    const full = join(memoDir, name);
    const mtime = statSync(full).mtimeMs;
    if (mtime > bestTime) {
      bestTime = mtime;
      best = full;
    }
  }
  return best;
}

/** 쿨메신저가 깔려 있고 쪽지함을 읽을 수 있는가 — 설정 스위치를 켤 때 확인용 */
export function isCoolMessengerAvailable(memoDir?: string | null): boolean {
  const dir = memoDir ?? defaultMemoDir();
  if (!dir || !existsSync(dir)) return false;
  try {
    findActiveUdb(dir);
    return true;
  } catch {
    return false;
  }
}

/** 복사본을 읽기 전용으로 열고 콜백에 넘긴다. 끝나면 임시 폴더를 반드시 지운다. */
function withReadOnlyCopy<T>(memoDir: string, fn: (db: DatabaseSync) => T): T {
  const src = findActiveUdb(memoDir);
  const tmp = mkdtempSync(join(tmpdir(), 'ssampin-cool-'));
  const dst = join(tmp, 'copy.udb');
  try {
    // -wal 에는 아직 본 파일에 안 합쳐진 최신 쪽지가 있다. 셋 다 복사해야 최신 상태가 보인다.
    for (const ext of ['', '-wal', '-shm']) {
      if (existsSync(src + ext)) copyFileSync(src + ext, dst + ext);
    }
    const db = new DatabaseSync(dst, { readOnly: true });
    try {
      validateSchema(db);
      return fn(db);
    } finally {
      db.close();
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function validateSchema(db: DatabaseSync): void {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{
    name: string;
  }>;
  if (!tables.some((t) => t.name === 'tbl_recv')) {
    throw new CoolSchemaMismatchError('tbl_recv 표가 없습니다');
  }
  const columns = db.prepare('PRAGMA table_info(tbl_recv)').all() as Array<{ name: string }>;
  const names = new Set(columns.map((c) => c.name));
  const missing = REQUIRED_RECV_COLUMNS.filter((c) => !names.has(c));
  if (missing.length > 0) {
    throw new CoolSchemaMismatchError(`tbl_recv에 필요한 칸이 없습니다: ${missing.join(', ')}`);
  }
}

interface RecvRow {
  readonly MessageKey: number;
  readonly Sender: string | null;
  readonly ReceiveDate: string | null;
  readonly Title: string | null;
  readonly Body: string | null;
  readonly IsUnRead: number | null;
}

function toMessage(row: RecvRow): CoolMessage | null {
  const received = parseReceiveDate(row.ReceiveDate ?? '');
  if (!received) return null; // 시각을 못 읽으면 일정으로 쓸 수 없다 — 조용히 건너뛴다
  return {
    key: Number(row.MessageKey),
    sender: row.Sender ?? '',
    receivedAt: received.toISOString(),
    title: row.Title ?? '',
    body: row.Body ?? '',
    isUnread: Boolean(row.IsUnRead),
  };
}

/**
 * 최근 쪽지 목록.
 *
 * **안읽은 쪽지는 개수 제한 없이 전부** 넣고, 읽은 쪽지는 최근 `limit`개만 넣는다.
 * 안읽은 게 30개 쌓인 날에도 확인 중인 쪽지가 목록에서 사라지지 않게 하기 위해서다.
 * 목록에서는 본문을 앞 600자만 읽는다 — 전문은 `readCoolMessage()`로 따로 가져온다.
 */
export function readCoolMessages(memoDir: string, limit = 30): CoolMessage[] {
  return withReadOnlyCopy(memoDir, (db) => {
    const columns =
      `MessageKey, Sender, ReceiveDate, Title, ` +
      `substr(MessageText, 1, ${BODY_PREVIEW_CHARS}) AS Body, IsUnRead`;

    const unread = db
      .prepare(
        `SELECT ${columns} FROM tbl_recv ` +
          `WHERE DeletedDate IS NULL AND IsUnRead = 1 ` +
          `ORDER BY ReceiveDate DESC LIMIT ?`,
      )
      .all(UNREAD_CAP) as RecvRow[];

    const read = db
      .prepare(
        `SELECT ${columns} FROM tbl_recv ` +
          `WHERE DeletedDate IS NULL AND (IsUnRead IS NULL OR IsUnRead != 1) ` +
          `ORDER BY ReceiveDate DESC LIMIT ?`,
      )
      .all(Math.max(0, Math.trunc(limit))) as RecvRow[];

    const out: CoolMessage[] = [];
    for (const row of [...unread, ...read]) {
      const msg = toMessage(row);
      if (msg) out.push(msg);
    }
    out.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    return out;
  });
}

/** 쪽지 한 건의 전문 (목록에서 고른 뒤 상세를 채울 때) */
export function readCoolMessage(memoDir: string, key: number): CoolMessage | null {
  return withReadOnlyCopy(memoDir, (db) => {
    const row = db
      .prepare(
        'SELECT MessageKey, Sender, ReceiveDate, Title, MessageText AS Body, IsUnRead ' +
          'FROM tbl_recv WHERE MessageKey = ?',
      )
      .get(Math.trunc(key)) as RecvRow | undefined;
    return row ? toMessage(row) : null;
  });
}

/**
 * 교직원 명단(`tbl_member`) — 개인정보 탐지 사전으로 재활용한다.
 *
 * 이 표는 없을 수도 있다. 없으면 빈 목록을 돌려주고 기능은 그대로 동작한다.
 */
export function readCoolMemberNames(memoDir: string): string[] {
  return withReadOnlyCopy(memoDir, (db) => {
    try {
      const rows = db.prepare('SELECT MemberName FROM tbl_member').all() as Array<{
        MemberName: string | null;
      }>;
      const names = new Set<string>();
      for (const r of rows) {
        const name = (r.MemberName ?? '').trim();
        if (name) names.add(name);
      }
      return [...names];
    } catch {
      return []; // tbl_member 가 없는 버전 — 명렬 대조만 못 할 뿐 기능은 산다
    }
  });
}
