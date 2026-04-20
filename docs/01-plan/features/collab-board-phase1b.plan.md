---
template: plan
version: 0.1
feature: collab-board-phase1b
date: 2026-04-21
author: pblsketch
project: ssampin
version_target: v1.12.x (TBD)
status: draft — 베타 피드백 수집 대기
depends_on: collab-board.plan.md (Phase 1a)
---

# 쌤핀 협업 보드 Phase 1b 기획서 — Jamboard 스타일링

> **요약**: Phase 1a MVP가 v1.10.3 베타로 2026-04-20 배포되었다. Phase 1b는 "Jamboard 수준의 교육용 UX"에 필요한 스타일링·입력·에러 처리를 얹는 단계다. **착수 전 2~4주의 베타 피드백 수집이 전제**이며, 수집 결과가 본 문서의 우선순위·범위를 결정한다.
>
> **Phase 1a 완료 상태**: v1.10.3 베타 · 97.5% 설계 일치 · iteration #1 수렴 (`docs/04-report/features/collab-board.report.md`)
> **Phase 1b 착수 조건**: (1) 베타 피드백 최소 3건 수집, (2) 치명적 버그 0건, (3) v1.11.x 릴리즈 슬롯 확보
> **Status**: Draft (피드백 대기)

---

## 1. Overview

### 1.1 Purpose

Phase 1a에서 **"30명이 같이 그린다"는 최소 동작**을 달성했다. Phase 1b는 그 위에 **"Jamboard처럼 교실에서 쓸 만하다"**는 체감을 얹는 것이 목적이다.

구체적으로:
- 기본 Excalidraw UI의 "손그림 낙서" 톤을 **교육 현장에 맞는 깔끔한 느낌**으로 조정
- 스티키 노트·페이지 시스템 등 **Jamboard 교사들이 기대하는 관용 기능** 추가
- 학생 태블릿(iPad + Pencil) 사용 시 **팜 리젝션** 등 입력 품질 개선
- 학생 입장 화면·에러 처리 UI 보강으로 **"첫 3분" 경험** 다듬기

### 1.2 Background — 왜 Phase 1a에서 분리되었는가

원본 구현계획(2026-04-19 `docs/archive/2026-04/쌤핀_협업보드_구현계획.md`)은 Jamboard 스타일링까지 Phase 1에 포함했지만, 계획리뷰(`docs/archive/2026-04/쌤핀_협업보드_계획리뷰.md`)가 **Phase 1 범위 과다**를 지적하며 1a/1b 분리를 권고했다. 그 권고를 채택한 결과:

- **1a (v1.10.3)**: Clean Architecture·Y.js 서버·터널·인증·자동 저장 — 기술 기반
- **1b (본 문서)**: 커스텀 툴바·스티키 노트·페이지·팜 리젝션 — 사용자 체감

이 분리 덕에 1a를 교실 테스트 가능한 베타로 먼저 보낼 수 있었고, 1b 범위는 **실제 교사 피드백에 근거하여 재우선화**할 수 있게 되었다.

### 1.3 Related Documents

- Phase 1a Plan: [collab-board.plan.md](./collab-board.plan.md)
- Phase 1a Design: [collab-board.design.md](../../02-design/features/collab-board.design.md)
- Phase 1a Report: [collab-board.report.md](../../04-report/features/collab-board.report.md) (97.5% 일치)
- Phase 1a Analysis: [collab-board.analysis.md](../../03-analysis/collab-board.analysis.md)
- 아카이브된 원본 계획: [docs/archive/2026-04/쌤핀_협업보드_구현계획.md](../../archive/2026-04/쌤핀_협업보드_구현계획.md)
- 아카이브된 1차 리뷰: [docs/archive/2026-04/쌤핀_협업보드_계획리뷰.md](../../archive/2026-04/쌤핀_협업보드_계획리뷰.md)

---

## 2. Phase 1a Retrospective — 실제 구현 결정 기록

원본 계획리뷰가 지적한 5개 Blocker는 **실용적 대안**으로 모두 해결되었다. 1b 착수 시 이 결정을 그대로 승계한다.

