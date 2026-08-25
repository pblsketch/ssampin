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
  AssistPromptNotConfiguredError,
  buildAssistSystemPrompt,
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
// 'busy'(분당 한도)가 빠져 있었다. 실제로는 108행에서 계속 넘기고 있었고 앱도 받는데
// (AssistPort.AssistDegraded), 이 파일이 타입 검사를 한 번도 안 거쳐 드러나지 않았다.
function degradedResponse(reason: 'budget' | 'busy' | 'unavailable' | 'upstream'): Response {
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

    // 상한 4중: 분당(설치·IP) / 일(설치) / 일(전역)
    //
    // ★분당 상한을 IP 로만 걸면 안 된다 (2026-08-24 UltraQA) — 한국 학교는 공인 IP
    //   하나 뒤에 전 교직원이 있어(NAT), 한 학교에서 두 분이 1분에 두 번씩 물으면
    //   세 번째 선생님부터 전부 막혔다. 분당은 설치 단위로 걸고, IP 상한은 설치 id 를
    //   지어내는 남용을 막는 뒷선으로 크게 남긴다.
    // ★식별자에 min:/minip: 접두사를 붙인다 — 이 테이블은 (identifier, endpoint) 로만
    //   세므로, 같은 installId 를 분당·일간 두 규칙에 그대로 쓰면 요청 1건이 2건으로
    //   기록돼 일 상한이 반토막 난다.
    // ★분당(busy)과 일/전역(budget)을 따로 검사한다 — 사유가 다르면 화면 안내도 다르다.
    //   "1분 뒤 다시"면 되는 상황에 "이번 달 사용량을 다 썼다"고 말하면 안 된다.
    const minuteLimited = await checkRateLimit(supabase, 'assist', [
      { identifier: `min:${validated.installId}`, windowMs: 60_000, max: 6 },
      { identifier: `minip:${clientIpFrom(req)}`, windowMs: 60_000, max: 60 },
    ]);
    if (minuteLimited) return degradedResponse('busy');
    const dailyLimited = await checkRateLimit(supabase, 'assist', [
      // ★40 → 100 (2026-08-25). 40 은 "하루 40번 물어보면 충분하다"는 가정이었는데,
      //   질문 1건이 왕복 2~3건이라 체감 13~20번이었다. 실제로 오너가 하루 만에 다 썼다.
      //   왕복 1건 $0.000281 이라 100 회를 다 써도 한 사람당 하루 3센트다. 지출은 아래
      //   전역 상한(dailyGlobalLimit)이 막으므로, 이 값은 "한 사람이 전체 예산을 혼자
      //   태우지 못하게" 나누는 몫으로만 본다.
      { identifier: validated.installId, windowMs: 86_400_000, max: 100 },
      { identifier: 'global', windowMs: 86_400_000, max: dailyGlobalLimit() },
    ]);
    if (dailyLimited) return degradedResponse('budget');

    const turns: AssistTurn[] = [
      // 한국 학교 기준(Asia/Seoul)의 오늘. 엣지 서버 시계는 UTC 라 그대로 쓰면
      // 자정~오전 9시 사이에 하루 어긋난다. en-CA 로캘은 YYYY-MM-DD 꼴을 준다.
      {
        role: 'system',
        // 프롬프트 본문은 저장소가 아니라 서버 시크릿에 있다(ADR-072 결정 1).
        // 미설정이면 buildAssistSystemPrompt 가 throw 하고, 아래 catch 가 '축소'로 내린다.
        content: buildAssistSystemPrompt(
          Deno.env.get('ASSIST_SYSTEM_PROMPT') ?? '',
          new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()) +
            ' (' +
            new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'short' }).format(
              new Date(),
            ) +
            ')',
        ),
      },
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
    if (err instanceof AssistPromptNotConfiguredError) {
      // 프롬프트 미설정도 배포 실수다(시크릿을 안 넣고 배포). 키 미설정과 같게 다룬다 —
      // 빈 프롬프트로 답하게 두면 모델이 안전 지시 없이 말한다.
      console.error('[assist] ASSIST_SYSTEM_PROMPT 미설정');
      return degradedResponse('unavailable');
    }
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
