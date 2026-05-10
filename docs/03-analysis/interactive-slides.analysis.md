---
template: analysis
version: 0.1
feature: interactive-slides
date: 2026-05-10
author: bkit:gap-detector (Plan/Design vs implementation 대조)
project: ssampin
plan: docs/01-plan/features/interactive-slides.plan.md
design: docs/02-design/features/interactive-slides.design.md
matchRate: 88
phase1ReleaseGate: NOT_PASSED
---

# interactive-slides — Gap Analysis (PDCA Check)

> Plan v2 + Design v0.1 대비 구현 매핑 결과. **Match Rate 88%** — Phase 1 출시 게이트 90%에 2%p 부족.
> 출시 차단 P0 갭 3건 + 권장 P1 갭 7건. P0만 처리해도 ~94%로 도달 예상.

---

## A. 종합 Match Rate

**88% / 100%**

| 게이트 | 결과 |
|------|------|
| Phase 1 출시 게이트 (≥90%) | ❌ NOT YET PASSED (88%, 2%p 부족) |
| 이후 시나리오 | P0 3건 처리 → ~94% 추정 → 출시 게이트 통과 |

P0 갭은 **출시 차단**이지만 모두 명확한 wiring 작업 (sidebar 등록 / LAN IP 탐지 / sweep 스케줄러). 도메인·UseCase·WS 프로토콜은 모두 완전 구현됨.

---

## B. 카테고리별 Match Rate

| 카테고리 | Match Rate | 상태 | 비고 |
|---------|:---------:|:---:|------|
| Domain (entities/rules/ports/value objects) | **100%** | ✅ Complete | 9 entities, 7 branded IDs, 5 ports, 모든 rules 구현 |
| UseCases (10종) | **100%** | ✅ Complete | 모두 구현. AggregateResponses는 의도적으로 `overlayRules.ts`에 배치 |
| Infrastructure | **80%** | ⚠️ Partial | GoogleSlidesApiClient/LocalImageCacheRepository/JsonInteractiveLessonRepository 완비. **PDF render IPC 미구현** + **Cloudflared 터널 핸들러 미구현** |
| Adapters (stores, components, repos) | **90%** | ⚠️ Mostly | 모든 UI/스토어/repo 존재. **`beginPresentation`이 no-op** (lobby→active 메인 측 IPC 미구현) |
| UI (Editor / Lobby / Presenter / Student) | **85%** | ⚠️ Mostly | 디자인 시스템 준수. **LAN URL 'localhost' 하드코딩** (학생 폰 접속 불가) + PDF 버튼 stub |
| WS Protocol | **100%** | ✅ Complete | 13건 메시지 + Zod 스키마 완비 |
| Security & PIPA (§11) | **75%** | ⚠️ Partial | studentToken 서버 발급/바인딩/upsert/late-join 정보 최소화/익명화/shortCode entropy 모두 PASS. **180일 sweep 스케줄러 미연결** + firstRun 자체진단 미구현 |
| Metatests (MT-1~MT-7) | **57%** (4/7) | ⚠️ Partial | MT-1/MT-3/MT-6/MT-7 PASS. **MT-2/MT-4/MT-5 미구현 또는 path bug** |
| Student SPA | **100%** | ✅ Complete | main.tsx/App.tsx/wsClient.ts/4 pages/3 response components 모두 구현 |

---

## C. 갭 리스트 (우선순위순)

### P0 — 출시 차단 (Must Fix Before Phase 1 Release)

| ID | 갭 | 출처 | 구현 위치 / 부재 | 수정 가이드 |
|----|---|------|--------------|-----------|
| **P0-1** | ToolInteractiveSlides가 toolRegistry / App.tsx에 등록 안 됨 — 도구 진입 불가 | Design §1 S8 ("사이드바 진입 + 도구 카드 등록") | `src/adapters/components/Tools/toolRegistry.ts` 미등록; `src/App.tsx` 라우트 없음 | `{ id: 'tool-interactive-slides', name: '인터랙티브 슬라이드', emoji: '🎞️', component: ToolInteractiveSlides, prefersWide: true }` 추가 + App.tsx 라우트 (ToolPoll 패턴 미러링) |
| **P0-2** | LAN URL 'localhost' 하드코딩 — 학생 폰 접속 불가 | Plan §3 + Design §0.2; F4 인수 기준 "5분 내 학생 폰 접속 성공률 ≥ 95%" | `LessonLobby.tsx:439-443` `getLocalIpHint()` returns 'localhost' | IPC `slides-session:get-local-ip` 추가 in `electron/ipc/interactiveSlides.ts` using `os.networkInterfaces()` (IPv4, non-internal). 다중 NIC ≥2일 때 선택 모달 (Plan §10) |
| **P0-3** | 180-day PIPA sweep 스케줄러 부재 — `PurgeExpiredSessions` 정의돼 있으나 호출 사이트 없음 | Plan §11.1 (P0 법적 요건); Design §10.1 ("매일 0시 setInterval") | UseCase는 있음. `electron/main.ts` / `electron/ipc/interactiveSlides.ts`에 `setInterval` 호출 부재 | `registerInteractiveSlidesHandlers()` 안에서 `setInterval(24h)` + 시작 시 1회 즉시 실행. clock 주입 단위 테스트 추가 |

