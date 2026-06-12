# Plan: 협업 보드 외부 참고 도구 RB Parity (Standard PASS set) — iter3 (Final Polish)

<!-- iter3: Planner final polish post Architect APPROVED 9/10 + Critic APPROVED 9/10. Three Critic weaknesses accepted (W1, W2, W4). W3, W5 absorbed into design-stage. See §10 Changelog iter3. -->

## Consensus Status (Final)

- **RALPLAN-DR Mode**: Short
- **Iterations**: 3 (Planner draft → Architect REVISE → Planner iter2 → Architect APPROVED 9/10 → Critic APPROVED 9/10 → Planner iter3 polish)
- **Architect Score**: 9/10
- **Critic Score**: 9/10
- **Quality Score (Average)**: 9.0/10
- **5-Criterion Breakdown** (Critic): Principle-Option 9 / Alternatives 9 / Risk 9 / AC 8.5 / Verification 9.5
- **Status**: **PDCA-0.5 Spike COMPLETE (2026-05-22)** — SP-1 PASS / SP-2 PASS / SP-3 CONDITIONAL (33→50ms 보수화로 PASS). AC cascade applied (AC-1.5/3.1/6.1/6.5). PDCA-1 진입은 별도 사용자 명시적 승인 필요.
- **Approved For**: PDCA-1 진입 준비 완료. 본 plan revision은 spike 결과 반영 문서 수정만. 실제 도메인 코드 변경은 별도 사용자 승인 필요.
- **Spike Synthesis**: [.omc/spikes/synthesis-report.md](e:/github/ssampin/.omc/spikes/synthesis-report.md)

## Metadata

- **Plan ID**: collab-board-rb-parity
- **Mode**: RALPLAN-DR Short Mode (--direct, consensus refinement, iter2)
- **Source Spec**: `.omc/specs/deep-interview-collab-board-rb.md` (Final Ambiguity 24%, 8 라운드)
- **Project**: 쌤핀 (SsamPin) — Electron + React 18 + TypeScript strict + Tailwind + Zustand + Yjs 13.x
- **Target Coverage**: 외부 참고 도구 RB 스페이스 60~70% 사용성
- **PDCA Count**: **11 단계** (PDCA-0.5 Spike 추가, PDCA-1 ~ PDCA-10, optional PDCA-11~12 polish) <!-- iter2: Spike 분리 -->
- **Authors**: Planner (RALPLAN-DR iter2), pending Architect + Critic re-review

---

## 1. Requirements Summary

### 1.1 5 Active Components (deep-interview Round 0 확정)

| #   | Component                     | 핵심 산출물                                                                                                                              |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| (1) | 캔버스 엔진 & 핵심 도구 1급화 | Excalidraw 0.17.6 유지 + 스티커(작성자 라벨 자동) + **도형 native 9종 + 시각 동등 3종** + 텍스트/이미지/파일/URL + snap-to-grid + 미니맵 |
| (2) | 학습 활동 템플릿 라이브러리   | 만다라트 9×9 / 조별활동 6컬러 / 브레인스토밍 사분면 / 도형 다이어그램 + "내 템플릿" 저장 (L1+L2)                                         |
| (4) | 권한·모드·실시간 시스템       | 권한 3단계(읽기·작성·편집) + 나만보기 + **adaptive awareness throttle** (idle 250ms / drawing 33ms)                                      |
| (5) | 공유·저장·내보내기            | 터널 유지 + URL/QR/6자리 입장코드 1클릭 + png + xlsx (닉네임 토글, **기존 exceljs 사용**)                                                |
| (7) | 프로젝트 홈 / 메타 관리       | 즐겨찾기 + 검색 + 4 액션(이름변경/복제/공유/삭제)                                                                                        |

<!-- iter2 R-2/R-3/R-7: native 9 + 시각 동등 3 / adaptive throttle / exceljs 명시 -->

### 1.2 Standard PASS Set 합격기준 (spec §Acceptance Criteria 일괄)

- (1) 스티커 + 도형 9 native + 3 visual-equiv + element 4종 + snap + 미니맵 (6 criteria)
- (2) 4종 템플릿 + 잠금 + 내 템플릿 (7 criteria)
- (4) 3단계 권한 + 나만보기 + adaptive awareness 25/35명 (7 criteria)
- (5) 공유 다이얼로그 + 자동저장 + png/xlsx (5 criteria)
- (7) 즐겨찾기 + 검색 + 4 액션 (5 criteria)
- **Total**: 30 testable criteria → PDCA-별로 분해 §4 참조

### 1.3 Non-Goals (재확인 — 절대 뒤집지 말 것)

- ❌ tldraw 4.x ($6,000/년 라이선스로 기각)
- ❌ 클라우드 전환 (옵션 B/C 모두 기각, 터널 유지)
- ❌ 마인드맵 3 레이아웃 (sub-deferral, React Flow Core 미래 후보)
- ❌ 집중모드 (focus mode, Round 6 awareness 우선 결정)
- ❌ 라이브러리 마켓플레이스 L3 (L1+L2만)
- ❌ 24 위젯 / 측정 도구 5종 / 폴더 / 휴지통 / PDF / 외부 LMS
- ❌ **freedraw stroke 폴백 도형** <!-- iter2 R-2: freedraw 는 locked 의미 깨짐 + Y.Doc 불안정 -->
- ❌ **30명 × 16ms 일률 throttle (52k msg/s)** <!-- iter2 R-3: cloudflared free tier 처리 불가, adaptive 로 대체 -->

---

## 2. RALPLAN-DR Summary

### 2.1 Principles (5)

1. **오프라인 우선 정체성 유지** — 쌤핀의 정체성은 "교사 PC에서 cloudflared 터널 + 학생 브라우저 접속". 클라우드/SaaS 전환을 유도할 수 있는 모든 결정(예: 서버측 템플릿 저장)을 거부한다. CLAUDE.md 도메인 규칙 + spec Round 1 결정 준수.
2. **기존 도메인 코드 호환성** — `src/domain/entities/{Board,BoardSession,BoardParticipant}.ts` + `src/domain/rules/boardRules.ts` 가 이미 안정적이다. **확장은 OK, 깨는 변경은 금지**. 신규 entity(StickyNote/Shape/TextElement/TemplateBundle/UserTemplate/Permission/PrivateMode/AwarenessCursor)는 추가하되 기존 시그니처는 보존. `Y.encodeStateAsUpdate()` 바이너리 호환 절대 유지.
3. **비개발자 사용자 인지 부하 최소화** — 사용자는 코딩을 모르는 교사 프로젝트 오너. 모든 신규 UI 텍스트 한국어, sp-\* 토큰만, `design examples/` 폴더 참조. RB 동등 ≠ RB 복제. 60~70% 사용성을 인지 부하 50% 이하로 달성.
4. **8~12 PDCA 내 완료, 짧은 vertical slice** — 각 PDCA는 도메인 → 인프라 → 어댑터 → 메타테스트 vertical slice. 매 PDCA마다 4종 검증 게이트(typecheck/lint/test/regression-check) 통과 필수. 절대 인프라만 먼저 다 만들고 UI를 나중에 X. **PDCA-0.5 Spike 는 예외 — 코드 머지 0, 검증 게이트 미적용** (R-1).
5. **AS-IS preserved, additive only — 단, controlled regression 1건은 명시적 rollback flag 동반** <!-- iter2 R-4 -->
   - 현재 main의 Phase 1a MVP(Step 8 수동 QA 대기)는 운영 중이라고 가정.
   - 모든 기존 기능(보드 시작/종료/저장, .ybin persistence, 30s autosave, app.before-quit hook, 50명 MAX_PARTICIPANTS, awareness polling 1s)을 회귀 없이 유지.
   - 신규 element는 Y.Doc의 별도 Y.Array/Y.Map로 격리 가능한 곳에 추가.
   - **유일한 controlled regression**: PDCA-6 `YDocBoardServer.ts:233` `awarenessPoll 1000ms → adaptive (idle 250ms / drawing 33ms)`. `BOARD_AWARENESS_POLL_MS` env var rollback flag + iter#5 dirty-flag 회귀 테스트 필수.

### 2.2 Decision Drivers (Top 3)

1. **라이선스 비용 0** — Excalidraw 0.17.6(MIT) + Y.js 13.x(MIT) + ws(MIT) + **exceljs ^4.4.0 이미 package.json:54 등재**(MIT). 어떤 라이브러리도 유료 라이선스를 도입하지 않는다. xlsx-js-style 신규 도입 불필요 (R-7).
2. **기존 Yjs 바이너리(.ybin) 호환** — `Y.encodeStateAsUpdate()` 로 저장된 기존 보드 파일이 신규 코드로 깨지지 않아야 한다. 신규 도구(스티커·도형 9 native)는 모두 Excalidraw element 확장이므로 자동 호환되지만, 신규 entity(TemplateBundle, UserTemplate, Permission)는 **Y.Doc 외부**(`userData/data/boards/templates/*.json`, `userData/data/boards/{id}.meta.json`)에 저장해 .ybin 포맷을 건드리지 않는다.
3. **8~12 PDCA 내 완료** — Spike + 10 본 PDCA = **11 단계**. 각 PDCA 평균 5~8시간(Spike 는 3~4h). 회귀 차단(메타테스트 + Zero Script QA)이 매 PDCA 끝에 들어가야 cumulative 회귀가 폭발하지 않는다.

