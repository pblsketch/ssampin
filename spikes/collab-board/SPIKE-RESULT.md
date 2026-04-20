# 쌤핀 협업보드 — 스파이크 결과 보고서

> **실행일**: 2026-04-19
> **관련 Plan**: [docs/01-plan/features/collab-board.plan.md](../../docs/01-plan/features/collab-board.plan.md)
> **결론**: **S1·S2 모두 초록불**. Phase 1a 본 구현 착수 가능.

---

## 결과 요약

| # | 스파이크 | 결과 | 착수 영향 |
|---|---------|------|----------|
| S1 | y-excalidraw + CDN 로드 + WebSocket 2탭 실시간 동기화 | ✅ **초록불** (조건부) | Plan A안 유효, 단 Excalidraw `0.17.6` 고정 필요 |
| S2 | `tunnel.ts` 상호 배타 스위치 | ✅ **초록불** | 기존 `tunnel.ts` 무수정, 얇은 coordinator 래퍼로 해결 |
| S3 | CDN 로드 동작 확인 (S1에 포함) | ✅ **초록불** | extraResources 번들링 불필요, Blocker #4 제거 확정 |

---

## S2: Tunnel Mutual Exclusion — **PASS (18/18 assertions)**

### 테스트 산출물
- [spikes/collab-board/s2-tunnel-mutex/coordinator.ts](s2-tunnel-mutex/coordinator.ts) — 프로토타입 (93 LOC)
- [spikes/collab-board/s2-tunnel-mutex/coordinator.test.ts](s2-tunnel-mutex/coordinator.test.ts) — 단위 테스트 (6 tests, 18 asserts)

### 실행 결과
```
[Test 1] 보드 점유 중 → 투표 차단              PASS (6/6)
[Test 2] 투표 점유 중 → 보드 차단 (대칭)        PASS (2/2)
[Test 3] 같은 owner+port 재진입 idempotent       PASS (2/2)
[Test 4] release 후 다른 owner 정상 acquire       PASS (4/4)
[Test 5] 엉뚱한 owner의 release는 무시 (방어적)   PASS (3/3)
[Test 6] 같은 owner·다른 port 재acquire 거부      PASS (1/1)
```

### 핵심 결정
`tunnel.ts`의 `activeTunnel` 싱글턴을 **건드리지 않고**, 얇은 `BoardTunnelCoordinator` 래퍼에 `TunnelDriver` 인터페이스로 의존성 주입. 기존 5개 라이브 도구(투표·설문·워드클라우드·토론·멀티설문)는 **변경 0**이고, 신규 도구만 coordinator를 통해 acquire/release.

### 본 구현 적용 경로
```
infrastructure/board/BoardTunnelCoordinator.ts  ← 스파이크 코드 거의 그대로 이식
adapters/repositories/...                        ← acquire/release 호출 지점만 주입
electron/ipc/board.ts                            ← registerBoardHandlers에서 coordinator 사용
```

Phase 2+에서 멀티 터널이 필요해지면 `acquire(owner, port)` 시그니처를 그대로 둔 채 내부 구현만 "복수 터널 지원"으로 교체 가능.

---

## S1: Excalidraw CDN + y-excalidraw + Y.js WebSocket 동기화 — **PASS**

### 실행 구성
- **서버**: `node server.mjs` (포트 4444, HTTP+WS 단일 프로세스)
- **스택**:
  - React 18.3.1, Excalidraw 0.17.6 — 전부 esm.sh CDN
  - Y.js 13.6.19, y-websocket 2.0.4, y-excalidraw 2.0.12 — 전부 esm.sh CDN
- **브라우저**: Playwright Chromium 2개 탭

### 검증 결과 — 동시 접속 + 양방향 동기화 정상 동작

| 측정 지점 | 탭 1 (수신측) | 탭 2 (전송측) |
|----------|---------------|---------------|
| 연결 상태 | `connected` | `connected` |
| Y.Array 요소 수 | **5** | **5** |
| Excalidraw Scene 요소 수 | **5** | **5** |
| 요소 좌표 일치 | ✅ | ✅ |
| awareness 인식 사용자 수 | 2 (`tab-2nxp`, `tab-3zj6`) | 2 |

서버 health check: `{"ok":true,"rooms":["spike-s1-room"]}` — 단일 room 정상 유지

### 스파이크 산출물
- [spikes/collab-board/s1-cdn-poc/server.mjs](s1-cdn-poc/server.mjs) — HTTP+WS 통합 서버 (53 LOC)
- [spikes/collab-board/s1-cdn-poc/board.html](s1-cdn-poc/board.html) — 인라인 CDN 로드 HTML (~150 LOC)
- [spikes/collab-board/s1-cdn-poc/package.json](s1-cdn-poc/package.json) — `ws`, `yjs`, `y-websocket` 서버측 의존성
- 스크린샷:
  - [s1-tab1-initial.png](s1-tab1-initial.png) — 탭 1 초기 로드 (Excalidraw UI + 연결됨 뱃지)
  - [s1-tab1-synced.png](s1-tab1-synced.png) — 탭 1이 요소 동기화 수신한 시점
  - [s1-tab2-final.png](s1-tab2-final.png) — 탭 2 최종 상태

