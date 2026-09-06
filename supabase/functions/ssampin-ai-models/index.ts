/**
 * "내 AI" 모델 목록 배급 — **새 모델이 나와도 앱을 새로 내지 않는다.**
 *
 * ★왜 서버에서 주는가(2026-09-05 실측):
 * 두 CLI 모두 **"쓸 수 있는 모델 목록"을 알려 주는 명령이 없다.**
 *  - claude: `--model` 도움말이 별칭만 안내하고, 없는 모델을 넣으면
 *    "이 버전의 model catalog 에 없다"고만 한다(목록은 안 준다).
 *  - codex: `-m` 만 있고 목록 명령이 없다. 없는 모델은 서버가 400 으로 거절한다.
 * 그래서 앱에 적어 두면 새 모델이 나올 때마다 배포해야 한다 → 서버가 준다.
 *
 * ★claude 는 **별칭을 쓴다**(`opus`·`sonnet`·`haiku`·`fable`). 별칭은 그 계열의 최신을
 * 가리키므로(도움말 원문: "an alias for the latest model"), 계열 안에서 새 모델이 나오면
 * 목록을 안 고쳐도 자동으로 따라간다. 이 함수가 필요한 건 **계열 자체가 새로 생길 때**다.
 * 실측(2026-09-05): fable→claude-fable-5-1 · opus→claude-opus-5 · sonnet→claude-sonnet-5 ·
 * haiku→claude-haiku-4-5-20251001.
 *
 * ★목록을 못 받아도 기능은 멈추지 않는다 — 앱에 같은 모양의 기본값이 들어 있다.
 * 생기부 규정(`ssampin-record-prompt`)과 다른 점이다. 규정은 없으면 **멈춰야** 하지만,
 * 모델 목록은 없으면 **기본값으로 계속 가는 편이 낫다.**
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  internalErrorResponse,
} from '../_shared/cors.ts';

/** 목록이 바뀌면 올린다. 클라이언트가 캐시를 무를지 정하는 값. */
const CATALOG_VERSION = 2;

/** 클라이언트가 메모리에 들고 있어도 되는 시간. 모델은 자주 안 바뀐다. */
const TTL_SEC = 6 * 60 * 60;

/**
 * 기본 목록.
 *
 * ★`id: ''` = "CLI 가 알아서" — 아무것도 안 붙이면 그 CLI 의 기본 모델이 쓰인다.
 * ★라벨은 **모델명만** 적는다(오너 결정 2026-09-06, ADR-085 보강 2 R4). "가장 강력함" 같은
 *   부연 설명을 붙이지 않는다. `기본 (권장)` 은 모델명이 아니라 "고르지 않음"이라 예외다.
 *   앱 안 대비용 목록(`src/domain/rules/ownAiCliRules.ts`)과 같게 유지한다.
 */
const CATALOG: Record<string, { id: string; label: string }[]> = {
  claude: [
    { id: '', label: '기본 (권장)' },
    { id: 'claude-fable-5-1', label: 'Fable 5.1' },
    { id: 'claude-opus-5', label: 'Opus 5' },
    { id: 'claude-sonnet-5', label: 'Sonnet 5' },
    { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
  ],
  codex: [
    { id: '', label: '기본 (권장)' },
    { id: 'gpt-6-astra', label: 'GPT-6 Astra' },
    { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
    { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
    { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
  ],
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('POST 만 허용합니다', 405);

  try {
    // 설치 식별자는 형식만 본다 — 누구인지 알아내려는 값이 아니라,
    // 아무나 무한정 긁어 가지 않게 하는 최소한의 표식이다.
    const body = (await req.json().catch(() => ({}))) as { installId?: unknown };
    const installId = typeof body.installId === 'string' ? body.installId.trim() : '';
    if (installId.length < 8 || installId.length > 64) {
      return errorResponse('installId 가 필요합니다', 400);
    }

    // 운영 중에 목록만 바꿔야 할 때를 위한 덮어쓰기(선택). 형식이 어긋나면 무시하고 기본값.
    const override = Deno.env.get('OWN_AI_MODEL_CATALOG');
    if (override && override.trim().length > 0) {
      try {
        const parsed = JSON.parse(override) as typeof CATALOG;
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed['claude'])) {
          return jsonResponse({ catalog: parsed, version: CATALOG_VERSION, ttlSec: TTL_SEC });
        }
      } catch {
        /* 형식이 깨졌으면 기본값으로 간다 — 목록 때문에 기능이 멈추면 안 된다 */
      }
    }

    return jsonResponse({ catalog: CATALOG, version: CATALOG_VERSION, ttlSec: TTL_SEC });
  } catch (e) {
    return internalErrorResponse(e);
  }
});
