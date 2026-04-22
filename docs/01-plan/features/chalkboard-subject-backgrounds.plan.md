---
template: plan
version: 1.0
feature: chalkboard-subject-backgrounds
date: 2026-04-22
author: pblsketch
project: ssampin
version_target: v1.11.0
---

# 칠판 교과별 배경 확장(오선지·한반도·세계지도) 기획서

> **요약**: 쌤도구의 칠판이 현재 제공하는 배경 옵션 `없음 / 모눈 / 줄선` 에 **오선지, 한반도(백지도), 세계(백지도)** 3종을 추가한다. 오선지는 SVG 라인 패턴으로 구현하고, 지도 2종은 사용자가 제공한 국토지리정보원 계열 JPG 백지도(`docs/세계지도.jpg`, `docs/전국.jpg`)를 전처리해 **흰 배경 → 투명 + 어두운 선 → 흰 선**으로 변환한 PNG를 칠판 색과 어울리게 오버레이한다. 오버레이는 기존 `grid` 개념과 동일하게 Fabric 캔버스 뒤쪽에 고정되어 판서/지우개/Undo/저장 흐름에 영향을 주지 않는다.
>
> **Project**: ssampin (쌤핀)
> **Version**: v1.10.5 → v1.11.0 (기능 추가 minor)
> **Author**: pblsketch
> **Date**: 2026-04-22
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

현재 칠판(`ToolChalkboard`)의 배경 선택지는 순수 그리드 2종(`grid`, `lines`)뿐이다. 교사가 수업 중 자주 쓰는 **오선지(음악·영어 발음)**, **한반도 지도(사회·한국사·지리)**, **세계 지도(사회·세계사·지리·영어)** 를 칠판 위에서 바로 불러올 수 있으면 별도 도구 교체 없이 해당 교과 판서 수업이 가능해진다.

본 기획은 "배경 오버레이를 5종으로 확장"하는 최소 변경 방식으로 구현하며, 기존 `GridMode` 타입을 확장하고 토글 버튼을 팝오버 선택 UI로 교체한다. 지도 에셋은 사용자가 제공한 JPG 2장을 기반으로 하되, **칠판(어두운 배경)에서 가독 가능하도록 전처리**한 PNG를 `public/chalkboard/`에 번들한다.

### 1.2 Background

- **사용자 피드백(2026-04-22)**: "쌤도구 - 칠판에서 지금 '모눈'과 '줄선'을 제공하잖아. 특정 교과를 위해서 오선지, 한반도 지도, 세계 지도도 지원하면 어때?"
- **자산**: 사용자 제공 JPG — `docs/세계지도.jpg` (메르카토르 세계 백지도, A4 세로), `docs/전국.jpg` (대한민국 전도 백지도, A4 세로)
  - **출처: 국토지리정보원(NGII) — 공공누리 제1유형** (출처 표시 시 상업적 이용·변형·재배포 허용). 재가공·PNG 번들 가능. 사용자 확인 완료(2026-04-22).
