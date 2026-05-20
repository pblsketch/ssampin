# Design — OAuth 콜백 URL 정지 버그 (핫픽스)

- **작성일**: 2026-05-19
- **갱신일**: 2026-05-19 (안드레카파시 fix `052cf33` 통합 반영, Layer 2 폐기)
- **Plan**: [`docs/01-plan/features/oauth-callback-stuck.plan.md`](../../01-plan/features/oauth-callback-stuck.plan.md)
- **우선순위**: 🔴 P0 핫픽스
- **선행 fix**: `052cf33` (다른 세션, `fix/modal-scroll-overflow` 브랜치) — 진짜 근본 원인(`client_secret` 누락) 해결
- **본 PDCA 범위**: Layer 1 (콜백 페이지 UX) + Layer 3 (회귀 메타테스트)

---

## 0. 가설 검증 결과 (Plan vs 실제)

진짜 에러 메시지: `Token exchange failed: 400 invalid_request, "client_secret is missing"`

| Plan 가설                      | 결과                     | 비고                                                                                                                                                                                              |
| ------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. 로컬 서버 콜백 도착 전 종료 | ❌ 틀림                  | 콜백 정상 수신, 토큰 교환에서 실패                                                                                                                                                                |
| B. 학교망 localhost 차단       | ❌ 틀림                  | localhost 동작 정상                                                                                                                                                                               |
| C. Electron IPC 끊김           | ❌ 틀림                  |                                                                                                                                                                                                   |
| D. supersede 경합              | ❌ 틀림                  |                                                                                                                                                                                                   |
| **실제 원인**                  | **`client_secret` 누락** | security-hardening P0-C 에서 Desktop app 클라이언트도 PKCE 만으로 가능하다고 가정해 secret 을 렌더러 번들에서 제거했으나, Google "Desktop app" 토큰 엔드포인트는 실제로 `client_secret` 을 요구함 |

### 052cf33 의 fix

[src/infrastructure/google/GoogleOAuthClient.ts](../../../src/infrastructure/google/GoogleOAuthClient.ts) + [vite.config.ts](../../../vite.config.ts):

- `clientSecret` 필드 복원 + `exchangeCode`/`refreshTokens` 양쪽에 `client_secret` 추가
- `vite.config.ts` define 에 `process.env.GOOGLE_CLIENT_SECRET = VITE_GOOGLE_CLIENT_SECRET` 주입 복원

### 보안 영향 평가