| 리뷰의 권고 | 1a에서 실제 채택한 방식 | 근거 |
|---|---|---|
| y-excalidraw 의존 제거 → 자체 바인딩 | **y-excalidraw 2.0.12를 esm.sh CDN으로 로드 + 버전 핀** | 스파이크 S1에서 2탭 동기화 검증. npm 의존성 미포함 → 번들 사이즈 영향 0 |
| 학생 웹앱 Vite 별도 빌드 | **인라인 HTML 유지 + Excalidraw CDN** (`src/infrastructure/board/generateBoardHTML.ts`) | 기존 쌤도구 5종의 인라인 HTML 패턴 깨지 않음. Vite 파이프라인 신설 비용 회피 |
| 터널 싱글턴 충돌 | ✅ `BoardTunnelCoordinator` 도입 | 멀티 터널 등록·상호 배타 정책 구현 |
| Clean Architecture 4-layer 매핑 | ✅ 전 계층 | `domain/entities/Board`, `BoardSession`, `BoardParticipant` / `usecases/board/*` 5개 / `infrastructure/board/*` 6개 |
| WebSocket 인증 없음 → 토큰·코드 검증 | ✅ `AuthorizeBoardJoin` 유스케이스 + close frame | 인증 실패 시 즉시 close, URL params로 토큰 전달 (`faadfac`) |
| 30초 자동 저장 | ✅ `SaveBoardSnapshot` + Y.Doc 바이너리 별도 파일(.ybin) | 엔티티는 메타데이터만, 바이너리는 Repository가 분리 보관 |

**결과**: 계획리뷰가 제안한 "자체 바인딩·별도 빌드 파이프라인" 대신 **CDN·인라인·버전 핀** 조합을 택했다. Phase 1b도 이 구조 위에서 작업한다 — 새 빌드 파이프라인 도입하지 않음.

---

## 3. Scope — Phase 1b 후보 작업

> **경고**: 이 섹션은 **베타 피드백이 바뀌면 우선순위가 재정렬**된다. 현재는 계획리뷰가 제안한 Phase 1b 범위를 기본값으로 두고, 피드백 수신 후 §6 Open Questions에서 결정한다.

### 3.1 Must-have (기본 포함)

- **팜 리젝션 (pointerType 필터)**
  iPad + Apple Pencil 동시 사용 시 손바닥이 캔버스를 건드리는 현상 방지. `pointerType === 'pen'`만 freedraw 허용하는 옵션 추가. Phase 1a 베타는 이 처리 없음 → 피드백에서 가장 먼저 나올 가능성 높음.

- **학생 입장 화면 다듬기**
  현재 QR 스캔 후 이름 입력만 있는 기본 폼. 중복 이름 감지, 이미 종료된 세션 접속 시 안내, 연결 끊김 시 자동 재연결 토스트를 추가.

- **학생용 에러 처리 UI**
  WebSocket 끊김·보드 종료·인증 실패 시 학생 화면에 안내 메시지 표시. 현재는 빈 화면/콘솔 에러로 방치됨.

### 3.2 Should-have (조건부 포함)

- **커스텀 좌측 툴바 (Jamboard 6개 도구)**
  Excalidraw 기본 상단 툴바 숨기고 좌측 세로 툴바(펜·도형·텍스트·스티키·지우개·선택) 구현. **리스크**: CSS 선택자(`.App-toolbar`)는 Excalidraw 0.17.6 내부 클래스라 버전 업 시 깨짐. 버전 핀 유지가 전제.

- **스티키 노트 기능**
  `convertToExcalidrawElements`로 6색 스티키 생성. Jamboard 핵심 기능. 계획리뷰 판정: 난이도 쉬움 / 달성도 95%.

- **색상 팔레트 단순화 (6색)**
  Excalidraw 기본 색상 피커 숨기고 Jamboard 6색 팔레트 대체. CSS 해킹 필요 → 툴바와 동일 리스크.

### 3.3 Nice-to-have (피드백 강하면 채택)

