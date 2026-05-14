/** CORS 헤더 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** 성공 JSON 응답 */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** 에러 JSON 응답 */
export function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * 내부 오류 응답 헬퍼 — security-hardening P1-4 (감사 M-10)
 *
 * 클라이언트에는 일반화된 메시지만 보내고, 실제 에러(메시지·스택·DB 식별자)는 서버
 * 로그(`console.error`)에만 남긴다. 사용자에게 보여주려고 의도한 검증 메시지(필수 필드
 * 누락 등)는 `errorResponse(...)` 로 그대로 두고, "예상 못한 내부 오류"에만 이걸 쓴다.
 *
 * @param context  로그 식별용 라벨 (예: 'submit-assignment')
 * @param internal 원본 에러 (로그 전용 — 응답 body 에 절대 포함하지 않음)
 * @param userMessage 클라이언트에 보낼 일반 메시지 (기본: '요청 처리 중 오류가 발생했습니다')
 * @param status HTTP 상태 (기본 500)
 */
export function internalErrorResponse(
  context: string,
  internal: unknown,
  userMessage = '요청 처리 중 오류가 발생했습니다',
  status = 500,
): Response {
  console.error(`[${context}]`, internal);
  return errorResponse(userMessage, status);
}
