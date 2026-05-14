# Security Policy

## 지원 버전

| 버전 | 지원 여부 |
|------|-----------|
| 최신 릴리즈 | :white_check_mark: |
| 이전 버전 | :x: |

최신 릴리즈 버전만 보안 업데이트를 제공합니다.

## 취약점 신고

보안 취약점을 발견하셨다면 **공개 이슈로 등록하지 마시고** 아래 절차를 따라 주세요.

### 신고 방법

다음 중 한 가지 방법을 사용해 주세요:

- **GitHub Security Advisory** (권장): 저장소의 [Security → Advisories → Report a vulnerability](https://github.com/pblsketch/ssampin/security/advisories/new) 에서 비공개로 제보
- **이메일**: [pblsketch@gmail.com](mailto:pblsketch@gmail.com)

다음 정보를 포함해 주시면 빠른 대응에 도움이 됩니다:

- 취약점 유형 (예: XSS, 권한 상승, 데이터 유출 등)
- 관련 파일 경로 또는 코드 위치
- 재현 절차
- 예상되는 영향 범위
- (가능하다면) 수정 제안

### 대응 절차

1. **확인**: 신고 접수 후 **3 영업일 이내**에 수신 확인 회신을 드립니다.
2. **분석**: 취약점을 분석하고 영향 범위를 평가합니다.
3. **수정**: 패치를 개발하고 테스트합니다.
4. **배포**: 수정된 버전을 릴리즈하고 신고자에게 알립니다.

### 요청 사항

- 취약점이 수정될 때까지 **비공개**로 유지해 주세요.
- 다른 사용자의 데이터에 접근하거나 서비스를 방해하는 테스트는 자제해 주세요.

## 시크릿 / 환경 변수 정책

이 저장소는 **퍼블릭(오픈소스)** 입니다. 다음 값들은 **서버 전용(server-only)** 이며
클라이언트 번들(`dist/`, `dist-mobile/`)이나 git tracked 파일에 절대 들어가서는 안 됩니다.
이 값들은 Supabase Edge Functions 의 환경 변수로만 보관합니다:

- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service-role 키
- `ENCRYPTION_KEY` — 교사 OAuth 토큰 AES-256-GCM 암호화 키
- `GOOGLE_CLIENT_SECRET` — Google OAuth 클라이언트 시크릿. **모바일 PWA(Web application 타입 클라이언트)** 의 code↔token 교환에만 쓰이며, `oauth-exchange` Edge Function 의 환경 변수로만 존재합니다. 클라이언트(PWA 번들·데스크톱 렌더러)는 이 값을 절대 보지 않습니다. 데스크톱 앱은 Google "Desktop app"(installed) 클라이언트라 PKCE 만으로 동작 — client_secret 자체가 필요 없습니다.
- `GOOGLE_API_KEY` / `GOOGLE_SLIDES_API_KEY` — Google API 키
- `RESEND_API_KEY` — 메일 발송(에스컬레이션) API 키
- `ADMIN_API_KEY` — 챗봇 지식베이스 관리 토큰 (`ssampin-embed`)
- `DEVELOPER_EMAIL` / `ESCALATE_NOTIFY_EMAIL` — 알림 수신 이메일

반면 다음은 공개되어도 무방한 값입니다: Supabase URL, Supabase anon 키(RLS 전제),
OAuth 클라이언트 **ID**.

`.env` / `.env*.local` 은 `.gitignore` 에 포함되어 있습니다. 시크릿이 실수로 커밋된 것을
발견하면 위 신고 절차로 알려 주세요.

## Content-Security-Policy (CSP)

데스크톱 앱은 패키지(`file://`) 빌드에서 `Content-Security-Policy-Report-Only` 헤더를
부착합니다(`electron/security/csp.ts` 의 `buildAppCsp` / `attachCsp`, `electron/main.ts`
에서 prod 일 때만 호출). 현재는 **Report-Only 단계** — 아무것도 차단하지 않으며 위반은
DevTools 콘솔 및 메인 프로세스 로그(`[CSP violation] ...`)에만 기록됩니다. `'unsafe-eval'`
은 `script-src` 에 포함하지 않습니다(감사 M-1 의 핵심).

**enforce 전환 절차**: 패키지 빌드를 수 주간 운영하며 콘솔에 Report-Only 위반이 없는지
관찰 → 위반이 나오면 해당 출처를 `buildAppCsp()` 화이트리스트에 추가 → 위반 0(또는 의도된
화이트리스트만) 확인 후 `electron/main.ts` 의 `attachCsp(session.defaultSession, /* reportOnly */ false)`
로 바꿔 `Content-Security-Policy`(enforce) 헤더로 전환. eval 사용 의존성이 드러나면
`'unsafe-eval'` 로 무마하지 말고 별도 이슈로 처리.

보안 개선에 기여해 주셔서 감사합니다.
