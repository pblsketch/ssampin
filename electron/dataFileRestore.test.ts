/**
 * ADR-148 — 원본·백업이 모두 깨진 사용자 자료를 시작 스냅샷으로 되돌린다.
 *
 * 실제 임시 폴더에 원본·백업·`backups/startup/` 스냅샷을 만들어 `readDataFileWithRecovery` 를 그대로
 * 통과시킨다(가짜 파일 시스템 없음). 잠금·쓰기 실패만 `fs` 함수를 잠깐 막아 흉내 낸다.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readDataFileWithRecovery } from './dataFileRead';
import {
  createRestoreRegistry,
  readRestoreLog,
  restoreLogPath,
  RESTORE_LOG_UNAVAILABLE_MESSAGE,
  type DataRestoreEntry,
} from './dataRestoreLog';

/** 기록 항목들(깨졌으면 테스트 실패). */
const logEntries = (d: string): DataRestoreEntry[] => {
  const read = readRestoreLog(d);
  if (!read.ok) throw new Error(`restore-log ${read.reason}`);
  return read.entries;
};

/** 2026-11-06 실제 사고와 같은 모양: 길이만 맞고 내용은 전부 0x00 */
const NUL = '\0'.repeat(210);
const NOW = new Date('2026-11-11T04:05:06.007Z');
const STAMP = '2026-11-11T04-05-06-007Z';
const OLDER = '{"todos":[{"id":"a","text":"11월 8일까지 적은 할 일"}]}';
const NEWER = '{"todos":[{"id":"a"},{"id":"b","text":"11월 9일에 더한 할 일"}]}';

let dir = '';
let snapDir = '';