- **근본 구조**: [types.ts:30](../../../src/adapters/components/Tools/Chalkboard/types.ts#L30) `GridMode = 'none' | 'grid' | 'lines'` 가 얇은 enum이고, [useChalkCanvas.ts:40-72](../../../src/adapters/components/Tools/Chalkboard/useChalkCanvas.ts#L40-L72) `createGridObjects()`가 `Line` 객체 배열만 반환해 뒤로 보낸다. 따라서 오버레이를 "Line 뿐 아니라 FabricImage도 반환 가능"하도록 넓히면 구조 변경 최소화로 추가할 수 있다.
- **칠판 배경색 대비 문제**: 지도 JPG는 흰 바탕 + 검은 선. 칠판이 초록/검정/남색이라 그대로 올리면 "흰 종이"처럼 보이고, 검은 선은 배경색에 묻힌다. **전처리 필수**.

### 1.3 Related Documents

- 요청 세션: 2026-04-22 대화 ("쌤도구 칠판에서 오선지/한반도/세계지도…")
- 관련 모듈:
  - 타입 및 상수: [src/adapters/components/Tools/Chalkboard/types.ts](../../../src/adapters/components/Tools/Chalkboard/types.ts)
  - 캔버스 훅: [src/adapters/components/Tools/Chalkboard/useChalkCanvas.ts](../../../src/adapters/components/Tools/Chalkboard/useChalkCanvas.ts)
  - 툴바: [src/adapters/components/Tools/Chalkboard/ChalkboardToolbar.tsx](../../../src/adapters/components/Tools/Chalkboard/ChalkboardToolbar.tsx)
  - 컨테이너: [src/adapters/components/Tools/ToolChalkboard.tsx](../../../src/adapters/components/Tools/ToolChalkboard.tsx)
- 관련 PRD: (없음, 칠판은 쌤도구 내 단독 기능)
- 에셋 원본: [docs/세계지도.jpg](../../../docs/세계지도.jpg), [docs/전국.jpg](../../../docs/전국.jpg)

---

## 2. Scope

### 2.1 In Scope

- [ ] `GridMode` 확장: `'none' | 'grid' | 'lines' | 'staff' | 'koreaMap' | 'worldMap'`
- [ ] 오선지(`staff`) 렌더링: Fabric `Line` 패턴 (5선 한 세트 × 세로 반복, 세트 간 공백)
- [ ] 지도 오버레이 렌더링: Fabric `FabricImage` 로드 → 중앙 정렬 + 종횡비 유지 + `selectable/evented: false` + 격자 태그(`__grid__`) 부여
- [ ] 지도 에셋 전처리 파이프라인:
  - [ ] Node 스크립트 `scripts/preprocess-chalkboard-maps.mjs` 작성 (sharp 기반)
  - [ ] 입력: `docs/세계지도.jpg`, `docs/전국.jpg`
  - [ ] 처리: 밝기 반전 + 흰 배경 투명화 + 선 강조(레벨 조정) + PNG 저장
  - [ ] 출력: `public/chalkboard/korea-map.png`, `public/chalkboard/world-map.png` (공용 에셋)
- [ ] 칠판 리사이즈/페이지 전환/저장 경로에서 이미지 오버레이 일관성 유지 (기존 `redrawGrid()` 호출 경로에 얹기)
- [ ] 툴바 UX 교체: 기존 "다음 모드 cycle" 단일 버튼 → **팝오버 선택 UI** (6개 옵션 + 미니 프리뷰). 기존 단축키 `G`는 "팝오버 열기/다음 옵션"으로 유지
- [ ] 지도 옵션 하단 **조용한 힌트 한 줄**(*"어두운 칠판색에서 가장 선명합니다"*) 표시. 자동 색 전환은 하지 않음(확정)
- [ ] 저장 이미지(`saveAsImage`)에 오버레이 포함 여부 결정 — **현행 일관성: 제외(격자와 동일)**
- [ ] localStorage 영속화: `chalkboard.gridMode` 키 추가 (기존 없음, 신규)
- [ ] TypeScript 에러 0개, 기존 기능 회귀 없음
- [ ] 수동 검증 체크리스트 (섹션 4.1) 전부 통과

### 2.2 Out of Scope

- **지도 위 마커/핀 기능**: 오버레이는 배경일 뿐. 시·도 이름 라벨이나 수도 표시는 별건 feature.
- **지도 확대/축소/이동(팬·줌)**: 칠판 전체가 캔버스이며 배경 지도는 캔버스 크기에 맞춰 1회 피팅. 줌 상호작용은 다른 도구 수준 기능으로 분리.
- **추가 교과 배경**: 악보 TAB악보, 백두산 지형도, 수학 모눈 변형(5mm/1cm), 한자 네모칸, 원고지 등은 후속 feature로 분리.
- **지도 에셋 라이선스 검증·치환**: 사용자 제공 JPG 출처 확인은 본 기획의 병행 작업이나, **대체 에셋 확보 및 교체**는 필요 시에만 별도로 다룬다.
- **칠판 배경색에 따른 지도 자동 대비 조정**: 초록 칠판에서는 흰 선 지도, 남색 칠판에서는 연노랑 선 지도 등 동적 재색칠은 Out(현재: 단일 흰 선 버전).
- **모바일/위젯 모드 대응**: 칠판은 현재 데스크톱 전용 도구. 모바일/위젯 노출은 별건.

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | 요구사항 | 우선순위 | 상태 |
|----|---------|---------|------|
| FR-01 | 툴바에서 6개 배경 옵션(없음/모눈/줄선/오선지/한반도/세계) 중 하나를 선택할 수 있다 | Critical | Pending |
| FR-02 | 오선지 선택 시 5선(간격 ~14px) + 세트 간 공백(~60px)으로 세로 반복 표시 | High | Pending |
| FR-03 | 한반도 지도 선택 시 `public/chalkboard/korea-map.png`가 캔버스 중앙에 종횡비 유지로 표시 | High | Pending |
| FR-04 | 세계 지도 선택 시 `public/chalkboard/world-map.png`가 캔버스 중앙에 종횡비 유지로 표시 | High | Pending |
| FR-05 | 지도·오선지는 `selectable/evented: false`로 **판서/지우개/선택 대상이 되지 않는다** | Critical | Pending |
| FR-06 | 모드 변경 시 이전 오버레이는 완전히 제거되고 새 오버레이만 남는다 (혼재 금지) | Critical | Pending |
| FR-07 | 페이지 추가/이동 시 현재 페이지의 오버레이 모드가 유지된다 | High | Pending |
| FR-08 | `saveAsImage` 결과에는 기존 격자와 동일하게 **오버레이가 포함되지 않는다** (`excludeFromExport: true`) | High | Pending |
| FR-09 | 리사이즈 시 지도 이미지가 새 캔버스 크기에 다시 피팅된다 | High | Pending |
| FR-10 | 선택한 배경 모드는 `localStorage.chalkboard.gridMode`에 저장되어 재방문 시 복원된다 | Medium | Pending |
| FR-11 | 단축키 `G` 동작: 팝오버가 닫혀 있으면 열기, 열려 있으면 다음 옵션으로 이동(또는 팝오버 내 키보드 네비) | Medium | Pending |
| FR-12 | 지도 에셋 로드 실패 시 토스트 1회 표시 후 모드를 `none`으로 폴백 | Medium | Pending |

### 3.2 Non-Functional Requirements

| 카테고리 | 기준 | 측정 방법 |
|---------|------|---------|
| 성능 | 오버레이 전환 → 1프레임 내 재렌더 (<16ms 렌더) | 수동 체감 + Chrome DevTools Performance |
| 에셋 크기 | 한반도 PNG ≤ 300KB, 세계 PNG ≤ 500KB | 빌드 산출물 확인 |
| 첫 표시 지연 | 로컬 번들 에셋이므로 첫 선택 시 ≤ 150ms | 수동 체감 |
| 타입 안전 | `any` 미사용, `strict` 통과 | `npx tsc --noEmit` |
| 하위 호환 | 기존 `gridMode === 'grid' | 'lines'` 저장값이 깨지지 않음 | localStorage 값 유지 테스트 |
| 메모리 | 모드 전환 반복 100회 시 `FabricImage` 누수 없음 | DevTools Memory snapshot 비교 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01 ~ FR-12 모두 구현 완료
- [ ] `npx tsc --noEmit` 에러 0개
- [ ] `npm run build` 성공
- [ ] **수동 검증 시나리오** (모두 통과):
  1. 칠판 진입 → 팝오버에서 6개 옵션 모두 차례로 선택 → 각 오버레이 정상 표시
  2. 오선지 선택 → 판서 → 오선지 위에 분필 선이 정상 올라가는지 확인
  3. 한반도 선택 → 검정/남색 칠판에서 지도 선이 **눈에 보이는지** 확인 (흰 선 처리 검증)
  4. 세계 지도 선택 → 창 리사이즈 → 지도가 새 크기에 재피팅
  5. 모드 전환(지도→오선지→없음) 시 이전 오버레이가 잔존하지 않음
  6. 판서한 상태에서 모드 전환 → 판서 내용 유지
  7. `Ctrl+S` 저장 → 저장 이미지에 오버레이는 없고 판서만 있음
  8. 페이지 추가(`+`) → 이전 페이지 복귀 → 오버레이 모드 그대로
  9. 새로고침 후 마지막 모드 복원
  10. 지도 에셋 파일명을 일시 변경하여 로드 실패 유도 → 폴백 동작 + 토스트
- [ ] PDCA `analyze` Match Rate ≥ 90%
- [ ] 릴리즈 노트 항목 추가 (v1.11.0, `public/release-notes.json`)
- [ ] AI 챗봇 Q&A 업데이트(`scripts/ingest-chatbot-qa.mjs`)에 "칠판 오선지/지도 배경" 항목 추가

### 4.2 Quality Criteria

- [ ] Clean Architecture 의존성 규칙 유지 (adapters 내부만 변경, domain/usecases 무변경)
- [ ] 오버레이 추가 방식이 **확장 가능**해야 함 — 이후 "원고지"/"한자 네모칸" 추가가 같은 경로로 가능
- [ ] 에셋 경로 상수화: 하드코딩된 문자열이 아닌 `types.ts`에 `BACKGROUND_ASSETS` 맵으로 관리
- [ ] 디자인 일관성: 팝오버 스타일은 기존 `EraserControl` 팝오버와 동일한 카드·간격·리터럴
- [ ] 에셋 전처리 스크립트는 **재현 가능**해야 함 (원본 JPG + 스크립트만 있으면 동일 PNG 생성)

---

## 5. Risks and Mitigation

| 리스크 | 영향 | 가능성 | 완화 방안 |
|-------|------|-------|---------|
| 지도 JPG의 라이선스/출처 불명확 | High | Medium | 사용자에게 출처 확인 요청. 공공누리 제1·4유형이면 사용 가능. 불가 시 Natural Earth(세계) + 국토지리정보원 공개본(한국) SVG로 대체 |
| JPG 전처리 후에도 어두운 선이 남아 칠판에서 안 보임 | Medium | Medium | sharp의 `negate` → threshold → alpha 마스크 조합으로 "백지 투명 + 선만 밝은 색" 보장. 여러 파라미터 후보를 `analyze` 전에 실물로 비교 |
| 지도 이미지 PNG가 번들 크기를 과도하게 키움 | Medium | Medium | 최대 해상도 1600×2000 캡, PNG quantize로 팔레트 축소, gzip 후 크기 체크 |
| Fabric `FabricImage` 비동기 로드로 인해 페이지 전환 타이밍 이슈 발생 | High | Medium | 오버레이 그리기 함수를 async로 변경, 로드 중에는 placeholder 제거하고 완료 후 `sendObjectToBack` |
| 팝오버 UI 변경이 기존 단축키 `G` 흐름과 충돌 | Low | Medium | 단축키는 팝오버 열기 + 옵션 순환 두 역할 겸임. 의사 설계에서 명시 |
| `pixelEraser`(부분 지우개)가 `destination-out`으로 그림 → **지도 이미지 위에서 작동 시 지도가 지워질 우려** | High | High | 이미지 오버레이는 `objectCaching: false` + 별도 Fabric 그룹으로 분리하거나, 에러서 적용 순서 조정. **설계 단계에서 PoC로 우선 확인**. 안 되면 오버레이를 CSS background-image로 분리하는 대안 검토 |
| 모드 저장 키 신설이 기존 사용자 로컬스토리지를 깨뜨림 | Low | Low | `chalkboard.gridMode` 신규 키. 없으면 `none` 기본값으로 시작 |
| 오선지 라인이 세로 방향으로 판서 시 노이즈가 됨 | Low | Low | 불투명도 낮추기(현 grid와 동일 `rgba(255,255,255,0.12)` 재사용), 사용자 선택이므로 수용 |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level | 특성 | 권장 | 선택 |
|-------|-----|-----|:---:|
| **Starter** | 단순 구조 | 정적 사이트 | ☐ |
| **Dynamic** | 기능 모듈·BaaS | 풀스택 웹앱 | ☑ |
| **Enterprise** | 엄격 레이어·DI·마이크로서비스 | 대규모 시스템 | ☐ |

Adapters 레이어 내부 + public 에셋 추가 + 빌드 스크립트 1개 수준. Clean Architecture 경계를 넘지 않는다.

### 6.2 Key Architectural Decisions

| 결정 | 옵션 | 선택 | 근거 |
|-----|-----|-----|-----|
| 타입 이름 | (A) `GridMode` 확장 / (B) 별도 `BoardOverlayMode` 신설 | **(A) 확장** | 호출부 파급 최소, 의미는 "배경 오버레이"로 주석 명시 |
| 지도 에셋 형식 | (A) 원본 JPG / (B) 전처리 PNG (투명+흰선) / (C) SVG 재제작 | **(B) 전처리 PNG** | 라이선스 안전(재가공) + 칠판 대비 해결 + 빌드 부담 적음. SVG 재제작은 공수 대비 효과 낮음 |
| 에셋 배포 위치 | (A) `src/assets/` 번들 / (B) `public/chalkboard/` 정적 / (C) Electron resourceDir | **(B) public/chalkboard/** | Vite dev + electron 빌드 모두에서 URL 안정. 첫 로드 시 fetch 1회 |
| 전처리 타이밍 | (A) 빌드 시 자동 / (B) 수동 스크립트 1회 | **(B) 수동 스크립트** | 에셋 변경 빈도 낮음. CI 복잡도 상승 회피. `scripts/preprocess-chalkboard-maps.mjs` 수동 실행 후 PNG 커밋 |
| 지도 선 색 | (A) 순백 `#FFFFFF` / (B) 약간 내린 흰색 `rgba(255,255,255,0.85)` / (C) 칠판 색별 동적 전환 | **(B) 약간 내린 흰색** | 초록 칠판에서 분필 느낌으로 자연스러움. 검정·남색·갈색·회색 칠판 모두 수용. 동적 전환(C)은 복잡도 대비 UX 이득 낮아 보류 |
| 지도 선택 시 칠판 색 처리 | (A) 자동 전환 / (B) 토스트 안내 / (C) 팝오버 내 조용한 힌트 / (D) 아무것도 안함 | **(C) 팝오버 내 한 줄 힌트** | 교사 선호 칠판색 유지. *"어두운 칠판색에서 가장 선명합니다"* 한 줄만 노출. 사용자 확정(2026-04-22) |
| 오버레이 렌더 구조 | (A) Fabric 내부 객체(Line/Image) + `__grid__` 태그 재사용 / (B) CSS background-image / (C) 별도 Canvas 레이어 | **(A) Fabric 객체** | 기존 페이지/Undo/리사이즈 로직 재사용. 단, `pixelEraser` 리스크(섹션 5) 설계 단계 PoC 필수 |
| 툴바 UX | (A) 단일 버튼 cycle / (B) 팝오버 + 아이콘 6개 | **(B) 팝오버** | 6개면 cycle이 직관성 낮음. 프리뷰 썸네일로 교사가 즉시 선택 가능. 기존 `EraserControl` 재사용 |
| 에셋 상수화 | (A) 코드 인라인 / (B) `types.ts`에 `BACKGROUND_ASSETS` 맵 | **(B) 상수 맵** | 추후 배경 추가 시 한 곳만 편집. 테스트/디버깅 용이 |
| 지도 렌더링 실패 | (A) 빈 화면 / (B) 토스트 + 폴백 `none` | **(B) 폴백** | UX 안전성 |

### 6.3 Clean Architecture Approach

```
선택 레벨: Dynamic (Clean Architecture 4-layer)

영향 레이어:
┌─────────────────────────────────────────────┐
│ infrastructure/  변경 없음                   │
│ ┌─────────────────────────────────────────┐ │
│ │ adapters/                                │ │
│ │  components/Tools/Chalkboard/            │ │
│ │   types.ts                        ✏️     │ │
│ │   useChalkCanvas.ts               ✏️     │ │
│ │   ChalkboardToolbar.tsx           ✏️     │ │
│ │   BoardBackgroundPicker.tsx       ✨ (팝오버) │ │
│ │  components/Tools/ToolChalkboard.tsx ✏️  │ │
│ │ ┌─────────────────────────────────────┐ │ │
│ │ │ usecases/  변경 없음                  │ │ │
│ │ │ ┌─────────────────────────────────┐ │ │ │
│ │ │ │ domain/  변경 없음                │ │ │ │
│ │ │ └─────────────────────────────────┘ │ │ │
│ │ └─────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘

추가 에셋/스크립트:
- public/chalkboard/korea-map.png           ✨
- public/chalkboard/world-map.png           ✨
- scripts/preprocess-chalkboard-maps.mjs    ✨ (sharp 기반)
- package.json                              ✏️ (devDependency: sharp — 이미 존재 여부 먼저 확인)
```

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] Clean Architecture 4-layer 준수
- [x] TypeScript strict, `any` 금지
- [x] Tailwind CSS 유틸리티 클래스 (인라인 스타일 지양)
- [x] 컴포넌트 PascalCase, 훅 `use` 접두사
- [x] 모든 UI 텍스트 한국어
- [x] 격자 객체는 `__grid__` 태그 + `excludeFromExport: true` 패턴
- [x] 설정 영속화는 `localStorage` 키 prefix 명시(`chalkboard.*`)

### 7.2 Conventions to Define/Verify

| 카테고리 | 현 상태 | 정의할 내용 | 우선순위 |
|---------|--------|-----------|:-------:|
| **오버레이 태그 재사용** | `__grid__` 태그 존재 | 이미지 오버레이도 동일 태그로 취급, 단 `excludeFromExport` 명시 | High |
| **에셋 경로 상수** | 미존재 | `types.ts`에 `BACKGROUND_ASSETS: Record<GridMode, string | null>` 도입 | High |
| **전처리 스크립트 위치** | `scripts/` 하위 존재(`ingest-chatbot-qa.mjs` 등) | `scripts/preprocess-chalkboard-maps.mjs` 추가 | Medium |
| **팝오버 스타일 통일** | `EraserControl`, `PenSizeControl` 팝오버 존재 | 동일 패턴으로 `BoardBackgroundPicker` 작성 | High |
| **에셋 라이선스 표기** | 미정 | `public/chalkboard/README.md`에 출처·라이선스 명시 | Medium |

### 7.3 Environment Variables Needed

없음 (빌드 시 정적 에셋).

### 7.4 Pipeline Integration

PDCA 플로우(plan → design → do → analyze → report) 사용. 9-phase Pipeline 미적용.

---

## 8. Next Steps

1. [x] **사용자 확인 완료 사항** (2026-04-22)
   - [x] 지도 출처: 국토지리정보원 / 공공누리 제1유형 (출처 표시 시 상업·변형·재배포 허용)
   - [x] 툴바 UX: 팝오버 + 썸네일 방식 채택
   - [x] 지도 선택 시 칠판 색 처리: **자동 전환 없음**. 팝오버 내 한 줄 힌트(*"어두운 칠판색에서 가장 선명합니다"*)만 노출
   - [x] 지도 선 색: 약간 내린 흰색 `rgba(255,255,255,0.85)` — 초록 기본 칠판에서도 분필 느낌으로 자연스럽게 보이는 값
2. [ ] 설계 문서 작성 (`/pdca design chalkboard-subject-backgrounds`)
   - `GridMode` 확장 타입 정의
   - `BACKGROUND_ASSETS` 상수 구조
   - `createBackgroundObjects(w, h, mode)` 시그니처 및 async 변환 의사 코드
   - `pixelEraser` × 이미지 오버레이 PoC 결과 반영
   - `BoardBackgroundPicker` UI 목업 + 키보드 네비 명세
   - 전처리 스크립트 sharp 파이프라인(입력·중간·출력 파라미터)
   - 에지 케이스: 에셋 로드 실패 / 리사이즈 중 모드 변경 / Undo 이후 모드 유지
3. [ ] TDD/PoC 구현 (`/pdca do chalkboard-subject-backgrounds`)
   - PoC: 이미지 오버레이 위 `pixelEraser` 동작 검증(최우선)
   - 전처리 스크립트 실행 → PNG 산출물 확인(시각적 검수)
   - 오선지 → 지도 → UI 순
4. [ ] Gap 분석 (`/pdca analyze chalkboard-subject-backgrounds`)
5. [ ] 릴리즈 준비 (v1.11.0, 8단계 릴리즈 워크플로우 전체 수행)
   - AI 챗봇 지식베이스 업데이트
   - 노션 사용자 가이드 업데이트
   - macOS + Windows 빌드 및 GitHub 릴리즈

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-22 | 초기 Plan 작성 (칠판 오선지·한반도·세계 지도 배경 추가) | pblsketch |