- **페이지 시스템 (Scene 직렬화 기반 멀티페이지)**
  **주의**: 계획리뷰 §1-③ "페이지별 Y.Doc 분리" 필수. 현재 단일 Y.Doc 구조라 페이지 전환 시 `resetScene()`이 다른 사용자의 캔버스까지 초기화하는 버그 가능. Phase 1b에서 도입한다면 **페이지별 Y.Doc 분리 설계를 먼저** 해야 함.

- **실시간 커서 공유 (Y.js awareness)**
  협업 실재감에 직결. 구현 비용 중간, 효과 큼. 단 **30명 동시 표시 시 성능 부하** 확인 필요.

### 3.4 Out of scope (Phase 2 이후)

- 역할 구분·도구 제한·포커스 모드 (Phase 2)
- 개인/그룹 보드 멀티 room (Phase 3)
- 이미지 검색 삽입·손글씨 인식·Google Drive 백업 (Phase 4)

---

## 4. Phase 1a 릴리즈에서 학습한 것들 (반드시 Phase 1b 착수 전 숙지)

### 4.1 빌드 환경 — y-leveldb transitive dep 주의

`y-websocket/bin/utils.cjs`는 optional `require('y-leveldb')`를 한다. 쌤핀은 이 경로를 쓰지 않지만 esbuild bundling 시 resolve를 시도 → GitHub Actions macOS(fresh `npm ci`)에서 실패한 이력. **`scripts/build-electron.mjs`의 `external: ['electron', 'electron-updater', 'y-leveldb']` 유지 필수**. Phase 1b에서 y-websocket 관련 패키지 추가 시 동일 패턴 점검.

### 4.2 CI — Release auto-trigger workflow의 SHA 정합 위험

`.github/workflows/build-macos.yml`이 `on: release: published` 이벤트로 릴리즈 공개 직후 **자동으로 한 번 더 빌드**하고 `softprops/action-gh-release@v2`로 에셋을 덮어쓴다. Phase 1b 릴리즈 시 **수동 업로드 타이밍과 자동 트리거 순서가 꼬이면 DMG ≠ latest-mac.yml SHA 불일치**가 재발할 수 있다. 권장:
- Option A: workflow에서 `on: release:` 제거하고 `workflow_dispatch`만 유지 (수동 트리거)
- Option B: release 생성 시 **수동 업로드를 생략**하고 workflow 자동 업로드에만 의존

Phase 1b 착수 시 §7 TBD에 포함.

### 4.3 장기 feature 브랜치 rebase 관리

`feature/collab-board`가 v1.10.2 릴리즈 기간 내내 main과 분리되어 있어서, v1.10.3 릴리즈 시 5개 커밋을 merge하며 `public/release-notes.json`·`ToolMultiSurvey.tsx`에 충돌 발생. Phase 1b는 **짧은 주기(주 1회)로 `git rebase origin/main`** 하거나 feature 브랜치를 아예 생성하지 않고 main에서 작업 (선택형 feature flag 없이는 후자가 더 간단).

### 4.4 베타 표시·피드백 경로

Phase 1a 초기에는 ToolCollabBoard·FeedbackWallView 베타 배너가 `mailto:wnsdlf1212@gmail.com`로 빠져 있어 앱 전반의 Google Form 수집 창구와 분리돼 있었다. **2026-04-21 베타 배너 2곳을 통합 Google Form(`https://forms.gle/o1X4zLYocUpFKCzy7`)로 교체**하여 `FeedbackModal`·랜딩 FAQ·Footer와 수집 경로를 일원화했다.

Phase 1b 판단 사항:
- 1a 베타 배너를 **유지**할지 / 제거할지 — 베타 졸업 시점을 Phase 1b 완료와 맞출지
- Form 응답 분류 파이프라인 (협업보드 / 발제피드백 / 기타) — 현재는 모든 응답이 같은 폼으로 들어오므로 Phase 1b 범위 확정 시 수동 분류 필요

---

## 5. Constraints

