# 업데이트 안내 친화도 개선 (Update Notification Friendliness Overhaul) Planning Document

> **Summary**: v2.0.3 직후 사용자 피드백("업데이트 안내가 Threads 게시글처럼 친절하면 좋겠어")을 받아 인앱 업데이트 안내(`UpdateNotification` 모달 + `AppInfoSection` 릴리즈 노트)의 톤·정보 계층·a11y를 Threads 콘텐츠 수준으로 끌어올린다. 동시에 `release-notes.json` 한 곳에서 Threads 타래·카드뉴스 프롬프트·노션 가이드를 자동 파생하는 변환 파이프라인을 도입해 향후 4채널 동기화 비용을 절반 이하로 낮춘다. **v2.0.4 patch에 [Drop→Navigate 시스템 크래시 핫픽스](desktop-organize-drop-crash-fix.plan.md)와 함께 묶어 릴리즈**한다.
>
> **Project**: SsamPin
> **Version**: v2.0.4 (예정 — patch, drop-crash-fix와 묶음)
> **Author**: pblsketch
> **Date**: 2026-05-07
> **Status**: Draft v0.2 (사용자 승인 — 2026-05-07)
> **Scope**: Stretched (사용자 결정 — Layer 1+2+3, 약 2주)
>
> **v0.2 변경사항** (2026-05-07):
> - D-03 (v2.0.3 description 소급 정비) → **Out of Scope 확정** (사용자 결정 "소급은 하지 않음")
> - D-14 (Release Workflow Step 6 문서화) → **확정 + 즉시 적용** (사용자 결정 "문서화 필요"). MEMORY.md Step 6를 5단계 분리 명령으로 갱신해 v2.0.4 개발 사이클 즉시 보호.

---

## 1. 개요

### 1.1 목적

이 PDCA가 해결하는 문제:

