/**
 * Claude API 클라이언트 — Workload Identity Federation(WIF), 쌤핀 자체 발급자
 *
 * ## 왜 API 키가 아닌가
 *
 * `sk-ant-api…` 키를 두지 않는다. 이 함수가 짧은 신분 토큰(JWT)을 직접 서명해 Anthropic 에
 * 내밀면, Anthropic 이 콘솔의 페더레이션 규칙과 대조한 뒤 10분짜리 접근 토큰을 내준다.
 * 접근 토큰은 `ssampin` 워크스페이스(월 지출 한도 $20)와 서비스 계정 `ssampin-chatbot` 에
 * 묶여 있어, 새어 나가도 그 범위 밖으로는 못 쓰고 곧 만료된다.
 *
 * ## 한계 — 서명 키는 여전히 오래 쓰는 비밀값이다
 *
 * Vercel·GitHub Actions 같은 플랫폼은 신분 토큰을 대신 발급해 주지만 Supabase 서버 함수에는
 * 그런 기능이 없다. 그래서 서명 키(`ANTHROPIC_WIF_SIGNING_JWK`)를 시크릿으로 둔다. 이 키가
 * 새면 규칙 범위 안에서 토큰을 만들 수 있으므로 **키를 갈 때는 콘솔 발급자의 JWK 도 같이
 * 바꿔야 한다**(인라인 키라 자동 갱신이 없다).
 *
 * ## 환경변수
 *
 *   ANTHROPIC_WIF_SIGNING_JWK     ES256 비밀 키(JWK JSON 한 줄, `kid` 포함). 없으면 Claude 를 쓰지 않는다.
 *   ANTHROPIC_WIF_ISSUER          JWT `iss`. 콘솔 발급자 URL 과 글자 그대로 같아야 한다.
 *   ANTHROPIC_WIF_SUBJECT         JWT `sub`. 콘솔 규칙의 제목 패턴과 같아야 한다.
 *   ANTHROPIC_FEDERATION_RULE_ID  `fdrl_…`
 *   ANTHROPIC_ORGANIZATION_ID     조직 UUID
 *   ANTHROPIC_SERVICE_ACCOUNT_ID  `svac_…`
 *   ANTHROPIC_WORKSPACE_ID        `wrkspc_…`
 *
 * ★`ANTHROPIC_API_KEY` 를 같이 넣지 말 것. 이 파일은 자격증명을 생성자 인자로 넘겨 그보다
 *   우선하지만, 다른 곳에서 인자 없이 만든 클라이언트는 그 키를 먼저 집어 든다.
 */

// esm.sh 로 불러오면 SDK 타입이 any 로 풀려 타입 검사가 꺼진다(2026-10-24 실측) → npm: 으로 판을 못 박는다.
// 로컬 검사: deno check --node-modules-dir=none (저장소 루트 package.json 때문에 옵션이 필요하다).
import Anthropic from 'npm:@anthropic-ai/sdk@1.2.0';
import { oidcFederationProvider } from 'npm:@anthropic-ai/sdk@1.2.0/lib/credentials/oidc-federation';

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
/** Anthropic 이 요구하는 JWT `aud`. 콘솔 규칙의 '예상 대상'과 같다. */
const AUDIENCE = 'https://api.anthropic.com';
/**
 * 신분 토큰 수명. 접근 토큰은 규칙 수명(10분)과 이 값의 2배 중 짧은 쪽으로 정해진다.
 * 발급자 최대 수명(1시간) 안이어야 한다.
 */
const IDENTITY_TOKEN_LIFETIME_SECONDS = 600;

interface WifConfig {
  readonly signingJwk: JsonWebKey & { kid?: string };
  readonly issuer: string;
  readonly subject: string;
  readonly federationRuleId: string;
  readonly organizationId: string;
  readonly serviceAccountId: string;
  readonly workspaceId: string;
}