- security-hardening P0-C / F-2(High) **부분 회귀** — 데스크톱 한정, 모바일 Edge Function 경로(`supabase/functions/oauth-exchange`)는 그대로 유지.
- Google 공식 입장: [Desktop(installed) 클라이언트의 client_secret 은 "기밀이 아님"](https://developers.google.com/identity/protocols/oauth2/native-app) (RFC 8252) — native app secret 은 추출 가능하다고 명시됨. 따라서 빌드 산출물 노출 자체가 실효 위협은 작음.
- P0-C 감사(`security-audit.analysis.md:211`) 권장사항 (b) "데스크톱 native client 타입이라 secret 이 정말 필요 없는지 Google Cloud Console 에서 client type 재확인 후 제거" — **재확인 결과 secret 이 필요함**으로 판명.
- 후속: [docs/04-report/features/security-hardening.report.md](../../04-report/features/security-hardening.report.md) 에 데스크톱 secret 복원 결정 메모 추가 (Layer 0).

---

## 0.5. 변경 파일 목록

| #   | 파일                                                                                                                    | 변경 유형 | 핵심 변경                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [electron/ipc/oauth.ts](../../../electron/ipc/oauth.ts)                                                                 | Modify    | (a) `buildCallbackSuccessHtml` / `buildCallbackErrorHtml` 함수 추출 + export, (b) 응답 HTML 에 `window.close()` + 5초 카운트다운 스크립트, (c) 에러 메시지 HTML escape |
| 2   | [src/adapters/stores/useGoogleAccountStore.ts](../../../src/adapters/stores/useGoogleAccountStore.ts)                   | Modify    | `extractAuthCode` 함수 export (테스트 노출용)                                                                                                                          |
| 3   | [electron/ipc/oauth.callback-html.test.ts](../../../electron/ipc/oauth.callback-html.test.ts)                           | New       | 콜백 응답 HTML 메타테스트 (`window.close()` 포함, escape 검증)                                                                                                         |
| 4   | [src/adapters/stores/**tests**/extractAuthCode.test.ts](../../../src/adapters/stores/__tests__/extractAuthCode.test.ts) | New       | 신고 URL 파싱 회귀 테스트 — `127.0.0.1:61911/callback?iss=...&code=4/0AeoWuM...&scope=...&authuser=0&prompt=consent`                                                   |
| 5   | [docs/04-report/features/security-hardening.report.md](../../04-report/features/security-hardening.report.md)           | Modify    | "후속: 데스크톱 secret 복원 결정 (2026-05-19)" 메모 추가                                                                                                               |

### ❌ 폐기된 변경 (Layer 2)

원래 Design 의 Layer 2 (`pendingOAuthInfo` 복구 + `oauth:recover-pending-info` IPC + `recoverPendingOAuth` preload + `OAuthModalsProvider` 폴백 모달 강화) 는 가설이 틀려 폐기. 콜백은 정상 수신되므로 복구 로직 자체가 불필요.

---

## 1. Layer 1 — 콜백 페이지 자체 견고화

### 1.1 응답 HTML 자동 닫기 + 명시 안내 ([electron/ipc/oauth.ts:152-189](../../../electron/ipc/oauth.ts#L152-L189))

**Before**:

```html
<body>
  <h1>✅</h1>
  <h2>쌤핀 인증 완료!</h2>
  <p>이 창을 닫고 쌤핀으로 돌아가세요.</p>
</body>
```

**After** (성공 케이스):

```html
<body>
  <h1>✅</h1>
  <h2>쌤핀 인증 완료!</h2>
  <p id="countdown">잠시 후 이 창이 자동으로 닫혀요...</p>
  <p style="font-size:13px;color:#64748b;margin-top:24px">
    창이 닫히지 않으면 직접 닫고 쌤핀으로 돌아가세요.
  </p>
  <script>
    let n = 5;
    const el = document.getElementById('countdown');
    const tick = setInterval(() => {
      n--;
      if (n > 0) {
        el.textContent = n + '초 후 자동으로 닫힙니다...';
      } else {
        clearInterval(tick);
        el.textContent = '창을 닫는 중입니다...';
        try {
          window.close();
        } catch (e) {
          /* 브라우저가 거부하면 무시 */
        }
      }
    }, 1000);
  </script>
</body>
```

**근거**:

- Chrome/Edge는 `window.opener` 또는 scripted-open 페이지가 아닌 경우 `window.close()` 를 거부할 수 있음 (정책상 보안 차단). 거부 시 사용자가 직접 닫도록 폴백 텍스트 명시.
- 5초 카운트다운: 사용자가 "인증 완료" 메시지를 읽을 시간 + 자동 닫기 시도.
- 실패 케이스(error)도 동일한 자동 닫기 적용하되, 에러 메시지를 더 오래(10초) 노출.

### 1.2 단계별 타임스탬프 로그 ([electron/ipc/oauth.ts:142-145, 167, 193-196](../../../electron/ipc/oauth.ts#L142-L196))

```ts
const t0 = Date.now();
console.log('[oauth] callback request', { url: req.url, path: parsedUrl.pathname, t: t0 });
// ...
console.log('[oauth] callback parsed', { hasCode: Boolean(code), error, dt_ms: Date.now() - t0 });
// ...
console.log('[oauth] response sent', { hasCode: Boolean(code), dt_ms: Date.now() - t0 });
// ...
setTimeout(() => {
  console.log('[oauth] server closing (post-callback)', { dt_ms: Date.now() - t0 });
  server.close();
  oauthServer = null;
}, 1000);
```

서버 listen 시작 시점도 기록(`server.listen` 콜백 내부)하여 "Google 동의까지 걸린 시간" 측정 가능.

---

## 2. Layer 2 — ❌ 폐기 (2026-05-19 갱신)

> 원래 가설: 콜백이 안 도착하면 사용자가 본 URL 을 PKCE 모달에 붙여넣어 복구.
>
> **폐기 사유**: 실제 에러는 콜백 도착 후 토큰 교환 단계의 `client_secret` 누락이었고, `052cf33` 이 진짜 원인을 해결함. 콜백은 정상 수신되므로 복구 로직 자체가 불필요.
>
> **이하 원안은 향후 참조용으로만 보존.**

<details>
<summary>원안 (사용 안 함)</summary>

### 2.1 OAuth start 의 pending 정보 보관 ([electron/ipc/oauth.ts:13-15](../../../electron/ipc/oauth.ts#L13))

**현재 문제**: `oauth:start` 가 reject 되면 사용자는 브라우저에 남은 `?code=...` URL을 갖고 있지만, 토큰 교환에 필요한 `codeVerifier` + `redirectUri` 는 closure 안에서 사라짐. PKCE 폴백 모달은 별도 `pendingPKCE` 흐름을 쓰므로 사용자가 신고 URL을 그대로 붙여넣어도 verifier 가 안 맞아 실패.

**해법**: OAuth start 시작 직후 모듈 스코프에 정보 보관, 종료/타임아웃 후에도 일정 시간 유지.

```ts
// 새로운 모듈 스코프
interface PendingOAuthInfo {
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
  consumed: boolean;
}
let pendingOAuthInfo: PendingOAuthInfo | null = null;

// oauth:start 내부 server.listen 콜백
oauthServer = server;
const redirectUri = `http://127.0.0.1:${port}/callback`;
resolvedRedirectUri = redirectUri;
pendingOAuthInfo = {
  codeVerifier,
  redirectUri,
  createdAt: Date.now(),
  consumed: false,
};

// 정상 wrappedResolve 시 consumed = true
const wrappedResolve = (code: string) => {
  // ...
  if (pendingOAuthInfo) pendingOAuthInfo.consumed = true;
  resolve({ code, redirectUri: resolvedRedirectUri, codeVerifier });
};

// 새 IPC 핸들러
ipcMain.handle(
  'oauth:recover-pending-info',
  (): { codeVerifier: string; redirectUri: string } | null => {
    if (!pendingOAuthInfo) return null;
    if (pendingOAuthInfo.consumed) return null;
    const ageMs = Date.now() - pendingOAuthInfo.createdAt;
    // 30분 이상 지난 정보는 폐기 (PKCE 의 일반적인 유효 시간)
    if (ageMs > 30 * 60 * 1000) {
      pendingOAuthInfo = null;
      return null;
    }
    return {
      codeVerifier: pendingOAuthInfo.codeVerifier,
      redirectUri: pendingOAuthInfo.redirectUri,
    };
  },
);
```

**보안 영향 분석**:

- `codeVerifier` 는 메모리 상 비밀이지만, 단일 사용자의 같은 OAuth 흐름 내에서만 유효 (Google이 challenge 와 매칭).
- 30분 만료 → PKCE RFC 권장 (`code` 자체가 보통 10분 이내 만료되므로 충분).
- `consumed` 플래그 → 한 번 토큰 교환에 사용되면 재사용 불가, replay 방어.
- 새 `oauth:start` 호출이 들어오면 `pendingOAuthInfo = null` 으로 초기화 (이미 supersede 로직 있음).

### 2.2 Renderer: pending info 복구 + 토큰 교환 ([src/adapters/stores/useGoogleAccountStore.ts](../../../src/adapters/stores/useGoogleAccountStore.ts))

`completePKCEAuth` 가 PKCE start 의 `pendingPKCE` 만 보고 있는데, OAuth start 흐름의 `pendingOAuthInfo` 도 우선 시도하도록 변경.

```ts
completePKCEAuth: async (codeOrUrl: string) => {
  set({ isLoading: true, error: null });
  try {
    const api = window.electronAPI;
    const code = extractAuthCode(codeOrUrl);
    if (!code) {
      throw new Error('인증 코드를 찾지 못했습니다...');
    }

    // 1순위: OAuth start 흐름의 pending info (사용자가 신고 URL을 그대로 붙여넣은 경우)
    let verifier: string | null = null;
    let redirectUri: string | null = null;
    if (api?.recoverPendingOAuth) {
      const recovered = await api.recoverPendingOAuth();
      if (recovered) {
        verifier = recovered.codeVerifier;
        redirectUri = recovered.redirectUri;
        console.log('[GoogleAccount] using recovered OAuth start info');
      }
    }

    // 2순위: PKCE start 흐름의 pendingPKCE
    if (!verifier || !redirectUri) {
      if (!api?.exchangePKCECode) {
        throw new Error('PKCE 인증은 데스크톱 앱에서만 가능합니다.');
      }
      const pkce = await api.exchangePKCECode();
      verifier = pkce.verifier;
      redirectUri = pkce.redirectUri;
    }

    const { authenticateGoogle } = await import('@adapters/di/container');
    const tokens = await authenticateGoogle.authenticate(code, redirectUri, verifier);
    // ... (이하 동일)
  } catch (err) {
    // ...
  }
},
```

### 2.3 Fallback Suggestion Modal 문구 강화 ([src/adapters/components/Settings/modals/OAuthModalsProvider.tsx:185-242](../../../src/adapters/components/Settings/modals/OAuthModalsProvider.tsx#L185-L242))

**추가**: "이미 구글 로그인 화면에서 동의를 누르고, 주소창에 `127.0.0.1:.../callback?code=...` 가 표시되어 있나요? 그러면 그 URL을 그대로 복사해서 수동 인증으로 전환하세요." 안내.

```tsx
<div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-4">
  <p className="text-sm font-medium text-blue-400 mb-1">수동 인증 방식으로 전환할까요?</p>
  <p className="text-xs text-sp-muted mb-2">
    Google이 표시하는 인증 코드를 직접 입력하는 방식입니다. 보안 프로그램의 영향을 받지 않아요.
  </p>
  {/* 신규 안내 */}
  <p className="text-xs text-sp-muted bg-sp-surface rounded p-2 mt-2">
    💡 이미 브라우저 주소창에 <code className="text-sp-text">127.0.0.1:.../callback?code=...</code>{' '}
    가 떠 있다면, 그 URL을 그대로 다음 단계에서 붙여넣으면 됩니다.
  </p>
</div>
```

</details>

---

## 3. Layer 3 — 진단 + 메타테스트

### 3.1 콜백 응답 HTML 메타테스트 ([electron/**tests**/oauth-callback-html.test.ts](../../../electron/__tests__/oauth-callback-html.test.ts) — 신규)

`oauth.ts` 의 응답 HTML 빌더를 추출해 별도 함수로 만들고, 테스트 가능하게 export.

```ts
// electron/ipc/oauth.ts 에서 export
export function buildCallbackSuccessHtml(): string {
  /* ... */
}
export function buildCallbackErrorHtml(error: string): string {
  /* ... */
}
```

테스트:

```ts
import { describe, it, expect } from 'vitest';
import { buildCallbackSuccessHtml, buildCallbackErrorHtml } from '../ipc/oauth';

describe('OAuth callback HTML', () => {
  it('성공 HTML 은 window.close() 스크립트를 포함한다', () => {
    const html = buildCallbackSuccessHtml();
    expect(html).toContain('window.close()');
    expect(html).toContain('countdown');
    expect(html).toContain('5'); // 5초 카운트다운
  });

  it('성공 HTML 은 자동 닫기 실패 폴백 안내를 포함한다', () => {
    const html = buildCallbackSuccessHtml();
    expect(html).toMatch(/창이 닫히지 않으면/);
  });

  it('에러 HTML 은 사용자 메시지를 안전하게 이스케이프한다', () => {
    const html = buildCallbackErrorHtml('<script>alert(1)</script>');
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;script&gt;');
  });
});
```

### 3.2 extractAuthCode 신고 URL 회귀 테스트 ([src/adapters/stores/**tests**/extractAuthCode.test.ts](../../../src/adapters/stores/__tests__/extractAuthCode.test.ts) — 신규)

`useGoogleAccountStore.ts:11-30` 의 `extractAuthCode` 를 export 하여 테스트.

```ts
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

  it('빈 문자열은 null', () => {
    expect(extractAuthCode('')).toBeNull();
    expect(extractAuthCode('   ')).toBeNull();
  });

  it('URL 디코딩이 필요한 code 도 처리', () => {
    // code 값이 URL-encoded 인 경우 (예: %2F → /)
    const url = 'http://127.0.0.1:1234/callback?code=4%2F0Acv-xyz';
    expect(extractAuthCode(url)).toBe('4/0Acv-xyz');
  });
});
```

### 3.3 ❌ 폐기 — pending OAuth info 복구 테스트

Layer 2 폐기에 따라 본 메타테스트도 폐기.

<details>
<summary>원안 (사용 안 함)</summary>

#### electron/**tests**/oauth-recover.test.ts — 신규

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { __testing__ } from '../ipc/oauth';

const { setPendingOAuthInfo, getPendingOAuthInfoForRecover, clearPendingOAuthInfo } = __testing__;

describe('pendingOAuthInfo recovery', () => {
  beforeEach(() => clearPendingOAuthInfo());

  it('consumed=false 면 verifier+redirectUri 반환', () => {
    setPendingOAuthInfo({ codeVerifier: 'v1', redirectUri: 'http://127.0.0.1:1234/callback' });
    expect(getPendingOAuthInfoForRecover()).toEqual({
      codeVerifier: 'v1',
      redirectUri: 'http://127.0.0.1:1234/callback',
    });
  });

  it('consumed=true 면 null', () => {
    setPendingOAuthInfo({ codeVerifier: 'v1', redirectUri: 'http://127.0.0.1:1234/callback' });
    getPendingOAuthInfoForRecover(); // 첫 호출 — 일단 반환
    // Mark consumed
    __testing__.markConsumed();
    expect(getPendingOAuthInfoForRecover()).toBeNull();
  });

  it('30분 초과 시 null', () => {
    setPendingOAuthInfo({
      codeVerifier: 'v1',
      redirectUri: 'http://127.0.0.1:1234/callback',
      _createdAt: Date.now() - 31 * 60 * 1000,
    });
    expect(getPendingOAuthInfoForRecover()).toBeNull();
  });
});
```

