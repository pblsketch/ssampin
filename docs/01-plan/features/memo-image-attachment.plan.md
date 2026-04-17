---
template: plan
version: 1.2
feature: memo-image-attachment
date: 2026-04-17
author: pblsketch
project: ssampin
version_target: v1.11.0
---

# 메모 이미지 첨부 기능 기획서

> **요약**: 포스트잇 메모에 이미지를 첨부할 수 있도록 한다. 교사가 칠판 사진·수업 자료·캡처 이미지를 메모와 함께 기록하고 참고할 수 있게 한다. `ImageWidget` 기존 패턴을 재사용하여 base64 dataURL로 JSON에 저장한다.
>
> **Project**: ssampin (쌤핀)
> **Version**: v1.10.1 → v1.11.0
> **Author**: pblsketch
> **Date**: 2026-04-17
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

메모 카드에 이미지를 첨부하여 **시각 정보와 텍스트 메모를 한 장소에 통합 관리**한다. 칠판 내용 사진, 학생이 푼 문제 풀이, 수업 자료 스크린샷 등 교사 일상에서 빈번하게 발생하는 "이미지 + 짧은 메모" 시나리오를 해결한다.

### 1.2 Background

- 사용자 피드백(2026-04): "메모에 보면 글자크기를 조절하는 기능과 이미지도 탑제가 가능하면 좋겠습니다"
- 현재 [Memo.ts](../../../src/domain/entities/Memo.ts)는 `content: string`만 지원, 이미지 첨부 불가
- 프로젝트 내 유사 패턴 존재: [JsonImageWidgetRepository.ts](../../../src/adapters/repositories/JsonImageWidgetRepository.ts)는 이미 **base64 dataURL**을 JSON에 저장 — 동일 패턴 재사용 가능
- `.ssampin` 공유 파일([src/domain/rules/shareRules.ts](../../../src/domain/rules/shareRules.ts))에 메모가 포함되므로 이미지 번들링 전략 필요

### 1.3 Related Documents

- 피드백 원문: 사용자 직접 입력 (2026-04-17)
- 관련 기능 (동일 피드백의 별건): [memo-font-size.plan.md](./memo-font-size.plan.md)
- 선행 구현 참고: [src/domain/entities/ImageWidget.ts](../../../src/domain/entities/ImageWidget.ts), [src/adapters/repositories/JsonImageWidgetRepository.ts](../../../src/adapters/repositories/JsonImageWidgetRepository.ts)
- 메모 엔티티: [src/domain/entities/Memo.ts](../../../src/domain/entities/Memo.ts)
- 메모 카드: [src/adapters/components/Memo/MemoCard.tsx](../../../src/adapters/components/Memo/MemoCard.tsx)
- 상세 팝업: [src/adapters/components/Memo/MemoDetailPopup.tsx](../../../src/adapters/components/Memo/MemoDetailPopup.tsx)

---

## 2. Scope

### 2.1 In Scope

- [ ] `Memo` 엔티티에 `image?: MemoImage` 선택적 필드 추가 (단일 이미지)
- [ ] `MemoImage` valueObject: `{ dataUrl, fileName, mimeType, width, height }`
- [ ] 이미지 첨부 방법 3종: **툴바 버튼(파일 선택), 클립보드 붙여넣기(Ctrl+V), 드래그앤드롭**
- [ ] 크기 제한: 단일 이미지 5MB 이하, 자동 리사이즈(최대 800px 긴 변)
- [ ] 포맷 제한: PNG, JPEG, WebP (GIF/SVG 제외)
- [ ] `MemoCard` 하단 또는 배경 영역에 썸네일 표시
- [ ] `MemoDetailPopup`에서 원본 크기 뷰어(모달) 제공
- [ ] 이미지 제거 버튼
- [ ] `.ssampin` 공유 파일 포맷에 이미지 포함(JSON 내 base64 그대로 직렬화)

### 2.2 Out of Scope