### 주요 발견 및 결정

#### 발견 1: **Excalidraw 버전을 `0.17.6`으로 고정 필수**
- y-excalidraw 2.0.12의 peerDeps: `"@excalidraw/excalidraw": "^0.17.6"`
- `^0.17.6` semver는 `0.18.0`을 **포함하지 않음** (0.x는 minor bump가 breaking 취급)
- y-excalidraw GitHub 저장소는 2.0.12 이후 업데이트 없음
- **결정**: Plan의 "Excalidraw 0.18" 목표를 `0.17.6`으로 수정. 0.17의 기능 세트(roughness, UIOptions, viewModeEnabled, langCode, convertToExcalidrawElements)로 MVP·Phase 1b 모두 달성 가능
- Phase 2+에서 Excalidraw 0.18 이상이 필요하면 **y-excalidraw 폴백 플랜(자체 바인딩 5~7일 공수)** 발동

#### 발견 2: **esm.sh 번들이 UMD 래핑되어 Excalidraw는 default export 전용**
- `import { Excalidraw } from '@excalidraw/excalidraw'` 는 실패
- `import ExcalidrawLib from '@excalidraw/excalidraw'; const { Excalidraw, convertToExcalidrawElements } = ExcalidrawLib;` 로 해결
- **결정**: 본 구현 시 이 패턴을 `generateBoardHTML()` 템플릿에 반영

#### 발견 3: **y-excalidraw 2.0.12의 `setupUndoRedo`에 null 체크 누락 버그 존재**
- `excalidrawDom.querySelector('[aria-label="Undo"]')` 결과에 null 체크 없이 `addEventListener` 호출 → `TypeError`
- 원인: Excalidraw UI 마운트 전에 binding 생성자가 실행될 때 발생
- **회피책**:
  - (MVP) `undoManager` 옵션 생략 — binding 생성자가 `setupUndoRedo` 호출 안 함. Y.js UndoManager 기반 협업 Undo는 Phase 2로 유예
  - (Phase 2+) 업스트림 PR 제출 또는 자체 바인딩으로 승격
- **결정**: Phase 1a에선 Undo/Redo는 Excalidraw 기본 동작만 사용 (CRDT 통합 X). 대부분의 교사 시나리오에 충분.

#### 발견 4: **y-excalidraw의 sync 경로는 Excalidraw `onChange` 기반**
- `api.updateScene()` 호출 → Excalidraw 내부 `onChange` 발화 → y-excalidraw 바인딩이 diff 계산 → Y.Array 반영
- 프로그래매틱 injection도 Y.Array로 전파됨 (검증 완료: `tab2YElements: 2`)
- **결정**: 본 구현에서 학생 권한 제어 시 `onChange` 훅으로 intercept 가능 (Phase 2 학생 도구 제한 기능 기반)

---

## Plan 문서 영향 — 변경 사항

Plan의 아래 항목을 이 결과에 맞게 업데이트해야 합니다:

| Plan 섹션 | 변경 전 | 변경 후 |
|----------|---------|---------|
| 3.1 FR-07 등 | "Excalidraw v0.18" | **"Excalidraw 0.17.6 고정"** (근거: y-excalidraw peerDeps) |
| 5 R1 (리스크) | "y-excalidraw v0.18 미지원" | **"해소됨 — 0.17.6에서 동작 확인"**, 대신 **"v0.18 승격 시 자체 바인딩 필요"** 로 재서술 |
| 6.2 Key Decisions | "학생 번들 전략: CDN 로드" | **유지 (S1/S3 초록불)** — 근거 확증 |
| 8 Spike Plan | S1 1일 + S2 0.5일 예정 | **완료**. 결과: 두 스파이크 모두 PASS |
| 2.1 Phase 1a | — | **신규 명시**: "협업 Undo(Y.js UndoManager 통합)는 Phase 2로 유예" |

---

## 다음 단계

1. **Plan 문서 업데이트** — 위 5개 항목 반영
2. **`/pdca design collab-board`** 실행 — 스파이크로 확정된 결정을 Design 문서로 정식화
   - `Board` 엔티티에 `excalidrawVersion: '0.17.6'` 상수 반영
   - `BoardTunnelCoordinator` 인터페이스 명세 (스파이크 코드 그대로)
   - `generateBoardHTML()` 의 CDN URL 테이블 고정
   - WebSocket 프로토콜: `y-websocket` 표준 + 인증 레이어
3. **Phase 1a 본 구현** — Clean Architecture 4-layer 매핑대로 전개

**예상 일정 영향**: Plan 원래 추정(스파이크 제외 2.5~3주)은 유효. 스파이크가 계획 범위 내(1.5일 → 실제 약 1일 소요)에서 끝났으므로 마감 지연 없음.
