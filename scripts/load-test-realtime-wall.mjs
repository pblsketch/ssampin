#!/usr/bin/env node
/**
 * 실시간 담벼락 부하 테스트 — Design §10.3
 *
 * 사용 방법 (수동 실행):
 *   1. 앱을 먼저 실행한다:  npm run electron:dev
 *   2. 쌤핀에서 실시간 담벼락 세션을 시작한다 (로컬 URL 확인).
 *   3. 별도 터미널에서 이 스크립트를 실행한다:
 *      node scripts/load-test-realtime-wall.mjs --url http://192.168.0.x:PORT
 *      또는 URL을 stdin으로:
 *      echo "http://192.168.0.x:PORT" | node scripts/load-test-realtime-wall.mjs
 *
 * 측정 항목:
 *   - 클라이언트당 'wall-state' 수신 latency (join → 첫 wall-state 도달)
 *   - p50 / p95 / p99 latency
 *   - 목표: p95 < 200ms (Design §10.3)
 *   - RSS 메모리 증가량 (시작 vs 종료)
 *
 * 옵션:
 *   --url <URL>        서버 URL (기본: stdin에서 읽기)
 *   --clients <N>      동시 접속 클라이언트 수 (기본: 100)
 *   --duration <sec>   총 실행 시간 초 (기본: 300 = 5분)
 *   --broadcast-interval <ms>  교사 broadcast 시뮬레이션 간격 (기본: 5000ms)
 */

import { WebSocket } from 'ws';
import { parseArgs } from 'node:util';
import * as readline from 'node:readline';

// ---------------------------------------------------------------------------
// 인수 파싱
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    url:                { type: 'string' },
    clients:            { type: 'string', default: '100' },
    duration:           { type: 'string', default: '300' },
    'broadcast-interval': { type: 'string', default: '5000' },
  },
  allowPositionals: true,
  strict: false,
});

const NUM_CLIENTS        = parseInt(args['clients'] ?? '100', 10);
const DURATION_SEC       = parseInt(args['duration'] ?? '300', 10);
const BROADCAST_INTERVAL = parseInt(args['broadcast-interval'] ?? '5000', 10);

// ---------------------------------------------------------------------------
// URL 취득 (argv 우선, 없으면 stdin 한 줄)
// ---------------------------------------------------------------------------

async function resolveUrl() {
  if (args['url']) return args['url'].trim();

  if (!process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin });
    for await (const line of rl) {
      const trimmed = line.trim();
      if (trimmed) return trimmed;
    }
  }

  console.error('[오류] --url 인수 또는 stdin으로 서버 URL을 지정하세요.');
  console.error('  예시: node scripts/load-test-realtime-wall.mjs --url http://192.168.0.10:51234');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// URL 변환 유틸
// ---------------------------------------------------------------------------

