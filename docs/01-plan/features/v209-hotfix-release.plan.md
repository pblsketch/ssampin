# v2.0.9 핫픽스 릴리즈 계획

> **상태**: Plan v0.1 (2026-05-26)
> **유형**: 핫픽스 묶음 릴리즈 (Critical OAuth fix + 신규 기능 1건 + 회귀 fix 5건 + UX 개선 4건 + 빌드 가드)
> **이전 릴리즈**: v2.0.8 (release-notes에는 등록됐으나 실제 빌드/태그/배포가 .env 누락으로 깨져 사용 불가 상태)

---

## 1. 배경 — v2.0.8 릴리즈 사고

### 1.1 사용자 신고

사용자(`wnsdlf1212@gmail.com`)가 데스크톱 앱에서 구글 캘린더/할 일/드라이브 연결 시도 시 빨간 에러 박스 + 브라우저에 다음 메시지 표시:

```
액세스 차단됨: 승인 오류
Missing required parameter: client_id
400 오류: invalid_request
```

DevTools 콘솔에서는 `[TasksSync] syncNow 오류: Google 계정이 연결되어 있지 않습니다`가 5분 주기로 반복 발생.

### 1.2 근본 원인 — 빌드 산출물에 client_id가 빈 채로 박힘

| 검증 단계                                                                                                        | 결과                                                     |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `.env` 파일 (현재)                                                                                               | `VITE_GOOGLE_CLIENT_ID=990268309712-eji9atp...` 정상     |
| `dist/` (현재 로컬 빌드)                                                                                         | `990268309712` 박혀있음 ✅                               |
| `release/win-unpacked/resources/app.asar` (현재)                                                                 | `990268309712` 박혀있음 ✅                               |
| **`C:\Users\wnsdl\AppData\Local\Programs\ssampin\resources\app.asar`** (사용자가 실행 중인 v2.0.7~v2.0.8 설치본) | **`990268309712` 0건 — client_id가 빈 문자열로 박힘** ❌ |

DevTools가 보고한 번들 파일명 `index-DbupsmSF.js` vs 현재 `dist/`의 `index-BJsavrrU.js` — 해시가 달라 **사용자가 실행 중인 빌드는 우리 로컬 dist와 다른 시점에 만들어진 산출물**임이 확정됨.

추정 시나리오: codex가 release 작업을 수행할 때 `.env` 가 빌드 환경에서 안 읽혔거나, `loadEnv(mode, process.cwd(), '')` 의 cwd가 어긋난 환경에서 빌드 → vite `define` 이 `process.env.GOOGLE_CLIENT_ID` 를 빈 문자열로 치환한 채 dist/ 생성 → asar 패키징 → 설치본 배포.

### 1.3 영향 범위

- v2.0.8 빌드(May 23 17:36)를 설치한 모든 사용자 → 구글 캘린더·할 일·드라이브·로그인 전부 불가
- 빨간 에러 박스가 5분마다 떠서 사용자 경험 심각 저하
- `release-notes.json` 의 v2.0.8 항목 14개는 등록됐지만 사용자가 보지 못한 상태
- git tag `v2.0.7` 도 실제로는 생성되지 않음 (메모리 기록과 실제 저장소 불일치)

### 1.4 v2.0.9 가 해소할 두 축

1. **Critical fix**: 사용자 즉시 사용 가능하도록 OAuth 연결 복구 + 재빌드 + 재배포
2. **재발 방지 가드**: vite 빌드 단계에서 `VITE_GOOGLE_CLIENT_ID` 가 비어있으면 즉시 빌드 실패시키는 가드 추가

---

## 2. 범위 (Scope)

### 2.1 포함 (In Scope)

#### A. Critical fix

- **C-1** `vite.config.ts` 에 production 모드 client_id 빈값 가드 추가
- **C-2** `vite.mobile.config.ts` 동일 가드 추가
- **C-3** 재빌드 후 `release/win-unpacked/resources/app.asar` 에 `990268309712` 박혀있는지 grep 검증을 빌드 워크플로우에 명시

#### B. 신기능 (사용자 명시)

- **F-1** `5067245 feat: 담임 메모장 출결 세부 입력 추가` — 메모장 카드에서 출결 세부 입력 지원

#### C. 위젯 모달 회귀 fix 5건 (May 23 18:00 이후 추가됨)

