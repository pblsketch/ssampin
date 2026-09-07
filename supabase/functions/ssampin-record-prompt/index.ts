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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ★배급 한도 (ADR-089, 2026-09-07)
 *
 * 이 함수는 **인증 없이 열려 있다.** Authorization 헤더를 하나도 붙이지 않고 POST 해도
 * 게이트웨이가 막지 않고 여기까지 도달한다(2026-09-07 실호출로 `verify_jwt = false` 확인).
 *
 * ★한도의 1순위 목적은 **수확 방어가 아니다.** 규정은 한 번만 새면 전부 새는 성질이라,
 *   작정한 사람은 installId 하나로 1회만 호출하고 어떤 한도에도 안 걸린다. 진짜 목적은
 *   **우리 쪽 캐시·루프 사고의 상한과 알람**이다 — 클라이언트 1시간 캐시가 유일한 방벽인데
 *   그게 깨지면 학생 30명당 fetch 30회가 나가고 아무도 모른다.
 * ★일간 IP 한도(`dayip:`)를 두지 않는다. 학교 하나가 회선을 공유하므로(NAT) 24시간 창
 *   상한은 학교 전체를 종일 막는데, 공격자는 회선만 바꾸면 그만이다. `ssampin-assist` 도
 *   같은 이유로 일간 IP 규칙이 없다.
 * ★전역 상한도 두지 않는다. 이 호출은 비용이 0 이라 상한은 예산 보호가 아니라
 *   **공격자가 태워서 전국 선생님의 초안을 끄는 스위치**가 된다.
 * ★fail-open: 한도 장치는 어떤 경우에도 배급을 죽이지 못한다. DB 가 죽었을 때 요청을
 *   막으면 그 순간 모든 선생님의 초안이 멈춘다(오너 승인).
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  internalErrorResponse,
} from '../_shared/cors.ts';
import { checkRateLimit, clientIpFrom } from '../_shared/rateLimit.ts';

/** 프롬프트가 바뀌면 올린다. 클라이언트는 이 값으로 캐시를 무를지 정한다. */
const PROMPT_VERSION = 1;

/** 클라이언트가 메모리에 얼마나 들고 있어도 되는가. */
const TTL_SEC = 60 * 60;

/**
 * 한도 모드. 시크릿 `RECORD_PROMPT_RATELIMIT` 이 정한다.
 *
 * - `off`     : 한도 블록을 통째로 건너뛴다 → **DB 왕복까지 멈춘다.** 진짜 킬 스위치.
 * - `observe` : 세고 기록하되 429 를 주지 않는다. **기본값**(시크릿이 없거나 값이 이상하면 여기).
 * - `enforce` : 429 를 준다.
 *
 * ★`?? 'observe'` 만으로는 **부재**만 처리되고 **오타**는 안 잡힌다. `enfroce` 는 observe 로
 *   떨어져 안전하지만 `offf` 는 **킬 스위치가 안 먹는다**(429 는 멈춰도 DB 왕복은 그대로).
 *   킬 스위치를 당기는 이유가 대개 DB 쪽이라 그게 실질 문제다 → 세 값을 명시 비교한다.
 */
type RateLimitMode = 'enforce' | 'observe' | 'off';

function readMode(): RateLimitMode {
  const raw = (Deno.env.get('RECORD_PROMPT_RATELIMIT') ?? 'observe').trim();
  if (raw === 'enforce' || raw === 'observe' || raw === 'off') return raw;
  console.error(`[ssampin-record-prompt] unknown RECORD_PROMPT_RATELIMIT: "${raw}" -> observe`);
  return 'observe';
}

const MODE: RateLimitMode = readMode();

// ★부팅 시 한 줄 남긴다. 아래 `limited` 로그는 **차단이 있을 때만** 찍히므로, 아무도 안
//   막히면 지금 어느 모드로 도는지 로그에 흔적이 없다 — "발효됐다고 믿는 상태"가 만들어진다.
console.log(`[ssampin-record-prompt] mode=${MODE}`);

/** 한도에 걸린 갈래. 사유가 다르면 화면 안내도 달라야 한다(`ssampin-assist` 와 같은 이유). */
type BlockedKind = 'minute' | 'day';

const BLOCKED_MESSAGE: Readonly<Record<BlockedKind, string>> = {
  minute: '요청이 몰렸습니다. 1분 뒤에 다시 시도해 주세요.',
  day: '오늘 받을 수 있는 횟수를 다 썼습니다. 내일 다시 시도해 주세요.',
};

/**
 * 한도를 검사하고, 걸렸으면 그 갈래를 돌려준다. **던지지 않는다** — 어떤 실패든 `null`
 * (= 통과)로 흡수한다. 한도 장치가 배급을 죽이면 안 된다.
 *
 * ★`checkRateLimit` 은 한도를 넘으면 즉시 빠져나가고 **아무것도 기록하지 않는다**
 *   (`_shared/rateLimit.ts`). 그래서 차단 사건은 여기서 따로 남긴다 — 안 그러면 표에는
 *   통과한 요청만 쌓여서 "아무도 안 막힌다"와 "상한에 닿아 멈췄다"가 구분되지 않는다.
 * ★분당·일간을 **두 호출로 나눈다.** 한 호출로 합치면 429 가 한 종류가 되어
 *   "1분 뒤 다시"면 되는 상황에 "오늘 다 썼다"고 말하게 된다.
 */