### 2.3 Viable Options (3개 검토, 1개 선택)

#### Option A: **PDCA 단위 순차 (Vertical Slice) + 선행 Risk Spike** ✅ SELECTED <!-- iter2: PDCA-0.5 spike 통합 -->

각 PDCA = 도메인 → 인프라 → 어댑터 → 메타테스트 까지의 vertical slice. **PDCA-0.5 (3~4h, 코드 머지 0)** 가 가장 위험한 3개 가정을 사전에 검증한 뒤 PDCA-1(스티커) 부터 시작.

- **Pros**:
  - 매 PDCA 끝에 4종 검증 게이트 통과 → 회귀 위험 차단.
  - 사용자가 PDCA-별로 데모 가능 → 중간 피드백 루프 작동.
  - **PDCA-0.5 Spike** 가 R1/R2/R3 의 unverified assumption 을 사전 검증 → "Antithesis: happy-path slice" 비판을 흡수 (S-4).
  - CLAUDE.md "하나의 세션은 하나의 작은 작업 단위" 정책에 정합.
  - 다른 세션과 충돌 위험 최소(영역 격리).
- **Cons**:
  - 도메인 entity 일부(TemplateBundle, UserTemplate, Permission)는 PDCA-3, PDCA-5에서 도입되는데 PDCA-1, PDCA-2 어댑터에서 미리 import 할 수 없음 → 두 번의 컴포넌트 수정 발생 가능.
  - 디자인 토큰(sp-\*) 확장이 필요한 경우 PDCA-1에 한 번, PDCA-7에 한 번 → 디자인 시스템 PR 두 번.
  - Spike 3~4h 추가 → 총 일정 1 work-day 증가.

#### Option B: 도메인 레이어 우선 (Big Bang Domain)

PDCA-1 ~ PDCA-3 에서 모든 신규 entity/rule/port를 먼저 정의한 후 PDCA-4~ 어댑터 구현.

- **Pros**: 어댑터 한 번에 깔끔하게 구현 가능. 도메인 테스트 부담이 처음에 몰림.
- **Cons**: "vertical slice 우선" 원칙(Principle 4) 위반. 3 PDCA 동안 사용자가 볼 수 있는 UI 변경 0.
- **기각 사유**: spec §Acceptance Criteria 가 모두 UI/사용자 가시 기준이라 도메인 단독 PDCA로 합격기준 통과를 표현할 수 없다.

#### Option C: UI 레이어 우선 (Mocked Adapter First)

어댑터를 mock data 로 먼저 구현해 사용자에게 데모 → 도메인은 나중에 채워넣기.

- **Pros**: 사용자 가시 결과물 즉시. 디자인 시스템 확장이 한 PDCA로 모임.
- **Cons**: mock → real 전환 시 두 번의 어댑터 수정 발생. TypeScript strict + `any` 금지 위반 위험.
- **기각 사유**: Principle 2 + CLAUDE.md `any` 금지와 충돌.

### 2.4 Invalidation Rationale (Option B, C)

Option B 와 C는 둘 다 단일 사이클로 보면 더 효율적이지만, spec Round 7에서 사용자가 "Standard PASS set" 을 선택한 시점에서 합격기준이 모두 사용자-가시 UI 기준이 되었다. 도메인-우선(B)는 PDCA 1~3 동안 합격기준 0 통과. UI-우선(C)는 mock 데이터로 합격기준을 통과시킬 수 있지만 "동작 = 토스트가 아니라 파일 바이트"(MEMORY.md feedback_runtime_verification.md) 정책 위반. 따라서 **Option A 외에는 viable 하지 않다**.

### 2.5 Antithesis Absorption (iter2 신규) <!-- iter2 S-4 -->

**Architect 가 iter1에서 제기한 strongest antithesis**: "Option A는 사실 happy-path slice일 뿐. 가장 위험한 부분(customData 동기화·30명 awareness 부하·locked element 동기)을 PDCA-10 까지 미루는 것은 vertical slice 의 정신에 어긋남."

**흡수 방법**: PDCA-0.5 **Risk-First Spike** 를 PDCA-1 앞에 삽입. Spike 의 산출물은 (a) 검증 보고서 + (b) **PDCA-1~6 의 rollback criteria 활성화 여부 결정**. Spike 결과가 "fail" 이면 plan 의 PDCA-1, -3, -6 acceptance criteria 가 동적으로 조정된다. 코드 머지 없음 → controlled regression Principle 5 위반 X.

### 2.6 Tradeoff Tensions (iter2 신규) <!-- iter2 S-5 -->

| Tension                                             | A side                                             | B side                                                          | Resolution                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Awareness 실시간성 ↔ cloudflared 무료 터널 부하** | 16ms throttle 로 자연스러운 커서                   | 250ms throttle 로 안정 동작                                     | **Adaptive throttle**: idle 250ms / drawing **50ms** + UI 가이드 "권장 25명, 안전 35명". **SP-3 측정 (2026-05-22)**: 25c/50ms p99=36ms, 30c/50ms p99=38ms, 35c/250ms p99=47ms. 33ms 시도 → 25c/33ms p99=617ms (6× over), 30c/33ms p99=2512ms (saturation cliff) 로 기각. **병목은 cloudflared 부하 아니라 single-threaded Node.js event loop fan-out**. |
| **Template lock 신뢰 ↔ 구현 비용**                  | 클라이언트 신뢰 (UI lock 만, 비용 작음, 보안 약함) | Y.Doc-level immutability via Y.Type observer (비용 크지만 안전) | **클라이언트 신뢰 채택** — 쌤핀은 폐쇄 환경(교사 PC + 학생 브라우저), 학생 악의 공격 시나리오 낮음. ADR Consequences 명기 (R-5).                                                                                                                                                                                                                        |
| **Risk-First Spike 추가 ↔ 일정 1 day 증가**         | PDCA-1 즉시 시작 (속도)                            | PDCA-0.5 spike 로 unknown unknowns 사전 노출 (안정)             | **Spike 채택** — Architect 의 antithesis 흡수 + 후속 6 PDCA 의 rework 위험 차단 (R-1, S-4).                                                                                                                                                                                                                                                             |

---

## 3. ADR (Architecture Decision Record)

### Decision

**Excalidraw 0.17.6(MIT, CDN esm.sh) 유지 + Yjs 13.x + cloudflared 터널** 위에서, **PDCA-0.5 Risk Spike + 10 본 PDCA Vertical Slice 순차 진행**으로 외부 참고 도구 RB 스페이스 기능의 Standard PASS set 30 합격기준을 모두 통과시킨다. 도메인 레이어는 신규 8 entity(StickyNote/Shape/TextElement/TemplateBundle/UserTemplate/Permission/PrivateMode/AwarenessCursor)와 신규 4 port(IBoardTemplateRepo/IBoardPermissionPolicy/IBoardExporter/IBoardAwarenessPort)를 추가하되 **기존 Board/BoardSession/BoardParticipant 시그니처는 변경하지 않는다**. 보드 저장은 .ybin(Y.Doc) 그대로 + 신규 메타는 `{id}.meta.json`, 사용자 템플릿은 `templates/{templateId}.json` 별도 파일로 격리.

### Drivers

- 라이선스 비용 0 (Driver 1) → tldraw 기각 재확인, Excalidraw 유지, **exceljs 기존 의존 사용**.
- 기존 Y.Doc 바이너리 호환 (Driver 2) → 신규 entity는 .ybin 외부 저장.
- 8~12 PDCA 내 완료 (Driver 3) → 11 PDCA (Spike + 10) + optional 2 polish.

### Alternatives considered

- (B) Big Bang Domain → 기각(가시 결과물 부재, Round 7 Standard PASS set 위반).
- (C) Mocked UI First → 기각(TypeScript strict + runtime verification policy 위반).
- (Excalidraw 외) tldraw / Konva / fabric → 기각(라이선스/구현 부담).
- (서버 측 템플릿 저장) 클라우드 동기화 → 기각(Round 1 결정 + Principle 1).
- (마인드맵 React Flow 통합) → deferred (Round 2 사용자 결정).
- **(12 도형 freedraw 폴백)** → 기각 (R-2) — freedraw 는 locked 의미 깨짐 + Y.Doc 동기 불안정 → **native 9 + 시각 동등 3** 채택.
- **(Y.Doc-level template immutability)** → 기각 (R-5) — 폐쇄 환경 + 학생 악의 시나리오 낮음, 비용 대비 효익 부족.
- **(xlsx-js-style)** → 기각 (R-7) — 이미 exceljs ^4.4.0 등재.

### Why chosen

Vertical Slice (Option A) + Risk-First Spike 만이 (a) Round 7 Standard PASS set 의 사용자 가시 합격기준을 PDCA 단위로 추적 가능하게 하고, (b) Architect antithesis ("happy-path slice") 를 Spike 로 흡수하며, (c) CLAUDE.md "하나의 세션 = 하나의 작은 작업 단위" 정책에 정합하고, (d) 매 PDCA 끝의 4종 검증 게이트가 cumulative 회귀를 차단하고, (e) main 단일 워킹트리 정책 하에서 다른 AI 세션과 영역 충돌 위험이 최소화된다.