- 다중 이미지(갤러리형) — 단일 이미지로 MVP, 차기 이터레이션에서 확장
- 이미지 편집(크롭/회전/필터) — OS 기본 도구 사용 유도
- 외부 URL 이미지 참조 — 오프라인 동작 원칙 위배
- 클라우드 업로드(Google Drive 등) — 로컬 우선 원칙
- 위젯 모드에서 메모 이미지 렌더 — 읽기 전용 단순 표시만

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | 요구사항 | 우선순위 | 상태 |
|----|---------|---------|------|
| FR-01 | 툴바에 "이미지 추가" 버튼이 있고 클릭 시 파일 선택 다이얼로그가 열린다 | High | Pending |
| FR-02 | 편집 모드에서 `Ctrl+V`로 클립보드 이미지를 붙여넣을 수 있다 | High | Pending |
| FR-03 | 메모 카드 영역에 이미지 파일을 드래그 드롭하면 첨부된다 | Medium | Pending |
| FR-04 | 첨부된 이미지는 긴 변이 800px를 넘으면 자동 리사이즈된다 | High | Pending |
| FR-05 | 5MB 초과 또는 허용 외 포맷은 토스트 에러로 거부된다 | High | Pending |
| FR-06 | `MemoCard`에 썸네일이, `MemoDetailPopup`에 원본 크기 이미지가 노출된다 | High | Pending |
| FR-07 | 이미지 제거 버튼(X 아이콘)으로 첨부 해제 가능하다 | High | Pending |
| FR-08 | `.ssampin` 공유 파일로 내보내기/가져오기 시 이미지가 함께 전송된다 | Medium | Pending |
| FR-09 | 이미지 없는 기존 메모는 정상 렌더된다 (하위 호환) | High | Pending |

### 3.2 Non-Functional Requirements

| 카테고리 | 기준 | 측정 방법 |
|---------|------|---------|
| 성능 | 5MB 이미지 첨부 시 리사이즈 + 저장 < 1.5초 | 수동 타이밍 측정 |
| 저장 용량 | `memos.json` 단일 파일 크기 확인 (경고 기준 10MB) | 파일 시스템 관찰 |
| 접근성 | 이미지에 `alt` 속성 (파일명 기본), 이미지 추가 버튼 `aria-label` | axe DevTools |
| 하위 호환 | 기존 `memos.json` 로드 시 에러 없음 | 구버전 백업 로드 테스트 |
| 시각 일관성 | 썸네일 영역이 포스트잇 톤과 어우러짐 | 디자인 리뷰 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01 ~ FR-09 모두 구현 완료
- [ ] TypeScript 에러 0개 (`npx tsc --noEmit`)
- [ ] `npm run build` 성공
- [ ] Electron + 브라우저(dev) 양쪽에서 동일하게 동작
- [ ] 5MB 이미지 + 리사이즈 파이프라인 경로에서 UI freeze 없음 (비동기 처리)
- [ ] 기존 메모(이미지 없음)와 신규 메모(이미지 있음) 혼재 저장 파일 로드 성공
- [ ] PDCA `analyze` Match Rate ≥ 90%

### 4.2 Quality Criteria

- [ ] Clean Architecture 의존성 규칙 위반 없음
  - domain에 이미지 처리 유틸(`resizeImageToDataUrl`) 배치 — 순수 함수 유지
  - 파일 시스템 접근은 기존 `IStoragePort`로만 수행
- [ ] `any` 타입 미사용
- [ ] Tailwind 유틸리티 클래스로 스타일링
- [ ] 모든 UI 텍스트 한국어

---

## 5. Risks and Mitigation

