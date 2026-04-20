---
template: plan
version: 1.2
feature: collab-board
date: 2026-04-19
author: pblsketch
project: ssampin
version_target: v1.12.0
---

# 쌤핀 협업 온라인 보드(Collab Board) 기획서

> **요약**: Google Jamboard(2024.12 서비스 종료) 대안으로 쌤핀 쌤도구에 **서버리스 실시간 협업 화이트보드**를 추가한다. 교사 Electron 앱이 임시 Y.js WebSocket 서버 역할을 맡고, 학생은 QR/URL로 브라우저에서 접속한다. 기존 쌤도구(투표·설문·워드클라우드·토론·멀티설문)와 **동일한 접속 UX**(인라인 HTML + cloudflared 터널 + QR)를 유지하며, Excalidraw는 **CDN 로드 방식**으로 번들링 파이프라인 신설 없이 통합한다.
>
> **Spike 완료 (2026-04-19)**: S1(Excalidraw+CDN+Y.js 2탭 동기화) / S2(터널 상호 배타) **전부 초록불**. Excalidraw는 **0.17.6로 고정**(y-excalidraw 2.0.12의 peerDeps `^0.17.6`이 0.18 미지원). 세부 결과는 [spikes/collab-board/SPIKE-RESULT.md](../../../spikes/collab-board/SPIKE-RESULT.md).
>
> **Project**: ssampin (쌤핀)
> **Version**: v1.11.x → v1.12.0
> **Author**: pblsketch
> **Date**: 2026-04-19
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

교사가 한 화면에서 **실시간으로 학생과 함께 그리고 적는 협업 보드**를 열 수 있도록 한다. 구체적으로는 Jamboard가 제공하던 "QR 한 번으로 30명이 동시에 참여하는 공유 화이트보드" 시나리오를 쌤핀 내부에서 재현하되, **외부 서버·클라우드 구독·학생 계정 없이** 교사 PC가 임시 서버로 동작하게 한다.

### 1.2 Background

- **시장 공백**: Google Jamboard가 2024년 12월 공식 종료되면서 한국 중·고등학교 교사들이 대체재를 찾고 있음. FigJam/Miro는 계정·유료·서비스 차단 이슈로 교실 현장에 부담.
- **쌤핀 인프라 기조**: 쌤핀은 이미 `ws`, `cloudflared`, `qrcode`, `idb`를 보유 중이고, 5개 라이브 도구(투표·설문·워드클라우드·토론·멀티설문)가 "교사 PC = 임시 서버" 패턴으로 **검증 완료**. 협업 보드는 이 패턴의 자연스러운 확장이다.
- **개인정보 보호(PIPA)**: 학생 작성 데이터를 외부 서버로 보내지 않고 교사 PC 로컬에만 저장하는 것이 교내 정책상 매우 유리.
- **디자인 결정 완료**: 구현 계획 검토 과정에서 **Excalidraw + Y.js CRDT + CDN 로드** 조합으로 확정. 기존 쌤도구의 인라인 HTML 패턴을 깨지 않고 Jamboard 수준 UX를 확보하는 유일한 경로로 판단.

### 1.3 Related Documents

- 원본 구현 계획서: [docs/쌤핀_협업보드_구현계획.md](../../쌤핀_협업보드_구현계획.md)
- 1차 리뷰 보고서: [docs/쌤핀_협업보드_계획리뷰.md](../../쌤핀_협업보드_계획리뷰.md)
- 기존 쌤도구 IPC 패턴 기준: [electron/ipc/liveMultiSurvey.ts](../../../electron/ipc/liveMultiSurvey.ts), [electron/ipc/liveMultiSurveyHTML.ts](../../../electron/ipc/liveMultiSurveyHTML.ts)
- 터널 모듈(싱글턴 충돌 주의 대상): [electron/ipc/tunnel.ts](../../../electron/ipc/tunnel.ts)
- 쌤도구 진입점: [src/adapters/components/Tools/](../../../src/adapters/components/Tools/)
- AI 챗봇 KB 업데이트 대상: `scripts/ingest-chatbot-qa.mjs`
- OSS 레퍼런스: `excalidraw/excalidraw`, `yjs/yjs`, `RahulBadenkal/y-excalidraw`, `mizuka-wu/excalidraw-yjs-starter`

---

## 2. Scope

### 2.1 In Scope — Phase 1a (MVP, v1.12.0)

Phase 1a는 **"30명이 같이 그릴 수 있다"** 를 교실에서 증명하는 최소 동작판이다. Jamboard 스킨은 Phase 1b로 유예한다.