async function applyRateLimit(req: Request, installId: string): Promise<BlockedKind | null> {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const ip = clientIpFrom(req);

    /**
     * 차단 사건을 남긴다. 반환값은 버리고 **부작용(1행 기록)만** 쓴다 —
     * `max: 1` 이라 그 분 첫 차단만 행을 넣고 두 번째부터는 아무것도 넣지 않는다.
     * 공격자가 로그를 부풀려 표를 터뜨리는 증폭 경로가 생기지 않는다. 마이그레이션 0건.
     */
    const recordBlocked = async (kind: BlockedKind): Promise<void> => {
      console.warn('[ssampin-record-prompt] limited', { mode: MODE, kind, ip, installId });
      await checkRateLimit(supabase, 'record-prompt-blocked', [
        { identifier: ip, windowMs: 60_000, max: 1 },
      ]);
    };

    let firstBlocked: BlockedKind | null = null;

    // 분당 — 설치 단위가 주(主), IP 는 설치 id 를 지어내는 남용을 막는 뒷선.
    const minuteLimited = await checkRateLimit(supabase, 'record-prompt', [
      { identifier: `min:${installId}`, windowMs: 60_000, max: 10 },
      { identifier: `minip:${ip}`, windowMs: 60_000, max: 60 },
    ]);
    if (minuteLimited) {
      await recordBlocked('minute');
      firstBlocked = 'minute';
      // ★`enforce` 가 아니면 여기서 멈추지 않는다 — 일간 갈래도 관측해야 하기 때문이다.
      if (MODE === 'enforce') return firstBlocked;
    }

    // 일간 — 정상 최대는 캐시(1시간) 때문에 교사당 24회/일이다. 200 은 그 8배.
    const dayLimited = await checkRateLimit(supabase, 'record-prompt', [
      { identifier: installId, windowMs: 86_400_000, max: 200 },
    ]);
    if (dayLimited) {
      await recordBlocked('day');
      if (firstBlocked === null) firstBlocked = 'day';
      if (MODE === 'enforce') return firstBlocked;
    }

    return firstBlocked;
  } catch (e) {
    // 클라이언트 생성 실패·DB 장애 — 어느 쪽이든 배급은 계속한다(fail-open).
    console.error('[ssampin-record-prompt] rate-limit unavailable', e);
    return null;
  }
}

/** 한 줄 base64 면 풀어서, 아니면 그대로. 둘 다 아니면 빈 문자열. */
function decodePrompt(raw: string | undefined): string {
  if (!raw) return '';
  const t = raw.trim();
  if (t.length === 0) return '';
  // 줄바꿈이 있으면 이미 평문이다(옛 방식).
  if (t.includes('\n')) return t;
  try {
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(t), (c) => c.charCodeAt(0)));
    // 풀었더니 한글이 나오면 base64 가 맞다.
    return /[가-힣]/.test(decoded) ? decoded : t;
  } catch {
    return t;
  }
}

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
    // ★이 값은 클라이언트가 보내는 것이라 얼마든지 바뀐다. installId 축 한도는 우리 쪽
    //   루프 사고에만 유효하고, 실효 방어선은 IP 분당 축뿐이다.
    const body = (await req.json().catch(() => ({}))) as { installId?: unknown };
    const installId = typeof body.installId === 'string' ? body.installId.trim() : '';
    if (installId.length < 8 || installId.length > 64) {
      return errorResponse('installId 가 필요합니다', 400);
    }

    // ★한도는 규정을 **읽기 전에** 지난다. 순서가 계약이다(메타 테스트가 고정한다).
    if (MODE !== 'off') {
      const blocked = await applyRateLimit(req, installId);
      if (blocked !== null && MODE === 'enforce') {
        return jsonResponse({ error: BLOCKED_MESSAGE[blocked], retryAfterKind: blocked }, 429);
      }
    }

    // ★값은 **한 줄 base64** 로 저장한다. supabase 시크릿에 여러 줄을 그대로 넣으면
    //   첫 줄만 저장되어(실측) 규정이 통째로 잘린다 — 잘린 줄 알아채기도 어렵다.
    //   옛 방식(평문)으로 넣은 값도 계속 읽히게 둘 다 받는다.
    const raw = Deno.env.get('RECORD_PROMPT_L1');
    const prompt = decodePrompt(raw);
    if (!prompt || prompt.trim().length === 0) {
      // 배포 실수 — 프롬프트 없이 초안을 만들면 규정을 못 지킨다. 그럴 바엔 멈춘다.
      return errorResponse('생기부 프롬프트가 설정되지 않았습니다', 503);
    }

    return jsonResponse({ prompt, version: PROMPT_VERSION, ttlSec: TTL_SEC });
  } catch (e) {
    // ★인자 1개로 부르면(옛 코드) 함수 이름 없이 오류가 `undefined` 로 찍혀 배포 후
    //   진단이 불가능하다. 시그니처는 `(context, internal, ...)` 다 — `_shared/cors.ts`.
    return internalErrorResponse('ssampin-record-prompt', e);
  }
});
