/**
 * 쿨메신저 쪽지함(.udb) 읽기 전용 리더.
 *
 * ## 절대 규칙: 원본은 쓰기 모드로 열지 않는다
 * 남의 앱 데이터다. 쪽지함이 깨지면 선생님이 업무 연락을 잃는다.
 * `.udb` + `-wal` + `-shm` 세 파일을 임시 폴더에 **복사한 뒤 복사본을 읽기 전용으로** 연다.
 * (`-wal`은 아직 본 파일에 반영 안 된 최신 쪽지가 들어 있어서 같이 복사해야 한다.)
 * 짧은 시간 안의 연속 읽기(가져오기 창에서 쪽지 클릭)는 복사본 하나를 재사용한다 —
 * 원본이 바뀌면(수정시각·크기) 즉시 새로 복사하므로 오래된 데이터를 보여주지 않는다.
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
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

/** 쿨메신저가 쪽지함을 두는 곳 */
export function defaultMemoDir(): string | null {
  const local = process.env.LOCALAPPDATA;
  if (!local) return null;
  return join(local, 'CoolMessenger', 'Memo');
}

/**
 * 앱이 강제 종료돼 못 지운 임시 사본을 쓸어낸다 — 시작 시 한 번 부른다.
 *
 * 세션 만료·앱 종료 시 `closeCoolReaderSession` 이 지우지만, 그 전에 프로세스가
 * 죽으면(작업 관리자 종료·크래시) `%TEMP%\ssampin-cool-*` 에 **쪽지 전문 사본**이 그대로 남는다.
 * 개인정보라 다음 실행에서 반드시 청소한다. 실패해도 기능은 계속 간다.
 */
export function cleanupStaleCoolTempDirs(): void {
  try {
    const base = tmpdir();
    for (const name of readdirSync(base)) {
      if (!name.startsWith('ssampin-cool-')) continue;
      try {
        rmSync(join(base, name), { recursive: true, force: true });
      } catch {
        // 다른 프로세스가 잡고 있으면 다음 실행에서 다시 시도한다
      }
    }
  } catch {
    // temp 목록 자체를 못 읽는 환경 — 청소는 최선 노력이다
  }
}

/** 쪽지함 구조가 예상과 다를 때 (쿨메신저 업데이트 등) — 조용히 실패하지 않고 이걸 던진다 */
export class CoolSchemaMismatchError extends Error {
  constructor(detail: string) {
    super(`쿨메신저 쪽지함 구조가 예상과 다릅니다: ${detail}`);
    this.name = 'CoolSchemaMismatchError';
  }
}

/** 쪽지함을 못 찾았을 때 — 전체 경로는 노출하지 않는다(폴더명까지만) */
export class CoolMemoNotFoundError extends Error {
  constructor(memoDir: string) {
    super(`쪽지함 파일(.udb)을 찾을 수 없습니다 (폴더: ${basename(memoDir) || memoDir})`);
    this.name = 'CoolMemoNotFoundError';
  }
}

/**
 * 파일 접근 오류를 선생님이 읽을 수 있는 한국어로 바꾼다.
 *
 * 안 바꾸면 화면에 `EBUSY: resource busy or locked, copyfile 'C:\Users\…\MyMemo.udb' …`
 * 같은 영문 원문 + **전체 경로**(사용자 계정명 포함)가 그대로 뜬다.
 * 경로는 폴더명까지만 담는다.
 */
export function toReadableCoolError(err: unknown, memoDir: string): Error {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
    return new Error(
      '쿨메신저가 쪽지함을 쓰고 있어 잠시 읽을 수 없습니다. 잠시 후 다시 시도해 주세요.',
    );
  }
  if (code === 'ENOENT') {
    return new CoolMemoNotFoundError(memoDir);
  }
  return err instanceof Error ? err : new Error(String(err));
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
 * 경계에서 낱말이 잘리지 않게 더 읽어 오는 여유분.
 *
 * ★600자에서 뚝 자르면 "8월 31일"이 "8월 3"이 되고, 배너의 후보 계산이 그 유령 날짜를
 * 진짜 후보로 세어 모달(전문 기준)과 어긋난다(2026-08-24 UltraQA). 여유분까지 읽은 뒤
 * 600자 뒤 첫 공백(=낱말 끝)에서 자르면 경계의 날짜 표현이 온전히 살아남는다.
 */
const BODY_PREVIEW_MARGIN = 32;

/**
 * 미리보기 본문을 낱말 경계에서 자른다.
 *
 * `fetched` 는 SQL에서 최대 `PREVIEW+MARGIN+1` 자를 읽어 온 것 — 마지막 1자는
 * "뒤가 더 있는가"를 판별하는 용도라, 그보다 짧으면 본문 전체라서 그대로 돌려준다.
 * 잘라야 하면: ① 600자 뒤 첫 공백에서(경계의 낱말을 완성), ② 여유분 안에 공백이
 * 없으면 600자 앞 마지막 공백에서(불완전한 낱말을 통째로 버림 — 유령 날짜 방지),
 * ③ 공백이 아예 없으면 600자에서 자른다.
 */