</details>

---

## 4. 구현 순서 (Do 단계 체크리스트, 갱신 후)

1. **[L1] `electron/ipc/oauth.ts` — `buildCallbackSuccessHtml` / `buildCallbackErrorHtml` 함수 추출 + window.close() 스크립트 + escape**
2. **[L3] `src/adapters/stores/useGoogleAccountStore.ts` — `extractAuthCode` export**
3. **[L3] `electron/ipc/oauth.callback-html.test.ts` — 신규 메타테스트**
4. **[L3] `src/adapters/stores/__tests__/extractAuthCode.test.ts` — 신규 회귀 테스트**
5. **security-hardening report — 데스크톱 secret 복원 메모 추가**
6. **검증 게이트** (`tsc -b && npm run lint && npm run test && npm run regression-check`)

---

## 5. 보안 점검

| 항목                                    | 검증                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `pendingOAuthInfo` 30분 만료            | PKCE code 자체가 10분 만료라 충분, OAuth code 이미 만료된 경우 토큰 교환에서 실패하므로 추가 위험 없음 |
| `consumed` 플래그로 replay 방어         | 한 번 사용된 verifier 는 재사용 불가, Google 도 같은 code 중복 사용 거부                               |
| `window.close()` 스크립트 XSS           | HTML 은 정적, 사용자 입력 미포함 (에러 메시지만 escape 필요)                                           |
| 에러 HTML 의 error 파라미터             | `error` 는 Google 에서 옴 (`access_denied` 등), HTML escape 필수 — `&` `<` `>` `"` `'`                 |
| Renderer 가 recovered info 를 잘못 사용 | renderer 메모리에만 잠시 머묾, electron-store 등에 저장하지 않음                                       |

