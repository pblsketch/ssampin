/**
 * 미저장 쓰기 배리어 — 백그라운드 전환 시 업로드가 편집을 앞지르지 않는지 검증한다.
 *
 * 배경: `visibilitychange`/`pagehide` 에 화면(디바운스 flush)과 동기화(즉시 업로드)가
 * 함께 물려 있고 실행 순서는 등록 순서에 달려 있다. 업로드가 먼저 시작돼도 배리어를
 * 기다리므로, 그 사이 화면 리스너가 저장을 끝내면 최신 상태가 올라간다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  beginPendingWrite,
  awaitPendingWrites,
  resetPendingWritesForTest,
  getPendingWriteCount,
} from './pendingWrites';

describe('pendingWrites 배리어', () => {
  beforeEach(() => {
    resetPendingWritesForTest();
  });

  it('미저장 쓰기가 없으면 즉시 통과한다', async () => {
    await expect(awaitPendingWrites()).resolves.toBeUndefined();
  });

  it('업로드가 먼저 시작돼도 저장이 끝날 때까지 기다린다', async () => {
    const order: string[] = [];

    // 업로드 리스너가 먼저 실행된 상황 — 단, 그 전에 편집으로 배리어가 열려 있다.
    const release = beginPendingWrite();
    const upload = awaitPendingWrites().then(() => order.push('upload'));

    // 화면 리스너가 뒤이어 저장을 끝낸다.
    await Promise.resolve();
    order.push('save');
    release();

    await upload;
    expect(order).toEqual(['save', 'upload']);
  });

  it('여러 편집이 겹쳐도 마지막 하나가 끝나야 통과한다', async () => {
    const releaseA = beginPendingWrite();
    const releaseB = beginPendingWrite();
    let passed = false;
    const waiter = awaitPendingWrites().then(() => {
      passed = true;
    });

    releaseA();
    await Promise.resolve();
    expect(passed).toBe(false); // B 가 남아 있으면 아직 통과 금지

    releaseB();
    await waiter;
    expect(passed).toBe(true);
  });

  it('release 를 두 번 불러도 카운터가 새지 않는다', () => {
    const release = beginPendingWrite();
    beginPendingWrite();
    release();
    release();
    expect(getPendingWriteCount()).toBe(1);
  });
});
