/**
 * 쌤핀 AI — 중계 함수 (Phase 2)
 *
 * 앱이 AI 공급자를 직접 부르지 않는 이유: **키를 앱에 넣으면 누구나 꺼내 간다.**
 * Electron asar 는 압축만 풀면 코드가 보이고, 암호화해도 복호화 키가 동봉된다.
 *
 * ★이 서버가 하지 않는 일: **데이터 조회.**
 * 조회는 전부 선생님 컴퓨터 안에서 끝나고, 서버는 **이미 집계된 숫자**를 받아
 * 모델에 전달할 뿐이다. 그래서 서버에는 학생 데이터가 흐르지 않는다.
 *
 * ★이 서버는 앱을 믿지 않는다.
 * 검증 로직은 `_shared/assistRequest.ts` 에 순수 함수로 분리해 두었다
 * (그래야 CI 에서 테스트가 돈다 — `supabase/functions/**` 는 vitest include 밖이다).
 *
 * 설계: docs/01-plan/features/in-app-chatbot-zen.plan.md §6.6 / §6.6.1~3 · §8.1
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import {
  corsHeaders,
  errorResponse,
  internalErrorResponse,
  jsonResponse,
} from '../_shared/cors.ts';
import { checkRateLimit, clientIpFrom } from '../_shared/rateLimit.ts';
import {
  AssistLlmError,
  AssistLlmNotConfiguredError,
  callAssist,
  streamAssist,
  type AssistTurn,
} from '../_shared/assistLlm.ts';
import {
  ASSIST_SYSTEM_PROMPT,
  buildToolResultsTurn,
  validateAssistRequest,
  type ValidatedAssistRequest,
} from '../_shared/assistRequest.ts';

const MAX_OUTPUT_TOKENS = 800;
const TIMEOUT_MS = 30_000;

/**
 * 전역 일일 상한 — **오너가 정한 지출 브레이크**(ADR-061 결정 3).
 *
 * 금액이 아니라 요청 수로 거는 이유: 왕복 1건 비용이 실측으로 고정돼 있어
 * (정가 $0.000281, 캐시 적중 시 그 이하) **요청 수 상한이 곧 금액 상한**이다.
 * 예: 월 $10 상한 → 하루 약 1,200건.
 *
 * 도달해도 **오류가 아니다.** 앱은 숫자 카드를 그대로 보여 주고 AI 해설만 쉰다(§8.3).
 */
function dailyGlobalLimit(): number {
  const raw = Number(Deno.env.get('ASSIST_DAILY_GLOBAL_LIMIT'));
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 2_000;
}

/** 축소 응답 — 오류가 아니라 200 이다. 앱이 숫자 카드를 유지할 수 있게 한다(P5). */
function degradedResponse(reason: 'budget' | 'unavailable' | 'upstream'): Response {
  return jsonResponse({ text: '', toolCalls: [], usage: { in: 0, out: 0 }, degraded: reason }, 200);
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('지원하지 않는 요청입니다', 405);
  }

  let validated: ValidatedAssistRequest;
  try {
    const parsed = validateAssistRequest(await req.json());
    if ('error' in parsed) {
      if (parsed.logKind) {
        // 앱의 그물이 막았어야 하는 것이 여기까지 왔다는 신호. **값은 남기지 않는다.**
        console.error(`[assist] 서버 관문 발동: ${parsed.logKind}`);
      }
      return errorResponse(parsed.error, 400);
    }
    validated = parsed.ok;
  } catch (err) {
    return internalErrorResponse('assist:parse', err, '요청을 읽지 못했습니다', 400);
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // 상한 3중: IP / 설치 / 전역
    const limited = await checkRateLimit(supabase, 'assist', [
      { identifier: clientIpFrom(req), windowMs: 60_000, max: 6 },
      { identifier: validated.installId, windowMs: 86_400_000, max: 40 },
      { identifier: 'global', windowMs: 86_400_000, max: dailyGlobalLimit() },
    ]);
    if (limited) return degradedResponse('budget');

    const turns: AssistTurn[] = [
      { role: 'system', content: ASSIST_SYSTEM_PROMPT },
      ...validated.turns,
    ];
    const resultsTurn = buildToolResultsTurn(validated.toolResults);
    if (resultsTurn) turns.push(resultsTurn);

    const options = {
      turns,
      tools: validated.tools,
      temperature: 0.3,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      reasoning: 'minimal' as const,
      timeoutMs: TIMEOUT_MS,
      stage: 'answer',
    };

    if (validated.stream) {
      const body = await streamAssist(options);
      return new Response(body, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    const completion = await callAssist(options);
    return jsonResponse({
      text: completion.text,
      toolCalls: completion.toolCalls,
      usage: completion.usage,
      degraded: null,
    });
  } catch (err) {
    if (err instanceof AssistLlmNotConfiguredError) {
      // 키 미설정은 배포 실수다. 사용자에게는 축소로 보이게 하고 로그로 알린다.
      console.error('[assist] ASSIST_UPSTAGE_API_KEY 미설정');
      return degradedResponse('unavailable');
    }
    if (err instanceof AssistLlmError) {
      // ★5xx 를 그대로 올리지 않는다. 앱이 숫자 카드 폴백을 할 수 있게 구조화해서 내린다(P5).
      return degradedResponse('upstream');
    }
    return internalErrorResponse('assist', err);
  }
});
