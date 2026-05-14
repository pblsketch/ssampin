import { describe, it, expect } from 'vitest';
import { isPrivateIP, normalizeHostname, resolveAndVetHost, safeFetchText } from './safeFetch';

describe('safeFetch — isPrivateIP', () => {
  it('사설/예약 IPv4 대역을 차단', () => {
    for (const ip of [
      '10.0.0.1',
      '172.16.5.4',
      '172.31.255.255',
      '192.168.1.1',
      '127.0.0.1',
      '169.254.169.254', // 클라우드 메타데이터 — 대표적 SSRF 표적
      '0.0.0.0',
      '100.64.0.1', // CGNAT
      '224.0.0.1', // multicast
      '255.255.255.255',
    ]) {
      expect(isPrivateIP(ip), ip).toBe(true);
    }
  });

  it('공인 IPv4 는 통과', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.0.1', '172.32.0.1']) {
      expect(isPrivateIP(ip), ip).toBe(false);
    }
  });

  it('IPv6 loopback/ULA/link-local/multicast 차단, 공인 통과', () => {
    expect(isPrivateIP('::1')).toBe(true);
    expect(isPrivateIP('fc00::1')).toBe(true);
    expect(isPrivateIP('fd12:3456::1')).toBe(true);
    expect(isPrivateIP('fe80::1')).toBe(true);
    expect(isPrivateIP('ff02::1')).toBe(true);
    expect(isPrivateIP('::ffff:127.0.0.1')).toBe(true); // IPv4-mapped loopback
    expect(isPrivateIP('2606:4700:4700::1111')).toBe(false); // Cloudflare DNS
  });

  it('파싱 불가 문자열은 안전측(차단)', () => {
    expect(isPrivateIP('not-an-ip')).toBe(true);
    expect(isPrivateIP('')).toBe(true);
  });
});

describe('safeFetch — normalizeHostname', () => {
  it('소문자화 + trailing dot 제거', () => {
    expect(normalizeHostname('EXAMPLE.COM.')).toBe('example.com');
    expect(normalizeHostname('Example.Com')).toBe('example.com');
  });
});

describe('safeFetch — resolveAndVetHost', () => {
  it('localhost/.internal/.local 호스트명 직접 차단', async () => {
    await expect(resolveAndVetHost('localhost')).rejects.toThrow();
    await expect(resolveAndVetHost('foo.internal')).rejects.toThrow();
    await expect(resolveAndVetHost('bar.local')).rejects.toThrow();
    await expect(resolveAndVetHost('x.localhost')).rejects.toThrow();
  });

  it('사설 IP 리터럴 호스트 차단', async () => {
    await expect(resolveAndVetHost('169.254.169.254')).rejects.toThrow();
    await expect(resolveAndVetHost('127.0.0.1')).rejects.toThrow();
    await expect(resolveAndVetHost('::1')).rejects.toThrow();
  });
});

describe('safeFetch — safeFetchText input validation', () => {
  it('비-http(s) 프로토콜 거부', async () => {
    await expect(safeFetchText('file:///etc/passwd')).rejects.toThrow();
    await expect(safeFetchText('ftp://example.com/x')).rejects.toThrow();
  });

  it('localhost / 사설 IP / 메타데이터 호스트 거부 (네트워크 도달 전 차단)', async () => {
    await expect(safeFetchText('http://localhost:8080/x')).rejects.toThrow();
    await expect(safeFetchText('http://127.0.0.1/x')).rejects.toThrow();
    await expect(safeFetchText('http://169.254.169.254/latest/meta-data/')).rejects.toThrow();
    await expect(safeFetchText('http://192.168.1.1/x')).rejects.toThrow();
  });

  it('빈/과대 URL 거부', async () => {
    await expect(safeFetchText('')).rejects.toThrow();
    await expect(safeFetchText('http://example.com/' + 'a'.repeat(5000))).rejects.toThrow();
  });
});
