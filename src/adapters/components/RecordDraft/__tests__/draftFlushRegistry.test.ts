/**
 * 초안 자동저장 flush 등록소 (계획 §4.3, AC-12).
 *
 * 잠그는 것: 이동 전에 대기분을 **전부** 저장하고, 하나라도 실패하면 이동을 막을 수 있게 false 를 준다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  flushAllDrafts,
  registerDraftFlush,
  resetDraftFlushRegistryForTest,
} from '../draftFlushRegistry';

beforeEach(() => resetDraftFlushRegistryForTest());

describe('flushAllDrafts', () => {
  it('등록된 것이 없으면 성공이다', async () => {
    await expect(flushAllDrafts()).resolves.toBe(true);
  });

  it('등록된 대기분을 전부 부르고 모두 성공하면 true', async () => {
    const a = vi.fn(async () => true);
    const b = vi.fn(async () => true);
    registerDraftFlush(a);
    registerDraftFlush(b);
    await expect(flushAllDrafts()).resolves.toBe(true);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('★하나가 실패하면 false 다 — 화면은 이동하지 않고 머문다', async () => {
    registerDraftFlush(async () => true);
    registerDraftFlush(async () => false);
    await expect(flushAllDrafts()).resolves.toBe(false);
  });

  it('★한 칸이 실패해도 나머지는 그대로 저장한다', async () => {
    const later = vi.fn(async () => true);
    registerDraftFlush(async () => {
      throw new Error('한도 초과');
    });
    registerDraftFlush(later);
    await expect(flushAllDrafts()).resolves.toBe(false);
    expect(later).toHaveBeenCalledTimes(1); // 건너뛰지 않았다
  });

  it('던지는 flush 는 실패로 센다(터뜨리지 않는다)', async () => {
    registerDraftFlush(async () => {
      throw new Error('boom');
    });
    await expect(flushAllDrafts()).resolves.toBe(false);
  });

  it('언마운트로 등록을 풀면 더 부르지 않는다', async () => {
    const gone = vi.fn(async () => true);
    const off = registerDraftFlush(gone);
    off();
    await flushAllDrafts();
    expect(gone).not.toHaveBeenCalled();
  });
});