- **R-1** `a58b262 Stop native desktop widget modal from shrinking on open` — 모달 열 때 위젯 축소 차단
- **R-2** `0286a73 Delay native desktop modal input mode until focus` — 입력 모드 진입 지연으로 포커스 race 해소
- **R-3** `a752c05 Restore native desktop modal input on click` — 클릭 시 입력 모드 복구
- **R-4** `0c12659 Focus native desktop modal input without detaching` — detach 없이 포커스 복구
- **R-5** `1d79f4c Fix native desktop modal input fallback` — fallback 경로 정정

#### D. UX 개선 4건

- **U-1** `f12b32b refactor(class-record): simplify attendance workflow` — 출결 워크플로우 단순화
- **U-2** `2d7bbbf feat(class-record): improve record view accessibility` — 학생 기록뷰 접근성
- **U-3** `237de6d feat(class-record): add autosave safeguards and UX polish` — 자동저장 안전망 + 폴리시
- **U-4** `e00e85e Improve Windows protection warning guide animation` — Windows 보호 경고 안내 애니메이션

### 2.2 제외 (Out of Scope)

다음은 미커밋 상태로 작업트리에 남아있으나 v2.0.9 에는 포함하지 않는다. 다른 PDCA 또는 v2.1.0 묶음 릴리즈에서 별도 진행.

- **학급규칙 (ClassroomAgreement)** — 도메인/리포지토리/스토어/컴포넌트/테스트/IPC/WS protocol 전부 미커밋. 사용자 결정에 따라 다음 릴리즈로 이연.
- **RealtimeWallTabConfig** 엔티티 — v2.1.0 멀티탭과 묶어서 진행
- **XlsxExporter** 인프라 — 별도 PDCA
- `public/landing/`, `bin/`, `scripts/gen-card-image.mjs` — 빌드/배포 도구류, 별도 정리

### 2.3 v2.0.8 release-notes 14개 항목 처리

`public/release-notes.json` 의 `2.0.8` 블록(2026-05-23, highlights 9 + changes 14)은 **그대로 둔다**. 사용자는 v2.0.7(실제 v2.0.8 깨진 빌드)에서 v2.0.9 로 점프 업데이트하면서 release-notes 모달에서 두 블록을 모두 보게 된다 (`UpdateNotification.tsx` 가 versions 배열 순서대로 표시).

v2.0.9 블록은 그 위에 새로 추가한다.

---

## 3. v2.0.9 release-notes 초안

`public/release-notes.json` 의 `versions` 배열 맨 앞에 추가할 항목.

```json
{
  "version": "2.0.9",
  "date": "2026-05-26",
  "highlights": [
    "🔧 구글 캘린더·할 일·드라이브 연결 복구 — v2.0.8 빌드 사고로 깨졌던 OAuth client_id 누락 회귀 정정",
    "📝 담임 메모장 출결 세부 입력 — 메모 카드 안에서 출결 사유까지 한 번에 기록",
    "🪟 바탕화면 위젯 모달 입력창 포커스 안정화 — 메모·일정 추가 입력이 끊김 없이 작동",
    "🛡️ 출결 자동저장 안전망 + UX 폴리시 — 입력 도중 끊기더라도 데이터 보존",
    "♿ 학생 기록 뷰 접근성 개선 — 키보드 탐색·스크린 리더 호환성 향상",
    "🪟 Windows 보호 경고 안내 애니메이션 개선 — 첫 실행 시 SmartScreen 안내가 더 자연스럽게"
  ],
  "changes": [
    {
      "type": "fix",
      "title": "구글 캘린더·할 일·드라이브 연결 복구",
      "description": "v2.0.8 빌드 산출물에 OAuth client_id가 빈 채로 박혀 'Missing required parameter: client_id' 에러로 모든 구글 연동이 깨졌던 회귀를 정정. 빌드 단계에 client_id/secret 누락 시 즉시 실패하는 가드 추가로 재발 차단."
    },
    {
      "type": "new",
      "title": "담임 메모장 출결 세부 입력",
      "description": "담임 메모장 카드에서 출결 사유까지 한 번에 입력 가능."
    },
    {
      "type": "fix",
      "title": "바탕화면 위젯 모달 입력창 포커스 안정화 (회귀 5건)",
      "description": "모달 열 때 위젯이 축소되던 문제, 입력 포커스가 가끔 풀리던 race, 클릭 시 입력 모드 복구 누락, detach 도중 포커스 손실, fallback 경로 5건 일괄 정정."
    },
    {
      "type": "improve",
      "title": "출결 자동저장 안전망",
      "description": "입력 도중 끊기더라도 데이터를 잃지 않도록 자동저장 가드 강화 + UX 폴리시."
    },
    {
      "type": "improve",
      "title": "출결 워크플로우 단순화",
      "description": "학급 출결 기록 흐름을 더 직관적으로 정리."
    },
    {
      "type": "improve",
      "title": "학생 기록 뷰 접근성 개선",
      "description": "키보드 탐색과 스크린 리더 호환성 향상."
    },
    {
      "type": "improve",
      "title": "Windows 보호 경고 안내 애니메이션",
      "description": "첫 실행 시 표시되는 SmartScreen 우회 안내가 더 부드럽게 표시되도록 정정."
    }
  ]
}
```

