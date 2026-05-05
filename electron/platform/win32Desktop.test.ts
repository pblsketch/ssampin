/**
 * win32Desktop FFI 안전성 단위 테스트.
 *
 * 본 테스트는 koffi 또는 Win32 시스템 라이브러리에 접근하지 않는 경로만 검증한다:
 *   - error class shape
 *   - null/0 핸들 입력 시 throw 없이 false/null 반환
 *
 * 실제 koffi 호출 경로는 Windows 실기 검증에 의존한다.
 */

import { describe, it, expect } from 'vitest';
import {
  KoffiLoadError,
  WorkerWNotFoundError,
  AttachFailedError,
  OpenProcessDeniedError,
  RemoteMemoryError,
  HookInstallError,
  isWindowAlive,
  findDesktopListView,
} from './win32Desktop';

describe('win32Desktop error classes', () => {
  it('KoffiLoadError은 name이 "KoffiLoadError"', () => {
    const e = new KoffiLoadError('msg');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('KoffiLoadError');
    expect(e.message).toBe('msg');
  });

  it('WorkerWNotFoundError은 name이 "WorkerWNotFoundError"', () => {
    const e = new WorkerWNotFoundError('msg');
    expect(e.name).toBe('WorkerWNotFoundError');
  });

  it('AttachFailedError은 name이 "AttachFailedError"', () => {
    const e = new AttachFailedError('msg');
    expect(e.name).toBe('AttachFailedError');
  });

  it('OpenProcessDeniedError은 name이 "OpenProcessDeniedError"', () => {
    const e = new OpenProcessDeniedError('msg');
    expect(e.name).toBe('OpenProcessDeniedError');
  });

  it('RemoteMemoryError은 name이 "RemoteMemoryError"', () => {
    const e = new RemoteMemoryError('msg');
    expect(e.name).toBe('RemoteMemoryError');
  });

  it('HookInstallError은 name이 "HookInstallError"', () => {
    const e = new HookInstallError('msg');
    expect(e.name).toBe('HookInstallError');
  });
});

describe('win32Desktop null-handle safety', () => {
  it('isWindowAlive(0n) → false (throw 없음)', () => {
    expect(isWindowAlive(0n)).toBe(false);
  });

  it('findDesktopListView(0n) → null (throw 없음)', () => {
    expect(findDesktopListView(0n)).toBeNull();
  });
});
