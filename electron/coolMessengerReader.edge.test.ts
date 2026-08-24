/**
 * 쪽지함 리더 공격 테스트 (UltraQA).
 *
 * 남의 앱 데이터를 읽는 코드다. **원본 훼손**과 **임시파일 누수**가 최악의 두 가지다.
 * 실기기가 없으니 실물과 같은 스키마의 가짜 쪽지함으로 험한 상황을 만든다.
 */
import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * ★ 임시 폴더를 이 파일 전용으로 갈아끼운다.
 *
 * 누수 검사는 "임시 폴더에 우리 폴더가 남았나"를 세는데, 시스템 임시 폴더를 그대로 보면
 * **다른 테스트 파일이 병렬로 만든 폴더까지 세어** 엉뚱하게 실패한다(실제로 겪음).
 * `os.tmpdir()` 은 매번 환경변수를 읽으므로 여기서 바꾸면 이 파일의 호출만 격리된다.
 */
const TMP_KEYS = ['TMPDIR', 'TEMP', 'TMP'] as const;
const savedTmp: Record<string, string | undefined> = {};
let sandbox = '';

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cool-sandbox-'));
  for (const k of TMP_KEYS) {
    savedTmp[k] = process.env[k];
    process.env[k] = sandbox;
  }
});

afterAll(() => {
  for (const k of TMP_KEYS) {
    if (savedTmp[k] === undefined) delete process.env[k];
    else process.env[k] = savedTmp[k];
  }
  rmSync(sandbox, { recursive: true, force: true });
});
import {
  readCoolMessages,
  readCoolMessage,
  readCoolMemberNames,
  closeCoolReaderSession,
  toReadableCoolError,
  trimPreviewBody,
  CoolSchemaMismatchError,
  CoolMemoNotFoundError,
} from './coolMessengerReader';

const created: string[] = [];

afterEach(() => {
  // 세션 복사본을 먼저 닫는다 — 열린 db 핸들이 있으면 윈도우에서 폴더 삭제가 실패한다
  closeCoolReaderSession();
  while (created.length) rmSync(created.pop()!, { recursive: true, force: true });
});

const SCHEMA = `CREATE TABLE tbl_recv (
  MessageKey INTEGER PRIMARY KEY, Sender TEXT, ReceiveDate TEXT,
  Title TEXT, MessageText TEXT, IsUnRead INTEGER, DeletedDate TEXT)`;

function makeDir(rows: Array<Array<unknown>>, withSchema = true): string {
  const dir = mkdtempSync(join(tmpdir(), 'cool-edge-'));
  created.push(dir);
  const db = new DatabaseSync(join(dir, 'm.udb'));
  db.exec('PRAGMA journal_mode=WAL');
  if (withSchema) {
    db.exec(SCHEMA);
    const st = db.prepare(
      'INSERT INTO tbl_recv (MessageKey, Sender, ReceiveDate, Title, MessageText, IsUnRead, DeletedDate) VALUES (?,?,?,?,?,?,?)',
    );
    for (const r of rows) st.run(...(r as never[]));
  } else {
    db.exec('CREATE TABLE other (a TEXT)');
  }
  db.close();
  return dir;
}

/** 우리가 만드는 임시 작업 폴더 개수 (누수 감지용) */
function workTempCount(): number {
  return readdirSync(tmpdir()).filter((n) => n.startsWith('ssampin-cool-')).length;
}

