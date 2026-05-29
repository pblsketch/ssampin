# ADR-V — 실시간 담벼락 v2.0 dual-namespace release tag labels

- **Status**: Accepted
- **Date**: 2026-05-29
- **Authors**: Orchestrator (post-RALPLAN consensus loop: Planner ×4 / Architect ×3 / Critic 0 / manual consolidation)
- **Stakeholders**: SsamPin coordinator (wnsdlf1212@gmail.com), 실시간 담벼락 사용 교사·학생
- **Supersedes**: 없음
- **Superseded by**: 없음
- **Plan reference**: `.omc/plans/realtime-wall-clboard-v2.delta-v3.1.md` §4 H4 / OC-2 / OC-3 / D-2 / D-4
- **Parent plan**: `.omc/plans/realtime-wall-clboard-v2.md` (v3, 2026-05-22)
- **Spec reference**: `.omc/specs/deep-interview-realtime-wall-clboard.md` (16% ambiguity PASSED)

---

## 1. Context

SsamPin 실시간 담벼락 v2.0 작업은 두 가지 독립적인 버저닝 관심사를 동시에 다룬다:

1. **Domain BREAKING (entity contract bump)** — `RealtimeWallTabConfig` 신설, `RealtimeWallPost.tabId?:` 필드, `RealtimeWallBoard.tabs?:` 필드, `RealtimeWallBoard.schemaVersion: '2.0'` 필드. v1.15 → v2.0 마이그레이션은 무손실이지만 PIN 옵션→필수 강제 + WebSocket protocol 17 schema 양방향 = **도메인 인터페이스 변경**으로 분류된다 (semver-major in domain namespace).

2. **SsamPin application release cadence** — SsamPin은 다른 기능과 묶여 출시된다 (v2.0.0~v2.0.9 다발 누적). 실시간 담벼락 v2.0 작업이 머지될 시점에 다른 v2.0.x 작업(서명받기 Phase 2C·학급 약속·시간표 점심 위치 등)과 동반 출시되어 사용자 측면의 릴리즈는 `v2.1.0 묶음 릴리즈` 라벨을 사용한다 (Phase F 작업물 `release-checklist.md` + `notion-guide-draft.md` 의 명명 그대로).

이 두 관심사가 **하나의 squashed merge** 안에서 충돌한다:

- parent v3 plan §1 + §3 ADR 은 "v2.0.0 BREAKING 단일 릴리즈" 표기
- Phase F 작업물 (`release-checklist.md` line 1·3·111, `notion-guide-draft.md` line 1·11·19·112) 은 "v2.1.0 묶음 릴리즈" 표기
- 한쪽이 오류인지, 두 라벨이 서로 다른 추상화 층(domain vs app bundle)을 가리키는 것인지 가 명확하지 않음

**Risk if unresolved**: release-notes.json / CHANGELOG.md / Notion guide / chatbot KB **4 채널**에 라벨이 비일관적으로 흩어진다 → 사용자(교사)가 "지금 받은 업데이트가 v2.0인지 v2.1인지" 혼란 → 마이그레이션 가이드 미도달 → v1.x 보드를 새 보드 도구로 잘못 인지하는 등 신뢰 손실. Delta v3.1 risk register D-4 (Med likelihood / High impact).

## 2. Decision

**Adopt dual-namespace release tag pair on a single squashed merge.**

| Tag namespace       | Value            | 의미                                                                                                                           |
| ------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Domain library      | `domain-v2.0.0`  | 실시간 담벼락 entity contract BREAKING (RealtimeWallTabConfig 신설, schemaVersion '2.0', PIN required, WS protocol 17 schemas) |
| SsamPin application | `ssampin-v2.1.0` | 사용자 측면의 묶음 릴리즈 — 실시간 담벼락 + 다른 v2.0.x 작업의 누적 출시                                                       |

두 태그는 **단일 squashed merge commit** 위에 함께 적용된다 (commit pointer 동일). R6 의무(단일 BREAKING, 사용자 측면 단일 릴리즈)에 정합.

## 3. Consequences

### 3.1 4채널 release coherence

모든 사용자-가시 / 도구-가시 채널은 **두 태그를 모두 참조**한다:

| 채널                                                             | 표기                                                                                                                                               | 위치                   |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `CHANGELOG.md`                                                   | 헤더: `## [ssampin-v2.1.0 / domain-v2.0.0] - YYYY-MM-DD`                                                                                           | 단일 entry block       |
| `public/release-notes.json`                                      | `appVersion: "v2.1.0"`, `domainVersion: "v2.0.0"`, `breakingChanges: [{namespace: "domain", from: "v1.15", to: "v2.0.0", scope: "realtime-wall"}]` | v2.1.0 block           |
| `docs/04-report/features/realtime-wall-v2-release-checklist.md`  | `v2.1.0 묶음 릴리즈` 표기 유지 + 상단에 "도메인 BREAKING `domain-v2.0.0` 동반 — 본 ADR-V 참조" 한 줄 추가                                          | 머리말                 |
| `docs/04-report/features/realtime-wall-v2-notion-guide-draft.md` | `v2.1.0` 표기 유지 + ADR-V 참조 한 줄 추가                                                                                                         | §1 callout             |
| `scripts/ingest-chatbot-qa.mjs`                                  | v2.0/v2.1 라벨 모두 검색 hit 하도록 Q&A 5+건의 메타 태그 다중 부여                                                                                 | realtime-wall Q&A 블록 |

### 3.2 마이그레이션 안내 메시지