### P1 — 출시 전 권장 (Should Fix Before Phase 1)

| ID | 갭 | 출처 | 수정 가이드 (요약) |
|----|---|------|------------------|
| **P1-1** | PDF 소스 미구현 — UI "곧 지원" stub, `slides:render-pdf` IPC 부재 | Plan §2 F1-2 (P0); Design §5.2 | `slidesSource.ts`에 IPC 추가, pdfjs-dist N페이지 렌더 + `LocalImageCacheRepository.store` per page. 50MB / 100페이지 cap |
| **P1-2** | 터널 모드 main 처리 부재 — `accessMode='tunnel'` 선택해도 cloudflared 미시작 | Plan §11.3 + 기존 도구 패턴 | `slides-session:tunnel-start` IPC 추가 (`liveMultiSurvey.ts:865` 미러링). `slides-session:start` 안에서 자동 호출. close 시 cleanup |
| **P1-3** | `teacher-disconnected`/`teacher-reconnected` broadcast 부재 | Plan §3 WS messages; Design §7.4 sequence | 60초 grace 타이머 (BrowserWindow `closed` 또는 renderer heartbeat). 만료 시 broadcast + 자동 end-lesson `reason: 'teacher-timeout'` |
| **P1-4** | `beginPresentation` no-op — lobby→active 메인 측 IPC 미구현 | Design §8.2 | IPC `slides-session:begin-presentation` 추가. `transitionSessionToActive` rule 호출 + `sessionRepo.saveSession` |
| **P1-5** | MT-2 메타테스트 미구현 (`overlayRules.ts:69` 코드 코멘트만) | Plan §13.1 | 모든 OverlayType variant가 `aggregateResponses` switch에 case 존재함을 grep으로 확인 |
| **P1-6** | MT-7 path bug — `src/adapters/sync/syncRegistry.ts` (존재 X) 검사 → 사실상 silent skip | Plan §13.1 | `src/usecases/sync/syncRegistry.ts`로 경로 정정. 실제 검사하도록 silent-skip 제거 |
| **P1-7** | `scripts/load-test-slides.mjs` 부재 — 부하 테스트 인프라 없음 | Plan §13.2 (P0 NFR); Design §11.1 | `load-test-realtime-wall-v2-1.mjs` 미러링. 40명 동시, slide-advance RTT, 5초 응답 burst, P95 < 300ms 단언 |

### P2 — Phase 2 / Nice-to-Have

| ID | 항목 | 비고 |
|----|------|------|
| P2-1 | PNG magic-byte 검증 | Phase 2 F11 (drawing). 현재 Zod string-length만 |
| P2-2 | firstRun LAN 자체 진단 토스트 | Plan §11.7 |
| P2-3 | revisionId 변경 토스트 | API 데이터 있으나 UI 미연결 |
| P2-4 | MT-4 마이그레이션 메타테스트 | `LessonSessionSnapshot.schemaVersion` 활용 |
| P2-5 | MT-5 LAN URL nav-guard 화이트리스트 | Plan 표현 모호 → drop 또는 명확화 권장 |
| P2-6 | 빈 프레젠테이션(0장) 거부 | F1 인수 기준. `slidesSource.ts`에서 추가 검증 |
| P2-7 | `useChalkCanvas → useFabricOverlay` 추출 | Phase 2 F11 작업 |
| P2-8 | Drawing 90° 회전 캔버스 (세로 폰) | Phase 2 F11 작업 |

---

## D. 자동 검증 결과 (코드 inspection 기반)

### 정적 아키텍처 준수 — 위반 0건

- `domain/`은 외부 의존 0 (grep 검증)
- `usecases/interactiveSlides/`에 `@adapters` / `@infrastructure` import 0건
- `adapters/components/Tools/InteractiveSlides/`에 `@infrastructure` import 0건

### 테스트 파일 (15개, feature 관련)

- Domain: `overlayRules.test.ts`
- UseCases: `EndLessonSession.test.ts`, `RestoreLateJoinState.test.ts`, `SubmitStudentResponse.test.ts`, `ManageInteractiveLesson.test.ts`
- Infrastructure: `GoogleSlidesApiClient.test.ts`, `LocalImageCacheRepository.test.ts`, `JsonInteractiveLessonRepository.test.ts`
- Adapters: `MemoryLiveResponseStore.test.ts`
- Electron: `interactiveSlides.test.ts`, `slidesSource.test.ts`
- Shared: `interactiveSlides.test.ts`, `interactiveSlides.metatests.test.ts`, `googleSlidesUrl.test.ts`

### 메타테스트 매트릭스

