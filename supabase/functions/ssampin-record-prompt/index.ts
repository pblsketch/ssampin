/**
 * 생기부 초안 1층 프롬프트 배급 — **본문은 저장소에 두지 않는다**(ADR-072 결정 1).
 *
 * 이 저장소는 공개다. 프롬프트를 코드에 적으면 그대로 읽히고, "서버에서 실행된다"와
 * "노출되지 않는다"는 다른 말이다. 그래서 본문은 서버 환경변수 `RECORD_PROMPT_L1` 이
 * 들고 있고, 이 함수는 **불러다 주기만** 한다(`ASSIST_SYSTEM_PROMPT` 와 같은 관례).
 *
 * ★왜 앱에 내장하지 않는가: "내 AI로 실행"은 선생님 PC 에서 CLI 를 돌리므로 프롬프트가
 * PC 까지 와야 한다. 설치파일에 넣으면 asar 를 풀기만 해도 읽힌다 — 그래서 실행 시점에
 * 받아 **메모리에만** 둔다(오너 결정 D7).
 *
 * ★클라이언트는 받은 본문을 디스크에 쓰지 않는다. 임시 파일이 필요하면 finally 에서 지운다.
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  internalErrorResponse,
} from '../_shared/cors.ts';

/** 프롬프트가 바뀌면 올린다. 클라이언트는 이 값으로 캐시를 무를지 정한다. */
const PROMPT_VERSION = 1;

/** 클라이언트가 메모리에 얼마나 들고 있어도 되는가. */
const TTL_SEC = 60 * 60;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('POST 만 허용합니다', 405);
  }

  try {
    // 설치 식별자는 형식만 확인한다 — 누구인지 알아내려는 값이 아니라,
    // 아무나 무한정 긁어 가지 않게 하는 최소한의 표식이다.
    const body = (await req.json().catch(() => ({}))) as { installId?: unknown };
    const installId = typeof body.installId === 'string' ? body.installId.trim() : '';
    if (installId.length < 8 || installId.length > 64) {
      return errorResponse('installId 가 필요합니다', 400);
    }

    const prompt = Deno.env.get('RECORD_PROMPT_L1');
    if (!prompt || prompt.trim().length === 0) {
      // 배포 실수 — 프롬프트 없이 초안을 만들면 규정을 못 지킨다. 그럴 바엔 멈춘다.
      return errorResponse('생기부 프롬프트가 설정되지 않았습니다', 503);
    }

    return jsonResponse({ prompt, version: PROMPT_VERSION, ttlSec: TTL_SEC });
  } catch (e) {
    return internalErrorResponse(e);
  }
});