export function trimPreviewBody(fetched: string): string {
  const cap = BODY_PREVIEW_CHARS + BODY_PREVIEW_MARGIN;
  if (fetched.length <= cap) return fetched;
  const window = fetched.slice(0, cap);
  const forward = /\s/.exec(window.slice(BODY_PREVIEW_CHARS));
  if (forward) return window.slice(0, BODY_PREVIEW_CHARS + forward.index);
  const backward = window.slice(0, BODY_PREVIEW_CHARS).search(/\s\S*$/);
  if (backward >= 0) return window.slice(0, backward);
  return window.slice(0, BODY_PREVIEW_CHARS);
}

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

/**
 * 복사본 세션 — 짧은 시간 안의 연속 읽기는 복사본 하나를 재사용한다.
 *
 * ★가져오기 창에서 쪽지를 클릭할 때마다 쪽지함 전체를 새로 복사하고 있었다
 * (2026-08-24 UltraQA). 큰 쪽지함(수십 MB)에서는 클릭마다 몇 초씩 걸린다.
 *
 * 원칙은 그대로다:
 *  - **원본은 여전히 쓰기 모드로 열지 않는다.** 복사본을 읽기 전용으로 여는 것만 재사용한다.
 *  - **오래된 데이터를 보여주지 않는다.** 매 호출마다 원본(.udb·-wal·-shm)의 수정 시각·
 *    크기를 확인하고, 하나라도 바뀌었으면 즉시 새로 복사한다. TTL은 "파일을 잡고 있는
 *    시간"의 상한일 뿐, 신선도는 이 도장(stamp) 비교가 보장한다.
 *  - 마지막 사용 후 TTL이 지나면 복사본을 닫고 지운다. 앱 종료 시에는
 *    `closeCoolReaderSession()` 을 불러 정리한다(ipc 쪽에서 연결).
 */
const SESSION_TTL_MS = 30_000;

interface ReaderSession {
  readonly memoDir: string;
  readonly srcPath: string;
  /** 원본 세 파일의 수정시각·크기 — 바뀌면 복사본을 버린다 */
  readonly srcStamp: string;
  readonly tmpDir: string;
  readonly db: DatabaseSync;
  timer: ReturnType<typeof setTimeout>;
}

let session: ReaderSession | null = null;

function sourceStamp(src: string): string {
  const parts: string[] = [];
  for (const ext of ['', '-wal', '-shm']) {
    if (!existsSync(src + ext)) continue;
    const st = statSync(src + ext);
    parts.push(`${ext}:${st.mtimeMs}:${st.size}`);
  }
  return parts.join('|');
}

/** 세션 복사본을 닫고 임시 폴더를 지운다. 앱 종료·테스트 정리에서도 부른다. */
export function closeCoolReaderSession(): void {
  if (!session) return;
  const s = session;
  session = null;
  clearTimeout(s.timer);
  try {
    s.db.close();
  } catch {
    // 이미 닫혔으면 무시
  }
  try {
    rmSync(s.tmpDir, { recursive: true, force: true });
  } catch {
    // 못 지우면 다음 실행의 cleanupStaleCoolTempDirs 가 청소한다
  }
}

function scheduleSessionExpiry(s: ReaderSession): void {
  clearTimeout(s.timer);
  s.timer = setTimeout(closeCoolReaderSession, SESSION_TTL_MS);
  // 테스트·종료 중에 타이머가 프로세스를 붙잡지 않게 한다
  s.timer.unref?.();
}

function openSession(memoDir: string): ReaderSession {
  const src = findActiveUdb(memoDir);
  let stamp: string;
  try {
    stamp = sourceStamp(src);
  } catch (err) {
    throw toReadableCoolError(err, memoDir); // 확인 도중 파일이 사라진 경우 등
  }

  if (
    session &&
    session.memoDir === memoDir &&
    session.srcPath === src &&
    session.srcStamp === stamp
  ) {
    scheduleSessionExpiry(session);
    return session;
  }

  closeCoolReaderSession();
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
    } catch (err) {
      db.close();
      throw err;
    }
    const next: ReaderSession = {
      memoDir,
      srcPath: src,
      srcStamp: stamp,
      tmpDir: tmp,
      db,
      timer: setTimeout(closeCoolReaderSession, SESSION_TTL_MS),
    };
    next.timer.unref?.();
    session = next;
    return next;
  } catch (err) {
    rmSync(tmp, { recursive: true, force: true });
    throw toReadableCoolError(err, memoDir);
  }
}

/** 세션 복사본을 읽기 전용으로 열어(또는 재사용해) 콜백에 넘긴다. */
function withReadOnlyCopy<T>(memoDir: string, fn: (db: DatabaseSync) => T): T {
  const s = openSession(memoDir);
  try {
    return fn(s.db);
  } catch (err) {
    // 질의 도중 오류 — 복사본이 원인일 수 있으니 세션을 버려 다음 호출에 새로 복사한다
    closeCoolReaderSession();
    throw err;
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
    // 여유분 +1자까지 읽는다 — trimPreviewBody 가 "뒤가 더 있는가"를 알아야 한다
    const columns =
      `MessageKey, Sender, ReceiveDate, Title, ` +
      `substr(MessageText, 1, ${BODY_PREVIEW_CHARS + BODY_PREVIEW_MARGIN + 1}) AS Body, IsUnRead`;

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
      if (msg) out.push({ ...msg, body: trimPreviewBody(msg.body) });
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
