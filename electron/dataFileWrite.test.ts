/**
 * data:write 가 성공 여부를 정직하게 돌려주는지 고정한다.
 * 실패를 삼키면 렌더러가 저장된 줄 알고 화면만 갱신해, 입력한 할 일이 조용히 사라진다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isSafeDataFileName, writeDataFileAtomic } from './dataFileWrite';

let dir = '';

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-write-'));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('writeDataFileAtomic', () => {
  it('성공: 파일을 쓰고 ok 를 돌려준다', () => {
    const result = writeDataFileAtomic(dir, 'todos', '{"todos":[]}');
    expect(result).toEqual({ ok: true });
    expect(fs.readFileSync(path.join(dir, 'todos.json'), 'utf-8')).toBe('{"todos":[]}');
    expect(fs.existsSync(path.join(dir, 'todos.tmp.json'))).toBe(false);
  });

  it('성공: 이전 내용은 .backup.json 으로 남긴다', () => {
    const prev = JSON.stringify({ todos: [{ id: 'a', text: '이전 할 일' }] });
    fs.writeFileSync(path.join(dir, 'todos.json'), prev, 'utf-8');

    writeDataFileAtomic(dir, 'todos', '{"todos":[{"id":"b"}]}');

    expect(fs.readFileSync(path.join(dir, 'todos.backup.json'), 'utf-8')).toBe(prev);
  });

  it('실패(교체 단계 오류): ok:false 를 돌려주고 원본·임시 파일을 어지럽히지 않는다', () => {
    const prev = JSON.stringify({ todos: [{ id: 'a', text: '이전 할 일' }] });
    fs.writeFileSync(path.join(dir, 'todos.json'), prev, 'utf-8');
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
    });

    const result = writeDataFileAtomic(dir, 'todos', '{"todos":[{"id":"b"}]}');

    expect(result).toEqual({ ok: false, reason: 'write' });
    expect(fs.readFileSync(path.join(dir, 'todos.json'), 'utf-8')).toBe(prev);
    expect(fs.existsSync(path.join(dir, 'todos.tmp.json'))).toBe(false);
  });

  it('실패(폴더 없음): ok:false', () => {
    const result = writeDataFileAtomic(path.join(dir, 'missing'), 'todos', '{}');
    expect(result).toEqual({ ok: false, reason: 'write' });
  });

  it('실패(쓴 내용이 검증과 다름): ok:false 를 돌려준다', () => {
    const real = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation(((
      p: fs.PathOrFileDescriptor,
      ...rest: unknown[]
    ) => {
      if (String(p).endsWith('todos.tmp.json')) return 'truncated';
      return (real as (...a: unknown[]) => unknown)(p, ...rest);
    }) as typeof fs.readFileSync);

    const result = writeDataFileAtomic(dir, 'todos', '{"todos":[{"id":"abcdef"}]}');

    expect(result).toEqual({ ok: false, reason: 'verify' });
    expect(fs.existsSync(path.join(dir, 'todos.json'))).toBe(false);
  });

  it('쓰기 뒤 내용이 다르면 실패로 본다(길이가 같아도)', () => {
    const prev = JSON.stringify({ todos: [{ id: 'a', text: '이전 할 일' }] });
    fs.writeFileSync(path.join(dir, 'todos.json'), prev, 'utf-8');
    const data = '{"todos":[{"id":"abcdef"}]}';
    // 2026-11-06 사고와 같은 모양: 길이는 맞는데 내용이 전부 0x00
    const sameLengthGarbage = '\0'.repeat(data.length);
    const real = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation(((
      p: fs.PathOrFileDescriptor,
      ...rest: unknown[]
    ) => {
      if (String(p).endsWith('todos.tmp.json')) return sameLengthGarbage;
      return (real as (...a: unknown[]) => unknown)(p, ...rest);
    }) as typeof fs.readFileSync);

    const result = writeDataFileAtomic(dir, 'todos', data);

    expect(result).toEqual({ ok: false, reason: 'verify' });
    vi.restoreAllMocks();
    // 원본은 그대로이고 임시 파일은 남지 않는다
    expect(fs.readFileSync(path.join(dir, 'todos.json'), 'utf-8')).toBe(prev);
    expect(fs.existsSync(path.join(dir, 'todos.tmp.json'))).toBe(false);
  });

  // ── 2026-11 보강: 비정상 종료 뒤 원본·백업이 함께 0x00 으로 채워진 사고 ──

  it('깨진 원본은 백업으로 복사하지 않는다', () => {
    const lastGood = JSON.stringify({ todos: [{ id: 'a', text: '마지막 정상 백업' }] });
    fs.writeFileSync(path.join(dir, 'todos.backup.json'), lastGood, 'utf-8');
    // 전원이 끊겨 길이만 맞고 내용은 0x00 인 원본
    fs.writeFileSync(path.join(dir, 'todos.json'), '\0'.repeat(210), 'utf-8');

    const result = writeDataFileAtomic(dir, 'todos', '{"todos":[{"id":"b"}]}');

    expect(result).toEqual({ ok: true });
    expect(fs.readFileSync(path.join(dir, 'todos.backup.json'), 'utf-8')).toBe(lastGood);
    expect(fs.readFileSync(path.join(dir, 'todos.json'), 'utf-8')).toBe('{"todos":[{"id":"b"}]}');
  });

  it('임시 파일을 fsync 한 뒤 교체한다', () => {
    const data = '{"todos":[{"id":"b"}]}';
    const target = path.join(dir, 'todos.json');
    const temp = path.join(dir, 'todos.tmp.json');
    const atFsync: { tempHasData: boolean; targetExists: boolean }[] = [];
    const realFsync = fs.fsyncSync;
    const fsyncSpy = vi.spyOn(fs, 'fsyncSync').mockImplementation((fd: number) => {
      atFsync.push({
        tempHasData: fs.readFileSync(temp, 'utf-8') === data,
        targetExists: fs.existsSync(target),
      });
      realFsync(fd);
    });
    const renameSpy = vi.spyOn(fs, 'renameSync');

    expect(writeDataFileAtomic(dir, 'todos', data)).toEqual({ ok: true });

    // 내용을 다 쓴 임시 파일에 fsync 를 걸었고, 그때 원본 자리는 아직 비어 있었다
    expect(atFsync).toEqual([{ tempHasData: true, targetExists: false }]);
    expect(renameSpy).toHaveBeenCalledTimes(1);
    expect(renameSpy).toHaveBeenCalledWith(temp, target);
    expect(fsyncSpy.mock.invocationCallOrder[0]).toBeLessThan(
      renameSpy.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('백업 쓰기 실패가 기존 백업을 망가뜨리지 않는다', () => {
    const lastGood = JSON.stringify({ todos: [{ id: 'a', text: '마지막 정상 백업' }] });
    const prev = JSON.stringify({ todos: [{ id: 'b', text: '직전 내용' }] });
    fs.writeFileSync(path.join(dir, 'todos.backup.json'), lastGood, 'utf-8');
    fs.writeFileSync(path.join(dir, 'todos.json'), prev, 'utf-8');
    const realRename = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation((from: fs.PathLike, to: fs.PathLike) => {
      if (String(to).endsWith('todos.backup.json')) {
        throw Object.assign(new Error('EIO: i/o error'), { code: 'EIO' });
      }
      realRename(from, to);
    });

    const result = writeDataFileAtomic(dir, 'todos', '{"todos":[{"id":"c"}]}');

    // 저장은 그대로 되고, 백업은 반쯤 쓰인 채가 아니라 예전 그대로다
    expect(result).toEqual({ ok: true });
    expect(fs.readFileSync(path.join(dir, 'todos.json'), 'utf-8')).toBe('{"todos":[{"id":"c"}]}');
    expect(fs.readFileSync(path.join(dir, 'todos.backup.json'), 'utf-8')).toBe(lastGood);
    expect(fs.existsSync(path.join(dir, 'todos.backup.tmp.json'))).toBe(false);
  });

  it('rename 이 두 번 EPERM 뒤 성공하면 저장된다', () => {
    const realRename = fs.renameSync;
    let calls = 0;
    const renameSpy = vi
      .spyOn(fs, 'renameSync')
      .mockImplementation((from: fs.PathLike, to: fs.PathLike) => {
        calls += 1;
        if (calls <= 2) {
          throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
        }
        realRename(from, to);
      });

    const result = writeDataFileAtomic(dir, 'todos', '{"todos":[{"id":"b"}]}');

    expect(result).toEqual({ ok: true });
    expect(renameSpy).toHaveBeenCalledTimes(3);
    expect(fs.readFileSync(path.join(dir, 'todos.json'), 'utf-8')).toBe('{"todos":[{"id":"b"}]}');
    expect(fs.existsSync(path.join(dir, 'todos.tmp.json'))).toBe(false);
  });

  it('rename 이 계속 실패하면 원본이 그대로이고 임시 파일이 없다', () => {
    const prev = '{"a":1}'; // 10자 이하라 백업을 만들지 않는다 — 호출 수를 원본 교체만으로 센다
    fs.writeFileSync(path.join(dir, 'todos.json'), prev, 'utf-8');
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
    });

    const result = writeDataFileAtomic(dir, 'todos', '{"todos":[{"id":"b"}]}');

    expect(result).toEqual({ ok: false, reason: 'write' });
    expect(renameSpy).toHaveBeenCalledTimes(4); // 첫 시도 + 재시도 3회
    expect(fs.readFileSync(path.join(dir, 'todos.json'), 'utf-8')).toBe(prev);
    expect(fs.existsSync(path.join(dir, 'todos.tmp.json'))).toBe(false);
  });

  it('잠금이 아닌 오류(디스크 가득 등)는 다시 시도하지 않는다', () => {
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
    });

    const result = writeDataFileAtomic(dir, 'todos', '{"todos":[{"id":"b"}]}');

    expect(result).toEqual({ ok: false, reason: 'write' });
    expect(renameSpy).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(path.join(dir, 'todos.tmp.json'))).toBe(false);
  });

  it('fsync 를 지원하지 않는 저장소에서는 경고만 하고 저장된다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const codes = ['EINVAL', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EISDIR'];

    codes.forEach((code, index) => {
      vi.spyOn(fs, 'fsyncSync').mockImplementation(() => {
        throw Object.assign(new Error(`${code}: fsync`), { code });
      });
      const data = `{"todos":[{"id":"b${index}"}]}`;

      expect(writeDataFileAtomic(dir, 'todos', data)).toEqual({ ok: true });
      expect(fs.readFileSync(path.join(dir, 'todos.json'), 'utf-8')).toBe(data);
    });

    // 저장할 때마다 되풀이하지 않고 한 번만 알린다
    expect(warn.mock.calls).toEqual([
      ['[data:write] fsync 를 지원하지 않는 저장소입니다 (EINVAL)'],
    ]);
    expect(console.error).not.toHaveBeenCalled();
  });

  it.each(['ENOSPC', 'EIO', 'EPERM'])(
    'fsync 가 %s 로 실패하면 저장 실패이고 원본이 그대로다',
    (code) => {
      const prev = JSON.stringify({ todos: [{ id: 'a', text: '이전 할 일' }] });
      const lastGood = JSON.stringify({ todos: [{ id: 'z', text: '마지막 정상 백업' }] });
      fs.writeFileSync(path.join(dir, 'todos.json'), prev, 'utf-8');
      fs.writeFileSync(path.join(dir, 'todos.backup.json'), lastGood, 'utf-8');
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      vi.spyOn(fs, 'fsyncSync').mockImplementation(() => {
        throw Object.assign(new Error(`${code}: fsync`), { code });
      });
      const renameSpy = vi.spyOn(fs, 'renameSync');

      const result = writeDataFileAtomic(dir, 'todos', '{"todos":[{"id":"b"}]}');

      expect(result).toEqual({ ok: false, reason: 'write' });
      // 디스크에 내려가지 않은 임시 파일로 원본·백업을 바꾸지 않았고, 임시 파일도 남기지 않았다
      expect(renameSpy).not.toHaveBeenCalled();
      expect(fs.readFileSync(path.join(dir, 'todos.json'), 'utf-8')).toBe(prev);
      expect(fs.readFileSync(path.join(dir, 'todos.backup.json'), 'utf-8')).toBe(lastGood);
      expect(fs.readdirSync(dir).sort()).toEqual(['todos.backup.json', 'todos.json']);
      expect(console.warn).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(`[data:write] 저장 실패: todos (${code})`);
    },
  );

  it('실패 로그에는 오류 코드만 남긴다(경로·메시지·내용 없음)', () => {
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(new Error('ENOSPC: no space left, rename C:\\Users\\teacher\\x'), {
        code: 'ENOSPC',
      });
    });
    writeDataFileAtomic(dir, 'todos', '{"todos":[{"text":"김OO 학부모 상담"}]}');
    const calls = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls).toEqual([['[data:write] 저장 실패: todos (ENOSPC)']]);
  });

  it('로그에 파일 내용(학생 정보)을 남기지 않는다', () => {
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('EPERM');
    });
    writeDataFileAtomic(dir, 'todos', '{"todos":[{"text":"김OO 학부모 상담"}]}');
    const printed = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .flat()
      .map((a) => (a instanceof Error ? a.message : String(a)))
      .join(' ');
    expect(printed).not.toContain('김OO');
  });
});

describe('isSafeDataFileName — 데이터 폴더 밖을 가리키지 못한다 (ADR-143 보안 점검)', () => {
  const root = path.join(os.tmpdir(), 'ssampin-data-root');
  it.each(['settings', 'record-ai-drafts', 'boards/abc-123', 'archive/2026-1/students'])(
    '받는다: %s',
    (name) => {
      expect(isSafeDataFileName(root, name)).toBe(true);
    },
  );
  // 역슬래시는 윈도우에서만 경로 구분자다 — 리눅스(CI)에서는 평범한 글자라 그 두 줄은 윈도우에서만 본다.
  const windowsOnly = process.platform === 'win32' ? ['..\\byok\\active', 'C:\\Windows\\x'] : [];
  it.each(['../byok/active', 'a/../../x', '', '/etc/x', 'a\0b', ...windowsOnly])(
    '거절: %j',
    (name) => {
      expect(isSafeDataFileName(root, name)).toBe(false);
    },
  );
  it('거절된 이름으로는 쓰지 않는다', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-guard-'));
    const data = path.join(dir, 'data');
    fs.mkdirSync(data);
    expect(writeDataFileAtomic(data, '../escaped', '{"a":1}')).toEqual({
      ok: false,
      reason: 'write',
    });
    expect(fs.existsSync(path.join(dir, 'escaped.json'))).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
