/**
 * URL 축약 (숏링크) Supabase 클라이언트
 *
 * short_links 테이블을 통해 긴 URL을 짧은 코드로 매핑한다.
 * 자동 생성(6자리 영숫자) 또는 커스텀 코드(한글 포함) 지원.
 */

const BASE_URL = 'https://ssampin.vercel.app';
const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const CODE_LENGTH = 6;

/** 예약어 — 숏코드로 사용 불가 */
const RESERVED_CODES = ['admin', 'api', 'submit', 'booking', 'check', 'privacy', 'app', 's'];

function generateCode(): string {
  let result = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    result += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  return result;
}

/**
 * 커스텀 코드 유효성 검증
 * 허용: 영문, 숫자, 한글, 하이픈, 언더스코어 (2~30자)
 */
export function validateCustomCode(code: string): { valid: boolean; error?: string } {
  if (code.length < 2) return { valid: false, error: '2자 이상 입력해주세요' };
  if (code.length > 30) return { valid: false, error: '30자 이하로 입력해주세요' };
  if (!/^[a-zA-Z0-9가-힣\-_]+$/.test(code)) {
    return { valid: false, error: '영문, 숫자, 한글, -, _ 만 사용 가능합니다' };
  }
  if (RESERVED_CODES.includes(code.toLowerCase())) {
    return { valid: false, error: '사용할 수 없는 이름입니다' };
  }
  return { valid: true };
}

export class ShortLinkClient {
  private readonly baseUrl: string;
  private readonly anonKey: string;

  constructor() {
    this.baseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
    this.anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
  }

  /**
   * Supabase REST API 직접 호출 (supabase-js 의존 없이)
   */
  private async query<T>(
    table: string,
    params: string,
    options?: { method?: string; body?: unknown },
  ): Promise<T | null> {
    const url = `${this.baseUrl}/rest/v1/${table}?${params}`;
    const method = options?.method ?? 'GET';

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.anonKey,
        'Authorization': `Bearer ${this.anonKey}`,
        'Prefer': method === 'POST' ? 'return=representation' : 'return=minimal',
      },
      ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
    });

    if (!res.ok) {
      // 409 Conflict (unique violation) → null로 처리
      if (res.status === 409) return null;
      const text = await res.text();
      throw new Error(`ShortLink API error ${res.status}: ${text}`);
    }

    if (method === 'GET') {
      const data = await res.json() as T;
      return data;
    }

    return null;
  }

  /**
   * 커스텀 코드 사용 가능 여부 확인
   */
  async isCodeAvailable(code: string): Promise<boolean> {
    const data = await this.query<Array<{ code: string }>>(
      'short_links',
      `code=eq.${encodeURIComponent(code)}&select=code`,
    );
    return !data || data.length === 0;
  }

  /**
   * 원본 URL에 대한 숏링크를 생성하고 축약된 URL을 반환.
   * 이미 숏링크가 있으면 기존 것을 반환.
   *
   * @param fullUrl 원본 전체 URL
   * @param customCode 사용자 지정 코드 (선택)
   * @param expiresAt 만료일시 ISO 8601 (선택, 기본 90일)
   * @returns 축약된 URL (예: "https://ssampin.vercel.app/s/Xk3mP9")
   */
  async createShortLink(fullUrl: string, customCode?: string, expiresAt?: string): Promise<string> {
    const expires = expiresAt ?? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const targetPath = fullUrl.replace(BASE_URL, '');

    // 이미 존재하는 숏링크 확인
    const existing = await this.query<Array<{ code: string }>>(
      'short_links',
      `target_path=eq.${encodeURIComponent(targetPath)}&select=code&limit=1`,
    );

    if (existing && existing.length > 0 && existing[0]) {
      return `${BASE_URL}/s/${existing[0].code}`;
    }

    // 커스텀 코드가 있으면 사용
    if (customCode) {
      const validation = validateCustomCode(customCode);
      if (!validation.valid) throw new Error(validation.error);

      const url = `${this.baseUrl}/rest/v1/short_links`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.anonKey,
          'Authorization': `Bearer ${this.anonKey}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ code: customCode, target_path: targetPath, expires_at: expires }),
      });

      if (!res.ok) {
        if (res.status === 409) throw new Error('이미 사용 중인 링크입니다');
        throw new Error(`숏링크 생성 실패: ${res.status}`);
      }
      return `${BASE_URL}/s/${customCode}`;
    }

    // 자동 코드 생성 (충돌 시 최대 3회 재시도)
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = generateCode();
      const url = `${this.baseUrl}/rest/v1/short_links`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.anonKey,
          'Authorization': `Bearer ${this.anonKey}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ code, target_path: targetPath, expires_at: expires }),
      });

      if (res.ok) {
        return `${BASE_URL}/s/${code}`;
      }
      // 409 unique 충돌이면 재시도, 다른 에러면 throw
      if (res.status !== 409) {
        throw new Error(`숏링크 생성 실패: ${res.status}`);
      }
    }

    // 3회 실패 시 원본 URL 반환 (fallback)
    return fullUrl;
  }
}
