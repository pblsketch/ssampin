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