### Consequences

- **긍정**: 각 PDCA 끝에 데모 가능. 사용자 피드백 루프 작동. 회귀 차단 안정적. Spike 결과로 R1/R2/R3 rollback criteria 활성화.
- **부정 1**: 도메인 entity(TemplateBundle, Permission)가 PDCA-3, PDCA-5 에서 도입되므로 PDCA-1, PDCA-2의 BoardListPanel/BoardSessionPanel 일부 시그니처를 PDCA-3에서 한 번 더 수정해야 함 → **mitigation**: PDCA-3 끝 메타테스트로 시그니처 안정성 확인.
- **부정 2**: 디자인 토큰 확장이 PDCA-1(스티커 5색)과 PDCA-7(공유 다이얼로그) 두 번 → **mitigation**: PDCA-1에서 sp-board-\* 토큰 namespace 전체 사전 정의(공수 +0.5h).
- **부정 3 (Template lock 신뢰 경계)** <!-- iter2 R-5 -->: Excalidraw `element.locked = true` 는 **UI 힌트일 뿐 Y.Doc 프로토콜 보호 X**. 악의적 클라이언트가 Y.Array 를 직접 수정해 81개 만다라트 격자를 이동/삭제할 수 있다. 쌤핀 폐쇄 환경(교사 PC + 학생 브라우저 + 6자리 입장코드)에서 학생이 Y.js dev tool 로 Y.Doc 을 직접 변경하는 시나리오는 발생 가능성 낮으나 0 은 아니다. **선택**: 클라이언트 신뢰 + "교사 모드에서만 lock 해제 토글" UI 보호 (PDCA-3 방향 유지). Y.Doc-level immutability 는 향후 별도 PDCA 로 격리.
- **부정 4 (controlled regression)** <!-- iter2 R-4 -->: PDCA-6 의 `awarenessPoll 1000ms → adaptive (idle 250ms / drawing 33ms)` 는 Principle 5 additive only 위반. **mitigation**: `BOARD_AWARENESS_POLL_MS` env var rollback flag + iter#5 dirty-flag 회귀 테스트(YDocBoardServer.ts:195-217) 메타테스트 추가.
- **부정 5 (12 도형 → 9 native + 3 시각 동등)** <!-- iter2 R-2 -->: RB의 양방향화살표·꺾인화살표·오각형은 Excalidraw 0.17.6 native 미지원. 사용자 인지 비용 발생 가능 (RB 사용 경험 있는 교사가 "오각형" 도구를 찾을 때 시각 동등 대체 명칭 사용). **mitigation**: BoardShapePalette 에 "RB 식 명칭 → 쌤핀 식 명칭" 매핑 툴팁 추가.

### Follow-ups

- 본 PDCA 완료 후 마인드맵 / 집중모드 / 24위젯 / 측정도구 / 폴더+휴지통+PDF / L3 마켓플레이스 deferred 항목을 **별도 spec → plan 사이클**로 진행.
- Y.Doc-level template immutability 가 필요해지는 시점에 별도 PDCA 로 격리(R-5 후속).
- **AC-9.3 duplicate 정책 (session token reset)** <!-- iter2 R-6 -->: PDCA-9 시작 전 design 문서에서 명시 결정.

---

## 4. Acceptance Criteria (PDCA별 testable GIVEN/WHEN/THEN)

### PDCA-0.5 — Risk-First Spike (3~4h, 코드 머지 0) <!-- iter2 R-1 신규 -->

**Spike 산출물**: `docs/03-analysis/collab-board-spike.analysis.md` (검증 보고서 only, src/ 변경 X).

- **SP-1 (customData round-trip, 1h)**:
  - GIVEN y-excalidraw 2.0.12 + Excalidraw 0.17.6, WHEN 클라이언트 A 가 element 를 생성하며 `customData.authorAwarenessId = 'aw-123'`, `customData.shapeKind = 'pentagon-equivalent'` 설정, THEN 클라이언트 B 가 Y.Doc 수신 후 동일 element 의 `customData` 두 필드가 손실 없이 round-trip 한다.
  - **Rollback criteria 활성화 조건**: 손실 발생 시 → PDCA-1/5 의 author 식별 방식을 Y.Map 보조 저장소(`boardId → Map<elementId, authorAwarenessId>`) 로 전환. PDCA-1 메타테스트 추가 +6 case.
- **SP-2 (locked 81 rectangles propagation, 1h)**:
  - GIVEN 클라이언트 A 에서 `excalidrawAPI.updateScene({ elements: [...만다라트 81 locked rect] })`, WHEN Y.Doc 업데이트, THEN 클라이언트 B 가 81개 locked rect 를 1초 이내 수신 + locked=true 가 유지된다.
  - **Rollback criteria 활성화 조건**: 부분 수신 또는 locked 손실 시 → PDCA-3 의 만다라트 element 개수를 9×9 → 5×5 로 축소 + chunked apply (10개씩 250ms 간격).
- **SP-3 (30-client awareness benchmark, 1.5h)**:
  - GIVEN Playwright headless 30 클라이언트, WHEN 16ms / 50ms / 100ms / 250ms throttle 각각 60초 동시 커서 이동, THEN p99 latency + tunnel byte rate 측정.
  - **Pass 기준**: 33ms throttle 시 p99 < 200ms / byte rate < 100KB/s 면 adaptive(33ms drawing) 채택. 실패 시 → 50ms drawing / 500ms idle 로 다운그레이드 + UI 가이드 "권장 20명, 안전 30명" 으로 조정.

**Spike 종료 조건**: SP-1~3 보고서 작성 + 사용자 승인 → PDCA-1 진입. Spike 실패 시 PDCA-1~6 acceptance criteria 일부 동적 조정.

### PDCA-1 — 스티커 메모 1급 도구 (5~7h)

- **AC-1.0** <!-- iter2 S-1 -->: GIVEN `generateBoardHTML.ts` 현재 `#join-modal` + `#app` 만 존재, WHEN PDCA-1 첫 단계, THEN **+30 LOC HTML scaffold** 로 좌측 toolbar `<div id="board-toolbar">` 컨테이너 신설(스티커 5색 팔레트 + 도형 9 native + 3 시각 동등 진입점 placeholder).
- **AC-1.1**: GIVEN 보드 세션 활성 + 학생 입장 완료, WHEN 좌측 툴바 "스티커 메모" 버튼 클릭 → 캔버스 클릭, THEN 새 스티커 element 가 생성되고 좌상단에 `⭐{학생닉네임}` 라벨이 자동 표시된다.
- **AC-1.2**: GIVEN 스티커 생성됨, WHEN 색상 팔레트 5색 중 "노랑" 선택, THEN element fillColor가 `var(--sp-board-sticky-yellow)` 로 변경되고 awareness 동기화로 다른 학생도 1초 이내 노랑으로 본다.
- **AC-1.3**: GIVEN snap-to-grid 토글 ON (격자 20px), WHEN 스티커를 (37, 53) 위치로 드래그, THEN 실제 저장 위치는 (40, 60) 로 정렬된다.
- **AC-1.4**: GIVEN 스티커 작성자 = 김민수, WHEN 박철수가 같은 스티커를 클릭, THEN 박철수의 권한이 "작성 모드"라면 수정 거부(toast: "본인이 만든 메모만 수정할 수 있어요"), "편집 모드"면 수정 허용.
- **AC-1.5 (Spike RESOLVED 2026-05-22)** <!-- iter3 SP-1 PASS -->: SP-1 = **PASS** (static analysis of y-excalidraw 2.0.12 source). `element.customData.authorAwarenessId` 채택 확정. **Y.Map 보조 저장소 fallback retire** (R2 mitigation 불필요). 추가 메타테스트 +6 case 도 불필요. Evidence: [.omc/spikes/sp-1-result.md](e:/github/ssampin/.omc/spikes/sp-1-result.md).

### PDCA-2 — 도형 native 9 + 시각 동등 3 (4~5h) <!-- iter2 R-2 -->

- **AC-2.1**: GIVEN 보드 세션 활성, WHEN 좌측 툴바 도형 그룹 펼침 → **native 9종**(직선·직선화살표·사각·둥근사각·원·삼각·마름모·오른쪽화살표·텍스트박스) 중 "마름모" 클릭 → 캔버스 드래그, THEN 마름모 element 가 생성되고 stroke/fill 토큰 적용.
- **AC-2.2** (다운그레이드) <!-- iter2 R-2 -->: GIVEN 도형 12종 중 native 9 + **시각 동등 3종**(오각=정육각 대체/꺾인화살표=직선화살표 2개 그룹/양방향화살표=직선+양쪽 화살표 endpoint) 이 모두 캔버스에 배치됨, WHEN element 를 png 으로 내보내기, THEN PNG 파일에 12 도형이 **시각적으로 동등하게** 보존된다. RB 식 명칭은 BoardShapePalette 툴팁으로 매핑("오각 → 정육각", "꺾인화살표 → 직선화살표 결합", "양방향화살표 → 양 끝 화살표").
- **AC-2.3**: GIVEN snap-to-grid ON, WHEN 9 + 3 도형 중 어떤 도형이든 드래그하여 (43, 71)에 놓음, THEN 위치가 (40, 80) 로 스냅된다.

