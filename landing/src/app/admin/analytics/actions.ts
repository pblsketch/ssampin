'use server';

// ── 관리자 "지금 갱신" ──
// migration 076 의 analytics_request_refresh() 가 1분 뒤 한 번 도는 롤업 갱신을 예약한다.
// 갱신은 2~3분 걸려 여기서 끝까지 기다리지 않는다 — 화면이 checkRollupRefresh 로 끝났는지 묻는다.

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { fetchRpc } from './_lib/supabase';
import type { RollupStatusRow } from './_lib/types';

export type RefreshRequestResult =
  | { ok: true; state: 'queued' | 'running'; baseline: string | null }
  | { ok: false; error: string };

export type RefreshCheckResult =
  | { state: 'waiting' }
  | { state: 'done'; durationMs: number | null }
  | { state: 'failed'; error: string };

/** 페이지 보호(middleware)는 서버 액션까지 막아 주지 않는다 — 직접 POST 로도 불리므로 여기서 다시 본다. */
async function isAdmin(): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const cookie = (await cookies()).get('admin_auth')?.value;
  return Boolean(adminPassword) && cookie === adminPassword;
}

async function loadStatusNow(): Promise<RollupStatusRow | null> {
  const rows = await fetchRpc<RollupStatusRow>('analytics_rollup_status', undefined, 0);
  return rows[0] ?? null;
}

export async function requestRollupRefresh(): Promise<RefreshRequestResult> {
  if (!(await isAdmin())) return { ok: false, error: '관리자 로그인이 필요합니다' };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, error: 'Supabase 환경 변수가 없습니다' };

  // 완료 판정 기준값. 화면에 찍힌 값은 캐시(60초)라 늦을 수 있어 지금 값을 다시 읽는다.
  const baseline = (await loadStatusNow())?.refreshed_at ?? null;

  const res = await fetch(`${url}/rest/v1/rpc/analytics_request_refresh`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
    cache: 'no-store',
  });
  if (!res.ok) {
    console.error(`[Analytics] RPC "analytics_request_refresh" failed: ${res.status}`);
    return {
      ok: false,
      error:
        res.status === 404
          ? '갱신 예약 함수가 없습니다 — migration 076 적용 여부를 확인하세요'
          : `갱신을 예약하지 못했습니다 (${res.status})`,
    };
  }

  const state: unknown = await res.json();
  if (state !== 'queued' && state !== 'running') {
    return { ok: false, error: '갱신 예약 응답을 이해하지 못했습니다' };
  }
  return { ok: true, state, baseline };
}

export async function checkRollupRefresh(baseline: string | null): Promise<RefreshCheckResult> {
  if (!(await isAdmin())) return { state: 'failed', error: '관리자 로그인이 필요합니다' };

  const status = await loadStatusNow();
  if (status?.refreshed_at && status.refreshed_at !== baseline) {
    // 탭 집계는 5분 캐시라, 이걸 안 하면 "집계 기준"만 바뀌고 숫자는 그대로 남는다.
    revalidatePath('/admin/analytics');
    return { state: 'done', durationMs: status.duration_ms };
  }
  // 예약할 때 last_error 를 비웠으므로, 다시 차 있으면 이번 갱신이 실패한 것이다.
  if (status?.last_error) return { state: 'failed', error: status.last_error };
  return { state: 'waiting' };
}
