/**
 * 쿨메신저 쪽지함 리더 테스트.
 *
 * ## 왜 이렇게 테스트하나
 * 개발 PC에 쿨메신저가 없다. 그래서 **실제와 같은 스키마의 가짜 쪽지함(.udb)을 만들어**
 * 읽는다. `tbl_recv` 칸 이름·`ReceiveDate` 형식·WAL 모드까지 실물과 똑같이 맞췄으므로,
 * 여기서 통과하면 실기기에서 남는 위험은 "쿨메신저 실제 스키마가 우리가 아는 것과
 * 다른가" 하나로 좁혀진다.
 *
 * ## 가장 중요한 테스트
 * **"원본이 한 바이트도 안 바뀐다"** — 남의 앱 데이터를 건드리는 기능이라
 * 이게 깨지면 선생님이 업무 연락을 잃는다.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  statSync,
  utimesSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readCoolMessages,
  readCoolMessage,
  readCoolMemberNames,
  findActiveUdb,
  parseReceiveDate,
  isCoolMessengerAvailable,
  CoolSchemaMismatchError,
  CoolMemoNotFoundError,
} from './coolMessengerReader';

/** 실물과 같은 스키마의 쪽지함을 만든다 */
function createFakeMemoDir(): { dir: string; db: DatabaseSync } {
  const dir = mkdtempSync(join(tmpdir(), 'cool-fixture-'));
  const db = new DatabaseSync(join(dir, 'MyMemo.udb'));
  db.exec('PRAGMA journal_mode=WAL'); // 쿨메신저와 같은 모드
  db.exec(`CREATE TABLE tbl_recv (
    MessageKey INTEGER PRIMARY KEY,
    Sender TEXT, ReceiveDate TEXT, Title TEXT, MessageText TEXT,
    IsUnRead INTEGER, DeletedDate TEXT
  )`);
  db.exec(`CREATE TABLE tbl_member (MemberName TEXT)`);

  const rows: Array<[number, string, string, string, string, number | null, string | null]> = [
    [1, '교무부', '2026/08/20 09:00:00 (목)', '학폭위 심의', '7월 21일(화) 14:00 회의실', 1, null],
    [2, '연구부', '2026/08/19 10:30:00 (수)', '연수 안내', '8월 25일까지 제출 바랍니다', 1, null],
    [3, '행정실', '2026/08/18 11:00:00 (화)', '물품 신청', '내일 오전 9시 마감', 0, null],
    [4, '교장', '2026/08/17 08:00:00 (월)', '읽은 쪽지', '내용 있음', 0, null],
    [5, '삭제됨', '2026/08/21 12:00:00 (금)', '지운 쪽지', '보이면 안 됨', 1, '2026/08/21'],
    [6, '깨진행', '날짜형식아님', '깨진 쪽지', '건너뛰어야 함', 0, null],
  ];
  const stmt = db.prepare(
    'INSERT INTO tbl_recv (MessageKey, Sender, ReceiveDate, Title, MessageText, IsUnRead, DeletedDate) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  for (const r of rows) stmt.run(...r);

  const member = db.prepare('INSERT INTO tbl_member (MemberName) VALUES (?)');
  for (const n of ['김교사', '이부장', '  ', '박행정']) member.run(n);

  return { dir, db };
}

/** 폴더 안 모든 파일의 이름+크기+해시 — 원본 훼손 감지용 */
function snapshotDir(dir: string): string {
  return readdirSync(dir)
    .sort()
    .map((name) => {
      const full = join(dir, name);
      const buf = readFileSync(full);
      return `${name}:${statSync(full).size}:${createHash('sha256').update(buf).digest('hex')}`;
    })
    .join('|');
}

describe('쪽지함 읽기', () => {
  let dir: string;
  let db: DatabaseSync;

  beforeAll(() => {
    const fixture = createFakeMemoDir();
    dir = fixture.dir;
    db = fixture.db;
    // ★ 쿨메신저가 켜져 있는 상황을 재현하려고 일부러 닫지 않는다
  });

  afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('★ 쿨메신저가 켜진 채(WAL, 열린 연결)에도 읽힌다', () => {
    const messages = readCoolMessages(dir);
    expect(messages.length).toBeGreaterThan(0);
  });

  it('★ 원본 쪽지함이 한 바이트도 바뀌지 않는다', () => {
    const before = snapshotDir(dir);
    readCoolMessages(dir);
    readCoolMessage(dir, 1);
    readCoolMemberNames(dir);
    expect(snapshotDir(dir)).toBe(before);
  });

  it('삭제된 쪽지는 빼고 준다', () => {
    const messages = readCoolMessages(dir);
    expect(messages.map((m) => m.key)).not.toContain(5);
  });

  it('받은 시각을 못 읽는 쪽지는 건너뛴다 (일정으로 쓸 수 없다)', () => {
    const messages = readCoolMessages(dir);
    expect(messages.map((m) => m.key)).not.toContain(6);
  });

  it('안읽은 쪽지는 읽은 쪽지 상한과 무관하게 전부 들어온다', () => {
    const messages = readCoolMessages(dir, 0); // 읽은 쪽지는 0개만
    const keys = messages.map((m) => m.key);
    expect(keys).toContain(1);
    expect(keys).toContain(2);
    expect(keys).not.toContain(4); // 읽은 쪽지는 제외됨
  });

  it('최신순으로 정렬한다', () => {
    const messages = readCoolMessages(dir);
    const times = messages.map((m) => m.receivedAt);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it('안읽음 표시를 그대로 읽어온다 (바꾸지는 않는다)', () => {
    const messages = readCoolMessages(dir);
    expect(messages.find((m) => m.key === 1)?.isUnread).toBe(true);
    expect(messages.find((m) => m.key === 4)?.isUnread).toBe(false);
  });

  it('쪽지 한 건의 전문을 가져온다', () => {
    const msg = readCoolMessage(dir, 1);
    expect(msg?.title).toBe('학폭위 심의');
    expect(msg?.body).toContain('회의실');
    expect(msg?.sender).toBe('교무부');
  });

  it('없는 쪽지를 물으면 null', () => {
    expect(readCoolMessage(dir, 99999)).toBeNull();
  });

  it('교직원 명단을 개인정보 사전용으로 읽어온다 (빈 이름은 제외)', () => {
    const names = readCoolMemberNames(dir);
    expect(names).toContain('김교사');
    expect(names).toContain('박행정');
    expect(names).not.toContain('  ');
  });

  it('쓸 수 있는 쪽지함으로 인식한다', () => {
    expect(isCoolMessengerAvailable(dir)).toBe(true);
  });
});

describe('안전 실패 — 조용히 넘어가지 않는다', () => {
  it('쪽지함 폴더에 .udb가 없으면 알려준다', () => {
    const empty = mkdtempSync(join(tmpdir(), 'cool-empty-'));
    try {
      expect(() => findActiveUdb(empty)).toThrow(CoolMemoNotFoundError);
      expect(isCoolMessengerAvailable(empty)).toBe(false);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('없는 폴더도 안전하게 false', () => {
    expect(isCoolMessengerAvailable(join(tmpdir(), 'no-such-dir-12345'))).toBe(false);
  });

  it('★ 쿨메신저 업데이트로 표 구조가 바뀌면 명확히 알려준다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cool-badschema-'));
    try {
      const db = new DatabaseSync(join(dir, 'x.udb'));
      db.exec('CREATE TABLE something_else (a TEXT)');
      db.close();
      expect(() => readCoolMessages(dir)).toThrow(CoolSchemaMismatchError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('★ 칸 이름이 바뀌어도 잡아낸다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cool-badcol-'));
    try {
      const db = new DatabaseSync(join(dir, 'x.udb'));
      db.exec('CREATE TABLE tbl_recv (MessageKey INTEGER, Sender TEXT)'); // 칸 부족
      db.close();
      expect(() => readCoolMessages(dir)).toThrow(/필요한 칸이 없습니다/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('교직원 명단 표가 없어도 기능은 산다 (빈 목록)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cool-nomember-'));
    try {
      const db = new DatabaseSync(join(dir, 'x.udb'));
      db.exec(`CREATE TABLE tbl_recv (MessageKey INTEGER, Sender TEXT, ReceiveDate TEXT,
        Title TEXT, MessageText TEXT, IsUnRead INTEGER, DeletedDate TEXT)`);
      db.close();
      expect(readCoolMemberNames(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('.udb가 여러 개면 가장 최근 것을 고른다 (구버전 파일 공존 대비)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cool-multi-'));
    try {
      writeFileSync(join(dir, 'old.udb'), 'x');
      // 파일 시각을 하루 전으로 되돌린다
      const oldTime = new Date(Date.now() - 86400000);
      utimesSync(join(dir, 'old.udb'), oldTime, oldTime);
      writeFileSync(join(dir, 'new.udb'), 'y');
      expect(findActiveUdb(dir)).toBe(join(dir, 'new.udb'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('받은 시각 파싱', () => {
  it('쿨메신저 형식 "2026/07/16 17:04:52 (목)"', () => {
    const d = parseReceiveDate('2026/07/16 17:04:52 (목)');
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(6);
    expect(d?.getDate()).toBe(16);
    expect(d?.getHours()).toBe(17);
    expect(d?.getMinutes()).toBe(4);
  });

  it('요일 표기가 없어도 읽는다', () => {
    expect(parseReceiveDate('2026/07/16 17:04:52')?.getDate()).toBe(16);
  });

  it('형식이 다르면 null', () => {
    expect(parseReceiveDate('어제')).toBeNull();
    expect(parseReceiveDate('')).toBeNull();
  });
});