### PDCA-3 — 4종 템플릿 + 잠금 + snap (6~8h)

- **AC-3.1 (Spike RESOLVED 2026-05-22)**: GIVEN 보드 목록 화면, WHEN "새 보드 생성" 클릭 → 다이얼로그에서 "만다라트" 선택 → "생성", THEN 새 Board 가 생성되며 Y.Doc에 81개 사각형 element(locked=true, fillColor sp-board-template-cell)가 9×9 격자로 (x=0..720, y=0..720, step 90) 사전 배치된다. SP-2 = **PASS** (Y.transact 원자성 + bulkify default → 단일 `bulkAppend` op + 단일 observeDeep event, ~16KB single WS message). 단일 `excalidrawAPI.updateScene` 호출로 81 element 전송. **5×5 chunked apply retire**. Evidence: [.omc/spikes/sp-2-result.md](e:/github/ssampin/.omc/spikes/sp-2-result.md). **NEW CAVEAT (PDCA-3 design 단계 결정 필수)**: 현재 teacher page는 `initialData` 만 사용 (ExcalidrawBinding 미부착). 템플릿 삽입이 Y.Doc 로 전파되려면 (옵션 A) teacher page에 ExcalidrawBinding 부착 — 권장 / (옵션 B) Y.Doc 직접 조작으로 element 삽입 (updateScene 우회). PDCA-3 design 단계에서 결정.
- **AC-3.2**: GIVEN 만다라트 보드 활성 + 학생 권한 = 작성, WHEN 학생이 81개 격자 중 하나를 드래그, THEN 이동 거부(locked=true 시 Excalidraw UI 정책). <!-- iter2 R-5: Y.Doc 프로토콜 보호 아님을 ADR Consequences 에 명기 -->
- **AC-3.3**: GIVEN 만다라트 보드 + 교사 권한, WHEN 교사가 권한 패널의 "템플릿 잠금 해제" 토글 ON, THEN 81개 element 의 locked=false 로 변경되고 교사만 이동 가능 (UI level).
- **AC-3.4**: GIVEN 조별활동 템플릿 선택, THEN 6개 컬러 영역(빨/파/노/초/보/주, sp-board-group-{r/b/y/g/p/o})이 각 (x=0..600, y=0..400) 영역에 locked=true 사각형으로 로드된다.
- **AC-3.5**: GIVEN 브레인스토밍 템플릿 선택, THEN 십자축(`+` 모양 직선 2개) + 4 zone label 이 locked=true text element 로 로드된다.

### PDCA-4 — 내 템플릿 저장 (4~5h)

- **AC-4.1**: GIVEN 교사가 보드를 자유롭게 편집한 상태, WHEN 상단 메뉴 "내 템플릿으로 저장" → 이름 입력 "수업 시작 보드", THEN `userData/data/boards/templates/{templateId}.json` 파일이 생성되고 `elementsJson` 에 현재 Y.Doc 의 모든 element 가 직렬화된다.
- **AC-4.2**: GIVEN 저장된 "수업 시작 보드" 템플릿 존재, WHEN "새 보드 생성" 다이얼로그 → "내 템플릿" 탭 → "수업 시작 보드" 선택 → "생성", THEN 새 Board 가 생성되며 저장된 elementsJson 이 Y.Doc 에 deserialize 되어 동일하게 로드된다.
- **AC-4.3**: GIVEN 사용자 템플릿 3개 저장됨, WHEN 다이얼로그 "내 템플릿" 탭, THEN 3개 카드(이름 + 생성 일자 + 삭제 버튼)가 표시되고 삭제 버튼은 confirm 후 .json 파일을 fs.unlink 한다.

### PDCA-5 — 권한 3단계 + 나만보기 (6~7h)

- **AC-5.1**: GIVEN 교사가 권한 패널을 엶, THEN 라디오 그룹 "읽기 / 작성 / 편집" + 토글 "나만보기" 가 표시되고 기본값은 "작성", "나만보기" OFF.
- **AC-5.2**: GIVEN 권한 = 읽기, WHEN 학생이 어떤 element 라도 클릭 → 드래그 시도, THEN 이동/수정/삭제 모두 거부(Excalidraw readOnly viewMode=true 적용).
- **AC-5.3**: GIVEN 권한 = 작성, WHEN 학생 A 가 만든 스티커를 학생 B 가 드래그 시도, THEN 거부 + toast "본인이 만든 메모만 수정할 수 있어요". 메모 작성자 검증은 SP-1 결과에 따라 `element.customData.authorAwarenessId === currentAwarenessId` (pass) 또는 Y.Map 보조 저장소 lookup (fail).
- **AC-5.4**: GIVEN 권한 = 편집, WHEN 학생 B 가 학생 A 의 스티커 드래그, THEN 이동 허용.
- **AC-5.5**: GIVEN 나만보기 = ON, WHEN 학생이 6자리 입장코드로 접속 시도, THEN HTTP upgrade 단계에서 1008(auth failed)로 거부되고 학생 화면에 "선생님이 보드를 비공개로 설정하셨어요" 표시.

### PDCA-6 — Adaptive Awareness Throttle 25/35명 (5~6h) <!-- iter2 R-3 + R-4 -->

- **AC-6.1** (adaptive — Spike RESOLVED 2026-05-22): GIVEN 보드 세션 활성 + 학생 5명 접속, WHEN 다른 학생이 커서를 움직임, THEN 본인 화면에 각 학생의 색상 점(8px 원) + 닉네임 라벨이 표시되고, awareness pointerUpdate 는 **adaptive throttle (idle 250ms / drawing 50ms)** 로 송신된다. UI 우상단에 "권장 25명 동시 접속, 안전 35명" 가이드 칩 표시. **SP-3 측정 근거**: 25c/50ms p99=36ms, 30c/50ms p99=38ms, 35c/250ms p99=47ms — 모두 100ms target 내. **33ms 기각 사유**: 25c/33ms p99=617ms (6× over), 30c/33ms p99=2,512ms (saturation cliff). Evidence: [.omc/spikes/sp-3-result.md](e:/github/ssampin/.omc/spikes/sp-3-result.md).
- **AC-6.2**: GIVEN **25명** 동시 접속 (1차 권장선), WHEN 모두가 동시에 커서 이동, THEN 화면 frame rate ≥ 30fps 유지, 커서 라벨이 viewport 가장자리에서 잘리지 않고 모이는 경우 자동 클러스터링(반경 24px 내 라벨은 "외 N명" 표시). **측정 도구**: Playwright `page.evaluate(() => { /* requestAnimationFrame loop counter */ })` 또는 Chrome DevTools Protocol trace category `devtools.timeline`. PDCA-10 통합 QA 시나리오에 fps probe 추가.
- **AC-6.3**: GIVEN 학생이 1분간 idle, THEN 본인의 awareness 커서가 다른 학생 화면에서 fade-out (opacity 1 → 0.3 over 300ms).
- **AC-6.4** (controlled regression rollback) <!-- iter2 R-4 -->: GIVEN `BOARD_AWARENESS_POLL_MS=1000` env var, WHEN YDocBoardServer 시작, THEN awarenessPoll 이 1000ms 로 복귀하고 iter#5 dirty-flag 회귀 테스트가 통과한다 (`YDocBoardServer.ts:195-217` 회귀 메타테스트).
- **AC-6.5** (Spike RESOLVED 2026-05-22): SP-3 결과 = **CONDITIONAL FAIL at 33ms / PASS at 50ms** → AC-6.1 drawing throttle 33ms → 50ms **보수화 채택**. idle 250ms 유지 (35c 안정). UI 가이드 "권장 25명, 안전 35명" 그대로 (50ms throttle 기준 PASS). **추가 fallback 트리거**: 35 client 초과 시 자동 drawing throttle 50→100ms. Cloudflared free tier 는 bottleneck 아님 (모든 config 70 KB/s 미만, 0.36 Mbps).

### PDCA-7 — 공유 다이얼로그 UX (3~4h)

- **AC-7.1**: GIVEN 보드 세션 활성, WHEN 우상단 "공유" 버튼 클릭, THEN 다이얼로그에 (a) 공개 URL + 복사 버튼, (b) 6자리 입장코드 + 복사 버튼, (c) QR 코드(크기 200×200) 가 1 클릭 안에 모두 표시된다.
- **AC-7.2**: GIVEN 공유 다이얼로그 열림, WHEN "URL 복사" 클릭, THEN clipboard에 https URL 이 들어가고 버튼 텍스트가 "복사됨" 으로 2초간 변경된 후 원복.
- **AC-7.3**: GIVEN 공유 다이얼로그 열림 + 학생 1명도 접속 안 함, THEN QR 코드가 회색 처리되지 않고 정상 표시. 학생 인원 표시는 별도 "현재 0명 접속" 라벨.
- **AC-7.4**: GIVEN 보드 세션 비활성, WHEN 공유 버튼 클릭 시도, THEN 다이얼로그가 열리지 않고 "먼저 보드를 시작해주세요" toast.

