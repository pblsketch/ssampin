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
  attachToShellDefView,
  collectDesktopAttachCandidates,
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

describe('win32Desktop new strategy API exports (G2 게이트 후속)', () => {
  it('collectDesktopAttachCandidates는 함수로 export된다', () => {
    expect(typeof collectDesktopAttachCandidates).toBe('function');
  });

  it('attachToShellDefView는 함수로 export된다 (STRATEGY 3)', () => {
    expect(typeof attachToShellDefView).toBe('function');
  });

  it('attachToShellDefView(0n, 0n)은 AttachFailedError로 reject (Promise)', async () => {
    if (process.platform !== 'win32') {
      // 비Win32에선 koffi load 자체가 실패해 KoffiLoadError. 본 검증 스킵.
      return;
    }
    await expect(attachToShellDefView(0n, 0n)).rejects.toBeInstanceOf(AttachFailedError);
  });
});

describe('win32Desktop G2-bis (WS_POPUP→WS_CHILD 전환)', () => {
  // Win32DesktopHandles의 prevStyle 필드는 attach 시 캡처되어야 한다.
  // 본 테스트는 type shape만 검증 — 실제 attach는 Win32 환경에서만 가능.
  it('Win32DesktopHandles 타입은 prevStyle: bigint 필드를 포함한다', () => {
    // 컴파일 타임 타입 체크 — 본 구문이 tsc 통과하면 필드 존재 보장.
    const sample: import('./win32Desktop').Win32DesktopHandles = {
      workerW: 0n,
      widgetHwnd: 0n,
      prevParent: 0n,
      prevExStyle: 0n,
      prevStyle: 0n,
    };
    expect(sample.prevStyle).toBe(0n);
  });

  it('WS_POPUP→WS_CHILD 비트 변환 산술 — 다른 스타일 비트는 보존', () => {
    // 32-bit unsigned로 가정하되 BigInt 연산.
    const WS_POPUP = 0x80000000n;
    const WS_CHILD = 0x40000000n;
    const WS_VISIBLE = 0x10000000n;
    const WS_CLIPSIBLINGS = 0x04000000n;

    // BrowserWindow가 transparent+frame:false일 때 일반적인 style 조합.
    const original = WS_POPUP | WS_VISIBLE | WS_CLIPSIBLINGS;
    expect(original & WS_POPUP).toBe(WS_POPUP);
    expect(original & WS_CHILD).toBe(0n);

    const transformed = (original & ~WS_POPUP) | WS_CHILD;

    expect(transformed & WS_POPUP).toBe(0n); // WS_POPUP 제거 확인
    expect(transformed & WS_CHILD).toBe(WS_CHILD); // WS_CHILD 추가 확인
    expect(transformed & WS_VISIBLE).toBe(WS_VISIBLE); // WS_VISIBLE 보존
    expect(transformed & WS_CLIPSIBLINGS).toBe(WS_CLIPSIBLINGS); // WS_CLIPSIBLINGS 보존
  });

  it('이미 WS_CHILD인 윈도우에 변환을 적용해도 idempotent하다 (no-op)', () => {
    const WS_POPUP = 0x80000000n;
    const WS_CHILD = 0x40000000n;
    const original = WS_CHILD | 0x10000000n; // 이미 child

    const transformed = (original & ~WS_POPUP) | WS_CHILD;

    expect(transformed).toBe(original); // 변경 없음
  });
});