---

## 6. 회귀 위험

| 위험                                                         | 완화                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------- |
| `buildCallbackSuccessHtml` 추출 시 기존 동작 변경            | 메타테스트로 핵심 동작 (window.close + 카운트다운) 고정    |
| `pendingOAuthInfo` 가 supersede 시 정리 안 되어 메모리 누수  | `oauth:start` 시작 시 `pendingOAuthInfo = null`, 30분 만료 |
| `recoverPendingOAuth` IPC 호출이 실패해도 fallback 으로 진행 | try/catch 후 `pendingPKCE` 흐름 폴백                       |
| 콜백 HTML 변경이 일부 브라우저에서 깨짐                      | 표준 HTML5 + 기본 `<script>` 만 사용, vendor prefix 없음   |

---

## 7. 검증 시나리오 (수동)

| #   | 시나리오                                                          | 기대 결과                                                                         |
| --- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | 정상 OAuth 흐름 (localhost 정상)                                  | 콜백 페이지 5초 후 자동 닫힘, 앱은 정상 연결                                      |
| 2   | `oauth:cancel` 후 사용자가 그 브라우저 URL을 PKCE 모달에 붙여넣기 | 인증 완료 (pendingOAuthInfo recovered)                                            |
| 3   | OAuth start 후 10분 타임아웃 → URL 붙여넣기                       | 30분 이내면 인증 완료                                                             |
| 4   | OAuth start → 새 OAuth start (superseded) → 첫 URL 붙여넣기       | 첫 흐름의 pendingOAuthInfo 가 새 start 로 덮였으므로 첫 URL 은 실패 (의도된 동작) |
| 5   | `prompt=consent`, `iss=`, `scope=...` 포함 신고 URL               | extractAuthCode 가 code 추출, 인증 완료                                           |
| 6   | `error=access_denied` 케이스                                      | 에러 HTML 표시, oauth:error IPC 발송, 모달에 사유 표시                            |

---

## 8. Out of Scope (재확인)

- OAuth 클라이언트 종류 변경
- 외부 redirect URI (ssampin.com/oauth/callback)
- Electron 메인 프로세스 → 시스템 브라우저 → 앱 deep-link 전환 (custom URL scheme `ssampin://`)
- 모바일 앱 OAuth (`/auth/callback` route, security-hardening P0-C 별도 처리)
