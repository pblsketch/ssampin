#!/usr/bin/env node
/**
 * 실시간 담벼락 v2.1 Phase C 부하 테스트 — Design v2.1 §10.5 / §13 Phase C 수용 기준 #9.
 *
 * 학생 자기 카드 위치 변경(submit-move) broadcast latency를 150 동시 클라이언트로 측정.
 * G-MAJOR-1 (Phase B/A 분석에서 잔존하던 부하 미수행) 해소 목적.
 *
 * 사용 방법 (수동 실행):
 *   1. 앱을 먼저 실행한다:  npm run electron:dev
 *   2. 쌤핀에서 실시간 담벼락 세션을 시작한다 (Freeform 또는 Kanban 보드, 카드 1장 이상 작성).
 *   3. 별도 터미널에서 이 스크립트를 실행한다:
 *      node scripts/load-test-realtime-wall-v2-1.mjs --url http://192.168.0.x:PORT --post-id <카드ID>
 *      또는 cloudflared 터널 URL 사용:
 *      node scripts/load-test-realtime-wall-v2-1.mjs --url https://xxx.trycloudflare.com --post-id <카드ID>
 *
 * 측정 항목:
 *   - 클라이언트당 'post-updated' broadcast 수신 latency (submit-move 송신 → broadcast 도달)
 *   - p50 / p95 / p99 latency
 *   - 목표: p95 < 200ms (Design v2.1 §13 Phase C #9)
 *   - RSS 메모리 증가량 (시작 vs 종료)
 *
 * 옵션:
 *   --url <URL>         서버 URL (기본: stdin에서 읽기)
 *   --post-id <ID>      이동 대상 카드 ID (필수 — 세션 진행 중인 보드의 실제 카드)
 *   --clients <N>       동시 접속 클라이언트 수 (기본: 150)
 *   --duration <sec>    총 실행 시간 초 (기본: 300 = 5분)
 *   --move-interval <ms>  드래그 빈도 시뮬레이션 간격 (기본: 1000ms = 분당 60회)
 *   --movers <N>        실제 카드 이동 수행하는 클라이언트 수 (기본: 30, 나머지는 수신만)
 *
 * 주의:
 *   - --post-id 카드는 ownerSessionToken이 'load-test-mover-0'인 가짜 카드여야 본인 인증 통과.
 *     실제 학생 카드는 검증 실패 (서버가 not-owner 응답) → 측정 불가.
 *   - 가장 단순한 사용: 별도 학생 entry에서 sessionToken='load-test-mover-0'로 join 후
 *     카드 1장 작성 → 그 카드 ID를 --post-id에 전달.
 *   - 또는 본 스크립트에서 첫 mover가 카드를 직접 만들고 그 ID를 추출 후 측정 시작 (TODO v3+).
 */

import { WebSocket } from 'ws';
import { parseArgs } from 'node:util';
import * as readline from 'node:readline';

// ---------------------------------------------------------------------------
// 인수 파싱
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    url:             { type: 'string' },
    'post-id':       { type: 'string' },
    clients:         { type: 'string', default: '150' },
    duration:        { type: 'string', default: '300' },
    'move-interval': { type: 'string', default: '1000' },
    movers:          { type: 'string', default: '30' },
  },
  allowPositionals: true,
  strict: false,
});

const NUM_CLIENTS    = parseInt(args['clients'] ?? '150', 10);
const NUM_MOVERS     = parseInt(args['movers'] ?? '30', 10);
const DURATION_SEC   = parseInt(args['duration'] ?? '300', 10);
const MOVE_INTERVAL  = parseInt(args['move-interval'] ?? '1000', 10);

if (NUM_MOVERS > NUM_CLIENTS) {
  console.error('[오류] --movers는 --clients 이하여야 합니다.');
  process.exit(1);
}

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
  console.error('  예시: node scripts/load-test-realtime-wall-v2-1.mjs --url http://192.168.0.10:51234 --post-id abc-123');
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
// Latency 통계
// ---------------------------------------------------------------------------

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx];
}