describe('널·이상한 값', () => {
  it('보낸사람·제목·본문이 NULL이어도 빈 문자열로 준다', () => {
    const dir = makeDir([[1, null, '2026/08/20 09:00:00 (목)', null, null, null, null]]);
    const [msg] = readCoolMessages(dir);
    expect(msg!.sender).toBe('');
    expect(msg!.title).toBe('');
    expect(msg!.body).toBe('');
    expect(msg!.isUnread).toBe(false);
  });

  it('아주 긴 본문도 목록에서는 잘라서 준다 (전문 조회는 따로)', () => {
    const long = '가'.repeat(50000);
    const dir = makeDir([[1, 'A', '2026/08/20 09:00:00 (목)', 'T', long, 0, null]]);
    const [listed] = readCoolMessages(dir);
    expect(listed!.body.length).toBeLessThanOrEqual(600);
    const full = readCoolMessage(dir, 1);
    expect(full!.body.length).toBe(50000);
  });

  it('limit이 음수여도 안전하다', () => {
    const dir = makeDir([[1, 'A', '2026/08/20 09:00:00 (목)', 'T', 'B', 0, null]]);
    expect(() => readCoolMessages(dir, -5)).not.toThrow();
  });

  it('정수가 아닌 키로 물어도 죽지 않는다', () => {
    const dir = makeDir([[1, 'A', '2026/08/20 09:00:00 (목)', 'T', 'B', 0, null]]);
    expect(readCoolMessage(dir, 1.7)).not.toBeUndefined();
    expect(() => readCoolMessage(dir, -1)).not.toThrow();
  });

  it('같은 쪽지가 목록에 두 번 들어가지 않는다', () => {
    const dir = makeDir([
      [1, 'A', '2026/08/20 09:00:00 (목)', 'T1', 'B', 1, null],
      [2, 'B', '2026/08/19 09:00:00 (수)', 'T2', 'B', 0, null],
    ]);
    const keys = readCoolMessages(dir).map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('★ 임시 작업 폴더를 남기지 않는다', () => {
  it('세션을 닫으면 남는 폴더가 없다 (여러 번 읽어도 복사본은 하나)', () => {
    const before = workTempCount();
    const dir = makeDir([[1, 'A', '2026/08/20 09:00:00 (목)', 'T', 'B', 0, null]]);
    // ★연속 읽기는 세션 복사본 하나를 재사용한다 (2026-08-24 UltraQA P2) —
    //   전에는 호출마다 쪽지함 전체를 새로 복사했다(큰 쪽지함에서 클릭마다 몇 초).
    readCoolMessages(dir);
    expect(workTempCount()).toBe(before + 1);
    readCoolMessage(dir, 1);
    readCoolMemberNames(dir);
    expect(workTempCount()).toBe(before + 1); // 복사가 늘지 않았다 = 재사용했다
    closeCoolReaderSession();
    expect(workTempCount()).toBe(before);
  });

  it('★ 표 구조가 틀려 오류가 나도 폴더를 정리한다', () => {
    const before = workTempCount();
    const dir = makeDir([], false);
    expect(() => readCoolMessages(dir)).toThrow(CoolSchemaMismatchError);
    expect(workTempCount()).toBe(before);
  });

  it('오류가 여러 번 나도 폴더가 쌓이지 않는다', () => {
    const before = workTempCount();
    const dir = makeDir([], false);
    for (let i = 0; i < 5; i += 1) {
      try {
        readCoolMessages(dir);
      } catch {
        /* 의도된 실패 */
      }
    }
    expect(workTempCount()).toBe(before);
  });
});

describe('★ 원본 훼손 금지 (반복 확인)', () => {
  it('오류가 난 뒤에도 원본 파일이 그대로 있다', () => {
    const dir = makeDir([], false);
    const before = readdirSync(dir).sort().join('|');
    try {
      readCoolMessages(dir);
    } catch {
      /* 의도된 실패 */
    }
    expect(readdirSync(dir).sort().join('|')).toBe(before);
  });
});

describe('★ 세션 복사본은 오래된 데이터를 보여주지 않는다', () => {
  it('세션이 살아 있어도 원본에 새 쪽지가 오면 다시 복사해 읽는다', () => {
    const dir = makeDir([[1, 'A', '2026/08/20 09:00:00 (목)', 'T1', 'B', 0, null]]);
    expect(readCoolMessages(dir)).toHaveLength(1);

    // 쿨메신저가 새 쪽지를 쓴 상황 — 원본 파일(수정시각·크기)이 바뀐다
    const db = new DatabaseSync(join(dir, 'm.udb'));
    db.prepare(
      'INSERT INTO tbl_recv (MessageKey, Sender, ReceiveDate, Title, MessageText, IsUnRead, DeletedDate) VALUES (?,?,?,?,?,?,?)',
    ).run(2, 'B', '2026/08/21 10:00:00 (금)', 'T2', 'B2', 1, null);
    db.close();

    expect(readCoolMessages(dir)).toHaveLength(2);
  });
});

describe('미리보기는 낱말 경계에서 자른다 (600자 절단 유령 날짜 방지)', () => {
  it('★ 경계에 걸린 "8월 31일"이 "8월 3"으로 잘리지 않는다', () => {
    // 595자 채우기 + " 8월 31일 …" — 600자째가 "31일" 한가운데에 떨어지고,
    // 뒤가 충분히 길어 미리보기가 실제로 잘린다
    const body = `${'가'.repeat(595)} 8월 31일 회의실에서 만나요. ${'뒷내용'.repeat(200)}`;
    const dir = makeDir([[1, 'A', '2026/08/20 09:00:00 (목)', 'T', body, 0, null]]);
    const [listed] = readCoolMessages(dir);
    expect(listed!.body.length).toBeLessThan(body.length); // 잘리긴 잘렸다
    expect(listed!.body).toContain('8월 31일'); // 그러나 날짜 표현은 온전하다
    expect(listed!.body).not.toMatch(/8월 3$/);
  });

  it('여유분 안에 공백이 없으면 불완전한 낱말을 통째로 버린다', () => {
    // 600자 직전에 공백, 그 뒤로 공백 없는 긴 덩어리 — 앞의 온전한 부분까지만 남는다
    const fetched = `${'가'.repeat(590)} ${'나'.repeat(100)}`;
    const trimmed = trimPreviewBody(fetched);
    expect(trimmed).toBe('가'.repeat(590));
  });

  it('본문 전체가 여유분 안에 들어오면 자르지 않는다', () => {
    const whole = `${'가'.repeat(610)} 끝`;
    expect(trimPreviewBody(whole)).toBe(whole);
  });
});

describe('파일 오류는 한국어로, 경로는 폴더명까지만 (P2 문구)', () => {
  const busy = Object.assign(
    new Error("EBUSY: resource busy or locked, copyfile 'C:\\Users\\teacher\\MyMemo.udb'"),
    { code: 'EBUSY' },
  );

  it('★ EBUSY/EPERM → "쿨메신저가 쪽지함을 쓰고 있어…" 안내로 바뀐다', () => {
    for (const code of ['EBUSY', 'EPERM'] as const) {
      const err = toReadableCoolError(
        Object.assign(new Error(`${code}: locked`), { code }),
        'C:\\Users\\teacher\\AppData\\Local\\CoolMessenger\\Memo',
      );
      expect(err.message).toContain('쿨메신저가 쪽지함을 쓰고 있어');
      expect(err.message).not.toContain('teacher'); // 전체 경로(계정명) 미노출
      expect(err.message).not.toContain(code);
    }
  });

  it('★ ENOENT → 폴더명까지만 담은 한국어 안내로 바뀐다', () => {
    const err = toReadableCoolError(
      Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' }),
      'C:\\Users\\teacher\\AppData\\Local\\CoolMessenger\\Memo',
    );
    expect(err).toBeInstanceOf(CoolMemoNotFoundError);
    expect(err.message).toContain('Memo');
    expect(err.message).not.toContain('teacher');
  });

  it('모르는 오류는 그대로 올린다 (조용히 삼키지 않는다)', () => {
    expect(toReadableCoolError(busy, 'C:\\dir').message).toContain('쿨메신저가');
    const unknown = new Error('그 밖의 오류');
    expect(toReadableCoolError(unknown, 'C:\\dir')).toBe(unknown);
  });

  it('쪽지함 폴더가 없을 때의 안내에도 전체 경로가 없다', () => {
    const missing = join(sandbox, 'no-such', 'Memo');
    try {
      readCoolMessages(missing);
      expect.unreachable('없는 폴더인데 성공하면 안 된다');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toContain('Memo');
      expect(message).not.toContain(sandbox);
    }
  });
});