/** 서명 키는 있는데 나머지 값이 빠졌을 때. 배포 실수이므로 조용히 넘어가지 않는다. */
export class ClaudeWifConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClaudeWifConfigError';
  }
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new ClaudeWifConfigError(`${name} 가 설정되지 않았습니다`);
  return value;
}

/** 서명 키가 없으면 null(= Claude 미사용). 있으면 나머지 값을 모두 요구한다. */
function readConfig(): WifConfig | null {
  const rawJwk = Deno.env.get('ANTHROPIC_WIF_SIGNING_JWK')?.trim();
  if (!rawJwk) return null;

  let signingJwk: JsonWebKey & { kid?: string };
  try {
    signingJwk = JSON.parse(rawJwk) as JsonWebKey & { kid?: string };
  } catch {
    // 값 자체는 로그에 남기지 않는다.
    throw new ClaudeWifConfigError('ANTHROPIC_WIF_SIGNING_JWK 가 JSON 이 아닙니다');
  }
  if (!signingJwk.kid) {
    throw new ClaudeWifConfigError('ANTHROPIC_WIF_SIGNING_JWK 에 kid 가 없습니다');
  }

  return {
    signingJwk,
    issuer: requiredEnv('ANTHROPIC_WIF_ISSUER'),
    subject: requiredEnv('ANTHROPIC_WIF_SUBJECT'),
    federationRuleId: requiredEnv('ANTHROPIC_FEDERATION_RULE_ID'),
    organizationId: requiredEnv('ANTHROPIC_ORGANIZATION_ID'),
    serviceAccountId: requiredEnv('ANTHROPIC_SERVICE_ACCOUNT_ID'),
    workspaceId: requiredEnv('ANTHROPIC_WORKSPACE_ID'),
  };
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const encoder = new TextEncoder();

/**
 * 신분 토큰을 새로 서명한다. 교환할 때마다 새로 만든다 —
 * 발급자가 `jti` 재사용을 막으므로(일회용 토큰) 같은 토큰을 두 번 내밀면 거절된다.
 */
async function mintIdentityToken(config: WifConfig, key: CryptoKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', typ: 'JWT', kid: config.signingJwk.kid };
  const payload = {
    iss: config.issuer,
    sub: config.subject,
    aud: AUDIENCE,
    iat: now,
    exp: now + IDENTITY_TOKEN_LIFETIME_SECONDS,
    jti: crypto.randomUUID(),
  };
  const signingInput = `${base64Url(encoder.encode(JSON.stringify(header)))}.${base64Url(
    encoder.encode(JSON.stringify(payload)),
  )}`;
  // WebCrypto ECDSA 서명은 JWS 가 요구하는 r||s(64바이트) 형식으로 나온다.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encoder.encode(signingInput),
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

let cachedClient: Anthropic | null = null;

/**
 * WIF 로 인증하는 Claude 클라이언트. 서명 키가 없으면 null.
 *
 * 함수 인스턴스가 살아 있는 동안 하나를 재사용한다 — SDK 가 접근 토큰을 캐시하고
 * 만료 2분 전부터 알아서 다시 교환하므로, 요청마다 만들면 그 캐시를 버리게 된다.
 */
export function claudeClient(): Anthropic | null {
  if (cachedClient) return cachedClient;
  const config = readConfig();
  if (!config) return null;

  let keyPromise: Promise<CryptoKey> | null = null;
  const signingKey = (): Promise<CryptoKey> =>
    (keyPromise ??= crypto.subtle.importKey(
      'jwk',
      config.signingJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    ));

  cachedClient = new Anthropic({
    baseURL: ANTHROPIC_BASE_URL,
    credentials: oidcFederationProvider({
      identityTokenProvider: async () => mintIdentityToken(config, await signingKey()),
      federationRuleId: config.federationRuleId,
      organizationId: config.organizationId,
      serviceAccountId: config.serviceAccountId,
      workspaceId: config.workspaceId,
      baseURL: ANTHROPIC_BASE_URL,
      fetch,
    }),
  });
  return cachedClient;
}
