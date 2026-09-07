/**
 * 공용 한도 헬퍼 — **동작** 검증 (ADR-089)
 *
 * ## 왜 필요한가
 *
 * 배급 함수의 계약은 `recordPromptRateLimit.meta.test.ts` 가 **글자로** 고정한다.
 * 그런데 "이 규칙이 실제로 10번째에서 막는가", "차단될 때 정말 아무것도 기록하지 않는가"는
 * 글자로는 알 수 없다. 그리고 그 답이 관측 설계 전체를 좌우한다 —
 * **차단된 요청이 표에 안 남기 때문에** 배급 함수가 차단 사건을 따로 기록해야 했다.
 *
 * `_shared/rateLimit.ts` 는 Deno 전역도 URL import 도 없는 순수 TS 라, 가짜 클라이언트로
 * 여기서 돌릴 수 있다(`assistServerRequest.test.ts` 가 `_shared/assistRequest.ts` 를
 * 상대경로로 부르는 것과 같은 구조다).
 */
import { describe, expect, it } from 'vitest';

import { checkRateLimit } from '../../../../supabase/functions/_shared/rateLimit';

interface Row {
  readonly identifier: string;
  readonly endpoint: string;
  readonly at: number;
}

/**
 * 표를 흉내 내는 가짜 클라이언트. 실제 헬퍼가 부르는 모양
 * (`.from().select().eq().eq().gte()` / `.from().insert()`)만 맞춘다.
 */
function fakeClient(opts: { readonly failSelect?: boolean } = {}) {
  const rows: Row[] = [];
  let inserts = 0;

  const client = {
    from(_table: string) {
      return {
        select(_cols: string, _o: unknown) {
          const filters: Record<string, string> = {};
          const builder = {
            eq(col: string, val: string) {
              filters[col] = val;
              return builder;
            },
            async gte(_col: string, since: string) {
              if (opts.failSelect) return { count: null, error: { message: '연결 끊김' } };
              const from = new Date(since).getTime();
              const count = rows.filter(
                (r) =>
                  r.identifier === filters['identifier'] &&
                  r.endpoint === filters['endpoint'] &&
                  r.at >= from,
              ).length;
              return { count, error: null };
            },
          };
          return builder;
        },
        async insert(newRows: readonly { identifier: string; endpoint: string }[]) {
          inserts += 1;
          for (const r of newRows) rows.push({ ...r, at: Date.now() });
          return { error: null };
        },
      };
    },
  };

  return { client, rows, insertCalls: () => inserts };
}

const MINUTE = { windowMs: 60_000, max: 10 };

describe('한도가 실제로 세는가', () => {
  it('10 이 상한이면 9회까지 통과하고 10회째에 막는다', async () => {
    const { client } = fakeClient();
    const rule = [{ identifier: 'min:install-1', ...MINUTE }];

    const results: boolean[] = [];
    for (let i = 0; i < 12; i += 1) {
      results.push(await checkRateLimit(client, 'record-prompt', rule));
    }

    // 앞의 10회는 통과(그때마다 1행씩 쌓인다), 11회째부터 막힌다.
    expect(results.slice(0, 10)).toEqual(Array(10).fill(false));
    expect(results.slice(10)).toEqual([true, true]);
  });

  it('★막힐 때는 아무것도 기록하지 않는다 — 관측이 눈머는 원인', async () => {
    const { client, rows, insertCalls } = fakeClient();
    const rule = [{ identifier: 'min:install-1', ...MINUTE }];

    for (let i = 0; i < 10; i += 1) await checkRateLimit(client, 'record-prompt', rule);
    const before = { rows: rows.length, inserts: insertCalls() };

    await checkRateLimit(client, 'record-prompt', rule); // 막힌다

    expect(rows.length).toBe(before.rows);
    expect(insertCalls()).toBe(before.inserts);
  });

  it('엔드포인트가 다르면 서로를 세지 않는다 — 14개 함수가 같은 표를 쓴다', async () => {
    const { client } = fakeClient();
    const rule = [{ identifier: 'same-id', ...MINUTE }];

    for (let i = 0; i < 10; i += 1) await checkRateLimit(client, 'assist', rule);

    await expect(checkRateLimit(client, 'record-prompt', rule)).resolves.toBe(false);
  });

  it('접두사가 다르면 한 요청이 두 번 세이지 않는다', async () => {
    const { client, rows } = fakeClient();

    await checkRateLimit(client, 'record-prompt', [
      { identifier: 'min:install-1', ...MINUTE },
      { identifier: 'minip:1.2.3.4', ...MINUTE },
    ]);

    // 규칙당 정확히 1행. 같은 식별자를 두 규칙에 그대로 쓰면 일 상한이 반토막 난다.
    expect(rows.map((r) => r.identifier).sort()).toEqual(['min:install-1', 'minip:1.2.3.4']);
  });
});

describe('★fail-open — DB 가 죽어도 배급을 막지 않는다', () => {
  it('조회가 실패하면 통과시킨다', async () => {
    const { client } = fakeClient({ failSelect: true });

    await expect(
      checkRateLimit(client, 'record-prompt', [{ identifier: 'min:install-1', ...MINUTE }]),
    ).resolves.toBe(false);
  });

  it('클라이언트가 아예 엉뚱해도 던지지 않는다', async () => {
    await expect(
      checkRateLimit({}, 'record-prompt', [{ identifier: 'min:install-1', ...MINUTE }]),
    ).resolves.toBe(false);
  });
});

describe('차단 기록 트릭 — max:1 이 스스로를 묶는다', () => {
  it('그 분 첫 차단만 1행을 남기고, 두 번째부터는 아무것도 안 남긴다', async () => {
    const { client, rows } = fakeClient();
    const blockedRule = [{ identifier: '1.2.3.4', windowMs: 60_000, max: 1 }];

    // 배급 함수는 반환값을 버리고 부작용(기록)만 쓴다.
    await checkRateLimit(client, 'record-prompt-blocked', blockedRule);
    await checkRateLimit(client, 'record-prompt-blocked', blockedRule);
    await checkRateLimit(client, 'record-prompt-blocked', blockedRule);

    const blocked = rows.filter((r) => r.endpoint === 'record-prompt-blocked');
    expect(blocked).toHaveLength(1);
  });

  it('차단이 있었다는 사실은 SQL 로 셀 수 있다 — 0 이면 아무도 안 막힌 것', async () => {
    const { client, rows } = fakeClient();

    expect(rows.filter((r) => r.endpoint === 'record-prompt-blocked')).toHaveLength(0);
    await checkRateLimit(client, 'record-prompt-blocked', [
      { identifier: '1.2.3.4', windowMs: 60_000, max: 1 },
    ]);
    expect(rows.filter((r) => r.endpoint === 'record-prompt-blocked')).toHaveLength(1);
  });
});
