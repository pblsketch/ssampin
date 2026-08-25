/**
 * URL 축약 (숏링크) Supabase 클라이언트
 *
 * short_links 테이블을 통해 긴 URL을 짧은 코드로 매핑한다.
 * 자동 생성(6자리 영숫자) 또는 커스텀 코드(한글 포함) 지원.
 */

import { SITE_URL } from '@config/siteUrl';

const BASE_URL = SITE_URL;
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
   * 스칼라를 돌려주는 RPC 호출.
   *
   * 실패를 예외로 올리지 않고 null 로 접는다. 이 경로를 쓰는 곳은 "기존 숏링크가
   * 있으면 재사용"이라는 **선택적** 최적화라, 조회가 안 되면 새 코드를 만들면 그만이다.
   * 여기서 throw 하면 숏링크 생성 자체가 실패한다.
   */
  private async rpcScalar<T>(fn: string, body: Record<string, unknown>): Promise<T | null> {
    if (!this.baseUrl || !this.anonKey) return null;
    try {
      const res = await fetch(`${this.baseUrl}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.anonKey,
          Authorization: `Bearer ${this.anonKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      return (await res.json()) as T | null;
    } catch {
      return null;
    }
  }

  /**
   * 커스텀 코드 사용 가능 여부 확인
   *
   * 예전에는 `?code=eq.X&select=code` 로 테이블을 읽었다. 그 경로를 남겨두면
   * 필터를 뺀 `?select=code` 로 코드가 전량 나오고, 그 코드를 resolve_short_link 에
   * 넣으면 target_path(관리 키 포함)를 회수할 수 있다 — 058 이 무의미해진다.
   * 지금은 여부(boolean)만 받는다 — 마이그레이션 057.
   *
   * 실패하면 던진다. 호출부(생성 모달들)가 catch 해서 안내 문구만 지우고,
   * 실제 중복은 생성 단계의 409 가 잡는다.
   */
  async isCodeAvailable(code: string): Promise<boolean> {
    if (!this.baseUrl || !this.anonKey) {
      throw new Error('Supabase is not configured');
    }
    const res = await fetch(`${this.baseUrl}/rest/v1/rpc/is_short_code_available`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.anonKey,
        Authorization: `Bearer ${this.anonKey}`,
      },
      body: JSON.stringify({ p_code: code }),
    });
    if (!res.ok) {
      throw new Error(`ShortLink API error ${res.status}`);
    }
    return (await res.json()) as boolean;
  }

  /**
   * 원본 URL에 대한 숏링크를 생성하고 축약된 URL을 반환.
   * 이미 숏링크가 있으면 기존 것을 반환.
   *
   * @param fullUrl 원본 전체 URL
   * @param customCode 사용자 지정 코드 (선택)
   * @param expiresAt 만료일시 ISO 8601 (선택, 기본 90일)
   * @returns 축약된 URL (예: "https://ssampin.com/s/Xk3mP9")
   */
  async createShortLink(fullUrl: string, customCode?: string, expiresAt?: string): Promise<string> {
    if (!this.baseUrl || !this.anonKey) return fullUrl;
    const expires = expiresAt ?? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const targetPath = fullUrl.replace(BASE_URL, '');

    // 커스텀 코드가 없을 때만 기존 숏링크 재사용.
    //
    // 예전에는 target_path 로 테이블을 직접 조회했다. 그 칸은 공유 링크 원문을
    // 통째로 담아 관리 키까지 딸려 나온다. 지금은 목적지를 이미 아는 호출자만
    // code 를 받는다 — 057.
    if (!customCode) {
      const existingCode = await this.rpcScalar<string>('find_short_code_by_target', {
        p_target_path: targetPath,
      });
      if (existingCode) {
        return `${BASE_URL}/s/${existingCode}`;
      }
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
          apikey: this.anonKey,
          Authorization: `Bearer ${this.anonKey}`,
          Prefer: 'return=minimal',
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
          apikey: this.anonKey,
          Authorization: `Bearer ${this.anonKey}`,
          Prefer: 'return=minimal',
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
