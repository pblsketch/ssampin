---
template: design
version: 0.2
feature: realtime-wall-padlet-mode-v2-student-ux
date: 2026-04-25
revised: 2026-04-24 (v2.1 — Plan v2.1 동기화 + 4 페르소나 결정 9건 흡수)
author: frontend-engineer-high (consult: cto-lead / security-architect / qa-strategist)
project: ssampin
version_target: v1.15.x
plan: docs/01-plan/features/realtime-wall-padlet-mode-v2-student-ux.plan.md
parents:
  - docs/02-design/features/realtime-wall-padlet-mode.design.md
  - docs/03-analysis/realtime-wall-padlet-mode.analysis.md
  - docs/04-report/features/realtime-wall-padlet-mode.report.md
related_research: docs/research/padlet-student-interactions.md
---

# 쌤핀 실시간 담벼락 — 패들렛 모드 v2 · 학생 UX 정교화 설계서 (v2.1)

> **v2.1 갱신 요지 (2026-04-24)**: Plan v2.1 동기화. 핵심 변경 5건:
> 1. **Phase 순서 절대 변경**: A→B→C→D → **B→A→D→C** (4 페르소나 4/4 합의 critical-1)
> 2. **§7.2 결정 9건 모두 확정** — v2 본문 5건 + v2.1 신규 4건 (카드 색상 8색 / PDF 첨부 별도 IPC / moderation 프리셋 'off'|'manual' / 학기 영속 PIN)
> 3. **삭제 정책 (b) hard delete → (a) soft delete + placeholder** (페2 critical-5)
> 4. **마크다운 별표 직접 입력 → Bold/Italic 버튼 툴바** (페1 critical-6 — 별표 자모분리)
> 5. **회귀 위험 5건 → 9건** (v2 5건 보존 + v2.1 4건 추가: `C` 단축키 0 hit / `dangerouslySetInnerHTML` 0 hit / hard delete 0 hit / PIN 평문 0 hit)
>
> v2 본문은 가능한 보존, 영향받은 섹션만 v2.1 표기로 갱신.
>
> 대응 Plan: [`realtime-wall-padlet-mode-v2-student-ux.plan.md`](../../01-plan/features/realtime-wall-padlet-mode-v2-student-ux.plan.md) **(Phase B → A → D → C)**
>
> 직전 v1 Design: [`realtime-wall-padlet-mode.design.md`](realtime-wall-padlet-mode.design.md) — **본 v2 Design은 이 문서를 절대 수정하지 않고 누적한다.**
>
> 입력 자료: [`docs/research/padlet-student-interactions.md`](../../research/padlet-student-interactions.md)

---

## 0. 핵심 설계 원칙 (못박기 — v1 계승 + v2 신규)

### 0.1 v1 원칙 계승 (절대 수정 금지)

본 v2 Design은 v1 Design §0의 3대 원칙을 그대로 이어받는다.

