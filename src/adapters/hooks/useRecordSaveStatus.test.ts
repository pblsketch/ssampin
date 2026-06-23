// @vitest-environment jsdom
/**
 * UT-1: useRecordSaveStatus 상태 전이 테스트
 * 설계서 §3.2 UT-1
 *
 * idle → dirty → saving → saved
 *                        → error
 * saved/error → dirty (재변경 시)
 * 저장 중 markDirty → 완료 후 dirty 복귀
 */
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRecordSaveStatus } from './useRecordSaveStatus';

describe('useRecordSaveStatus — 상태 전이 (UT-1)', () => {
  it('초기 상태는 idle', () => {
    const { result } = renderHook(() => useRecordSaveStatus());
    expect(result.current.saveStatus).toBe('idle');
    expect(result.current.isDirty()).toBe(false);
  });

  it('markDirty() → dirty 전이', () => {
    const { result } = renderHook(() => useRecordSaveStatus());
    act(() => {
      result.current.markDirty();
    });
    expect(result.current.saveStatus).toBe('dirty');
    expect(result.current.isDirty()).toBe(true);
  });

  it('wrapSave 성공 → saving → saved 전이', async () => {
    const { result } = renderHook(() => useRecordSaveStatus());
    act(() => {
      result.current.markDirty();
    });

    let resolvePromise!: () => void;
    const pendingSave = new Promise<void>((res) => {
      resolvePromise = res;
    });

    let savePromise: Promise<void>;
    act(() => {
      savePromise = result.current.wrapSave(() => pendingSave);
    });
    // saving 상태 진입
    expect(result.current.saveStatus).toBe('saving');

    // 저장 완료
    await act(async () => {
      resolvePromise();
      await savePromise;
    });
    expect(result.current.saveStatus).toBe('saved');
    expect(result.current.isDirty()).toBe(false);
  });

  it('wrapSave 실패 → saving → error 전이', async () => {
    const { result } = renderHook(() => useRecordSaveStatus());
    act(() => {
      result.current.markDirty();
    });

    await act(async () => {
      await result.current.wrapSave(() => Promise.reject(new Error('저장 실패')));
    });
    expect(result.current.saveStatus).toBe('error');
    expect(result.current.isDirty()).toBe(true);
  });

  it('saved 상태에서 markDirty() → dirty 재전이', async () => {
    const { result } = renderHook(() => useRecordSaveStatus());
    act(() => {
      result.current.markDirty();
    });
    await act(async () => {
      await result.current.wrapSave(() => Promise.resolve());
    });
    expect(result.current.saveStatus).toBe('saved');

    act(() => {
      result.current.markDirty();
    });
    expect(result.current.saveStatus).toBe('dirty');
  });

  it('error 상태에서 markDirty() → dirty 재전이', async () => {
    const { result } = renderHook(() => useRecordSaveStatus());
    act(() => {
      result.current.markDirty();
    });
    await act(async () => {
      await result.current.wrapSave(() => Promise.reject(new Error('오류')));
    });
    expect(result.current.saveStatus).toBe('error');

    act(() => {
      result.current.markDirty();
    });
    expect(result.current.saveStatus).toBe('dirty');
  });

  it('저장 중 markDirty() → 완료 후 dirty 복귀 (부분실패 감지 경로)', async () => {
    const { result } = renderHook(() => useRecordSaveStatus());
    act(() => {
      result.current.markDirty();
    });

    let resolvePromise!: () => void;
    const pendingSave = new Promise<void>((res) => {
      resolvePromise = res;
    });

    let savePromise: Promise<void>;
    act(() => {
      savePromise = result.current.wrapSave(() => pendingSave);
    });
    expect(result.current.saveStatus).toBe('saving');

    // 저장 중 추가 변경
    act(() => {
      result.current.markDirty();
    });
    // saving 상태는 유지 (저장 중에는 상태 안 바꿈)
    expect(result.current.saveStatus).toBe('saving');

    // 완료 → dirty 로 복귀
    await act(async () => {
      resolvePromise();
      await savePromise;
    });
    expect(result.current.saveStatus).toBe('dirty');
  });

  it('reset() → idle 복귀', async () => {
    const { result } = renderHook(() => useRecordSaveStatus());
    act(() => {
      result.current.markDirty();
    });
    await act(async () => {
      await result.current.wrapSave(() => Promise.resolve());
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.saveStatus).toBe('idle');
    expect(result.current.isDirty()).toBe(false);
  });

  it('onDirtyChange 콜백 — isDirty 변화에 따라 호출됨 (이탈 경고 연동)', async () => {
    // useRecordSaveStatus 훅 자체는 콜백 없음 — isDirty() 반환값 변화를 단언
    const { result } = renderHook(() => useRecordSaveStatus());

    expect(result.current.isDirty()).toBe(false);
    act(() => {
      result.current.markDirty();
    });
    expect(result.current.isDirty()).toBe(true);

    await act(async () => {
      await result.current.wrapSave(() => Promise.resolve());
    });
    expect(result.current.isDirty()).toBe(false);
  });
});
