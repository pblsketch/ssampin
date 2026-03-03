# 쌤핀 메모 팝업 상세보기 기능 계획서

> 작성일: 2026-03-03  
> 대상 레포: pblsketch/ssampin

---

## 📋 목차

1. [현재 구조 분석](#1-현재-구조-분석)
2. [요구사항 정리](#2-요구사항-정리)
3. [설계 방향](#3-설계-방향)
4. [UI/UX 설계](#4-uiux-설계)
5. [구현 계획](#5-구현-계획)
6. [파일 변경 목록](#6-파일-변경-목록)
7. [예상 이슈 및 대응](#7-예상-이슈-및-대응)

---

## 1. 현재 구조 분석

### 메모 관련 파일 구조
```
src/
├── domain/
│   ├── entities/Memo.ts                 # Memo 인터페이스 (id, content, color, x, y, rotation, timestamps)
│   ├── valueObjects/MemoColor.ts        # MemoColor 타입 (yellow/pink/green/blue)
│   └── repositories/IMemoRepository.ts  # 리포지토리 인터페이스
├── usecases/memo/ManageMemos.ts         # CRUD 유스케이스
├── adapters/
│   ├── stores/useMemoStore.ts           # Zustand 스토어 (load, add, update, delete, position, color)
│   ├── components/
│   │   ├── Dashboard/DashboardMemo.tsx  # 대시보드 위젯 (최근 3개, 2줄 미리보기)
│   │   └── Memo/
│   │       ├── MemoPage.tsx             # 전체 메모 페이지 (캔버스 + 포스트잇 보드)
│   │       └── MemoCard.tsx             # 개별 포스트잇 카드 (드래그, 편집, 색상 변경)
└── widgets/items/Memo.tsx               # 위젯 래퍼 (DashboardMemo 재사용)
```

### 메모 데이터 구조
```typescript
interface Memo {
  readonly id: string;
  readonly content: string;
  readonly color: MemoColor;       // 'yellow' | 'pink' | 'green' | 'blue'
  readonly x: number;              // 캔버스 x 좌표
  readonly y: number;              // 캔버스 y 좌표
  readonly rotation: number;       // -3 ~ 3도 회전
  readonly createdAt: string;      // ISO 8601
  readonly updatedAt: string;      // ISO 8601
}
```

### 현재 메모 표시 방식

**대시보드/위젯 (`DashboardMemo.tsx`)**:
```
┌─────────────────────────────────┐
│ 메모                             │
├─────────────────────────────────┤
│ ┌─────────┬─────────┬─────────┐│
│ │ 메모1    │ 메모2    │ 메모3   ││
│ │ (2줄)    │ (2줄)    │ (2줄)  ││  ← WebkitLineClamp: 2
│ └─────────┴─────────┴─────────┘│
└─────────────────────────────────┘
```
- 최근 3개만 표시
- 내용 2줄로 잘림 (`-webkit-line-clamp: 2`)
- **클릭 이벤트 없음** ← 이게 문제!

**메모 페이지 (`MemoPage.tsx` + `MemoCard.tsx`)**:
```
┌──────────────────────────────────┐
│ 포스트잇 캔버스 (자유 배치)        │
│   ┌──────┐                       │
│   │ 메모1  │  ┌──────┐           │
│   │ 전체   │  │ 메모2  │         │
│   │ 내용   │  │ 전체   │         │
│   └──────┘  │ 내용   │         │
│              └──────┘           │
└──────────────────────────────────┘
```
- 전체 내용 표시 (min-height: 140px)
- 더블클릭 → 편집 모드
- 드래그로 위치 이동
- **이미 전체 내용이 보이므로 팝업 불필요**
- 하지만 내용이 길면 잘릴 수 있음

### 문제점 요약
| 위치 | 현재 상태 | 문제 |
|------|----------|------|
| 대시보드 위젯 | 2줄 미리보기 | 클릭해도 아무 반응 없음 |
| 위젯 모드 | 동일 (DashboardMemo 재사용) | 클릭해도 아무 반응 없음 |
| 메모 페이지 | 전체 내용 표시 | 긴 메모는 카드 밖으로 넘칠 수 있음 |

---

## 2. 요구사항 정리

| # | 요구사항 | 우선순위 |
|---|---------|---------|
| R1 | 대시보드/위젯의 메모 미리보기 클릭 시 **상세 팝업** 표시 | 🔴 필수 |
| R2 | 팝업에서 **전체 내용** 확인 가능 | 🔴 필수 |
| R3 | 팝업에서 **편집** 가능 (선택) | 🟡 권장 |
| R4 | 팝업에서 **색상 변경** 가능 (선택) | 🟢 선택 |
| R5 | 팝업에서 **삭제** 가능 (선택) | 🟢 선택 |
| R6 | ESC / 외부 클릭으로 팝업 닫기 | 🔴 필수 |
| R7 | 위젯 모드(투명 창)에서도 정상 동작 | 🔴 필수 |

---

## 3. 설계 방향

### 3.1 팝업 컴포넌트: `MemoDetailPopup`

독립적인 모달/팝업 컴포넌트로 구현:
- `ReactDOM.createPortal(popup, document.body)` 사용 (위젯 모드 호환)
- 포스트잇 스타일 유지 (색상별 배경)
- 편집 기능 포함 (더블클릭 또는 바로 편집 가능)

### 3.2 적용 대상

| 컴포넌트 | 적용 방식 |
|---------|----------|
| `DashboardMemo.tsx` | 메모 카드 클릭 → MemoDetailPopup 열기 |
| `Widget.tsx` (위젯 모드) | 동일 (DashboardMemo 재사용이므로 자동 적용) |
| `MemoCard.tsx` (메모 페이지) | 클릭(싱글) → MemoDetailPopup 열기 / 더블클릭 → 기존 인라인 편집 유지 |

### 3.3 상호작용 설계

```
[대시보드/위젯]
  메모 카드 클릭 → MemoDetailPopup 표시
    → 내용 읽기 (스크롤 가능)
    → 편집 버튼 클릭 → 편집 모드 전환
    → 저장 (자동 or Enter)
    → ESC / 외부 클릭 → 닫기

[메모 페이지]  
  포스트잇 싱글 클릭 → MemoDetailPopup 표시 (긴 메모 전체 확인용)
  포스트잇 더블 클릭 → 기존 인라인 편집 (현재 동작 유지)
```

---

## 4. UI/UX 설계

### 4.1 팝업 디자인

```
                 ┌──────────────── 360px ────────────────┐
                 │                                        │
  ┌──────────────────────────────────────────────────────┐
  │ ┌──────────────────────────────────────────────────┐ │
  │ │ 🟡🟠🟢🔵   색상 선택        [✏️]  [🗑️]  [✕]  │ │ ← 헤더
  │ └──────────────────────────────────────────────────┘ │
  │                                                      │
  │   여기에 메모 전체 내용이 표시됩니다.                     │
  │   여러 줄이어도 스크롤 없이 보이고,                      │
  │   내용이 매우 길면 스크롤 가능합니다.                     │
  │                                                      │
  │   max-height: 60vh                                   │
  │                                                      │
  │ ┌──────────────────────────────────────────────────┐ │
  │ │ 📅 2026. 3. 3. 15:42 수정됨                      │ │ ← 푸터
  │ └──────────────────────────────────────────────────┘ │
  └──────────────────────────────────────────────────────┘
```

### 4.2 스타일 상세

**배경**: 메모 색상에 맞는 포스트잇 색상 (밝은 톤)
```typescript
const POPUP_BG: Record<MemoColor, string> = {
  yellow: 'bg-yellow-100',
  pink:   'bg-pink-100',
  green:  'bg-green-100',
  blue:   'bg-blue-100',
};
```

**오버레이**: 반투명 블러 배경 (`bg-black/40 backdrop-blur-sm`)

**카드**:
- 너비: `w-[360px]` (모바일 대응: `max-w-[90vw]`)
- 최대 높이: `max-h-[60vh]`
- 그림자: `shadow-2xl`
- 둥글기: `rounded-xl`
- 진입 애니메이션: `scale(0.95) → scale(1)`, `opacity(0) → opacity(1)`, `200ms ease-out`

**헤더**:
- 색상 점 4개 (클릭 시 변경)
- 편집 아이콘 (✏️ → 읽기 모드 ↔ 편집 모드 전환)
- 삭제 아이콘 (🗑️, 클릭 시 확인 필요 없이 삭제 + 팝업 닫기)
- 닫기 아이콘 (✕)

**내용 영역**:
- 읽기 모드: `whitespace-pre-wrap`, 스크롤 가능
- 편집 모드: `<textarea>`, auto-resize

**푸터**:
- 수정 시간 표시 (한국어 날짜 포맷)
- 텍스트 색상: `text-slate-500 text-xs`

### 4.3 대시보드 메모 카드 변경

현재 카드에 **클릭 커서 + 호버 효과** 추가:
```
기존: 그냥 텍스트 블록
변경: cursor-pointer + hover:bg-{color}-400/30 + transition
```

### 4.4 진입 애니메이션

```css
@keyframes popup-enter {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(4px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.memo-popup-enter {
  animation: popup-enter 200ms ease-out;
}
```

---

## 5. 구현 계획

### Phase 1: MemoDetailPopup 컴포넌트 (1일)

**신규 파일**: `src/adapters/components/Memo/MemoDetailPopup.tsx`

```typescript
interface MemoDetailPopupProps {
  memo: Memo;
  onClose: () => void;
  onUpdate?: (id: string, content: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onColorChange?: (id: string, color: MemoColor) => Promise<void>;
}
```

구현 내용:
- ReactDOM.createPortal로 document.body에 렌더링
- 오버레이 (bg-black/40) 클릭 → onClose
- ESC 키 → onClose
- 포스트잇 스타일 카드 (색상별 배경)
- 읽기/편집 모드 토글
- 색상 변경 (컬러 점 클릭)
- 삭제 버튼
- 수정 시간 표시
- 진입 애니메이션 (CSS animation)

### Phase 2: DashboardMemo에 팝업 연결 (0.5일)

**수정 파일**: `src/adapters/components/Dashboard/DashboardMemo.tsx`

변경 내용:
- `useState`로 선택된 메모(selectedMemo) 관리
- 각 메모 카드에 `onClick` → `setSelectedMemo(memo)` 추가
- `cursor-pointer` + 호버 효과 추가
- `selectedMemo`가 있으면 `MemoDetailPopup` 렌더링
- `useMemoStore`에서 `updateMemo`, `deleteMemo` 가져와서 팝업에 전달
- 삭제 후 selectedMemo 초기화

### Phase 3: MemoCard(메모 페이지)에 팝업 연결 (0.5일)

**수정 파일**: `src/adapters/components/Memo/MemoCard.tsx`

변경 내용:
- 기존 `onDoubleClick` → 인라인 편집 (유지)
- 새로운 `onClick` (싱글 클릭) → 팝업 열기
- 싱글 클릭 vs 더블 클릭 구분:
  - 300ms 디바운스로 싱글/더블 클릭 구분
  - 또는 `onDoubleClick`이 우선되도록 처리
- props에 `onOpenDetail?: (memo: Memo) => void` 추가
- `MemoPage.tsx`에서 상태 관리 + MemoDetailPopup 렌더링

### Phase 4: 엣지 케이스 & 폴리싱 (0.5일)

- 빈 메모 팝업: "메모 내용이 없습니다" 표시 + 편집 모드로 자동 전환
- 매우 긴 메모: max-height + overflow-y-auto
- 위젯 모드: 팝업이 위젯 창 밖으로 나가지 않도록 위치 조정
- 편집 중 ESC: 변경 사항 저장 후 닫기 (blur 트리거)
- 다크/라이트 테마 호환

---

## 6. 파일 변경 목록

### 신규 파일 (1개)

| 파일 | 설명 |
|------|------|
| `src/adapters/components/Memo/MemoDetailPopup.tsx` | 메모 상세 팝업 (읽기/편집/삭제/색상 변경) |

### 수정 파일 (3개)

| 파일 | 변경 내용 |
|------|----------|
| `src/adapters/components/Dashboard/DashboardMemo.tsx` | 클릭 이벤트 + 팝업 연결 + 호버 효과 |
| `src/adapters/components/Memo/MemoCard.tsx` | 싱글 클릭 → 팝업 열기 (더블 클릭은 기존 유지) |
| `src/adapters/components/Memo/MemoPage.tsx` | MemoDetailPopup 상태 관리 + 렌더링 |

### 변경 없는 파일
- `Memo.ts` (도메인 엔티티) — 변경 불필요
- `MemoColor.ts` — 변경 불필요
- `useMemoStore.ts` — 기존 updateMemo, deleteMemo, updateColor 그대로 사용
- `widgets/items/Memo.tsx` — DashboardMemo 재사용이므로 자동 적용

---

## 7. 예상 이슈 및 대응

### 이슈 1: 싱글 클릭 vs 더블 클릭 충돌 (MemoCard)
- **원인**: MemoCard에서 싱글 클릭(팝업) vs 더블 클릭(인라인 편집) 구분 필요
- **대응**: 300ms setTimeout으로 싱글 클릭 지연, 더블 클릭 시 clearTimeout
- 또는 MemoCard에서는 팝업 없이, 메모 페이지의 기존 UX 유지 (대시보드/위젯에서만 팝업)

### 이슈 2: 드래그 시작 vs 클릭 충돌 (MemoCard)
- **원인**: mousedown이 드래그 시작인데, 클릭과 구분 어려움
- **대응**: 드래그 거리 8px 이상이면 드래그, 미만이면 클릭으로 처리
- 이미 PointerSensor에 `activationConstraint: { distance: 8 }` 패턴 있음

### 이슈 3: 위젯 모드에서 팝업 크기
- **원인**: 위젯 창이 작을 수 있음 (640x480 최소)
- **대응**: `max-w-[90vw]`, `max-h-[80vh]`로 반응형 처리

### 이슈 4: 팝업에서 편집 후 목록 동기화
- **원인**: 팝업에서 내용 수정 시 DashboardMemo의 미리보기도 업데이트 필요
- **대응**: useMemoStore가 Zustand이므로 자동 동기화됨 (전역 상태)

---

## 📐 와이어프레임

### 대시보드/위젯에서 클릭 전
```
┌──────────────────────────────┐
│ 메모                          │
│ ┌────────┬────────┬────────┐ │
│ │ 오늘 할  │ 3학년   │ 회의   │ │
│ │ 일 정... │ 수업... │ 준비.. │ │  ← 클릭 가능 (pointer)
│ └────────┴────────┴────────┘ │
└──────────────────────────────┘
```

### 클릭 후 팝업
```
┌─── (오버레이: bg-black/40) ──────────────────┐
│                                                │
│    ┌─────────── 360px ────────────────┐       │
│    │ 🟡🟠🟢🔵          [✏️] [🗑️] [✕] │       │
│    ├──────────────────────────────────┤       │
│    │                                  │       │
│    │  오늘 할 일 정리                   │       │
│    │                                  │       │
│    │  1. 3학년 2반 수행평가 채점         │       │
│    │  2. 교직원 회의 자료 준비           │       │
│    │  3. 내일 수업 PPT 만들기          │       │
│    │  4. 학부모 상담 일정 확인           │       │
│    │  5. 동아리 활동 계획서 작성         │       │
│    │                                  │       │
│    ├──────────────────────────────────┤       │
│    │ 📅 2026. 3. 3. 15:42 수정됨      │       │
│    └──────────────────────────────────┘       │
│                                                │
└────────────────────────────────────────────────┘
```

### 편집 모드
```
    ┌─────────── 360px ────────────────┐
    │ 🟡🟠🟢🔵        [💾 저장] [✕]   │
    ├──────────────────────────────────┤
    │ ┌──────────────────────────────┐ │
    │ │ 오늘 할 일 정리              │ │ ← textarea
    │ │                              │ │    auto-resize
    │ │ 1. 3학년 2반 수행평가 채점    │ │
    │ │ 2. 교직원 회의 자료 준비      │ │
    │ │ 3. 내일 수업 PPT 만들기     │ │
    │ │ 4. 학부모 상담 일정 확인      │ │
    │ │ 5. 동아리 활동 계획서 작성    │ │
    │ │ _                           │ │
    │ └──────────────────────────────┘ │
    ├──────────────────────────────────┤
    │ 📅 2026. 3. 3. 15:42 수정됨      │
    └──────────────────────────────────┘
```

---

## 🗓️ 예상 일정

| 단계 | 기간 | 산출물 |
|------|------|--------|
| Phase 1 | 1일 | MemoDetailPopup 컴포넌트 |
| Phase 2 | 0.5일 | 대시보드/위젯 연결 |
| Phase 3 | 0.5일 | 메모 페이지 연결 (선택) |
| Phase 4 | 0.5일 | 엣지 케이스 + 테마 |
| **합계** | **2~3일** | |

---

## ✅ 체크리스트

- [ ] 대시보드에서 메모 카드 클릭 시 팝업 표시
- [ ] 위젯 모드에서 메모 카드 클릭 시 팝업 표시
- [ ] 팝업에서 메모 전체 내용 확인 가능
- [ ] 팝업에서 편집 가능
- [ ] 팝업에서 색상 변경 가능
- [ ] 팝업에서 삭제 가능
- [ ] ESC / 외부 클릭으로 팝업 닫기
- [ ] 포스트잇 스타일 디자인 유지
- [ ] 다크/라이트 테마 호환
- [ ] 수정 시간 표시
- [ ] 편집 후 목록 자동 업데이트 (Zustand)
