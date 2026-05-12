import { describe, it, expect } from 'vitest';
import {
  issueWriteHandle,
  issueOpenHandle,
  consumeWritePath,
  peekOpenPath,
} from './dialogHandles';

describe('dialogHandles', () => {
  it('issueWriteHandle → consumeWritePath 가 경로를 돌려주고 1회만 소비', () => {
    const handle = issueWriteHandle('C:\\Users\\me\\Downloads\\x.xlsx');
    expect(typeof handle).toBe('string');
    expect(handle.length).toBeGreaterThan(0);
    expect(consumeWritePath(handle)).toBe('C:\\Users\\me\\Downloads\\x.xlsx');
    // 두 번째 소비는 throw
    expect(() => consumeWritePath(handle)).toThrow();
  });

  it('write 핸들은 소비 전·후 모두 open 가능 (peek 는 소비 안 함)', () => {
    const handle = issueWriteHandle('/tmp/a.txt');
    expect(peekOpenPath(handle)).toBe('/tmp/a.txt');
    consumeWritePath(handle);
    // 소비 후에도 open 은 가능
    expect(peekOpenPath(handle)).toBe('/tmp/a.txt');
    expect(peekOpenPath(handle)).toBe('/tmp/a.txt');
  });

  it('issueOpenHandle 은 write 불가, open 은 무제한', () => {
    const handle = issueOpenHandle('/tmp/picked.ics');
    expect(() => consumeWritePath(handle)).toThrow();
    expect(peekOpenPath(handle)).toBe('/tmp/picked.ics');
    expect(peekOpenPath(handle)).toBe('/tmp/picked.ics');
  });

  it('알 수 없는 / 빈 핸들은 throw', () => {
    expect(() => consumeWritePath('not-a-real-handle')).toThrow();
    expect(() => peekOpenPath('not-a-real-handle')).toThrow();
    // @ts-expect-error 의도적 잘못된 타입
    expect(() => consumeWritePath(undefined)).toThrow();
    expect(() => consumeWritePath('')).toThrow();
  });

  it('서로 다른 발급은 서로 다른 핸들', () => {
    const a = issueWriteHandle('/x');
    const b = issueWriteHandle('/x');
    expect(a).not.toBe(b);
  });
});
