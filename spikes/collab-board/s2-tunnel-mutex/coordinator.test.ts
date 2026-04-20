/**
 * S2 스파이크 검증 — BoardTunnelCoordinator 상호 배타 테스트
 *
 * 요구 사항:
 *   1. 보드가 터널 점유 중이면 투표가 acquire 시도 시 TunnelBusyError
 *   2. 반대 방향(투표 점유 중 보드 시도)도 대칭 동작
 *   3. 같은 owner의 재진입은 idempotent (같은 URL 반환, 드라이버 1회 호출)
 *   4. release 후엔 다른 owner가 정상 acquire
 *   5. 점유자가 아닌 owner의 release는 무시 (무해)
 */

import { BoardTunnelCoordinator, TunnelBusyError, type TunnelDriver } from './coordinator';

function makeMockDriver() {
  let nextPort = 0;
  const openLog: number[] = [];
  let closeCount = 0;
  const driver: TunnelDriver = {
    async openTunnel(localPort: number): Promise<string> {
      openLog.push(localPort);
      nextPort++;
      return `https://mock-${nextPort}.trycloudflare.com`;
    },
    closeTunnel(): void {
      closeCount++;
    },
  };
  return { driver, openLog, getCloseCount: () => closeCount };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  PASS: ${msg}`);
}

async function testBoardBlocksVote() {
  console.log('\n[Test 1] 보드 점유 중 → 투표 차단');
  const { driver, openLog } = makeMockDriver();
  const c = new BoardTunnelCoordinator(driver);
  const boardUrl = await c.acquire('board', 3000);
  assert(boardUrl.startsWith('https://mock-'), '보드가 URL 획득');
  assert(c.isBusy(), 'isBusy() true');
  assert(c.getCurrent()?.owner === 'board', "getCurrent().owner === 'board'");
  let caught: TunnelBusyError | null = null;
  try {
    await c.acquire('live-vote', 3001);
  } catch (e) {
    if (e instanceof TunnelBusyError) caught = e;
  }
  assert(caught !== null, '투표 acquire 시 TunnelBusyError 발생');
  assert(caught!.existing === 'board', 'error.existing === board');
  assert(openLog.length === 1, '드라이버 openTunnel은 1회만 호출됨(보드 최초)');
}

async function testVoteBlocksBoard() {
  console.log('\n[Test 2] 투표 점유 중 → 보드 차단 (대칭)');
  const { driver } = makeMockDriver();
  const c = new BoardTunnelCoordinator(driver);
  await c.acquire('live-vote', 4000);
  let caught: TunnelBusyError | null = null;
  try {
    await c.acquire('board', 4001);
  } catch (e) {
    if (e instanceof TunnelBusyError) caught = e;
  }
  assert(caught !== null, '보드 acquire 시 TunnelBusyError 발생');
  assert(caught!.existing === 'live-vote', 'error.existing === live-vote');
}

async function testIdempotentAcquire() {
  console.log('\n[Test 3] 같은 owner+port 재진입 (idempotent)');
  const { driver, openLog } = makeMockDriver();
  const c = new BoardTunnelCoordinator(driver);
  const u1 = await c.acquire('board', 5000);
  const u2 = await c.acquire('board', 5000);
  assert(u1 === u2, '같은 URL 반환');
  assert(openLog.length === 1, '드라이버 openTunnel은 1회만 호출 (재진입 무해)');
}

async function testReleaseEnablesReacquire() {
  console.log('\n[Test 4] release 후 다른 owner 정상 acquire');
  const { driver, getCloseCount } = makeMockDriver();
  const c = new BoardTunnelCoordinator(driver);
  await c.acquire('board', 6000);
  c.release('board');
  assert(!c.isBusy(), 'release 후 isBusy() false');
  assert(getCloseCount() === 1, '드라이버 closeTunnel 1회 호출');
  const voteUrl = await c.acquire('live-vote', 6001);
  assert(voteUrl.length > 0, '투표가 release 후 정상 acquire');
  assert(c.getCurrent()?.owner === 'live-vote', "이제 owner === 'live-vote'");
}

async function testWrongOwnerReleaseIsNoop() {
  console.log('\n[Test 5] 점유자 아닌 owner의 release는 무시 (방어적)');
  const { driver, getCloseCount } = makeMockDriver();
  const c = new BoardTunnelCoordinator(driver);
  await c.acquire('board', 7000);
  c.release('live-vote'); // 엉뚱한 owner
  assert(c.isBusy(), '여전히 점유 중');
  assert(getCloseCount() === 0, '드라이버 closeTunnel 호출 안 됨');
  assert(c.getCurrent()?.owner === 'board', "원래 점유자 유지");
}

async function testDifferentPortSameOwnerRejects() {
  console.log('\n[Test 6] 같은 owner라도 port가 다르면 재acquire 차단 (이중 서버 방지)');
  const { driver } = makeMockDriver();
  const c = new BoardTunnelCoordinator(driver);
  await c.acquire('board', 8000);
  let caught: TunnelBusyError | null = null;
  try {
    await c.acquire('board', 8999); // 포트 다름
  } catch (e) {
    if (e instanceof TunnelBusyError) caught = e;
  }
  assert(caught !== null, '다른 포트로 재acquire 시 거부');
}

(async () => {
  try {
    await testBoardBlocksVote();
    await testVoteBlocksBoard();
    await testIdempotentAcquire();
    await testReleaseEnablesReacquire();
    await testWrongOwnerReleaseIsNoop();
    await testDifferentPortSameOwnerRejects();
    console.log('\n========================================');
    console.log('  S2 스파이크: 모든 테스트 통과');
    console.log('  결론: 기존 tunnel.ts 무수정으로 상호 배타 가능');
    console.log('========================================');
    process.exit(0);
  } catch (err) {
    console.error('\n스파이크 실패:', err);
    process.exit(1);
  }
})();
