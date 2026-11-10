/**
 * F7a — data:read 손상 휴리스틱 정밀화 테스트 (QA-A RB1 구조 수정).
 * 유효한 빈 구조값(`[]`·`{}`)은 정상, 파스 실패·원시값 짧은 내용은 기존 치유 유지.
 *
 * 2026-11 추가 — 원본·백업이 함께 깨졌을 때: 다시 만들 수 있는 상태 파일만 격리하고 비운다.
 * 그 밖의 파일은 예전처럼 오류를 던진다(null 로 위장하지 않는다).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import fs, { readFileSync } from 'node:fs';
import os from 'node:os';
import path, { resolve } from 'node:path';
import {
  isCorruptShortDataFile,
  isRebuildableStateFile,
  quarantineFileName,
} from './dataFileRules';
import { readDataFileWithRecovery } from './dataFileRead';

describe('isCorruptShortDataFile', () => {
  test('유효한 빈 구조값은 정상으로 취급한다(치유 안 함) — 전환 빈 값 리셋의 전제', () => {
    expect(isCorruptShortDataFile('[]')).toBe(false);
    expect(isCorruptShortDataFile('{}')).toBe(false);
    expect(isCorruptShortDataFile('[1]')).toBe(false);
    expect(isCorruptShortDataFile('[ ]')).toBe(false);
  });

  test('파스 실패 짧은 내용(절단 잔재)은 기존대로 손상 취급 → 백업 치유 유지', () => {
    expect(isCorruptShortDataFile('')).toBe(true);
    expect(isCorruptShortDataFile('{"')).toBe(true);
    expect(isCorruptShortDataFile('[{')).toBe(true);
    expect(isCorruptShortDataFile('x')).toBe(true);
  });

  test('짧은 원시값(숫자·문자열·null)은 손상 취급 — 데이터 파일 루트는 항상 구조값', () => {
    expect(isCorruptShortDataFile('0')).toBe(true);
    expect(isCorruptShortDataFile('null')).toBe(true);
    expect(isCorruptShortDataFile('"a"')).toBe(true);
    expect(isCorruptShortDataFile('true')).toBe(true);
  });

  test('5바이트 이상은 이 규칙의 대상이 아니다(항상 정상 — 뒤의 JSON.parse 검증이 담당)', () => {
    expect(isCorruptShortDataFile('{"a":1}')).toBe(false);
    expect(isCorruptShortDataFile('broken-but-long')).toBe(false);
  });

  test('main.ts data:read가 이 함수를 경유한다 (raw.length < 5 인라인 비교로 회귀 금지)', () => {
    // data:read 의 읽기 로직은 dataFileRead.ts 로 옮겼다 — main.ts 는 그 함수를 부르기만 한다.
    const main = readFileSync(resolve(__dirname, 'main.ts'), 'utf-8');
    expect(main).toContain('readDataFileWithRecovery(getDataDir(), filename)');
    expect(main).not.toMatch(/raw\.length < 5/);
    const reader = readFileSync(resolve(__dirname, 'dataFileRead.ts'), 'utf-8');
    expect(reader).toContain('isCorruptShortDataFile(raw)');
    expect(reader).not.toMatch(/raw\.length < 5/);
  });
});

describe('다시 만들 수 있는 상태 파일 — 허용 목록', () => {
  test('연동 상태 파일 두 개만 해당한다', () => {
    expect(isRebuildableStateFile('tasks-sync-state')).toBe(true);
    expect(isRebuildableStateFile('drive-sync-device-state')).toBe(true);
  });

  test.each([
    'todos',
    'students',
    'settings',
    'calendar-sync',
    'calendar-sync-queue',
    'drive-sync-manifest',
    'tasks-sync-conflicts',
    'sub/tasks-sync-state',
    'TASKS-SYNC-STATE',
    '',
  ])('사용자 자료·동기화 장부·비슷한 이름은 해당하지 않는다: %j', (name) => {
    expect(isRebuildableStateFile(name)).toBe(false);
  });

  test('격리 파일 이름에 원본 이름과 시각이 들어간다', () => {
    const name = quarantineFileName('tasks-sync-state.json', new Date('2026-11-06T04:37:48.123Z'));
    expect(name).toBe('tasks-sync-state.json.corrupt-2026-11-06T04-37-48-123Z');
    // 데이터 폴더의 `*.json` 을 모으는 백업·동기화가 주워 가지 않는다
    expect(name.endsWith('.json')).toBe(false);
    // Windows 파일 이름에 못 쓰는 글자가 없다
    expect(name).not.toMatch(/[:*?"<>|\\/]/);
  });
});

describe('readDataFileWithRecovery — 원본·백업이 모두 깨졌을 때', () => {
  /** 2026-11-06 실제 사고와 같은 모양: 길이만 맞고 내용은 전부 0x00 */
  const NUL = '\0'.repeat(210);
  const NOW = new Date('2026-11-10T01:02:03.004Z');
  const STAMP = '2026-11-10T01-02-03-004Z';
  let dir = '';

  const put = (name: string, content: string): void =>
    fs.writeFileSync(path.join(dir, name), content, 'utf-8');
  const get = (name: string): string => fs.readFileSync(path.join(dir, name), 'utf-8');
  const list = (): string[] => fs.readdirSync(dir).sort();

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-read-'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('전부 NUL 인 상태 파일은 격리하고 null 을 돌려준다', () => {
    put('tasks-sync-state.json', NUL);
    put('tasks-sync-state.backup.json', NUL);

    const result = readDataFileWithRecovery(dir, 'tasks-sync-state', () => NOW);

    expect(result).toEqual({ raw: null, quarantined: true });
    // 지우지 않고 옮겼다 — 깨진 내용이 그대로 남아 있다
    expect(list()).toEqual([
      `tasks-sync-state.backup.json.corrupt-${STAMP}`,
      `tasks-sync-state.json.corrupt-${STAMP}`,
    ]);
    expect(get(`tasks-sync-state.json.corrupt-${STAMP}`)).toBe(NUL);
    expect(get(`tasks-sync-state.backup.json.corrupt-${STAMP}`)).toBe(NUL);

    // 다시 읽으면 그냥 "파일 없음"이다(또 격리했다고 하지 않는다)
    expect(readDataFileWithRecovery(dir, 'tasks-sync-state', () => NOW)).toEqual({
      raw: null,
      quarantined: false,
    });
  });

  test('백업 없이 원본만 깨진 상태 파일도 격리한다', () => {
    put('drive-sync-device-state.json', '{"lastSyncedAt":"2026-11-0');

    const result = readDataFileWithRecovery(dir, 'drive-sync-device-state', () => NOW);

    expect(result).toEqual({ raw: null, quarantined: true });
    expect(list()).toEqual([`drive-sync-device-state.json.corrupt-${STAMP}`]);
  });

  test.each(['todos', 'students', 'calendar-sync', 'calendar-sync-queue', 'drive-sync-manifest'])(
    '사용자 자료 파일은 격리하지 않고 오류를 던진다: %s',
    (name) => {
      put(`${name}.json`, NUL);
      put(`${name}.backup.json`, NUL);

      expect(() => readDataFileWithRecovery(dir, name, () => NOW)).toThrow(/파일 손상/);

      // 아무것도 옮기거나 지우지 않았다
      expect(list()).toEqual([`${name}.backup.json`, `${name}.json`]);
      expect(get(`${name}.json`)).toBe(NUL);
      expect(get(`${name}.backup.json`)).toBe(NUL);
    },
  );

  test('백업이 온전하면 상태 파일도 격리하지 않고 백업으로 되돌린다', () => {
    const good = '{"isEnabled":true,"taskListId":"list-1"}';
    put('tasks-sync-state.json', NUL);
    put('tasks-sync-state.backup.json', good);

    const result = readDataFileWithRecovery(dir, 'tasks-sync-state', () => NOW);

    expect(result).toEqual({ raw: good, quarantined: false });
    expect(get('tasks-sync-state.json')).toBe(good);
    expect(list()).toEqual(['tasks-sync-state.backup.json', 'tasks-sync-state.json']);
  });

  test('원본을 되돌리지 못해도 온전한 백업 내용은 돌려준다(격리·오류 없음)', () => {
    const good = '{"todos":[{"id":"a"}]}';
    put('todos.json', NUL);
    put('todos.backup.json', good);
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
    });

    const result = readDataFileWithRecovery(dir, 'todos', () => NOW);

    expect(result).toEqual({ raw: good, quarantined: false });
    expect(get('todos.backup.json')).toBe(good);
    expect(list()).toEqual(['todos.backup.json', 'todos.json']); // 임시 파일을 남기지 않는다
  });

  test('깨진 상태 파일을 옮기지 못하면 null 로 넘기지 않고 오류를 던진다', () => {
    put('tasks-sync-state.json', NUL);
    put('tasks-sync-state.backup.json', NUL);
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
    });

    expect(() => readDataFileWithRecovery(dir, 'tasks-sync-state', () => NOW)).toThrow(/파일 손상/);
    expect(list()).toEqual(['tasks-sync-state.backup.json', 'tasks-sync-state.json']);
  });

  /**
   * `<이름>.json` 읽기를 앞에서부터 `failures` 번 막는다(백신·색인이 파일을 잠깐 잡은 상황).
   * 백업(`.backup.json`)·임시 파일 읽기는 그대로 통과시킨다. 돌려주는 값은 원본 읽기 시도 횟수.
   */
  const blockOriginalReads = (name: string, failures: number, code = 'EBUSY') => {
    const realRead = fs.readFileSync;
    const target = path.join(dir, `${name}.json`);
    const seen = { attempts: 0 };
    vi.spyOn(fs, 'readFileSync').mockImplementation(((
      p: fs.PathOrFileDescriptor,
      ...rest: unknown[]
    ) => {
      if (String(p) === target) {
        seen.attempts += 1;
        if (seen.attempts <= failures) throw Object.assign(new Error(code), { code });
      }
      return (realRead as (...a: unknown[]) => unknown)(p, ...rest);
    }) as typeof fs.readFileSync);
    return seen;
  };

  test('읽기 자체가 막힌 상태 파일은 깨졌다고 단정하지 않는다(격리 안 함)', () => {
    put('tasks-sync-state.json', '{"isEnabled":true,"taskListId":"list-1"}');
    blockOriginalReads('tasks-sync-state', Infinity);

    expect(() => readDataFileWithRecovery(dir, 'tasks-sync-state', () => NOW)).toThrow(
      /읽지 못함 \(EBUSY\)/,
    );
    expect(list()).toEqual(['tasks-sync-state.json']);
  });

  test('읽기가 막힌 원본은 백업으로 대체하지 않고 오류를 던진다', () => {
    const current = '{"todos":[{"id":"now","text":"오늘 추가한 할 일"}]}';
    const older = '{"todos":[{"id":"old","text":"한 세대 옛 내용"}]}';
    put('todos.json', current);
    put('todos.backup.json', older);
    const seen = blockOriginalReads('todos', Infinity, 'EPERM');

    // 옛 백업 내용을 지금 내용인 것처럼 돌려주지도, "파일 없음"(null)으로 넘기지도 않는다
    expect(() => readDataFileWithRecovery(dir, 'todos', () => NOW)).toThrow(/읽지 못함 \(EPERM\)/);
    // 첫 시도 + 다시 읽기 3회
    expect(seen.attempts).toBe(4);
  });

  test('읽기가 막혔다가 풀리면 원본 내용을 돌려준다', () => {
    const current = '{"todos":[{"id":"now","text":"오늘 추가한 할 일"}]}';
    const older = '{"todos":[{"id":"old","text":"한 세대 옛 내용"}]}';
    put('todos.json', current);
    put('todos.backup.json', older);
    const seen = blockOriginalReads('todos', 2);

    expect(readDataFileWithRecovery(dir, 'todos', () => NOW)).toEqual({
      raw: current,
      quarantined: false,
    });
    expect(seen.attempts).toBe(3);
  });

  test.each(['todos', 'tasks-sync-state'])(
    '읽기가 막힌 동안 원본·백업 파일이 바뀌지 않는다: %s',
    (name) => {
      const current = '{"items":[{"id":"now"}],"note":"지금 내용"}';
      const older = '{"items":[{"id":"old"}],"note":"한 세대 옛 내용"}';
      put(`${name}.json`, current);
      put(`${name}.backup.json`, older);
      const writeSpy = vi.spyOn(fs, 'writeFileSync');
      const renameSpy = vi.spyOn(fs, 'renameSync');
      blockOriginalReads(name, Infinity);

      expect(() => readDataFileWithRecovery(dir, name, () => NOW)).toThrow(/읽지 못함/);

      // 쓰기·이름 바꾸기를 한 번도 하지 않았다(복구 쓰기·격리 없음)
      expect(writeSpy).not.toHaveBeenCalled();
      expect(renameSpy).not.toHaveBeenCalled();
      vi.restoreAllMocks();
      expect(list()).toEqual([`${name}.backup.json`, `${name}.json`]);
      expect(get(`${name}.json`)).toBe(current);
      expect(get(`${name}.backup.json`)).toBe(older);
    },
  );

  test('온전한 파일은 그대로 읽고, 없는 파일은 null 이다(백업을 되살리지 않는다)', () => {
    put('todos.json', '{"todos":[]}');
    expect(readDataFileWithRecovery(dir, 'todos')).toEqual({
      raw: '{"todos":[]}',
      quarantined: false,
    });

    put('memos.backup.json', '{"memos":[{"id":"old"}]}');
    expect(readDataFileWithRecovery(dir, 'memos')).toEqual({ raw: null, quarantined: false });
    expect(fs.existsSync(path.join(dir, 'memos.json'))).toBe(false);
  });

  test('데이터 폴더 밖을 가리키는 이름은 읽지 않는다', () => {
    expect(() => readDataFileWithRecovery(dir, '../escaped')).toThrow(/허용되지 않는 파일 이름/);
  });
});