### PDCA-8 — 내보내기 png/xlsx via exceljs (5~6h) <!-- iter2 R-7 -->

- **AC-8.1**: GIVEN 보드 세션 활성 + 스티커 5개 + 도형 3개, WHEN "내보내기" → "PNG" 선택 → 저장, THEN dialog showSaveDialog 로 위치 선택 후 png 파일 생성, 파일 크기 > 1KB, 시각적으로 모든 element 포함.
- **AC-8.2**: GIVEN 보드에 스티커 5개(작성자 김민수/박철수/이영희/김민수/박철수), WHEN "내보내기" → "XLSX" + "닉네임 표시 ON" 선택, THEN **exceljs ^4.4.0 (이미 등재) 활용** xlsx 파일이 (행=스티커, 열=[작성자, 내용, 색상, 생성시각]) 으로 생성된다.
- **AC-8.3**: GIVEN AC-8.2 와 동일 + "닉네임 표시 OFF", THEN xlsx 의 작성자 열이 모두 "익명" 으로 마스킹된다.

### PDCA-9 — 프로젝트 홈 (5~6h)

- **AC-9.1**: GIVEN 보드 목록 화면에 보드 10개, WHEN 보드 카드 우상단 별표 클릭, THEN Board.favoriteAt 가 현재 timestamp 로 설정되고 사이드바 "즐겨찾기" 필터 클릭 시 별표 보드만 표시된다.
- **AC-9.2**: GIVEN 보드 30개 존재, WHEN 상단 검색창에 "수학" 입력, THEN debounce 150ms 후 이름에 "수학" 포함된 보드만 표시(case-insensitive).
- **AC-9.3 (pending design-stage resolution)** <!-- iter2 R-6 -->: GIVEN 보드 카드 hover, THEN 4개 액션 버튼(이름변경/복제/공유/삭제) 이 표시되고, "복제" 클릭 시 새 ID 의 보드가 생성되며 `{원본id}.ybin` 의 바이너리가 `{새id}.ybin` 으로 fs.copyFile 되고 meta.json 의 name 은 "(원본이름) 복사본" 으로 설정된다. **session token reset policy 는 PDCA-9 시작 전 design 문서에서 명시 결정** (open-questions.md 의 AC-9.3 항목 참조). 결정 시점까지 AC-9.3 의 "복제본 sessionCode/authToken 재발급 여부" 는 pending.
- **AC-9.4**: GIVEN 보드 카드, WHEN "삭제" 클릭 → confirm("정말 삭제할까요? 복구할 수 없어요") → 확인, THEN .ybin + meta.json 즉시 삭제, 보드 목록 새로고침.

### PDCA-10 — 통합 QA (4~5h)

- **AC-10.1**: 25명 (권장) + 35명 (안전 한계) 동시 접속 시나리오 — 본인 PC + 가상 학생 Playwright headless → 5분간 무작위 element 추가/이동/삭제, p99 latency < 200ms, 0 disconnect.
- **AC-10.2**: 메타테스트 추가 — `boardPermissionRules.permission.test.ts`, `templateRules.test.ts`, `BoardExportService.png.test.ts`, `BoardExportService.xlsx.test.ts`, `BoardListPanel.search.test.tsx`, `awarenessThrottle.adaptive.test.ts`, `YDocBoardServer.awarenessPoll.regression.test.ts` (총 7+ 신규 메타테스트). <!-- iter2 R-4: 회귀 테스트 추가 -->
- **AC-10.3**: Zero Script QA — `npm run regression-check` 신규 합격 항목 **9+ 시나리오** (PDCA-1~9 누적 ~2,800 LOC 회귀 위험 커버) 추가. 9 카테고리: (i) 새 보드 + 만다라트 로드 / (ii) 스티커 5색 작성자 라벨 / (iii) 12 도형 native 9 + visual-equiv 3 / (iv) 사용자 템플릿 저장·로드 / (v) 권한 3단계 전환 / (vi) awareness 25명 동시 / (vii) URL/QR/입장코드 공유 / (viii) png/xlsx 내보내기 / (ix) 즐겨찾기·검색·복제·삭제.
- **AC-10.4**: 4종 검증 게이트 — `npx tsc --noEmit` 0 errors / `npm run lint` 0 errors / `npm run test` all pass / `npm run regression-check` all pass.

---

## 5. Implementation Steps (PDCA-0.5 Spike + 10 본 PDCA)

### Pre-flight (PDCA-0, 30분)

**파일 변경 없음**. main 브랜치 confirmation + git status clean 확인 + Phase 1a MVP Step 8 수동 QA 결과 확인. 다른 세션 작업 매트릭스 점검 (§5.0 참조).

### §5.0 다중 세션 충돌 매트릭스 <!-- iter2 S-3 -->

| 영역                                                                                                  | collab-board                                                                                                                                                             | freestyle-seating Phase 5b/6            | 기타 Active PDCA | 충돌                                              |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- | ---------------- | ------------------------------------------------- |
| `src/domain/entities/Board.ts`                                                                        | iter (+3 LOC favoriteAt)                                                                                                                                                 | —                                       | —                | 없음                                              |
| `src/domain/entities/Sticky/Shape/Template/Permission/Awareness/UserTemplate/PrivateMode/TextElement` | neu (8 entities)                                                                                                                                                         | —                                       | —                | 없음                                              |
| `src/domain/entities/SeatingArrangement.ts`                                                           | —                                                                                                                                                                        | iter (Phase 5b constraint 마이그레이션) | —                | 없음 (격리)                                       |
| `src/infrastructure/board/*`                                                                          | iter (`generateBoardHTML.ts` +260 LOC / `YDocBoardServer.ts` +50 LOC / 신규 `TemplateBundleProvider.ts` / 신규 `BoardExportService.ts` / 신규 `FileUserTemplateRepo.ts`) | —                                       | —                | 없음                                              |
| `src/adapters/components/Tools/Board/*`                                                               | iter (BoardListPanel +90 LOC) + neu (BoardStickyPalette / BoardShapePalette / BoardNewBoardDialog / BoardPermissionPanel / BoardShareDialog / BoardExportDialog)         | —                                       | —                | 없음                                              |
| `src/adapters/components/Tools/Seating/*`                                                             | —                                                                                                                                                                        | iter (추정)                             | —                | 없음 (격리)                                       |
| `electron/ipc/board.ts`                                                                               | iter (+150 LOC handlers)                                                                                                                                                 | —                                       | —                | 없음                                              |
| `tailwind.config.ts` + `tokens.css`                                                                   | iter (+18 LOC sp-board-\* 신설)                                                                                                                                          | iter (가능성 있음)                      | —                | **검토 필요** — PDCA-1 시작 시 git status 로 확인 |
| `package.json`                                                                                        | R-7 으로 신규 의존 0                                                                                                                                                     | —                                       | —                | 없음                                              |

**결론**: 핵심 영역 0 충돌. `tailwind.config.ts` 만 PDCA-1 시작 시 git diff 확인 → 충돌 시 freestyle-seating 세션에 알림 후 sp-_ namespace 분리 (sp-board-_ vs sp-seat-\*).

---

### PDCA-0.5 — Risk-First Spike (3~4h, 코드 머지 0) <!-- iter2 R-1 신규 -->

**산출물**: `docs/03-analysis/collab-board-spike.analysis.md` (검증 보고서 only).

**실행 단계**:

1. **SP-1 customData round-trip (1h)**:
   - 스파이크 환경: 두 개의 electron dev 인스턴스 또는 두 개의 브라우저 탭 + 동일 .ybin.
   - 측정: client A 에서 element 생성 + customData 2 필드 → client B Y.Doc 수신 → 두 필드 보존 여부.
   - 결과: pass → `customData.authorAwarenessId` 채택 / fail → Y.Map 보조 저장소 (`Y.Map<elementId, authorAwarenessId>` per boardId) 채택.
2. **SP-2 locked 81 rectangles propagation (1h)**:
   - 측정: client A 에서 `excalidrawAPI.updateScene` 으로 81 locked rect 일괄 적용 → client B 가 수신하는 시간 + locked 상태 보존.
   - 결과: pass → 만다라트 9×9 (81) 그대로 / fail → 5×5 (25) + chunked apply.
3. **SP-3 30-client awareness benchmark (1.5h)**:
   - Playwright headless 30 클라이언트 × 4 throttle (16/50/100/250ms) × 60s.
   - 측정: p99 latency, cloudflared 터널 byte rate, frame rate.
   - 결과: 33ms pass → adaptive (33/250) 채택 / fail → adaptive (50/500) 다운그레이드 + 권장 인원 25 → 20 / 안전 35 → 30.

**Spike 종료 조건**: 보고서 + 사용자 승인 → PDCA-1 진입. 실패 시 PDCA-1/3/6 acceptance criteria 동적 조정 (이 plan 의 fallback 분기 활성화).

**검증 게이트**: 없음 (코드 머지 0). 사용자 승인 필수.

---

### PDCA-1 — 스티커 메모 1급 도구 (5~7h)

**HTML scaffold 우선** <!-- iter2 S-1 -->: `generateBoardHTML.ts` 의 `#join-modal` + `#app` 외에 `<div id="board-toolbar">` 컨테이너 신설(+30 LOC). 스티커 5색 팔레트 + 도형 9 native + 3 시각 동등 진입점 placeholder.