---

## 4. 빌드 가드 설계 (재발 방지)

### 4.1 `vite.config.ts` 패치

```ts
// vite.config.ts — define 블록 직전
const clientId = (env.VITE_GOOGLE_CLIENT_ID || '').trim();
const clientSecret = (env.VITE_GOOGLE_CLIENT_SECRET || '').trim();

if (mode === 'production') {
  const missing: string[] = [];
  if (!clientId) missing.push('VITE_GOOGLE_CLIENT_ID');
  if (!clientSecret) missing.push('VITE_GOOGLE_CLIENT_SECRET');
  if (missing.length > 0) {
    throw new Error(
      `[vite] 프로덕션 빌드 중단: ${missing.join(', ')} 가 비어있습니다.\n` +
        `프로젝트 루트에 .env 파일이 있는지, 빌드 cwd가 프로젝트 루트인지 확인하세요.\n` +
        `(이 가드는 v2.0.8 빌드 사고 — client_id 누락 채 배포되어 OAuth가 전체 깨진 회귀를 차단합니다.)`,
    );
  }
}
```

### 4.2 `vite.mobile.config.ts` 동일 패치

모바일 빌드도 동일 가드 적용.

### 4.3 빌드 산출물 검증 (수동 + Release Workflow 보강)

CLAUDE.md Release Workflow §6 "빌드 (Windows)" 직후 다음 검증을 명시한다:

```bash
# 6.5 — OAuth client_id 박힘 검증 (v2.0.9 재발 방지)
grep -c "990268309712" release/win-unpacked/resources/app.asar
# 결과가 1 이상이어야 함. 0이면 빌드 중단 — .env 확인 후 재빌드.
```

후속 PDCA 에서는 이 검증을 `node scripts/verify-build.mjs` 로 자동화 (현재 범위 외).

---

## 5. 변경 파일 매니페스트

### 5.1 새로 추가

- (없음 — v2.0.9 는 기존 커밋 묶음 + 가드 패치만)

### 5.2 수정

- `package.json` — `"version": "2.0.8"` → `"2.0.9"`
- `landing/src/config.ts` — `VERSION` 상수 갱신
- `landing/src/app/layout.tsx` — `softwareVersion` 갱신
- `src/adapters/components/Layout/Sidebar.tsx` — 사이드바 하단 버전 텍스트 (이미 작업트리에 변경 있음 — 확인 필요)
- `src/mobile/pages/SettingsPage.tsx` — 모바일 설정 버전 텍스트
- `src/mobile/pages/MorePage.tsx` — 모바일 더보기 버전 텍스트
- `public/release-notes.json` — v2.0.9 블록 최상단 추가 (위 §3 초안)
- `vite.config.ts` — production env 가드 (위 §4.1)
- `vite.mobile.config.ts` — production env 가드 (위 §4.2)

### 5.3 별도 처리 — 작업트리 미커밋 파일 보호

학급규칙·XlsxExporter 등 미커밋 파일은 `git stash push -u --keep-index` 또는 별도 브랜치로 안전 보호한 뒤 v2.0.9 작업 진행. 빌드 완료 후 stash pop 으로 복원.