1. **교사·학생 동일 뷰 원칙** (v1 §0.1) — 학생과 교사는 같은 보드 화면을 본다. v2의 신규 권한(자기 카드 이동/수정/삭제)도 **다른 학생이 보는 화면에는 동일한 결과**가 나타난다. CSS hidden 의존 금지 정책 그대로.
2. **영속성 원칙** (v1 §0.2) — 좋아요·댓글·이미지·위치 변경 모두 WallBoard 스냅샷에 영속. 휘발성 클라이언트 상태 금지. 단 **드래프트는 학생 브라우저 localStorage에만 영속** (서버 영속 X — Plan §7.2 결정 #2). v2.1: **sessionToken도 localStorage 영속** (sessionStorage 양방향 위험 해소 — Plan critical-4).
3. **단계 진입 원칙** (v1 §0.3) — Phase 통과 없이 다음 시작 금지 직진 권장. **v2.1 변경: B→A→D→C 직렬 강제** (4 페르소나 4/4 합의 critical-1). v2의 A·B 병렬은 폐기 — Phase B의 도메인 변경(`images?[]` / `pdfUrl?` / `color?` / `studentPinHash?` / `status` union 확장)이 모든 후속 Phase prop 시그니처 토대이므로 B 선행 강제.

### 0.2 v2 신규 원칙 (5건 — v2.1 갱신)

#### 원칙 (v2-1) — 자기 카드 식별은 sessionToken **OR PIN hash** 양방향 매칭 (v2.1 갱신)

학생이 자기 카드를 식별하는 진실 공급원은 **두 필드 양방향 OR 매칭**이다 (Plan §7.2 결정 #9 — 학기 영속 PIN 흡수).

```
isOwnCard(post, ctx) ⇔
  (post.ownerSessionToken === ctx.currentSessionToken)
  || (post.studentPinHash !== undefined && post.studentPinHash === ctx.currentPinHash)
```

- **PIN 미설정 학생** (기본 익명 일회성 모드): 첫 항(sessionToken)만 동작. 탭 닫으면 권한 소실.
- **PIN 설정 학생** (학기 영속 모드): 두 항 중 하나만 일치해도 본인 인정. 다른 PC/탭에서 같은 PIN 입력 시 학기 내 자기 카드 식별 가능.
- **PIN 보안**: PIN 평문은 절대 서버에 보내지 않음. 클라이언트 SHA-256 hash → `studentPinHash` (hex 64자리)만 broadcast. 서버는 hash만 보관 (PIPA 정합).
- **클라이언트 측 식별**: UI 분기 (hover-action, drag enable, owner action 등)
- **서버 측 검증**: 위치 변경/수정/삭제 메시지 수신 시 재검증 (클라이언트 신뢰 X) — 서버는 ws 세션 sessionToken과 메시지 sessionToken 매칭 + (PIN 첨부 시) hash 매칭 모두 시도
- **불일치 시**: 서버는 메시지 무시 + `error` 응답, UI는 권한 표면 미렌더

> **결정 (Plan §7.2 결정 #3 + #9 v2.1 확정)**: 신규 필드는 `ownerSessionToken` + `studentPinHash` 두 개. v1.14.x 기존 카드는 둘 다 `undefined` → 학생 권한 차단 (best-effort, 손실 0). 교사 화면에서 PIN reset 권한 X (PIPA 정합 — 교사는 hash만 봄).

#### 원칙 (v2-2) — 회귀 위험 9건 자동 검증 (v2.1 — 5건에서 4건 추가)

Plan §5의 회귀 위험 5건 + v2.1 신규 4건 = **총 9건**을 **CI 파이프라인에서 정규식 grep + 단위 테스트 이중 검증**한다. 코드 리뷰만으로는 안전 보장 불가.

| # | 검증 방식 | 위치 / grep 패턴 |
|---|---------|------|
| 1 | grep + unit test | `electron/ipc/realtimeWall.ts` `buildWallStateForStudents` `posts\.filter\(p\s*=>\s*p\.status\s*===\s*['"]approved['"]\)` |
| 2 | unit test (잘못된 스냅샷 입력 → no crash) | `src/student/parseServerMessage` (또는 `useRealtimeWallSyncStore.applyMessage`) wall-state 분기 |
| 3 | grep + DOM unit test | `RealtimeWallCard.tsx` line 207-208 `teacherActions\s*=\s*viewerRole\s*===\s*['"]teacher['"]\s*\?\s*actions\s*:\s*null` (Phase B 진입 직전 git blame 스냅샷 기록 필수) |
| 4 | unit test (false→true→false 시퀀스) | `StudentSubmitForm` `prevSubmittingRef` edge transition |
| 5 | integration test 시나리오 | `closeSession` 시 `rateLimitBuckets\.clear\(\)` 호출 검증 |
| **6 (v2.1)** | grep 0 hit 전체 src | **`C` 단축키 코드 부재** — `addEventListener\(\s*['"]keydown['"][\s\S]{0,200}['"]c['"]` 패턴 0 hit. `event\.key\s*===\s*['"]c['"]` 패턴도 0 hit (학생 entry 한정) |
| **7 (v2.1)** | grep 0 hit 전체 src/student/ | **`dangerouslySetInnerHTML` 절대 부재** — `dangerouslySetInnerHTML` 패턴 src/student/ 전체 0 hit + react-markdown wrapper 외 src/adapters/components/Tools/RealtimeWall/ 0 hit |
| **8 (v2.1)** | grep 0 hit | **hard delete 패턴 부재** — `posts\.filter\(\s*p\s*=>\s*p\.id\s*!==\s*\w+\s*\)` 패턴 0 hit (반드시 soft delete via status 갱신) |
| **9 (v2.1)** | grep 0 hit + Zod 스키마 검사 | **PIN 평문 서버 저장 부재** — `studentPin(?!Hash)` 평문 필드 grep 0 hit. ClientMessageSchema 내 `pin:` 필드 검사 → 모두 `pinHash` 필드만 허용 |

CI grep 어서션 스크립트는 §10.6에 정의 (v2.1: 9건 모두 포함).

#### 원칙 (v2-3) — 학생 entry 번들 < 500KB gzipped

v1.14.x 학생 번들은 ~110KB. v2.1 추가 후에도 500KB 한도 엄수 (Plan NFR). 마크다운 라이브러리 + 색상 픽커 + PDF 첨부 + PIN hash + iOS 재연결 모두 합쳐도 한도 유지.

#### 원칙 (v2-4) — Padlet 패턴은 참고, 쌤핀 정체성 우선

리서치 §2~§5의 Padlet 패턴은 **방향성**으로만 사용한다. 쌤핀 정체성(교사 큐레이션 + 익명/PIN 옵션 + 학기 내 보드 재사용 + 부적절 콘텐츠 필터링 보류)을 손상하는 차용은 거부한다. 예:
- ~~Padlet 보드 더블클릭 진입점 → **거부**~~ → **v2.1 채택** (Plan A2 — 데스크톱 더블클릭 + 모바일 long-press 양방향)
- Padlet Activity Indicator → **거부** (broadcast 추가 + 가치 미정, Plan §2.5 OOS)
- Padlet AI 이미지 / 동영상 / 그리기 → **거부** (Plan §2.5 OOS)
- Padlet GIF 검색 / 카드 연결선(Sandbox) / 태그·검색·정렬 / 카드 보드 간 복사 → **거부** (v2.1 명시 OOS, Plan §11.3)

#### 원칙 (v2-5) — 사용자 결정 9건 (v1 5건 + v2.1 신규 4건)

Plan §1.1 + §7.2 명시 결정은 v2 Design에서도 변경 불가:

**v1 계승 5건**:
1. 전면 전환 (학생 노출 정책)
2. 영속 + 익명 (좋아요/댓글) — v2.1: PIN 옵션 추가
3. 부적절 콘텐츠 필터링 보류 (§11.3 계승)
4. CTO-Lead 오케스트레이션
5. 동일 뷰 원칙

**v2.1 신규 4건** (Plan §7.2.2):
6. **카드 색상 8색** (Phase B 흡수)
7. **PDF 첨부 별도 IPC** (Phase B 흡수, max 10MB)
8. **moderation 프리셋 'off' (즉시 공개) 기본** + 보드 단위 토글 (Phase A — boardSettings.moderation 도메인 신설)
9. **학기 영속 PIN 옵션** + sessionToken localStorage 영속 (Phase D — `studentPinHash` 신설)

### 0.3 핵심 결정 9건 요약 (Plan §7.2 v2.1 모두 확정 — v2 본문 5건 + v2.1 신규 4건)

| # | 결정 | 본 Design 결정 | 위치 |
|---|------|---------------|------|
| 1 | 이미지 첨부 저장 방식 | **(a) base64 → WebSocket payload + 카드당 최대 3장 + 합계 5MB + canvas 리사이즈 1280px / JPEG q=0.8 (v2.1 갱신)** | §2.2, §4.2, §9.4 |
| 2 | 마크다운 라이브러리 + 입력 방식 | **`react-markdown@9` `allowedElements: ['p','strong','em','ul','ol','li','blockquote']` 화이트리스트 (v2.1 — ol/blockquote 추가) + 입력은 Bold/Italic 버튼 툴바 (별표 직접 입력 금지)** | §2.4, §5.5, §5.10 |
| 3 | sessionToken 필드 위치 | **`RealtimeWallPost.ownerSessionToken` (서버 강제 주입 + 도메인 optional 필드)** | §2.1, §3.6 |
| 4 (v2.1 변경) | 학생 카드 삭제 정책 | **(a) soft delete: status='hidden-by-author' + "작성자가 삭제했어요" placeholder + 좋아요/댓글 보존 + 교사 화면에 복원 메뉴** (v2의 hard delete에서 변경) | §3.3, §4.2, §5.4, §6.2 |
| 5 | 동시 편집 race 정책 | **LWW (Last Write Wins) + server timestamp ordering** | §6.4, §10.4 |
| **6 (v2.1 신규)** | **카드 색상 8색** | **`color?: 'yellow'\|'pink'\|'blue'\|'green'\|'purple'\|'orange'\|'gray'\|'white'`. Phase B 흡수. 모달 하단 horizontal scroll 픽커 + 카드 좌상단 점 + 카드 배경 alpha 80%** | §2.1, §5.11 |
| **7 (v2.1 신규)** | **PDF 첨부** | **`pdfUrl?: string` + `pdfFilename?: string`. 별도 Electron IPC `realtime-wall:upload-pdf` (Renderer→Main 전송 → Main이 임시 디렉토리 저장 → file:// URL 반환). max 10MB. WebSocket broadcast에는 fileURL만 (base64 X — 페이로드 폭증 방지). magic byte `%PDF-` 검증** | §2.1, §5.12, §7.1, §9.7 |
| **8 (v2.1 신규)** | **moderation 프리셋** | **`boardSettings.moderation: 'off' \| 'manual'` (도메인 신설). 기본 'off' (즉시 공개 — Padlet 정합). 보드 생성 모달 + 설정 패널 양쪽 토글. 기존 `approvalMode`와 통합 매핑: `'off'` ↔ `'auto'`, `'manual'` ↔ 교사 승인 큐 활성** | §2.6, §5.13 |
| **9 (v2.1 신규)** | **학기 영속 PIN** | **학생 4자리 PIN → 클라이언트 SHA-256 hash → `studentPinHash?: string` (hex 64자리). PIN ↔ sessionToken 양방향 OR 매칭. PIN 평문 서버 저장 0. 교사 PIN reset 권한 0. localStorage 키 `ssampin-realtime-wall-pin-{boardShortCode}`. PIN 미설정 시 익명 일회성 모드 (현재 동작)** | §2.7, §3.7, §5.14 |

상세 근거는 각 섹션 본문 참조.

---

## 1. 구현 순서 (v2.1 — B→A→D→C 직렬 강제 + Phase 독립 릴리즈 보장)

### 1.1 Phase 의존성 그래프 (v2.1 재배치)

```
[Phase B] 카드 내용 입력 UX (5~7일, 1순위)              ← v2.1 1순위 (v2의 2순위에서 변경)
   │  ─ 이미지 다중(3장) + PDF 별도 IPC + 카드 색상 8색 +
   │     OG 인라인 + Bold/Italic 버튼 마크다운(blockquote 추가) +
   │     모바일 풀스크린 + Intl.Segmenter 카운터 + PIPA 동의 모달 +
   │     댓글 정교화 + 학생 1인 다중 카드
   │  ─ 도메인 변경 (모든 후속 Phase의 토대):
   │     RealtimeWallPost.images?: string[] (max 3, base64)
   │     RealtimeWallPost.pdfUrl?: string + pdfFilename?: string
   │     RealtimeWallPost.color?: 8색 union
   │     RealtimeWallPost.studentPinHash?: string (선언만, Phase D에서 활용)
   │     RealtimeWallPost.ownerSessionToken?: string (선언만, Phase D/C에서 활용)
   │     RealtimeWallPost.status union 확장: + 'hidden-by-author'
   │  ─ 서버: 이미지 magic byte 검증 (다중) + PDF magic byte + WebSocket payload max 8MB
   │  ─ 신규 IPC 채널: realtime-wall:upload-pdf (R→M)
   │  ─ WebSocket 신규: submit-comment-v2 (이미지 1장 첨부)
   │  ─ 부하 테스트 150명 (NFR)
   │
   ▼
[Phase A] 카드 추가 진입 UX (1~2일, 2순위)              ← v2.1 2순위
   │  ─ FAB 잠금 시각 강화 / 모바일 long-press(600ms) + 데스크톱 더블클릭
   │  ─ `C` 단축키 코드 완전 제거 (grep 0 hit) — 회귀 위험 #6
   │  ─ useStudentDraft (보드 단위 키 분리) / 모달 minimize 칩
   │  ─ moderation 프리셋 토글 (boardSettings.moderation: 'off'|'manual')
   │  ─ useStudentReconnect (visibilitychange + 지수 백오프) — iOS Safari mitigation
   │  ─ 도메인: RealtimeWallBoardSettings 신설 (+ 기존 board에 settings 필드)
   │  ─ NFR 검증: 첫 join → 화면 1초, iOS Safari 30초 백그라운드 재연결
   │
   ▼
[Phase D] 학생 자기 카드 수정/삭제 + 교사 모더레이션 도구 (3~4일, 3순위)  ← v2.1 3순위
   │  ─ 자기 카드 hover/long-press → sky 액션 메뉴 (sessionToken/PIN 매칭)
   │  ─ StudentSubmitForm mode='edit' (이미지 다중/색상/PDF 모두 수정)
   │  ─ soft delete + "작성자가 삭제했어요" placeholder (회귀 위험 #8)
   │  ─ 학기 영속 PIN: 4자리 → SHA-256 hash → studentPinHash 활용
   │  ─ 교사 작성자 추적 도구 (우클릭 컨텍스트 메뉴)
   │  ─ 교사 닉네임 변경/일괄 숨김 권한
   │  ─ 서버: submit-edit + submit-delete + submit-pin-set/verify + update-nickname
   │       sessionToken OR pinHash 양방향 검증 + rate limit
   │  ─ WebSocket 신규: submit-edit / submit-delete / submit-pin-set / submit-pin-verify / update-nickname
   │  ─ 기존 broadcast 재활용 + 신규: nickname-changed
   │
   ▼
[Phase C] 카드 위치 변경 UX (5~7일, 4순위)              ← v2.1 4순위 (v2의 3순위에서 변경)
   │  ─ Freeform 자기 카드 react-rnd (per-card 동적, 모바일 viewport readOnly)
   │  ─ Freeform 자기 카드 기본 locked + "✏️ 위치 바꾸기" 토글 (회귀 mitigation)
   │  ─ Kanban 자기 카드 dnd-kit
   │  ─ Grid/Stream 회귀 0 (변경 0)
   │  ─ 서버: submit-move + sessionToken/PIN 검증 + rate limit 60/분
   │  ─ WebSocket 신규 1종 (R→S): submit-move
   │  ─ 기존 broadcast 재활용: post-updated (차분 patch)
   │  ─ 부하 테스트 150명 동시 드래그 (NFR)
```

### 1.2 v2.1 Phase 재배치 근거 (4 페르소나 4/4 합의 critical-1)

| 항목 | v2 (이전) | v2.1 (이후) | 근거 |
|------|----------|------------|------|
| 1순위 | A 카드 추가 | **B 내용 입력** | 학생 가치 임팩트 가장 큼 (이미지 3장 + PDF + 색상 + 마크다운 + 댓글 정교화 누적) + 도메인 변경(images/pdfUrl/color/studentPinHash/status union)이 모든 후속 Phase prop 시그니처 토대 |
| 2순위 | B 내용 입력 | **A 카드 추가 진입** | B에서 모달 풀스크린·이미지 첨부 안정화된 후 A의 진입점/드래프트가 의미. 드래프트에 이미지 base64 충돌 검증 선행 필요 |
| 3순위 | C 위치 변경 | **D 자기 카드 수정/삭제** | moderation OFF 기본되니 교사 모더레이션 도구(D6/D7) 시급. PIN 영속(D5)도 학생 자율권 핵심 |
| 4순위 | D 수정/삭제 | **C 위치 변경** | 가장 무거움 + 모바일 readOnly 정책 + Freeform 기본 locked 토글 등 정책 정합성 후순위. A·B·D 안정화 후 도입이 회귀 부담 최소 |

### 1.3 Phase 독립 릴리즈 보장 (v2.1 — 라벨 재할당)

각 Phase는 단독으로 릴리즈 가능해야 한다 (사용자가 Phase B만 보고 만족하면 거기서 종료 가능 — Plan §13 권고).

| Phase | 릴리즈 라벨 | BREAKING? | Rollback 비용 |
|-------|------------|-----------|---------------|
| **B (1순위)** | v1.15.0 | No (optional 필드만 + status union 확장) | images/pdfUrl/color 무시 시 텍스트만 표시. status='hidden-by-author'는 v1.14.x에서 unknown → 무시되어 카드 안 보임(소실 X, 그대로 디스크 잔존) |
| **A (2순위)** | v1.15.1 | No (학생 entry + boardSettings 추가) | localStorage 키 정리 + boardSettings 무시 시 default 'auto' 동작 |
| **D (3순위)** | v1.15.2 | No (submit-edit/delete/pin/nickname 미수신 시 hover-action만 비활성) | studentPinHash 무시 시 sessionToken 단일 매칭으로 폴백 |
| **C (4순위)** | v1.15.3 | No (submit-move 미수신 시 학생 readOnly 회귀) | 동일 |

**중요 (Forward / Backward Compat)**:
- v1.14.x 클라이언트가 v1.15.0 서버에 접속해도 동작 (학생 측에서 images/pdfUrl/color/status='hidden-by-author' 모두 무시)
- v1.15.x 클라이언트가 v1.14.x 서버에 접속해도 동작 (submit-* 메시지 미수신 시 학생 측 권한만 비활성)
- **status='hidden-by-author' placeholder는 v2.1 신설** — v1.14.x 학생 클라이언트는 이 카드를 unknown status로 보고 안 표시 (의도된 동작 — 데이터 소실 X)

### 1.4 각 Phase 완료 기준 (Plan §4.1 계승, v2.1 갱신)

- TypeScript 0 error
- `npm run build` + `vite build --config vite.student.config.ts` 모두 성공
- 도메인 규칙 unit test 신규 규칙당 최소 5 케이스
- WebSocket 통합 테스트 PASS (Phase별 시나리오 §10.3 참조)
- 본 Design 해당 섹션 "검증 체크리스트" 전 항목 PASS
- **회귀 위험 9건** grep + unit test PASS (CI) — v2 5건 + v2.1 4건
- 학생 entry 번들 < 500KB gzipped (vite build analyze)
- **Phase B/C 추가**: 부하 테스트 150명 동시 latency < 200ms (NFR + Plan §4.1 Phase B/C 완료 기준)
- **Phase A 추가**: iOS Safari 30초 백그라운드 후 자동 재연결 PASS + 첫 join → 화면 1초 측정 PASS
- **Phase D 추가**: PIN 평문 서버 저장 0 (grep + Zod 스키마 검사) + soft delete 동작 (placeholder 카드 표시)
- 병렬 리뷰 통과 (code-reviewer-low + bkit:code-analyzer + security-reviewer Phase B/C/D 필수)

---

## 2. 데이터 모델 변화 (v2.1 — Phase B에서 모든 필드 선언)

### 2.1 RealtimeWallPost 확장 (Phase B에서 일괄 도입)

**위치**: `src/domain/entities/RealtimeWall.ts` (v1 §2.1에 이어 추가, 기존 필드 절대 수정 X)

> **v2.1 변경**: Phase B가 1순위로 재배치되어, **모든 신규 optional 필드를 Phase B에서 한 번에 선언**한다 (Phase D/C는 활용만 함). 이는 Forward/Backward Compat 보장 + 도메인 일관성을 위한 결정.

```ts
export type RealtimeWallPostStatus =
  | 'pending'
  | 'approved'
  | 'hidden'
  | 'hidden-by-author';  // v2.1 신규 — 학생 self-soft-delete (placeholder)

export type RealtimeWallCardColor =
  | 'yellow' | 'pink' | 'blue' | 'green'
  | 'purple' | 'orange' | 'gray' | 'white';

export interface RealtimeWallPost {
  // ... v1 + v1.14 필드 (변경 없음) ...
  readonly id: string;
  readonly nickname: string;
  readonly text: string;
  readonly linkUrl?: string;
  readonly linkPreview?: RealtimeWallLinkPreview;
  readonly status: RealtimeWallPostStatus;  // v2.1: union 확장
  readonly pinned: boolean;
  readonly teacherHearts?: number;
  readonly submittedAt: number;
  readonly kanban: RealtimeWallKanbanPosition;
  readonly freeform: RealtimeWallFreeformPosition;
  readonly likes?: number;
  readonly likedBy?: readonly string[];
  readonly comments?: readonly RealtimeWallComment[];

  // ============ Phase B 신규 (이미지 다중 — v2.1 갱신) ============

  /**
   * v2.1 갱신: 카드당 최대 3장 이미지 (base64 data URI).
   * - 카드 합계 5MB 한도 (클라이언트 사전 차단 + 서버 Zod 검증)
   * - canvas 리사이즈(max width 1280px, JPEG quality 0.8) 후 인코딩
   * - magic byte 검증: PNG(89 50 4E 47) / JPEG(FF D8 FF) / GIF(47 49 46 38) / WebP(52 49 46 46 ... 57 45 42 50)
   * - SVG 명시 차단 (XSS 위험)
   * - 미존재 = undefined로 정규화 (빈 배열도 허용 — 의미 동일)
   *
   * v2의 `attachments?: RealtimeWallAttachment[]` (kind union) 설계는 v2.1에서 **단순화**:
   * - v2.1은 이미지만 → `images?: string[]` 단순 string 배열로 충분
   * - PDF는 별도 필드 `pdfUrl?` (v2.1 결정 #7)
   * - 동영상/오디오/그리기는 OOS (v3+)
   * - v3+에서 다시 `attachments` 배열 도입 시 별도 마이그레이션
   */
  readonly images?: readonly string[];

  // ============ Phase B 신규 (PDF 첨부 — v2.1 신규) ============

  /**
   * PDF 파일 URL. 별도 IPC 채널(`realtime-wall:upload-pdf`)로 업로드된 후 file:// URL.
   * - max 10MB (Plan FR-B4)
   * - magic byte `%PDF-` (25 50 44 46 2D) 검증 — svg/script/exe 거부
   * - WebSocket broadcast에는 fileURL만 (base64 X — 페이로드 폭증 방지)
   * - 학생/교사 모두 fileURL로 새 탭 열기
   * - file:// URL은 Electron Main에서 임시 디렉토리(app.getPath('temp')/ssampin-realtime-wall-pdf/) 저장
   */
  readonly pdfUrl?: string;
  readonly pdfFilename?: string;

  // ============ Phase B 신규 (카드 색상 — v2.1 신규) ============

  /**
   * 카드 색상 8색 (Padlet 패턴 — research §3 #1).
   * - 기본 'white' (undefined도 'white'로 정규화)
   * - 카드 배경 alpha 80% + 좌상단 dot으로 표시
   * - sp-* 토큰과 별개 (학생 표현 자유도)
   */
  readonly color?: RealtimeWallCardColor;

  // ============ Phase B 신규 (자기 카드 식별 — Phase D/C 활용) ============

  /**
   * 작성한 학생의 sessionToken. 자기 카드 식별 양방향 매칭의 첫 항.
   * - 학생 입력 시 서버가 ws.sessionToken을 강제 주입 (학생이 직접 보내는 값 신뢰 X — 위조 방지)
   * - 학생 수정/삭제/이동 메시지 수신 시 서버가 `post.ownerSessionToken === msg.sessionToken` 검증
   * - 교사가 생성한 카드는 undefined (학생 권한 영역 외)
   * - v1.14.x 기존 카드는 undefined → 학생 권한 차단 (best-effort, 손실 0)
   *
   * PIPA 영역 침범 X — sessionToken은 crypto.randomUUID() 생성 임의값, 학생 ID 아님
   * v2.1: localStorage 영속(sessionStorage 양방향 위험 mitigation)
   */
  readonly ownerSessionToken?: string;

  // ============ Phase B 신규 (학기 영속 PIN — v2.1 신규) ============

  /**
   * 학생 PIN의 SHA-256 hash (hex 64자리). 자기 카드 식별 양방향 매칭의 둘째 항.
   * - 학생이 4자리 PIN 입력 → SubtleCrypto.digest('SHA-256') → hex string
   * - 서버는 hash만 보관 (PIN 평문 절대 저장 X — PIPA 정합)
   * - 매칭: `post.studentPinHash === hashedCurrentPin` (sessionToken과 OR 매칭)
   * - PIN 미설정 학생은 undefined (익명 일회성 모드 = 현재 동작)
   * - 교사 화면에서 PIN reset 권한 X (교사는 hash만 봄 → 평문 복원 불가)
   *
   * 같은 PIN을 다른 PC/탭에서 입력 시 학기 내 자기 카드 식별 가능 (학생 본인 책임)
   */
  readonly studentPinHash?: string;

  // ============ Phase D 신규 (수정 표시 — 옵션) ============

  /**
   * 카드가 수정된 적이 있는지. UI 표시 용도 (자기 카드/다른 학생 카드 모두 "수정됨" 라벨).
   * 단순 boolean (수정 횟수/이력 미저장 — Padlet과 동일 정책, research §5-1)
   */
  readonly edited?: boolean;
}
```

### 2.2 이미지 다중 — `images?: string[]` 단순화 (v2.1)

**v2.1 결정**: v2의 `RealtimeWallAttachment` (kind union 배열) 설계는 **단순화**한다.

**근거**:
- v2.1 범위는 이미지만 (PDF는 별도 필드, 동영상/오디오/그리기는 OOS — Plan §2.5)
- string 배열 `images?: string[]` (각 요소 = data URL `data:image/png;base64,...`)이 충분
- v3+에서 다시 attachments 배열 도입 시 별도 마이그레이션으로 처리 (현재 단순화의 가치 > 미래 확장성)
- broadcast 페이로드 단순 + Zod 스키마 단순 + UI render 단순

**제약 (Plan FR-B2)**:
- 카드당 **최대 3장** (Zod `.max(3)` + 클라이언트 사전 차단)
- 카드 합계 **5MB** (raw bytes — base64 인코딩 후 ~6.7MB. WebSocket payload max 8MB로 여유)
- 각 이미지: canvas 리사이즈(max width 1280px, JPEG quality 0.8) — `useStudentImageMultiUpload` 훅
- 형식: PNG / JPEG / GIF / WebP만. SVG 명시 차단 (magic byte 검증)
- 첫 프레임 GIF는 정적으로 변환 (애니메이션 손실, v2.1 트레이드오프)
- alt 텍스트는 v2.1에서 OOS (모든 이미지 alt="첨부 이미지" 고정 — 향후 v3+에서 학생 입력 옵션 검토)

**별도 `attachments` 배열을 v2에서 제안했던 이유 (재검토)**:
- v2: kind union으로 동영상/오디오/그리기 확장 대비
- **v2.1: PDF는 별도 필드(`pdfUrl?`)로 분리되었고, 동영상 등은 v3+ OOS** → kind union 가치 낮아짐
- 단순 string 배열로 충분 + 페이로드 단순화

**서버 검증 (`electron/ipc/realtimeWall.ts`)**:
```ts
function validateImagesArray(images: readonly string[]): { ok: boolean; reason?: string } {
  if (images.length > 3) return { ok: false, reason: 'too-many-images' };
  let totalBytes = 0;
  for (const dataUrl of images) {
    const result = validateImageDataUrl(dataUrl);  // magic byte + mime + size
    if (!result.ok) return result;
    totalBytes += approximateRawBytesFromDataUrl(dataUrl);
  }
  if (totalBytes > 5 * 1024 * 1024) return { ok: false, reason: 'total-too-large' };
  return { ok: true };
}
```

### 2.3 RealtimeWallDraft 신규 엔티티 (Phase A — v2.1 갱신)

**위치**: `src/domain/entities/RealtimeWallDraft.ts` (신규 파일, 도메인 순수)

```ts
/**
 * 학생 드래프트. localStorage 영속 단위.
 * 서버 송신 X — 학생 브라우저 단독 보관.
 *
 * v2.1 갱신:
 * - 색상(color)도 드래프트에 보존
 * - 이미지/PDF는 base64 미보존 (quota 초과 방지) — 메타만(파일명/개수)
 * - 키 네이밍: `ssampin-realtime-wall-draft-{boardShortCode}-{sessionToken}` (보드+세션 분리)
 */
export interface RealtimeWallDraft {
  readonly version: 2;  // v2.1: version 1→2 (color 추가, sessionToken 키 분리)
  readonly boardShortCode: string;  // 어느 보드의 드래프트인지
  readonly sessionToken: string;     // v2.1 신규 — 같은 PC 다른 학생 드래프트 분리
  readonly nickname: string;
  readonly text: string;
  readonly linkUrl: string;
  readonly color?: RealtimeWallCardColor;  // v2.1 신규 — 색상 보존
  /**
   * 드래프트에 이미지/PDF를 포함하지 않음 (Plan §6 Risks — localStorage quota 초과 방지).
   * 첨부물은 모달이 열려있는 동안 메모리에만 보존, 모달 닫힘 시 소실.
   * UI에서 사용자에게 명시 안내: "이미지/PDF는 저장되지 않아요. 다시 올려주세요."
   */
  readonly hasImagesPending: boolean;  // 단순 플래그 (UI 안내용)
  readonly hasPdfPending: boolean;     // v2.1 신규 — PDF 별도 안내
  readonly updatedAt: number;
}

export const REALTIME_WALL_DRAFT_VERSION = 2;
```

**키 네이밍 (v2.1 갱신)**: `ssampin-realtime-wall-draft-{boardShortCode}-{sessionToken}`
- v2: 보드 단위만 → 같은 PC 다른 브라우저 학생 충돌 가능
- v2.1: 보드+세션 분리 → 같은 PC 같은 보드 다른 세션도 분리. **다보드 동시 작성** 지원 (Plan FR-A3 — boardId 분리로 다보드 동시 작성 지원)
- 마이그레이션: v1 키 발견 시 v2 형식으로 1회 자동 변환 후 v1 키 삭제

> **결정 근거 (Plan §7.2 결정 #2 v2.1 확정)**: localStorage 영속 + 보드+세션 분리. sessionStorage는 양방향 위험(critical-4)으로 거부. 같은 sessionToken 학생이 다른 보드 드래프트 동시 보유 가능 (Padlet 정책과 동일).

### 2.4 마크다운 (Phase B — v2.1 갱신)

도메인 모델 변경 없음. `text` 필드는 여전히 plain markdown 문자열로 저장. 렌더링 시점에만 react-markdown으로 ReactNode 트리 변환.

> **결정 근거 (Plan §B + v2.1)**: react-markdown@9 (~30KB gzipped, parser+renderer 통합) 채택. 후보 비교:
>
> | 후보 | 번들 (gzip) | 장점 | 단점 |
> |------|------------|------|------|
> | **react-markdown@9** ✅ | ~30KB | 선언적 ReactNode 트리, XSS 차단 기본 (`dangerouslySetInnerHTML` 미사용), `allowedElements` prop으로 화이트리스트 강제 가능 | 30KB는 micromark보다 큼 |
> | micromark (direct) | ~10KB | 가장 가벼움 | parser only — HTML 변환 후 dangerouslySetInnerHTML 필요 (XSS 위험), 직접 ReactNode 변환 코드 작성 부담 |
> | marked | ~10KB | 가벼움 | HTML 출력 (XSS 위험 동일) |
> | markdown-it | ~50KB | 풍부 | 너무 무거움 + HTML 출력 |
>
> **선정 결과**: `react-markdown@9`. **30KB 추가는 학생 번들 ~110KB → ~140KB (500KB 한도 충분 여유)**. `dangerouslySetInnerHTML` 절대 회피가 보안상 결정적 요인 (회귀 위험 #7).

**v2.1 화이트리스트 (Plan FR-B8)** — `allowedElements`:
```
['p', 'strong', 'em', 'ul', 'ol', 'li', 'blockquote']
```
- v2: ul/li만 → v2.1: **ol(ordered list) + blockquote(인용) 추가**
- 활성: bold (`**텍스트**`) / italic (`*텍스트*`) / unordered (`- 항목`) / ordered (`1. 항목`) / blockquote (`> 인용`)
- 차단 (`unwrapDisallowed: true` 옵션 — 차단된 요소는 plain text로 unwrap):
  - heading (h1-h6)
  - link (`<a>` — linkUrl 별도 필드로 이미 OG 처리)
  - image (`<img>` — images 필드로 이미 별도 처리)
  - code / pre / table
  - **marquee / iframe / script / svg / object / embed / video / audio** (XSS 위험 — fuzz 테스트로 차단 검증)

**v2.1 입력 방식 변경 — Bold/Italic 버튼 툴바 (페1 critical-6 mitigation)**:
- 학생은 별표 `**`/`*` 직접 입력하지 않음 (한글 자모 분리 위험 — 초등 IME)
- textarea 위 툴바: **B(Bold) / I(Italic) / List(`-`) / Quote(`>`) 4 버튼**
- 사용자 흐름: 텍스트 선택 → B 클릭 → 선택 영역이 `**선택텍스트**`로 변환 (입력 단계에서 별표 처리 — 학생은 별표를 보지 않음)
- 컴포넌트: `StudentMarkdownToolbar.tsx` (신규, §5.10 참조)

**remark-gfm 미사용**: 추가 ~20KB + GFM 기능(table/strikethrough) 가치 낮음. 순정 react-markdown만 사용. v2.1에서 blockquote는 CommonMark 기본 지원이므로 remark-gfm 불필요.

**fuzz 테스트 (§9.3 + §10.7)**: `<marquee>`, `<iframe>`, `<script>`, `<svg onload="...">`, `<object>`, `<embed>`, `data:text/html`, `javascript:` 100+ payload 차단 검증.

### 2.5 마이그레이션 (v1.14.x → v1.15.x — v2.1 갱신)

```ts
// src/domain/rules/realtimeWallRules.ts에 v2.1 normalizer 추가
export function normalizePostForPadletModeV2(
  post: RealtimeWallPost,
): RealtimeWallPost {
  return {
    ...normalizePostForPadletMode(post),  // v1 normalizer 호출 (likes/likedBy/comments)
    images: post.images ?? undefined,        // v2.1 — undefined 유지 (빈 배열 정규화는 UI에서)
    pdfUrl: post.pdfUrl,                     // v2.1 — undefined 유지
    pdfFilename: post.pdfFilename,           // v2.1
    color: post.color ?? 'white',            // v2.1 — default 'white'
    // ownerSessionToken은 default 주입 안 함 (undefined 유지) — 기존 카드는 학생 권한 차단
    // studentPinHash도 default 주입 안 함
    edited: post.edited ?? false,
    // status='hidden-by-author'는 v2.1 신규 union 멤버 — 기존 데이터에 없으므로 통과
  };
}

export function normalizeBoardForPadletModeV2(board: WallBoard): WallBoard {
  return {
    ...board,
    settings: board.settings ?? { moderation: 'off' },  // v2.1 — boardSettings default
    posts: board.posts.map(normalizePostForPadletModeV2),
  };
}
```

v1 normalizer 호출 후 v2.1 필드 추가 — 중복 normalize 안전 (idempotent).

**v2.1 신규 마이그레이션 주의사항**:
- `images?: string[]`은 `attachments` 배열(v2 초안)과 호환 안 됨 (v2 → v2.1 사이에 구현 미스라면 별도 변환 필요). v2 초안은 미구현이므로 실제 위험 0.
- `status='hidden-by-author'`는 v1.14.x 클라이언트가 unknown으로 보고 무시 → 카드 안 보임 (의도된 동작)
- `boardSettings.moderation`은 v1.14.x의 `approvalMode`와 통합 매핑:
  - `moderation='off'` ↔ `approvalMode='auto'` (즉시 공개)
  - `moderation='manual'` ↔ `approvalMode='on'` (교사 승인 큐 활성)
  - 둘 다 존재 시 `moderation` 우선, `approvalMode`는 deprecated 경고만

### 2.6 RealtimeWallBoardSettings 신규 엔티티 (Phase A — v2.1 신규)

**위치**: `src/domain/entities/RealtimeWallBoardSettings.ts` (신규 파일, 도메인 순수)

```ts
/**
 * 보드 단위 설정. v2.1 신규 — moderation 프리셋 (Plan §7.2 결정 #8).
 * WallBoard 엔티티에 settings 필드로 부착.
 */
export interface RealtimeWallBoardSettings {
  readonly version: 1;

  /**
   * 카드 승인 모드.
   * - 'off': 즉시 공개 (Padlet 기본값 정합 — Plan §7.2 결정 #8). 학생 카드 = 교사 화면 즉시 표시 + broadcast 즉시 student approved
   * - 'manual': 교사 승인 큐 활성. 학생 카드 = pending status로 큐 진입 → 교사가 approve/reject
   *
   * 기존 v1.14.x의 `approvalMode: 'auto' | 'on'`과 통합 매핑:
   * - moderation='off' ↔ approvalMode='auto'
   * - moderation='manual' ↔ approvalMode='on'
   *
   * 기본값 (Plan §7.2 결정 #8): 'off'
   * 학교 정책 따라 보드 생성 시 교사가 토글 가능 (BoardCreateModal + RealtimeWallBoardSettingsPanel)
   */
  readonly moderation: 'off' | 'manual';
}
```

**WallBoard 엔티티 확장**:
```ts
export interface WallBoard {
  // ... v1 필드 ...
  readonly settings?: RealtimeWallBoardSettings;  // v2.1 신규 optional
}
```

`settings` 미존재 시 `{ moderation: 'off' }` default (v1.14.x 보드는 자동 'off' 적용).

### 2.7 PIN hash 도메인 (Phase B 선언 + Phase D 활용 — v2.1 신규)

**도메인 헬퍼**: `src/domain/rules/realtimeWallRules.ts`에 `hashPin` 추가 (단 SubtleCrypto는 도메인 외부 의존성 — 클라이언트 헬퍼는 `src/usecases/realtimeWall/HashStudentPin.ts` use case로 분리).

```ts
// src/usecases/realtimeWall/HashStudentPin.ts
/**
 * 4자리 PIN을 SHA-256 hex string으로 변환. PIN 평문은 절대 외부 송신 X.
 * @param pin 4자리 숫자 (또는 문자열)
 * @param salt 보드 단위 salt (boardShortCode 사용 — 같은 PIN이라도 다른 보드면 hash 다름)
 * @returns hex 64자리
 */
export async function hashStudentPin(pin: string, boardShortCode: string): Promise<string> {
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be 4 digits');
  const salt = `ssampin-realtime-wall:${boardShortCode}`;
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
```

**클라이언트 사용 (Phase D)**:
- `useStudentPin.ts` 훅에서 PIN 입력 받음 → `hashStudentPin(pin, boardShortCode)` 호출
- 결과 hex string을 localStorage `ssampin-realtime-wall-pin-{boardShortCode}` 키에 저장 (PIN 평문 X)
- 카드 제출/수정/삭제 시 `studentPinHash`를 메시지에 포함

**서버 사용 (Phase D)**:
- 서버는 hash만 보관 (도메인 `RealtimeWallPost.studentPinHash`)
- 매칭: `post.studentPinHash === msg.pinHash`만 비교 (hash → 평문 복원 불가)
- 교사 화면에서 PIN reset 권한 X (PIPA 정합 — 교사는 hash만 봄)

**보안 (§9.8 추가)**:
- 4자리 PIN은 무차별 대입 가능 (10^4 = 10000) → boardShortCode salt로 보드 간 격리 (rainbow table 무효화)
- 같은 PIN이라도 다른 보드 = 다른 hash
- PIN 분실 → 학생 본인 책임 (Plan §6.2 H 표 PIN 분실 mitigation)

---

## 3. 도메인 규칙 신설

### 3.1 isOwnCard (Phase D/C 공용 — v2.1 양방향 OR 매칭)

**위치**: `src/domain/rules/realtimeWallRules.ts`

```ts
/**
 * 자기 카드 식별 — sessionToken OR studentPinHash 양방향 OR 매칭 (v2.1).
 *
 * - 둘 중 하나라도 일치하면 true (Plan 원칙 v2-1)
 * - PIN 미설정 학생 → currentPinHash undefined → sessionToken 단일 매칭으로 폴백 (v2 동작)
 * - PIN 설정 학생 → 같은 PC 다른 탭/세션에서도 PIN으로 식별 가능
 * - 빈 문자열은 false 처리 (false-positive 방지)
 *
 * UI/usecase 모두 이 함수만 사용 (직접 비교 금지).
 */
export interface OwnerMatchContext {
  readonly currentSessionToken: string | undefined;
  readonly currentPinHash: string | undefined;
}

export function isOwnCard(
  post: Pick<RealtimeWallPost, 'ownerSessionToken' | 'studentPinHash'>,
  ctx: OwnerMatchContext,
): boolean {
  // 첫째 항: sessionToken 매칭
  if (ctx.currentSessionToken && post.ownerSessionToken && post.ownerSessionToken === ctx.currentSessionToken) {
    return true;
  }
  // 둘째 항: PIN hash 매칭
  if (ctx.currentPinHash && post.studentPinHash && post.studentPinHash === ctx.currentPinHash) {
    return true;
  }
  return false;
}
```

**테스트 케이스 (10+)**:
1. sessionToken 정상 매칭 + PIN 미설정 → true
2. sessionToken 불일치 + PIN 매칭 → true (PIN으로 학기 영속 식별)
3. sessionToken 매칭 + PIN 매칭 → true (이중 매칭 OK)
4. sessionToken 불일치 + PIN 불일치 → false
5. ownerSessionToken/studentPinHash 모두 undefined → false (v1.14.x 카드 또는 교사 생성)
6. currentSessionToken/currentPinHash 모두 undefined → false (학생 진입 직전)
7. currentSessionToken 빈 문자열 → false (false-positive 방지)
8. ownerSessionToken 빈 문자열 → false
9. currentPinHash 빈 문자열 → false
10. studentPinHash 빈 문자열 → false

### 3.2 validateMove (Phase C — v2.1 sessionToken/PIN 양방향 검증)

**위치**: 같은 파일

```ts
/**
 * 학생 위치 변경 요청 검증.
 * - 자기 카드 검증 (sessionToken OR pinHash 양방향 — v2.1)
 * - 좌표 sane 범위 (Freeform: 0 <= x <= 10000, 0 <= y <= 10000, 100 <= w <= 2000, 100 <= h <= 2000)
 * - Kanban: columnId 존재 + order 0 이상 정수
 *
 * @returns { ok: true } | { ok: false, reason: string }
 */
export interface MoveRequest {
  readonly postId: string;
  readonly sessionToken: string;
  readonly pinHash?: string;  // v2.1 신규 — PIN 설정 학생 옵션
  readonly freeform?: { x: number; y: number; w: number; h: number };
  readonly kanban?: { columnId: string; order: number };
}

export type MoveValidationResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'not-owner' | 'invalid-position' | 'invalid-column' | 'mobile-readonly' };

export function validateMove(
  posts: readonly RealtimeWallPost[],
  columns: readonly RealtimeWallColumn[],
  req: MoveRequest,
): MoveValidationResult
```

**테스트 케이스 (8+)**:
1. 정상 freeform 이동 (sessionToken 매칭) → ok
2. 정상 kanban 이동 (sessionToken 매칭) → ok
3. **v2.1: 정상 freeform 이동 (PIN hash 매칭, sessionToken 불일치)** → ok
4. postId 미존재 → not-found
5. ownerSessionToken/studentPinHash 둘 다 불일치 → not-owner
6. freeform x 음수 → invalid-position
7. kanban columnId 미존재 → invalid-column
8. freeform w 50 (min 100 미만) → invalid-position

**모바일 readOnly 강제 (Plan FR-C1 v2.1)**: 도메인 함수가 viewport 정보를 알 수 없으므로, **모바일 readOnly는 클라이언트 측에서만 강제** (Rnd 컴포넌트 미마운트). 서버는 정상 처리 (모바일 학생이 데스크톱 모드 강제 활성화 등 엣지 케이스도 허용).

### 3.3 validateEdit / validateDelete (Phase D — v2.1: PIN 검증 추가 + soft delete)

```ts
export interface EditRequest {
  readonly postId: string;
  readonly sessionToken: string;
  readonly pinHash?: string;  // v2.1
  readonly text?: string;
  readonly linkUrl?: string;
  readonly images?: readonly string[];   // v2.1 — 이미지 다중
  readonly pdfUrl?: string;              // v2.1 — PDF
  readonly pdfFilename?: string;         // v2.1
  readonly color?: RealtimeWallCardColor; // v2.1 — 색상
}

export function validateEdit(
  posts: readonly RealtimeWallPost[],
  req: EditRequest,
  maxTextLength: number,
): { ok: true } | { ok: false; reason: 'not-found' | 'not-owner' | 'invalid-text' | 'invalid-link' | 'invalid-images' | 'invalid-pdf' | 'invalid-color' | 'placeholder-locked' }

export function validateDelete(
  posts: readonly RealtimeWallPost[],
  req: { postId: string; sessionToken: string; pinHash?: string },
): { ok: true } | { ok: false; reason: 'not-found' | 'not-owner' | 'already-deleted' }
```

**v2.1 삭제 정책 변경 (Plan §7.2 결정 #4)**: v2의 (b) hard delete를 **(a) soft delete + placeholder**로 변경 (페2 critical-5).

- 삭제 = `status` 필드를 `'hidden-by-author'`로 갱신 (posts 배열에서 절대 제거 X — 회귀 위험 #8)
- 좋아요/댓글은 보존 (데이터 일관성)
- 학생/교사 모두 카드 위치에 **"작성자가 삭제했어요" placeholder 카드** 표시 (높이는 유지, 본문은 회색 텍스트)
- 교사 화면에서는 placeholder 위에 "복원" 메뉴 (status='approved'로 복귀)
- 한 번 삭제된 카드를 다시 삭제하려는 시도는 `already-deleted` 에러

**`placeholder-locked` 사유 (validateEdit)**: status='hidden-by-author'인 카드는 학생이 다시 수정 불가 (복원은 교사 권한). UI에서 owner action 메뉴 미표시.

### 3.4 applyMove / applyEdit / applyDelete (Phase C/D — v2.1 soft delete)

```ts
/**
 * 위치 변경 적용. 변경된 posts 배열 반환.
 * 호출 전 validateMove로 검증 통과 보장 (호출자 책임).
 */
export function applyMove(
  posts: readonly RealtimeWallPost[],
  req: MoveRequest,
): RealtimeWallPost[]

/**
 * 카드 수정 적용. text/linkUrl/images/pdfUrl/color 갱신 + edited=true.
 */
export function applyEdit(
  posts: readonly RealtimeWallPost[],
  req: EditRequest,
): RealtimeWallPost[]

/**
 * 카드 삭제 적용 — v2.1 (a) soft delete (Plan §7.2 결정 #4 변경).
 *
 * - posts 배열에서 절대 제거 X (회귀 위험 #8 — hard delete 패턴 grep 0 hit)
 * - status='hidden-by-author'로 갱신만
 * - 좋아요/댓글 보존 (lights, likedBy, comments 모두 그대로)
 * - text/images/pdfUrl/linkUrl/color 보존 (교사 복원 메뉴로 복귀 가능)
 * - 단 placeholder 표시 시 UI에서 본문 비표시 (RealtimeWallCard 분기 — §5.4)
 */
export function applyDelete(
  posts: readonly RealtimeWallPost[],
  postId: string,
): RealtimeWallPost[] {
  return posts.map((p) =>
    p.id === postId ? { ...p, status: 'hidden-by-author' as const } : p
  );
  // 절대 posts.filter(p => p.id !== postId) 패턴 사용 금지 — 회귀 위험 #8
}

/**
 * 교사 복원 — status='hidden-by-author' → 'approved' 복귀.
 * v2.1 신규 (페2 critical-5 mitigation 후속).
 */
export function applyRestore(
  posts: readonly RealtimeWallPost[],
  postId: string,
): RealtimeWallPost[] {
  return posts.map((p) =>
    p.id === postId && p.status === 'hidden-by-author' ? { ...p, status: 'approved' as const } : p
  );
}
```

각 함수 unit test 5+ 케이스. **applyDelete는 hard delete grep 0 hit 검증 (회귀 위험 #8)**.

### 3.5 validateImages 다중 (Phase B — v2.1 갱신: 다중 + 합계 검증)

```ts
/**
 * 단일 이미지 data URL 검증.
 * - data URL prefix 검증
 * - magic byte 검증 (PNG: 89 50 4E 47, JPEG: FF D8 FF, GIF: 47 49 46 38, WebP: 52 49 46 46 .. 57 45 42 50)
 * - SVG 명시 차단
 * - 단일 크기 max 5MB (raw 기준 — base64 → bytes 변환)
 */
export type ImageValidationResult =
  | { ok: true }
  | { ok: false; reason: 'too-large' | 'invalid-format' | 'svg-not-allowed' | 'magic-byte-mismatch' | 'invalid-data-url' };

export function validateImageDataUrl(dataUrl: string): ImageValidationResult;

/**
 * v2.1 신규 — 이미지 다중 배열 검증.
 * - 최대 3장 (Plan FR-B2)
 * - 카드 합계 5MB
 * - 각 이미지 validateImageDataUrl 통과
 */
export type ImagesArrayValidationResult =
  | { ok: true }
  | { ok: false; reason: 'too-many-images' | 'total-too-large' | ImageValidationResult['reason']; index?: number };

export function validateImages(
  images: readonly string[],
): ImagesArrayValidationResult;
```

**테스트 케이스 (10+)**:
1. 정상 PNG 1장 → ok
2. 정상 PNG 3장 (합계 4MB) → ok
3. PNG 4장 → too-many-images
4. PNG 3장 합계 5.5MB → total-too-large
5. SVG 포함 → svg-not-allowed (index 명시)
6. data URL 아닌 요소 포함 → invalid-data-url
7. mimeType=image/png인데 magic byte 다름 → magic-byte-mismatch
8. 단일 6MB 이미지 → too-large
9. 정상 JPEG/GIF/WebP 혼합 3장 → ok
10. 빈 배열 → ok (이미지 미첨부 = 정상)

### 3.6 validatePdf (Phase B — v2.1 신규)

```ts
/**
 * PDF 첨부 검증. 별도 IPC 채널로 업로드된 PDF에 적용.
 * - magic byte `%PDF-` (25 50 44 46 2D) 검증
 * - max 10MB (Plan FR-B4)
 * - svg/script/exe magic byte 거부
 * - file:// URL 형식 검증 (외부 URL 거부)
 */
export type PdfValidationResult =
  | { ok: true }
  | { ok: false; reason: 'too-large' | 'invalid-format' | 'magic-byte-mismatch' | 'invalid-url' };

export function validatePdf(
  pdfBytes: Uint8Array,
  pdfUrl: string,
): PdfValidationResult;
```

**테스트 케이스 (6+)**:
1. 정상 PDF (`%PDF-1.4` magic byte) → ok
2. SVG 위장 (mime=application/pdf + 실제 SVG) → magic-byte-mismatch
3. 11MB PDF → too-large
4. `http://example.com/foo.pdf` URL → invalid-url (file:// 만 허용)
5. magic byte 누락 → magic-byte-mismatch
6. exe magic byte (4D 5A) → magic-byte-mismatch

### 3.7 validateBoardSettings (Phase A — v2.1 신규)

```ts
export type BoardSettingsValidationResult =
  | { ok: true }
  | { ok: false; reason: 'invalid-moderation' | 'unknown-version' };

export function validateBoardSettings(
  settings: unknown,
): BoardSettingsValidationResult;
```

테스트 케이스: moderation='off'/'manual' OK, 'auto' 거부(deprecated), unknown version 거부.

### 3.8 ensureOwnerCredentials (Phase B/D — 서버 측 보조 도우미, v2.1 갱신)

```ts
/**
 * 학생 카드 생성 시 서버가 ws 세션의 sessionToken과 (선택)pinHash를 강제 주입.
 * 학생이 직접 보낸 ownerSessionToken / studentPinHash는 무시 (위조 방지).
 *
 * v2.1: PIN hash도 메시지에 포함되어 있으면 함께 주입 (학생 자율 결정 — PIN 미설정 시 undefined)
 */
export function ensureOwnerCredentials(
  post: Omit<RealtimeWallPost, 'ownerSessionToken' | 'studentPinHash'>,
  serverContext: {
    serverSessionToken: string;        // ws 세션 sessionToken (서버 신뢰 진실)
    pinHashFromMessage?: string;        // 메시지에 첨부된 PIN hash (학생 자율)
  },
): RealtimeWallPost {
  return {
    ...post,
    ownerSessionToken: serverContext.serverSessionToken,
    // PIN은 학생 자율 — 메시지 제공 시에만 주입 (강제 X)
    studentPinHash: serverContext.pinHashFromMessage,
  };
}
```

이 함수는 서버 측 (`electron/ipc/realtimeWall.ts`)에서만 호출. 클라이언트는 절대 직접 ownerSessionToken/studentPinHash를 도메인 객체에 부여하지 않음 (메시지 전송만).

---

## 4. WebSocket 메시지 프로토콜 (v2.1 갱신)

### 4.1 v1 → v2.1 변경 요약 (Phase 순서 B→A→D→C)

| Phase | 신규 클라→서버 (R→S) | 신규 서버→클라 (S→R) | 변경 |
|-------|---------------------|---------------------|------|
| **B (1순위)** | 1: `submit-comment-v2` (이미지 1장 첨부 가능) + 기존 `submit` 페이로드 확장 (images 다중 + pdfUrl + color) | 0 (`post-added` payload에 새 필드 자동 포함) | submit Zod 스키마 v2.1 확장 |
| **A (2순위)** | 0 | 1: `boardSettings-changed` (moderation 토글 broadcast) | boardSettings 도메인 신설 |
| **D (3순위)** | 4: `submit-edit` / `submit-delete` (soft delete) / `submit-pin-set` / `submit-pin-verify` / `update-nickname` | 1: `nickname-changed` (학생 다른 클라이언트 닉네임 동기화) + `post-updated` 재활용 (status='hidden-by-author') | rate limit 5종 신규 (move 60/edit 10/delete 5/pin 5/nickname 10) |
| **C (4순위)** | 1: `submit-move` | 0 (기존 `post-updated` 차분 patch 재활용) | post-updated patch에 `freeform` 또는 `kanban` 부분만 |

**총 신규 R→S 메시지 7종 (v2의 3종에서 +4)**: submit-move / submit-edit / submit-delete / submit-comment-v2 / submit-pin-set / submit-pin-verify / update-nickname

**총 신규 S→R 메시지 2종 (v2의 0종에서 +2)**: boardSettings-changed / nickname-changed

v1의 12종 broadcast는 그대로 유지 + v2.1에서 2종 추가 = **총 14종**.

**신규 IPC 채널 1개 (v2.1 신규)**: `realtime-wall:upload-pdf` (R→M, Renderer가 PDF 업로드 → Main 프로세스가 임시 디렉토리 저장 → fileURL 반환). PDF는 WebSocket으로 base64 broadcast 안 함 — 페이로드 폭증 방지.

### 4.2 클라이언트 → 서버 신규 메시지 (Zod 스키마 + 타입 — v2.1 갱신)

**위치**: `electron/ipc/realtimeWall.ts` 또는 `src/domain/rules/realtimeWallMessages.ts` (도메인 순수 — Zod는 외부 의존성이므로 타입 정의만 도메인, Zod 스키마는 usecases/infrastructure 레이어)

```ts
import { z } from 'zod';

// =========== 공통 스키마 ===========

const ImageDataUrlSchema = z.string()
  .startsWith('data:image/')
  .max(7_000_000);  // base64 5MB raw → ~6.6MB encoded + 여유

const ColorSchema = z.enum(['yellow', 'pink', 'blue', 'green', 'purple', 'orange', 'gray', 'white']);

const PinHashSchema = z.string().regex(/^[0-9a-f]{64}$/);  // SHA-256 hex 64자리
// PIN 평문은 절대 스키마에 등장 X (회귀 위험 #9)

// =========== Phase B: submit 확장 (v2.1 — images 다중 + pdfUrl + color) ===========

const StudentSubmitSchemaV2_1 = z.object({
  type: z.literal('submit'),
  sessionToken: z.string().min(1).max(64),
  pinHash: PinHashSchema.optional(),  // v2.1 — PIN 설정 학생만 첨부
  nickname: z.string().min(1).max(20),
  text: z.string().min(1).max(1000),
  linkUrl: z.string().url().max(2000).optional(),
  images: z.array(ImageDataUrlSchema).max(3).optional(),  // v2.1 — 카드당 3장
  pdfUrl: z.string().startsWith('file://').max(500).optional(),  // v2.1 — file:// URL만
  pdfFilename: z.string().min(1).max(200).optional(),
  color: ColorSchema.optional(),  // v2.1
});

// =========== Phase B: submit-comment-v2 (v2.1 신규 — 이미지 1장 첨부 가능) ===========

const SubmitCommentV2Schema = z.object({
  type: z.literal('submit-comment-v2'),
  sessionToken: z.string().min(1).max(64),
  pinHash: PinHashSchema.optional(),
  postId: z.string().min(1).max(64),
  nickname: z.string().min(1).max(20),
  text: z.string().min(1).max(200),
  images: z.array(ImageDataUrlSchema).max(1).optional(),  // 댓글은 1장만 (Plan FR-B12)
});

// =========== Phase D: submit-pin-set / submit-pin-verify (v2.1 신규) ===========

const SubmitPinSetSchema = z.object({
  type: z.literal('submit-pin-set'),
  sessionToken: z.string().min(1).max(64),
  pinHash: PinHashSchema,  // v2.1 — PIN 평문 X (회귀 위험 #9)
});

const SubmitPinVerifySchema = z.object({
  type: z.literal('submit-pin-verify'),
  sessionToken: z.string().min(1).max(64),
  pinHash: PinHashSchema,  // v2.1 — PIN 평문 X
});

// =========== Phase D: update-nickname (v2.1 신규 — 교사 권한) ===========

const UpdateNicknameSchema = z.object({
  type: z.literal('update-nickname'),
  teacherToken: z.string().min(1).max(64),  // 교사 인증 (별도 — 학생 sessionToken과 다름)
  postId: z.string().min(1).max(64),
  newNickname: z.string().min(1).max(20),
});

// =========== Phase C: submit-move (R→S) ===========

const FreeformPositionSchema = z.object({
  x: z.number().int().min(0).max(10000),
  y: z.number().int().min(0).max(10000),
  w: z.number().int().min(100).max(2000),
  h: z.number().int().min(100).max(2000),
});

const KanbanPositionSchema = z.object({
  columnId: z.string().min(1).max(64),
  order: z.number().int().min(0).max(10000),
});

const SubmitMoveSchema = z.object({
  type: z.literal('submit-move'),
  sessionToken: z.string().min(1).max(64),
  pinHash: PinHashSchema.optional(),  // v2.1 — PIN 매칭 옵션
  postId: z.string().min(1).max(64),
  freeform: FreeformPositionSchema.optional(),
  kanban: KanbanPositionSchema.optional(),
}).refine(
  (m) => m.freeform !== undefined || m.kanban !== undefined,
  { message: 'either freeform or kanban must be provided' },
);

// =========== Phase D: submit-edit / submit-delete (R→S — v2.1 갱신) ===========

const SubmitEditSchema = z.object({
  type: z.literal('submit-edit'),
  sessionToken: z.string().min(1).max(64),
  pinHash: PinHashSchema.optional(),  // v2.1
  postId: z.string().min(1).max(64),
  text: z.string().min(1).max(1000).optional(),
  linkUrl: z.string().url().max(2000).optional().nullable(),  // null = 링크 제거
  images: z.array(ImageDataUrlSchema).max(3).optional(),  // v2.1 — 다중, 빈 배열 = 첨부 제거
  pdfUrl: z.string().startsWith('file://').max(500).optional().nullable(),  // null = PDF 제거
  pdfFilename: z.string().min(1).max(200).optional().nullable(),
  color: ColorSchema.optional(),
});

const SubmitDeleteSchema = z.object({
  type: z.literal('submit-delete'),
  sessionToken: z.string().min(1).max(64),
  pinHash: PinHashSchema.optional(),  // v2.1
  postId: z.string().min(1).max(64),
});

// =========== 통합 union 파서 (v2.1 — 7종 신규) ===========

export const ClientMessageSchemaV2_1 = z.discriminatedUnion('type', [
  // v1 (기존)
  z.object({ type: z.literal('join'), sessionToken: z.string().min(1).max(64) }),
  StudentSubmitSchemaV2_1,  // v2.1 확장
  z.object({
    type: z.literal('like-toggle'),
    sessionToken: z.string().min(1).max(64),
    postId: z.string().min(1).max(64),
  }),
  z.object({
    type: z.literal('comment-add'),  // v1 댓글 (호환 유지)
    sessionToken: z.string().min(1).max(64),
    postId: z.string().min(1).max(64),
    nickname: z.string().min(1).max(20),
    text: z.string().min(1).max(200),
  }),
  // v2.1 신규
  SubmitCommentV2Schema,
  SubmitMoveSchema,
  SubmitEditSchema,
  SubmitDeleteSchema,
  SubmitPinSetSchema,
  SubmitPinVerifySchema,
  UpdateNicknameSchema,
]);

export type ClientMessageV2_1 = z.infer<typeof ClientMessageSchemaV2_1>;
```

**v2.1 보안 어서션 (회귀 위험 #9)**: ClientMessageSchema 내부에 `pin:` 평문 필드는 절대 등장 X. 모두 `pinHash` (SHA-256 hex 64자리)로만. CI grep 검사:
```
grep -E "z\.literal\('submit-pin-' ).+pin\s*:\s*z\." src/domain/rules/realtimeWallMessages.ts
# 0 hit이어야 함
```

### 4.3 서버 → 클라이언트 broadcast (v2.1 — 12종 + 신규 2종 = 14종)

v2.1은 **신규 broadcast 메시지 2종 추가**. 기존 12종 + 2종 = 14종.

| 사용 사례 | broadcast (v2.1) | 차분 patch 형태 |
|----------|-----------------|----------------|
| 위치 변경 (Phase C) | `post-updated` (재활용) | `{ type, postId, patch: { freeform: {...} } }` 또는 `{ type, postId, patch: { kanban: {...} } }` |
| 수정 (Phase D) | `post-updated` (재활용) | `{ type, postId, patch: { text?, linkUrl?, images?, pdfUrl?, pdfFilename?, color?, edited: true } }` |
| **삭제 (Phase D — v2.1 변경)** | `post-updated` (재활용 — soft delete) | `{ type, postId, patch: { status: 'hidden-by-author' } }` (post-removed 사용 X — 회귀 위험 #8) |
| 교사 hidden (기존) | `post-updated` 또는 `post-removed` | 기존 그대로 (status='hidden') |
| 첨부 추가 (Phase B) | `post-added` (재활용) | `{ type, post: RealtimeWallPost }` post에 images/pdfUrl/color 포함 (자동) |
| 댓글 v2 (Phase B — 이미지 1장) | `comment-added` (재활용 — payload 확장) | `{ type, postId, comment: RealtimeWallComment }` comment에 images 필드 추가 |
| **boardSettings 변경 (Phase A — v2.1 신규)** | **`boardSettings-changed`** (신규) | `{ type, settings: { moderation: 'off' \| 'manual' } }` |
| **닉네임 변경 (Phase D — v2.1 신규)** | **`nickname-changed`** (신규) | `{ type, postId, newNickname: string }` 또는 다중: `{ type, sessionTokenOrPinHash: string, newNickname: string }` (교사 일괄 적용 시) |
| 학생 PIN 검증 결과 (Phase D — v2.1) | 본인에게만 단일수신: `pin-verified` 또는 `pin-mismatch` | `{ type, ok: boolean }` |

`post-updated` 메시지는 v1에서 `patch: Partial<RealtimeWallPost>` 형태로 정의되어 있음 (v1 Design §4.3). v2.1은 이 patch에 `freeform/kanban/text/linkUrl/images/pdfUrl/pdfFilename/color/edited/status` 부분만 채워 송신 — 전체 post 객체 X (Plan FR-C6).

**v2.1 신규 broadcast 통합 union 타입**:
```ts
export type BroadcastableServerMessageV2_1 =
  // v1 12종
  | { type: 'wall-state'; board: WallBoardSnapshot }
  | { type: 'post-added'; post: RealtimeWallPost; sentAt: number }
  | { type: 'post-updated'; postId: string; patch: Partial<RealtimeWallPost>; sentAt: number }
  | { type: 'post-removed'; postId: string; sentAt: number }  // 교사 hidden 시만 사용
  | { type: 'closed' }
  | { type: 'error'; message: string }
  | { type: 'like-toggled'; postId: string; likes: number; likedBy: readonly string[]; sentAt: number }
  | { type: 'comment-added'; postId: string; comment: RealtimeWallComment; sentAt: number }  // v2.1: comment.images 확장
  | { type: 'comment-removed'; postId: string; commentId: string; sentAt: number }
  | { type: 'student-form-locked'; locked: boolean }
  | { type: 'submitted'; postId: string }   // 단일수신 (본인)
  | { type: 'wall'; board: WallBoardSnapshot }  // 교사 init
  // v2.1 신규 2종
  | { type: 'boardSettings-changed'; settings: RealtimeWallBoardSettings; sentAt: number }
  | { type: 'nickname-changed'; postIds: readonly string[]; newNickname: string; sentAt: number };

// 본인 단일수신 (v2.1 신규)
export type SingleClientServerMessageV2_1 =
  | { type: 'pin-verified'; ok: boolean }
  | { type: 'pin-mismatch' };
```

### 4.4 응답 메시지 (R→S 요청에 대한 ACK/error)

학생이 보낸 submit-move/edit/delete의 결과는 다음 두 경로로 학생에게 전달:

1. **성공**: 본인을 포함한 모든 클라이언트에 `post-updated` / `post-removed` broadcast (학생 본인도 broadcast로 reconcile)
2. **실패** (검증 실패, rate limit 초과, 자기 카드 아님): 학생 본인에게만 `error` 메시지 (v1 기존)

```ts
// 서버 → 학생 본인에게만 (실패 시)
{ type: 'error', message: '본인 카드만 수정할 수 있어요' }
{ type: 'error', message: '잠시 후 다시 시도해주세요' }  // rate limit
```

### 4.5 메시지 ordering (LWW 정책)

Plan §C 결정 (동시 편집 race) — **LWW (Last Write Wins) + server timestamp**.

- 모든 broadcast 메시지에 `sentAt: number` (server timestamp) 포함 (v1 §4.4 정책 그대로)
- 같은 postId의 update가 짧은 시간에 여러 번 도착하면 **마지막 도착이 이김**
- 클라이언트 reconcile 로직: `applyMessage`는 도착 순서대로 적용 (sentAt 비교 X) — TCP 순서 보장 신뢰
- 단 wall-state 초기 push와 그 사이 update의 race는 sentAt으로 정렬

> **결정 근거 (Plan §G)**: timestamp 기반 reconcile은 복잡도 대비 가치 낮음. 학생 A 드래그 + 교사 hidden 같은 race는 매우 드물고 결과 차이 미미. 단순 LWW 채택.

### 4.6 Rate Limit 신규 추가 (Phase B/A/D/C — v2.1 갱신)

v1 정책 (1 카드/세션, 좋아요 30/분, 댓글 5/분) 위에 v2.1 갱신:

| 메시지 | Limit | 키 | 초과 시 |
|--------|-------|-----|---------|
| `submit` (카드 제출) | **5/분 (v1 1/세션 → v2.1 완화)** | sessionToken + IP | error + 무시. 학생 1인 다중 카드 흡수 (Plan FR-B13) |
| `submit-comment-v2` | **10/분 (v1 5/분 → v2.1 완화)** | sessionToken + IP | error + 무시 |
| `submit-move` | 60/분 | sessionToken + IP | error 메시지 + 입력 무시 |
| `submit-edit` | 10/분 | sessionToken + IP | 동일 |
| `submit-delete` | 5/분 | sessionToken + IP | 동일 |
| `submit-pin-set` | **5/분 (v2.1 신규)** | sessionToken + IP | 동일 (PIN 변경 폭주 방지) |
| `submit-pin-verify` | **30/분 (v2.1 신규)** | sessionToken + IP | brute force 방지 (10000개 PIN을 30/분 = 333분 = 5시간 소요) |
| `update-nickname` | **10/분 (v2.1 신규)** | teacherToken + IP | 교사 권한 |

**`rateLimitBuckets.clear()` 회귀 위험 #5**: closeSession 시 v2.1 신규 5종 buckets도 함께 clear. 단위 테스트로 검증.

**PIN brute force 보안 (회귀 위험 #9 추가 mitigation)**:
- 4자리 PIN = 10000 가능 조합
- 30/분 rate limit 시 5시간 소요 → 학기 동안 brute force 사실상 불가
- 추가 강화 옵션 (v3+): 같은 sessionToken에서 5회 연속 실패 시 30분 lockout

---

## 5. UI 컴포넌트 트리 (v2.1 — Phase 순서 B→A→D→C)

### 5.1 Phase별 신규/수정 컴포넌트 매핑

```
src/student/                              [v2 핵심 변경 영역 — Phase B에서 가장 큰 변경]
├── main.tsx                              (변경 없음)
├── StudentRealtimeWallApp.tsx            [수정 A+D: long-press/더블클릭 진입 등록 / 드래프트 복원 /
│                                                    안내 텍스트(PIN 옵션 통합) / iOS Safari 재연결 wiring]
├── StudentJoinScreen.tsx                 [수정 D: localStorage sessionToken 영속 (sessionStorage→localStorage 변경)]
├── StudentBoardView.tsx                  [수정 A+D: FAB 잠금 강화, 드래프트 칩, 자기 카드 hover-action,
│                                                    moderation OFF 시 즉시 공개 안내 1회]
├── StudentSubmitForm.tsx                 [수정 B+A+D: 이미지 다중 + PDF + 색상 + OG 미리보기 + Bold/Italic 툴바 +
│                                                     모바일 풀스크린 + Intl.Segmenter 카운터 + mode='edit' +
│                                                     모달 minimize]
├── StudentCommentForm.tsx                [v2.1 신규 (Phase B-B9): 댓글 정교화 폼 — 이미지 1장/Bold·Italic/
│                                                                  풀스크린/IME 카운터]
├── StudentMarkdownToolbar.tsx            [v2.1 신규 (Phase B): textarea 위 B/I/List/Quote 4 버튼 툴바 +
│                                                              선택 영역 마크다운 wrap (별표 직접 입력 X — 페1 critical-6)]
├── StudentColorPicker.tsx                [v2.1 신규 (Phase B): 8색 horizontal scroll 픽커 (yellow/pink/blue/green/
│                                                              purple/orange/gray/white)]
├── StudentImageMultiPicker.tsx           [v2.1 신규 (Phase B): 최대 3장 미리보기 + 개별 X 삭제 +
│                                                              drop/paste/picker 통합]
├── StudentPdfPicker.tsx                  [v2.1 신규 (Phase B): PDF 1개 선택 + 파일명/크기 표시]
├── StudentPipaConsentModal.tsx           [v2.1 신규 (Phase B-B11): 친구 사진 동의 1회 안내 모달
│                                                                  (localStorage `ssampin-pipa-consent-shown`)]
├── StudentDraftChip.tsx                  [Phase A 신규: 좌하단 "작성 중인 카드" 칩 (보드 단위 분리)]
├── StudentDeleteConfirmDialog.tsx        [Phase D 신규: 한국어 확인 다이얼로그 ("작성자가 삭제했어요" 안내)]
├── StudentPinSetupModal.tsx              [v2.1 신규 (Phase D-D5): 4자리 PIN 입력/변경/확인 모달]
├── StudentNicknameChangedToast.tsx       [v2.1 신규 (Phase D-D7): 교사 닉네임 변경 broadcast 수신 시 1회 토스트]
├── useStudentDraft.ts                    [Phase A 신규: localStorage 드래프트 훅 (보드+세션 단위 키 분리)]
├── useStudentLongPress.ts                [v2.1 신규 (Phase A-A2): 모바일 600ms touchhold 진입 훅 (페3 critical-3 mitigation)]
├── useStudentDoubleClick.ts              [v2.1 신규 (Phase A-A2): 데스크톱 빈 영역 더블클릭 진입 훅
│                                                                 (data-empty-area 영역 한정)]
├── useStudentImageMultiUpload.ts         [v2.1 신규 (Phase B): drop/paste/picker 통합 + canvas 리사이즈
│                                                              (max width 1280px, JPEG q=0.8) + 다중 합계 검증]
├── useStudentPdfUpload.ts                [v2.1 신규 (Phase B): IPC `realtime-wall:upload-pdf` 호출 +
│                                                              magic byte 검증 + 10MB 한도]
├── useStudentPin.ts                      [v2.1 신규 (Phase D-D5): PIN 입력 → SHA-256 hash → localStorage 저장 +
│                                                                  서버 verify]
├── useStudentReconnect.ts                [v2.1 신규 (Phase A — H-2 mitigation): visibilitychange +
│                                                                                 지수 백오프 재연결 (1s→2s→4s→8s, max 30s)]
├── useGraphemeCounter.ts                 [v2.1 신규 (Phase B-B10): Intl.Segmenter('ko', {granularity:'grapheme'})
│                                                                  IME-aware 카운터]
├── useIsMobile.ts                        [v2.1 신규 (Phase C-C1): viewport <768px 검출 (Freeform readOnly 강제용)]
└── useStudentWebSocket.ts                [수정 D+C: submit-edit/delete/pin-set/pin-verify/update-nickname/move 메서드 추가]

src/adapters/components/Tools/RealtimeWall/
├── RealtimeWallCard.tsx                  [수정 B+D: 마크다운 렌더(allowedElements 화이트리스트), 이미지 다중 표시,
│                                                   PDF 아이콘, 색상 배경 + 좌상단 점, placeholder 분기 (status='hidden-by-author'),
│                                                   자기 카드 sky 테두리 + OwnerActions wiring (line 207-208 절대 보존)]
├── RealtimeWallCardOwnerActions.tsx      [Phase D 신규: 학생 자기 카드 수정/삭제 메뉴 (sky-300)]
├── RealtimeWallCardImageGallery.tsx      [v2.1 신규 (Phase B): 이미지 다중 표시 carousel (lazy load + 최대 높이)]
├── RealtimeWallCardPdfBadge.tsx          [v2.1 신규 (Phase B): PDF 아이콘 + 파일명 + 클릭 시 새 탭 열기]
├── RealtimeWallCardMarkdown.tsx          [Phase B 신규: react-markdown wrapper (allowedElements 화이트리스트 강제)]
├── RealtimeWallCardPlaceholder.tsx       [v2.1 신규 (Phase D): "작성자가 삭제했어요" placeholder 카드
│                                                              (회색 톤 + 좋아요/댓글 표시는 보존)]
├── RealtimeWallFreeformBoard.tsx         [수정 C: 학생 자기 카드 Rnd 활성화 (per-card 동적) +
│                                                  모바일 viewport readOnly 강제 +
│                                                  자기 카드 기본 locked + "✏️ 위치 바꾸기" 토글]
├── RealtimeWallKanbanBoard.tsx           [수정 C: 학생 자기 카드 dnd-kit useSortable disabled 동적]
├── RealtimeWallGridBoard.tsx             (변경 없음 — 회귀 0)
├── RealtimeWallStreamBoard.tsx           (변경 없음 — 회귀 0)
├── RealtimeWallBoardSettingsPanel.tsx    [v2.1 신규 (Phase A-A5): moderation 'off'|'manual' 토글 UI (보드 설정 패널)]
├── RealtimeWallTeacherContextMenu.tsx    [v2.1 신규 (Phase D-D6/D7): 카드 우클릭 컨텍스트 메뉴
│                                                                    "이 작성자의 다른 카드 보기" / "닉네임 변경" / "이 학생 카드 모두 숨김"]
├── RealtimeWallTeacherStudentTrackerPanel.tsx [v2.1 신규 (Phase D-D6): 같은 sessionToken/PIN hash 카드 강조 표시
│                                                                       (border ring + filter)]
├── RealtimeWallFreeformLockToggle.tsx    [v2.1 신규 (Phase C-C5): Freeform 자기 카드 우상단
│                                                                  "✏️ 위치 바꾸기" 토글 버튼]
└── types.ts                              [수정 C+D: BoardRouter prop onOwnCardMove/onOwnCardEdit/onOwnCardDelete +
                                                    onTeacherTrackAuthor + onTeacherUpdateNickname 추가]

src/adapters/components/Tools/RealtimeWall/Settings/
└── BoardCreateModal.tsx                  [수정 A: moderation 프리셋 토글 추가]

src/adapters/stores/
└── useRealtimeWallSyncStore.ts           [수정 B+A+D+C: submitOwnCardMove/Edit/Delete + setPin/verifyPin +
                                                       updateNickname + saveDraft/loadDraft +
                                                       boardSettings 액션 + applyMessage 신규 broadcast 처리
                                                       (boardSettings-changed/nickname-changed/post-updated status)]

electron/ipc/
├── realtimeWall.ts                       [수정 B+A+D+C: Zod 스키마 v2.1 + 메시지 핸들러 7종 신규 +
│                                                       이미지 다중 magic byte 검증 + 색상 검증 +
│                                                       rate limit 5종 신규 + soft delete 적용 (status 갱신만, 절대 hard delete X) +
│                                                       PIN hash 매칭 검증 + 교사 모더레이션 핸들러]
└── realtimeWallPdfUpload.ts              [v2.1 신규 (Phase B): PDF 별도 IPC 채널
                                                              (Renderer → Main → app.getPath('temp') 저장 → fileURL 반환) +
                                                              magic byte `%PDF-` 검증 + 10MB 한도]
```

### 5.2 BoardRouter prop 시그니처 (Plan §C 회신 + v2.1 신규)

**위치**: `src/adapters/components/Tools/RealtimeWall/types.ts`

v1의 `RealtimeWallBoardCommonProps`에 v2.1 prop 다수 추가:

```ts
export interface RealtimeWallBoardCommonProps {
  // ============ v1 기존 (변경 없음) ============
  readonly posts: readonly RealtimeWallPost[];
  readonly columns?: readonly RealtimeWallColumn[];
  readonly readOnly?: boolean;
  readonly viewerRole?: RealtimeWallViewerRole;
  readonly currentSessionToken?: string;
  readonly onTogglePin?: (postId: string) => void;
  readonly onHide?: (postId: string) => void;
  readonly onTeacherHeart?: (postId: string) => void;
  readonly onStudentLike?: (postId: string) => void;
  readonly onAddComment?: (postId: string, input: StudentCommentInput) => void;
  readonly onRemoveComment?: (postId: string, commentId: string) => void;
  readonly onColumnChange?: (postId: string, columnId: string, order: number) => void;
  readonly onPositionChange?: (postId: string, position: RealtimeWallFreeformPosition) => void;

  // ============ v2.1 신규: 자기 카드 식별 양방향 매칭 ============

  /**
   * v2.1 신규 — 학생 PIN hash (PIN 설정 학생만). isOwnCard 양방향 매칭 둘째 항.
   */
  readonly currentPinHash?: string;

  // ============ v2.1 신규: 모바일 viewport 분기 (Freeform readOnly 강제) ============

  /**
   * v2.1 신규 (Phase C-C1) — true면 Freeform 학생 자기 카드도 readOnly (드래그 차단).
   * useIsMobile 훅으로 부모가 결정.
   */
  readonly isMobile?: boolean;

  // ============ v2.1 신규: boardSettings (moderation 프리셋) ============

  /**
   * v2.1 신규 (Phase A-A5) — 보드 단위 설정. moderation 'off'|'manual' 등.
   */
  readonly boardSettings?: RealtimeWallBoardSettings;

  // ============ v2 신규 (Phase D + C — v2.1 시그니처 갱신) ============

  /**
   * 학생이 자기 카드 위치 변경 시 호출 (Freeform: x/y/w/h, Kanban: columnId/order).
   * viewerRole === 'student' && isOwnCard(post)인 카드에서만 활성.
   * 호출자 책임: useRealtimeWallSyncStore.submitMove → WebSocket send
   */
  readonly onOwnCardMove?: (
    postId: string,
    position: { freeform?: RealtimeWallFreeformPosition; kanban?: RealtimeWallKanbanPosition },
  ) => void;

  /**
   * 학생이 자기 카드 수정 메뉴 클릭 시 호출. 부모가 StudentSubmitForm을 mode='edit'로 열어줌.
   */
  readonly onOwnCardEdit?: (postId: string) => void;

  /**
   * 학생이 자기 카드 삭제 확인 후 호출. 부모가 useRealtimeWallSyncStore.submitDelete 호출.
   * v2.1: hard delete 절대 X — soft delete (status='hidden-by-author' 갱신만)
   */
  readonly onOwnCardDelete?: (postId: string) => void;

  // ============ v2.1 신규: 교사 모더레이션 도구 (Phase D-D6/D7) ============

  /**
   * v2.1 신규 — 교사가 카드 우클릭 후 "이 작성자의 다른 카드 보기" 클릭 시 호출.
   * 부모가 같은 ownerSessionToken/studentPinHash 카드를 강조(border ring + filter).
   */
  readonly onTeacherTrackAuthor?: (postId: string) => void;

  /**
   * v2.1 신규 — 교사가 학생 닉네임 변경 메뉴 사용 시 호출.
   */
  readonly onTeacherUpdateNickname?: (postId: string, newNickname: string) => void;

  /**
   * v2.1 신규 — 교사가 "이 학생 카드 모두 숨김" 클릭 시 호출 (sessionToken/PIN 기준 일괄 hidden).
   */
  readonly onTeacherBulkHideStudent?: (criteria: { sessionToken?: string; pinHash?: string }) => void;

  /**
   * v2.1 신규 — 교사가 placeholder 카드 "복원" 클릭 시 호출 (status='approved' 복귀).
   */
  readonly onTeacherRestoreCard?: (postId: string) => void;

  /**
   * v2.1 신규 (Phase A-A2) — 데스크톱 빈 영역 더블클릭 / 모바일 long-press 시 호출.
   * 학생 entry에서만 wiring (교사는 무시).
   */
  readonly onEmptyAreaCreate?: () => void;
}
```

### 5.3 4 보드별 viewerRole + isOwnCard + isMobile 분기 (Phase C — v2.1 갱신)

**기존 패턴** (v1 Design §5.1):
```ts
const effectiveReadOnly = readOnly || viewerRole === 'student';
```

**v2.1 패턴** — per-card 동적 결정 (PIN 매칭 + 모바일 readOnly 강제 + Freeform 기본 locked):
```ts
function getEffectiveReadOnlyForCard(
  post: RealtimeWallPost,
  viewerRole: RealtimeWallViewerRole,
  ownerCtx: OwnerMatchContext,  // v2.1 — sessionToken + pinHash
  globalReadOnly: boolean,
  isMobile: boolean,             // v2.1 — Freeform mobile readOnly
  boardKind: 'freeform' | 'kanban' | 'grid' | 'stream',
  freeformLockToggleEnabled: boolean,  // v2.1 — 자기 카드 "✏️ 위치 바꾸기" 토글 상태
): boolean {
  if (globalReadOnly) return true;
  if (viewerRole === 'teacher') return false;
  // viewerRole === 'student'
  if (!isOwnCard(post, ownerCtx)) return true;  // 다른 학생/교사 카드 → readOnly

  // 자기 카드 — v2.1 추가 정책:
  if (boardKind === 'grid' || boardKind === 'stream') return true;  // 학생 정렬 불가 (회귀 0 — Plan FR-C3)
  if (boardKind === 'freeform') {
    if (isMobile) return true;  // 모바일 Freeform readOnly (Plan FR-C1 v2.1 — 페2 high-2)
    if (!freeformLockToggleEnabled) return true;  // 기본 locked, "✏️ 위치 바꾸기" 토글 OFF (Plan FR-C8 — 페1 critical)
  }
  return false;  // 자기 카드 + (Kanban OR (Freeform + 데스크톱 + 토글 ON))
}
```

**핵심 변경 3건 (v2.1)**:
1. `isOwnCard` 호출 시 `OwnerMatchContext` (sessionToken + pinHash 양방향)
2. Freeform + 모바일 viewport는 자기 카드도 readOnly (실수 방지)
3. Freeform 자기 카드 기본 locked, "✏️ 위치 바꾸기" 토글 활성 시에만 드래그 (페1 critical-5 — 초등 실수 방지)

#### Freeform 보드 (RealtimeWallFreeformBoard.tsx)

```tsx
function RealtimeWallFreeformBoard({ posts, viewerRole, currentSessionToken, onOwnCardMove, ... }) {
  return posts.map((post) => {
    const cardReadOnly = getEffectiveReadOnlyForCard(post, viewerRole, currentSessionToken, false);

    if (cardReadOnly) {
      // 절대위치 div만 (드래그 불가)
      return (
        <div
          key={post.id}
          style={{
            position: 'absolute',
            left: post.freeform.x, top: post.freeform.y,
            width: post.freeform.w, height: post.freeform.h,
          }}
        >
          <RealtimeWallCard post={post} viewerRole={viewerRole} ... />
        </div>
      );
    }

    // editable: Rnd 활성화
    return (
      <Rnd
        key={post.id}
        size={{ width: post.freeform.w, height: post.freeform.h }}
        position={{ x: post.freeform.x, y: post.freeform.y }}
        onDragStop={(_, d) => onOwnCardMove?.(post.id, {
          freeform: { ...post.freeform, x: d.x, y: d.y }
        })}
        onResizeStop={(_, __, ref, ___, pos) => onOwnCardMove?.(post.id, {
          freeform: { x: pos.x, y: pos.y, w: ref.offsetWidth, h: ref.offsetHeight }
        })}
        bounds="parent"
        // 학생 자기 카드도 zIndex는 변경 안 함 (교사 권한)
      >
        <RealtimeWallCard post={post} viewerRole={viewerRole} ... />
      </Rnd>
    );
  });
}
```

#### Kanban 보드 (RealtimeWallKanbanBoard.tsx)

```tsx
function RealtimeWallKanbanBoard({ posts, viewerRole, currentSessionToken, onOwnCardMove, ... }) {
  // DndContext는 viewerRole에 관계없이 마운트 (학생도 자기 카드 드래그 가능해야 함)
  // useSortable의 disabled를 per-card 동적으로 결정

  return (
    <DndContext onDragEnd={handleDragEnd}>
      {columns.map((col) => (
        <SortableContext key={col.id} items={postsInColumn(col.id).map(p => p.id)}>
          {postsInColumn(col.id).map((post) => (
            <KanbanCard
              key={post.id}
              post={post}
              disabled={getEffectiveReadOnlyForCard(post, viewerRole, currentSessionToken, false)}
            />
          ))}
        </SortableContext>
      ))}
    </DndContext>
  );

  function handleDragEnd(event: DragEndEvent) {
    if (viewerRole === 'student') {
      const post = posts.find(p => p.id === event.active.id);
      if (!post || !isOwnCard(post, currentSessionToken)) return;
      // 자기 카드만 onOwnCardMove 호출
      onOwnCardMove?.(post.id, { kanban: deriveNewKanbanPosition(event) });
    } else {
      onColumnChange?.(post.id, ...);  // 교사는 기존 onColumnChange
    }
  }
}

function KanbanCard({ post, disabled }: { post: RealtimeWallPost; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform } = useSortable({
    id: post.id,
    disabled,  // ← per-card 동적
  });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={{ transform: CSS.Transform.toString(transform) }}>
      <RealtimeWallCard post={post} ... />
    </div>
  );
}
```

#### Grid / Stream 보드

**변경 없음.** Plan FR-C3에 명시 — 회귀 0 보장. 학생/교사 모두 위치 변경 불가.

### 5.4 RealtimeWallCard 자기 카드 hover-action + placeholder + 색상 (Phase D — v2.1 갱신)

**위치**: `src/adapters/components/Tools/RealtimeWall/RealtimeWallCard.tsx`

v1 line 207-208 (회귀 위험 #3) 절대 보존. **그 아래에 학생 자기 카드 액션 + placeholder 분기 + 색상 배경**.

```tsx
function RealtimeWallCard({
  post, viewerRole = 'teacher',
  currentSessionToken, currentPinHash,  // v2.1 — PIN 매칭
  onOwnCardEdit, onOwnCardDelete,
  onTeacherRestoreCard,  // v2.1 — placeholder 복원
  ...
}: RealtimeWallCardProps) {

  // === v1 보존 (절대 수정 금지 — 회귀 위험 #3) ===
  const teacherActions = viewerRole === 'teacher' ? actions : null;
  const teacherDragHandle = viewerRole === 'teacher' ? dragHandle : null;

  // === v2.1 신규: placeholder 분기 (status='hidden-by-author') ===
  if (post.status === 'hidden-by-author') {
    return (
      <RealtimeWallCardPlaceholder
        post={post}
        viewerRole={viewerRole}
        onRestore={viewerRole === 'teacher' ? () => onTeacherRestoreCard?.(post.id) : undefined}
      />
    );
  }

  // === v2.1 신규: 자기 카드 식별 (PIN 매칭 양방향) ===
  const ownerCtx: OwnerMatchContext = { currentSessionToken, currentPinHash };
  const isOwn = isOwnCard(post, ownerCtx);
  const ownerActions = (viewerRole === 'student' && isOwn && (onOwnCardEdit || onOwnCardDelete)) ? (
    <RealtimeWallCardOwnerActions
      onEdit={() => onOwnCardEdit?.(post.id)}
      onDelete={() => onOwnCardDelete?.(post.id)}
    />
  ) : null;

  // === v2.1 신규: 카드 색상 배경 (8색) ===
  const colorClass = useMemo(() => {
    const cardColor = post.color ?? 'white';
    return REALTIME_WALL_CARD_COLOR_CLASSES[cardColor];  // alpha 80% 배경 + 좌상단 점
  }, [post.color]);

  return (
    <article className={[
      'rounded-xl border p-4 relative',
      colorClass,  // v2.1
      isOwn && viewerRole === 'student' ? 'border-sky-400/40 ring-1 ring-sky-400/20' : 'border-sp-border',
    ].join(' ')}>
      {/* v2.1 신규: 좌상단 색상 점 */}
      {post.color && post.color !== 'white' && (
        <div className={`absolute top-2 left-2 w-2 h-2 rounded-full ${REALTIME_WALL_CARD_COLOR_DOT[post.color]}`} />
      )}

      <div className="absolute right-2 top-2">
        {teacherActions}
        {ownerActions}
      </div>

      {/* 본문: 마크다운 렌더 (v2.1 화이트리스트 — §5.5) */}
      <RealtimeWallCardMarkdown text={post.text} />

      {/* v2.1 신규: 이미지 다중 표시 */}
      {post.images && post.images.length > 0 && (
        <RealtimeWallCardImageGallery images={post.images} />
      )}

      {/* v2.1 신규: PDF 첨부 표시 */}
      {post.pdfUrl && (
        <RealtimeWallCardPdfBadge pdfUrl={post.pdfUrl} pdfFilename={post.pdfFilename ?? 'document.pdf'} />
      )}

      {/* v1 그대로 — linkPreview, comments, likes, edited 라벨 등 */}
      ...
    </article>
  );
}
```

**v2.1 색상 배경 매핑 상수** (`RealtimeWallCardColors.ts` 신규):
```ts
export const REALTIME_WALL_CARD_COLOR_CLASSES: Record<RealtimeWallCardColor, string> = {
  white:  'bg-sp-card',
  yellow: 'bg-amber-100/80 dark:bg-amber-900/30',
  pink:   'bg-pink-100/80 dark:bg-pink-900/30',
  blue:   'bg-sky-100/80 dark:bg-sky-900/30',
  green:  'bg-emerald-100/80 dark:bg-emerald-900/30',
  purple: 'bg-violet-100/80 dark:bg-violet-900/30',
  orange: 'bg-orange-100/80 dark:bg-orange-900/30',
  gray:   'bg-slate-100/80 dark:bg-slate-800/30',
};

export const REALTIME_WALL_CARD_COLOR_DOT: Record<Exclude<RealtimeWallCardColor, 'white'>, string> = {
  yellow: 'bg-amber-400', pink: 'bg-pink-400', blue: 'bg-sky-400', green: 'bg-emerald-400',
  purple: 'bg-violet-400', orange: 'bg-orange-400', gray: 'bg-slate-400',
};
```

### 5.5 RealtimeWallCardMarkdown (Phase B 신규 — v2.1 갱신: ol/blockquote 추가)

```tsx
import ReactMarkdown from 'react-markdown';

// v2.1 — ol/blockquote 추가 (페3 high-1)
const ALLOWED_ELEMENTS = ['p', 'strong', 'em', 'ul', 'ol', 'li', 'blockquote'] as const;

export function RealtimeWallCardMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      allowedElements={[...ALLOWED_ELEMENTS]}
      unwrapDisallowed={true}
      // remark-gfm 미사용 (보안 + 번들 크기 절감)
      // 모든 link/image/code/table/heading/marquee/iframe/script/svg/object/embed는 unwrap되어 plain text로
      components={{
        p: ({ children }) => <p className="text-sm text-sp-text leading-relaxed">{children}</p>,
        strong: ({ children }) => <strong className="font-bold text-sp-text">{children}</strong>,
        em: ({ children }) => <em className="italic text-sp-text">{children}</em>,
        ul: ({ children }) => <ul className="list-disc list-inside text-sm text-sp-text space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside text-sm text-sp-text space-y-0.5">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        // v2.1 신규: blockquote — 좌측 sky 보더 + 살짝 들여쓰기
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-sky-400/40 pl-3 text-sm text-sp-muted italic my-2">
            {children}
          </blockquote>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
```

**중요 (v2.1 — 회귀 위험 #7)**:
- `dangerouslySetInnerHTML` 절대 사용 안 함 (react-markdown 내부도 마찬가지). CI grep 0 hit 검증.
- `allowedElements` 화이트리스트 강제 (7종)
- `unwrapDisallowed: true` — 차단된 요소는 plain text로 노출 (보안)
- `link` 처리: linkUrl은 별도 필드로 이미 OG 미리보기로 표시 → 본문 내 markdown link는 의도적으로 차단
- **fuzz 테스트** (§10.7): `<marquee>`, `<iframe>`, `<script>`, `<svg onload="...">`, `<object>`, `<embed>` 100+ payload 차단 검증

### 5.10 StudentMarkdownToolbar (v2.1 신규 — Phase B)

별표 직접 입력 회피 (페1 critical-6 — 한글 자모분리 충돌).

**위치**: `src/student/StudentMarkdownToolbar.tsx`

```tsx
interface StudentMarkdownToolbarProps {
  /** 연결된 textarea ref — 선택 영역 read + insert */
  readonly textareaRef: React.RefObject<HTMLTextAreaElement>;
  /** textarea 값 변경 핸들러 (제어형) */
  readonly onChange: (newValue: string) => void;
}

export function StudentMarkdownToolbar({ textareaRef, onChange }: StudentMarkdownToolbarProps) {
  const wrap = (prefix: string, suffix: string = prefix) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart, selectionEnd, value } = ta;
    const selected = value.slice(selectionStart, selectionEnd) || '텍스트';
    const newValue = value.slice(0, selectionStart) + prefix + selected + suffix + value.slice(selectionEnd);
    onChange(newValue);
    // 다음 tick에서 선택 복원
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(selectionStart + prefix.length, selectionStart + prefix.length + selected.length);
    });
  };

  const prefixLine = (prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart, value } = ta;
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const newValue = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    onChange(newValue);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(selectionStart + prefix.length, selectionStart + prefix.length);
    });
  };

  return (
    <div className="flex gap-1 mb-1" role="toolbar" aria-label="텍스트 서식">
      <button
        type="button"
        onClick={() => wrap('**')}
        className="px-2 py-1 text-sm font-bold text-sp-text hover:bg-sp-card/80 rounded"
        aria-label="굵게"
      >B</button>
      <button
        type="button"
        onClick={() => wrap('*')}
        className="px-2 py-1 text-sm italic text-sp-text hover:bg-sp-card/80 rounded"
        aria-label="기울임"
      >I</button>
      <button
        type="button"
        onClick={() => prefixLine('- ')}
        className="px-2 py-1 text-sm text-sp-text hover:bg-sp-card/80 rounded"
        aria-label="목록"
      >• 목록</button>
      <button
        type="button"
        onClick={() => prefixLine('> ')}
        className="px-2 py-1 text-sm text-sp-text hover:bg-sp-card/80 rounded"
        aria-label="인용"
      >❝ 인용</button>
    </div>
  );
}
```

**핵심**: 학생은 별표 `**` / `*` 직접 입력하지 않음. B 버튼 클릭 시 textarea에 별표 자동 삽입 + 선택 영역 보존. 한글 IME 자모분리 위험 0.

### 5.11 StudentColorPicker (v2.1 신규 — Phase B)

**위치**: `src/student/StudentColorPicker.tsx`

```tsx
interface StudentColorPickerProps {
  readonly value: RealtimeWallCardColor | undefined;
  readonly onChange: (color: RealtimeWallCardColor) => void;
}

const COLORS: { color: RealtimeWallCardColor; bg: string; label: string }[] = [
  { color: 'white',  bg: 'bg-white border-sp-border',     label: '기본' },
  { color: 'yellow', bg: 'bg-amber-200',                  label: '노랑' },
  { color: 'pink',   bg: 'bg-pink-200',                   label: '분홍' },
  { color: 'blue',   bg: 'bg-sky-200',                    label: '파랑' },
  { color: 'green',  bg: 'bg-emerald-200',                label: '초록' },
  { color: 'purple', bg: 'bg-violet-200',                 label: '보라' },
  { color: 'orange', bg: 'bg-orange-200',                 label: '주황' },
  { color: 'gray',   bg: 'bg-slate-200',                  label: '회색' },
];

export function StudentColorPicker({ value, onChange }: StudentColorPickerProps) {
  return (
    <div className="flex gap-2 overflow-x-auto py-2" role="radiogroup" aria-label="카드 색상">
      {COLORS.map(({ color, bg, label }) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={label}
          onClick={() => onChange(color)}
          className={[
            'shrink-0 w-8 h-8 rounded-full border-2 transition-all',
            bg,
            value === color ? 'border-sky-500 ring-2 ring-sky-300' : 'border-transparent',
          ].join(' ')}
        />
      ))}
    </div>
  );
}
```

### 5.12 StudentPdfPicker (v2.1 신규 — Phase B)

**위치**: `src/student/StudentPdfPicker.tsx`

```tsx
interface StudentPdfPickerProps {
  readonly pdfUrl?: string;
  readonly pdfFilename?: string;
  readonly onSelect: (file: File) => Promise<void>;  // useStudentPdfUpload 호출
  readonly onRemove: () => void;
  readonly maxSizeMB?: number;  // default 10
}

export function StudentPdfPicker({ pdfUrl, pdfFilename, onSelect, onRemove, maxSizeMB = 10 }: StudentPdfPickerProps) {
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    if (!file.type.includes('pdf')) {
      setError('PDF 파일만 업로드할 수 있어요.');
      return;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`PDF는 최대 ${maxSizeMB}MB까지 업로드 가능해요.`);
      return;
    }
    try {
      await onSelect(file);
    } catch (e) {
      setError('PDF 업로드에 실패했어요. 다시 시도해주세요.');
    }
  };

  if (pdfUrl) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-sp-border bg-sp-card p-2">
        <span className="text-sm text-sp-text">📄 {pdfFilename ?? 'document.pdf'}</span>
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto text-xs text-rose-400 hover:text-rose-500"
          aria-label="PDF 제거"
        >✕ 제거</button>
      </div>
    );
  }

  return (
    <div>
      <label className="inline-flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-sp-border bg-sp-card/50 px-4 py-3 hover:bg-sp-card text-sm text-sp-muted">
        📄 PDF 첨부 (최대 {maxSizeMB}MB)
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="hidden"
        />
      </label>
      {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
    </div>
  );
}
```

### 5.13 RealtimeWallBoardSettingsPanel (v2.1 신규 — Phase A-A5)

**위치**: `src/adapters/components/Tools/RealtimeWall/RealtimeWallBoardSettingsPanel.tsx`

```tsx
interface RealtimeWallBoardSettingsPanelProps {
  readonly settings: RealtimeWallBoardSettings;
  readonly onChange: (next: RealtimeWallBoardSettings) => void;
}

export function RealtimeWallBoardSettingsPanel({ settings, onChange }: RealtimeWallBoardSettingsPanelProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-bold text-sp-text">카드 승인 모드</label>
        <p className="text-xs text-sp-muted mb-2">
          학생이 올린 카드를 어떻게 처리할지 선택하세요.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...settings, moderation: 'off' })}
            className={[
              'flex-1 rounded-lg border px-3 py-2 text-sm transition-all',
              settings.moderation === 'off'
                ? 'border-sky-500 bg-sky-500/10 text-sp-text font-bold'
                : 'border-sp-border bg-sp-card text-sp-muted hover:bg-sp-card/80',
            ].join(' ')}
          >
            즉시 공개
            <p className="text-xs text-sp-muted font-normal mt-0.5">학생 카드 바로 표시 (Padlet 기본)</p>
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...settings, moderation: 'manual' })}
            className={[
              'flex-1 rounded-lg border px-3 py-2 text-sm transition-all',
              settings.moderation === 'manual'
                ? 'border-sky-500 bg-sky-500/10 text-sp-text font-bold'
                : 'border-sp-border bg-sp-card text-sp-muted hover:bg-sp-card/80',
            ].join(' ')}
          >
            교사 승인
            <p className="text-xs text-sp-muted font-normal mt-0.5">교사가 보고 승인 후 표시</p>
          </button>
        </div>
      </div>
    </div>
  );
}
```

`BoardCreateModal`에도 동일 컴포넌트 inline 표시 (보드 생성 시 기본값 'off').

### 5.14 StudentPinSetupModal (v2.1 신규 — Phase D-D5)

**위치**: `src/student/StudentPinSetupModal.tsx`

```tsx
interface StudentPinSetupModalProps {
  readonly boardShortCode: string;
  readonly onSetPin: (pin: string) => Promise<void>;  // useStudentPin.setPin 호출
  readonly onSkip: () => void;
  readonly mode: 'setup' | 'change';
}

export function StudentPinSetupModal({ boardShortCode, onSetPin, onSkip, mode }: StudentPinSetupModalProps) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [error, setError] = useState<string | null>(null);

  const handleNext = () => {
    if (!/^\d{4}$/.test(pin)) {
      setError('PIN은 4자리 숫자여야 해요.');
      return;
    }
    setStep('confirm');
    setError(null);
  };

  const handleConfirm = async () => {
    if (pin !== confirm) {
      setError('두 번 입력한 PIN이 달라요. 다시 입력해주세요.');
      return;
    }
    try {
      await onSetPin(pin);
    } catch (e) {
      setError('PIN 설정에 실패했어요.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="rounded-xl bg-sp-card border border-sp-border p-6 max-w-sm w-full">
        <h2 className="text-lg font-bold text-sp-text mb-2">
          {mode === 'setup' ? '학기 PIN 설정 (선택)' : 'PIN 변경'}
        </h2>
        <p className="text-sm text-sp-muted mb-4">
          4자리 PIN을 정해두면 다른 PC/탭에서도 같은 PIN으로 자기 카드를 관리할 수 있어요.
          <br/>PIN은 본인만 알아야 하며, 잊으면 복구할 수 없어요.
        </p>

        {step === 'enter' && (
          <>
            <input
              type="password"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="4자리 숫자"
              className="w-full rounded-lg border border-sp-border bg-sp-bg px-3 py-2 text-center text-2xl tracking-widest text-sp-text"
              autoFocus
            />
            {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={onSkip} className="flex-1 rounded-lg border border-sp-border px-3 py-2 text-sm text-sp-muted hover:bg-sp-card/80">
                건너뛰기 (익명 사용)
              </button>
              <button onClick={handleNext} className="flex-1 rounded-lg bg-sp-accent px-3 py-2 text-sm text-white hover:bg-sp-accent/90">
                다음
              </button>
            </div>
          </>
        )}

        {step === 'confirm' && (
          <>
            <p className="text-xs text-sp-muted mb-2">한 번 더 입력해주세요.</p>
            <input
              type="password"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="w-full rounded-lg border border-sp-border bg-sp-bg px-3 py-2 text-center text-2xl tracking-widest text-sp-text"
              autoFocus
            />
            {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setStep('enter'); setConfirm(''); setError(null); }} className="flex-1 rounded-lg border border-sp-border px-3 py-2 text-sm text-sp-muted hover:bg-sp-card/80">
                뒤로
              </button>
              <button onClick={handleConfirm} className="flex-1 rounded-lg bg-sp-accent px-3 py-2 text-sm text-white hover:bg-sp-accent/90">
                PIN 설정
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

**보안 (§9.8 추가)**: PIN 평문은 컴포넌트 내 useState에만 (메모리), `onSetPin` 콜백 내부에서 `hashStudentPin(pin, boardShortCode)` 호출 → SHA-256 hex만 외부 전달. PIN 평문은 어디에도 저장 X.

### 5.15 RealtimeWallCardImageGallery (v2.1 신규 — 다중 표시)

```tsx
interface RealtimeWallCardImageGalleryProps {
  readonly images: readonly string[];  // data URL 배열 (max 3)
}

export function RealtimeWallCardImageGallery({ images }: RealtimeWallCardImageGalleryProps) {
  if (images.length === 0) return null;

  // 1장: 단일 이미지
  if (images.length === 1) {
    return (
      <img
        src={images[0]}
        alt="첨부 이미지"
        loading="lazy"
        className="rounded-lg max-h-[240px] w-auto object-contain bg-sp-bg mt-2"
      />
    );
  }

  // 2~3장: grid carousel
  return (
    <div className="grid grid-cols-2 gap-2 mt-2">
      {images.map((dataUrl, idx) => (
        <img
          key={idx}
          src={dataUrl}
          alt={`첨부 이미지 ${idx + 1}/${images.length}`}
          loading="lazy"
          className={[
            'rounded-lg object-cover bg-sp-bg',
            images.length === 3 && idx === 0 ? 'col-span-2 max-h-[180px] w-full' : 'max-h-[120px] w-full',
          ].join(' ')}
        />
      ))}
    </div>
  );
}
```

**SVG 안전 (§9.2)**: SVG는 도메인 + Zod 스키마에서 모두 차단되므로 `<img>` 직접 렌더 안전 (HTML 실행 0).

### 5.16 StudentImageMultiPicker (v2.1 신규 — 다중 입력)

```tsx
interface StudentImageMultiPickerProps {
  readonly images: readonly string[];  // 현재 첨부된 이미지 (max 3)
  readonly onAdd: (dataUrl: string) => void;
  readonly onRemove: (index: number) => void;
  readonly maxImages?: number;  // default 3
  readonly maxTotalMB?: number; // default 5
}

export function StudentImageMultiPicker({
  images, onAdd, onRemove, maxImages = 3, maxTotalMB = 5,
}: StudentImageMultiPickerProps) {
  const { onDrop, onPaste, onFileSelect, isDragOver, error } = useStudentImageMultiUpload({
    currentImages: images,
    onAdd,
    maxImages,
    maxTotalMB,
  });

  const remaining = maxImages - images.length;

  return (
    <div>
      {/* 미리보기 그리드 */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-2">
          {images.map((dataUrl, idx) => (
            <div key={idx} className="relative">
              <img src={dataUrl} alt={`첨부 ${idx + 1}`} className="rounded-lg max-h-[80px] w-full object-cover" />
              <button
                type="button"
                onClick={() => onRemove(idx)}
                className="absolute top-1 right-1 rounded-full bg-black/60 text-white w-5 h-5 text-xs flex items-center justify-center hover:bg-rose-500"
                aria-label={`이미지 ${idx + 1} 제거`}
              >✕</button>
            </div>
          ))}
        </div>
      )}

      {/* drop zone (남은 슬롯이 있을 때만) */}
      {remaining > 0 && (
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onPaste={onPaste}
          tabIndex={0}
          className={[
            'rounded-lg border-2 border-dashed p-4 text-center transition-colors',
            isDragOver ? 'border-sky-400 bg-sky-400/10' : 'border-sp-border bg-sp-card/50',
          ].join(' ')}
        >
          <p className="text-sm text-sp-muted mb-2">
            이미지 끌어다 놓기 / Ctrl+V 붙여넣기 / 파일 선택 ({remaining}장 더 가능)
          </p>
          <label className="inline-block cursor-pointer rounded-lg bg-sp-accent px-4 py-2 text-sm text-white hover:bg-sp-accent/90">
            파일 선택
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              onChange={onFileSelect}
              className="hidden"
            />
          </label>
          <p className="text-xs text-sp-muted mt-2">최대 {maxImages}장 / 합계 {maxTotalMB}MB · PNG/JPG/GIF/WebP</p>
        </div>
      )}

      {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
    </div>
  );
}
```

### 5.8 StudentDraftChip (Phase A 신규)

```tsx
export function StudentDraftChip({ onResume, draft }: { onResume: () => void; draft: RealtimeWallDraft | null }) {
  if (!draft) return null;
  const preview = draft.text.slice(0, 20) || '(내용 없음)';
  return (
    <button
      onClick={onResume}
      className="fixed left-4 bottom-20 z-30 rounded-xl border border-sky-400/40 bg-sp-card px-3 py-2 text-sm text-sp-text shadow-sp-md hover:bg-sp-card/80"
    >
      ✏️ 작성 중인 카드: {preview}…
    </button>
  );
}
```

### 5.9 StudentSubmitForm 모달 — Phase B+A+D 통합 (수정 — v2.1 갱신)

기존 v1.14.x 단순 폼 → v2.1은 다음 신규 기능 통합:

```tsx
interface StudentSubmitFormPropsV2_1 {
  readonly mode: 'create' | 'edit';
  readonly initialPost?: RealtimeWallPost;  // mode='edit'일 때 prefill
  readonly maxTextLength: number;
  readonly studentFormLocked: boolean;
  readonly nicknameDefault: string;
  readonly boardShortCode: string;          // v2.1 — 드래프트 키 + PIN salt
  readonly currentSessionToken: string;     // v2.1 — 드래프트 키
  readonly onSubmit: (input: SubmitInputV2_1) => Promise<void>;  // submit 또는 submit-edit
  readonly onClose: () => void;
  readonly onMinimize: () => void;          // Phase A: 모달 최소화 → 칩
  readonly draft?: RealtimeWallDraft | null;  // Phase A: 드래프트 복원
  readonly onDraftChange: (draft: RealtimeWallDraft) => void;  // Phase A: 디바운스 자동저장 (500ms)

  // v2.1 신규 prop
  readonly onPipaConsentNeeded?: () => void;  // 첫 이미지 첨부 시 1회 호출
  readonly currentPinHash?: string;           // PIN 설정 학생만 (제출 메시지 첨부)
}

interface SubmitInputV2_1 {
  readonly nickname: string;
  readonly text: string;
  readonly linkUrl?: string;
  readonly images?: readonly string[];        // v2.1 — max 3
  readonly pdfUrl?: string;                   // v2.1
  readonly pdfFilename?: string;              // v2.1
  readonly color?: RealtimeWallCardColor;     // v2.1
}
```

**모달 레이아웃 — 모바일 풀스크린 (Phase B)**:
- `< 640px` 뷰포트: `fixed inset-0` 100% 화면 채움
- `>= 640px`: `max-w-lg mx-auto rounded-xl` 중앙 정렬 (v2.1: max-w-md → max-w-lg, 다중 이미지 미리보기 공간)
- 키보드 등장 시: 입력 영역이 가려지지 않도록 `vh` 단위 + `safe-area-inset-bottom` + `scrollIntoView({block:'nearest'})`

**v2.1 구성 요소 (위→아래 순)**:
1. 헤더: 제목 ("새 카드" 또는 "카드 수정") + 최소화 버튼 + 닫기 버튼
2. 닉네임 입력 (mode='edit'에서는 disabled — 닉네임 수정 불가)
3. **`StudentMarkdownToolbar`** (v2.1 신규 — B/I/List/Quote 4 버튼)
4. 본문 textarea + `useGraphemeCounter` IME-aware 카운터 (v2.1 — Intl.Segmenter)
5. 링크 URL 입력 + 디바운스 800ms OG 미리보기
6. **`StudentImageMultiPicker`** (v2.1 신규 — 최대 3장 + 합계 5MB)
7. **`StudentPdfPicker`** (v2.1 신규 — max 10MB)
8. **`StudentColorPicker`** (v2.1 신규 — 8색)
9. 푸터: 취소 / 게시하기 (또는 수정 완료) — 잠금 시 비활성

**v2.1 PIPA 동의 흐름 (Plan FR-B11)**:
- 첫 이미지 첨부 시점에 `localStorage.getItem('ssampin-pipa-consent-shown')` 확인
- 미존재 시 → `onPipaConsentNeeded()` 호출 → 부모가 `<StudentPipaConsentModal>` 표시
- 모달 확인 후 `localStorage.setItem('ssampin-pipa-consent-shown', '1')` → 학기 동안 재표시 X

---

## 6. 상태 관리 (Zustand) — useRealtimeWallSyncStore 확장 (v2.1 갱신)

### 6.1 신규 액션 (Phase B/A/D/C — v2.1 갱신)

**위치**: `src/adapters/stores/useRealtimeWallSyncStore.ts` (v1 스토어에 추가, 기존 액션 절대 수정 X)

```ts
interface RealtimeWallSyncStateV2_1 {
  // === v1 기존 (변경 없음) ===
  status: 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error';
  board: WallBoardSnapshot | null;
  currentSessionToken: string;          // v2.1: localStorage 영속
  retryCount: number;
  lastError?: string;
  connect(url: string): void;
  disconnect(): void;
  applyMessage(msg: ServerMessage): void;
  toggleLike(postId: string): void;
  addComment(postId: string, input: Omit<StudentCommentInput, 'sessionToken'>): void;

  // === v2.1 신규 ===

  // Phase B
  /** v2.1 — 댓글 v2 (이미지 1장 첨부 가능) */
  addCommentV2(postId: string, input: { nickname: string; text: string; images?: readonly string[] }): void;

  // Phase A
  /** 현재 활성 드래프트. boardShortCode + sessionToken 단위. */
  currentDraft: RealtimeWallDraft | null;
  saveDraft(draft: RealtimeWallDraft): void;  // localStorage write + state 갱신 (디바운스 500ms)
  loadDraft(boardShortCode: string, sessionToken: string): void;  // localStorage read
  clearDraft(boardShortCode: string, sessionToken: string): void; // localStorage delete

  /** v2.1 신규 — boardSettings 변경 (교사 권한, broadcast) */
  updateBoardSettings(settings: RealtimeWallBoardSettings): void;

  // Phase D — PIN
  /** v2.1 신규 — 현재 PIN hash (PIN 설정 학생만, undefined = 익명 모드) */
  currentPinHash: string | undefined;
  setPin(pin: string, boardShortCode: string): Promise<void>;  // hashStudentPin → submit-pin-set + localStorage 저장
  verifyPin(pin: string, boardShortCode: string): Promise<boolean>;  // hashStudentPin → submit-pin-verify
  clearPin(boardShortCode: string): void;  // localStorage 삭제 + state 초기화

  // Phase D — 자기 카드
  /** 자기 카드 수정 → submit-edit WebSocket send */
  submitOwnCardEdit(postId: string, patch: SubmitInputV2_1): void;

  /** 자기 카드 삭제 → submit-delete WebSocket send (v2.1: soft delete 의도). 응답 = post-updated status='hidden-by-author' */
  submitOwnCardDelete(postId: string): void;

  // Phase D — 교사 모더레이션
  /** v2.1 신규 — 교사 닉네임 변경 → update-nickname */
  updateNickname(postId: string, newNickname: string): void;

  /** v2.1 신규 — 교사 작성자 추적 (UI 강조 — broadcast 없음, 로컬 상태만) */
  trackedAuthorCriteria: { sessionToken?: string; pinHash?: string } | null;
  trackAuthor(postId: string): void;  // 카드 ID로 sessionToken/pinHash 조회 → 강조 활성
  clearAuthorTracking(): void;

  /** v2.1 신규 — 교사 placeholder 복원 (status='hidden-by-author' → 'approved') */
  restoreCard(postId: string): void;

  // Phase C
  /** 자기 카드 위치 변경 (Freeform 또는 Kanban) → submit-move WebSocket send */
  submitOwnCardMove(postId: string, position: { freeform?: RealtimeWallFreeformPosition; kanban?: RealtimeWallKanbanPosition }): void;
}
```

### 6.2 applyMessage 차분 patch 처리 (Phase B+A+D+C — v2.1 갱신)

v1의 `post-updated` 분기는 이미 `Partial<RealtimeWallPost>` 처리. v2.1은 변경 0 — 차분 patch가 자동으로 freeform/kanban/text/linkUrl/images/pdfUrl/color/edited/status 등에 적용됨.

**v2.1 신규 broadcast 처리**:
- `boardSettings-changed`: `set({ board: { ...board, settings: msg.settings } })`
- `nickname-changed`: 다중 postId에 대해 nickname 일괄 갱신
- `post-updated` (status='hidden-by-author' 포함): RealtimeWallCard가 placeholder로 자동 분기 (§5.4)

**낙관적 업데이트 + reconcile** (Plan FR-C7):

```ts
submitOwnCardMove: (postId, position) => {
  const { board, currentSessionToken, currentPinHash } = get();
  if (!board) return;

  // 1. 낙관적 업데이트 (UI 즉시 반영)
  const optimisticPosts = board.posts.map((p) =>
    p.id === postId
      ? { ...p, ...(position.freeform ? { freeform: position.freeform } : {}), ...(position.kanban ? { kanban: position.kanban } : {}) }
      : p,
  );
  set({ board: { ...board, posts: optimisticPosts } });

  // 2. WebSocket 송신 (v2.1 — pinHash 옵션 포함)
  socket.send(JSON.stringify({
    type: 'submit-move',
    sessionToken: currentSessionToken,
    pinHash: currentPinHash,  // v2.1
    postId,
    ...position,
  }));

  // 3. broadcast 도착 시 자동 reconcile (post-updated patch가 동일하면 noop, 다르면 서버 기준 적용)
}
```

**v2.1 soft delete 처리**:
```ts
submitOwnCardDelete: (postId) => {
  const { currentSessionToken, currentPinHash } = get();
  socket.send(JSON.stringify({
    type: 'submit-delete',
    sessionToken: currentSessionToken,
    pinHash: currentPinHash,
    postId,
  }));
  // 낙관적 업데이트 X (서버 응답 = post-updated patch: { status: 'hidden-by-author' } 도착 시 자연 placeholder 분기)
  // 반드시 hard delete 패턴 사용 X (회귀 위험 #8)
  // posts.filter(p => p.id !== postId) 절대 금지
}
```

**충돌 시나리오**:
- 학생 A가 자기 카드 freeform 드래그 (낙관적 업데이트) → 동시에 다른 학생 B의 좋아요 broadcast 도착 → likes만 patch (freeform 변경 없음, 충돌 영역 없음)
- 학생 A가 자기 카드 위치 변경 + 교사가 동시에 같은 카드 hidden → post-updated patch: { status: 'hidden' } 도착 → 학생 화면에서 카드 사라짐 (필터 by status 'approved' only)
- 학생 A가 자기 카드 삭제 → post-updated patch: { status: 'hidden-by-author' } 도착 → placeholder로 전환 + 좋아요/댓글 보존

### 6.3 useStudentReconnect 시퀀스 다이어그램 (v2.1 신규 — Phase A H-2 mitigation)

```
[학생 브라우저 — iOS Safari 사례]                  [WebSocket 서버]
         │
   ① 카드 작성 중                                       │
         │
   ② 백그라운드 진입 (홈 버튼 등)                        │
         │
   ③ iOS Safari WebSocket 연결 끊김 (~30초 후)  ─X─→  연결 close
         │
   ④ 학생이 다시 탭 진입 (visibilitychange='visible')   │
         │
   ⑤ useStudentReconnect 훅 트리거                      │
         │  - document.visibilityState === 'visible' 검사
         │  - socket.readyState 검사 (CLOSED 확인)
         │  - retryCount 0으로 리셋
         │
   ⑥ 1초 후 재연결 시도 (지수 백오프 1s → 2s → 4s → 8s, max 30s)
         │  - new WebSocket(url + sessionToken) ─────→  새 연결
         │
   ⑦ 'join' 메시지 자동 송신 ─────────────────→  세션 복원
         │
   ⑧ wall-state broadcast 수신 ←──────────────  최신 보드 상태
         │  - 카드 작성 모달 + 드래프트 그대로 보존 (Phase A 드래프트 + 메모리 보존)
         │  - "다시 연결되었어요" 1회 토스트
         │
   ⑨ 재연결 성공 → 학생 작업 재개 (드래프트 손실 0)
```

**핵심 원칙**:
- visibilitychange 이벤트 핸들러 등록 시점: `useStudentReconnect` 훅 마운트
- 재연결 시 sessionToken 재사용 (localStorage 영속) → 서버는 같은 세션으로 인지
- 드래프트는 localStorage에 자동 저장되어 있으므로 재연결 시 복원 (Phase A useStudentDraft)
- 첨부 이미지는 메모리에만 → 30초 백그라운드 후에는 메모리 살아있을 가능성 낮음 (모달 컴포넌트 unmount 시 손실)
- 백그라운드 30초+ 시나리오 통합 테스트 필수 (Plan §4.1 Phase A 완료 기준)

**시퀀스 코드 골격** (`useStudentReconnect.ts`):
```ts
export function useStudentReconnect(socketRef: React.MutableRefObject<WebSocket | null>, reconnect: () => void) {
  const retryCount = useRef(0);
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (socketRef.current?.readyState === WebSocket.OPEN) return;
      const delayMs = Math.min(1000 * Math.pow(2, retryCount.current), 30000);
      setTimeout(() => {
        retryCount.current += 1;
        reconnect();
      }, delayMs);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [socketRef, reconnect]);
}
```

### 6.3 currentSessionToken 일관성

v1에서 `currentSessionToken`은 `useRealtimeWallSyncStore`의 readonly 상태. v2에서도 유지. 단 BoardRouter가 이 값을 prop으로 받아 isOwnCard 분기에 사용:

```tsx
function StudentBoardView() {
  const { board, currentSessionToken, submitOwnCardMove, submitOwnCardEdit, submitOwnCardDelete } = useRealtimeWallSyncStore();

  return (
    <BoardRouter
      posts={board.posts}
      viewerRole="student"
      currentSessionToken={currentSessionToken}
      onOwnCardMove={submitOwnCardMove}
      onOwnCardEdit={(postId) => setEditingPostId(postId)}  // 모달 오픈
      onOwnCardDelete={(postId) => setDeletingPostId(postId)}  // 다이얼로그 오픈
    />
  );
}
```

### 6.4 LWW reconcile 단위 테스트 (§10.4)

- 학생 A 낙관적 freeform x=100 → 서버 patch x=100 도착 → noop (값 같음)
- 학생 A 낙관적 freeform x=100 → 서버 patch x=150 도착 → x=150로 reconcile (서버 기준)
- 학생 A submit-move 후 서버가 not-owner 응답 → 낙관적 업데이트 rollback (별도 메커니즘 필요 — v2는 단순화: error 메시지만 표시 + 다음 broadcast 도착 시 자연 reconcile)

---

## 7. IPC 채널 시그니처 (v2.1 갱신)

### 7.1 신규 IPC 채널 — 1개 (v2.1 신규)

**v2.1 핵심 결정 #7 — PDF 별도 IPC 채널** (Plan §7.2.2 결정 #7):

PDF는 base64로 broadcast 시 페이로드 폭증 위험 → **별도 Electron IPC 채널 우회**.

```ts
// electron/ipc/realtimeWallPdfUpload.ts (v2.1 신규)
import { ipcMain, app } from 'electron';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

const PDF_TEMP_DIR = join(app.getPath('temp'), 'ssampin-realtime-wall-pdf');
const MAX_PDF_BYTES = 10 * 1024 * 1024;  // 10MB
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D]);  // %PDF-

ipcMain.handle('realtime-wall:upload-pdf', async (_, { bytes, filename }: { bytes: Uint8Array; filename: string }) => {
  // 1. magic byte 검증
  if (bytes.length < 5 || !Buffer.from(bytes.slice(0, 5)).equals(PDF_MAGIC)) {
    throw new Error('PDF magic byte mismatch');
  }
  // 2. 크기 검증
  if (bytes.length > MAX_PDF_BYTES) {
    throw new Error(`PDF too large: ${bytes.length} > ${MAX_PDF_BYTES}`);
  }
  // 3. 안전한 파일명 (학생 입력 신뢰 X)
  const safeFilename = `${randomUUID()}-${filename.replace(/[^\w가-힣.-]/g, '_').slice(0, 100)}`;
  const fullPath = join(PDF_TEMP_DIR, safeFilename);

  // 4. 임시 디렉토리 생성 + 저장
  await mkdir(PDF_TEMP_DIR, { recursive: true });
  await writeFile(fullPath, bytes);

  // 5. file:// URL 반환 (학생/교사 모두 새 탭으로 열기)
  return { fileUrl: `file://${fullPath}`, filename: safeFilename };
});

// preload.ts
realtimeWall: {
  uploadPdf: (bytes: Uint8Array, filename: string) => ipcRenderer.invoke('realtime-wall:upload-pdf', { bytes, filename }),
  // ... 기존
}
```

**클라이언트 사용** (`useStudentPdfUpload.ts`):
```ts
const upload = async (file: File) => {
  const buffer = await file.arrayBuffer();
  const result = await window.api.realtimeWall.uploadPdf(new Uint8Array(buffer), file.name);
  // result = { fileUrl: 'file:///tmp/.../uuid-foo.pdf', filename: 'uuid-foo.pdf' }
  return { pdfUrl: result.fileUrl, pdfFilename: result.filename };
};
```

**보안 (§9.7 신규)**:
- magic byte `%PDF-` 검증 (svg/script/exe 거부)
- 파일명 sanitize (학생 입력 → 영숫자+한글+.+_-만)
- 임시 디렉토리만 사용 (사용자 데이터 디렉토리 격리)
- 학생 PC가 아닌 교사 PC(Main 프로세스)에 저장 — 학생은 file:// URL로 열기만
- (옵션) 보드 close 시 임시 디렉토리 정리 (`session.close` 시 unlink)

**신규 IPC 채널 1종 추가 (v2.1)** + 교사 화면 카운터 (`onStudentDeleted` 같은 broadcast)는 v1 broadcast 재활용으로 0종 추가.

### 7.2 기존 IPC 채널 (v1 그대로)

v1 Design §7.1 + §7.2의 모든 채널 유지. 신규 broadcast 필요 시 기존 `realtime-wall:broadcast` 채널 재활용.

---

## 8. 마이그레이션

### 8.1 v1.14.x → v1.15.x 데이터 호환 (v2.1 갱신)

| 필드 | v1.14.x | v1.15.x | 마이그레이션 |
|------|---------|---------|--------------|
| `images` (v2.1) | 없음 | optional `string[]` | undefined 유지 (이미지 미첨부) |
| `pdfUrl` / `pdfFilename` (v2.1) | 없음 | optional | undefined 유지 |
| `color` (v2.1) | 없음 | optional 8색 union | normalizer가 'white' default 주입 |
| `ownerSessionToken` | 없음 | optional | undefined 유지 (학생 권한 차단) |
| `studentPinHash` (v2.1) | 없음 | optional SHA-256 hex | undefined 유지 (PIN 미설정) |
| `edited` | 없음 | optional | normalizer가 `false` default 주입 |
| `status` union | `'pending'\|'approved'\|'hidden'` | + `'hidden-by-author'` (v2.1) | 기존 값 보존, v1.14.x는 새 값 unknown으로 무시 |
| `boardSettings` (v2.1) | 없음 | optional | normalizer가 `{ moderation: 'off' }` default 주입 |

**핵심**: v1.14.x로 작성된 카드는 ownerSessionToken/studentPinHash 둘 다 없으므로 학생 측에서 자기 카드로 식별되지 않음 → 위치 변경/수정/삭제 모두 차단. **데이터 손실 0, 기존 동작 0 회귀**.

### 8.2 Repository 정규화 적용 지점

**위치**: `src/adapters/repositories/JsonWallBoardRepository.ts`

```ts
import { normalizeBoardForPadletModeV2 } from '@domain/rules/realtimeWallRules';

async load(id: WallBoardId): Promise<WallBoard | null> {
  const raw = await this.storage.read(`wall-board-${id}.json`);
  if (!raw) return null;
  const board = JSON.parse(raw) as WallBoard;
  return normalizeBoardForPadletModeV2(board);  // v1 normalizer 호출 + v2 추가
}
```

Main 측 `electron/ipc/realtimeWallBoard.ts:75-84` `readBoardSync`에도 동일 적용.

### 8.3 schema version 정책

v1.13~v1.15 모두 schema version bump 없음. optional 필드 추가만이라 무손실 호환. **v1.16.x 이후 schema version 1→2 bump 별도 결정** (Plan §11.2 §11.4 계승).

### 8.4 다운그레이드 시나리오

- v1.15.x → v1.14.x 다운그레이드 시: v1.14.x 로더는 attachments/ownerSessionToken/edited 모름 → 무시. 데이터는 디스크에 잔존.
- 단 v1.14.x에서 카드 수정·저장 시 attachments 등 손실 가능 → release note 명시.

### 8.5 검증 체크리스트

- [ ] v1.14.x 보드 파일을 v1.15.x에서 로드 → 모든 post에 attachments=[], edited=false 주입 (ownerSessionToken은 undefined 유지)
- [ ] v1.14.x 카드는 학생 entry에서 자기 카드로 식별되지 않음 → 권한 차단 동작
- [ ] v1.15.x에서 학생이 새 카드 생성 → ownerSessionToken 자동 부여
- [ ] v1.15.x 새 카드를 v1.14.x로 다운그레이드 후 로드 → 텍스트/링크는 보임, 이미지/위치 변경 권한은 무시

---

## 9. 보안 설계

### 9.1 sessionToken 위협 모델 (v2 신규)

v1 §9.1 모든 위협 그대로 유지 + v2 추가:

| 공격 | 영향 | 방어 |
|------|------|------|
| 학생이 다른 학생의 ownerSessionToken 추측 → 위치 변경/수정/삭제 위조 | 권한 우회 | (1) ownerSessionToken은 `crypto.randomUUID()` 36자 임의값 — 추측 사실상 불가, (2) 서버에서 ws 세션 sessionToken과 매칭 검증 필수, (3) 클라이언트가 보낸 ownerSessionToken은 서버에서 신뢰 X (서버가 ws 세션 토큰 강제 주입) |
| 학생이 sessionStorage 토큰을 다른 학생에게 공유 → 협력자가 자기 카드처럼 수정 | 미세 (Padlet도 동일) | 본질적 트레이드오프 — sessionToken 공유는 이론상 가능하나 실용적 위협 낮음 (학생끼리 토큰 공유 동기 약함). Plan §6 Risks 인정 |
| WebSocket 직접 접속 (cloudflared 우회) → submit-move/edit/delete 위조 | 권한 우회 | v1 정책 그대로 — cloudflared 터널 URL 비공개 신뢰 |

### 9.2 이미지 페이로드 보안 (Phase B)

| 위협 | 방어 |
|------|------|
| SVG 업로드 → XSS (svg 태그 내 script) | (1) Zod 스키마 mimeType enum에서 SVG 명시 차단, (2) 도메인 `validateImageAttachment`가 magic byte 검증 (SVG는 magic byte 없음), (3) 렌더링은 `<img src="data:image/png;base64,...">`로만 (svg 태그 직접 렌더 절대 금지) |
| PNG로 위장한 SVG (mimeType=image/png + 실제 SVG 데이터) | 서버에서 magic byte 검증 (89 50 4E 47가 아니면 거부) |
| 5MB 초과 페이로드 → 메모리 폭증 | (1) 클라이언트 사전 차단 (`useStudentImageUpload`에서 file.size 체크), (2) 서버 Zod 스키마 max 5MB, (3) WebSocket 메시지 max 8MB (Node.js ws maxPayload 명시) |
| EXIF GPS 좌표 leak | 클라이언트 리사이즈 시 canvas 거치면 EXIF 자동 제거 (canvas → toDataURL은 EXIF 제거됨) |

**클라이언트 리사이즈 알고리즘** (`useStudentImageUpload`):
```ts
async function resizeImage(file: File): Promise<RealtimeWallImageAttachment> {
  const img = await loadImage(URL.createObjectURL(file));
  const maxDim = 1280;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.floor(img.width * scale);
  const h = Math.floor(img.height * scale);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  const dataUrl = await blobToDataUrl(blob);
  return {
    kind: 'image',
    dataUrl,
    width: w,
    height: h,
    mimeType: 'image/jpeg',
    sizeBytes: blob.size,
  };
}
```

**중요**: 리사이즈 시 항상 JPEG로 변환 (애니메이션 GIF 손실 — 정적 GIF는 첫 프레임만 보존, v2 한정 트레이드오프). 이는 알파 투명도 손실도 발생 → 향후 PNG 보존 옵션 고려 (v3+).

### 9.3 마크다운 XSS 방어 (Phase B)

| 위협 | 방어 |
|------|------|
| `<script>alert(1)</script>` 본문 입력 | react-markdown 기본 escape (모든 HTML 태그가 plain text) |
| `[link](javascript:alert(1))` markdown link | `allowedElements`에 'a' 미포함 → unwrapped 처리 (plain text "javascript:alert(1)") |
| `![alt](data:image/svg+xml;base64,...)` markdown image | `allowedElements`에 'img' 미포함 → unwrapped 처리 |
| HTML entity 우회 (`&lt;script&gt;`) | react-markdown은 HTML entity를 entity로 보존 (실행 안 됨) |
| markdown code block (` ```js eval(...) ``` `) | `allowedElements`에 'code'/'pre' 미포함 → unwrapped (plain text) |

**fuzz 테스트** (vitest):
- XSS payload 100종 입력 → 렌더 결과 DOM에 `<script>` 태그 0개
- DOMPurify 추가 검증 권장 — react-markdown은 자체 안전하지만 이중 방어 가치 있음. **단 번들 크기 +20KB는 부담** → v2는 react-markdown 단독 신뢰, v3+ DOMPurify 추가 검토

### 9.4 Rate Limit 신규 (Phase C/D)

v1 §9.3 기존 + v2 추가:

| 메시지 | Limit | 키 | 초과 시 |
|--------|-------|-----|---------|
| `submit-move` | 60/분 | sessionToken + IP | error + 무시 |
| `submit-edit` | 10/분 | sessionToken + IP | error + 무시 |
| `submit-delete` | 5/분 | sessionToken + IP | error + 무시 |

**`closeSession` 시 신규 3종 buckets clear** — 회귀 위험 5번 #5 동일 정책 적용.

### 9.5 페이로드 크기 상한 (v1 §9.4 + v2 추가)

| 항목 | 상한 | 근거 |
|------|------|------|
| 이미지 첨부 (raw) | 5MB | v2 정책 |
| 이미지 첨부 (base64 encoded) | ~6.7MB | base64 33% 오버헤드 |
| WebSocket 메시지 max | 8MB | Node.js ws maxPayload 명시 (기본 64KB → 8MB로 상향) |
| 카드당 attachments 개수 | 1 | v2 한정 (v3+ 다중 검토) |

### 9.6 검증 체크리스트 [v2 보안]

- [ ] PNG 위장 SVG 업로드 → magic byte 거부
- [ ] 6MB 이미지 → 클라이언트 차단 + 서버 Zod 거부
- [ ] markdown `<script>alert(1)</script>` → 렌더 결과 plain text
- [ ] markdown `[link](javascript:alert(1))` → unwrapped plain text
- [ ] 다른 학생의 카드 ID + 자기 sessionToken으로 submit-move → 서버 not-owner 응답
- [ ] sessionToken 위조 후 submit-edit → ws 세션 토큰과 mismatch → not-owner
- [ ] submit-move 분당 61회 → 61번째 error
- [ ] EXIF GPS 좌표 포함 사진 업로드 → 리사이즈 후 EXIF 제거 확인 (binary inspection)

### 9.7 PDF 페이로드 보안 (v2.1 신규 — Phase B)

| 위협 | 방어 |
|------|------|
| SVG/script/exe 위장 PDF (mime=application/pdf + 실제 다른 magic byte) | Main 프로세스가 magic byte `%PDF-` (25 50 44 46 2D) 검증. 실패 시 throw |
| 11MB+ PDF → 디스크 폭증 | (1) 클라이언트 사전 차단(file.size), (2) Main 프로세스 max 10MB 검증, (3) WebSocket 페이로드 X (별도 IPC) |
| 파일명 path traversal (`../../../etc/passwd`) | sanitize: `filename.replace(/[^\w가-힣.-]/g, '_').slice(0, 100)` + UUID prefix |
| 외부 URL injection (`http://evil.com/foo.pdf`) | Zod 스키마 `pdfUrl`은 `file://` prefix만 허용 |
| 임시 파일 누적 (디스크 fill) | (옵션) 보드 close 시 임시 디렉토리 cleanup. 또는 OS 임시 디렉토리 정리 정책 의존 |

### 9.8 PIN 보안 (v2.1 신규 — Phase D)

| 위협 | 방어 |
|------|------|
| **PIN 평문 서버 저장** (회귀 위험 #9) | 클라이언트 SHA-256 hash 후 hex string만 전송. ClientMessageSchema 내 `pin:` 평문 필드 grep 0 hit + Zod 검사. 도메인 `RealtimeWallPost.studentPinHash`만 hex 64자리 보관 |
| 4자리 PIN brute force (10000개 조합) | (1) `submit-pin-verify` rate limit 30/분 (5시간 소요), (2) boardShortCode salt로 rainbow table 무효화, (3) (v3+ 옵션) 5회 연속 실패 시 30분 lockout |
| 같은 PIN 다른 보드 hash 동일 | salt 패턴: `ssampin-realtime-wall:${boardShortCode}` → 다른 보드 = 다른 hash |
| 교사가 PIN 평문 봄 | 교사 화면에 hash만 노출. PIN reset 권한 X (PIPA 정합 — 교사는 hash만 봄) |
| PIN 분실 → 학생 권한 영구 소실 | (1) 학생 본인 책임 명시(D5 안내), (2) sessionToken 매칭이 살아있으면 동일 탭에서는 권한 유지(이중 매칭) |
| 학생 PIN 다른 학생에게 공유 → 사칭 | Padlet도 동일 트레이드오프. PIN 공유 동기 약함 + 학생 본인 책임 |

---

## 10. 테스트 전략

### 10.1 도메인 규칙 단위 테스트 (vitest)

**위치**: `src/domain/rules/__tests__/realtimeWallRules.v2.test.ts` (v1 테스트 파일은 그대로, v2 테스트는 신규 파일)

| 규칙 | 케이스 | Phase |
|------|--------|-------|
| `isOwnCard` | 6+ | C/D 공용 |
| `validateMove` | 7+ | C |
| `validateEdit` | 6+ | D |
| `validateDelete` | 5+ | D |
| `applyMove` | 5+ | C |
| `applyEdit` | 5+ | D |
| `applyDelete` | 5+ | D |
| `validateImageAttachment` | 8+ | B |
| `ensureOwnerSessionToken` | 3 (정상/post 자체에 ownerSessionToken 있어도 덮어쓰기/빈 토큰 거부) | C |
| `normalizePostForPadletModeV2` | 4 (attachments default / edited default / 기존 값 보존 / v1 normalize 호출 확인) | B/C/D |

신규 54+ 케이스. v1 308 + v2 = 362+ 테스트.

### 10.2 회귀 위험 5건 단위 테스트 (필수)

**위치**: `src/__tests__/regression-padlet-v1.test.ts` (회귀 보호 전용 파일)

```ts
describe('Regression: Padlet v1 must not break in v2', () => {
  // === #1: buildWallStateForStudents 필터 ===
  it('buildWallStateForStudents filters status === approved only', () => {
    const board: WallBoard = makeBoard([
      makePost({ status: 'approved' }),
      makePost({ status: 'pending' }),
      makePost({ status: 'hidden' }),
    ]);
    const snapshot = buildWallStateForStudents(board);
    expect(snapshot.posts).toHaveLength(1);
    expect(snapshot.posts[0].status).toBe('approved');
  });

  // === #2: parseServerMessage wall-state 분기 안정성 ===
  it('parseServerMessage handles malformed wall-state without crash', () => {
    expect(() => parseServerMessage({ type: 'wall-state', board: null })).not.toThrow();
    expect(() => parseServerMessage({ type: 'wall-state' })).not.toThrow();
    expect(() => parseServerMessage('garbage')).not.toThrow();
  });

  // === #3: RealtimeWallCard line 207-208 teacherActions/teacherDragHandle null ===
  it('RealtimeWallCard renders no teacher actions when viewerRole=student', () => {
    const { container } = render(
      <RealtimeWallCard
        post={makePost()}
        viewerRole="student"
        actions={<div data-testid="teacher-actions" />}
        dragHandle={<div data-testid="teacher-drag" />}
      />,
    );
    expect(container.querySelector('[data-testid="teacher-actions"]')).toBeNull();
    expect(container.querySelector('[data-testid="teacher-drag"]')).toBeNull();
  });

  // === #4: StudentSubmitForm isSubmitting useEffect edge transition ===
  it('StudentSubmitForm closes modal only on isSubmitting false→true→false', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<StudentSubmitForm isSubmitting={false} onClose={onClose} {...} />);
    expect(onClose).not.toHaveBeenCalled();
    rerender(<StudentSubmitForm isSubmitting={true} onClose={onClose} {...} />);
    expect(onClose).not.toHaveBeenCalled();
    rerender(<StudentSubmitForm isSubmitting={false} onClose={onClose} {...} />);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // === #5: closeSession rateLimitBuckets.clear ===
  it('closeSession clears all rate limit buckets including v2 (move/edit/delete)', async () => {
    const session = await startSession({ ... });
    await session.handleMessage({ type: 'submit-move', sessionToken: 't1', postId: 'p1', freeform: {...} });
    expect(session.rateLimitBuckets.size).toBeGreaterThan(0);
    await session.close();
    expect(session.rateLimitBuckets.size).toBe(0);
  });
});
```

### 10.3 WebSocket 통합 테스트 (Phase별)

**위치**: `electron/ipc/__tests__/realtimeWall.v2.integration.test.ts`

#### Phase A 시나리오 (드래프트 + 단축키)
- 시나리오 A1: 학생 텍스트 입력 → 모달 닫기 → localStorage에 드래프트 저장 → 재접속 → 모달 열기 → prefill 확인
- 시나리오 A2: 'C' 키 눌러서 모달 열림. textarea 포커스 시 'C' 입력 시 모달 추가 안 열림. IME composition 활성 시 무동작

#### Phase B 시나리오 (이미지 + 마크다운)
- 시나리오 B1: 학생이 1MB PNG 첨부 → submit → 다른 학생 화면에 이미지 표시
- 시나리오 B2: 6MB PNG 첨부 시도 → 클라이언트 차단 + UI 에러
- 시나리오 B3: SVG 첨부 시도 → 거부
- 시나리오 B4: PNG 위장 SVG (mimeType=image/png + 실제 SVG 데이터) → 서버 magic byte 거부
- 시나리오 B5: 본문에 `**굵게**` 입력 → 다른 학생 화면에 `<strong>` 렌더
- 시나리오 B6: 본문에 `<script>alert(1)</script>` → 렌더 결과 plain text + console에 에러 0

#### Phase C 시나리오 (위치 변경)
- 시나리오 C1: 학생 A가 자기 카드 freeform 드래그 → 모든 클라이언트 post-updated 수신 → freeform 좌표 갱신 (latency < 200ms)
- 시나리오 C2: 학생 A가 학생 B의 카드 드래그 시도 → 클라이언트에서 차단 (Rnd 미마운트)
- 시나리오 C3: 학생 A가 위조된 sessionToken으로 학생 B 카드 submit-move → 서버 not-owner 응답
- 시나리오 C4: Kanban 자기 카드 컬럼 이동 → 모든 클라이언트 동기화
- 시나리오 C5: 분당 61 submit-move → 61번째 error
- 시나리오 C6: Grid 보드에서 학생이 위치 변경 시도 → DnD 컴포넌트 미마운트 (회귀 0)
- 시나리오 C7: Stream 보드에서 학생이 위치 변경 시도 → 동일

#### Phase D 시나리오 (수정/삭제)
- 시나리오 D1: 학생이 자기 카드 hover → 수정/삭제 메뉴 표시
- 시나리오 D2: 학생이 다른 학생 카드 hover → 메뉴 미표시 (DOM 없음)
- 시나리오 D3: 학생 A가 자기 카드 수정 → submit-edit → 모든 클라이언트 post-updated 수신 → text 갱신 + edited=true
- 시나리오 D4: 학생 A가 자기 카드 삭제 → 한국어 다이얼로그 → 확인 → submit-delete → 모든 클라이언트 post-removed 수신
- 시나리오 D5: 학생 A가 학생 B 카드 ID로 submit-edit (위조) → 서버 not-owner 응답
- 시나리오 D6: 분당 11 submit-edit → 11번째 error
- 시나리오 D7: 분당 6 submit-delete → 6번째 error
- 시나리오 D8: 학생 A가 자기 카드 삭제 → 교사 화면 카운터 +1 (`session.studentDeletedCount`)

### 10.4 LWW reconcile 테스트 (Phase C)

```ts
describe('LWW reconcile', () => {
  it('낙관적 업데이트 후 서버 patch가 같으면 noop', () => { ... });
  it('낙관적 업데이트 후 서버 patch가 다르면 서버 기준', () => { ... });
  it('학생 위치 변경 + 교사 hidden 동시 → post-removed가 이김', () => { ... });
});
```

### 10.5 부하 테스트 150명 (v2.1 갱신 — Plan NFR + Phase B/C 완료 기준 — 페3 high-5)

`scripts/load-test-realtime-wall-v2-1.mjs` (v1 부하 스크립트 확장):

**Phase B 부하 시나리오** (이미지 다중 broadcast):
- **150 동시 ws 클라이언트** (6학급 × 25명) join
- 30명이 동시 카드 제출 (각 1MB 이미지 1장 + 텍스트 + 색상)
- 모든 클라이언트에 post-added broadcast 도달 latency < 200ms 측정
- 5분간 평균 latency 유지
- Node 메모리 1.5GB 이하 (이미지 base64 페이로드 영향)

**Phase C 부하 시나리오** (위치 변경 broadcast):
- 150 동시 ws 클라이언트
- 30명이 freeform 드래그 (1초마다 1 submit-move = 분당 30 메시지/사용자)
- 모든 클라이언트에 post-updated broadcast latency < 200ms
- 5분간 평균 유지

**클라이언트 spawner 코드 골격** (`scripts/load-test-realtime-wall-v2-1.mjs`):
```js
import { WebSocket } from 'ws';

const NUM_CLIENTS = 150;
const TUNNEL_URL = process.env.TUNNEL_URL;

const clients = [];
for (let i = 0; i < NUM_CLIENTS; i++) {
  const sessionToken = `load-test-${i}-${Date.now()}`;
  const ws = new WebSocket(`${TUNNEL_URL}/ws?token=${sessionToken}`);
  ws.on('open', () => ws.send(JSON.stringify({ type: 'join', sessionToken })));
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'post-added' && msg.sentAt) {
      const latency = Date.now() - msg.sentAt;
      latencies.push(latency);
    }
  });
  clients.push(ws);
}

// 5분 후 통계 출력
setTimeout(() => {
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p95 = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];
  console.log(`Avg: ${avg.toFixed(0)}ms, p95: ${p95}ms, samples: ${latencies.length}`);
  // 어서션: avg < 200, p95 < 500
}, 5 * 60 * 1000);
```

### 10.6.1 첫 join → 화면 1초 측정 (v2.1 신규 — Phase A 완료 기준)

**Plan NFR (페4 M-11)**: 학생이 join 화면에서 닉네임 입력 후 carousel 화면이 표시되기까지 1초 이내.

측정 방법:
1. 학생 entry index.html을 캐시 비활성화 모드로 로드
2. 닉네임 입력 + 제출 클릭 → `performance.now()` 시작
3. `wall-state` broadcast 수신 + 첫 카드 DOM render 완료 → `performance.now()` 종료
4. 차이 < 1000ms 어서션

bundle preload 전략 (1초 달성용):
- `index.html` `<head>`에 `<link rel="modulepreload" href="/assets/student-main-*.js">`
- WebSocket URL DNS prefetch: `<link rel="dns-prefetch" href="//{tunnel}.trycloudflare.com">`
- React + react-markdown은 학생 번들에 inline (지연 로딩 X)

### 10.6.2 iOS Safari 실기기 매뉴얼 QA (v2.1 신규 — Phase A H-2 mitigation)

**시나리오 IS-1 (백그라운드 30초 후 재연결)**:
1. iPhone Safari로 학생 entry 접속
2. 닉네임 입력 후 카드 작성 모달 열기
3. 텍스트 일부 입력
4. 홈 버튼 → 30초 후 다시 Safari 진입
5. 검증:
   - 모달 + 텍스트 보존 (드래프트 localStorage 복원)
   - "다시 연결되었어요" 토스트 1회 표시
   - WebSocket 자동 재연결 + 새 카드 입력 가능

**시나리오 IS-2 (백그라운드 5분 후)**:
1. 동일하게 진입 후 5분 백그라운드
2. 검증:
   - 재연결 시도 (지수 백오프 max 30s 내)
   - 실패 시 "다시 시도" 버튼 표시 (Plan §6 H-2)

**시나리오 IS-3 (PWA Add to Home Screen)**:
1. iOS Safari "홈 화면에 추가"로 PWA 설치 시도
2. 검증: 설치 가능 + 카드 열기 정상 동작 (Plan v3+ §11.1.6 후속이지만 기본 동작 확인)

**시나리오 IS-4 (모바일 키보드 등장 시 입력 가려짐)**:
1. iPhone Safari로 카드 작성 모달 열기
2. 본문 textarea 포커스 → 키보드 등장
3. 검증:
   - 입력 영역이 키보드에 가려지지 않음 (safe-area-inset-bottom)
   - 활성 input scrollIntoView 동작
   - 모달 푸터(게시 버튼) 접근 가능

### 10.6 회귀 위험 9건 grep 어서션 (CI — v2.1 갱신: 5건 → 9건)

**위치**: `scripts/regression-grep-check.mjs` (신규)

```js
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// === 존재 검사 (필수 패턴이 존재해야 함) ===
const presenceChecks = [
  {
    file: 'electron/ipc/realtimeWall.ts',
    pattern: /posts\.filter\(\s*p\s*=>\s*p\.status\s*===\s*['"]approved['"]\s*\)/,
    name: 'REGRESSION #1: buildWallStateForStudents approved filter',
  },
  {
    file: 'src/adapters/components/Tools/RealtimeWall/RealtimeWallCard.tsx',
    pattern: /teacherActions\s*=\s*viewerRole\s*===\s*['"]teacher['"]\s*\?\s*actions\s*:\s*null/,
    name: 'REGRESSION #3a: RealtimeWallCard teacherActions null',
  },
  {
    file: 'src/adapters/components/Tools/RealtimeWall/RealtimeWallCard.tsx',
    pattern: /teacherDragHandle\s*=\s*viewerRole\s*===\s*['"]teacher['"]\s*\?\s*dragHandle\s*:\s*null/,
    name: 'REGRESSION #3b: RealtimeWallCard teacherDragHandle null',
  },
  {
    file: 'electron/ipc/realtimeWall.ts',
    pattern: /rateLimitBuckets\.clear\(\)/,
    name: 'REGRESSION #5: closeSession rateLimitBuckets.clear',
  },
];

// === 부재 검사 (특정 패턴이 절대 존재하면 안 됨) — v2.1 신규 4건 ===
const absenceChecks = [
  {
    // 회귀 #6 — `C` 단축키 코드 부재 (학생 entry 한정)
    glob: 'src/student/**/*.{ts,tsx}',
    pattern: /addEventListener\(\s*['"]keydown['"][\s\S]{0,200}['"]c['"]/i,
    name: 'REGRESSION #6: `C` keyboard shortcut must NOT exist (학생 entry)',
    altPattern: /event\.key\s*===\s*['"]c['"]/i,
  },
  {
    // 회귀 #7 — dangerouslySetInnerHTML 부재 (학생 entry + RealtimeWall 컴포넌트)
    glob: ['src/student/**/*.{ts,tsx}', 'src/adapters/components/Tools/RealtimeWall/**/*.{ts,tsx}'],
    pattern: /dangerouslySetInnerHTML/,
    name: 'REGRESSION #7: dangerouslySetInnerHTML must NOT exist',
  },
  {
    // 회귀 #8 — hard delete 패턴 부재 (electron/ipc + adapters/stores)
    glob: ['electron/ipc/**/*.ts', 'src/adapters/stores/**/*.ts', 'src/domain/rules/**/*.ts'],
    pattern: /posts\.filter\(\s*\w+\s*=>\s*\w+\.id\s*!==\s*\w+\s*\)/,
    name: 'REGRESSION #8: hard delete pattern must NOT exist (use soft delete)',
  },
  {
    // 회귀 #9 — PIN 평문 필드 부재 (Zod 스키마)
    glob: ['src/domain/rules/realtimeWallMessages.ts', 'electron/ipc/realtimeWall.ts'],
    pattern: /(submit-pin-(set|verify)[\s\S]{0,300}?\bpin\s*:\s*z\.(string|number)(?!\.regex))/,
    name: 'REGRESSION #9: PIN plaintext field must NOT exist in Zod schema',
  },
];

let failed = 0;

// 존재 검사
for (const c of presenceChecks) {
  try {
    const content = readFileSync(c.file, 'utf-8');
    if (!c.pattern.test(content)) {
      console.error(`❌ ${c.name} not found in ${c.file}`);
      failed++;
    } else {
      console.log(`✅ ${c.name}`);
    }
  } catch (e) {
    console.error(`❌ ${c.name} — file read error: ${e.message}`);
    failed++;
  }
}

// 부재 검사 — glob 순회
function walkGlob(globs) {
  const list = Array.isArray(globs) ? globs : [globs];
  // ... glob 라이브러리로 파일 수집 (간단 구현 생략)
  return [];
}

for (const c of absenceChecks) {
  const files = walkGlob(c.glob);
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    if (c.pattern.test(content) || (c.altPattern && c.altPattern.test(content))) {
      console.error(`❌ ${c.name} — found in ${file}`);
      failed++;
    }
  }
}

// 회귀 #2 (parseServerMessage no-crash) + #4 (StudentSubmitForm prevSubmittingRef)는
// 단위 테스트 (§10.2)로 검증 — grep 패턴은 보조

if (failed > 0) {
  console.error(`\n${failed} regression check(s) failed.`);
  process.exit(1);
}
console.log('\nAll 9 regression checks passed.');
process.exit(0);
```

`package.json`의 `test` 스크립트에 추가: `npm run test && node scripts/regression-grep-check.mjs`

**v2.1 검증 9건 매트릭스**:

| # | 종류 | 위치 | 검증 방법 |
|---|------|------|----------|
| 1 | 존재 | `electron/ipc/realtimeWall.ts` | grep + unit test |
| 2 | unit test | `src/student/parseServerMessage` | malformed input no-crash test |
| 3a/b | 존재 | `RealtimeWallCard.tsx` line 207-208 | grep + DOM test |
| 4 | unit test | `StudentSubmitForm` `prevSubmittingRef` | edge transition test |
| 5 | 존재 | `closeSession` `rateLimitBuckets.clear()` | grep + integration test |
| **6** | **부재** | 학생 entry 전체 | **`C` 단축키 grep 0 hit** |
| **7** | **부재** | src/student + RealtimeWall 컴포넌트 | **`dangerouslySetInnerHTML` grep 0 hit** |
| **8** | **부재** | electron/ipc + adapters/stores + domain/rules | **hard delete 패턴 grep 0 hit** |
| **9** | **부재** | Zod 스키마 | **PIN 평문 필드 grep 0 hit** |

### 10.7 수동 QA 체크리스트

- 한국어 IME 자모 분리 검증: textarea에 "ㅊ" 입력 중 'C' 단축키 → 모달 안 열려야 함
- 모바일 키보드 등장 시 textarea 가려지지 않음 확인 (iOS Safari + Android Chrome)
- 이미지 첨부 후 모달 최소화 → 이미지 손실 + UI 안내 메시지 ("이미지는 다시 올려주세요") 표시 확인
- 자기 카드 sky 테두리 + 다른 학생 카드 기본 테두리 시각 차이 명확
- 학생 자기 카드 freeform 드래그 → 다른 학생 화면에 즉시 반영

---

## 11. 통합 파일 변경 목록 (v2.1 — Phase B에 신규 파일 대폭 증가)

### 11.1 신규 파일 (v2.1 갱신)

| 경로 | Phase | 설명 |
|------|-------|------|
| **Phase B (1순위)** | | |
| `src/domain/entities/RealtimeWallBoardSettings.ts` | A | (Phase A에서 활용하지만 Phase B 도메인 변경과 함께 일괄 도입) |
| `src/student/StudentMarkdownToolbar.tsx` | B | v2.1 — Bold/Italic/List/Quote 4 버튼 툴바 |
| `src/student/StudentColorPicker.tsx` | B | v2.1 — 8색 horizontal scroll 픽커 |
| `src/student/StudentImageMultiPicker.tsx` | B | v2.1 — 최대 3장 + 합계 5MB drop/paste/picker |
| `src/student/StudentPdfPicker.tsx` | B | v2.1 — PDF 1개 + 파일명 + 크기 |
| `src/student/StudentPipaConsentModal.tsx` | B | v2.1 — 친구 사진 동의 1회 안내 |
| `src/student/StudentCommentForm.tsx` | B | v2.1 — 댓글 정교화 폼 (이미지 1장/Bold·Italic/풀스크린) |
| `src/student/useStudentImageMultiUpload.ts` | B | v2.1 — drop/paste/picker + canvas 리사이즈 + 다중 검증 |
| `src/student/useStudentPdfUpload.ts` | B | v2.1 — IPC `realtime-wall:upload-pdf` 호출 + magic byte 검증 |
| `src/student/useGraphemeCounter.ts` | B | v2.1 — Intl.Segmenter IME-aware 카운터 |
| `src/adapters/components/Tools/RealtimeWall/RealtimeWallCardImageGallery.tsx` | B | v2.1 — 이미지 다중 표시 carousel |
| `src/adapters/components/Tools/RealtimeWall/RealtimeWallCardPdfBadge.tsx` | B | v2.1 — PDF 아이콘 + 파일명 + 새 탭 열기 |
| `src/adapters/components/Tools/RealtimeWall/RealtimeWallCardMarkdown.tsx` | B | react-markdown wrapper (allowedElements 화이트리스트) |
| `src/adapters/components/Tools/RealtimeWall/RealtimeWallCardColors.ts` | B | v2.1 — 8색 → Tailwind 클래스 매핑 상수 |
| `src/usecases/realtimeWall/ValidateImages.ts` | B | v2.1 — 이미지 다중 검증 use case |
| `src/usecases/realtimeWall/ValidatePdf.ts` | B | v2.1 — PDF 검증 use case |
| `electron/ipc/realtimeWallPdfUpload.ts` | B | v2.1 — PDF 별도 IPC 채널 |
| **Phase A (2순위)** | | |
| `src/domain/entities/RealtimeWallDraft.ts` | A | 드래프트 엔티티 (v2.1 — color 추가, sessionToken 키 분리) |
| `src/student/StudentDraftChip.tsx` | A | 좌하단 칩 |
| `src/student/useStudentDraft.ts` | A | localStorage 드래프트 훅 (보드+세션 단위 키) |
| `src/student/useStudentLongPress.ts` | A | v2.1 — 모바일 600ms touchhold 진입 훅 |
| `src/student/useStudentDoubleClick.ts` | A | v2.1 — 데스크톱 더블클릭 진입 훅 (data-empty-area 한정) |
| `src/student/useStudentReconnect.ts` | A | v2.1 — visibilitychange + 지수 백오프 재연결 (iOS Safari mitigation) |
| `src/adapters/components/Tools/RealtimeWall/RealtimeWallBoardSettingsPanel.tsx` | A | v2.1 — moderation 'off'\|'manual' 토글 |
| **Phase D (3순위)** | | |
| `src/student/StudentDeleteConfirmDialog.tsx` | D | 한국어 확인 다이얼로그 |
| `src/student/StudentPinSetupModal.tsx` | D | v2.1 — 4자리 PIN 입력/변경 |
| `src/student/StudentNicknameChangedToast.tsx` | D | v2.1 — 교사 닉네임 변경 broadcast 1회 토스트 |
| `src/student/useStudentPin.ts` | D | v2.1 — PIN 입력 → SHA-256 hash → localStorage |
| `src/usecases/realtimeWall/HashStudentPin.ts` | D | v2.1 — SHA-256 클라이언트 헬퍼 |
| `src/usecases/realtimeWall/HandleStudentEdit.ts` | D | 수정 use case |
| `src/usecases/realtimeWall/HandleStudentDelete.ts` | D | v2.1 — soft delete use case (status 갱신만) |
| `src/usecases/realtimeWall/TeacherTrackAuthor.ts` | D | v2.1 — sessionToken/PIN hash 기준 같은 작성자 카드 조회 |
| `src/usecases/realtimeWall/TeacherUpdateNickname.ts` | D | v2.1 — 교사 닉네임 변경/일괄 숨김 |
| `src/adapters/components/Tools/RealtimeWall/RealtimeWallCardOwnerActions.tsx` | D | 학생 자기 카드 액션 |
| `src/adapters/components/Tools/RealtimeWall/RealtimeWallCardPlaceholder.tsx` | D | v2.1 — "작성자가 삭제했어요" placeholder |
| `src/adapters/components/Tools/RealtimeWall/RealtimeWallTeacherContextMenu.tsx` | D | v2.1 — 우클릭 메뉴 (작성자 추적 / 닉네임 변경 / 일괄 숨김) |
| `src/adapters/components/Tools/RealtimeWall/RealtimeWallTeacherStudentTrackerPanel.tsx` | D | v2.1 — 같은 작성자 카드 강조 |
| **Phase C (4순위)** | | |
| `src/usecases/realtimeWall/HandleStudentMove.ts` | C | 위치 변경 use case |
| `src/student/useIsMobile.ts` | C | v2.1 — viewport <768px 검출 (Freeform readOnly 강제) |
| `src/adapters/components/Tools/RealtimeWall/RealtimeWallFreeformLockToggle.tsx` | C | v2.1 — Freeform 자기 카드 "✏️ 위치 바꾸기" 토글 |
| **테스트 / 인프라** | | |
| `src/domain/rules/__tests__/realtimeWallRules.v2.test.ts` | B~C | 도메인 v2.1 테스트 |
| `src/__tests__/regression-padlet-v1.test.ts` | B | 회귀 위험 9건 단위 테스트 (v2.1 — 5건 → 9건) |
| `electron/ipc/__tests__/realtimeWall.v2.integration.test.ts` | B~C | WebSocket v2.1 통합 테스트 |
| `scripts/regression-grep-check.mjs` | B | v2.1 — CI grep 어서션 9건 |
| `scripts/load-test-realtime-wall-v2-1.mjs` | B+C | v2.1 — 150명 부하 테스트 |

### 11.2 수정 파일 (v2.1 갱신)

| 경로 | Phase | 변경 |
|------|-------|------|
| `src/domain/entities/RealtimeWall.ts` | B (선언) + D/C (활용) | v2.1 — `images?: string[]` / `pdfUrl?` / `pdfFilename?` / `color?` / `ownerSessionToken?` / `studentPinHash?` / `edited?` 필드 추가, status union에 `'hidden-by-author'` 추가, RealtimeWallCardColor union 추가 |
| `src/domain/entities/WallBoard.ts` (또는 동등) | A | v2.1 — `settings?: RealtimeWallBoardSettings` 추가 |
| `src/domain/rules/realtimeWallRules.ts` | B~C | v2.1 — isOwnCard (양방향) / validateMove / validateEdit / validateDelete (sessionToken/PIN 매칭) / applyMove / applyEdit / **applyDelete (soft delete only)** / applyRestore (교사 복원) / validateImageDataUrl / validateImages (다중) / validatePdf / validateBoardSettings / ensureOwnerCredentials / normalizePostForPadletModeV2 추가 |
| `src/student/StudentRealtimeWallApp.tsx` | A+D | v2.1 — long-press/더블클릭 진입 wiring / 드래프트 복원 / 안내 텍스트 (PIN 옵션 통합) / iOS Safari 재연결 (useStudentReconnect) |
| `src/student/StudentJoinScreen.tsx` | D | v2.1 — sessionStorage → localStorage 영속 |
| `src/student/StudentBoardView.tsx` | A+D | v2.1 — FAB 잠금 강화, 드래프트 칩, 자기 카드 hover-action, moderation OFF 시 즉시 공개 안내 1회 |
| `src/student/StudentSubmitForm.tsx` | B+A+D | v2.1 — 이미지 다중 / PDF / 색상 / OG 미리보기 / Bold/Italic 툴바 / 모바일 풀스크린 / Intl.Segmenter 카운터 / mode='edit' / 모달 minimize / PIPA 동의 wiring |
| `src/student/useStudentWebSocket.ts` | B+D+C | v2.1 — submit-comment-v2 / submit-move / submit-edit / submit-delete / submit-pin-set / submit-pin-verify / update-nickname 메서드 추가 |
| `src/adapters/stores/useRealtimeWallSyncStore.ts` | B+A+D+C | v2.1 — addCommentV2 / saveDraft·loadDraft·clearDraft / setPin·verifyPin·clearPin / submitOwnCardMove·Edit·Delete / updateBoardSettings / updateNickname / trackAuthor / restoreCard 액션 + applyMessage 신규 broadcast 처리 |
| `src/adapters/components/Tools/RealtimeWall/RealtimeWallCard.tsx` | B+D | v2.1 — 마크다운 렌더(allowedElements 7종), 이미지 다중 표시, PDF 아이콘, 색상 배경, placeholder 분기 (status='hidden-by-author'), 자기 카드 sky 테두리, OwnerActions wiring (line 207-208 절대 보존) |
| `src/adapters/components/Tools/RealtimeWall/RealtimeWallFreeformBoard.tsx` | C | v2.1 — 학생 자기 카드 Rnd per-card 동적 활성화 + 모바일 viewport readOnly 강제 + 자기 카드 기본 locked + "✏️ 위치 바꾸기" 토글 |
| `src/adapters/components/Tools/RealtimeWall/RealtimeWallKanbanBoard.tsx` | C | 학생 자기 카드 dnd-kit useSortable disabled 동적 |
| `src/adapters/components/Tools/RealtimeWall/types.ts` | A+D+C | v2.1 — currentPinHash / isMobile / boardSettings / onOwnCardMove·Edit·Delete / onTeacherTrackAuthor·UpdateNickname·BulkHideStudent·RestoreCard / onEmptyAreaCreate prop 추가 |
| `src/adapters/components/Tools/RealtimeWall/Settings/BoardCreateModal.tsx` | A | v2.1 — moderation 프리셋 토글 추가 |
| `src/adapters/repositories/JsonWallBoardRepository.ts` | B | normalizeBoardForPadletModeV2 호출 |
| `electron/ipc/realtimeWall.ts` | B+A+D+C | v2.1 — Zod 스키마 v2.1 + submit-move/edit/delete/comment-v2/pin-set/pin-verify/update-nickname 핸들러 + 이미지 다중 magic byte 검증 + 색상 검증 + rate limit 5종 신규 + closeSession buckets clear (v2.1 — 9종) + soft delete 적용 (절대 hard delete X) + boardSettings broadcast |
| `electron/ipc/realtimeWallBoard.ts` | B | normalizeBoardForPadletModeV2 호출 |
| `electron/preload.ts` | B+D | v2.1 — uploadPdf / onStudentDeleted / onBoardSettingsChanged / onNicknameChanged 노출 |
| `src/global.d.ts` | B~C | v2.1 IPC 시그니처 + 메시지 타입 |
| `package.json` | B | `react-markdown@9` dependency 추가, `test` 스크립트에 grep-check 추가 |
| `vite.student.config.ts` | B | react-markdown 번들 분석 옵션 |

### 11.3 변경 절대 금지 (회귀 위험 9건 격리 — v2.1 갱신)

| 경로 | 이유 |
|------|------|
| `electron/ipc/realtimeWall.ts` `buildWallStateForStudents` `posts.filter(p => p.status === 'approved')` 라인 | 회귀 위험 #1 — 변경 시 학생에게 pending/hidden 노출 |
| `src/adapters/components/Tools/RealtimeWall/RealtimeWallCard.tsx` line 207-208 | 회귀 위험 #3 — 변경 시 학생 화면에 교사 액션 노출 (가장 중대) |
| `src/student/StudentSubmitForm.tsx` `prevSubmittingRef` useEffect | 회귀 위험 #4 — Phase D 모달 재사용 시 특히 주의 |
| **`src/student/**/*.{ts,tsx}` 전체 — `addEventListener('keydown', ... 'c')` 패턴 부재** | **회귀 위험 #6 (v2.1)** — `C` 단축키 부활 시 한글 IME 자모분리 충돌 (페3 critical-3) |
| **`src/student/**` + `src/adapters/components/Tools/RealtimeWall/**` — `dangerouslySetInnerHTML` 패턴 부재** | **회귀 위험 #7 (v2.1)** — XSS 위험 (반드시 react-markdown allowedElements 화이트리스트만 사용) |
| **`electron/ipc/**` + `src/adapters/stores/**` + `src/domain/rules/**` — `posts.filter(p => p.id !== \w+)` 패턴 부재** | **회귀 위험 #8 (v2.1)** — hard delete 패턴 (반드시 status='hidden-by-author' soft delete만) |
| **Zod 스키마 (`src/domain/rules/realtimeWallMessages.ts`, `electron/ipc/realtimeWall.ts`) — `pin:` 평문 필드 부재** | **회귀 위험 #9 (v2.1)** — PIN 평문 서버 저장 (반드시 클라이언트 SHA-256 hash → `pinHash` 필드만) |

이 라인들을 v2.1에서 수정해야 한다면 별도 PR + 별도 Plan 작성 필수.

---

## 12. Open Questions (v2.1 — 잔여 5건 + v2.1 신규 3건)

본 v2.1 Design은 Plan §7.2 결정 9건 모두 본문에서 확정했으나, 다음 5건(v2 잔여) + 3건(v2.1 신규)은 디자인 QA 단계에서 검토 권장 (잠정 결정 + 근거 제시).

| # | 질문 | 본 Design 잠정 결정 | 회신 필요도 |
|---|------|-------------------|------------|
| 1 | 마크다운에 unordered list만 vs ordered list (`1.`) + blockquote도 포함? | **v2.1 확정: ul + ol + blockquote 모두 포함** (페3 high-1 mitigation) | Resolved |
| 2 | 이미지 클라이언트 리사이즈 시 PNG 알파 보존 vs JPEG 변환? | **JPEG 변환 (품질 0.8, max 1280px)** — 번들 단순 + 페이로드 절감 | Medium — 알파 투명도 중요한 사용 사례 (스티커, 로고) 시 v3+ 옵션 검토 |
| 3 | Phase D 학생 자기 카드 sky 테두리 강조 강도 — 미세 (`ring-1`) vs 명확 (`ring-2 + 색상 진하게`)? | **미세 (`ring-1 ring-sky-400/20 + border-sky-400/40`)** — Padlet도 미세 강조 | Low — 디자인 QA 시 조정 |
| 4 | 학생 자기 카드 삭제 시 교사 화면 알림 — 토스트 vs 카운터만? | **v2.1 변경: soft delete placeholder가 카드 위치에 표시되어 교사가 자연 인지 + 별도 카운터 OOS** | Resolved (삭제 정책 변경으로) |
| 5 | sessionToken 분실 후 재진입 시 안내 텍스트 위치 — join 화면 vs 첫 카드 작성 시 vs 항상 상단 배너? | **v2.1 갱신: join 화면 1회 토스트 + PIN 옵션 안내 통합 (PIN 설정 권유)** | Low — UX QA 시 조정 |
| **6 (v2.1 신규)** | **PIN 입력 모달 표시 시점 — join 직후 vs 첫 카드 제출 직전 vs 학생 자율 (설정 메뉴)?** | **잠정: 학생 자율 (설정 메뉴 + 우상단 PIN 아이콘) — 강제 노출 X** | Medium — UX QA |
| **7 (v2.1 신규)** | **PDF 임시 디렉토리 cleanup 정책 — 보드 close 시 vs OS 정책 의존?** | **잠정: OS 정책 의존 (Electron 기본 temp 디렉토리)** — 보드 close 시 cleanup은 v3+ | Low |
| **8 (v2.1 신규)** | **moderation 'manual' 모드에서 학생이 카드 제출 시 학생 화면에 "교사 승인 대기" 표시?** | **잠정: 본인 카드만 "승인 대기" 라벨 + pending 큐에서 표시 (다른 학생에겐 안 보임 — 기존 v1 동작)** | Medium — UX QA |

**결정 필요 시 회신 양식**: 위 표 #N에 대한 의견 + 대안 명시.

### 12.1 v3+ 후속 (본 Plan §11.2 + Design 추가)

- **DOMPurify 이중 방어** — react-markdown 단독 신뢰가 부족하다고 판단 시 추가 (~20KB)
- **이미지 PNG 보존 옵션** — 스티커/로고 사용 사례 등장 시
- **Activity Indicator (다른 학생 작성 중 표시)** — Padlet 패턴, broadcast 추가 + UI 검증 후
- **세션 간 드래프트 동기화** — 서버 영속, PIPA 검토 필수
- **카드 수정 이력 (Version History)** — 학생용 비공개, 교사용 공개 검토

---

## 13. 수용 기준 (각 Phase 릴리즈 가능 조건 — v2.1 B→A→D→C 재배치)

### Phase B 수용 기준 (v1.15.0 — 1순위 5~7일)

- [ ] §10.1 Phase B 도메인 테스트 PASS (validateImages 다중 10+ 케이스, validatePdf 6+ 케이스)
- [ ] §10.3 Phase B 시나리오 PASS (B1~B6 + v2.1 추가)
- [ ] §9.2/§9.3/§9.7 보안 검증 PASS
- [ ] 이미지 다중(최대 3장 / 합계 5MB) drop/paste/picker 3 진입점 동작
- [ ] PDF 첨부(max 10MB) 별도 IPC 경로 + magic byte 검증
- [ ] 카드 색상 8색 픽커 + 카드 좌상단 점 + 배경 alpha 80% 표시
- [ ] 학생측 OG 인라인 표시 + 입력 모달 디바운스 800ms
- [ ] **Bold/Italic 버튼 툴바 (별표 직접 입력 회피 — 회귀 위험 #6 grep 0 hit 검증)**
- [ ] react-markdown allowedElements 7종 화이트리스트 (blockquote 포함) + **dangerouslySetInnerHTML grep 0 hit (회귀 위험 #7)**
- [ ] XSS payload (marquee/iframe/script/svg/object/embed/javascript:) 100+ plain text 변환
- [ ] 모바일 풀스크린 모달 + 키보드 자동 스크롤 + safe-area
- [ ] `Intl.Segmenter` grapheme 카운터 정확 (한글 자모/이모지)
- [ ] PIPA 동의 1회 안내 모달 (첫 이미지 첨부 시 + localStorage 플래그)
- [ ] 댓글 입력 정교화 (이미지 1장 + Bold/Italic + 풀스크린 + IME 카운터)
- [ ] 학생 1인 다중 카드 (rate limit 5회/분 유지)
- [ ] **부하 테스트 150명 동시 카드 제출/이미지 broadcast latency < 200ms (Plan FR + 페3 high-5)**
- [ ] 학생 entry 번들 < 350KB gzipped (Phase B 누적 ~30KB react-markdown + 이미지 처리 + 색상)
- [ ] 회귀 위험 9건 grep + unit test PASS
- [ ] release note 작성

### Phase A 수용 기준 (v1.15.1 — 2순위 1~2일)

- [ ] §10.2 회귀 위험 9건 단위 테스트 PASS
- [ ] §10.3 Phase A 시나리오 PASS (long-press, 더블클릭, 드래프트, moderation 토글)
- [ ] §10.6.1 첫 join → 1초 측정 PASS
- [ ] §10.6.2 iOS Safari 실기기 매뉴얼 QA PASS (IS-1 ~ IS-4)
- [ ] FAB 잠금 시 lock 아이콘 + tooltip 표시
- [ ] **`C` 단축키 코드 완전 제거 (grep 0 hit — 회귀 위험 #6)**
- [ ] 모바일 long-press(600ms) + 데스크톱 더블클릭 진입 동작 + 카드 영역 hit area 분리
- [ ] 드래프트 localStorage 저장/복원/삭제 + **보드 단위 키 분리** 동작 (다보드 동시 작성)
- [ ] 모달 minimize → 칩 → 재오픈 동작
- [ ] **moderation 프리셋 토글 (보드 생성 + 설정 패널 모두) + 기본 'off'**
- [ ] **iOS Safari 30초 백그라운드 후 WebSocket 자동 재연결 통합 테스트 PASS**
- [ ] 학생 entry 번들 < 400KB gzipped 유지
- [ ] release note 작성

### Phase D 수용 기준 (v1.15.2 — 3순위 3~4일)

- [ ] §10.1 Phase D 도메인 테스트 PASS (validateEdit + validateDelete + applyEdit + **applyDelete soft delete only**)
- [ ] §10.3 Phase D 시나리오 PASS (D1~D8 + v2.1 추가)
- [ ] 자기 카드 hover-action sky 색상 + **sessionToken/PIN 양방향 매칭** 동작
- [ ] 수정 모달 mode='edit' 동작 (이미지 다중 / 색상 / PDF 모두 수정 가능 / 회귀 위험 #4 보존 검증)
- [ ] 한국어 삭제 다이얼로그 동작
- [ ] **삭제 = soft delete (status='hidden-by-author' 갱신만)** + "작성자가 삭제했어요" placeholder 카드 + 좋아요/댓글 보존 (Plan §7.2 결정 #4 v2.1)
- [ ] **hard delete 패턴 grep 0 hit (회귀 위험 #8)**
- [ ] 교사 placeholder 카드 "복원" 메뉴 동작
- [ ] **학기 영속 PIN**: 4자리 입력 → SHA-256 hash → studentPinHash. 같은 PIN으로 학기 내 자기 카드 식별 (양방향 매칭)
- [ ] **PIN 평문 서버 저장 0 (grep + Zod 스키마 검사 — 회귀 위험 #9)**
- [ ] 교사 작성자 추적 도구 (우클릭 메뉴) — 같은 sessionToken/PIN hash 카드 강조
- [ ] 교사 닉네임 변경/일괄 숨김 권한 동작
- [ ] 다른 학생 카드 hover 시 메뉴 미표시 (DOM 없음)
- [ ] §7.2 결정 #5 (c)+(a) 따라 hidden 후 학생 권한 정책 일관
- [ ] release note 작성

### Phase C 수용 기준 (v1.15.3 — 4순위 5~7일)

- [ ] §10.1 Phase C 도메인 테스트 PASS (validateMove + applyMove + isOwnCard 양방향 + isMobile 분기)
- [ ] §10.3 Phase C 시나리오 PASS (C1~C7)
- [ ] §10.5 **부하 테스트 PASS (150 클라이언트 latency < 200ms)**
- [ ] Freeform 자기 카드 드래그/리사이즈 + 다른 카드 차단 + **모바일 viewport readOnly** 동작
- [ ] **Freeform 자기 카드 기본 locked + "✏️ 위치 바꾸기" 토글** 동작 (페1 critical-5)
- [ ] Kanban 자기 카드 컬럼 이동 + 다른 카드 차단 동작
- [ ] Grid/Stream 학생 정렬 불가 (회귀 0)
- [ ] 서버 sessionToken/PIN hash 양방향 검증 통과/실패 통합 테스트 PASS
- [ ] 위치 변경 broadcast 차분 patch (변경 필드만)
- [ ] LWW reconcile 단위 테스트 PASS
- [ ] release note 작성

### v1.15.x 안정화 (Phase B+A+D+C 통과 후)

- [ ] 도메인 규칙 380+ 테스트 전수 통과 (v2 308 + v2.1 +72 신규 ≈ 380)
- [ ] tsc 0 error, build 성공
- [ ] **회귀 위험 9건** 단위 테스트 + grep 어서션 모두 PASS
- [ ] v1.14.x 보드 데이터 무손실 로드 + 학생 권한 차단 동작 확인
- [ ] 학생 entry 번들 < 500KB gzipped (Phase B+A+D+C 모두 누적 후)
- [ ] gap-detector Match Rate 90%+ (`/pdca analyze`)
- [ ] Notion 사용자 가이드 + 챗봇 KB 업데이트 (PIN / moderation OFF / soft delete 핵심 Q&A 포함)
- [ ] release note v1.15.x 4개 (B/A/D/C) 모두 작성 + moderation 기본값 'off' 변경 명시

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-25 | 초안 작성 — Plan v0.1 대응 설계. Phase A/B/C/D 4단계 의존성 + 독립 릴리즈 보장, 데이터 모델 v2 확장(attachments/ownerSessionToken/edited), 도메인 규칙 신설(isOwnCard/validateMove/validateEdit/validateDelete/applyMove/applyEdit/applyDelete/validateImageAttachment/ensureOwnerSessionToken), WebSocket 메시지 신규 3종(submit-move/edit/delete) + 기존 broadcast 차분 patch 재활용, BoardRouter prop 3종 신규(onOwnCardMove/Edit/Delete), per-card 동적 readOnly 패턴, react-markdown@9 화이트리스트, 이미지 base64 + magic byte 검증, LWW reconcile 정책, 회귀 위험 5건 자동 검증(grep + unit test 이중), 통합 파일 변경 목록 21 신규 + 18 수정, Open Questions 5건 | frontend-engineer-high (consult: cto-lead/security-architect/qa-strategist) |
| **0.2 (v2.1)** | **2026-04-24** | **Plan v2.1 동기화 + 4 페르소나(초등/중등/보안QA/패들렛) 검토 결과 9건 결정 흡수. 핵심 변경 5건**: ① **Phase 순서 절대 변경** A→B→C→D를 **B→A→D→C로 재배치** (4 페르소나 4/4 합의 critical-1) ② **§7.2 결정 9건 모두 확정** (v2 본문 5건 + v2.1 신규 4건: 카드 색상 8색 / PDF 별도 IPC / moderation 'off'\|'manual' 프리셋 / 학기 영속 PIN) ③ **삭제 정책 (b) hard delete → (a) soft delete + placeholder** (페2 critical-5) ④ **마크다운 별표 직접 입력 → Bold/Italic 버튼 툴바** (페1 critical-6 — 별표 자모분리) ⑤ **회귀 위험 5건 → 9건** (v2 5건 보존 + v2.1 4건 추가: `C` 단축키 0 hit / `dangerouslySetInnerHTML` 0 hit / hard delete 0 hit / PIN 평문 0 hit). 갱신된 섹션: §0(원칙 v2-1 양방향 매칭/v2-2 9건 검증/v2-5 9건), §0.3(결정 9건), §1(Phase 그래프 B→A→D→C / Phase 재배치 근거 표), §2(images/pdfUrl/color/studentPinHash/status union 확장 / RealtimeWallBoardSettings / hashStudentPin / 보드+세션 단위 드래프트 키), §3(isOwnCard 양방향 / validateMove 모바일 / validateEdit·Delete PIN+soft delete / applyDelete soft delete only + applyRestore / validateImages 다중 / validatePdf / validateBoardSettings / ensureOwnerCredentials), §4(WebSocket 7종 신규 R→S + 2종 신규 S→R 보드설정·닉네임 / Zod 스키마 v2.1 / Rate Limit 5종), §5(컴포넌트 트리 신규 다수 — StudentMarkdownToolbar/ColorPicker/ImageMultiPicker/PdfPicker/PipaConsentModal/CommentForm/PinSetupModal/NicknameChangedToast + RealtimeWallCardImageGallery/PdfBadge/Placeholder/Colors + BoardSettingsPanel/TeacherContextMenu/StudentTrackerPanel/FreeformLockToggle / BoardRouter prop 9개 신규 / RealtimeWallCard placeholder+색상+PIN 매칭), §6(useRealtimeWallSyncStore 액션 13개 신규 + iOS Safari 재연결 시퀀스 다이어그램), §7(`realtime-wall:upload-pdf` IPC 채널 신규 + 보안), §8(마이그레이션 v2.1 필드 표 갱신), §9(PDF 보안 §9.7 + PIN 보안 §9.8 신규), §10(회귀 위험 9건 grep 어서션 + 부하 테스트 150명 + 첫 join 1초 측정 + iOS Safari 매뉴얼 QA 4 시나리오), §11(신규 파일 47개 / 수정 파일 21개), §13(Phase 수용 기준 B→A→D→C 재배치). v2 본문 보존 + 영향받은 섹션만 v2.1 표기로 갱신. | frontend-engineer-high (consult: cto-lead/security-architect/qa-strategist + 4 personas) |