**도메인 추가** (`src/domain/entities/StickyNote.ts`, neu, ~25 LOC):

```ts
export interface StickyNote {
  readonly id: string;
  readonly authorAwarenessId: string; // SP-1 pass 시 customData / fail 시 Y.Map lookup
  readonly authorName: string;
  readonly color: StickyColor;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly content: string;
}
export type StickyColor = 'yellow' | 'pink' | 'blue' | 'green' | 'purple';
```

**도메인 규칙** (`src/domain/rules/stickyRules.ts`, neu, ~40 LOC):

- `snapToGrid(value, step)`, `canEditSticky(participantAwarenessId, sticky, permission)`.

**인프라** (`src/infrastructure/board/generateBoardHTML.ts`, 수정 +90 LOC = 30 scaffold + 60 sticky logic):

- 스티커 툴바 UI 5색 팔레트 + Excalidraw `excalidrawAPI.updateScene()` 으로 sticky element 삽입.
- `provider.awareness.setLocalStateField('user', ...)` 의 awareness clientID 를 `element.customData.authorAwarenessId` 로 저장 (SP-1 pass 시) 또는 Y.Map 보조 저장소에 별도 기록 (SP-1 fail 시).

**어댑터** (`src/adapters/components/Tools/Board/BoardStickyPalette.tsx`, neu, ~80 LOC).

**디자인 토큰** (`tailwind.config.js`, `src/styles/tokens.css`, 수정 +18 LOC):

- `sp-board-sticky-{yellow,pink,blue,green,purple}` 5 토큰.
- `sp-board-grid` 토큰 (snap line).
- `sp-board-toolbar-bg`, `sp-board-toolbar-border` (PDCA-1 scaffold).
- `sp-board-shape-stroke`, `sp-board-shape-fill-light`, `sp-board-shape-fill-bold` (PDCA-2 사전 정의).
- `sp-board-share-bg`, `sp-board-share-accent` (PDCA-7 사전 정의).
- `sp-board-template-cell` (PDCA-3 사전 정의).
- `sp-board-group-{r,b,y,g,p,o}` 6 토큰 (PDCA-3 사전 정의).

**메타테스트** (`src/domain/rules/__tests__/stickyRules.test.ts`, neu): 12 케이스 + SP-1 fail 시 +6 케이스.

**의존성**: PDCA-0.5 Spike 통과.

**추정 LOC**: +260 (scaffold +30 / sticky +180 / tokens +18 / tests +32).

**검증 게이트**: typecheck 0 / lint 0 / 신규 12~18 test pass / regression-check pass.

---

### PDCA-2 — 도형 native 9 + 시각 동등 3 (4~5h) <!-- iter2 R-2 -->

**도메인** (`src/domain/entities/Shape.ts`, neu, ~35 LOC):

- `ShapeType = 'line' | 'arrow-right' | 'rectangle' | 'rounded-rectangle' | 'ellipse' | 'triangle' | 'diamond' | 'arrow-bidirectional-emulated' | 'arrow-zigzag-emulated' | 'pentagon-emulated' | 'text-box' | 'image-placeholder'`.
- 9 native Excalidraw 매핑 + 3 emulated (group + endpoint).

**인프라** (`generateBoardHTML.ts` 수정 +80 LOC):

- 좌측 툴바에 12 도형 그룹 펼침 UI.
- native 9 → Excalidraw `setActiveTool({ type: ... })` 직접 호출.
- emulated 3 → element group + `customData.shapeKind` 마킹 + 원자 그룹 update.

**어댑터** (`src/adapters/components/Tools/Board/BoardShapePalette.tsx`, neu, ~140 LOC):

- 12 도형 아이콘 그리드 + **RB 식 명칭 → 쌤핀 식 명칭 매핑 툴팁** (오각 → 정육각 / 꺾인화살표 → 직선화살표 결합 / 양방향화살표 → 양 끝 화살표).

**메타테스트**: `Shape.test.ts` (12 도형 타입 round-trip) + `BoardShapePalette.test.tsx` (툴팁 매핑 12 케이스).

**의존성**: PDCA-1 의 customData 패턴 (또는 Y.Map fallback).

**추정 LOC**: +270.

**검증 게이트**: 동일.

---

### PDCA-3 — 4종 템플릿 + 잠금 + snap (6~8h)

**도메인** (`src/domain/entities/TemplateBundle.ts`, neu, ~45 LOC).

**도메인 규칙** (`src/domain/rules/templateRules.ts`, neu, ~80 LOC):

- `buildMandalart()` → 81 (또는 SP-2 fail 시 25) locked rect array.
- `buildGroupActivity()` → 6 컬러 영역.
- `buildBrainstorm()` → 십자축 + 4 zone label.
- `buildFlowchartSample()` → 4 sample placeholder.

**인프라** (`src/infrastructure/board/TemplateBundleProvider.ts`, neu, ~50 LOC):

- 4 + blank 템플릿 JSON.stringify export.
- **SP-2 fail 시**: chunked apply helper (10 elements / 250ms interval).

**어댑터** (`src/adapters/components/Tools/Board/BoardNewBoardDialog.tsx`, neu, ~150 LOC).

**어댑터 보강** (`src/adapters/stores/useBoardStore.ts`, 수정 +30 LOC).

**전자 IPC** (`electron/ipc/board.ts`, 수정 +25 LOC): `boards:createWithTemplate`.

**메타테스트**: `templateRules.test.ts` (3 builder × pass case).

**의존성**: PDCA-0.5 SP-2 + PDCA-1, PDCA-2.

**추정 LOC**: +380.

**검증 게이트**: 동일.

---

### PDCA-4 — 내 템플릿 저장 (4~5h)

**도메인** (`src/domain/entities/UserTemplate.ts`, neu, ~25 LOC).

**도메인 포트** (`src/domain/ports/IUserTemplateRepo.ts`, neu, ~20 LOC).

**인프라** (`src/infrastructure/board/FileUserTemplateRepo.ts`, neu, ~80 LOC):

- `userData/data/boards/templates/{templateId}.json`.

**어댑터** (`src/adapters/stores/useUserTemplateStore.ts`, neu, ~60 LOC).

**어댑터 보강** (BoardNewBoardDialog.tsx 수정 +60 LOC).

**전자 IPC** (`electron/ipc/board.ts`, 수정 +30 LOC).

**메타테스트** (FileUserTemplateRepo.test.ts): save → list → load → delete round-trip.

**의존성**: PDCA-3.

**추정 LOC**: +275.

**검증 게이트**: 동일.

---

### PDCA-5 — 권한 3단계 + 나만보기 + boardRules SRP 분할 (6~7h) <!-- iter2 R-8 -->

**도메인** (`src/domain/valueObjects/Permission.ts`, neu, ~15 LOC).

**도메인** (`src/domain/valueObjects/PrivateMode.ts`, neu, ~10 LOC).

**도메인 규칙 SRP 분할** <!-- iter2 R-8 -->:

- 기존 `boardRules.ts` (88 LOC, sanitize + verify) 유지.
- 신규 `src/domain/rules/boardPermissionRules.ts` (neu, ~60 LOC): `applyPermission(participantAwarenessId, elementAuthorAwarenessId, level)`.
- `verifyJoinCredentials` 시그니처에 privateMode optional 추가 (Principle 2 overload 호환).

**도메인 entity 확장** (`BoardSession.ts`, 수정 +5 LOC).

**인프라** (`YDocBoardServer.ts` 수정 +35 LOC):

- privateMode reject (1008) + awareness permission 필드 추가.

**인프라** (`generateBoardHTML.ts` 수정 +40 LOC):

- 학생 측 awareness 의 `permission` 값 → Excalidraw `viewModeEnabled` / element-level 거부.

**어댑터** (`src/adapters/components/Tools/Board/BoardPermissionPanel.tsx`, neu, ~110 LOC).

**전자 IPC** (수정 +20 LOC): `boards:setPermission`, `boards:setPrivateMode`.

**메타테스트** (`boardPermissionRules.test.ts`, neu): applyPermission × 6 + privateMode reject × 2.

**의존성**: PDCA-1 의 author 식별 메커니즘.

**추정 LOC**: +300.

**검증 게이트**: 동일.

---

### PDCA-6 — Adaptive Awareness + Controlled Regression (5~6h) <!-- iter2 R-3 + R-4 -->

**도메인** (`src/domain/entities/AwarenessCursor.ts`, neu, ~15 LOC).

**도메인 규칙** (`src/domain/rules/awarenessRules.ts`, neu, ~70 LOC):

- `clusterCursors(cursors, radius=24)`.
- `shouldFadeOutCursor(cursor, now, idleMs=60000)`.
- `computeAdaptiveThrottle(state: 'idle' | 'drawing')`: idle 250ms / drawing 33ms (SP-3 pass) 또는 500/50 (fail).

**인프라** (`generateBoardHTML.ts` 수정 +110 LOC):

- 클라이언트 awareness state 분류 → adaptive throttle 적용.
- 캔버스 오버레이 다른 학생 커서 + 클러스터링 + idle fade.
- 우상단 "권장 25명, 안전 35명" 가이드 칩 (SP-3 pass) 또는 "권장 20명, 안전 30명" (fail).