- **기존 아키텍처 유지**: Clean Architecture 4-layer · 인라인 HTML · CDN 로드 · 터널 싱글턴 정책 그대로
- **Excalidraw 버전 핀**: 0.17.6 고정 (y-excalidraw 2.0.12 peerDeps 호환). 1b 기간 중 업그레이드 금지. CSS 내부 클래스 해킹이 버전에 종속되므로.
- **번들 사이즈 영향 최소**: Excalidraw는 계속 CDN 로드. npm에 추가 의존성 추가 시 매우 신중히 판단.
- **오프라인 동작 유지**: 협업 보드는 온라인 필수지만 쌤핀 본체의 오프라인 완전 동작 원칙은 침범 금지.
- **개인정보**: 학생 IP·접속 로그 수집 금지 (PIPA). Phase 1a 기준 유지.

---

## 6. Open Questions — 베타 피드백으로 결정할 것들

| # | 질문 | 결정 시점 | 기본값 |
|---|---|---|---|
| Q1 | 팜 리젝션을 "기본 ON" 또는 "iPad 감지 시 ON" 중 어디로? | 피드백 수집 후 | 기본 ON |
| Q2 | Jamboard 스타일 커스텀 툴바가 실제로 필요한가, Excalidraw 기본 그대로 쓰는 게 더 좋은가? | 피드백 수집 후 | 커스텀 채택 |
| Q3 | 페이지 시스템 수요가 있는가? (교사들이 페이지 분리 사용을 기대하는가?) | 피드백 수집 후 | 수요 있을 시만 Phase 1b에 포함 |
| Q4 | 현재 최대 50명 동시 접속 한계가 실제 교실에서 충분한가? | 피드백 수집 후 | 유지 |
| Q5 | 커서 공유(Y.js awareness)가 "Jamboard 대비 미흡"의 핵심 원인인가? | 피드백 수집 후 | Phase 1b에 포함 |
| Q6 | Release workflow 자동 트리거 제거 여부 (§4.2)? | Phase 1b 착수 직전 | Option A (제거) |
| Q7 | 베타 졸업 시점은 Phase 1b 완료인가 2a 완료인가? | Phase 1b 완료 시점 | 1b 완료 시 |

---

## 7. TBD — 베타 피드백 수집 후 채울 섹션

본 문서는 **피드백 수집 전 Draft**이다. 다음 섹션은 피드백 수신 후 보강한다:

- **2. Scope (확정)** — Must/Should/Nice 우선순위를 피드백에 맞춰 재배치
- **3. User Stories** — 피드백에서 추출한 실제 교사 시나리오
- **4. Success Criteria** — 정량 지표 (접속 시간 / 드롭율 / 드로잉 지연 / 만족도)
- **5. Technical Approach** — 각 작업의 구현 세부안 (계획리뷰 §1 필수 조치 중 페이지별 Y.Doc 분리 설계 포함)
- **6. Timeline** — 2주 범위 안에서 스프린트 분할
- **8. Risks & Mitigations** — §4 learnings + 페이지 시스템 Y.Doc 충돌 위험 등

---

## 8. Next Actions

1. **2~4주간 베타 피드백 수집** — 통합 Google Form(`forms.gle/o1X4zLYocUpFKCzy7`) + 직접 요청한 교사 3~5명 인터뷰
2. **Form 응답 분류** — 버그(hotfix 대상) / 협업보드 UX / 발제피드백 UX / 기타 기능 요청. Form 응답 수동 확인 또는 자동 라벨링(Google Apps Script) 검토
3. **§2 Scope 확정** — Q1~Q5 답변 반영
4. **§6 Release workflow 결정** — Option A/B 선택
5. **Design 단계로 진행** — `docs/02-design/features/collab-board-phase1b.design.md` 작성

---

## 9. 결론

Phase 1a는 성공적으로 베타 배포되었다. Phase 1b는 기술적 리스크보다 **"어떤 UX가 실제로 교사에게 의미 있는가"**라는 우선순위 문제에 가깝다. 따라서 **섣불리 구현에 들어가지 않고 피드백을 먼저 모으는 것이 이 Plan의 핵심 지침**이다.

베타 피드백 3건 이상 수집 + 치명적 버그 없음 + v1.11.x 릴리즈 슬롯 확보가 확인되면, 본 문서의 §7 TBD 섹션을 채우고 Design 단계로 진행한다.

---

*Last updated: 2026-04-21 — Phase 1a 릴리즈 완료 직후 초안 작성*