| 리스크 | 영향 | 가능성 | 완화 방안 |
|-------|------|-------|---------|
| base64 저장 → `memos.json` 비대화(수십 MB) | **High** | High | 자동 리사이즈(긴 변 800px) + 개당 5MB 제한 + 메모당 이미지 1개 제한 |
| 리사이즈 중 UI 블로킹 | Medium | Medium | `createImageBitmap` + `OffscreenCanvas` 비동기 사용, 실패 시 Image 엘리먼트 폴백 |
| `.ssampin` 파일이 거대해져 공유 어려움 | Medium | Medium | 공유 시 경고 토스트, 5MB 초과 시 확인 다이얼로그 |
| 드래그앤드롭이 기존 메모 드래그(위치 이동)와 충돌 | Medium | High | 편집 모드에서만 DnD 활성, 또는 특정 드롭 영역 제한 |
| 클립보드 붙여넣기 구현 누락(contentEditable 이벤트 복잡) | Low | Medium | `MemoRichEditor`의 `onPaste` 핸들러 활용, 이미지 검출 로직 추가 |
| iPhone 등에서 HEIC 붙여넣기 시 미지원 포맷 에러 | Low | Low | 허용 포맷 외 거부 + 사용자에게 변환 안내 토스트 |
| localStorage 쿼터 초과(브라우저 개발 모드) | High | Medium | 브라우저 모드는 IndexedDB 어댑터 사용 (`IndexedDBStorageAdapter` 기존 활용) |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level | 특성 | 권장 | 선택 |
|-------|-----|-----|:---:|
| **Starter** | 단순 구조 | 정적 사이트 | ☐ |
| **Dynamic** | 기능 모듈·BaaS | 풀스택 웹앱 | ☑ |
| **Enterprise** | 엄격 레이어·DI·마이크로서비스 | 대규모 시스템 | ☐ |

엔티티 확장 + 이미지 파이프라인(순수 함수) + UI 확장 — 4레이어 전반 수정.

### 6.2 Key Architectural Decisions

| 결정 | 옵션 | 선택 | 근거 |
|-----|-----|-----|-----|
| 저장 방식 | base64 dataURL in JSON / 파일 분리(`userData/memo-images/`) / IndexedDB Blob | **base64 dataURL** | `ImageWidget` 기존 패턴과 일관, `.ssampin` 공유 포맷 단순화, 크기 제한으로 비대화 억제 |
| 이미지 개수 | 단일 / 다중 | **단일(MVP)** | 스키마·UI 복잡도 억제, 피드백 1차 대응 충분 |
| 리사이즈 | Canvas / OffscreenCanvas / 라이브러리 | **Canvas 2D (기본 API)** | 의존성 추가 없음, 품질 충분 |
| 썸네일 생성 | 별도 저장 / CSS로 축소 | **CSS `object-fit`로 축소 표시** | 저장 공간 절약, 리사이즈된 원본(800px)으로 충분 |
| 드래그앤드롭 충돌 해결 | DnD는 편집 모드에서만 / 특정 드롭존 | **편집 모드에서만 DnD 활성** | 기존 카드 이동 UX 유지 |
| 순수 함수 위치 | adapters(React hook) / domain(util) | **domain/utils/imageResize.ts** | 순수 함수는 domain에 위치, 테스트 용이 |

### 6.3 Clean Architecture Approach