function toWebSocketUrl(input) {
  try {
    const url = new URL(input);
    if (url.protocol === 'ws:' || url.protocol === 'wss:') return url.toString();
    if (url.protocol === 'http:')  { url.protocol = 'ws:';  return url.toString(); }
    if (url.protocol === 'https:') { url.protocol = 'wss:'; return url.toString(); }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 퍼센타일 계산
// ---------------------------------------------------------------------------

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ---------------------------------------------------------------------------
// 메인
// ---------------------------------------------------------------------------

async function main() {
  const rawUrl = await resolveUrl();
  const wsUrl  = toWebSocketUrl(rawUrl);
  if (!wsUrl) {
    console.error(`[오류] 유효하지 않은 URL: ${rawUrl}`);
    process.exit(1);
  }

  console.log(`\n[실시간 담벼락 부하 테스트]`);
  console.log(`  URL:       ${wsUrl}`);
  console.log(`  클라이언트: ${NUM_CLIENTS}개`);
  console.log(`  실행 시간:  ${DURATION_SEC}초`);
  console.log(`  Broadcast 간격: ${BROADCAST_INTERVAL}ms\n`);

  const rssBefore = process.memoryUsage().rss;
  const latencies = [];   // join → wall-state 수신 latency (ms)
  let connectedCount = 0;
  let errorCount     = 0;
  let messageCount   = 0;

  // ---------------------------------------------------------------------------
  // 클라이언트 spawn
  // ---------------------------------------------------------------------------

  const sockets = [];

  for (let i = 0; i < NUM_CLIENTS; i++) {
    const ws = new WebSocket(wsUrl);
    const joinedAt = Date.now();
    let joined = false;

    ws.once('open', () => {
      connectedCount++;
      const token = `load-test-client-${i}-${Date.now().toString(36)}`;
      ws.send(JSON.stringify({ type: 'join', sessionToken: token }));
    });

    ws.on('message', (data) => {
      messageCount++;
      try {
        const parsed = JSON.parse(data.toString('utf-8'));
        if (parsed?.type === 'wall-state' && !joined) {
          joined = true;
          latencies.push(Date.now() - joinedAt);
        }
      } catch {
        // noop
      }
    });

    ws.once('error', () => {
      errorCount++;
    });

    sockets.push(ws);

    // 스파이크 방지: 5ms 간격으로 순차 연결
    if (i % 10 === 9) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  console.log(`[+] ${NUM_CLIENTS}개 클라이언트 spawn 완료. 연결 대기 중...`);

  // 최초 연결 완료 대기 (최대 10초)
  await new Promise((r) => setTimeout(r, Math.min(10000, NUM_CLIENTS * 50)));

  console.log(`[+] 연결 완료: ${connectedCount}/${NUM_CLIENTS} (오류: ${errorCount})\n`);

  // ---------------------------------------------------------------------------
  // 주기적 broadcast 시뮬레이션 (교사 역할)
  // — 실제 앱이 이미 broadcast하고 있으므로 이 부분은 선택적으로 생략 가능.
  // — 앱이 broadcast하지 않는 경우를 위해 클라이언트 1번이 임의 wall-state를 서버에 보낼 수 없으므로,
  //   latency 측정은 join 직후 캐시된 wall-state 수신 기준으로만 한다.
  // ---------------------------------------------------------------------------

  const broadcastTimer = setInterval(() => {
    // 서버에 직접 inject할 수 없으므로 log만 출력 (broadcast 는 교사 앱이 담당)
    if (process.stdout.isTTY) {
      process.stdout.write(`\r[진행 중] 메시지 수신: ${messageCount}  연결: ${connectedCount}  오류: ${errorCount}   `);
    }
  }, BROADCAST_INTERVAL);

  // ---------------------------------------------------------------------------
  // DURATION_SEC 동안 대기
  // ---------------------------------------------------------------------------

  await new Promise((r) => setTimeout(r, DURATION_SEC * 1000));
  clearInterval(broadcastTimer);

  // 종료 처리
  for (const ws of sockets) {
    try {
      ws.terminate();
    } catch {
      // noop
    }
  }

  const rssAfter  = process.memoryUsage().rss;
  const rssDeltaMB = ((rssAfter - rssBefore) / 1024 / 1024).toFixed(1);

  // ---------------------------------------------------------------------------
  // 결과 출력
  // ---------------------------------------------------------------------------

  const sorted = [...latencies].sort((a, b) => a - b);
  const p50  = percentile(sorted, 50);
  const p95  = percentile(sorted, 95);
  const p99  = percentile(sorted, 99);
  const avg  = latencies.length > 0
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : 0;

  console.log('\n\n========================================');
  console.log('  부하 테스트 결과');
  console.log('========================================');
  console.log(`  클라이언트:         ${NUM_CLIENTS}개`);
  console.log(`  연결 성공:          ${connectedCount}개`);
  console.log(`  연결 오류:          ${errorCount}개`);
  console.log(`  wall-state 수신:    ${latencies.length}개`);
  console.log(`  전체 메시지 수신:   ${messageCount}건`);
  console.log('----------------------------------------');
  console.log(`  latency 평균:  ${avg}ms`);
  console.log(`  latency p50:   ${p50}ms`);
  console.log(`  latency p95:   ${p95}ms  ${p95 < 200 ? '✓ PASS (< 200ms)' : '✗ FAIL (>= 200ms)'}`);
  console.log(`  latency p99:   ${p99}ms`);
  console.log('----------------------------------------');
  console.log(`  RSS 메모리 시작:    ${(rssBefore / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  RSS 메모리 종료:    ${(rssAfter  / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  RSS 증가량:         ${rssDeltaMB} MB`);
  console.log('========================================\n');

  if (p95 >= 200) {
    console.error('[경고] p95 latency가 200ms 기준을 초과했습니다. 서버 성능을 점검하세요.');
    process.exit(1);
  }

  console.log('[완료] 모든 기준을 충족했습니다.');
}

main().catch((err) => {
  console.error('[치명적 오류]', err);
  process.exit(1);
});
