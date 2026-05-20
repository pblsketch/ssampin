/**
 * extractAuthCode — OAuth callback URL 파싱 회귀 테스트
 *
 * 사용자 신고 (2026-05-19): 구글 동의 후 브라우저 주소창에
 * `http://127.0.0.1:61911/callback?iss=...&code=4/0AeoWuM...&scope=...&authuser=0&prompt=consent`
 * 가 그대로 남는 케이스. 이 URL 을 PKCE 모달에 붙여넣어도 code 추출이 되도록 보장.
 */
import { describe, it, expect } from 'vitest';
import { extractAuthCode } from '../useGoogleAccountStore';

describe('extractAuthCode — OAuth callback URL parsing', () => {
  it('2026-05-19 사용자 신고 URL (iss + code + scope + prompt=consent) 을 파싱한다', () => {
    const reportedUrl =
      'http://127.0.0.1:61911/callback?iss=https://accounts.google.com' +
      '&code=4/0AeoWuM-w-SrEpXIwYWygUONe5XyoguyZtGEMQpdMPL8CPNkGqj2q2aUy4qHc9ZMIe2YYLg' +
      '&scope=email%20https://www.googleapis.com/auth/drive.file' +
      '&authuser=0&prompt=consent';
    expect(extractAuthCode(reportedUrl)).toBe(
      '4/0AeoWuM-w-SrEpXIwYWygUONe5XyoguyZtGEMQpdMPL8CPNkGqj2q2aUy4qHc9ZMIe2YYLg',
    );
  });

  it('raw code (슬래시 포함) 을 그대로 반환', () => {
    expect(extractAuthCode('4/0AeoWuM-w-Sr_xyz')).toBe('4/0AeoWuM-w-Sr_xyz');
  });

  it('code=... 단편을 추출', () => {
    expect(extractAuthCode('code=4/0AeoWuM-abc&scope=email')).toBe('4/0AeoWuM-abc');
  });

  it('빈 문자열 / 공백은 null', () => {
    expect(extractAuthCode('')).toBeNull();
    expect(extractAuthCode('   ')).toBeNull();
    expect(extractAuthCode('\n\t')).toBeNull();
  });

  it('URL 디코딩이 필요한 code 도 처리 (%2F → /)', () => {
    const url = 'http://127.0.0.1:1234/callback?code=4%2F0Acv-xyz';
    expect(extractAuthCode(url)).toBe('4/0Acv-xyz');
  });

  it('https URL 도 동일하게 처리', () => {
    expect(extractAuthCode('https://example.com/cb?code=4/0Acv')).toBe('4/0Acv');
  });

  it('code 없는 URL 은 null (raw code 패턴에도 매칭 안 됨)', () => {
    expect(extractAuthCode('http://127.0.0.1:1234/callback?error=access_denied')).toBeNull();
  });

  it('전후 공백을 trim 한다', () => {
    expect(extractAuthCode('  4/0Acv-xyz  ')).toBe('4/0Acv-xyz');
    expect(extractAuthCode('\n  code=4/0Acv  \n')).toBe('4/0Acv');
  });

  it('URL 파싱 실패 시 code= 단편 매칭으로 폴백', () => {
    // 잘못된 URL 형태지만 code= 단편이 있는 경우
    expect(extractAuthCode('blah blah ?code=4/0Acv-fallback&extra')).toBe('4/0Acv-fallback');
  });

  it('raw code 패턴 — 영숫자, 슬래시, 하이픈, 언더스코어만 허용', () => {
    expect(extractAuthCode('4/0Acv-xyz_ABC')).toBe('4/0Acv-xyz_ABC');
    // 공백 포함은 raw 로 인정 안 됨
    expect(extractAuthCode('4/0Acv xyz')).toBeNull();
    // 특수문자 포함은 raw 로 인정 안 됨
    expect(extractAuthCode('4/0Acv@xyz')).toBeNull();
  });
});
