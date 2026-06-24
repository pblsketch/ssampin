/**
 * 공용 rate limit 헬퍼 — security-hardening P1-4 (감사 M-7 / M-9)
 *
 * Postgres `ssampin_rate_limits` 테이블(identifier, endpoint, requested_at)을 슬라이딩
 * 윈도우 카운터로 사용한다. `ssampin-chat` 이 원래 갖고 있던 패턴을 추출해 여러 함수가
 * 공유한다. 동작은 ssampin-chat 의 기존 구현과 동등(IP 분당 N회 + 세션 일 M회).
 *
 * 새 테이블·마이그레이션은 필요 없다 — 001_ssampin_chat.sql 의 `ssampin_rate_limits` 를
 * `endpoint` 값으로 구분해 그대로 재사용한다.
 */

interface RateLimitErrorLike {
  readonly message: string;
}

interface RateLimitSelectBuilder {
  eq(column: string, value: string): RateLimitSelectBuilder;
  gte(
    column: string,
    value: string,
  ): Promise<{ count: number | null; error: RateLimitErrorLike | null }>;
}

interface RateLimitTable {
  select(columns: string, options: { count: 'exact'; head: true }): RateLimitSelectBuilder;
  insert(
    rows: readonly { readonly identifier: string; readonly endpoint: string }[],
  ): Promise<{ error: RateLimitErrorLike | null }>;
}

interface RateLimitSupabaseClient {
  from(table: string): RateLimitTable;
}

export interface RateLimitWindow {
  /** 식별자 (IP / sessionId 등) */
  identifier: string;
  /** 윈도우 길이(ms) */
  windowMs: number;
  /** 윈도우 내 허용 최대 횟수 */
  max: number;
}

/**
 * 여러 (identifier, window, max) 규칙을 한 번에 검사한다.
 *
 * - 하나라도 한도를 넘으면 `true`(제한됨) 반환 — 아무것도 기록하지 않음.
 * - 모든 규칙을 통과하면 각 identifier 에 대해 요청 1건씩 기록 후 `false` 반환.
 * - Supabase 조회/기록이 실패하면(가용성 우선) `false` 로 통과시키되 콘솔에 로그.
 *
 * `endpoint` 는 `ssampin_rate_limits.endpoint` 컬럼 값 — 함수별로 고유하게.
 */
export async function checkRateLimit(
  supabase: unknown,
  endpoint: string,
  rules: RateLimitWindow[],
): Promise<boolean> {
  try {
    const db = supabase as RateLimitSupabaseClient;
    const now = Date.now();

    for (const rule of rules) {
      const since = new Date(now - rule.windowMs).toISOString();
      const { count, error } = await db
        .from('ssampin_rate_limits')
        .select('*', { count: 'exact', head: true })
        .eq('identifier', rule.identifier)
        .eq('endpoint', endpoint)
        .gte('requested_at', since);

      if (error) {
        // 조회 실패 — 가용성 우선, 차단하지 않고 통과 (로그만)
        console.error(`rate-limit lookup failed (${endpoint}):`, error.message);
        return false;
      }
      if ((count ?? 0) >= rule.max) return true;
    }

    // 모든 규칙 통과 → 요청 기록
    const rows = rules.map((r) => ({ identifier: r.identifier, endpoint }));
    if (rows.length > 0) {
      const { error: insertError } = await db.from('ssampin_rate_limits').insert(rows);
      if (insertError) {
        console.error(`rate-limit record failed (${endpoint}):`, insertError.message);
      }
    }
    return false;
  } catch (err) {
    console.error(`rate-limit unexpected error (${endpoint}):`, (err as Error).message);
    return false;
  }
}

/** x-forwarded-for 헤더에서 클라이언트 IP 추출 (없으면 'unknown') */
export function clientIpFrom(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}