const put = (name: string, content: string | Buffer): void => {
  fs.writeFileSync(path.join(dir, name), content);
};
const putSnapshot = (name: string, content: string, mtime?: Date): void => {
  const p = path.join(snapDir, name);
  fs.writeFileSync(p, content, 'utf-8');
  if (mtime) fs.utimesSync(p, mtime, mtime);
};
const get = (name: string): string => fs.readFileSync(path.join(dir, name), 'utf-8');
const list = (): string[] =>
  fs
    .readdirSync(dir)
    .filter((n) => n !== 'backups')
    .sort();

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-restore-'));
  snapDir = path.join(dir, 'backups', 'startup');
  fs.mkdirSync(snapDir, { recursive: true });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('readDataFileWithRecovery — 시작 스냅샷으로 되돌리기', () => {
  test('원본·백업이 깨지면 가장 최근의 온전한 스냅샷으로 되돌린다', () => {
    put('todos.json', NUL);
    put('todos.backup.json', NUL);
    putSnapshot('todos.2026-11-08.json', OLDER);
    putSnapshot('todos.2026-11-09.json', NEWER, new Date('2026-11-09T04:41:00.000Z'));

    const result = readDataFileWithRecovery(dir, 'todos', () => NOW);

    expect(result.raw).toBe(NEWER);
    expect(result.quarantined).toBe(false);
    // 원본 자리에 스냅샷 내용이 써 넣어졌다 — 다음 읽기·저장은 평소대로다
    expect(get('todos.json')).toBe(NEWER);
    expect(result.restored).toMatchObject({
      file: 'todos',
      snapshotDate: '2026-11-09',
      snapshotModifiedAt: '2026-11-09T04:41:00.000Z',
      quarantinedAs: `todos.json.corrupt-${STAMP}`,
      quarantinedBackupAs: `todos.backup.json.corrupt-${STAMP}`,
      restoredAt: NOW.toISOString(),
      written: true,
      notified: false,
      syncResolved: false,
    });
  });

  test('백업 없이 원본만 깨져도 스냅샷으로 되돌린다', () => {
    put('events.json', '{"events":[{"id":"e1","title":"잘린');
    putSnapshot('events.2026-11-10.json', '{"events":[{"id":"e1","title":"학부모 상담"}]}');

    const result = readDataFileWithRecovery(dir, 'events', () => NOW);

    expect(result.raw).toBe('{"events":[{"id":"e1","title":"학부모 상담"}]}');
    expect(result.restored?.quarantinedBackupAs).toBeUndefined();
    expect(list()).toEqual(['events.json', `events.json.corrupt-${STAMP}`]);
  });

  test('깨진 스냅샷은 건너뛰고 그 이전 날짜를 쓴다', () => {
    put('todos.json', NUL);
    put('todos.backup.json', NUL);
    putSnapshot('todos.2026-11-08.json', OLDER);
    putSnapshot('todos.2026-11-09.json', NUL);
    // 임시 파일·다른 자료·이름이 비슷한 자료는 원천이 아니다
    putSnapshot('todos.2026-11-10.tmp.json', NEWER);
    putSnapshot('todos-archive.2026-11-10.json', NEWER);
    putSnapshot('memos.2026-11-10.json', '{"memos":[]}');

    const result = readDataFileWithRecovery(dir, 'todos', () => NOW);

    expect(result.raw).toBe(OLDER);
    expect(result.restored?.snapshotDate).toBe('2026-11-08');
    expect(get('todos.json')).toBe(OLDER);
  });

  test.each([
    [
      '스냅샷 폴더 자체가 없음',
      (): void => fs.rmSync(path.join(dir, 'backups'), { recursive: true }),
    ],
    ['다른 자료의 스냅샷만 있음', (): void => putSnapshot('memos.2026-11-10.json', '{"memos":[]}')],
    ['스냅샷이 모두 깨짐', (): void => putSnapshot('todos.2026-11-10.json', NUL)],
  ])('스냅샷이 없으면 지금처럼 오류를 던진다: %s', (_label, arrange) => {
    put('todos.json', NUL);
    put('todos.backup.json', NUL);
    arrange();

    expect(() => readDataFileWithRecovery(dir, 'todos', () => NOW)).toThrow(/파일 손상/);
    // 아무것도 옮기거나 지우거나 쓰지 않았다
    expect(list()).toEqual(['todos.backup.json', 'todos.json']);
    expect(get('todos.json')).toBe(NUL);
    expect(fs.existsSync(restoreLogPath(dir))).toBe(false);
  });

  /** 지정한 경로 읽기를 계속 막는다(백신·색인이 파일을 잡은 상황). */
  const blockReads = (target: string, code = 'EBUSY'): void => {
    const realRead = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation(((
      p: fs.PathOrFileDescriptor,
      ...rest: unknown[]
    ) => {
      if (String(p) === target) throw Object.assign(new Error(code), { code });
      return (realRead as (...a: unknown[]) => unknown)(p, ...rest);
    }) as typeof fs.readFileSync);
  };

  test.each([
    ['원본', 'todos.json', /읽지 못함 \(EBUSY\)/],
    ['백업', 'todos.backup.json', /파일 손상/],
    ['가장 최근 스냅샷', path.join('backups', 'startup', 'todos.2026-11-09.json'), /파일 손상/],
  ])('원본이나 백업을 읽지 못하면(잠김) 복원하지 않는다: %s', (_label, blocked, error) => {
    put('todos.json', NUL);
    put('todos.backup.json', NUL);
    putSnapshot('todos.2026-11-08.json', OLDER);
    putSnapshot('todos.2026-11-09.json', NEWER);
    blockReads(path.join(dir, blocked));
    const renameSpy = vi.spyOn(fs, 'renameSync');

    expect(() => readDataFileWithRecovery(dir, 'todos', () => NOW)).toThrow(error);

    expect(renameSpy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    // 그보다 옛 스냅샷으로 건너뛰지도, 원본을 덮지도, 격리 사본을 만들지도 않았다
    expect(list()).toEqual(['todos.backup.json', 'todos.json']);
    expect(get('todos.json')).toBe(NUL);
    expect(fs.existsSync(restoreLogPath(dir))).toBe(false);
  });

  test('깨진 원본은 복사로 격리하고 지우지 않는다', () => {
    // 잘린 JSON 은 일부라도 건질 수 있다 — 바이트 그대로 남아야 한다(UTF-8 이 아닌 바이트 포함)
    const brokenOriginal = Buffer.concat([
      Buffer.from('{"todos":[{"id":"a","text":"반쯤 '),
      Buffer.from([0xff, 0xfe, 0x00]),
    ]);
    put('todos.json', brokenOriginal);
    put('todos.backup.json', NUL);
    putSnapshot('todos.2026-11-09.json', NEWER);
    const renameSpy = vi.spyOn(fs, 'renameSync');

    readDataFileWithRecovery(dir, 'todos', () => NOW);

    // 원본을 옮기지 않았다(옮긴 직후 꺼지면 원본이 "없음"이 되어 빈 자료로 시작한다).
    // 이름 바꾸기는 복원 기록(먼저) → 임시 파일 → 원본 교체 → 복원 기록 갱신뿐이다.
    expect(renameSpy.mock.calls.map(([from]) => path.basename(String(from)))).toEqual([
      'restore-log.tmp',
      'todos.tmp.json',
      'restore-log.tmp',
    ]);
    expect(
      fs.readFileSync(path.join(dir, `todos.json.corrupt-${STAMP}`)).equals(brokenOriginal),
    ).toBe(true);
    expect(get(`todos.backup.json.corrupt-${STAMP}`)).toBe(NUL);
    // 깨진 백업은 제자리에 그대로 — 다음 저장이 온전한 원본으로 새로 만든다
    expect(get('todos.backup.json')).toBe(NUL);
    expect(list()).toEqual([
      'todos.backup.json',
      `todos.backup.json.corrupt-${STAMP}`,
      'todos.json',
      `todos.json.corrupt-${STAMP}`,
    ]);
  });

  test('격리 사본을 만들지 못하면 원본을 덮지 않고 오류를 던진다', () => {
    put('todos.json', NUL);
    put('todos.backup.json', NUL);
    putSnapshot('todos.2026-11-09.json', NEWER);
    const realOpen = fs.openSync;
    vi.spyOn(fs, 'openSync').mockImplementation(((p: fs.PathLike, ...rest: unknown[]) => {
      if (String(p).includes('.corrupt-')) {
        throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
      }
      return (realOpen as (...a: unknown[]) => number)(p, ...rest);
    }) as typeof fs.openSync);

    expect(() => readDataFileWithRecovery(dir, 'todos', () => NOW)).toThrow(/파일 손상/);
    vi.restoreAllMocks();
    expect(list()).toEqual(['todos.backup.json', 'todos.json']);
    expect(get('todos.json')).toBe(NUL);
  });

  test('복원 뒤 다시 읽으면 다시 복원하지 않는다', () => {
    put('todos.json', NUL);
    put('todos.backup.json', NUL);
    putSnapshot('todos.2026-11-09.json', NEWER);

    readDataFileWithRecovery(dir, 'todos', () => NOW);
    const later = new Date('2026-11-11T05:00:00.000Z');
    const again = readDataFileWithRecovery(dir, 'todos', () => later);

    expect(again).toEqual({ raw: NEWER, quarantined: false });
    expect(logEntries(dir)).toHaveLength(1);
    expect(list().filter((n) => n.includes('.corrupt-'))).toHaveLength(2);
  });

  test('복원 기록이 디스크에 남는다', () => {
    put('todos.json', NUL);
    put('todos.backup.json', NUL);
    putSnapshot('todos.2026-11-09.json', NEWER, new Date('2026-11-09T04:41:00.000Z'));
    put('events.json', NUL);
    putSnapshot('events.2026-11-10.json', '{"events":[]}', new Date('2026-11-10T00:02:00.000Z'));

    readDataFileWithRecovery(dir, 'todos', () => NOW);
    readDataFileWithRecovery(dir, 'events', () => NOW);

    const logFile = restoreLogPath(dir);
    // 데이터 폴더의 `*.json` 을 모으는 백업·동기화가 주워 가지 않는다
    expect(logFile.endsWith('.json')).toBe(false);
    const parsed = JSON.parse(fs.readFileSync(logFile, 'utf-8')) as {
      version: number;
      entries: Record<string, unknown>[];
    };
    expect(parsed.version).toBe(1);
    expect(
      parsed.entries.map((e) => [e['file'], e['snapshotDate'], e['snapshotModifiedAt']]),
    ).toEqual([
      ['todos', '2026-11-09', '2026-11-09T04:41:00.000Z'],
      ['events', '2026-11-10', '2026-11-10T00:02:00.000Z'],
    ]);
    expect(parsed.entries[0]).toMatchObject({
      quarantinedAs: `todos.json.corrupt-${STAMP}`,
      written: true,
      restoredAt: NOW.toISOString(),
      notified: false,
      syncResolved: false,
    });
    // 파일 내용은 기록에 들어가지 않는다
    expect(fs.readFileSync(logFile, 'utf-8')).not.toContain('11월 9일에 더한 할 일');
  });

  test('원본 자리에 써 넣지 못하면 스냅샷 내용만 돌려주고, 다시 읽어도 기록을 겹쳐 남기지 않는다', () => {
    put('todos.json', NUL);
    put('todos.backup.json', NUL);
    putSnapshot('todos.2026-11-09.json', NEWER);
    const realRename = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation(((from: fs.PathLike, to: fs.PathLike) => {
      if (path.basename(String(to)) === 'todos.json') {
        throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
      }
      return realRename(from, to);
    }) as typeof fs.renameSync);

    const first = readDataFileWithRecovery(dir, 'todos', () => NOW);
    const second = readDataFileWithRecovery(
      dir,
      'todos',
      () => new Date('2026-11-11T05:00:00.000Z'),
    );

    expect(first.raw).toBe(NEWER);
    expect(first.restored?.written).toBe(false);
    expect(second.raw).toBe(NEWER);
    expect(second.restored?.id).toBe(first.restored?.id);
    vi.restoreAllMocks();
    expect(get('todos.json')).toBe(NUL); // 다음 저장 때 교체된다
    expect(logEntries(dir)).toHaveLength(1);
    expect(list().filter((n) => n.includes('.corrupt-'))).toHaveLength(2);
  });

  test('학년도를 마감한 뒤면 마감 전에 찍힌 스냅샷으로는 학생 자료를 되돌리지 않는다', () => {
    put('settings.json', JSON.stringify({ lastClosedAt: '2026-11-10T00:00:00.000Z' }));
    put('students.json', NUL);
    putSnapshot(
      'students.2026-11-09.json',
      '[{"id":"s1","name":"지난 학년도"}]',
      new Date('2026-11-09T00:00:00.000Z'),
    );

    expect(() => readDataFileWithRecovery(dir, 'students', () => NOW)).toThrow(/파일 손상/);

    putSnapshot(
      'students.2026-11-10.json',
      '[{"id":"s2","name":"새 학년도"}]',
      new Date('2026-11-10T01:00:00.000Z'),
    );
    expect(readDataFileWithRecovery(dir, 'students', () => NOW).raw).toBe(
      '[{"id":"s2","name":"새 학년도"}]',
    );
    // 학년도와 상관없는 자료는 날짜만으로 고른다
    put('memos.json', NUL);
    putSnapshot('memos.2026-11-09.json', '{"memos":[]}', new Date('2026-11-09T00:00:00.000Z'));
    expect(readDataFileWithRecovery(dir, 'memos', () => NOW).raw).toBe('{"memos":[]}');
  });

  test('상태 파일 2종은 기존처럼 격리·초기화한다', () => {
    for (const name of ['tasks-sync-state', 'drive-sync-device-state']) {
      put(`${name}.json`, NUL);
      put(`${name}.backup.json`, NUL);
      // 스냅샷이 (어쩌다) 있어도 되돌리지 않는다 — 비우고 다시 만드는 파일이다
      putSnapshot(`${name}.2026-11-10.json`, '{"isEnabled":true}');

      const result = readDataFileWithRecovery(dir, name, () => NOW);

      expect(result).toEqual({ raw: null, quarantined: true });
      expect(fs.existsSync(path.join(dir, `${name}.json`))).toBe(false);
      expect(get(`${name}.json.corrupt-${STAMP}`)).toBe(NUL);
    }
    expect(fs.existsSync(restoreLogPath(dir))).toBe(false);
  });

  test('복원 기록을 먼저 남긴 뒤 원본을 교체한다(교체 직후 꺼져도 기록이 있다)', () => {
    put('todos.json', NUL);
    put('todos.backup.json', NUL);
    putSnapshot('todos.2026-11-09.json', NEWER);
    const realRename = fs.renameSync;
    const seenAtReplace: DataRestoreEntry[][] = [];
    vi.spyOn(fs, 'renameSync').mockImplementation(((from: fs.PathLike, to: fs.PathLike) => {
      if (path.basename(String(to)) === 'todos.json') seenAtReplace.push(logEntries(dir));
      return realRename(from, to);
    }) as typeof fs.renameSync);

    const result = readDataFileWithRecovery(dir, 'todos', () => NOW);

    expect(seenAtReplace).toHaveLength(1);
    expect(seenAtReplace[0]?.map((e) => [e.file, e.written])).toEqual([['todos', false]]);
    expect(result.restored?.written).toBe(true);
    expect(logEntries(dir).map((e) => e.written)).toEqual([true]);
  });

  test('복원 기록을 먼저 남기지 못하면 원본을 바꾸지 않고 오류를 던진다', () => {
    put('todos.json', NUL);
    put('todos.backup.json', NUL);
    putSnapshot('todos.2026-11-09.json', NEWER);
    const realRename = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation(((from: fs.PathLike, to: fs.PathLike) => {
      if (path.basename(String(to)) === 'restore-log') {
        throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
      }
      return realRename(from, to);
    }) as typeof fs.renameSync);

    expect(() => readDataFileWithRecovery(dir, 'todos', () => NOW)).toThrow(/파일 손상/);
    vi.restoreAllMocks();
    // 자료는 깨진 원본 그대로다(잃는 것이 없다) — 다음 실행에서 다시 시도한다
    expect(get('todos.json')).toBe(NUL);
    expect(fs.existsSync(restoreLogPath(dir))).toBe(false);
  });

  test('복원 기록이 깨져도 깨진 기록을 복사해 두고 다시 만든 뒤 복원한다', () => {
    put('todos.json', NUL);
    put('todos.backup.json', NUL);
    putSnapshot('todos.2026-11-09.json', NEWER);
    // 지난번에 되돌렸던 일정의 격리 사본 — 깨진 기록 속에만 있던 보호를 되살린다
    put('events.json.corrupt-2026-09-01T00-00-00-000Z', NUL);
    const brokenLog = '{"version":1,"entries":[{"id":"events@1","file":"ev';
    fs.writeFileSync(restoreLogPath(dir), brokenLog, 'utf-8');

    const result = readDataFileWithRecovery(dir, 'todos', () => NOW);

    expect(result.raw).toBe(NEWER);
    expect(logEntries(dir).map((e) => [e.file, e.rebuilt === true, e.syncResolved])).toEqual([
      ['events', true, false],
      ['todos', false, false],
    ]);
    const copies = fs
      .readdirSync(path.join(dir, 'backups'))
      .filter((n) => n.startsWith('restore-log.corrupt-'));
    expect(copies).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, 'backups', copies[0] as string), 'utf-8')).toBe(
      brokenLog,
    );
  });

  test('오늘보다 뒤 날짜의 스냅샷은 고르지 않는다', () => {
    put('todos.json', NUL);
    putSnapshot('todos.2026-11-09.json', OLDER);
    putSnapshot('todos.2026-12-25.json', NEWER); // PC 시계가 앞서 있던 흔적
    const localNow = new Date(2026, 10, 11, 9, 0);

    const result = readDataFileWithRecovery(dir, 'todos', () => localNow);

    expect(result.raw).toBe(OLDER);
    expect(result.restored?.snapshotDate).toBe('2026-11-09');
  });

  test('백업이 온전하면 스냅샷이 아니라 백업으로 되돌린다(기존 동작)', () => {
    const backup = '{"todos":[{"id":"backup"}]}';
    put('todos.json', NUL);
    put('todos.backup.json', backup);
    putSnapshot('todos.2026-11-10.json', NEWER);

    const result = readDataFileWithRecovery(dir, 'todos', () => NOW);

    expect(result).toEqual({ raw: backup, quarantined: false });
    expect(fs.existsSync(restoreLogPath(dir))).toBe(false);
  });
});

