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
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { coolLog, coolWarn, describeError } from './coolMessengerDiag';

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

/**
 * 경로에서 **마지막 폴더명만** 뽑는다.
 *
 * ★`node:path` 의 `basename` 을 쓰면 안 된다. 쪽지함 경로는 항상 윈도우 형식
 * (`C:\\Users\\<계정>\\...`)인데 `basename` 은 **실행 중인 OS 의 구분자**만 인정하므로,
 * 리눅스에서 부르면 백슬래시를 폴더 구분으로 안 보고 **문자열 전체를 그대로 돌려준다.**
 * 그러면 계정명을 가리려고 만든 이 함수가 계정명을 그대로 흘린다(CI 에서 실제로 잡혔다).
 *
 * 개인정보를 가리는 일이 **어느 OS 에서 도는지에 따라 달라지면 안 되므로** 구분자 두 가지를
 * 직접 처리한다. 빈 값이면 원본을 되돌리지 않는다 — 되돌리면 가리려던 전체 경로가 그대로 나간다.
 */
function lastFolderName(p: string): string {
  const parts = p.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? '알 수 없음';
}

/** 쪽지함을 못 찾았을 때 — 전체 경로는 노출하지 않는다(폴더명까지만) */
export class CoolMemoNotFoundError extends Error {
  constructor(memoDir: string) {
    super(`쪽지함 파일(.udb)을 찾을 수 없습니다 (폴더: ${lastFolderName(memoDir)})`);
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

/** `tbl_recv`에 반드시 있어야 하는 칸 — 이게 없으면 쪽지를 만들 수 없다 */
const REQUIRED_RECV_COLUMNS = [
  'MessageKey',
  'Sender',
  'ReceiveDate',
  'Title',
  'MessageText',
] as const;

/**
 * 있으면 쓰고 없으면 건너뛰는 칸.
 *
 * ★**검사와 조회가 보는 칸이 달라서** 실제로 사고가 났다(2026-08-24 신고).
 * 위 필수 목록은 5칸만 확인하는데 목록 조회 SQL은 `DeletedDate`·`IsUnRead` 를 더 썼다.
 * 그래서 "쪽지함은 찾았는데(설정 스위치는 켜짐) 목록만 실패"하고, 화면에는 원인 없이
 * `no such column: DeletedDate` 라는 영문만 떴다.
 *
 * 이 두 칸은 **없어도 기능의 본질(날짜 뽑아 일정 만들기)은 산다.** 삭제 걸러내기와
 * 안읽음 표시를 못 할 뿐이다. 그래서 필수로 올리지 않고 여기서 유무를 확인해
 * SQL을 그때그때 맞춘다. 쿨메신저는 시도교육청·버전별 배포본이 갈리므로
 * "내 학교 쪽지함에 있더라"를 전체의 사실로 가정하지 않는다.
 */
export interface RecvOptionalColumns {
  readonly hasDeletedDate: boolean;
  readonly hasIsUnRead: boolean;
}

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
 *
 * ★구분자를 `/` 하나로 못 박지 않는다. 이 형식은 원본 도구(coolm-helper) 개발자가
 * **자기 학교 쿨메신저 한 대**를 보고 확정한 것이라(record.md M0 조사), 배포본이 다르면
 * `2026-07-16`·`2026.07.16`·초 없는 표기가 올 수 있다. 여기서 못 읽은 쪽지는 오류도
 * 없이 목록에서 통째로 사라져 **"쪽지가 없습니다"로만 보인다** — 가장 찾기 어려운
 * 실패다. 그래서 받는 쪽을 너그럽게 둔다.
 */
export function parseReceiveDate(raw: string): Date | null {
  const m = /^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(
    String(raw).trim(),
  );
  if (!m) return null;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] ?? 0), // 초는 없을 수도 있다
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 날짜 문자열의 **모양만** 남긴다 — 숫자는 9, 그 밖의 글자는 ㅁ.
 *
 * 진단 로그에 `2026/07/16 17:04:52 (목)` 대신 `9999/99/99 99:99:99 (ㅁ)` 를 남기기 위한 것이다.
 * 형식이 다른 배포본을 알아내는 데는 모양만으로 충분하고, 내용은 남길 이유가 없다.
 */
export function dateShape(raw: string): string {
  return String(raw)
    .slice(0, 24)
    .replace(/\d/g, '9')
    .replace(/[^\s9/\-.:()]/g, 'ㅁ');
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
  /** 본 파일(.udb)의 수정시각·크기 — 바뀌면 복사본을 통째로 버린다 */
  mainStamp: string;
  /** -wal·-shm 의 수정시각·크기 — 이것만 바뀌면 두 파일만 다시 복사한다 */
  sideStamp: string;
  readonly tmpDir: string;
  /** 복사본 본 파일 경로 (부분 갱신 때 다시 쓴다) */
  readonly dstPath: string;
  db: DatabaseSync;
  readonly columns: RecvOptionalColumns;
  timer: ReturnType<typeof setTimeout>;
}

let session: ReaderSession | null = null;

function fileStamp(path: string): string {
  if (!existsSync(path)) return '-';
  const st = statSync(path);
  return `${st.mtimeMs}:${st.size}`;
}

/** -wal·-shm 의 도장. WAL 모드에선 쪽지가 하나 와도 매번 바뀐다. */
function sideStamp(src: string): string {
  return ['-wal', '-shm'].map((ext) => `${ext}:${fileStamp(src + ext)}`).join('|');
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

/**
 * -wal·-shm 만 다시 복사한다 — **본 파일은 건드리지 않는다.**
 *
 * ★실제 쪽지함은 278MB급이다(coolm-helper record.md 2026-07-18 기록).
 * WAL 모드에선 쪽지가 한 통만 와도 -wal 도장이 바뀌는데, 그때마다 본 파일까지
 * 다시 복사하면 **쪽지를 누를 때마다 앱 전체가 몇 초씩 얼어붙는다**(동기 복사라
 * 메인 프로세스가 통째로 멈춘다). 바뀐 건 대개 몇 MB짜리 -wal 뿐이므로 그것만 새로 뜬다.
 *
 * 신선도는 그대로다 — 본 파일 도장이 바뀌면 이 길로 오지 않고 전체 복사로 간다.
 * 복사본을 덮어쓰기 전에 연결을 반드시 닫는다(윈도우는 열린 파일을 못 덮어쓴다).
 */
function refreshSideFiles(s: ReaderSession, src: string): void {
  s.db.close();
  for (const ext of ['-wal', '-shm']) {
    if (existsSync(src + ext)) copyFileSync(src + ext, s.dstPath + ext);
    else rmSync(s.dstPath + ext, { force: true }); // 원본이 합쳐졌으면 사본도 지운다
  }
  s.db = new DatabaseSync(s.dstPath, { readOnly: true });
}

function scheduleSessionExpiry(s: ReaderSession): void {
  clearTimeout(s.timer);
  s.timer = setTimeout(closeCoolReaderSession, SESSION_TTL_MS);
  // 테스트·종료 중에 타이머가 프로세스를 붙잡지 않게 한다
  s.timer.unref?.();
}

function openSession(memoDir: string): ReaderSession {
  let src: string;
  let main: string;
  let side: string;
  try {
    // ★findActiveUdb 안의 statSync 가 실패하면(권한·경합) 여기서 감싸지 않는 한
    //   `EPERM: … 'C:\Users\홍길동\…'` 처럼 **전체 경로가 화면에 그대로 뜬다.**
    //   이 파일이 스스로 정한 "폴더명까지만" 원칙이 그 길로 새고 있었다.
    src = findActiveUdb(memoDir);
    main = fileStamp(src);
    side = sideStamp(src);
  } catch (err) {
    throw toReadableCoolError(err, memoDir);
  }

  if (session && session.memoDir === memoDir && session.srcPath === src) {
    if (session.mainStamp === main && session.sideStamp === side) {
      scheduleSessionExpiry(session);
      return session;
    }
    if (session.mainStamp === main) {
      try {
        refreshSideFiles(session, src); // 몇 MB짜리 -wal 만 새로 뜬다
        session.sideStamp = side;
        scheduleSessionExpiry(session);
        return session;
      } catch (err) {
        coolWarn('부분 갱신 실패 — 전체 복사로 되돌립니다', describeError(err));
        // 아래 전체 복사로 떨어진다
      }
    }
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
    let columns: RecvOptionalColumns;
    try {
      columns = validateSchema(db);
    } catch (err) {
      db.close();
      throw err;
    }
    const next: ReaderSession = {
      memoDir,
      srcPath: src,
      mainStamp: main,
      sideStamp: side,
      tmpDir: tmp,
      dstPath: dst,
      db,
      columns,
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

/**
 * 조회 중 SQLite가 던진 영문 오류를 한국어로 바꾼다.
 *
 * 안 바꾸면 화면에 `no such column: DeletedDate` 라는 영문만 뜬다 — 선생님은
 * 무엇을 해야 할지 알 수 없고, 우리도 신고를 받아야만 원인을 안다.
 */
export function toReadableQueryError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err);
  const m = /no such (column|table): ([\w.]+)/i.exec(raw);
  if (m) {
    const what = m[1] === 'table' ? '표' : '칸';
    return new CoolSchemaMismatchError(`${what} ${m[2]}이(가) 없습니다`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

/** 세션 복사본을 읽기 전용으로 열어(또는 재사용해) 콜백에 넘긴다. */
function withReadOnlyCopy<T>(
  memoDir: string,
  fn: (db: DatabaseSync, columns: RecvOptionalColumns) => T,
): T {
  const s = openSession(memoDir);
  try {
    return fn(s.db, s.columns);
  } catch (err) {
    // 질의 도중 오류 — 복사본이 원인일 수 있으니 세션을 버려 다음 호출에 새로 복사한다
    closeCoolReaderSession();
    coolWarn('쪽지함 조회 실패', describeError(err));
    throw toReadableQueryError(err);
  }
}

/**
 * 표·칸 구성을 확인하고 **선택 칸의 유무를 돌려준다.**
 *
 * 필수 5칸이 없으면 여기서 멈춘다(쪽지를 만들 수 없다). `DeletedDate`·`IsUnRead` 는
 * 없어도 진행하고, 조회 SQL이 그에 맞춰 바뀐다 — 왜 그렇게 하는지는
 * `RecvOptionalColumns` 주석 참고.
 */
function validateSchema(db: DatabaseSync): RecvOptionalColumns {
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
  const found: RecvOptionalColumns = {
    hasDeletedDate: names.has('DeletedDate'),
    hasIsUnRead: names.has('IsUnRead'),
  };
  // 이 한 줄이 다음 신고 때 원인을 되묻지 않아도 되게 해 준다 (칸 이름은 개인정보가 아니다)
  coolLog('쪽지함 열기 성공', {
    표: tables.map((t) => t.name).filter((n) => n.startsWith('tbl_')),
    tbl_recv칸: [...names],
    선택칸: found,
  });
  return found;
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
  return withReadOnlyCopy(memoDir, (db, cols) => {
    // 여유분 +1자까지 읽는다 — trimPreviewBody 가 "뒤가 더 있는가"를 알아야 한다
    const unreadCol = cols.hasIsUnRead ? 'IsUnRead' : 'NULL AS IsUnRead';
    const columns =
      `MessageKey, Sender, ReceiveDate, Title, ` +
      `substr(MessageText, 1, ${BODY_PREVIEW_CHARS + BODY_PREVIEW_MARGIN + 1}) AS Body, ${unreadCol}`;
    // DeletedDate 가 없는 배포본이면 "삭제 제외" 조건을 아예 빼고 전부 읽는다.
    // 지운 쪽지가 몇 개 섞이는 편이, 목록 전체가 오류로 안 뜨는 것보다 낫다.
    const notDeleted = cols.hasDeletedDate ? 'DeletedDate IS NULL' : '1 = 1';

    const rows: RecvRow[] = [];
    if (cols.hasIsUnRead) {
      rows.push(
        ...(db
          .prepare(
            `SELECT ${columns} FROM tbl_recv ` +
              `WHERE ${notDeleted} AND IsUnRead = 1 ` +
              `ORDER BY ReceiveDate DESC LIMIT ?`,
          )
          .all(UNREAD_CAP) as RecvRow[]),
      );
    }

    const readWhere = cols.hasIsUnRead
      ? `${notDeleted} AND (IsUnRead IS NULL OR IsUnRead != 1)`
      : notDeleted;
    rows.push(
      ...(db
        .prepare(
          `SELECT ${columns} FROM tbl_recv ` +
            `WHERE ${readWhere} ` +
            `ORDER BY ReceiveDate DESC LIMIT ?`,
        )
        .all(Math.max(0, Math.trunc(limit))) as RecvRow[]),
    );

    const out: CoolMessage[] = [];
    let skipped = 0;
    for (const row of rows) {
      const msg = toMessage(row);
      if (msg) out.push({ ...msg, body: trimPreviewBody(msg.body) });
      else skipped += 1;
    }
    // ★한 건도 못 읽었는데 행은 있었다 = 받은 시각 형식이 우리가 아는 것과 다르다.
    //   화면에는 "받은 쪽지가 없습니다"로만 보여 영원히 원인을 못 찾는 실패다.
    //   날짜의 '모양'만 남긴다(내용 아님) — dateShape 주석 참고.
    if (out.length === 0 && skipped > 0) {
      coolWarn('받은 시각을 한 건도 못 읽었습니다 — 날짜 형식이 다를 수 있습니다', {
        건너뜀: skipped,
        모양표본: [...new Set(rows.slice(0, 20).map((r) => dateShape(r.ReceiveDate ?? '')))],
      });
    }
    out.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    return out;
  });
}

/** 쪽지 한 건의 전문 (목록에서 고른 뒤 상세를 채울 때) */
export function readCoolMessage(memoDir: string, key: number): CoolMessage | null {
  return withReadOnlyCopy(memoDir, (db, cols) => {
    const unreadCol = cols.hasIsUnRead ? 'IsUnRead' : 'NULL AS IsUnRead';
    const row = db
      .prepare(
        `SELECT MessageKey, Sender, ReceiveDate, Title, MessageText AS Body, ${unreadCol} ` +
          `FROM tbl_recv WHERE MessageKey = ?`,
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
