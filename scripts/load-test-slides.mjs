#!/usr/bin/env node
/**
 * Interactive Slides 부하 테스트 — Plan §3 SLO 검증.
 *
 * 측정:
 *   1) join 지연: WS open → session-joined 응답 (P95 < 500ms 권장)
 *   2) slide-changed 팬아웃 spread: 한 broadcast가 40명 모두 도착하기까지의
 *      max-min latency (P95 < 500ms 목표)
 *   3) overlay-activated 팬아웃 spread (P95 < 500ms 목표)
 *   4) overlay-response burst: 40명 동시 응답 → response-accepted ack RTT
 *      (P95 < 300ms, 0% 유실, sum=40 목표)
 *
 * 사용 방법 (수동 실행):
 *   1. 앱을 실행: `npm run electron:dev`
 *   2. Interactive Slides 도구에서 수업을 시작 → 로비에서 LAN URL 확인
 *   3. 별도 터미널:
 *      node scripts/load-test-slides.mjs --url http://192.168.0.x:PORT --code ABCDE
 *      (또는 stdin: `echo "http://192.168.0.x:PORT|ABCDE" | node ...`)
 *   4. 교사가 수업을 시작(beginPresentation) 후, 슬라이드 advance / overlay activate
 *      / deactivate 를 수동 실행. 스크립트는 broadcast가 도달할 때마다 stats를 출력.
 *
 * 옵션:
 *   --url <URL>          서버 URL (기본: stdin에서 읽기)
 *   --code <SHORTCODE>   참여 코드 (5자, 대문자)
 *   --clients <N>        동시 학생 수 (기본: 40)
 *   --duration <sec>     실행 시간 (기본: 600 = 10분)
 *   --no-respond         overlay 활성화 시 자동 응답을 비활성 (관찰만)
 */

import { WebSocket } from 'ws';
import { parseArgs } from 'node:util';
import * as readline from 'node:readline';
import * as crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// 인수 파싱
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    url: { type: 'string' },
    code: { type: 'string' },
    clients: { type: 'string', default: '40' },
    duration: { type: 'string', default: '600' },
    'no-respond': { type: 'boolean', default: false },
  },
  allowPositionals: true,
  strict: false,
});

const NUM_CLIENTS = parseInt(args['clients'] ?? '40', 10);
const DURATION_SEC = parseInt(args['duration'] ?? '600', 10);
const SHOULD_RESPOND = !args['no-respond'];

// ---------------------------------------------------------------------------
// URL + sessionCode 취득
// ---------------------------------------------------------------------------

async function resolveConfig() {
  let url = args['url']?.trim() ?? null;
  let code = args['code']?.trim() ?? null;

  if (!url || !code) {
    if (!process.stdin.isTTY) {
      const rl = readline.createInterface({ input: process.stdin });
      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // "URL|CODE" 또는 "URL CODE"
        const parts = trimmed.split(/[\s|]+/);
        if (parts.length >= 2) {
          url ??= parts[0];
          code ??= parts[1];
          break;
        }
      }
    }
  }

  if (!url || !code) {
    console.error('[오류] --url + --code 인수 또는 stdin "URL|CODE"를 지정하세요.');
    console.error('  예시: node scripts/load-test-slides.mjs --url http://192.168.0.10:51234 --code ABCDE');
    process.exit(1);
  }
  return { url, code: code.toUpperCase() };
}