| ID | 상태 | 증거 |
|----|:---:|------|
| MT-1 | ✅ PASS | `interactiveSlides.test.ts:174` — 6 client types 검증 |
| MT-2 | ❌ MISSING | 코드 코멘트만 (`overlayRules.ts:69`) |
| MT-3 | ✅ PASS | `interactiveSlides.metatests.test.ts:38` — PROTOCOL_VERSION + import path |
| MT-4 | ❌ MISSING | 마이그레이션 자동 테스트 없음 |
| MT-5 | ❌ MISSING / N/A | LAN URL 가드 의미 모호 |
| MT-6 | ✅ PASS | `interactiveSlides.metatests.test.ts:20` — 3개 outDir 모두 다름 |
| MT-7 | ⚠️ SOFT-PASS | path bug — `src/adapters/sync/syncRegistry.ts` (존재 X) 검사 → silent skip |

### 외부 자동 검증 (사용자 직접 실행 필요)

`npx tsc -b` + `npx vitest run`은 마지막 커밋 시점 (a55ab9a)에 **0 errors / 59 files / 912 tests** 통과 확인됨 (회귀 0건).

---

## E. 수동 검증 필요 항목 (Plan §13.3)

본 항목들은 Plan §13.3 출시 게이트 Must / Should 중 자동화 불가 영역:

1. **F1 acceptance** — 실제 공개 Google Slides URL 30장 첫 로드 < 3초 + revisionId 변경 토스트
2. **F1-2** (P1-1 처리 후) — 50MB 거부, 100페이지 경고, 암호화 PDF 거부
3. **F2** — 키보드 ←/→ 단축키 + 첫/마지막 슬라이드 비활성
4. **F3-1** — "닫고 새로 만들기" 위치/크기/타입 복제 + 편집 패널 자동 오픈
5. **F4 LAN** (P0-2 처리 후) — 5분 내 학생 폰 2대 접속 성공률 ≥ 95%
6. **F4 tunnel** (P1-2 처리 후) — 실제 인터넷 디바이스
7. **F5 lobby copy 분기** — lobby vs active 카피 분기
8. **F6 P95 < 500ms slide-change with 40 students** — `scripts/load-test-slides.mjs` 필요 (P1-7)
9. **F7 P95 < 300ms response burst, 합계=40** — 같은 스크립트
10. **F8-2 익명화** — 종료 후 "학생1, 학생2..." 검증
11. **dogfood** — 실제 학생 10+, 20분 수업, design examples/ 시각 spot-check, iOS Safari/Galaxy A34

---

## F. 권장 다음 단계

Match Rate 88% < 90% → 자동 개선 트리거.

### Sprint 1 (P0, 1~2일) — Match Rate ~94% 도달 예상

1. P0-1 toolRegistry / App.tsx 등록
2. P0-2 `slides-session:get-local-ip` IPC + `getLocalIpHint()` 교체
3. P0-3 daily `setInterval(24h)` → `PurgeExpiredSessions` 호출

### Sprint 2 (P1, 3~5일) — Phase 1 게이트 통과 + 출시 가능

4. P1-1 PDF render IPC + UI wiring
5. P1-2 터널 시작/정리 IPC
6. P1-3 teacher-disconnected/reconnected
7. P1-4 `beginPresentation` IPC
8. P1-5 MT-2 자동 메타테스트
9. P1-6 MT-7 path 정정
10. P1-7 `scripts/load-test-slides.mjs` + 40명 P95 측정

### Sprint 3 (Phase 2 별도 PDCA)

P2-1 ~ P2-8 + F9~F16 (drawing/wordcloud/draggable/Q&A/Excel/template)

### 문서 정합성 정리 (Match Rate ≥90% 후)

- IPC 채널 naming: Design §5.2 `slides:fetch-from-google` / `slides:render-pdf` → 실제 `slides-source:` prefix 반영
- MT-5 wording 명확화 또는 drop
- `IInteractiveLessonRepository`가 `repositories/`에 있는 이유 명시 (template repo vs runtime port 분리)

---

## 핵심 파일 참조

- Plan: [docs/01-plan/features/interactive-slides.plan.md](../01-plan/features/interactive-slides.plan.md)
- Design: [docs/02-design/features/interactive-slides.design.md](../02-design/features/interactive-slides.design.md)
- Lobby (P0-2 위치): [src/adapters/components/Tools/InteractiveSlides/Lobby/LessonLobby.tsx#L439-L443](../../src/adapters/components/Tools/InteractiveSlides/Lobby/LessonLobby.tsx)
- Editor (P1-1 stub): [src/adapters/components/Tools/InteractiveSlides/Editor/LessonEditor.tsx#L280-L282](../../src/adapters/components/Tools/InteractiveSlides/Editor/LessonEditor.tsx)
- Tool Registry (P0-1): [src/adapters/components/Tools/toolRegistry.ts](../../src/adapters/components/Tools/toolRegistry.ts)
- Main IPC (P0-3 추가 위치): [electron/ipc/interactiveSlides.ts](../../electron/ipc/interactiveSlides.ts)
- Metatest (P1-6 path bug): [src/shared/wsProtocol/interactiveSlides.metatests.test.ts#L60](../../src/shared/wsProtocol/interactiveSlides.metatests.test.ts)