`scripts/ingest-chatbot-qa.mjs` + `release-notes.json` 의 `migrationGuide` 필드는 다음 한국어 카피로 통일:

> "이번 v2.1.0 묶음 릴리즈에 실시간 담벼락 도메인 BREAKING(`domain-v2.0.0`)이 포함되어 있습니다. 기존 보드는 자동으로 v2.0 구조로 마이그레이션되며(무손실), PIN 입력은 신규 보드만 기본 필수입니다. 기존 v1.15 보드의 PIN 정책은 변경되지 않습니다."

### 3.3 OOS 보호 (5 항목 잠금 재확인)

- ❌ attachment-expansion
- ❌ card-form-diversification
- ❌ lifecycle-polish
- ❌ library-publish
- ❌ project-elevation

위 5 항목은 v2.0.0 도메인 + v2.1.0 앱 묶음 릴리즈에 **포함되지 않는다**. spec §Non-Goals 그대로.

### 3.4 R6 compliance

> R6 forbids: multiple user-visible release tags requiring separate user adaptation, runtime feature flags gating user behavior, phased rollouts with distinct user cohorts.

**dual-namespace tag 는 R6 위반이 아니다.** 두 태그가 가리키는 commit pointer 가 동일하므로:

- 사용자가 받는 빌드는 **단일 application release** (`ssampin-v2.1.0`)
- 도메인 컨트랙트 변경은 **단일 BREAKING 모멘트** (`domain-v2.0.0`)
- 사용자는 두 번 적응할 필요 없음 — 한 번의 자동 마이그레이션
- feature flag 없음
- phased rollout 없음

`semver-namespacing ≠ phased rollout`. R6 의 의도(사용자 측면 단일 릴리즈)는 보존된다.

### 3.5 Trade-offs

**ADR-V 채택 비용**:

- 4채널에서 dual-label 작성 필요 (코드 +기능 분량 ~150 LOC 문서 수정)
- CHANGELOG 헤더 한 줄이 길어짐
- 처음 release-notes.json 을 읽는 도구가 `domainVersion` 필드를 처리하도록 갱신 필요 (chatbot KB ingest 스크립트는 메타 태그 다중 등록)

**ADR-V 거절 비용 (대안 mass-rename 시)**:

- parent v3 plan §1 + §3 ADR 의 `v2.0.0` 표기를 `v2.1.0` 으로 일괄 변경 → 도메인 컨트랙트 변경 의도가 묻힘 (v2.0.x 시리즈 안에서 BREAKING 인지 minor 인지 명확치 않음)
- 또는 Phase F 문서 2종의 `v2.1.0` 을 `v2.0.0` 으로 일괄 변경 → SsamPin app cadence 의도가 사라짐 (다른 v2.0.x 작업이 묶음 릴리즈된다는 사실이 묻힘)
- 어느 한쪽을 mass-rename 하면 다른 한쪽 의도가 손실

→ dual-label 표기가 두 의도를 모두 보존한다.

## 4. Alternatives Considered

### Alt-1 — Mass-rename to `v2.0.0` (Phase F 문서를 plan 표기에 맞춤)

- **Pros**: parent v3 plan 과 의미 정합
- **Cons**: `release-checklist.md` + `notion-guide-draft.md` 의 "묶음 릴리즈" 의도 손실; 다른 v2.0.x 작업이 동반 출시되는 사실을 사용자에게 전달 불가
- **REJECTED**: SsamPin 출시 cadence 우선

### Alt-2 — Mass-rename to `v2.1.0` (plan 을 Phase F 문서에 맞춤)

- **Pros**: 사용자-가시 라벨 단일화
- **Cons**: 도메인 BREAKING 의 semver-major 의도가 묻힘 → 향후 사용자/AI 에이전트가 `RealtimeWallPost.tabId?:` 추가를 minor 로 오해할 수 있음
- **REJECTED**: 도메인 컨트랙트 신호 손실

### Alt-3 — Dual-tag (이 ADR)

- **Pros**: 두 의도 보존, R6 호환, 4채널 일관성 enforceable
- **Cons**: dual-label 작성 비용 + tooling 학습
- **ACCEPTED**

## 5. Follow-ups

- Post-γ merge: ADR-V 가 actively 참조되는지 6주 후 점검 (release-notes.json 파서 + chatbot KB 검색 hit 비율)
- v3.x 시리즈 진입 시: dual-namespace 패턴을 표준화할지 여부 별도 ADR
- 다른 도메인 BREAKING (예: 학급 약속 v2 if happens) 발생 시: 동일 dual-namespace 패턴 적용 vs 단일 라벨 적용 선택 — 본 ADR 의 §3.4 R6 정합 논거 재사용 가능

---

## Appendix A — Citation paths

- `.omc/plans/realtime-wall-clboard-v2.md` §1 Principles · §2.1 protected files · §3 ADR
- `.omc/plans/realtime-wall-clboard-v2.delta-v3.1.md` §1.4 R6 boundary · §3 OC-2 · §4 H4 · §6 D-4 · §7 AC-6
- `.omc/specs/deep-interview-realtime-wall-clboard.md` §Acceptance Criteria · §Non-Goals
- `docs/04-report/features/realtime-wall-v2-release-checklist.md` (label v2.1.0)
- `docs/04-report/features/realtime-wall-v2-notion-guide-draft.md` (label v2.1.0)
- `public/release-notes.json` (TBD — γ phase 시 갱신)
- `CHANGELOG.md` (TBD — γ phase 시 entry 추가)
- `scripts/ingest-chatbot-qa.mjs` (TBD — γ phase 시 Q&A 5+건 추가)