`electron/main.ts`·`electron/preload.ts`·`src/App.tsx`·`src/adapters/di/container.ts` 등은 학급규칙 IPC 등록 라인이 섞여있어 **v2.0.9 커밋에 잘못 포함되지 않도록 주의**.

---

## 6. 검증 게이트

CLAUDE.md 검증 게이트 4단계 + v2.0.9 추가 게이트:

```bash
# 1단계: 구문 검증
npx tsc --noEmit

# 2단계: 코드 품질
npm run lint

# 3단계: 테스트
npm run test

# 4단계: 회귀 방지
npm run regression-check

# 5단계: 빌드 가드 동작 확인 (신규)
# .env 임시 백업 후 빌드 시도 → throw로 즉시 실패해야 함
mv .env .env.bak
npx vite build 2>&1 | grep "프로덕션 빌드 중단" && echo "GUARD OK" || echo "GUARD FAILED"
mv .env.bak .env

# 6단계: 빌드 산출물에 client_id 박힘 검증 (신규)
# Release Workflow §6 5단계 분리 빌드 완료 후
grep -c "990268309712" release/win-unpacked/resources/app.asar
# 1 이상이어야 통과
```

---

## 7. 릴리즈 워크플로우 (CLAUDE.md 8단계 적용)

1. **버전 번호 업데이트** — 6곳 수동 + 1곳 자동 (CLAUDE.md §1 그대로)
2. **release-notes.json 업데이트** — 위 §3 블록 추가
3. **AI 챗봇 KB 최신화** — v2.0.9 핫픽스 항목 Q&A 1건 추가
4. **노션 사용자 가이드 최신화** — "구글 연결 안 됨" 트러블슈팅 섹션 + v2.0.9 콜아웃
5. **커밋 & 푸시** — `release: v2.0.9 — OAuth 회귀 핫픽스 + 담임 메모장 출결 + 위젯 모달 fix 5건`
6. **빌드 (Windows)** — CLAUDE.md §6 5단계 분리 명령 그대로 + §6.5 grep 검증
7. **빌드 (macOS)** — `gh workflow run "Build macOS" --ref main`
8. **GitHub 릴리즈 생성** — Windows + macOS 자산 4개(+blockmap+yml) 모두 첨부, 4 URL 302 검증

---

## 8. 리스크 & 미해결 이슈

| ID  | 리스크                                                                                                                             | 대응                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| K-1 | macOS GHA 빌드 환경에 `VITE_GOOGLE_CLIENT_ID` secret 가 안 들어가 있을 가능성                                                      | GHA workflow 의 env 주입부 확인 + secret 등록 상태 점검                          |
| K-2 | git tag `v2.0.7` 가 실제로 없음 — 메모리/문서 기록과 실제 저장소 불일치                                                            | v2.0.9 태그 생성과 함께 메모리 정정 (v2.0.7/v2.0.8 미릴리즈 사실 명시)           |
| K-3 | `release-notes.json` v2.0.8 항목은 그대로 두지만 실제 사용자는 v2.0.7 ↔ v2.0.9 만 본 셈 — UpdateNotification 표시 일관성 점검 필요 | 빌드 후 dev 모드에서 v2.0.7 → v2.0.9 시뮬레이션으로 release-notes 모달 표시 확인 |
| K-4 | TasksSync 자동 동기화 빨간 에러 박스가 OAuth 복구 후에도 5분간 잔존할 가능성                                                       | 빌드 후 사용자 PC 에서 한 번 disconnect → 재연결 흐름 안내                       |
| K-5 | 학급규칙 등 미커밋 변경이 v2.0.9 커밋에 섞일 위험                                                                                  | 명시적 `git add <파일명>` 만 사용, `git add .`·`git add -A` 금지                 |

---

## 9. 결정 필요 사항 (사용자 확정 후 구현 착수)

- [ ] §3 release-notes 초안 문구 OK?
- [ ] §4.1 vite 가드 메시지 톤 OK? (사용자에게 보여지지 않지만 codex/Claude 가 빌드할 때 보는 메시지)
- [ ] §7-3 챗봇 KB 에 추가할 Q&A 문구 별도 초안 필요한지
- [ ] §7-4 노션 가이드 "구글 연결 안 됨" 트러블슈팅 섹션 작성 범위 — v2.0.9 변경만 / 일반 OAuth 트러블슈팅 포함 / 미포함 중 선택