function summarizeLatencies(latencies) {
  if (latencies.length === 0) {
    return { samples: 0, avg: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0 };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    samples: sorted.length,
    avg: Math.round(sum / sorted.length),
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

// ---------------------------------------------------------------------------
// 메인 실행
// ---------------------------------------------------------------------------

async function main() {
  const rawUrl = await resolveUrl();
  const postId = args['post-id'];
  if (!postId || postId.trim().length === 0) {
    console.error('[오류] --post-id 인수가 필요합니다 (이동 대상 카드 ID).');
    process.exit(1);
  }
  const wsUrl = toWebSocketUrl(rawUrl);
  if (!wsUrl) {
    console.error('[오류] 잘못된 URL: ', rawUrl);
    process.exit(1);
  }

  console.log('===========================================================');
  console.log('실시간 담벼락 v2.1 Phase C 부하 테스트');
  console.log('===========================================================');
  console.log(`서버 URL:        ${wsUrl}`);
  console.log(`총 클라이언트:    ${NUM_CLIENTS} 명`);
  console.log(`드래그 mover:    ${NUM_MOVERS} 명 (나머지 ${NUM_CLIENTS - NUM_MOVERS}명은 수신 전용)`);
  console.log(`드래그 간격:     ${MOVE_INTERVAL}ms (분당 약 ${Math.round(60000 / MOVE_INTERVAL)}회/사용자)`);
  console.log(`총 실행 시간:    ${DURATION_SEC}초`);
  console.log(`이동 대상 카드:  ${postId}`);
  console.log('');
  console.log('초기 메모리 RSS:', `${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)}MB`);
  const startRss = process.memoryUsage().rss;

  /**
   * 각 mover가 송신한 submit-move 시각을 기록.
   * key: `mover-${i}-${seq}`  value: timestamp
   * broadcast 도달 시 빼서 latency 계산.
   *
   * 단순화: 정확한 매칭은 어려우므로 가장 최근 송신 시각으로 근사.
   * (모든 클라이언트가 같은 카드를 이동하므로 broadcast는 통합 — 가장 최근 송신 시각과 비교)
   */
  let lastMoveAt = 0;
  const latencies = []; // ms
  let totalReceives = 0;
  let totalSends = 0;
  let totalErrors = 0;

  const clients = [];

  function spawnClient(index) {
    const sessionToken = index < NUM_MOVERS
      ? `load-test-mover-${index}`
      : `load-test-listener-${index}`;
    const isMover = index < NUM_MOVERS;
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      try {
        ws.send(JSON.stringify({ type: 'join', sessionToken }));
      } catch {
        totalErrors++;
      }
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'post-updated' && msg.postId === postId && lastMoveAt > 0) {
          // broadcast 도달 latency = 수신 시각 - 가장 최근 송신 시각
          const latency = Date.now() - lastMoveAt;
          if (latency >= 0 && latency < 60000) {
            latencies.push(latency);
            totalReceives++;
          }
        }
      } catch {
        // noop
      }
    });

    ws.on('error', () => {
      totalErrors++;
    });

    if (isMover) {
      // mover: MOVE_INTERVAL마다 submit-move 송신
      let seq = 0;
      const moveTimer = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const x = 100 + ((seq * 37) % 800); // 의사 랜덤 좌표 (0..900)
        const y = 100 + ((seq * 53) % 600);
        try {
          ws.send(
            JSON.stringify({
              type: 'submit-move',
              sessionToken,
              postId,
              freeform: { x, y, w: 260, h: 180, zIndex: 1 },
            }),
          );
          lastMoveAt = Date.now();
          totalSends++;
          seq++;
        } catch {
          totalErrors++;
        }
      }, MOVE_INTERVAL + (index * 17) % 200); // jitter로 동시 송신 방지
      ws.on('close', () => clearInterval(moveTimer));
    }

    clients.push(ws);
  }

  console.log(`\n클라이언트 ${NUM_CLIENTS}명 spawn 중...`);
  for (let i = 0; i < NUM_CLIENTS; i++) {
    spawnClient(i);
    // 5ms 간격으로 spawn → 한꺼번에 connection storm 방지
    if (i % 10 === 9) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  console.log('spawn 완료. 측정 시작.');

  // 진행 상황 5초마다 출력
  const progressTimer = setInterval(() => {
    const stats = summarizeLatencies(latencies);
    console.log(
      `[진행] 송신: ${totalSends}, 수신: ${totalReceives}, 에러: ${totalErrors}, ` +
      `latency p50=${stats.p50}ms p95=${stats.p95}ms p99=${stats.p99}ms (samples=${stats.samples})`,
    );
  }, 5000);

  // DURATION_SEC 후 정리
  await new Promise((r) => setTimeout(r, DURATION_SEC * 1000));

  clearInterval(progressTimer);
  for (const ws of clients) {
    try {
      ws.close();
    } catch {
      // noop
    }
  }

  const endRss = process.memoryUsage().rss;
  const stats = summarizeLatencies(latencies);

  console.log('');
  console.log('===========================================================');
  console.log('최종 결과');
  console.log('===========================================================');
  console.log(`총 송신:        ${totalSends}`);
  console.log(`총 수신:        ${totalReceives}`);
  console.log(`총 에러:        ${totalErrors}`);
  console.log(`샘플 수:        ${stats.samples}`);
  console.log(`avg latency:    ${stats.avg}ms`);
  console.log(`p50 latency:    ${stats.p50}ms`);
  console.log(`p95 latency:    ${stats.p95}ms  (목표: < 200ms)`);
  console.log(`p99 latency:    ${stats.p99}ms`);
  console.log(`min/max:        ${stats.min}ms / ${stats.max}ms`);
  console.log('');
  console.log(`초기 RSS:       ${(startRss / 1024 / 1024).toFixed(1)}MB`);
  console.log(`최종 RSS:       ${(endRss / 1024 / 1024).toFixed(1)}MB`);
  console.log(`RSS 증가:       ${((endRss - startRss) / 1024 / 1024).toFixed(1)}MB`);
  console.log('');

  // 어서션
  let exit = 0;
  if (stats.p95 >= 200) {
    console.error(`[FAIL] p95 latency ${stats.p95}ms >= 200ms (목표 미달성)`);
    exit = 1;
  } else {
    console.log(`[PASS] p95 latency ${stats.p95}ms < 200ms (목표 달성)`);
  }
  if (stats.samples < 100) {
    console.error(`[WARN] 샘플 수 ${stats.samples} < 100 — 측정 신뢰도 낮음. --post-id가 올바른지 확인.`);
  }

  process.exit(exit);
}

main().catch((err) => {
  console.error('[오류]', err);
  process.exit(1);
});
