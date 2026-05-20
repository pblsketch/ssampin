# Plan — OAuth 콜백 URL 정지 버그 (핫픽스)

- **작성일**: 2026-05-19
- **우선순위**: 🔴 P0 (핫픽스 — 사용자 OAuth 인증 차단)
- **트리거**: 사용자 버그 신고 (A 선생님, 2026-05-19)
- **영향 버전**: v2.0.5 (PKCE/security-hardening P0-C 이후 전 버전 공통)
- **영향 범위**: 구글 계정 연결 사용자 전원 (캘린더/Tasks/Drive 동기화)
- **연관 PDCA**: security-hardening (PR #34 P0-C PKCE 전환)

---

## 1. 사용자 신고 요약

**증상**

구글 로그인 후 브라우저 주소창에 다음과 같은 URL이 그대로 노출된 채 멈춰 있다.

```
http://127.0.0.1:61911/callback?iss=https://accounts.google.com
  &code=4/0AeoWuM-w-SrEpXIwYWygUONe5XyoguyZtGEMQpdMPL8CPNkGqj2q2aUy4qHc9ZMIe2YYLg
  &scope=email%20https://www.googleapis.com/auth/drive.file%20...
  &authuser=0&prompt=consent
```

쌤핀 앱은 인증 완료를 감지하지 못하고, 사용자는 어떻게 해야 할지 모르는 상태가 된다.

**재현 경로 (추정)**

1. 설정 > 구글 계정 연결 클릭
2. 시스템 브라우저에서 Google 동의 화면 표시
3. 사용자 동의 클릭
4. 브라우저가 `http://127.0.0.1:61911/callback?...` 로 이동
5. **여기서 멈춤** — "✅ 쌤핀 인증 완료" 페이지가 표시되지 않고, 앱에서도 인증 미완료 상태

---

## 2. 근본 원인 가설

`electron/ipc/oauth.ts:140-198` 의 로컬 HTTP 콜백 서버가 정상이라면 응답 페이지를 반환하고 IPC promise를 resolve 한다. 사용자에게 URL만 보였다는 것은 다음 중 하나다.

### 가설 A — 로컬 서버가 콜백 도착 전 종료됨 (가장 유력)

- `oauth.ts:262-273` 의 10분 타임아웃, 또는 `oauth:cancel` 호출로 서버가 종료
- 사용자가 동의 화면에서 시간을 끔 (학교 Workspace 2FA, 비밀번호 재입력 등)
- 또는 30초 폴백 토스트 (`oauth.ts:250-258`) 후 사용자가 별도로 취소했고, 그 뒤 OAuth가 완료된 케이스
- **이 경우 브라우저는 localhost로 GET을 시도하지만 `ECONNREFUSED` → 빈 화면 or 브라우저 기본 에러 페이지가 뜨거나, 일부 브라우저는 주소창만 갱신되고 그대로 노출**

### 가설 B — 학교망에서 localhost 자체가 차단 (P0-C 이전부터 알려진 시나리오)

- `canBindLocalhost()` 통과해도 외부 브라우저 → localhost 요청은 보안 프로그램이 가로챌 수 있음
- 30초 폴백 토스트가 떠야 하지만, 사용자가 그 사이 동의를 완료했을 가능성
- 현재 코드는 "콜백이 30초 내 도착하지 않으면" 폴백을 제안 (`callbackReceived` 체크)
- **사용자가 동의를 30초 이내에 끝냈고 브라우저 → localhost가 차단된 경우, 폴백 토스트도 안 뜨고 콜백도 못 받음 → 사용자는 URL만 보임**

### 가설 C — Electron 메인 윈도우가 IPC를 받지 못함

- `oauth.ts:122` `wrappedResolve(code)` 는 호출되지만 IPC 채널이 끊기거나
- `useGoogleAccountStore.ts:122` 의 `await api.startOAuth(authUrl)` 가 새 IPC 응답을 받지 못함
- 가능성은 낮지만, 사용자 환경에서 Electron renderer 가 일시 sleep 되거나 메인 프로세스 GC 등의 케이스

### 가설 D — 두 번째 OAuth 호출이 첫 번째를 supersede 했고, 첫 번째 콜백이 늦게 도착

- `oauth.ts:79-82` "OAuth cancelled — superseded by new request" 로 reject 되면 첫 서버는 닫힘
- 사용자가 두 번 클릭한 케이스 → 첫 번째 콜백이 도착했지만 서버가 이미 닫혀있음

### 어느 가설이든 공통 약점

1. **사용자 안내 부족** — 콜백 페이지에서 멈췄을 때 "PKCE 폴백으로 전환하세요" 가이드가 없음
2. **성공 페이지가 자동으로 닫히지 않음** — 닫히지 않으면 사용자가 다시 클릭한다는 위험
3. **진단 로그 부족** — 사용자 신고를 받았을 때 어느 가설인지 확인할 데이터가 없음
4. **URL fallback 미지원** — 사용자가 본 그 URL을 PKCE 모달에 직접 붙여넣을 수 있는 진입로가 없음 (`completePKCEAuth`는 raw code/URL 둘 다 받지만, 사용자 UX 동선이 없음)

---

## 3. 목표 (3-Layer 방어)

### Layer 1 — 콜백 페이지 자체를 견고하게 (성공 시 UX)

- 콜백 응답 페이지에 `window.close()` 자동 실행 (1초 카운트다운 + 폴백 텍스트)
- 브라우저가 `window.close()` 를 거부하면 (탭이 사용자 액션으로 열린 게 아니어서 거부될 수 있음) 안내 메시지 강화

### Layer 2 — 콜백이 안 오는 케이스 즉시 안내 (폴백 UX)

- 30초 폴백 토스트의 문구를 명확히: "구글 로그인 화면에 멈춰 있나요? 주소창의 URL을 복사해서 다른 방법으로 로그인하세요"
- PKCE 폴백 모달에 URL 붙여넣기 동선 강화 (이미 `extractAuthCode` 가 URL 통째 지원, UI에 명시)
- **OAuth 시작 시 PKCE 폴백을 동시에 준비**해서, 사용자가 어느 쪽이든 진행 가능하게 (대안 분기)

### Layer 3 — 진단 로그 + 메타테스트 (회귀 방지)

- `oauth.ts` 콜백 도착/응답 송신/서버 종료 각 단계에 타임스탬프 로그
- 메인 프로세스 콘솔이 사용자 진단에 도움이 되도록 (Electron DevTools 메인 프로세스 콘솔로 봄)
- 메타테스트: `extractAuthCode` 가 사용자 신고 URL을 정확히 파싱하는지 단위 테스트
- 메타테스트: 콜백 응답 HTML 이 `window.close()` 스크립트를 포함하는지 단위 테스트

---

## 4. 비목표 (Out of Scope)

- OAuth 클라이언트 종류 변경 (Web app → Desktop app 등) — 이미 P0-C 에서 Desktop app + PKCE 로 전환 완료
- 외부 redirect URI (예: ssampin.com/oauth/callback) — 인디 서명 비용 + 추가 인프라 부담, 미진행
- 브라우저 자동 닫기 강제 — Chrome/Edge가 보안상 차단하면 추가 우회 불가

---

## 5. 성공 기준

1. **재현 케이스 ON 상태에서**: 콜백 URL이 뜬 화면에서 사용자가 그 URL을 PKCE 모달에 붙여넣어 인증 완료 가능 (실제 화면 동선 확인)
2. **정상 케이스**: 콜백 성공 페이지가 1초 후 자동으로 닫히거나, 닫히지 않을 때 명확한 안내 표시
3. **검증 게이트 4종 (tsc / lint / test / regression)** 전부 통과
4. **메타테스트 신규 2건 이상** — extractAuthCode URL 파싱 + 콜백 응답 HTML auto-close 스크립트
5. **사용자 신고 URL 그대로 PKCE 모달에 붙여넣어 토큰 교환 성공** — `extractAuthCode` 가 사용자 신고 URL의 `code=4/0AeoWuM...` 부분을 정확히 추출

---

## 6. 위험과 완화

| 위험                                                              | 완화                                                                   |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `window.close()` 가 브라우저에서 거부됨 (Chrome 사용자 액션 정책) | 거부 시 폴백 안내 텍스트 강화, "이 창을 직접 닫아주세요" 명시          |
| 콜백 응답 HTML 변경이 기존 사용자 흐름 회귀                       | 메타테스트로 응답 HTML 구조 고정                                       |
| PKCE 모달 동선 강화가 일반 사용자에게 노이즈                      | 30초 폴백 토스트는 유지하되 문구만 개선, 기본 OAuth 흐름 영향 없음     |
| 진단 로그가 사용자에게 보이지 않음 (메인 프로세스 콘솔)           | 향후 사용자 신고 시 `npm run electron:dev` 로 재현 가능, 일단 개발자용 |

---

## 7. 다음 단계

1. `/pdca design oauth-callback-stuck` — Design 문서 작성 (구체 코드 변경 위치)
2. Do — 3-Layer 방어 구현
3. 검증 게이트 4종 실행
4. `/pdca analyze oauth-callback-stuck` — Gap 분석
5. Match Rate ≥ 90% 시 Report, 미만 시 iterate