1. **인앱 업데이트 안내가 같은 콘텐츠임에도 Threads 게시글보다 "건조"하게 느껴진다**. v2.0.3 직후 사용자 명시 피드백. 비교 기준은 [`docs/release-notes-assets/v2.0.3/threads-post.md`](e:/github/ssampin/docs/release-notes-assets/v2.0.3/threads-post.md). 사용자는 Threads 콘텐츠가 "더 좋다"고 분명히 평가했다.
2. **렌더링 버그로 6개 highlights 중 1개만 노출**. [`UpdateNotification.tsx:22`](src/adapters/components/common/UpdateNotification.tsx#L22)의 `VersionNote.highlights: string` 타입 선언이 실제 JSON 데이터(`string[]`)와 불일치해, 모달이 첫 원소만 단독 렌더하고 나머지 5개가 묻힌다. 이 한 줄이 정보 손실의 가장 큰 원인.
3. **a11y 누락**. ESC 키로 닫기 불가, focus-trap 없음, chevron 회전 transition deadcode(인라인 `style={transform}`이 Tailwind transition을 무시), 하드코딩 `bg-blue-500/20` 색상이 라이트 테마 명도 대비를 보장하지 않음.
4. **4채널 콘텐츠 동기화 비용**. 인앱 / Threads / 카드뉴스 / 노션 가이드를 매 릴리즈마다 따로 작성한다(릴리즈당 약 2시간). master 1개에서 자동 파생할 수 있는 구조가 부재.
5. **release-notes.json description 작성 가이드 부재**. v2.0.3은 슬롯 구조 없이 한 문단 압축 형태로 작성됨. 다음 릴리즈부터 일관된 친근 톤을 유지하려면 작성 가이드(템플릿)가 필요.

### 1.2 배경

2026-05-07 v2.0.3 릴리즈 직후 사용자 피드백:
> "업데이트 후 프로그램에서 사용자들에게 안내되는 업데이트 안내가 좀더 친절하고, 상세하면 좋겠어. 그리고 threads 콘텐츠와 통일감이 있으면 좋겠어. 지금은 조금 내용이나 톤이 달라 threads 콘텐츠가 더 좋아."

같은 세션에서 두 전문 에이전트(UI/UX = `bkit:frontend-architect`, 마케팅 카피 = `general-purpose` with copywriting brief)에게 병렬 분석을 의뢰한 결과 **본질이 어미(~합니다 vs ~어요)가 아니라 정보 구조 + 공감 마무리**라는 결론에 합의했다.

| 차원 | release-notes.json 현재 | Threads 게시글 (Gold Standard) |
|------|-----------------------|------------------------------|
| 진입 | 설정 경로부터 시작 (How) | 본질부터 시작 (Why) |
| 호흡 | 한 문단에 정보 압축 | 리드 → 빈 줄 → 불릿 → 빈 줄 → 마무리 |
| 시점 | 기능 주체 | 사용자 시점 |
| 마무리 | 없음 | 매 항목 1줄 공감 마무리 |
| 시각 | 줄바꿈·불릿 부재 | em-dash, ·, 빈 줄로 호흡 |

사용자 결정:
- v2.0.3은 그대로 두고 v2.0.4부터 도입 (소급 정비 X)
- Stretched 스코프 — Layer 1(카피 프레임워크) + Layer 2(UI 렌더링) + Layer 3(자동 파생)
- 약 2주 사이클
- v2.0.4 patch에 [drop-crash-fix](desktop-organize-drop-crash-fix.plan.md)와 묶어 릴리즈

### 1.3 관련 문서

- 사용자 피드백: 본 세션 대화 (2026-05-07)
- UI/UX 분석 결과: 본 세션 `bkit:frontend-architect` 응답 (요약은 §3에 반영)
- 마케팅 카피 분석 결과: 본 세션 `general-purpose` 응답 (요약은 §3에 반영)
- Threads 톤 가이드(락): [`docs/release-notes-assets/THREADS-POST-STYLE.md`](e:/github/ssampin/docs/release-notes-assets/THREADS-POST-STYLE.md)
- 카드뉴스 스타일 가이드(락): [`docs/release-notes-assets/CARD-NEWS-STYLE.md`](e:/github/ssampin/docs/release-notes-assets/CARD-NEWS-STYLE.md)
- v2.0.3 Gold Standard: [`docs/release-notes-assets/v2.0.3/threads-post.md`](e:/github/ssampin/docs/release-notes-assets/v2.0.3/threads-post.md)
- 인앱 안내 source: [`public/release-notes.json`](e:/github/ssampin/public/release-notes.json)
- 인앱 컴포넌트:
  - [`src/adapters/components/common/UpdateNotification.tsx`](e:/github/ssampin/src/adapters/components/common/UpdateNotification.tsx) (346줄)
  - [`src/adapters/components/Settings/AppInfoSection.tsx`](e:/github/ssampin/src/adapters/components/Settings/AppInfoSection.tsx) (597줄)
- 묶음 릴리즈: [`desktop-organize-drop-crash-fix.plan.md`](desktop-organize-drop-crash-fix.plan.md)
- 디자인 시스템: `tailwind.config.js` `sp-*` 토큰 (Impeccable Audit v3 86점), 공용 [`Modal.tsx`](e:/github/ssampin/src/adapters/components/common/Modal.tsx) (focus-trap 내장)

---

## 2. 범위

### 2.1 포함 범위 (In Scope)

#### Layer 1 — 카피 프레임워크 (P1)
- **4슬롯 description 템플릿** 정착: `[리드] → [불릿 3~5개] → [How: 설정 경로] → [공감 마무리]`
- **작성 길이 가이드**: highlights 40~60자 / 단순 fix 80~150자 / new·major 250~400자 / 절대 상한 500자
- **톤·기호 가이드**: 옆자리 선배 교사 톤(~어요/~합니다 혼용), 이모지 0개(highlights 첫머리 1개만 예외), em-dash `—`, 불릿 `·`, UI 경로 `[설정 > 위젯]` 대괄호
- **스타일 가이드 문서 신설**: `docs/release-notes-assets/RELEASE-NOTES-WRITING-STYLE.md` — THREADS-POST-STYLE.md / CARD-NEWS-STYLE.md와 짝
- **v2.0.4 자체 release-notes.json 작성 시 즉시 적용**: drop-crash-fix 항목과 신규 친화도 개선 항목을 4슬롯으로 작성 (테스트 케이스 역할)
- **v2.0.3 description 점진 정비 (선택)**: 큰 3개(native-desktop / NEIS sync / 백업 센터)부터 4슬롯으로 리라이트. 마케팅 에이전트가 이미 before/after 샘플 제공 — 작업량 적음. 사용자 결정 사항.

#### Layer 2 — UI 렌더링 (P1)
- **타입 버그 수정 (가장 효과적인 단일 변경)**: `VersionNote.highlights: string` → `string[]`. 두 컴포넌트 동시 수정.
- **UpdateNotification 모달 정보 계층 재설계**:
  - 헤더: "쌤핀이 vX.X.X로 업데이트됐어요" + 날짜 + 닫기
  - 서브헤더: 1줄 "이번 버전 컨셉" 카피 (Threads Thread 1 메인 카피와 동일)
  - 하이라이트 영역: highlights 배열 6개 풀 노출 (·로 불릿 처리)
  - 변경 내역: 기본 접힘 [N개 변경 내역 자세히 보기 ▼], 펼치면 type 태그 + title + 4슬롯 description
  - 푸터 CTA 3개: [닫기] / [노션 가이드 ↗] / [피드백 ↗]
- **AppInfoSection 릴리즈 노트 카드 재구성**:
  - 현재 버전 = 기본 펼침, "이번 버전에서 달라진 점" 강조 헤더
  - highlights 배열 우선 노출, changes는 기존 badge 형태 유지
  - 과거 버전은 기본 접힘, [이전 버전 기록 보기]로 명확화
- **공용 `Modal.tsx`로 마이그레이션**: focus-trap-react·ESC·overlay 클릭 닫기 자동 획득. 일관성 확보.
- **chevron transition fix**: 인라인 `style={transform}` → `className`(`transition-transform duration-200 rotate-180`)
- **a11y 보강**: `aria-expanded`, `aria-controls`, 다운로드 진행률 영역에 `aria-live="polite"`, 키보드 포커스 순서(닫기 → 상세 → CTA)
- **디자인 토큰 정합화**: `bg-blue-500/20` 등 하드코딩 → `bg-sp-accent/20` 계열. 라이트/다크 양쪽 명도 대비 검증.
- **마크다운 불릿 렌더 처리**: description 내 `· ` 시작 줄을 `<li>` 변환. 별도 마크다운 파서 없이 split+map. `**bold**` 강조 처리는 단순 정규식.

#### Layer 3 — 자동 파생 변환 파이프라인 (P2)
- **`scripts/release-notes-to-threads.mjs` 신설**: release-notes.json의 한 버전 항목 → Threads 8타래 본문 변환. 4슬롯 description의 [리드]+[불릿]+[How]+[마무리]를 그대로 매핑.
- **`scripts/release-notes-to-card-prompts.mjs` 신설**: 8장(인트로 1 + 콘텐츠 6 + 아웃트로 1) 카드 프롬프트 자동 생성. CARD-NEWS-STYLE.md 템플릿 + version highlights 채움.
- **`scripts/release-notes-to-notion-blocks.mjs` 신설 (선택, P2 후순위)**: 노션 가이드 메인 페이지 callout 블록 + 변경 페이지 차이 자동 생성.
- **`notionUrl` 옵션 필드** (스키마 비파괴 확장): change 항목에 `notionUrl?: string` 추가. UpdateNotification 모달이 있을 때만 [📖 자세히 보기 ↗] 인라인 링크 노출.
- **변환기 검증**: v2.0.3 데이터로 dry-run하여 기존 수동 작성 결과와 80% 이상 일치 확인. (수정은 디테일·이모지 사용 등 운영 변수에 한정)

### 2.2 제외 범위 (Out of Scope, v2.0.5+)

다음은 v2.0.4 스코프 밖. 마케팅 에이전트 보고서에 추가 권고로 남았으나 본 사이클에서는 다루지 않음:

- **활성화 follow-up 토스트** (텔레메트리 인프라 필요 — "업데이트 후 7일째 native-desktop 미사용 사용자에 깨우기 토스트")
- **A/B 테스트 인프라** (메이저=모달 vs 마이너=토스트, CTA 라벨 변형, highlights 개수)
- **다국어 대비** (현재 한국어 단일)
- **검색·필터** (AppInfoSection의 버전 검색)
- **~~v2.0.3 description 소급 정비~~** — 사용자 결정 "소급은 하지 않음" (2026-05-07). 4슬롯은 v2.0.4 신규 항목부터 적용.
- **v2.0.0~2.0.2 description 소급 정비** (전체 소급 일괄 비대상)
- **노션 deep link 자동 생성**: notionUrl은 수동 입력 필드로만 도입. 자동 매핑은 별도 PDCA.

### 2.3 비목표

- **release-notes.json 스키마 파괴 변경 금지**. `highlights: string[]` 타입 정합화는 데이터가 이미 배열이므로 비파괴. `notionUrl` 추가는 옵션 필드로 비파괴.
- **NEIS Schedule 관련 어떤 파일도 건드리지 않음** (다른 세션 작업 중 — 메모리 명시 지시).
- **업데이트 알림 자체의 메커니즘은 손대지 않음** (electron-updater 흐름·다운로드 진행률·재시작 로직 그대로 유지). UI 렌더링·카피만 손본다.

---

## 3. 산출물 (Deliverables)

| ID | 산출물 | Layer | 우선순위 |
|----|-------|-------|--------|
| D-01 | `RELEASE-NOTES-WRITING-STYLE.md` 신규 — 4슬롯 템플릿 + 길이·톤·기호 가이드 | 1 | P1 |
| D-02 | v2.0.4 자체 release-notes.json 항목 (drop-crash-fix + 친화도 개선) — 4슬롯 작성 | 1 | P1 |
| ~~D-03~~ | ~~v2.0.3 description 큰 3개 4슬롯 리라이트~~ — **Out of Scope (사용자 결정 2026-05-07)** | ~~1~~ | — |
| D-04 | `VersionNote.highlights: string[]` 타입 정합화 (UpdateNotification + AppInfoSection 동시) | 2 | P1 |
| D-05 | `UpdateNotification.tsx` 정보 계층 재설계 (서브헤더·6개 highlights·접힘 changes·CTA 3개) | 2 | P1 |
| D-06 | 공용 `Modal.tsx` 마이그레이션 (focus-trap·ESC·overlay 클릭) | 2 | P1 |
| D-07 | `AppInfoSection.tsx` 릴리즈 노트 카드 재구성 (현재 버전 기본 펼침·highlights 우선) | 2 | P1 |
| D-08 | a11y 보강 (aria-expanded·aria-live·키보드 순서·chevron transition fix·sp-* 토큰화) | 2 | P1 |
| D-09 | `scripts/release-notes-to-threads.mjs` — 변환 스크립트 + v2.0.3 dry-run 검증 | 3 | P2 |
| D-10 | `scripts/release-notes-to-card-prompts.mjs` — 카드 프롬프트 자동 생성 | 3 | P2 |
| D-11 | `notionUrl?: string` 옵션 필드 도입 + 모달 [📖 자세히 보기] 인라인 링크 | 3 | P2 |
| D-12 | (선택) `scripts/release-notes-to-notion-blocks.mjs` | 3 | P3 |
| D-13 | 묶음 핫픽스 [`desktop-organize-drop-crash-fix`](desktop-organize-drop-crash-fix.plan.md) Design v0.2 → 구현 | — | P0 |
| D-14 | **MEMORY.md Release Workflow Step 6 갱신** — 5단계 분리 명령(npx tsc → vite → vite student → build-electron → electron-builder) | — | P1 (사용자 확정 — 즉시 적용) |

**누적 비-Layer 산출물 (v2.0.4 릴리즈 통합)**
- 릴리즈 산출물: ssampin-Setup.exe + macOS arm64/x64 DMG + latest.yml + latest-mac.yml (자산 8종)
- 마케팅 자료: `docs/release-notes-assets/v2.0.4/cards/*.png` (8장) + `threads-post.md` (8 타래) — Layer 3 변환기로 자동 생성하여 검증

---

## 4. 구현 계획 (2주 타임라인)

### Week 1 — 기반 + Layer 1·2

| Day | 작업 | 산출물 | 의존성 |
|-----|------|-------|-------|
| D1 (월) | RELEASE-NOTES-WRITING-STYLE.md 작성 + 사용자 리뷰 | D-01 | — |
| D1 (월) | drop-crash-fix Design v0.2 → Implementation 시작 (다른 트랙 병렬) | D-13 | — |
| D2 (화) | `VersionNote.highlights` 타입 1줄 fix → 즉시 6개 highlights 노출 검증 | D-04 | D-01 |
| D2-3 (화-수) | UpdateNotification 정보 계층 재설계 + Modal 마이그레이션 | D-05, D-06 | D-04 |
| D3-4 (수-목) | AppInfoSection 릴리즈 노트 카드 재구성 | D-07 | D-04 |
| D4-5 (목-금) | a11y 보강 + sp-* 토큰화 + chevron fix | D-08 | D-05, D-07 |
| D5 (금) | drop-crash-fix Implementation 완료 → 자체 QA | D-13 | — |

**Week 1 완료 시 검증 가능**: highlights 6개 풀 노출 / ESC 닫기 / 라이트 테마 명도 / drop-crash-fix 통합 빌드.

### Week 2 — Layer 3 + 통합 + 릴리즈

| Day | 작업 | 산출물 | 의존성 |
|-----|------|-------|-------|
| D6-7 (월-화) | release-notes-to-threads.mjs 변환기 + v2.0.3 dry-run 검증 | D-09 | D-01 |
| D7-8 (화-수) | release-notes-to-card-prompts.mjs 변환기 | D-10 | D-01, D-09 |
| D8 (수) | notionUrl 옵션 필드 + 모달 인라인 링크 | D-11 | D-05 |
| D9 (목) | v2.0.4 release-notes.json 자체 작성 (4슬롯 적용 첫 케이스) | D-02 | D-01 |
| D9-10 (목-금) | gap-detector 검증 + 통합 QA + 빌드 + 자산 검증 | — | 전체 |
| D10 (금) | 릴리즈 (5단계 분리 빌드 — 메모리 회피책 적용) + 카드 8장 자동 생성 | — | D-09, D-10 |

**병렬 가능 작업**: drop-crash-fix는 다른 PDCA 진행 중이라 Day 1~5 동시 진행. Layer 3 변환기 2종은 서로 독립이라 동시 진행 가능.

### 4.1 빌드·배포 트러블 회피 (메모리 기록 적용)

CLAUDE.md / MEMORY.md에 기록된 빌드 트러블:
- `npm run build`의 `&&` 체이닝이 vite 후 EXIT 127로 끊김
- **회피책**: `npx tsc -b` → `npx vite build` → `npx vite build --config vite.student.config.ts` → `node scripts/build-electron.mjs` → `npx electron-builder` 5단계 분리 실행

본 PDCA에서 CLAUDE.md `## Release Workflow` Step 6를 5단계 분리 명령으로 갱신하는 것은 **부수 산출물(D-14, P3)** 로 추가.

---

## 5. 위험 및 완화

| 위험 | 영향 | 가능성 | 완화 |
|------|------|--------|------|
| `highlights: string[]` 타입 변경이 구버전 JSON과 호환 안 됨 | 모달 빈 화면 | 낮 | `string \| string[]` 유니온 또는 normalize 헬퍼로 양쪽 수용 |
| Layer 3 자동 변환기가 운영 톤·이모지 변형을 100% 못 잡음 | Threads 결과 후처리 필요 | 중 | 80% 일치 목표, 나머지 20%는 수동 후편집 허용. 자동 출력 직후 사람이 한 번 보정. |
| 공용 Modal로 마이그레이션 시 모달 내부 스크롤·다운로드 진행률 영역이 깨짐 | 다운로드 UX 회귀 | 중 | Modal 컴포넌트의 children scroll 영역 prop 활용. 다운로드 중 ESC dismiss 의도치 않은 닫힘 방지 가드. |
| AppInfoSection 597줄 중 일부가 다른 도메인 기능과 결합 | 의도치 않은 부수 효과 | 낮 | 릴리즈 노트 섹션만 isolated 수정. 다른 섹션(개발자 모달, 자동 시작 등)은 손대지 않음. |
| drop-crash-fix와 동시 머지로 git 충돌 | 머지 시간 손실 | 중 | drop-crash-fix는 electron/* 영역, 친화도는 src/adapters/* 영역으로 자연 분리. 충돌 가능성 낮음. |
| 사용자가 4슬롯 템플릿을 받아 직접 작성하기 어려워함 | Layer 1 정착 실패 | 낮 | RELEASE-NOTES-WRITING-STYLE.md에 v2.0.3 before/after 샘플 3개 포함 + 변환기 dry-run 결과를 작성 보조 도구로 활용 |
| Threads-post.md 자동 생성 결과가 v1.10.2 락된 스타일과 어긋남 | 톤 일관성 손상 | 중 | 변환기에 THREADS-POST-STYLE.md §7 템플릿을 직접 참조. 매 릴리즈마다 자동 출력 → 사람 검수 → 발행 순서. |

---

## 6. 인수 기준 (Acceptance Criteria)

### A. Layer 1 (카피)
- [ ] RELEASE-NOTES-WRITING-STYLE.md 작성 완료, THREADS-POST-STYLE.md / CARD-NEWS-STYLE.md와 같은 위치에 비치
- [ ] 4슬롯 템플릿 + before/after 샘플 3개 포함
- [ ] v2.0.4 release-notes.json 자체 항목이 4슬롯으로 작성되어 있음

### B. Layer 2 (UI)
- [ ] 모달에서 highlights 6개 모두 노출됨 (이전엔 1개만)
- [ ] ESC 키로 모달 닫힘
- [ ] 변경 내역 기본 접힘, [N개 변경 내역 자세히 보기 ▼] 클릭 시 펼침, chevron 회전 transition 동작
- [ ] AppInfoSection의 현재 버전이 기본 펼침, 과거 버전은 기본 접힘
- [ ] 라이트 테마에서 모든 색상이 명도 대비 4.5:1 이상 (sp-* 토큰만 사용)
- [ ] 키보드만으로 모달 전체 네비게이션 가능 (닫기 → 상세 토글 → CTA 3개 순)
- [ ] 다운로드 중 ESC 키로 의도치 않은 dismiss 발생하지 않음
- [ ] 코드 회귀 0건 — 기존 수동 업데이트 트리거·다운로드·재시작·에러 처리 모두 동작

### C. Layer 3 (자동 파생)
- [ ] `scripts/release-notes-to-threads.mjs`가 v2.0.3 데이터로 dry-run 실행 시, 기존 수동 작성된 [`v2.0.3/threads-post.md`](e:/github/ssampin/docs/release-notes-assets/v2.0.3/threads-post.md)와 80% 이상 텍스트 일치 (해시태그·이모지 위치·CTA 동일)
- [ ] `scripts/release-notes-to-card-prompts.mjs`가 8장 카드 프롬프트(인트로 1 + 콘텐츠 6 + 아웃트로 1) 생성, 각 1:1 정사각, sparse/balanced 레이아웃 자동 분배
- [ ] notionUrl 옵션 필드: 있을 때만 [📖 자세히 보기 ↗] 인라인 링크 노출, 없을 때 깨끗하게 생략
- [ ] v2.0.4 자체 마케팅 자료를 자동 변환기로 1차 생성 → 수동 보정 → 발행

### D. 묶음 릴리즈
- [ ] [drop-crash-fix](desktop-organize-drop-crash-fix.plan.md) 인수 기준 모두 통과
- [ ] v2.0.4 빌드 (Win + macOS arm64 + macOS x64) 자산 8종 unversioned 업로드
- [ ] 6개 다운로드 URL 모두 302 검증
- [ ] 챗봇 KB 재임베딩 (drop-crash-fix Q&A는 이미 v2.0.4 명시로 추가됨, 친화도 개선은 사용자 노출 표면이 아니라 Q&A 추가 불필요)
- [ ] 노션 사용자 가이드: 본 PDCA는 사용자 노출 기능이 아니므로 가이드 갱신 불필요. drop-crash-fix만 갱신.
- [ ] CLAUDE.md `## Release Workflow` Step 6를 5단계 분리 명령으로 갱신 (부수 산출물 D-14)

---

## 7. 메트릭 (사후 측정 가능 지표)

| 메트릭 | 측정 방법 | 목표 |
|--------|----------|------|
| highlights 노출 개수 | DOM 스냅샷 — 모달 내 `· ` 불릿 li 수 | 6개 (현재 1개) |
| 모달 첫 화면 스크롤 길이 | viewport 높이 대비 | 1 화면 이내 (변경 내역 접힘) |
| 작성 공수 (다음 릴리즈 기준) | release-notes.json 작성 → 4채널 발행까지 시간 | 약 50% 단축 (자동 변환기 효과) |
| Threads 변환기 일치율 | v2.0.3 dry-run 결과 vs 기존 수동 결과 텍스트 유사도 | ≥ 80% |
| a11y Lighthouse 점수 (UpdateNotification 모달) | Chrome DevTools Lighthouse | ≥ 95 |
| 라이트/다크 명도 대비 | WCAG AA (4.5:1) | 모든 텍스트 통과 |

활성화율·CTA 클릭률 등 사용자 행동 지표는 **v2.0.5+ 텔레메트리 인프라 도입 후 측정** (본 PDCA Out of Scope).

---

## 8. 다음 단계

1. **이 Plan 사용자 승인** — Stretched 스코프·2주 타임라인·Drop-crash-fix와 묶음 모두 OK인지 명시 컨펌
2. **Design 단계 진입** — Layer별 구체 설계
   - Layer 1 Design: RELEASE-NOTES-WRITING-STYLE.md 초안 + before/after 샘플 3개
   - Layer 2 Design: UpdateNotification·AppInfoSection 컴포넌트 변경 diff 설계 + Modal 마이그레이션 step-by-step
   - Layer 3 Design: 변환기 입출력 스키마 + 매핑 규칙 + 검증 시나리오
3. **bkit:design-validator** 검증 (Plan/Design 일관성)
4. **Do 단계** — Layer 1 → 2 → 3 순차 + drop-crash-fix 병렬

---

> **Status**: Draft v0.1 — 사용자 승인 대기 중. 승인 후 `/pdca design update-notification-friendliness`로 Design 단계 진입.
