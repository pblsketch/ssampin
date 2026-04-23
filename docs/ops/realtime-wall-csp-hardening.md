---
title: 실시간 담벼락·쌤핀 전역 CSP 하드닝 계획
status: pending
priority: medium
owner: TBD
created: 2026-04-23
---

# 실시간 담벼락·쌤핀 전역 CSP 하드닝 계획

## 배경

단계 5 링크 OG 미리보기 커밋(`bd2d743`)에 대한 security-reviewer가 MEDIUM으로
지적한 "index.html CSP meta 부재" 항목이다. Defense in depth 측면에서 유용
하지만, 쌤핀 전체 앱이 적용받는 광역 변경이라 별 브랜치로 분리한다.

이 문서는 실제 적용 시 참고할 체크리스트다.

## 현재 상태 (2026-04-23 기준)

- `index.html`에 `Content-Security-Policy` meta 없음
- Electron `webPreferences` CSP 설정도 없음
- 다음 방어 계층은 이미 다중 적용:
  - Main `realtimeWallLinkPreview.ts`: undici IP 핀 + private IP 차단 +
    og:image 호스트 재검증 (single-SSRF·rebinding-SSRF·secondary-SSRF 3중 방어)
  - iframe `sandbox="allow-scripts allow-presentation"` + `referrerpolicy="no-referrer"`
  - iframe `allow="encrypted-media; picture-in-picture"` (커밋 XXX에서 축소)
  - 학생 HTML은 자기 글 제출만, 다른 카드·OG·YouTube 미노출

CSP는 **추가 layer**이지 기존 방어를 대체하지 않는다.

## 쌤핀 외부 도메인 스코프 (실측)

`rg 'https?://'`로 수집한 실제 스코프 (2026-04-23):

### connect-src (fetch/WebSocket)
- `accounts.google.com`, `oauth2.googleapis.com`, `www.googleapis.com` — Google OAuth/API
- `open.neis.go.kr`, `www.neis.go.kr` — NEIS 시간표
- `api.weatherapi.com` — 날씨
- `ddbkyaxvnpaxkbqbpijg.supabase.co` (env 기반) — Supabase 함수·DB
- `*.trycloudflare.com` — 라이브 도구 터널 (서브도메인 와일드카드 필수)
- `img.youtube.com` — YouTube 썸네일 (있을 경우)
- **arbitrary** — realtime-wall OG fetch는 Main에서 일어나지만 renderer가
  `<img src="{ogImageUrl}">`로 임의 도메인을 로드. img-src에 영향

### frame-src (iframe)
- `www.youtube-nocookie.com` — 실시간 담벼락 YouTube 임베드
- **arbitrary** — ToolWebEmbed 도구는 교사가 지정한 URL 임의 iframe 허용.
  frame-src 화이트리스트 불가능 → `frame-src *` 필요

### img-src
- `fonts.googleapis.com` — Noto Sans
- `img.youtube.com` — YouTube 썸네일
- `raw.githubusercontent.com` — 일부 리소스
- **arbitrary** — OG 이미지(학생 제출 링크 OG), 교사 업로드 이미지

### script-src
- `esm.sh`, `cdn.jsdelivr.net` — collab-board Excalidraw CDN
- 자체 번들 inline (React compiler 출력)
- `'unsafe-inline'` 또는 hash 필요

### style-src
- `fonts.googleapis.com`, `spoqa.github.io` — 폰트
- Tailwind 인라인 + styled components → `'unsafe-inline'` 필수

## 제안 CSP (초안)

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self' https:;
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://esm.sh https://cdn.jsdelivr.net;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://spoqa.github.io;
  font-src 'self' data: https://fonts.gstatic.com https://spoqa.github.io;
  img-src 'self' data: blob: https:;
  connect-src 'self' https: wss:;
  frame-src *;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
">
```

**주요 타협**:
- `frame-src *`는 ToolWebEmbed 때문에 필수 (교사 지정 URL 임베드)
- `img-src https:`는 OG 이미지·외부 썸네일 때문에 광역 허용
- `unsafe-eval`은 Vite dev + blocknote 등 일부 런타임이 필요할 수 있음 — 프로덕션만 제거 시도
- `object-src 'none'`은 Flash·PDF plugin 금지 (쌤핀에서 불필요)

## 실제 적용 체크리스트

1. **브랜치 분리**: `chore/csp-hardening` 신규 브랜치
2. **수동 스모크 테스트** (전 기능 확인):
   - 대시보드, 시간표, 좌석배치, 일정, 담임메모, 메모, 할일, 설정 각 페이지
   - 쌤도구 20+종 전부 열어보기 (특히 iframe 쓰는 ToolWebEmbed, 숲소리,
     PBL스케치, 협업 보드, 실시간 담벼락, 칠판)
   - Google OAuth 로그인 (accounts.google.com 팝업)
   - NEIS 시간표 동기화
   - 날씨 표시
   - 학생 제출 라이브 도구 5종 + 실시간 담벼락
3. **DevTools Console에 CSP 위반 리포트 수집**
4. **한 번에 적용 X, meta에 `Content-Security-Policy-Report-Only` 부터**
   → 실제 위반 로그 며칠 수집 → meta를 enforcing으로 전환
5. **v1.x.y 릴리즈 노트에 명시** — QA에서 놓친 위반이 있으면 교사 피드백으로
   즉시 알림

## 우선순위

**중**. 다음 조건 중 하나가 충족되면 즉시 상향:
- 외부 보안 감사 진행
- 학생이 실시간 담벼락 OG 이미지/iframe 접근 가능해지는 정책 변경
- Electron renderer 샌드박스 완전 비활성화 제거 계획

## 참고

- OWASP CSP Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html
- Electron 보안 체크리스트: https://www.electronjs.org/docs/latest/tutorial/security