function toWebSocketUrl(input) {
  try {
    const url = new URL(input);
    if (url.protocol === 'ws:' || url.protocol === 'wss:') return url.toString();
    if (url.protocol === 'http:') {
      url.protocol = 'ws:';
      return url.toString();
    }
    if (url.protocol === 'https:') {
      url.protocol = 'wss:';
      return url.toString();
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 통계
// ---------------------------------------------------------------------------

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function summarize(label, samples) {
  if (samples.length === 0) {
    return `${label}: (no samples)`;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const min = sorted[0];
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const p99 = percentile(sorted, 99);
  const max = sorted[sorted.length - 1];
  const avg = samples.reduce((s, v) => s + v, 0) / samples.length;
  return (
    `${label}: n=${samples.length} ` +
    `min=${min}ms avg=${avg.toFixed(0)}ms ` +
    `p50=${p50}ms p95=${p95}ms p99=${p99}ms max=${max}ms`
  );
}

// ---------------------------------------------------------------------------
// 학생 클라이언트
// ---------------------------------------------------------------------------

class StudentClient {
  constructor(idx, wsUrl, sessionCode) {
    this.idx = idx;
    this.studentName = `부하학생${String(idx + 1).padStart(2, '0')}`;
    this.ws = new WebSocket(wsUrl);
    this.sessionCode = sessionCode;
    this.studentToken = null;
    this.joinSentAt = 0;
    this.joinedAt = 0;
    this.pendingResponses = new Map(); // clientResponseId → sentAt
    this.metrics = {
      joinLatency: null, // ms
      slideArrivals: [], // { slideIndex, t }
      overlayArrivals: [], // { overlayId, t }
      responseAckLatencies: [], // ms (per ack)
      droppedResponses: 0,
    };
  }

  attach(onSlide, onOverlay) {
    this.ws.on('open', () => {
      this.joinSentAt = Date.now();
      this.ws.send(
        JSON.stringify({
          type: 'join-session',
          sessionCode: this.sessionCode,
          studentName: this.studentName,
        }),
      );
    });

    this.ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString('utf-8'));
      } catch {
        return;
      }
      const now = Date.now();

      switch (msg?.type) {
        case 'session-joined': {
          this.joinedAt = now;
          this.studentToken = msg.studentToken ?? null;
          this.metrics.joinLatency = now - this.joinSentAt;
          break;
        }
        case 'slide-changed': {
          this.metrics.slideArrivals.push({
            slideIndex: msg.slideIndex,
            t: now,
          });
          onSlide?.(this, msg, now);
          break;
        }
        case 'overlay-activated': {
          this.metrics.overlayArrivals.push({ overlayId: msg.overlayId, t: now });
          onOverlay?.(this, msg, now);
          break;
        }
        case 'response-accepted': {
          const sentAt = this.pendingResponses.get(msg.clientResponseId);
          if (sentAt != null) {
            this.metrics.responseAckLatencies.push(now - sentAt);
            this.pendingResponses.delete(msg.clientResponseId);
          }
          break;
        }
        case 'lesson-ended':
        case 'error':
          // 종료 / 오류 — 무시 (집계는 유지)
          break;
      }
    });

    this.ws.on('error', () => {});
    this.ws.on('close', () => {});
  }

  sendOverlayResponse(overlayId, data) {
    if (!this.studentToken) return;
    const clientResponseId = crypto.randomUUID();
    const msg = {
      type: 'overlay-response',
      sessionCode: this.sessionCode,
      overlayId,
      studentToken: this.studentToken,
      clientResponseId,
      data,
    };
    this.pendingResponses.set(clientResponseId, Date.now());
    try {
      this.ws.send(JSON.stringify(msg));
    } catch {
      this.metrics.droppedResponses++;
      this.pendingResponses.delete(clientResponseId);
    }
  }

  close() {
    try {
      this.ws.terminate();
    } catch {
      // noop
    }
  }
}

