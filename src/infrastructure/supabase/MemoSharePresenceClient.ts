/**
 * 교실 화면 수신 확인증(presence + attention ack) Supabase 읽기 클라이언트.
 *
 * `memo_share_presence` 테이블(보드당 1행)을 읽기만 한다 — 쓰기는 교실 페이지(landing)가
 * heartbeat/ack upsert로 수행. **메모 내용은 일절 오가지 않는다** — board_id·생존 시각·
 * 소리 토글·재생 결과(nonce)뿐 (사용자 승인 메타데이터 예외, 2026-06-12, ADR-012,
 * 스키마: supabase/migrations/037_memo_share_presence.sql).
 *
 * ShortLinkClient 패턴: supabase-js 의존 없이 REST fetch 직접 호출,
 * env 미설정 시 조용히 비활성(빈 맵) — 기능 없이도 공유 자체는 동작해야 한다.
 */

import type {
  IMemoSharePresencePort,
  MemoShareAckResult,
  MemoSharePresence,
} from '@domain/ports/IMemoSharePresencePort';

const ACK_RESULTS: readonly MemoShareAckResult[] = ['played', 'sound-off', 'fallback-voice'];

function parseAckResult(raw: unknown): MemoShareAckResult | undefined {
  return (ACK_RESULTS as readonly unknown[]).includes(raw)
    ? (raw as MemoShareAckResult)
    : undefined;
}

interface PresenceRow {
  readonly board_id?: unknown;
  readonly last_seen_at?: unknown;
  readonly sound_on?: unknown;
  readonly last_ack_nonce?: unknown;
  readonly last_ack_result?: unknown;
  readonly last_ack_at?: unknown;
}

/** 행 1개를 방어적으로 파싱 — 필수 필드가 어긋나면 null (해당 행만 skip) */
function parseRow(row: PresenceRow): MemoSharePresence | null {
  if (typeof row.board_id !== 'string' || row.board_id.length === 0) return null;
  if (typeof row.last_seen_at !== 'string') return null;
  const ackResult = parseAckResult(row.last_ack_result);
  return {
    boardId: row.board_id,
    lastSeenAt: row.last_seen_at,
    soundOn: row.sound_on === true,
    ...(typeof row.last_ack_nonce === 'string' && row.last_ack_nonce.length > 0
      ? { lastAckNonce: row.last_ack_nonce }
      : {}),
    ...(ackResult !== undefined ? { lastAckResult: ackResult } : {}),
    ...(typeof row.last_ack_at === 'string' ? { lastAckAt: row.last_ack_at } : {}),
  };
}

export class MemoSharePresenceClient implements IMemoSharePresencePort {
  private readonly baseUrl: string;
  private readonly anonKey: string;

  constructor() {
    this.baseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
    this.anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
  }

  /** env 미설정 시 false — 호출자는 기능을 조용히 비활성 처리 */
  isConfigured(): boolean {
    return this.baseUrl.length > 0 && this.anonKey.length > 0;
  }

  async fetchPresence(
    boardIds: readonly string[],
  ): Promise<ReadonlyMap<string, MemoSharePresence>> {
    const result = new Map<string, MemoSharePresence>();
    if (!this.isConfigured() || boardIds.length === 0) return result;

    const idList = boardIds.map((id) => encodeURIComponent(id)).join(',');
    const select = 'board_id,last_seen_at,sound_on,last_ack_nonce,last_ack_result,last_ack_at';
    const url =
      `${this.baseUrl}/rest/v1/memo_share_presence` + `?board_id=in.(${idList})&select=${select}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: this.anonKey,
        Authorization: `Bearer ${this.anonKey}`,
      },
    });
    if (!res.ok) {
      throw new Error(`MemoSharePresence API error ${res.status}`);
    }

    const rows = (await res.json()) as unknown;
    if (!Array.isArray(rows)) return result;
    for (const row of rows) {
      const presence = parseRow(row as PresenceRow);
      if (presence !== null) result.set(presence.boardId, presence);
    }
    return result;
  }
}