**인프라** (`YDocBoardServer.ts` 수정 +20 LOC) <!-- iter2 R-4 controlled regression -->:

- `awarenessPoll`: 기본 250ms (drawing 우세), env var `BOARD_AWARENESS_POLL_MS` 로 1000ms 복귀 가능.
- **회귀 테스트**: `YDocBoardServer.awarenessPoll.regression.test.ts` (neu) — iter#5 dirty-flag (YDocBoardServer.ts:195-217) 가 250ms 에서도 정상 작동 확인.

**어댑터** (BoardSessionPanel.tsx 수정 +30 LOC).

**메타테스트**:

- `awarenessRules.test.ts` (neu): clusterCursors × 4, shouldFadeOutCursor × 3, computeAdaptiveThrottle × 4.
- `YDocBoardServer.awarenessPoll.regression.test.ts` (neu): dirty-flag 회귀 차단 × 3.

**의존성**: PDCA-0.5 SP-3 + PDCA-5.

**추정 LOC**: +260.

**검증 게이트**: 동일.

---

### PDCA-7 — 공유 다이얼로그 UX (3~4h)

**어댑터** (`src/adapters/components/Tools/Board/BoardShareDialog.tsx`, neu, ~140 LOC):

- Modal 기반 (ModalCoordinator 사용, priority `SHARE_DIALOG = NORMAL_USER_ACTION`).
- URL + 입장코드 + QR.

**어댑터** (BoardSessionPanel.tsx 수정 +20 LOC).

**디자인 토큰**: PDCA-1 에서 사전 정의됨 (sp-board-share-\*).

**메타테스트**: `BoardShareDialog.test.tsx` (neu).

**의존성**: ModalCoordinator (main).

**추정 LOC**: +180.

**검증 게이트**: 동일.

---

### PDCA-8 — 내보내기 png/xlsx via exceljs (5~6h) <!-- iter2 R-7 -->

**도메인 포트** (`src/domain/ports/IBoardExporter.ts`, neu, ~25 LOC).

**인프라** (`src/infrastructure/board/BoardExportService.ts`, neu, ~170 LOC):

- PNG: Excalidraw `exportToCanvas` → toBlob → fs.writeFile.
- XLSX: **exceljs ^4.4.0 (이미 등재)** → workbook 생성 → fs.writeFile.

**어댑터** (`src/adapters/components/Tools/Board/BoardExportDialog.tsx`, neu, ~120 LOC).

**전자 IPC** (수정 +35 LOC): `boards:exportPng`, `boards:exportXlsx`.

**메타테스트**: `BoardExportService.test.ts` (xlsx header + nickname ON/OFF + png file size).

**의존성**: PDCA-1~3.

**추정 LOC**: +350.

**검증 게이트**: 동일.

---

### PDCA-9 — 프로젝트 홈 + boardListRules 분할 (5~6h) <!-- iter2 R-8 -->

**Design-stage 선결정 필요** <!-- iter2 R-6 -->: AC-9.3 의 session token reset policy — PDCA-9 시작 전 design 문서 작성.

**도메인 entity 확장** (`Board.ts`, 수정 +3 LOC): `favoriteAt: number | null`.

**도메인 규칙 SRP 분할** <!-- iter2 R-8 -->:

- 신규 `src/domain/rules/boardListRules.ts` (neu, ~50 LOC): `filterBoardsByName`, `sortBoardsByFavorite`, `duplicateBoardName`.

**인프라** (`FileBoardRepository.ts` 수정 +60 LOC):

- `duplicate(boardId)`: .ybin + meta.json fs.copyFile. **sessionCode/authToken 재발급 정책은 design 문서 결정에 따라 분기**.
- `setFavorite(boardId, favoriteAt)`.

**어댑터** (BoardListPanel.tsx 수정 +90 LOC).

**전자 IPC** (수정 +40 LOC).

**메타테스트** (`BoardListPanel.search.test.tsx` + `boardListRules.test.ts`).

**의존성**: PDCA-7 + design 문서 (AC-9.3 token policy).

**추정 LOC**: +250.

**검증 게이트**: 동일.

---

### PDCA-10 — 통합 QA (4~5h)

**Playwright** (`tests/e2e/collab-board-25-35-students.spec.ts`, neu, ~180 LOC):

- 25명 (권장) 시나리오 + 35명 (안전 한계) 시나리오.

**Zero Script QA** (`scripts/regression-check/collab-board-parity.mjs`, neu, ~120 LOC):

- 9 카테고리 × 1~3 회귀 항목.

**메타테스트 집합 점검**: PDCA-1~9 의 모든 메타테스트 1 batch pass.

**문서 갱신**:

- `docs/04-report/features/collab-board-rb-parity.report.md`.
- `PROGRESS.md` 갱신.

**의존성**: PDCA-1~9 모두 완료.

**추정 LOC**: +320.

**검증 게이트**: 4종 + Zero Script QA + 25/35명 시나리오.

---

### Optional PDCA-11~12 (필요 시)

- **PDCA-11**: 도형 9 native + 3 emulated polish — 시각 동등 3종의 자연스러운 path 보정.
- **PDCA-12**: 빈 보드 템플릿 카드 디자인 + frontend-design 에이전트 협업.

---

## 6. Risks and Mitigations

| #   | Risk                                                                                    | Likelihood      | Impact                  | Mitigation                                                                                                                                                                                                   |
| --- | --------------------------------------------------------------------------------------- | --------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | **Excalidraw 0.17.6 API 한계** — 12 도형 중 오각/꺾인화살표/양방향화살표 native 미지원  | High            | Low (다운그레이드 결정) | **AC-2.2 다운그레이드 채택** (R-2): native 9 + 시각 동등 3 (group + endpoint). BoardShapePalette 툴팁으로 명칭 매핑. freedraw 폴백 명시적 기각.                                                              |
| R2  | **Yjs 13.x ↔ y-excalidraw 2.0.12 의 customData 동기화 불안정**                          | High            | High                    | **PDCA-0.5 SP-1 (1h) 사전 검증** (R-1). pass → customData / fail → **Y.Map 보조 저장소 fallback** (`boardId → Map<elementId, authorAwarenessId>`, S-2). element.groupIds 사용은 Excalidraw 의미 충돌로 기각. |
| R3  | **awareness throttle 부하** — 30명 × 16ms = 1875 msg/s, cloudflared 무료 터널 한도 미상 | Medium          | High                    | **Adaptive throttle 채택** (R-3): idle 250ms / drawing 33ms = 30명 × 33ms = 909 msg/s. UI "권장 25명, 안전 35명" 가이드. **PDCA-0.5 SP-3 (1.5h) 실측** → fail 시 50/500 + 권장 20명 다운그레이드.            |
| R4  | **30명 동시 부하 시 메모리/CPU 폭주** + **controlled regression**                       | Medium          | High                    | **PDCA-10 시뮬레이션** (25명 권장 + 35명 안전). awarenessPoll 1000→250ms 는 **controlled regression** 으로 명시 (R-4): `BOARD_AWARENESS_POLL_MS` env var rollback flag + iter#5 dirty-flag 회귀 메타테스트.  |
| R5  | **sp-\* 디자인 토큰 누락**                                                              | Medium          | Low                     | PDCA-1 시작 시 frontend-design agent 30분 토큰 정의 세션. **sp-board-\* 전체 namespace 사전 정의** (sticky 5 + grid 1 + shape 3 + share 2 + template 1 + group 6 = 18 토큰).                                 |
| R6  | **공유 다이얼로그가 ModalCoordinator 큐와 충돌**                                        | Low             | Low                     | SHARE_DIALOG priority = NORMAL_USER_ACTION. open-questions.md 의 ModalCoordinator priority 결정 항목 (PDCA-7 시작 전 design 결정).                                                                           |
| R7  | **TemplateBundle.elementsJson 의 Excalidraw 버전 deserialize 호환성**                   | Low             | High                    | `versionSchema: '0.17.6'` 메타 필드 추가. 마이그레이션 헬퍼 자리 마련.                                                                                                                                       |
| R8  | **다중 세션 작업 충돌**                                                                 | Low             | Medium                  | **§5.0 충돌 매트릭스** (S-3): collab-board 영역 0 충돌. `tailwind.config.ts` 만 PDCA-1 시작 시 git diff 확인 + sp-board-\* 분리.                                                                             |
| R9  | **XLSX 라이브러리 의존 추가**                                                           | —               | —                       | **exceljs ^4.4.0 이미 package.json:54 등재** (R-7). 신규 의존 0. xlsx-js-style 기각.                                                                                                                         |
| R10 | **권한 변경 시점 race condition**                                                       | Medium          | Low                     | PDCA-5 에서 awareness `permission` 필드를 학생 측 매 element update 직전 재확인. toast "선생님이 읽기 모드로 전환했어요".                                                                                    |
| R11 | **Template lock 신뢰 경계** <!-- iter2 R-5 -->                                          | Low (폐쇄 환경) | Medium                  | **클라이언트 신뢰 채택** (R-5) — UI lock + 교사 토글. Y.Doc-level immutability 는 별도 PDCA 로 격리. ADR Consequences §3 부정 3 명기.                                                                        |
| R12 | **AC-9.3 session token reset policy 미결정** <!-- iter2 R-6 -->                         | Med             | Med                     | **Pending design-stage resolution** (R-6) — PDCA-9 시작 전 design 문서. open-questions.md 추적.                                                                                                              |

