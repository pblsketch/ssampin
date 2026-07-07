// ── Supabase REST 호출 단일 헬퍼 (서버 사이드 전용) ──
// page.tsx 안에 4벌로 복사돼 있던 fetch 본문(환경변수 읽기 · apikey/Authorization
// 헤더 · cache:'no-store' · !res.ok 처리)을 한 함수로 통합한다.
// 생성되는 REST URL/파라미터는 통합 이전과 동일하다.

export interface FetchTableOptions {
  /** PostgREST select 절. 기본값 '*' */
  select?: string;
  /** order 절 (예: 'created_at.desc') */
  order?: string;
  /** 행 수 제한. 기본값 200 */
  limit?: number;
  /** 날짜 필터를 적용할 컬럼명 */
  dateColumn?: string;
  dateFrom?: string | null;
  dateTo?: string | null;
}

/**
 * Supabase REST(PostgREST)에서 한 테이블/뷰를 조회한다.
 * 환경 변수가 없으면 빈 배열을 반환해 화면이 "데이터 없음"으로 안전하게 동작한다.
 */
export async function fetchTable<T>(table: string, options?: FetchTableOptions): Promise<T[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return [];

  const select = options?.select ?? '*';
  const limit = options?.limit ?? 200;
  let queryUrl = `${url}/rest/v1/${table}?select=${select}&limit=${limit}`;
  if (options?.order) {
    queryUrl += `&order=${options.order}`;
  }
  if (options?.dateColumn && options?.dateFrom) {
    queryUrl += `&${options.dateColumn}=gte.${options.dateFrom}`;
  }
  if (options?.dateColumn && options?.dateTo) {
    queryUrl += `&${options.dateColumn}=lte.${options.dateTo}`;
  }

  const res = await fetch(queryUrl, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    console.error(`[Analytics] Table "${table}" fetch failed: ${res.status}`);
    return [];
  }
  return res.json();
}

/**
 * Supabase RPC(PostgREST 함수)를 GET 으로 호출한다. 뷰로는 불가능한 임의 기간 집계용.
 * null/빈 인자는 생략 → 함수의 DEFAULT(NULL) 가 적용된다(전체 기간).
 * 환경 변수가 없거나 함수가 없으면(404) 빈 배열을 반환해 화면이 안전하게 동작한다.
 */
export async function fetchRpc<T>(
  fn: string,
  params?: Record<string, string | null | undefined>,
): Promise<T[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return [];

  const qs = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.set(k, v);
    }
  }
  const query = qs.toString();
  const queryUrl = `${url}/rest/v1/rpc/${fn}${query ? `?${query}` : ''}`;

  const res = await fetch(queryUrl, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    console.error(`[Analytics] RPC "${fn}" failed: ${res.status}`);
    return [];
  }
  return res.json();
}

interface SignedUrlItem {
  path?: string;
  signedURL?: string;
  signedUrl?: string;
  error?: string | null;
}

/**
 * private Storage 버킷의 파일들에 대해 임시 서명 URL을 일괄 발급한다.
 * 관리자 화면(브라우저)에 직접 노출해도 되도록 시간 제한을 둔다 — 버킷 자체는
 * service_role만 접근 가능해 서명 URL 없이는 열람 불가.
 * 환경 변수 누락/요청 실패 시 빈 객체를 반환해 화면은 안전하게 "이미지 없음"으로 동작한다.
 */
export async function signStorageUrls(
  bucket: string,
  paths: string[],
  expiresIn = 3600,
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return {};

  const res = await fetch(`${url}/storage/v1/object/sign/${bucket}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn, paths }),
    cache: 'no-store',
  });

  if (!res.ok) {
    console.error(`[Analytics] Storage sign "${bucket}" failed: ${res.status}`);
    return {};
  }

  const items = (await res.json()) as SignedUrlItem[];
  const map: Record<string, string> = {};
  for (const item of items) {
    const signed = item.signedURL ?? item.signedUrl;
    if (item.path && signed) {
      map[item.path] = `${url}/storage/v1${signed}`;
    }
  }
  return map;
}
