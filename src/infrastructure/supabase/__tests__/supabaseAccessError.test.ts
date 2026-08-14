/**
 * 권한 오류(401/403)를 빈 값으로 삼키지 않고 업데이트 안내로 바꾸는지 실증한다.
 *
 * 왜 이 그물이 필요한가 (계획서 P0-3):
 *   상담 예약·설문 응답 테이블의 익명 SELECT 권한을 서버에서 회수할 예정이다.
 *   그때 구버전 앱은 401/403 을 받는데, getBookings 가 예전처럼 `return []` 하면
 *   화면에 "예약 없음"으로 보여 선생님이 자료가 사라졌다고 판단한다.
 *   (설문 쪽엔 같은 원인의 2026-05-14 사용자 신고 사례가 주석으로 남아 있다.)
 *
 *   그래서 "권한 오류일 때 빈 배열이 아니라 throw 한다"를 코드가 아니라
 *   테스트로 고정한다. return [] 로 되돌리면 이 테스트가 빨간불이 된다.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { isUpdateRequiredError, throwIfPermissionError } from '../supabaseAccessError';

describe('throwIfPermissionError', () => {
  it('401·403 은 업데이트 안내 문구로 throw 한다', () => {
    for (const status of [401, 403]) {
      expect(() => throwIfPermissionError(status, '예약 목록')).toThrow(/최신 버전으로 업데이트/);
    }
  });

  it('권한 오류가 아닌 상태는 통과시킨다 (호출부의 기존 처리에 맡긴다)', () => {
    for (const status of [200, 404, 500, 503]) {
      expect(() => throwIfPermissionError(status, '예약 목록')).not.toThrow();
    }
  });

  it('안내 문구에 무엇을 해야 하는지가 들어 있다', () => {
    try {
      throwIfPermissionError(401, '설문 응답');
      expect.unreachable('throw 했어야 한다');
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      const msg = (e as Error).message;
      expect(msg).toContain('설문 응답');
      expect(msg).toContain('업데이트');
      expect(isUpdateRequiredError(e)).toBe(true);
    }
  });

  it('업데이트 안내가 아닌 오류는 isUpdateRequiredError 가 false 로 본다', () => {
    expect(isUpdateRequiredError(new Error('네트워크 오류'))).toBe(false);
    expect(isUpdateRequiredError('문자열')).toBe(false);
    expect(isUpdateRequiredError(null)).toBe(false);
  });
});

describe('ConsultationSupabaseClient.getBookings — 실패를 빈 목록으로 삼키지 않는다', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function makeClient() {
    const mod = await import('../ConsultationSupabaseClient');
    return new mod.ConsultationSupabaseClient();
  }

  it('401 이면 업데이트 안내로 throw 한다 (빈 배열 금지)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' }),
    );
    const client = await makeClient();
    await expect(client.getBookings('sched-1')).rejects.toThrow(/최신 버전으로 업데이트/);
  });

  it('권한 오류가 아닌 실패도 throw 한다 (조용한 "예약 없음" 방지)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'boom',
      }),
    );
    const client = await makeClient();
    await expect(client.getBookings('sched-1')).rejects.toThrow(/getBookings failed/);
  });

  it('정상 응답은 그대로 매핑한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 'b1',
            schedule_id: 'sched-1',
            slot_id: 's1',
            student_number: 3,
            booker_info_encrypted: null,
            method: 'face',
            memo_encrypted: null,
            created_at: '2026-08-14T00:00:00Z',
          },
        ],
      }),
    );
    const client = await makeClient();
    const rows = await client.getBookings('sched-1');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.studentNumber).toBe(3);
    expect(rows[0]?.bookerInfoEncrypted).toBeUndefined();
  });
});