- [ ] 쌤도구에 "협업 보드" 메뉴 등록 (기존 5개 도구와 동일 패턴)
- [ ] Electron Main: `registerBoardHandlers(mainWindow)` IPC 모듈 (기존 `registerMultiSurveyHandlers` 등과 동일 시그니처)
- [ ] HTTP 서버가 인라인 HTML 서빙 (`generateBoardHTML()`), HTML 내부에서 **CDN으로 Excalidraw 로드** (esm.sh + import map, default import 패턴)
- [ ] Y.js WebSocket 서버 (`y-websocket/bin/utils`의 `setupWSConnection`을 `createRequire`로 로드, 서버는 `ws` 기반 — 스파이크 동일 구조)
- [ ] y-excalidraw `2.0.12` 바인딩으로 Excalidraw `0.17.6` ↔ Y.Doc 실시간 동기화 (스파이크로 검증됨)
- [ ] 바인딩 생성 시 `undoManager` 옵션 생략 (y-excalidraw 2.0.12의 `setupUndoRedo` null 체크 버그 회피 — CRDT 통합 Undo는 Phase 2)
- [ ] cloudflared 터널 자동 오픈 + QR 생성 (기존 패턴 재사용)
- [ ] **터널 상호 배타 스위치**: 다른 라이브 도구 진행 중이면 Toast로 안내 후 진입 차단 (Blocker #3)
- [ ] **WebSocket 입장 인증**: URL 쿼리 토큰 + 교사 콘솔에서 확인 가능한 세션 코드 (Blocker #5)
- [ ] **자동 저장**: 30초 주기 + `app.before-quit` 동기 저장, `userData/data/boards/{id}.ybin` (Blocker #6)
- [ ] 보드 불러오기 (이전 세션 데이터 재개)
- [ ] Clean Architecture 레이어 매핑 (Blocker #1)
  - `domain/entities/Board.ts`, `domain/entities/BoardParticipant.ts`
  - `domain/repositories/IBoardRepository.ts`
  - `usecases/board/{ManageBoard, StartBoardSession, EndBoardSession, SaveBoardSnapshot}.ts`
  - `adapters/repositories/FileBoardRepository.ts`
  - `adapters/stores/useBoardStore.ts`, `useBoardSessionStore.ts`
- [ ] 교사 UI: 보드 시작/종료 버튼, QR 표시, 접속 학생 수 카운터, 세션 코드 표시
- [ ] 학생 UI(인라인 HTML): 이름 입력 → 보드 입장 → Excalidraw 기본 편집 (view/edit 권한은 Phase 2)
- [ ] cloudflared 25초 **heartbeat ping** (idle timeout 드롭 방지)
- [ ] AI 챗봇 KB 업데이트 (이 기능 Q&A 추가, 없는 UI 참조 금지)
- [ ] 릴리즈 노트 `public/release-notes.json`에 v1.12.0 항목 추가

### 2.2 Phase 1b (Jamboard 스킨, v1.12.x)

MVP 동작 확인 후 시각/UX 레이어를 Jamboard 수준으로 끌어올린다.

- [ ] `roughness: 0` 강제 적용 (학생 모드에선 onChange로 복원)
- [ ] CSS로 Excalidraw 기본 툴바 숨기기 + 좌측 세로 커스텀 툴바 (펜/도형/텍스트/스티키/지우개/선택)
- [ ] 스티키 노트 기능 (`convertToExcalidrawElements`, 6색 팔레트)
- [ ] 페이지 시스템 (**페이지별 Y.Doc 분리** — `resetScene` 전파로 타인 캔버스 초기화 방지)
- [ ] 단순화 6색 팔레트, 배경/테마 CSS 오버라이드
- [ ] 모바일 터치 기본 대응(**팜 리젝션**: `pointerType === 'pen'` 우선, iPad+Apple Pencil 타겟)
- [ ] 학생용 연결 끊김/재연결 안내 오버레이
- [ ] 보드 PNG 내보내기 (기존 내보내기 인프라 연계)

### 2.3 Phase 2 (교사 제어, v1.13.0 검토)

- [ ] 교사/학생 역할 구분 + 권한 스키마
- [ ] 보드 잠금/해제 (`viewModeEnabled` 토글 브로드캐스트)
- [ ] 도구 제한 (UIOptions 동적 변경)
- [ ] 포커스 모드 (교사 화면 강제 동기화)
- [ ] Y.js awareness (실시간 커서/이름 뱃지)
- [ ] 타이머 기능 (활동 시간 제한)
- [ ] 보드 내보내기 (PNG/PDF)

### 2.4 Phase 3 (개인/그룹 보드, v1.14+ 검토)

- [ ] 멀티 room 지원 (room별 독립 Y.Doc)
- [ ] 교사 대시보드 (학생 보드 썸네일 그리드)
- [ ] 그룹 편성 (학생명단 연동)
- [ ] 콘텐츠 배포 (교사 → 학생 보드 복사)
- [ ] 학생 보드 스냅샷

### 2.5 Out of Scope

- **여러 라이브 도구 동시 실행** (투표 + 보드 동시) — 현재 `tunnel.ts` 싱글턴 제약. Phase 2+에서 멀티 터널 검토.
- **오프라인 전용 동작** — 터널 자체가 인터넷 연결 전제이므로 CDN 인터넷 의존은 실질 영향 없음. 오프라인 버전은 Phase 4 이후 `extraResources` 번들링으로 승격 옵션으로 검토.
- **이미지 검색 삽입** — Jamboard의 Google 이미지 검색 기능. Excalidraw는 로컬 업로드만 지원. Phase 4+.
- **손글씨 문자 인식** — Phase 4+.
- **보드 영상 리플레이** — Phase 4+.
- **모바일 PWA 교사 모드** — 교사는 Electron 데스크톱 앱 전용.
- **tldraw SDK** — 상용 라이선스로 GPL-3.0 비호환. 채택 금지.

---

## 3. Requirements

### 3.1 Functional Requirements

#### Phase 1a (MVP)

| ID | 요구사항 | 우선순위 | 상태 |
|----|---------|---------|------|
| FR-01 | 쌤도구 메뉴에 "협업 보드" 항목이 있고 클릭 시 보드 대시보드 페이지로 진입한다 | High | Pending |
| FR-02 | 교사가 "보드 시작" 버튼을 누르면 **5초 이내** WebSocket 서버·HTTP 서버·cloudflared 터널이 준비되고 QR 코드가 표시된다 | High | Pending |
| FR-03 | QR 옆에 **6자리 세션 코드**와 공개 URL 텍스트가 함께 표시되고 클립보드 복사 버튼이 동작한다 | High | Pending |
| FR-04 | 학생이 QR로 접속하면 이름 입력 화면 → Excalidraw 캔버스 진입 흐름이 동작한다 (앱 설치·계정 불필요) | High | Pending |
| FR-05 | 30명 동시 접속 환경에서 드로잉 변경이 **평균 200ms 이내**에 모든 참여자에게 반영된다 | High | Pending |
| FR-06 | 다른 라이브 도구(투표/설문 등)가 실행 중이면 보드 시작 시 Toast 안내 후 진입을 차단한다 (반대 방향도 동일) | High | Pending |
| FR-07 | WebSocket 연결 시 URL 토큰 + 세션 코드 검증 없이는 Y.Doc 동기화 메시지를 거부한다 | High | Pending |
| FR-08 | 교사 UI에 현재 접속 학생 수 실시간 카운터와 접속자 이름 목록이 표시된다 | High | Pending |
| FR-09 | 보드 내용은 **30초 주기** 및 교사 종료 시점, `app.before-quit` 시점에 `userData/data/boards/{id}.ybin`에 저장된다 | High | Pending |
| FR-10 | 교사가 동일 보드를 다시 열면 이전 세션 내용이 복원된다 | High | Pending |
| FR-11 | cloudflared 터널 유지용 25초 주기 heartbeat ping이 자동 발송된다 | Medium | Pending |
| FR-12 | 학생 접속 HTML은 `generate*HTML` 인라인 생성 패턴을 따르고 Excalidraw/Y.js는 CDN(`<script src>`)으로 로드된다 | High | Pending |
| FR-13 | 학생 WebSocket 연결이 끊기면 브라우저 UI에 "재접속 중" 오버레이가 표시되고 지수 백오프 재연결을 시도한다 | Medium | Pending |
| FR-14 | 릴리즈 전 AI 챗봇 KB(`scripts/ingest-chatbot-qa.mjs`)에 협업 보드 Q&A 반영 | High | Pending |
| FR-15 | 릴리즈 노트 `public/release-notes.json`에 v1.12.0 협업 보드 항목 추가 | High | Pending |

#### Phase 1b (Jamboard 스킨)

| ID | 요구사항 | 우선순위 | 상태 |
|----|---------|---------|------|
| FR-21 | Excalidraw `roughness:0`가 기본 적용되고 학생 모드에선 변경 시 복원된다 | High | Pending |
| FR-22 | Jamboard 스타일 좌측 세로 6도구 커스텀 툴바가 표시되고 Excalidraw 기본 상단 툴바는 CSS로 숨긴다 | High | Pending |
| FR-23 | 스티키 노트 삽입 버튼이 동작하고 6색 팔레트 중 선택할 수 있다 | High | Pending |
| FR-24 | 페이지 추가/전환 시 페이지별로 **독립 Y.Doc**이 유지되어 타인의 다른 페이지 캔버스를 초기화하지 않는다 | High | Pending |
| FR-25 | 하단 페이지 네비게이터로 페이지 전환·추가가 가능하다 | Medium | Pending |
| FR-26 | iPad + Apple Pencil 환경에서 팜 리젝션(손바닥 입력 무시)이 동작한다 | High | Pending |

### 3.2 Non-Functional Requirements

| 카테고리 | 기준 | 측정 방법 |
|---------|------|---------|
| 성능(동시성) | 30명 동시 편집 시 지연 평균 ≤200ms, p95 ≤500ms | 로컬 3PC 시뮬레이션 + 교실 실측 |
| 성능(초기 로드) | 학생 첫 접속 시 캔버스 보일 때까지 3G 기준 ≤5초, WiFi 기준 ≤2초 | Chrome DevTools Network Slow 3G |
| 안정성 | 교사 Electron 앱 강제 종료 후 재시작 시 **최대 30초 이내의 변경**만 손실 | 자동 저장 주기 검증 |
| 안정성(터널) | 20~30초 idle 후에도 학생 연결 유지 | heartbeat 제거 상태 vs 제거 후 비교 |
| 보안 | 세션 코드 없는 외부 WebSocket 접속 차단 | 외부 클라이언트 테스트 |
| 개인정보 | 학생 IP/접속 로그를 디스크에 영속 저장하지 않음 | 코드 리뷰, `userData/` 덤프 |
| 하위 호환 | 기존 5개 라이브 도구 정상 동작 유지 (터널 상호 배타 스위치 외 기능 영향 없음) | 회귀 테스트 |
| 디자인 일관성 | 교사 UI는 기존 sp-* 디자인 토큰만 사용 | 디자인 리뷰 |
| 한국어 | 모든 UI 텍스트(교사+학생) 한국어 | 수동 검수 |
| 접근성 | 학생 HTML은 기본 aria-label 준수, 에러 안내 텍스트 병행 | 수동 스크린리더 확인 |

---

## 4. Success Criteria

### 4.1 Definition of Done (Phase 1a MVP)

- [ ] FR-01 ~ FR-12, FR-14 ~ FR-15 구현 완료 (Must)
- [ ] FR-13 구현 완료 (Should)
- [ ] Blocker 6건 모두 해소
  - [ ] Clean Architecture 4-layer 매핑 완료 (domain/usecases/adapters/infrastructure)
  - [ ] `registerBoardHandlers(mainWindow)` 패턴으로 IPC 통일
  - [ ] 터널 상호 배타 스위치 구현
  - [ ] WebSocket 입장 인증 (URL 토큰 + 세션 코드) 구현
  - [ ] 30초 자동 저장 + before-quit 저장 구현
  - [ ] y-excalidraw 호환 확인 또는 자체 바인딩 확정 (스파이크 결과)
- [ ] 스파이크 3종 초록불
  - [ ] y-excalidraw v0.18 호환 POC 성공 (또는 자체 바인딩 구현 결정)
  - [ ] 터널 상호 배타 PoC 성공
  - [ ] CDN 로드로 학생 브라우저에 Excalidraw 정상 렌더 확인
- [ ] 실사용 검증
  - [ ] 교사 PC 1대 + 스마트폰/태블릿 **10대 이상** 동시 접속 드로잉 성공
  - [ ] 보드 시작 → QR 표시까지 5초 이내
  - [ ] 자동 저장 검증 (Electron 강제 종료 후 재시작으로 데이터 복원)
- [ ] TypeScript 에러 0개 (`npx tsc --noEmit`)
- [ ] `npm run build` 성공
- [ ] PDCA `analyze` Match Rate ≥ 90%
- [ ] 챗봇 KB 재임베딩 완료, v1.12.0 릴리즈 노트에 포함

### 4.2 Quality Criteria

- [ ] Clean Architecture 의존성 규칙 위반 없음
  - [ ] `domain/`은 외부 의존 0개
  - [ ] `usecases/`는 `adapters/`·`infrastructure/` import 금지
  - [ ] `infrastructure/`만이 Y.js·ws·cloudflared import
- [ ] `any` 타입 미사용
- [ ] Tailwind 유틸리티 클래스 사용 (인라인 스타일 지양)
- [ ] 모든 UI 텍스트 한국어
- [ ] 기존 `tunnel.ts` 외에 터널 오픈 로직 중복 생성 금지
- [ ] 학생 HTML은 `generateBoardHTML()` 한 곳에서만 생성 (기존 `liveMultiSurveyHTML.ts` 패턴 준수)

### 4.3 사용자 경험 수락 기준 (UX Acceptance)

- [ ] **원클릭 시작**: 교사가 "보드 시작" 한 번만 누르면 QR까지 나옴 (포트 선택·URL 복사 등 중간 단계 없음)
- [ ] **학생 제로 교육**: QR 찍고 이름만 쓰면 끝, 별도 앱 설치/가입 없음
- [ ] **실수 복구**: 교사 실수로 앱이 꺼져도 **30초 이전 작업**은 살아있음
- [ ] **다른 도구와 공존 명확성**: 이미 투표 중일 때 보드를 열면 "투표를 먼저 종료해주세요" 안내가 즉시 표시됨 (무음 실패 금지)
- [ ] **학생 연결 끊김 대응**: 연결이 끊겨도 브라우저에서 "다시 연결 중..." 오버레이로 상태 인지 가능

---

## 5. Risks and Mitigation

| # | 리스크 | 영향 | 가능성 | 완화 방안 |
|---|--------|------|-------|---------|
| R1 | ~~y-excalidraw v0.18 미지원~~ **(스파이크로 해소)** — Excalidraw `0.17.6`에서 y-excalidraw `2.0.12` 정상 동작 확인. 단 0.18 이상으로 승격 시 자체 바인딩 필요 (약 5~7일 공수) | ~~High~~ Low | — | **Phase 1a 범위 내에선 없음.** Phase 2+ Excalidraw 승격 요구 발생 시 자체 바인딩 플랜 발동 |
| R2 | **터널 싱글턴 충돌** — `activeTunnel` 전역에 기존 투표/설문과 보드가 동시 접근 시 상호 파괴 | High | High | Phase 1a에서 **상호 배타 스위치**로 해결(동시 1개만). Phase 2+에서 멀티 터널 검토 |
| R3 | **cloudflared idle timeout (~20~30초)** | Medium | Medium | 25초 주기 heartbeat ping 필수 + 학생 재연결 지수 백오프 |
| R4 | **인증 부재로 외부인이 URL로 Y.Doc 덮어쓰기** | High | Low~Medium | URL 토큰 + 세션 코드 이중 검증, 최대 연결 수 제한(기본 50) |
| R5 | **교실 WiFi AP 30동시 WebSocket 병목** | Medium | Medium | 지수 백오프 재연결, 교사 PC LAN 직접 접속 URL을 2차 대안으로 제공 (Phase 2) |
| R6 | **자동 저장 누락 시 PC 크래시로 전체 데이터 유실** | High | Medium | 30초 주기 + `before-quit` 동기 저장 + 세션 종료 시 Y.js `encodeStateAsUpdate` 한 번 더 |
| R7 | **Excalidraw CDN 장애** (unpkg 단일 의존) | Medium | Low | `unpkg` → `jsdelivr` fallback `<script>` 이중 선언, 버전은 정확히 고정 |
| R8 | **CSS 해킹이 Excalidraw 마이너 업데이트로 깨짐** (Phase 1b) | Medium | Medium | `@excalidraw/excalidraw` 버전 정확 고정, 업데이트 시 CSS 점검 체크리스트 운영 |
| R9 | **`api.resetScene()`이 Y.Doc에 "전체 삭제" 전파 → 타인 캔버스 초기화** (Phase 1b 페이지 시스템) | High | Medium | **페이지별 독립 Y.Doc** 아키텍처로 구조적 해결 (페이지 전환 = Doc 교체) |
| R10 | **iPad+Pencil 사용 시 손바닥 터치로 오작동** | Medium | High (태블릿 사용자에) | Phase 1b에서 `pointerType` 필터링, Pencil 우선 모드 스위치 |
| R11 | **PIPA: WebSocket 서버가 학생 IP를 로깅** | High | Low | `ws` 연결 이벤트에서 IP를 **메모리에도 저장하지 않음**, 로그에 남기지 않음 |
| R12 | **Phase 1a 범위 과다로 2~3주 초과** | Medium | Medium | 스파이크 선행(1.5일) 후 재견적, Phase 1b를 별도 릴리즈로 분할하는 현 계획 유지 |
| R13 | **챗봇이 기존 답변에서 "협업 보드 없음"이라 답변 지속** | Medium | High | 릴리즈 직후 `ingest-chatbot-qa.mjs`에 협업 보드 Q&A 덮어쓰기, "없음" 문구 제거 |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level | 특성 | 권장 | 선택 |
|-------|-----|-----|:---:|
| **Starter** | 단순 구조 | 정적 사이트 | ☐ |
| **Dynamic** | 기능 모듈·BaaS | 풀스택 웹앱 | ☑ |
| **Enterprise** | 엄격 레이어·DI·마이크로서비스 | 대규모 시스템 | ☐ |

쌤핀은 **Clean Architecture 4-layer(Dynamic 상위)**. 본 기능은 **모든 레이어를 건드리는 첫 대형 기능**이므로 레이어 경계를 엄격히 유지해야 한다(기존 라이브 도구는 `electron/ipc/*`에만 집중되어 있어 레이어 매핑이 약했던 편).

### 6.2 Key Architectural Decisions

| 결정 | 옵션 | 선택 | 근거 |
|-----|-----|-----|-----|
| 캔버스 엔진 | Excalidraw / fabric.js 자체 구현 / tldraw | **Excalidraw `0.17.6`** | MIT·React 임베드·y-excalidraw 2.0.12 바인딩(스파이크 검증)·Jamboard 유사 UX 달성 공수 최저. **0.18 미채택 이유**: y-excalidraw peerDeps `^0.17.6`이 0.18 제외. tldraw는 상용 비호환, fabric 자체 구현은 6~8주 추가 |
| **학생 번들 전략** | CDN 로드 / Vite 빌드 + extraResources / 인라인 문자열 | **CDN 로드** | 기존 인라인 HTML 패턴 유지 → Blocker 1건 제거. 터널 자체가 인터넷 전제이므로 CDN 의존 실질 무영향. unpkg+jsdelivr 이중화로 장애 대비 |
| 실시간 동기화 | Y.js + WebSocket / y-webrtc / Operational Transform 자체 구현 | **Y.js + WebSocket** | CRDT 자동 병합, 교사 PC 중계로 30명 안정적, 시그널링 서버 불필요 |
| WebSocket 서버 | y-websocket 패키지 / `ws` 직접 사용 | **`ws` 직접 사용** | y-websocket Electron ESM/CJS 충돌 이슈 보고 다수, `ws`는 이미 프로젝트에 존재 |
| 터널 동시성 | 멀티 터널 지원 / 상호 배타 스위치 | **상호 배타 (Phase 1a)** | 구현 비용 1/10, UX로도 "한 번에 하나의 활동"이 교실에 더 자연스러움. 멀티는 Phase 2+에서 재검토 |
| 인증 방식 | 없음 / URL 토큰 / 세션 코드 / 둘 다 | **URL 토큰 + 세션 코드 이중** | 토큰만은 URL 유출 시 취약, 코드만은 공유 번거로움. 병행이 최저 비용 최대 방어 |
| 데이터 저장 | IndexedDB만 / Electron 파일만 / 둘 다 | **Electron 파일(`userData/data/boards/`)** | 브라우저 모드는 개발용, 프로덕션은 Electron 단독. `Y.encodeStateAsUpdate` 바이너리 저장 |
| 자동 저장 주기 | 즉시(변경마다) / 10초 / 30초 | **30초 + before-quit** | 변경마다는 디스크 과부하, 30초는 "교사 크래시 시 1교시 분량 활동 중 최대 30초 손실" 허용치 |
| Clean Architecture 경계 | 단일 파일 / 4-layer 엄격 | **4-layer 엄격** | CLAUDE.md 요구사항. 5개 라이브 도구가 `electron/ipc/*` 단일 파일 중심이었던 것을 본 기능부터 교정 |
| 페이지 시스템(Phase 1b) | 단일 Y.Doc + 페이지 메타데이터 / **페이지별 Y.Doc** | **페이지별 Y.Doc** | 단일 Doc에서 `resetScene` 전파로 타인 캔버스 초기화되는 버그 회피 |

### 6.3 Clean Architecture Approach

```
선택 레벨: Dynamic (Clean Architecture 4-layer)

영향 레이어 (Phase 1a):
┌─────────────────────────────────────────────────────────────┐
│ infrastructure/                                             │
│   - board/                                        ➕        │
│     - YDocBoardServer.ts         (ws + Y.js 서버 래퍼)      │
│     - BoardFilePersistence.ts    (Y.encodeStateAsUpdate 저장) │
│     - BoardTunnelCoordinator.ts  (tunnel.ts 상호 배타 스위치) │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ adapters/                                               │ │
│ │   components/Tools/Board/                     ➕        │ │
│ │     - ToolCollabBoard.tsx     (쌤도구 진입 컴포넌트)    │ │
│ │     - BoardSessionPanel.tsx   (QR/코드/접속자 카운터)   │ │
│ │     - BoardControls.tsx       (시작/종료/저장 버튼)     │ │
│ │   repositories/                                ➕        │ │
│ │     - FileBoardRepository.ts  (IBoardRepository 구현)  │ │
│ │   stores/                                      ➕        │ │
│ │     - useBoardStore.ts        (보드 목록 CRUD)          │ │
│ │     - useBoardSessionStore.ts (실시간 세션 상태)        │ │
│ │   di/container.ts                              ✏️        │ │  ← BoardRepository 조립
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │ usecases/board/                             ➕       │ │ │
│ │ │   - ManageBoard.ts           (목록 CRUD)            │ │ │
│ │ │   - StartBoardSession.ts     (서버·터널 기동)       │ │ │
│ │ │   - EndBoardSession.ts       (정리·저장)            │ │ │
│ │ │   - SaveBoardSnapshot.ts     (Y.js update 저장)     │ │ │
│ │ │ ┌─────────────────────────────────────────────────┐ │ │ │
│ │ │ │ domain/                                 ➕       │ │ │ │
│ │ │ │   entities/Board.ts                              │ │ │ │
│ │ │ │   entities/BoardParticipant.ts                   │ │ │ │
│ │ │ │   entities/BoardSession.ts                       │ │ │ │
│ │ │ │   valueObjects/BoardSessionCode.ts               │ │ │ │
│ │ │ │   valueObjects/BoardAuthToken.ts                 │ │ │ │
│ │ │ │   rules/boardRules.ts  (이름 검증·중복 규칙)     │ │ │ │
│ │ │ │   repositories/IBoardRepository.ts               │ │ │ │
│ │ │ └─────────────────────────────────────────────────┘ │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ electron/                                                   │
│   ipc/board.ts              ➕  (registerBoardHandlers)     │
│   preload.ts                ✏️  (window.api.board.* 확장)    │
└─────────────────────────────────────────────────────────────┘

의존성 방향:
  domain ← usecases ← adapters ← infrastructure
  (Y.js·ws·cloudflared는 infrastructure에만, domain은 순수 TypeScript)
```

### 6.4 IPC 인터페이스 설계 (요약)

`window.api.board.*` 네임스페이스 신설:

| 메서드 | 방향 | 목적 |
|-------|------|-----|
| `board.startSession(boardId)` | R→M | 서버 기동, QR·URL·코드 반환 |
| `board.endSession(boardId)` | R→M | 서버 종료, 최종 저장 |
| `board.getActiveSession()` | R→M | 현재 실행 중 세션 조회 (터널 상호 배타 판정용) |
| `board.saveSnapshot(boardId)` | R→M | 수동 저장 트리거 |
| `board.listBoards()` | R→M | 저장된 보드 목록 |
| `board.deleteBoard(boardId)` | R→M | 보드 삭제 |
| `board.onParticipantChange` | M→R | 학생 접속/이탈 이벤트 구독 |
| `board.onAutoSave` | M→R | 자동 저장 완료 알림 |

※ 기존 `liveMultiSurvey` 등과 **동일한 네이밍·시그니처 스타일**을 따른다.

### 6.5 실시간 동기화 프로토콜 (요약)

```
[학생 브라우저]                              [교사 Electron]
    │                                            │
    │─ GET /?t=<token>&code=<code> ────────────▶│
    │◀── 인라인 HTML (CDN <script> 포함) ────────│
    │                                            │
    │─ WS CONNECT /ws?t=<token>&code=<code> ───▶│
    │                                        인증 검증
    │◀── { type: 'sync-init', state: <binary>} ─│
    │                                            │
    │═══ Y.js CRDT 메시지 양방향 ══════════════▶│
    │                                            │
    │─ ping (25s) ──────────────────────────────▶│  (heartbeat)
    │◀────────────────────────────────────── pong │
```

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] `CLAUDE.md` Clean Architecture 4-layer 의무
- [x] `tsconfig.json` strict 모드 + path alias
- [x] Tailwind 디자인 토큰 (sp-* 시리즈)
- [x] material-symbols-outlined 아이콘
- [x] `electron/ipc/*.ts` 파일별 `registerXxxHandlers(mainWindow)` 패턴 (5개 라이브 도구 선례)
- [x] 한국어 UI, `any` 금지

### 7.2 Conventions to Define/Verify

| 카테고리 | 현 상태 | 정의할 내용 | 우선순위 |
|---------|--------|-----------|:-------:|
| **보드 파일 포맷** | — | `.ybin` 확장자, `Y.encodeStateAsUpdate(doc)` 바이너리 | High |
| **보드 저장 경로** | — | `userData/data/boards/{boardId}.ybin` + 메타데이터 `{boardId}.json` | High |
| **세션 코드 포맷** | — | 6자리 대문자 영숫자 (헷갈리는 0/O, 1/I 제외) | High |
| **URL 토큰 포맷** | — | `crypto.randomBytes(16).toString('hex')` 32자리 | High |
| **컴포넌트 네이밍** | PascalCase | `ToolCollabBoard`, `Board*` prefix | High |
| **Store 네이밍** | useXxxStore | `useBoardStore`, `useBoardSessionStore` | High |
| **IPC 네임스페이스** | `window.api.{tool}` | `window.api.board.*` | High |
| **아이콘** | material-symbols | `co_present`(보드 메뉴), `qr_code_2`(QR), `lock`(잠금·Phase 2) | Medium |
| **학생 브라우저 에러 텍스트** | — | "다시 연결 중...", "교사의 기기가 꺼진 것 같아요" 등 통일 | Medium |

### 7.3 Environment Variables Needed

환경 변수 추가 불필요. 모든 설정은 런타임 파라미터(port, tunnel URL 등).

### 7.4 Pipeline Integration

9-phase 파이프라인 미적용 프로젝트. 기존 PDCA Plan → Design → Do → Analyze → Report 플로우.

---

## 8. Spike Plan (착수 전 필수)

Phase 1a 본 구현 **착수 전 1.5일** 스파이크로 핵심 불확실성 3건을 제거한다. 어느 하나라도 실패 시 방향 수정 후 재계획.

| # | 스파이크 | 기간 | 결과 | 성공 기준 | 실패 시 대안 |
|---|---------|------|------|---------|------------|
| S1 | y-excalidraw 호환 확인 | 1.0일 | ✅ **PASS** (2026-04-19) | 로컬에서 Excalidraw + Y.Doc 바인딩 시 두 브라우저 탭 간 실시간 동기화 동작 | ~~자체 바인딩~~ 불필요. 단 버전은 `0.17.6`으로 고정 |
| S2 | 터널 상호 배타 PoC | 0.5일 | ✅ **PASS** 18/18 (2026-04-19) | 이미 투표 도구가 실행 중일 때 보드 시작 시도 → Toast로 차단 성공, 그 반대 방향도 대칭 동작 | ~~멀티 터널 리팩터링~~ 불필요. `BoardTunnelCoordinator` 래퍼로 해결 |
| S3 | CDN 로드 동작 확인 | 스파이크 S1에 포함 | ✅ **PASS** (S1 포함) | 학생 HTML 문자열 안에 esm.sh CDN으로 로드해 브라우저에서 정상 렌더 | ~~extraResources 번들링~~ 불필요 |

스파이크 산출물:
- [spikes/collab-board/SPIKE-RESULT.md](../../../spikes/collab-board/SPIKE-RESULT.md) — 종합 결과 보고서
- [spikes/collab-board/s1-cdn-poc/](../../../spikes/collab-board/s1-cdn-poc/) — 재실행 가능한 CDN POC
- [spikes/collab-board/s2-tunnel-mutex/](../../../spikes/collab-board/s2-tunnel-mutex/) — coordinator 프로토타입 + 단위 테스트

---

## 9. Next Steps

1. [ ] 스파이크 S1/S2 실행 (1.5일)
   - [ ] S1 결과에 따라 y-excalidraw 채택 or 자체 바인딩 결정
   - [ ] S2 결과로 `BoardTunnelCoordinator.ts` 설계 확정
2. [ ] 설계 문서 작성 (`/pdca design collab-board`)
   - [ ] `Board`/`BoardSession`/`BoardParticipant` 엔티티 스키마
   - [ ] `IBoardRepository` 포트 인터페이스
   - [ ] `ManageBoard`/`StartBoardSession`/`EndBoardSession`/`SaveBoardSnapshot` 유스케이스 시그니처
   - [ ] `registerBoardHandlers` IPC 메시지 포맷
   - [ ] 자동 저장 시퀀스 다이어그램
   - [ ] 터널 상호 배타 상태 기계
   - [ ] 인증 프로토콜 (토큰 발급 → 검증 흐름)
3. [ ] 구현 착수 (`/pdca do collab-board`)
   - Phase 1a 예상 기간: 스파이크 제외 **2.5~3주** (1인 기준)
4. [ ] PDCA `analyze` Match Rate ≥ 90% 확인 후 Phase 1b 착수 결정

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-19 | 구현 계획서(0페이지) + 1차 리뷰 + 대화 결정(CDN 로드 A안) 기반 초안 | pblsketch |
| 0.2 | 2026-04-19 | 스파이크 결과 반영: Excalidraw `0.17.6` 고정, R1 리스크 해소, y-excalidraw setupUndoRedo 버그 회피(undoManager 옵션 생략), CRDT 통합 Undo는 Phase 2로 유예 | pblsketch |
