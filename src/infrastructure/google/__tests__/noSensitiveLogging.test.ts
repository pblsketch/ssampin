/**
 * 구글 인증 경로의 콘솔 로그에 민감 정보가 실리지 않음을 소스에서 고정한다.
 *
 * 로그는 사용자가 기술 지원을 요청할 때 그대로 넘어간다. 이메일, 인증 코드가 든 주소,
 * client_id, redirect_uri, 토큰이 한 번 찍히면 되돌릴 수 없다. 주석의 약속은 깨지므로
 * 이 테스트가 `console.*` 인자 안의 식별자를 직접 본다.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../../../..');

const FILES = [
  'src/infrastructure/google/GoogleOAuthClient.ts',
  'electron/ipc/oauth.ts',
  'electron/ipc/oauthPKCEFallback.ts',
  'src/adapters/stores/useGoogleAccountStore.ts',
  'src/adapters/stores/useCalendarSyncStore.ts',
  'src/usecases/calendar/AuthenticateGoogle.ts',
  'src/adapters/stores/useTasksSyncStore.ts',
];

/** 로그 인자에 식별자로 나오면 안 되는 것. 문자열 리터럴 안의 단어는 검사하지 않는다. */
const FORBIDDEN: readonly RegExp[] = [
  /\bemail\b/,
  /\bredirectUri\b/,
  /\bresolvedRedirectUri\b/,
  /\breq\.url\b/,
  /\bclientId\b/,
  /\bclientSecret\b/,
  /\baccessToken\b/,
  /\brefreshToken\b/,
  /\bcodeVerifier\b/,
  /\bcodeChallenge\b/,
  /\bprimary\b/, // 기본 캘린더의 ID·이름은 사용자 이메일이다
  /\bexistingMapping\.googleCalendarId\b/, // 매핑된 캘린더 ID(기본 캘린더면 이메일)
];

/** 문자열 리터럴을 지우되 템플릿 안의 `${...}` 식은 남긴다. `Boolean(...)` 은 값을 싣지 않으므로 지운다. */
function stripLiterals(args: string): string {
  return args
    .replace(/`([^`]*)`/g, (_m, inner: string) =>
      [...inner.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1]).join(' '),
    )
    .replace(/'[^'\n]*'|"[^"\n]*"/g, '')
    .replace(/Boolean\([^)]*\)/g, '');
}

function consoleCalls(source: string): string[] {
  const out: string[] = [];
  const re = /console\.(?:log|info|warn|error|debug)\(/g;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    // 짝이 맞는 닫는 괄호까지(문자열 안의 괄호는 무시)
    let depth = 1;
    let i = m.index + m[0].length;
    let quote: string | null = null;
    const start = i;
    for (; i < source.length && depth > 0; i += 1) {
      const ch = source[i] as string;
      if (quote) {
        if (ch === '\\') i += 1;
        else if (ch === quote) quote = null;
      } else if (ch === "'" || ch === '"' || ch === '`') quote = ch;
      else if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
    }
    out.push(source.slice(start, i - 1));
  }
  return out;
}

describe('구글 인증 경로 로그에 민감 정보가 없다', () => {
  for (const file of FILES) {
    it(file, () => {
      const source = readFileSync(resolve(ROOT, file), 'utf8');
      const calls = consoleCalls(source);
      const offenders: string[] = [];
      for (const args of calls) {
        const code = stripLiterals(args);
        for (const re of FORBIDDEN) {
          if (re.test(code)) offenders.push(`${re}: console(${args.trim().slice(0, 80)})`);
        }
      }
      expect(offenders).toEqual([]);
    });
  }

  it('검사기가 실제로 찾아낸다(자기 점검)', () => {
    const bad = "console.log('[x] start', { redirectUri, hasVerifier: Boolean(codeVerifier) });";
    const calls = consoleCalls(bad);
    expect(calls).toHaveLength(1);
    expect(FORBIDDEN.some((re) => re.test(stripLiterals(calls[0] as string)))).toBe(true);

    const good = "console.log('[x] email received', { hasVerifier: Boolean(codeVerifier) });";
    const goodCall = consoleCalls(good)[0] as string;
    expect(FORBIDDEN.some((re) => re.test(stripLiterals(goodCall)))).toBe(false);
  });

  it('오류 메시지 조립에 redirect_uri·client_id 가 들어가지 않는다', () => {
    const source = readFileSync(
      resolve(ROOT, 'src/infrastructure/google/GoogleOAuthClient.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/redirect_uri=\$\{/);
    expect(source).not.toMatch(/client_id=\$\{/);
  });
});
