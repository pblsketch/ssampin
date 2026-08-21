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
  CoolSchemaMismatchError,
} from './coolMessengerReader';

const created: string[] = [];

afterEach(() => {
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
  it('정상 조회 후 남는 폴더가 없다', () => {
    const before = workTempCount();
    const dir = makeDir([[1, 'A', '2026/08/20 09:00:00 (목)', 'T', 'B', 0, null]]);
    readCoolMessages(dir);
    readCoolMessage(dir, 1);
    readCoolMemberNames(dir);
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