function buildAutoResponse(config) {
  switch (config?.type) {
    case 'poll': {
      const optId = config.options?.[0]?.id ?? 'opt-1';
      return { type: 'poll', optionIds: [optId] };
    }
    case 'text':
      return { type: 'text', text: '부하 테스트 응답' };
    case 'wordcloud':
      return { type: 'wordcloud', words: ['load', 'test'] };
    case 'draw':
      // 빈 strokes (서버는 형태만 검증)
      return { type: 'draw', strokes: [] };
    case 'draggable':
      return { type: 'draggable', placements: [] };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// 메인
// ---------------------------------------------------------------------------

async function main() {
  const cfg = await resolveConfig();
  const wsUrl = toWebSocketUrl(cfg.url);
  if (!wsUrl) {
    console.error(`[오류] 유효하지 않은 URL: ${cfg.url}`);
    process.exit(1);
  }

  console.log(`\n[Interactive Slides 부하 테스트]`);
  console.log(`  URL:        ${wsUrl}`);
  console.log(`  ShortCode:  ${cfg.code}`);
  console.log(`  Clients:    ${NUM_CLIENTS}`);
  console.log(`  Duration:   ${DURATION_SEC}s`);
  console.log(`  AutoRespond: ${SHOULD_RESPOND ? 'on' : 'off'}\n`);

  const rssBefore = process.memoryUsage().rss;
  const clients = [];

  // 슬라이드 변경 / 오버레이 활성화 fan-out spread 측정용 버퍼
  const slideEvents = new Map(); // slideIndex → arrival timestamps[]
  const overlayEvents = new Map(); // overlayId → arrival timestamps[]

  const onSlide = (client, msg, t) => {
    const arr = slideEvents.get(msg.slideIndex) ?? [];
    arr.push(t);
    slideEvents.set(msg.slideIndex, arr);
  };
  const onOverlay = (client, msg, t) => {
    const arr = overlayEvents.get(msg.overlayId) ?? [];
    arr.push(t);
    overlayEvents.set(msg.overlayId, arr);
    if (SHOULD_RESPOND) {
      const data = buildAutoResponse(msg.config);
      if (data) {
        // 0~200ms 랜덤 지터 — 학생 입력 시뮬레이션
        const jitter = Math.floor(Math.random() * 200);
        setTimeout(
          () => client.sendOverlayResponse(msg.overlayId, data),
          jitter,
        );
      }
    }
  };

  // ---------------------------------------------------------------------------
  // 클라이언트 spawn (5ms 간격으로 ramp-up)
  // ---------------------------------------------------------------------------
  for (let i = 0; i < NUM_CLIENTS; i++) {
    const c = new StudentClient(i, wsUrl, cfg.code);
    c.attach(onSlide, onOverlay);
    clients.push(c);
    if (i % 8 === 7) {
      await new Promise((r) => setTimeout(r, 40));
    }
  }

  console.log(`[+] ${NUM_CLIENTS}명 spawn 완료. 입장 대기 중...`);

  // 입장 완료 대기 (최대 15초)
  await new Promise((r) =>
    setTimeout(r, Math.min(15_000, NUM_CLIENTS * 200)),
  );
  const joined = clients.filter((c) => c.metrics.joinLatency != null).length;
  console.log(`[+] 입장 완료: ${joined}/${NUM_CLIENTS}`);

  // 5초마다 stats 출력
  const reportTimer = setInterval(() => {
    const slideTotal = [...slideEvents.values()].reduce(
      (s, arr) => s + arr.length,
      0,
    );
    const overlayTotal = [...overlayEvents.values()].reduce(
      (s, arr) => s + arr.length,
      0,
    );
    if (process.stdout.isTTY) {
      process.stdout.write(
        `\r[진행 중] slide arrivals=${slideTotal}  overlay arrivals=${overlayTotal}  events: ${slideEvents.size} slides / ${overlayEvents.size} overlays   `,
      );
    }
  }, 5_000);

  await new Promise((r) => setTimeout(r, DURATION_SEC * 1000));
  clearInterval(reportTimer);
  if (process.stdout.isTTY) process.stdout.write('\n');

  // ---------------------------------------------------------------------------
  // 통계 집계
  // ---------------------------------------------------------------------------
  const joinLatencies = clients
    .map((c) => c.metrics.joinLatency)
    .filter((v) => v != null);

  const slideSpreads = [...slideEvents.entries()]
    .filter(([, arr]) => arr.length >= 2)
    .map(([slideIndex, arr]) => {
      const sorted = [...arr].sort((a, b) => a - b);
      const spread = sorted[sorted.length - 1] - sorted[0];
      return { slideIndex, count: arr.length, spread };
    });

  const overlaySpreads = [...overlayEvents.entries()]
    .filter(([, arr]) => arr.length >= 2)
    .map(([overlayId, arr]) => {
      const sorted = [...arr].sort((a, b) => a - b);
      const spread = sorted[sorted.length - 1] - sorted[0];
      return { overlayId, count: arr.length, spread };
    });

  const allRespAcks = clients.flatMap((c) => c.metrics.responseAckLatencies);
  const totalDropped = clients.reduce(
    (s, c) => s + c.metrics.droppedResponses,
    0,
  );
  const totalSentResponses = clients.reduce(
    (s, c) => s + c.metrics.responseAckLatencies.length,
    0,
  );
  const totalPending = clients.reduce(
    (s, c) => s + c.pendingResponses.size,
    0,
  );

  // ---------------------------------------------------------------------------
  // 종료
  // ---------------------------------------------------------------------------
  for (const c of clients) c.close();

  const rssAfter = process.memoryUsage().rss;
  const rssDelta = ((rssAfter - rssBefore) / 1024 / 1024).toFixed(1);

  // ---------------------------------------------------------------------------
  // 리포트
  // ---------------------------------------------------------------------------
  console.log('\n=== 결과 ===');
  console.log(summarize('1) join 지연', joinLatencies));

  if (slideSpreads.length > 0) {
    console.log(
      summarize(
        '2) slide-changed fan-out spread',
        slideSpreads.map((e) => e.spread),
      ),
    );
    console.log(
      `   ↳ 이벤트: ${slideSpreads.length}개, 평균 도달 클라이언트: ${(
        slideSpreads.reduce((s, e) => s + e.count, 0) / slideSpreads.length
      ).toFixed(1)}/${NUM_CLIENTS}`,
    );
  } else {
    console.log('2) slide-changed: (이벤트 없음 — 교사가 슬라이드 advance 안 함)');
  }

  if (overlaySpreads.length > 0) {
    console.log(
      summarize(
        '3) overlay-activated fan-out spread',
        overlaySpreads.map((e) => e.spread),
      ),
    );
    console.log(
      `   ↳ 이벤트: ${overlaySpreads.length}개, 평균 도달 클라이언트: ${(
        overlaySpreads.reduce((s, e) => s + e.count, 0) / overlaySpreads.length
      ).toFixed(1)}/${NUM_CLIENTS}`,
    );
  } else {
    console.log('3) overlay-activated: (이벤트 없음 — 교사가 overlay 활성 안 함)');
  }

  if (allRespAcks.length > 0) {
    console.log(summarize('4) overlay-response ack RTT', allRespAcks));
    console.log(
      `   ↳ ack 수신: ${totalSentResponses}, 누락(timeout): ${totalPending}, 송신 실패: ${totalDropped}`,
    );
  } else {
    console.log('4) overlay-response: (응답 없음)');
  }

  console.log(`\nRSS 변화: ${rssDelta}MB (before=${(rssBefore / 1024 / 1024).toFixed(1)}MB → after=${(rssAfter / 1024 / 1024).toFixed(1)}MB)`);

  // SLO 판정 (Plan §3)
  const sloFails = [];
  const slidePss = slideSpreads.map((e) => e.spread).sort((a, b) => a - b);
  const overlayPss = overlaySpreads.map((e) => e.spread).sort((a, b) => a - b);
  const ackPss = [...allRespAcks].sort((a, b) => a - b);
  if (slidePss.length > 0 && percentile(slidePss, 95) > 500) {
    sloFails.push(`slide fan-out P95 ${percentile(slidePss, 95)}ms > 500ms`);
  }
  if (overlayPss.length > 0 && percentile(overlayPss, 95) > 500) {
    sloFails.push(`overlay fan-out P95 ${percentile(overlayPss, 95)}ms > 500ms`);
  }
  if (ackPss.length > 0 && percentile(ackPss, 95) > 300) {
    sloFails.push(`response ack P95 ${percentile(ackPss, 95)}ms > 300ms`);
  }
  if (totalDropped > 0) sloFails.push(`송신 실패 ${totalDropped}건 > 0`);

  if (sloFails.length > 0) {
    console.log('\n⚠ SLO 위반:');
    sloFails.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  } else {
    console.log('\n✓ 측정된 모든 SLO 통과 (또는 측정 데이터 부족).');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('[치명적 오류]', err);
  process.exit(1);
});
