/**
 * 수신 확인증 — 교실 페이지 → Supabase `memo_share_presence` upsert
 *
 * ⚠️ 절대 원칙 (ADR-012, 사용자 승인 메타데이터 예외):
 * 1. **메모 내용·제목 등 어떤 텍스트도 전송하지 않는다** — 보드 id·상태·시각만.
 *    (보드 본문은 선생님 개인 Drive에만 존재 — 쌤핀 서버 무저장 원칙의 유일한 예외 채널)
 * 2. **전송 실패가 보드 표시·폴링·재생을 깨면 안 된다** — 모든 전송은
 *    fire-and-forget(오류 무시) + 5초 타임아웃. 호출 측은 결과를 기다리지 않는다.
 * 3. env(NEXT_PUBLIC_SUPABASE_URL/ANON_KEY) 미설정 시 조용히 비활성 — 페이지는 정상 동작.
 *
 * 서버: supabase/migrations/037_memo_share_presence.sql — 보드당 1행,
 * RLS가 board_id 길이(20~80자)와 last_ack_result enum을 가드한다.
 */

const UPSERT_TIMEOUT_MS = 5000;

/** RLS 허용 enum과 1:1 — 그 외 값은 서버가 거부 */
export type PresenceAckResult = 'played' | 'sound-off' | 'fallback-voice';

interface PresenceConfig {
  readonly url: string;
  readonly anonKey: string;
}

function getPresenceConfig(): PresenceConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (typeof url !== 'string' || url.trim().length === 0) return null;
  if (typeof anonKey !== 'string' || anonKey.trim().length === 0) return null;
  return { url: url.trim().replace(/\/$/, ''), anonKey: anonKey.trim() };
}

/**
 * 보드당 1행 upsert (Prefer: resolution=merge-duplicates — 보낸 컬럼만 갱신).
 * 실패는 조용히 무시 — 어떤 경로에서도 throw하지 않는다.
 */
function upsertPresence(payload: Record<string, unknown>): void {
  const config = getPresenceConfig();
  if (config === null) return; // env 미설정 — 조용히 비활성

  try {
    void fetch(`${config.url}/rest/v1/memo_share_presence`, {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(UPSERT_TIMEOUT_MS),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* fetch 자체가 던져도(미지원 환경 등) 페이지 동작에 영향 금지 */
  }
}

/**
 * 생존 신호 — ready 상태에서 60초마다 + visible 복귀 직후.
 * ack 필드는 싣지 않는다(merge-duplicates가 기존 ack 값을 보존하도록).
 */
export function sendHeartbeat(boardId: string, soundOn: boolean): void {
  upsertPresence({
    board_id: boardId,
    last_seen_at: new Date().toISOString(),
    sound_on: soundOn,
  });
}

/** 주목/낭독 신호 처리 직후 1회 — 처리한 nonce와 결과를 함께 싣는다 */
export function sendAttentionAck(
  boardId: string,
  soundOn: boolean,
  nonce: string,
  result: PresenceAckResult,
): void {
  const now = new Date().toISOString();
  upsertPresence({
    board_id: boardId,
    last_seen_at: now,
    sound_on: soundOn,
    last_ack_nonce: nonce,
    last_ack_result: result,
    last_ack_at: now,
  });
}