---

## 7. Verification Steps (CLAUDE.md 검증 게이트 4종 + 추가)

### 7.1 PDCA-0.5 Spike 종료 (별도)

- 검증 게이트 미적용 (코드 머지 0).
- `docs/03-analysis/collab-board-spike.analysis.md` 보고서 + **사용자 승인 필수**.

### 7.2 매 PDCA 끝 (필수)

```bash
npx tsc --noEmit                # TypeScript 0 errors
npm run lint                    # ESLint 0 errors
npm run test                    # Vitest all pass
npm run regression-check        # 회귀 체크 pass
```

### 7.3 PDCA-1, PDCA-5, PDCA-6, PDCA-10 끝 (추가)

- **시각적 검증**: 본인 PC 보드 시작 → 모바일 브라우저 입장 → 핵심 시나리오 1회 수동 + 스크린샷.

### 7.3a PDCA-9 시작 전 게이트 (필수) <!-- iter3 W1 -->

- `docs/02-design/features/collab-board-rb-parity.design.md` 에 **AC-9.3 (보드 복제 시 sessionCode/authToken 재발급 정책)** 결정이 기록되어 있어야 한다.
- design 문서 부재 또는 AC-9.3 결정 누락 시 → **PDCA-9 시작 금지**.
- 결정 옵션 예시(설계 단계에서 택1): (a) 재발급 (보안 우선) / (b) 원본 토큰 승계 (UX 우선) / (c) 사용자 선택 다이얼로그.

### 7.4 PDCA-10 끝 (통합)

- 메타테스트 1 batch 모두 pass.
- Zero Script QA collab-board-parity 5+ PASS.
- 25명 권장 + 35명 안전 시뮬레이션 0 disconnect / p99 < 200ms.
- **controlled regression rollback 확인** <!-- iter2 R-4 -->: `BOARD_AWARENESS_POLL_MS=1000` 으로 awarenessPoll 1000ms 복귀 + iter#5 dirty-flag 회귀 테스트 pass.
- 4종 게이트 최종 통과 + `PROGRESS.md` 갱신 + Notion 가이드 갱신.

### 7.5 릴리즈 전 (v2.0.7 묶음 후보 시)

- MEMORY.md Release Workflow 8단계.
- KB Q&A 5건 이상 추가.

---

## 8. Status

**Status**: pending approval (iter2 revision, Architect re-review 대기).

**Reviewer Notes**:

- **Architect**: iter2 에서 R-1~R-8 + S-1~S-5 반영. §10 Changelog 참조. PDCA-0.5 Spike (R-1) 가 antithesis "happy-path slice" 를 흡수했는지 + AC-9.3 pending (R-6) 이 design-stage 로 위임된 것이 합리적인지 검토 부탁.
- **Critic**: §6 R11 (Template lock 신뢰 경계) 의 "쌤핀 폐쇄 환경 + 학생 악의 시나리오 낮음" 가정이 받아들여지는지 검증. Adaptive throttle 33ms (drawing) 가 60fps 의 절반인데 사용자가 인지 가능한 jitter 발생 여지 있는지 — PDCA-0.5 SP-3 측정으로 확인.

---

## 9. Sensitivity Items Mapping (iter2 신규) <!-- iter2 -->

| ID  | Item                                           | 반영 위치                                   |
| --- | ---------------------------------------------- | ------------------------------------------- |
| S-1 | PDCA-1 toolbar 스캐폴드 +30 LOC                | AC-1.0, §5 PDCA-1 "HTML scaffold 우선"      |
| S-2 | authorAwarenessId fallback (Y.Map 보조 저장소) | R-1 SP-1 결과 분기, AC-1.5, R2 mitigation   |
| S-3 | 다중 세션 비충돌 매트릭스                      | §5.0 신규 표                                |
| S-4 | Antithesis 흡수 (PDCA-0.5 Spike)               | §2.5 신규, ADR §3 Why chosen, PDCA-0.5 자체 |
| S-5 | Tradeoff Tensions 명시                         | §2.6 신규 표 (3 tension)                    |

---

## 10. Changelog (iter2) <!-- iter2 -->

| ID  | Architect 요구                                                                                                                  | 반영                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| R-1 | PDCA-0.5 Spike (3~4h, 코드 머지 0) — customData round-trip + 81 locked propagation + 30-client benchmark + 각 rollback criteria | ✅ §4 PDCA-0.5 신규 (SP-1/2/3) + §5 실행 단계 + §7.1 게이트 분리                                                                   |
| R-2 | 12 도형 feasibility — native 9 + 시각 동등 3 (옵션 ii 채택)                                                                     | ✅ §1.1 / AC-2.2 다운그레이드 / BoardShapePalette 툴팁 매핑 (§5 PDCA-2) / Non-Goals 에 freedraw 폴백 기각 명시                     |
| R-3 | AC-6.1 adaptive throttle (idle 250 / drawing 33) + 권장 25명·안전 35명 UI 가이드                                                | ✅ AC-6.1 변경 + UI 가이드 칩 (§5 PDCA-6) + Non-Goals 에 30명×16ms 일률 기각                                                       |
| R-4 | PDCA-6 awarenessPoll 변경을 controlled regression 표시 + env var rollback + 회귀 테스트                                         | ✅ Principle 5 수정 / AC-6.4 신규 / §5 PDCA-6 의 `YDocBoardServer.awarenessPoll.regression.test.ts` 추가 / ADR Consequences 부정 4 |
| R-5 | Template-lock 신뢰 경계 → 클라이언트 신뢰 채택, ADR Consequences 명기                                                           | ✅ ADR Consequences §3 부정 3 + R11 신규 + AC-3.2 주석                                                                             |
| R-6 | AC-9.3 duplicate pending design-stage (옵션 ii)                                                                                 | ✅ AC-9.3 "pending design-stage resolution" 라벨 + open-questions.md 의 R12 추적                                                   |
| R-7 | xlsx-js-style 제거, exceljs 활용 명시                                                                                           | ✅ §1.1 / §2.2 Driver 1 / AC-8.2 / §5 PDCA-8 / R9 단순화                                                                           |
| R-8 | boardRules SRP shift — boardPermissionRules.ts + boardListRules.ts 분할                                                         | ✅ §5 PDCA-5 (boardPermissionRules 신규) / §5 PDCA-9 (boardListRules 신규)                                                         |
| S-1 | PDCA-1 toolbar scaffold +30 LOC                                                                                                 | ✅ AC-1.0 / §5 PDCA-1 "HTML scaffold 우선"                                                                                         |
| S-2 | authorAwarenessId fallback 명확화 (Y.Map 보조 저장소)                                                                           | ✅ R2 mitigation / AC-1.5 / SP-1 fail 분기                                                                                         |
| S-3 | 병렬 세션 비충돌 매트릭스                                                                                                       | ✅ §5.0 신규 표                                                                                                                    |
| S-4 | Antithesis 통합                                                                                                                 | ✅ §2.5 신규 + ADR Why chosen + PDCA-0.5 자체                                                                                      |
| S-5 | Tradeoff Tension 명시                                                                                                           | ✅ §2.6 신규 표 (3 tension)                                                                                                        |

**PDCA 단계 수 변경**: 10 → **11** (PDCA-0.5 Spike 추가).

**Iter2 변경 라인 수 추정**: ADR 부정 3 항목 +3 / Principle 5 수정 / Risks +2 (R11, R12) / Acceptance Criteria +5 (AC-1.0, 1.5, 6.4, 6.5, 9.3 라벨) / §2.5 §2.6 §5.0 §9 §10 신규 / PDCA-0.5 신규 / PDCA-2 다운그레이드 / PDCA-5 PDCA-9 분할 명시 — **총 plan length 591 → ~745 line**.

### iter3 (Final Polish, 2026-05-22)

- **W1 적용**: §7.3a Verification Steps 에 "PDCA-9 시작 전 design 문서 게이트 확인" 추가 (collab-board-rb-parity.design.md 에 AC-9.3 결정 기록 필수).
- **W2 적용**: AC-6.2 에 fps 측정 도구 명시 (Playwright RAF counter / CDP trace category `devtools.timeline`) + PDCA-10 fps probe 추가.
- **W4 적용**: AC-10.3 시나리오 "5+ → 9+" 명확화, 9 카테고리 명시 (만다라트·스티커·도형·템플릿·권한·awareness·공유·내보내기·홈 액션).
- **W3 / W5**: design-stage 에서 자연스럽게 흡수 (plan 변경 없음). W3 (AC-1.2 element 동기화 latency) 는 SP-3 가 충분히 커버. W5 (R6 ModalCoordinator priority PDCA-7 일정) 는 design-stage 결정 자연스럽게 흡수.
- **Consensus Status 메타데이터** plan 최상단 추가 (Architect 9/10 + Critic 9/10 + 5-Criterion Breakdown).
- **Status**: pending approval 마킹 (사용자 명시적 실행 승인 필요).
