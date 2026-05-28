/**
 * Phase 2C Step 0 PoC artifact A0-3: cold-start baseline 측정 (PRD AC-0).
 *
 * 목적
 *   - 가벼운 헬스 체크 함수. invocation 마다 인스턴스가 "cold (방금 부팅)" 인지
 *     "warm (재사용)" 인지를 외부 caller 가 판별할 수 있도록 indicator 를 반환
 *   - pg_cron 또는 외부 cron 으로 7일간 일정 간격으로 호출 → Edge Function logs +
 *     이 함수의 응답을 모아 p95 cold / p50 warm latency baseline 확보
 *
 * 응답
 *   {
 *     ok, isCold, instanceAgeMs, invocationCount, t0Ms, denoVersion
 *   }
 *
 * 통과 기준
 *   - p95 cold ≤ 8s
 *   - p50 warm ≤ 500ms
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

// 인스턴스 lifetime 동안 유지되는 상태 — 첫 invocation 에서는 invocationCount === 0,
// 같은 인스턴스가 재사용되면 ++. 인스턴스가 새로 부팅됐다면 0 부터 시작 (= cold start).
const instanceBootAt = Date.now();
let invocationCount = 0;

serve((req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const now = Date.now();
  const instanceAgeMs = now - instanceBootAt;
  const isCold = invocationCount === 0;
  invocationCount += 1;

  const payload = {
    ok: true,
    isCold,
    instanceAgeMs,
    invocationCount,
    t0Ms: now,
    denoVersion: typeof Deno !== 'undefined' ? Deno.version?.deno : 'unknown',
    region: Deno.env.get('SB_REGION') ?? 'unknown',
    note: isCold
      ? 'cold start — module just loaded'
      : `warm reuse #${invocationCount}, instance ${(instanceAgeMs / 1000).toFixed(1)}s old`,
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
});
