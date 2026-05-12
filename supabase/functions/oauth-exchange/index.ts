/**
 * Google OAuth code↔token 교환 (모바일 PWA 전용) — security-hardening P0-C / 감사 F-2
 *
 * 모바일 PWA 는 Google "Web application" OAuth 클라이언트라 토큰 교환에 client_secret 이
 * 필요하다. 그 secret 을 PWA 번들(dist-mobile/)에 넣으면 안 되므로, 교환을 이 Edge Function
 * 으로 옮긴다. 클라이언트(`GoogleOAuthBrowserClient`)는 PKCE code_challenge 만 만들고
 * code↔token 교환은 이 함수가 서버 env `GOOGLE_CLIENT_SECRET` 로 수행한다 — 렌더러는
 * secret 을 영영 보지 않는다.
 *
 * 요청 body:
 *   { grantType: 'authorization_code', code, codeVerifier?, redirectUri, clientId? }
 *   { grantType: 'refresh_token', refreshToken, clientId? }
 *
 * 응답: Google token endpoint 응답을 그대로 패스스루
 *   { access_token, refresh_token?, expires_in, token_type, scope?, id_token? }
 *
 * 인증: verify_jwt = false (config.toml). anon key 없이도 호출 가능 — body 검증 + rate limit
 *       으로 충분하다(토큰 교환 자체는 Google code/refresh_token 소유 증명이 필요).
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

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

type GrantType = 'authorization_code' | 'refresh_token';
const VALID_GRANT_TYPES: readonly GrantType[] = ['authorization_code', 'refresh_token'];

interface ExchangeRequest {
  grantType?: string;
  code?: string;
  codeVerifier?: string;
  redirectUri?: string;
  refreshToken?: string;
  /** 옵션 — 서버 env GOOGLE_CLIENT_ID 가 없으면 이 값을 사용 */
  clientId?: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('POST 만 허용됩니다', 405);
  }

  try {
    let body: ExchangeRequest;
    try {
      body = (await req.json()) as ExchangeRequest;
    } catch {
      return errorResponse('잘못된 요청 본문입니다', 400);
    }

    const grantType = body.grantType;
    if (!grantType || !VALID_GRANT_TYPES.includes(grantType as GrantType)) {
      return errorResponse('grantType 은 authorization_code 또는 refresh_token 이어야 합니다', 400);
    }

    const clientId = (Deno.env.get('GOOGLE_CLIENT_ID') ?? body.clientId ?? '').trim();
    const clientSecret = (Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '').trim();
    if (!clientId || !clientSecret) {
      return internalErrorResponse(
        'oauth-exchange',
        new Error('GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET env 미설정'),
        'OAuth 설정 오류 — 관리자에게 문의해주세요',
        500,
      );
    }

    // Rate limit — 토큰 교환 폭주 방어 (IP 당 시간당 30회)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const clientIP = clientIpFrom(req);
    const isLimited = await checkRateLimit(supabase, 'oauth-exchange', [
      { identifier: clientIP, windowMs: 3_600_000, max: 30 },
    ]);
    if (isLimited) {
      return errorResponse('잠시 후 다시 시도해 주세요. 너무 많은 요청이 감지되었습니다.', 429);
    }

    // Google token endpoint 요청 본문 구성
    const params: Record<string, string> = {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: grantType,
    };

    if (grantType === 'authorization_code') {
      if (!body.code || !body.redirectUri) {
        return errorResponse('code 와 redirectUri 가 필요합니다', 400);
      }
      params.code = body.code;
      params.redirect_uri = body.redirectUri;
      if (body.codeVerifier) {
        params.code_verifier = body.codeVerifier;
      }
    } else {
      // refresh_token
      if (!body.refreshToken) {
        return errorResponse('refreshToken 이 필요합니다', 400);
      }
      params.refresh_token = body.refreshToken;
    }

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });

    const tokenText = await tokenRes.text();
    let tokenData: Record<string, unknown>;
    try {
      tokenData = JSON.parse(tokenText) as Record<string, unknown>;
    } catch {
      return internalErrorResponse(
        'oauth-exchange',
        new Error(`Google token endpoint non-JSON response: ${tokenRes.status}`),
        '토큰 교환 중 오류가 발생했습니다',
        502,
      );
    }

    if (!tokenRes.ok) {
      // Google 오류는 클라이언트가 분기 처리할 수 있게 그대로 전달 (secret 미포함).
      // invalid_grant 는 모바일 훅이 재로그인 유도에 쓴다.
      const errCode = typeof tokenData.error === 'string' ? tokenData.error : 'token_exchange_failed';
      console.error('[oauth-exchange] Google token error:', tokenRes.status, errCode);
      return jsonResponse(
        { error: errCode, error_description: tokenData.error_description ?? '' },
        tokenRes.status === 400 ? 400 : 502,
      );
    }

    // 성공 — Google 응답 패스스루
    return jsonResponse(tokenData);
  } catch (err) {
    return internalErrorResponse('oauth-exchange', err);
  }
});