```
선택 레벨: Dynamic (Clean Architecture 4-layer)

영향 레이어:
┌──────────────────────────────────────────────┐
│ infrastructure/                              │
│   (기존 IStoragePort 사용 - 변경 없음)         │
│ ┌──────────────────────────────────────────┐ │
│ │ adapters/                                │ │
│ │  - repositories/JsonMemoRepository.ts ✏️ │ │
│ │  - stores/useMemoStore.ts           ✏️  │ │
│ │  - components/Memo/MemoCard.tsx     ✏️  │ │
│ │  - components/Memo/MemoDetailPopup.tsx ✏️│ │
│ │  - components/Memo/MemoFormatToolbar.tsx ✏│
│ │  - components/Memo/MemoRichEditor.tsx ✏️ │ │
│ │  - components/Memo/MemoImageAttachment.tsx ✨│
│ │ ┌──────────────────────────────────────┐ │ │
│ │ │ usecases/                            │ │ │
│ │ │  - memo/ManageMemos.ts           ✏️  │ │ │
│ │ │  - memo/AttachMemoImage.ts       ✨  │ │ │
│ │ │ ┌──────────────────────────────────┐ │ │ │
│ │ │ │ domain/                          │ │ │ │
│ │ │ │  - entities/Memo.ts          ✏️  │ │ │ │
│ │ │ │  - valueObjects/MemoImage.ts ✨  │ │ │ │
│ │ │ │  - rules/memoRules.ts        ✏️  │ │ │ │
│ │ │ │  - rules/shareRules.ts       ✏️  │ │ │ │
│ │ │ │  - utils/imageResize.ts      ✨  │ │ │ │
│ │ │ └──────────────────────────────────┘ │ │ │
│ │ └──────────────────────────────────────┘ │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘

의존성 방향 준수: domain은 외부 모듈 import 없음, 이미지 처리도
브라우저 표준 API(Canvas 2D)만 사용하는 순수 함수로 배치.
```

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] base64 dataURL 저장 패턴 (`ImageWidget` 선행 사례)
- [x] `IStoragePort` → Electron/IndexedDB/LocalStorage 3 어댑터 자동 감지
- [x] Material Symbols 아이콘 (`image`, `add_photo_alternate`, `close`)
- [x] 토스트 시스템 (`common/Toast` 기존 활용)

### 7.2 Conventions to Define/Verify

| 카테고리 | 현 상태 | 정의할 내용 | 우선순위 |
|---------|--------|-----------|:-------:|
| **valueObject 패턴** | `MemoColor` 존재 | `MemoImage` interface 정의 | High |
| **이미지 제한 상수** | 없음 | `MEMO_IMAGE_LIMITS` (MAX_SIZE_BYTES, MAX_DIMENSION, ALLOWED_MIME) | High |
| **도메인 유틸 위치** | 관례 없음 | `src/domain/utils/` 신규 폴더 허용 여부 확인 | Medium |
| **공유 파일 호환** | v1 포맷 운영 | 이미지 포함 v2 포맷 + 버전 필드 추가 | High |

### 7.3 Environment Variables Needed

불필요.

### 7.4 Pipeline Integration

PDCA 플로우 사용 (9-phase 미적용).

---

## 8. Next Steps

1. [ ] 설계 문서 작성 (`/pdca design memo-image-attachment`)
   - `MemoImage` 인터페이스 확정 (dataUrl/width/height 등)
   - 리사이즈 알고리즘 의사코드
   - 저장 파일 크기 시뮬레이션 (5MB × 50개 메모 = 250MB? → 제한 재검토)
   - `.ssampin` 포맷 v2 스키마
   - UI 시안 (썸네일 위치, 원본 뷰어)
2. [ ] `memo-font-size` 설계와 Memo 엔티티 필드 병합 순서 조정 (동일 엔티티 수정 충돌 방지)
3. [ ] 구현 (`/pdca do memo-image-attachment`)
4. [ ] Gap 분석 (`/pdca analyze memo-image-attachment`)
5. [ ] 릴리즈 (v1.11.0 노트, 챗봇 Q&A, 노션 가이드)

---

## 9. Dependencies on Sibling Feature

이 기능은 **[memo-font-size](./memo-font-size.plan.md)** 와 동일하게 `Memo` 엔티티를 수정한다. 구현 순서 권장:

1. `memo-font-size` 먼저 머지 (엔티티 변경 작음)
2. `memo-image-attachment` 구현 (엔티티 변경 큼, 마이그레이션 로직 추가)

또는 두 기능을 **하나의 Design 문서로 병합**하여 `Memo` 엔티티 변경·마이그레이션을 단일 PR로 처리하는 것도 고려. Design 단계에서 결정.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-17 | 초기 Plan 작성 (메모 이미지 첨부 피드백 대응) | pblsketch |
