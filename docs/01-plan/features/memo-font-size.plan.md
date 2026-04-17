---
template: plan
version: 1.2
feature: memo-font-size
date: 2026-04-17
author: pblsketch
project: ssampin
version_target: v1.11.0
---

# 메모 글자 크기 조절 기능 기획서

> **요약**: 포스트잇 메모 카드의 글자 크기를 사용자가 4단계(작게/기본/크게/아주크게)로 조절할 수 있도록 한다. 시력이 약한 교사·빔프로젝터 송출·핵심 메모 강조 시나리오에서 가독성을 확보한다.
>
> **Project**: ssampin (쌤핀)
> **Version**: v1.10.1 → v1.11.0
> **Author**: pblsketch
> **Date**: 2026-04-17
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

메모 카드의 글자 크기를 메모별로 지정할 수 있도록 하여, **중요한 메모는 크게 / 참고용 메모는 작게** 표현하는 시각적 계층을 제공한다. 교사의 작업 환경(노트북 화면, 빔프로젝터, 노안 등)에 따라 가독성을 자유롭게 조정한다.

### 1.2 Background

- 사용자 피드백(2026-04): "메모에 보면 글자크기를 조절하는 기능과 이미지도 탑제가 가능하면 좋겠습니다"
- 현재 [Memo.ts](../../../src/domain/entities/Memo.ts)는 `content: string` + 포맷(굵게/밑줄/취소선)만 지원 → 글자 크기 조정 불가
- [MemoFormattedText.tsx:49](../../../src/adapters/components/Memo/MemoFormattedText.tsx#L49) 기본 폰트 크기 사용 중
- [MemoFormatToolbar.tsx:17-21](../../../src/adapters/components/Memo/MemoFormatToolbar.tsx#L17-L21) 툴바에 크기 버튼 없음

### 1.3 Related Documents

- 피드백 원문: 사용자 직접 입력 (2026-04-17)
- 관련 기능 (동일 피드백의 별건): [memo-image-attachment.plan.md](./memo-image-attachment.plan.md)
- 메모 엔티티: [src/domain/entities/Memo.ts](../../../src/domain/entities/Memo.ts)
- 메모 카드: [src/adapters/components/Memo/MemoCard.tsx](../../../src/adapters/components/Memo/MemoCard.tsx)
- 포맷 툴바: [src/adapters/components/Memo/MemoFormatToolbar.tsx](../../../src/adapters/components/Memo/MemoFormatToolbar.tsx)
- 마크다운 파서: [src/domain/rules/memoRules.ts](../../../src/domain/rules/memoRules.ts)

---

## 2. Scope

### 2.1 In Scope

- [ ] `Memo` 엔티티에 `fontSize: MemoFontSize` 필드 추가 (`'sm' | 'base' | 'lg' | 'xl'`)
- [ ] 기본값 `'base'` + 기존 메모는 마이그레이션 시 자동 `'base'` 할당 (하위 호환)
- [ ] `MemoFormatToolbar`에 "글자 크게/작게" 버튼 또는 드롭다운 추가
- [ ] `MemoCard`·`MemoDetailPopup`·`MemoRichEditor` 모두 동일한 크기 스케일 적용
- [ ] `JsonMemoRepository` 마이그레이션 (`fontSize` 누락 시 기본값 주입)
- [ ] `useMemoStore`에 `updateFontSize(id, fontSize)` 액션 추가
- [ ] `ManageMemos` usecase에 크기 변경 메서드 추가

### 2.2 Out of Scope

- 선택 범위별 크기(예: "이 단어만 크게") — 마크다운 파서 대폭 수정 필요, 차기 이터레이션
- 사용자 정의 픽셀 크기 입력 — 프리셋 4단계로 충분
- 폰트 종류 변경(Noto Sans KR 외) — 전 앱 폰트 정책과 충돌
- 위젯 모드 메모 크기 연동 — 위젯 모드는 읽기 전용, 기존 크기 그대로 렌더

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | 요구사항 | 우선순위 | 상태 |
|----|---------|---------|------|
| FR-01 | 메모 편집 툴바에 글자 크기 조절 UI(버튼 또는 드롭다운)가 노출된다 | High | Pending |
| FR-02 | 사용자는 4단계(작게/기본/크게/아주크게) 중 선택할 수 있다 | High | Pending |
| FR-03 | 변경된 크기는 즉시 반영되고 `useMemoStore`를 통해 영속 저장된다 | High | Pending |
| FR-04 | 메모 상세 팝업(`MemoDetailPopup`)에서도 동일한 크기 스케일이 적용된다 | High | Pending |
| FR-05 | 기존 메모는 `fontSize` 필드가 없어도 `'base'`로 정상 렌더된다 (하위 호환) | High | Pending |
| FR-06 | 크기 변경 시 카드 레이아웃(드래그/리사이즈/회전)에 영향 없어야 한다 | Medium | Pending |
| FR-07 | 글자 크기 변경은 기존 인라인 마크다운(`**굵게**` 등)과 공존한다 | High | Pending |

### 3.2 Non-Functional Requirements

| 카테고리 | 기준 | 측정 방법 |
|---------|------|---------|
| 성능 | 크기 변경 시 즉시 렌더(<100ms), 리플로우 최소화 | 수동 확인 |
| 접근성 | 크기 선택 버튼에 `aria-label` 필수 | axe DevTools |
| 하위 호환 | v1.10.x 저장 파일이 에러 없이 로드 | 기존 `memos.json` 불러오기 테스트 |
| 시각 일관성 | 각 크기 단계가 명확히 구분되되 카드 기본 크기(280×220)에서 잘리지 않음 | 디자인 리뷰 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01 ~ FR-07 모두 구현 완료
- [ ] TypeScript 에러 0개 (`npx tsc --noEmit`)
- [ ] `npm run build` 성공
- [ ] 4가지 크기 모두 `MemoCard`·`MemoDetailPopup`에서 정상 렌더
- [ ] 기존 메모(fontSize 없는 구 데이터) 로드 시 `'base'`로 폴백
- [ ] PDCA `analyze` Match Rate ≥ 90%

### 4.2 Quality Criteria

- [ ] Clean Architecture 의존성 규칙 위반 없음 (domain 수정은 엔티티·규칙만, adapters가 의존성 방향 준수)
- [ ] `any` 타입 미사용
- [ ] Tailwind 유틸리티 클래스로만 스타일링 (`text-sm`/`text-base`/`text-lg`/`text-xl`)
- [ ] 모든 UI 텍스트 한국어

---

## 5. Risks and Mitigation

| 리스크 | 영향 | 가능성 | 완화 방안 |
|-------|------|-------|---------|
| 큰 글자 선택 시 기본 카드 크기에서 텍스트 잘림 | Medium | High | `MEMO_SIZE.DEFAULT_HEIGHT` 미세 상향 또는 `overflow-auto` 추가, 리사이즈 안내 |
| 작은 글자 선택 시 포스트잇 톤앤매너 훼손 | Low | Medium | `text-sm` 최소값 고정, 더 작게는 불허 |
| 기존 저장 파일에 `fontSize`가 없어 런타임 에러 | High | Medium | Repository 로드 시 기본값 주입 마이그레이션 필수 |
| 툴바 공간 부족 (굵게/밑줄/취소선 + 크기 버튼) | Low | Medium | 드롭다운(셀렉트) 단일 컴포넌트로 압축 |
| 메모 공유 파일(`.ssampin`)에서 다른 버전과 크기 필드 충돌 | Low | Low | 공유 포맷 로더에 기본값 폴백 추가 |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level | 특성 | 권장 | 선택 |
|-------|-----|-----|:---:|
| **Starter** | 단순 구조 | 정적 사이트 | ☐ |
| **Dynamic** | 기능 모듈·BaaS | 풀스택 웹앱 | ☑ |
| **Enterprise** | 엄격 레이어·DI·마이크로서비스 | 대규모 시스템 | ☐ |

엔티티 1필드 추가 수준이라 UI·스토어·리포지토리 3레이어 변경만 필요.

### 6.2 Key Architectural Decisions

| 결정 | 옵션 | 선택 | 근거 |
|-----|-----|-----|-----|
| 크기 표현 방식 | 프리셋(enum) / 픽셀(number) / rem(number) | **프리셋 `'sm'\|'base'\|'lg'\|'xl'`** | Tailwind 클래스 직매핑, 유효성 검증 단순, 4단계로 충분 |
| 저장 단위 | 메모별 / 전역 설정 | **메모별** | 같은 메모판에서 중요도별 구분이 핵심 사용 케이스 |
| 툴바 UI | 4버튼 / 드롭다운 / 증감(+/-) 버튼 | **증감(+/-) 2버튼** | 툴바 공간 절약, 단계 직관적 |
| 기본값 | `'base'` | `'base'` | 기존 렌더 크기 그대로 유지 |
| 적용 범위 | MemoCard만 / 전체 뷰(카드+상세팝업+편집기) | **전체 뷰** | 편집-표시 간 불일치 방지 |

### 6.3 Clean Architecture Approach

```
선택 레벨: Dynamic (Clean Architecture 4-layer)

영향 레이어:
┌─────────────────────────────────────────────┐
│ infrastructure/  변경 없음                   │
│ ┌─────────────────────────────────────────┐ │
│ │ adapters/                               │ │
│ │   - stores/useMemoStore.ts          ✏️  │ │
│ │   - repositories/JsonMemoRepository ✏️  │ │
│ │   - components/Memo/MemoCard.tsx    ✏️  │ │
│ │   - components/Memo/MemoFormatToolbar.tsx ✏️ │
│ │   - components/Memo/MemoFormattedText.tsx ✏️ │
│ │   - components/Memo/MemoRichEditor.tsx ✏️│ │
│ │   - components/Memo/MemoDetailPopup.tsx ✏️│ │
│ │ ┌─────────────────────────────────────┐ │ │
│ │ │ usecases/                           │ │ │
│ │ │   - memo/ManageMemos.ts         ✏️  │ │ │
│ │ │ ┌─────────────────────────────────┐ │ │ │
│ │ │ │ domain/                         │ │ │ │
│ │ │ │  - entities/Memo.ts         ✏️  │ │ │ │
│ │ │ │  - valueObjects/MemoFontSize.ts ✨ │ │ │
│ │ │ │  - rules/memoRules.ts       ✏️  │ │ │ │
│ │ │ └─────────────────────────────────┘ │ │ │
│ │ └─────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] Clean Architecture 4-layer 준수
- [x] TypeScript strict, `any` 금지
- [x] Tailwind 유틸리티 클래스 (`text-sm`/`text-base`/`text-lg`/`text-xl` 존재)
- [x] Material Symbols 아이콘 (`text_increase`, `text_decrease`)
- [x] `MemoColor` 같은 valueObject 패턴 이미 존재 → `MemoFontSize`도 동일 위치에 추가

### 7.2 Conventions to Define/Verify

| 카테고리 | 현 상태 | 정의할 내용 | 우선순위 |
|---------|--------|-----------|:-------:|
| **valueObject 네이밍** | `MemoColor` 존재 | `MemoFontSize` type + `MEMO_FONT_SIZES` readonly array | High |
| **CSS 스케일** | text-base 기본 | sm=0.875rem, base=1rem, lg=1.125rem, xl=1.25rem (Tailwind 기본) | High |
| **마이그레이션 전략** | 기존 Repository 패턴 | 로드 시 `fontSize ?? 'base'` 폴백 | High |

### 7.3 Environment Variables Needed

불필요 (순수 클라이언트 UI 상태).

### 7.4 Pipeline Integration

9-phase 파이프라인 미적용, PDCA 플로우(plan → design → do → analyze → report) 사용.

---

## 8. Next Steps

1. [ ] 설계 문서 작성 (`/pdca design memo-font-size`)
   - `MemoFontSize` valueObject 인터페이스 확정
   - 툴바 UI 시안 (증감 버튼 vs 드롭다운 최종 결정)
   - 마이그레이션 규칙 (누락 필드 기본값 주입)
2. [ ] 디자인 예시 검토 (`design examples/` 내 메모 관련 참고 이미지)
3. [ ] 구현 (`/pdca do memo-font-size`)
4. [ ] Gap 분석 (`/pdca analyze memo-font-size`)
5. [ ] 릴리즈 (v1.11.0 노트, 챗봇 Q&A 반영, 노션 가이드)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-17 | 초기 Plan 작성 (메모 글자 크기 조절 피드백 대응) | pblsketch |