describe('createRestoreRegistry — 메인 프로세스의 복원 기록 창구', () => {
  const entry = (over: Partial<DataRestoreEntry> = {}): DataRestoreEntry => ({
    id: 'todos@1',
    file: 'todos',
    snapshotDate: '2026-11-09',
    snapshotModifiedAt: '2026-11-09T04:41:00.000Z',
    quarantinedAs: 'todos.json.corrupt-x',
    restoredAt: NOW.toISOString(),
    written: false,
    notified: false,
    syncResolved: false,
    ...over,
  });

  const BROKEN = '\0'.repeat(64);
  const restoreCopies = (): string[] =>
    fs.readdirSync(path.join(dir, 'backups')).filter((n) => n.startsWith('restore-log.corrupt-'));

  test('복원 기록이 깨지면 격리 사본으로 보호 목록을 다시 만들고 동기화를 이어간다', () => {
    // 오래된 사본(30일 넘음)도 보호한다 — 잘못 보호하면 충돌 창 한 번, 잘못 풀면 클라우드를 덮는다
    put('todos.json.corrupt-2026-09-01T00-00-00-000Z', NUL);
    put('todos.json.corrupt-2026-11-10T00-00-00-000Z', NUL);
    put('todos.backup.json.corrupt-2026-11-10T00-00-00-000Z', NUL);
    put('events.json.corrupt-2026-11-10T00-00-00-000Z', NUL);
    fs.writeFileSync(restoreLogPath(dir), BROKEN, 'utf-8');
    const registry = createRestoreRegistry(() => dir);

    const list = registry.list();

    expect(list.map((e) => [e.file, e.written, e.notified, e.syncResolved, e.rebuilt])).toEqual([
      ['events', true, true, false, true],
      ['todos', true, true, false, true],
    ]);
    // 원천 날짜는 알 수 없다(충돌 창에 "시각 알 수 없음") — 알림은 다시 띄우지 않는다(notified)
    expect(list.every((e) => e.snapshotDate === '' && e.snapshotModifiedAt === '')).toBe(true);
    expect(restoreCopies()).toHaveLength(1);
    expect(readRestoreLog(dir).ok).toBe(true);

    // 한 번 맞춰진 자료는 다시 만든 기록에 그대로 남는다 — 다음 실행에서 다시 보호하지 않는다
    registry.mark((e) => e.file === 'events', 'syncResolved');
    const nextRun = createRestoreRegistry(() => dir);
    expect(nextRun.list().map((e) => [e.file, e.syncResolved])).toEqual([
      ['events', true],
      ['todos', false],
    ]);
    expect(restoreCopies()).toHaveLength(1);
  });

  test('상태 파일 2종의 격리 사본은 보호하지 않는다', () => {
    put('tasks-sync-state.json.corrupt-2026-11-06T04-37-48-123Z', NUL);
    put('drive-sync-device-state.json.corrupt-2026-11-06T04-37-48-123Z', NUL);
    put('tasks-sync-state.backup.json.corrupt-2026-11-06T04-37-48-123Z', NUL);
    fs.writeFileSync(restoreLogPath(dir), BROKEN, 'utf-8');

    expect(createRestoreRegistry(() => dir).list()).toEqual([]);
  });

  test('다시 만들기에 실패하면 동기화를 멈추고 다음 실행에서 다시 시도한다', () => {
    put('todos.json.corrupt-2026-11-10T00-00-00-000Z', NUL);
    fs.writeFileSync(restoreLogPath(dir), BROKEN, 'utf-8');
    const realRename = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation(((from: fs.PathLike, to: fs.PathLike) => {
      if (path.basename(String(to)) === 'restore-log') {
        throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
      }
      return realRename(from, to);
    }) as typeof fs.renameSync);
    const registry = createRestoreRegistry(() => dir);

    expect(() => registry.list()).toThrow(RESTORE_LOG_UNAVAILABLE_MESSAGE);
    expect(RESTORE_LOG_UNAVAILABLE_MESSAGE).toContain('다시 만들어 이어서 동기화해요');
    // 깨진 기록은 그대로다(덮어쓰지 않았다)
    expect(fs.readFileSync(restoreLogPath(dir), 'utf-8')).toBe(BROKEN);

    vi.restoreAllMocks();
    // 다음 요청(같은 실행)·다음 실행 모두 다시 시도한다
    expect(registry.list().map((e) => e.file)).toEqual(['todos']);
    expect(
      createRestoreRegistry(() => dir)
        .list()
        .map((e) => e.file),
    ).toEqual(['todos']);
  });

  test('같은 기록을 다시 넣으면 갈아 끼운다(써 넣기 결과 갱신)', () => {
    const registry = createRestoreRegistry(() => dir);
    registry.add(entry());
    registry.add(entry({ written: true }));

    expect(registry.list()).toEqual([entry({ written: true })]);
  });

  test('학년도 전환으로 푼 보호는 그 까닭을 기록에 남긴다', () => {
    const registry = createRestoreRegistry(() => dir);
    registry.add(entry());
    registry.mark((e) => e.file === 'todos', 'syncResolved', 'year-transition');

    expect(logEntries(dir)).toEqual([
      entry({ syncResolved: true, syncResolvedBy: 'year-transition' }),
    ]);
  });
});
