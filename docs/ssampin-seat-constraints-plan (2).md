# 좌석 배치 조건 설정 기능 계획서

> **작성일**: 2026-03-06
> **대상 버전**: v0.3.x
> **연관 PRD**: FR-SEAT-06 (랜덤 배치), FR-SEAT-07 (히스토리 — v2.0)

---

## 1. 개요

### 1.1 문제 정의

현재 `RandomizeSeats`는 Fisher-Yates 셔플로 완전 무작위 배치만 수행한다.
실제 교실에서는 다음과 같은 조건이 필수적:

| 조건 유형 | 예시 | 공개 여부 |
|-----------|------|-----------|
| **영역 고정** | 시력이 나쁜 학생 → 앞줄 고정 | 학생에게 보여도 됨 |
| **영역 고정** | 키가 큰 학생 → 뒷줄 고정 | 학생에게 보여도 됨 |
| **분리 조건** | A와 B를 떨어뜨리기 | ⚠️ 학생에게 보여선 안 됨 |
| **인접 조건** | 도움 짝궁 (C 옆에 D 배치) | 상황에 따라 다름 |

### 1.2 핵심 원칙

1. **조건은 항상 셔플에 반영** — 학생 앞에서 🎲 버튼을 눌러도 조건 자동 적용
2. **관계 조건은 존재 자체를 숨김** — 좌석 페이지가 아닌 **설정 페이지**에서 관리하여, 학생이 이런 설정의 존재 자체를 인지하지 못하게 함
3. **조건 없이도 100% 동작** — 조건 0개면 기존과 동일하게 완전 무작위
4. **Clean Architecture 준수** — 조건 로직은 domain, UI는 adapters

---

## 2. 기능 상세

### 2.1 영역 고정 (Zone Constraints)

학생을 특정 영역에 고정. 셔플 시 해당 영역 내에서만 배치.

#### Zone 정의

```
┌─────────────────────────┐
│      [ 교 탁 ]           │
├─────────────────────────┤
│  front1 (맨앞 1줄)       │  ← row 0
│  front2 (앞 2줄)         │  ← row 0~1
│  ...                     │
│  back2  (뒤 2줄)         │  ← row (N-2)~(N-1)
│  back1  (맨뒤 1줄)       │  ← row (N-1)
├─────────────────────────┤
│  left1  (왼쪽 1열)       │  ← col 0
│  right1 (오른쪽 1열)     │  ← col (M-1)
│  center (가운데)         │  ← col 1~(M-2)
└─────────────────────────┘
```

#### 지원 Zone 목록

| Zone ID | 한국어 | 설명 |
|---------|--------|------|
| `front1` | 맨앞줄 | row 0 |
| `front2` | 앞 2줄 | row 0~1 |
| `front3` | 앞 3줄 | row 0~2 |
| `back1` | 맨뒷줄 | row (N-1) |
| `back2` | 뒤 2줄 | row (N-2)~(N-1) |
| `left1` | 왼쪽 1열 | col 0 |
| `right1` | 오른쪽 1열 | col (M-1) |
| `center` | 가운데 | col 1~(M-2) |

#### 데이터 모델

```typescript
interface ZoneConstraint {
  readonly studentId: string;
  readonly zone: ZoneId;
  readonly reason: string;  // "시력", "키", "집중력" 등
}
```

### 2.2 분리 조건 (Separation Constraints) — PIN 보호

두 학생 사이의 최소 거리를 보장. **교사만 볼 수 있음.**

#### 거리 계산: 맨해튼 거리

```
distance = |row_A - row_B| + |col_A - col_B|
```

#### 데이터 모델

```typescript
interface SeparationConstraint {
  readonly studentA: string;  // studentId
  readonly studentB: string;  // studentId
  readonly minDistance: number; // 1=인접불가, 2=한칸 이상, 3=두칸 이상
}
```

### 2.3 인접 조건 (Adjacency Constraints)

두 학생을 가까이 배치 (맨해튼 거리 ≤ maxDistance).

```typescript
interface AdjacencyConstraint {
  readonly studentA: string;
  readonly studentB: string;
  readonly maxDistance: number; // 1=바로 옆, 2=한칸 이내
}
```

### 2.4 좌석 고정 (Fixed Seat)

특정 학생을 정확한 좌석에 고정 (셔플 대상에서 제외).

```typescript
interface FixedSeatConstraint {
  readonly studentId: string;
  readonly row: number;
  readonly col: number;
  readonly reason: string;
}
```

### 2.5 전체 조건 데이터 모델

```typescript
// domain/entities/SeatConstraints.ts

export type ZoneId =
  | 'front1' | 'front2' | 'front3'
  | 'back1' | 'back2'
  | 'left1' | 'right1'
  | 'center';

export interface ZoneConstraint {
  readonly studentId: string;
  readonly zone: ZoneId;
  readonly reason: string;
}

export interface SeparationConstraint {
  readonly studentA: string;
  readonly studentB: string;
  readonly minDistance: number;
}

export interface AdjacencyConstraint {
  readonly studentA: string;
  readonly studentB: string;
  readonly maxDistance: number;
}

export interface FixedSeatConstraint {
  readonly studentId: string;
  readonly row: number;
  readonly col: number;
  readonly reason: string;
}

export interface SeatConstraints {
  readonly zones: readonly ZoneConstraint[];
  readonly separations: readonly SeparationConstraint[];
  readonly adjacencies: readonly AdjacencyConstraint[];
  readonly fixedSeats: readonly FixedSeatConstraint[];
}
```

---

## 3. 셔플 알고리즘

### 3.1 전략: 제약 충족 + 랜덤 재시도

```
1. 고정좌석 학생을 해당 좌석에 배치 (셔플 대상에서 제외)
2. 영역고정 학생을 해당 영역의 빈 좌석 중 랜덤 배치
3. 나머지 학생을 남은 빈 좌석에 Fisher-Yates 셔플
4. 분리 조건 + 인접 조건 검증
5. 조건 불만족 → Step 2~4를 재시도 (최대 200회)
6. 200회 실패 → 조건 완화 시도 (분리 거리 -1) → 재시도
7. 최종 실패 → "조건을 모두 만족하는 배치를 찾지 못했습니다" 토스트
```

### 3.2 성능 목표

- 30명 이하 + 조건 5개 이내: < 100ms
- 40명 + 조건 10개: < 500ms
- 시간 초과 방지: 최대 시도 횟수 제한 (200회)

### 3.3 순수 함수 시그니처 (domain/rules)

```typescript
// domain/rules/seatRules.ts에 추가

export interface ShuffleResult {
  readonly seats: (string | null)[][];
  readonly success: boolean;
  readonly attempts: number;
  readonly relaxed: boolean;  // 조건 완화 여부
  readonly violations: string[];  // 불만족 조건 설명
}

export function shuffleSeatsWithConstraints(
  seats: readonly (readonly (string | null)[])[],
  constraints: SeatConstraints,
  rows: number,
  cols: number,
  random?: () => number,
): ShuffleResult;

export function getZonePositions(
  zone: ZoneId,
  rows: number,
  cols: number,
): { row: number; col: number }[];

export function validateConstraints(
  seats: readonly (readonly (string | null)[])[],
  constraints: SeatConstraints,
): { valid: boolean; violations: string[] };

export function manhattanDistance(
  r1: number, c1: number,
  r2: number, c2: number,
): number;
```

---

## 4. 은닉 체계 (관계 조건 = 설정 페이지에서 관리)

### 4.1 설계 철학: "존재 자체를 숨긴다"

학생 앞에서 프로젝터로 좌석 배치 화면을 띄울 때, 학생은 **분리/인접 조건이 존재한다는 사실 자체를 모르게** 해야 한다.

PIN 잠금으로 가리는 것만으로는 부족하다 — 🔒 아이콘이 보이는 것 자체가 "숨겨진 뭔가가 있다"는 정보 노출이 된다.

### 4.2 UI 배치 전략: 공개 조건 vs 비공개 조건 분리

```
[좌석 배치 페이지] — 학생에게 노출되는 화면
├── ⚙️ 배치 조건 버튼 → 영역 고정 + 좌석 고정만 (공개 가능한 조건)
├── 🎲 자리 바꾸기 → 모든 조건 자동 반영 (분리/인접 포함, 보이지 않게)
└── ✏️ 편집

[설정 페이지] — 교사만 접근하는 화면
├── ... 기존 설정 섹션들 ...
├── 🔒 PIN 잠금 설정
└── 🪑 좌석 관계 설정 (신규 섹션!)  ← ⭐ 관계 조건은 여기!
    ├── 🚫 분리 조건 (김민수 ↔ 이태호, 거리 2칸 이상)
    └── 🤝 인접 조건 (박지영 ↔ 최은서, 1칸 이내)
```

### 4.3 보호 방식

| 조건 유형 | UI 위치 | 학생 인지 가능성 |
|-----------|---------|-----------------|
| 영역 고정 (Zone) | **좌석 페이지** ⚙️ 배치 조건 모달 | ✅ 알 수 있음 (공개 OK) |
| 좌석 고정 (Fixed) | **좌석 페이지** ⚙️ 배치 조건 모달 | ✅ 알 수 있음 (공개 OK) |
| 분리 조건 (Separation) | **설정 페이지** 좌석 관계 설정 섹션 | ❌ 모름 |
| 인접 조건 (Adjacency) | **설정 페이지** 좌석 관계 설정 섹션 | ❌ 모름 |

### 4.4 핵심 UX

- 좌석 페이지의 ⚙️ 배치 조건에는 영역/좌석 고정만 → 학생에게 "시력 앞줄", "키 뒷줄" 정도만 보임
- 관계 설정은 **설정 페이지에만 존재** → 학생이 설정 페이지를 열 일 없음
- 설정 페이지 자체도 PIN으로 보호 가능 (이미 지원됨)
- **셔플 시에는 모든 조건(영역+좌석+분리+인접) 자동 반영** — 학생 앞에서 🎲 눌러도 안심

---

## 5. UI/UX 설계

### 5.1 진입점 A: 좌석 배치 페이지 (공개 조건)

헤더에 **⚙️ 배치 조건** 버튼 추가 (기존 "자리 바꾸기"와 "편집" 사이):

```
[🔀 자리 바꾸기] [⚙️ 배치 조건] [✏️ 편집]  ...  [📥 내보내기]
```

### 5.2 배치 조건 모달 — 영역/좌석 고정만 (SeatZoneModal)

학생 앞에서 보여도 되는 조건만. 탭 없이 단일 화면.

```
┌──────────────────────────────────────────────┐
│  ⚙️ 배치 조건 설정                     [✕]  │
├──────────────────────────────────────────────┤
│                                              │
│  📍 영역 고정                                │
│  ┌────────────────────────────────────────┐  │
│  │ + 조건 추가                            │  │
│  ├────────────────────────────────────────┤  │
│  │ [03] 김민수  │ 앞 2줄  │ 시력  │ [🗑️] │  │
│  │ [15] 박지영  │ 뒷줄    │ 키    │ [🗑️] │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  📌 좌석 고정                                │
│  ┌────────────────────────────────────────┐  │
│  │ + 조건 추가                            │  │
│  ├────────────────────────────────────────┤  │
│  │ [22] 이태호  │ 2행 3열 │ 특수  │ [🗑️] │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  💡 셔플 시 고정 조건이 자동 적용됩니다.      │
│                                              │
│                          [취소]  [💾 저장]   │
└──────────────────────────────────────────────┘
```

### 5.3 진입점 B: 설정 페이지 (비공개 조건)

설정 페이지(`SettingsPage.tsx`)의 기존 섹션들 사이에 **"좌석 관계 설정"** 섹션을 추가.
기존 PIN 잠금 설정 섹션 근처에 배치.

```
설정 페이지
├── 학교 정보
├── 시간표 설정
├── 위젯 설정
├── 날씨 설정
├── 알림 사운드
├── 🔒 PIN 잠금 설정          ← 기존
├── 🪑 좌석 관계 설정          ← ⭐ 신규 섹션!
├── 앱 정보
└── ...
```

### 5.4 좌석 관계 설정 섹션 UI (SeatRelationSection)

설정 페이지 내부 섹션으로 구현. 모달이 아닌 **인라인 섹션**.

```
┌──────────────────────────────────────────────┐
│  🪑  좌석 관계 설정                          │
│                                              │
│  ℹ️ 이 설정은 학생에게 표시되지 않습니다.     │
│     자리 바꾸기(셔플) 시 자동으로 반영됩니다. │
│                                              │
│  🚫 분리 조건                                │
│  ┌────────────────────────────────────────┐  │
│  │ [+ 추가]                               │  │
│  ├────────────────────────────────────────┤  │
│  │ 김민수 ↔ 이태호  │ 2칸 이상    │ [🗑️] │  │
│  │ 박서준 ↔ 최유리  │ 인접 불가   │ [🗑️] │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  🤝 인접 조건                                │
│  ┌────────────────────────────────────────┐  │
│  │ [+ 추가]                               │  │
│  ├────────────────────────────────────────┤  │
│  │ 박지영 ↔ 최은서  │ 바로 옆     │ [🗑️] │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ⚠️ 충돌: 없음                               │
└──────────────────────────────────────────────┘
```

### 5.5 셔플 시 피드백

- 조건 있을 때 확인 모달 문구:
  > "모든 학생의 좌석을 랜덤으로 재배치합니다."
  > (조건 수를 **일부러 표시하지 않음** — 학생이 "조건이 뭐야?" 물을 수 있으므로)
- 조건 불만족 시 토스트는 **학생 이름 없이** 표시:
  > ⚠️ "일부 배치 조건을 완전히 만족하지 못했습니다"
  > (상세 내용은 설정 페이지에서 확인 유도)

### 5.6 좌석 그리드에 조건 힌트 표시

편집 모드에서 **공개 조건만** 힌트 표시:
- 📍 = 영역 고정
- 📌 = 좌석 고정
- ❌ 관계 조건 힌트는 좌석 페이지에 **절대 표시하지 않음**

---

## 6. 데이터 저장

### 6.1 파일 구조

```
data/
├── seating.json              ← 기존 (좌석 배치)
├── seat-constraints.json     ← 신규 (배치 조건)
└── ...
```

### 6.2 seat-constraints.json 스키마

```json
{
  "zones": [
    { "studentId": "s1709000_0", "zone": "front2", "reason": "시력" }
  ],
  "separations": [
    { "studentA": "s1709000_4", "studentB": "s1709000_11", "minDistance": 2 }
  ],
  "adjacencies": [
    { "studentA": "s1709000_2", "studentB": "s1709000_5", "maxDistance": 1 }
  ],
  "fixedSeats": [
    { "studentId": "s1709000_21", "row": 0, "col": 2, "reason": "특수교육" }
  ]
}
```

---

## 7. 구현 단계 (Phase)

### Phase 1: 인프라 + 영역/좌석 고정 + 셔플 알고리즘 (핵심 골격)

**domain 레이어:**
- `domain/entities/SeatConstraints.ts` — 타입 정의 (전체 조건 모델)
- `domain/repositories/ISeatConstraintsRepository.ts` — 포트
- `domain/rules/seatRules.ts` — `getZonePositions()`, `shuffleSeatsWithConstraints()`, `validateConstraints()`, `manhattanDistance()` 추가

**usecases:**
- `usecases/seating/RandomizeSeats.ts` — 조건 주입 확장
- `usecases/seating/ManageSeatConstraints.ts` — 신규 (CRUD)

**adapters:**
- `adapters/repositories/JsonSeatConstraintsRepository.ts` — 저장소 구현
- `adapters/stores/useSeatConstraintsStore.ts` — 상태 관리
- `adapters/di/container.ts` — DI 등록

**UI (좌석 페이지 — 공개 조건):**
- `adapters/components/Seating/SeatZoneModal.tsx` — 영역 고정 + 좌석 고정 모달
- `Seating.tsx` — ⚙️ 버튼 + 모달 연결 + 셔플 시 조건 전달

### Phase 2: 관계 조건 UI (설정 페이지에 비공개 배치)

**UI (설정 페이지 — 비공개 조건):**
- `adapters/components/Settings/SeatRelationSection.tsx` — 분리/인접 조건 설정 섹션 (신규)
- `adapters/components/Settings/SettingsPage.tsx` — SeatRelationSection 삽입

**domain:**
- Phase 1에서 이미 분리/인접 로직 구현 완료, Phase 2는 UI만

### Phase 3: UX 개선

- 좌석 카드에 공개 조건 힌트 아이콘 (📍📌만, 관계 조건 힌트 절대 표시 안 함)
- 셔플 실패 시 학생 이름 없이 안전한 피드백
- 자리 뽑기 도구(ToolSeatPicker)에도 조건 반영

---

## 8. 파일 변경 목록 (Phase 1 + 2 전체)

### 신규 파일 (8개)

| 파일 | 레이어 | 설명 |
|------|--------|------|
| `src/domain/entities/SeatConstraints.ts` | domain | 타입 정의 |
| `src/domain/repositories/ISeatConstraintsRepository.ts` | domain | Repository 인터페이스 |
| `src/usecases/seating/ManageSeatConstraints.ts` | usecases | CRUD 유스케이스 |
| `src/adapters/repositories/JsonSeatConstraintsRepository.ts` | adapters | JSON 저장소 |
| `src/adapters/stores/useSeatConstraintsStore.ts` | adapters | Zustand 스토어 |
| `src/adapters/components/Seating/SeatZoneModal.tsx` | adapters | 영역/좌석 고정 모달 (좌석 페이지) |
| `src/adapters/components/Seating/ConstraintHintBadge.tsx` | adapters | 좌석 힌트 배지 (📍📌만) |
| `src/adapters/components/Settings/SeatRelationSection.tsx` | adapters | 분리/인접 설정 섹션 (**설정 페이지**) |

### 수정 파일 (7개)

| 파일 | 변경 내용 |
|------|-----------|
| `src/domain/rules/seatRules.ts` | `shuffleSeatsWithConstraints()` 등 4개 함수 추가 |
| `src/domain/entities/index.ts` | SeatConstraints re-export |
| `src/usecases/seating/RandomizeSeats.ts` | 조건 Repository 주입, 조건 반영 셔플 호출 |
| `src/usecases/seating/index.ts` | ManageSeatConstraints re-export |
| `src/adapters/di/container.ts` | seatConstraintsRepository 등록 |
| `src/adapters/components/Seating/Seating.tsx` | ⚙️ 버튼, 모달, 셔플 조건 전달 |
| `src/adapters/components/Settings/SettingsPage.tsx` | SeatRelationSection 삽입 (PIN 잠금 섹션 아래) |

---

## 9. 테스트 시나리오

| # | 시나리오 | 예상 결과 |
|---|---------|-----------|
| 1 | 조건 0개 + 셔플 | 기존과 동일 (완전 무작위) |
| 2 | 1명 앞줄 고정 + 셔플 | 해당 학생 항상 row 0 |
| 3 | 1명 좌석 고정 + 셔플 | 해당 학생 위치 불변 |
| 4 | 2명 분리(거리2) + 셔플 | 맨해튼 거리 ≥ 2 |
| 5 | 2명 인접(거리1) + 셔플 | 맨해튼 거리 ≤ 1 |
| 6 | 충돌하는 조건 | 실패 토스트 + 최선 배치 |
| 7 | 좌석 페이지에서 관계 조건 흔적 확인 | 어떤 UI에도 분리/인접 정보 없음 |
| 8 | 설정 페이지에서 관계 조건 설정 | 정상 CRUD 동작 |
| 9 | 명렬표 학생 삭제 후 조건 | 해당 조건 자동 정리 |
| 10 | 그리드 리사이즈 후 조건 | 영역 재계산, 고정좌석 범위 초과 시 경고 |

---

## 10. 리스크 및 대안

| 리스크 | 대안 |
|--------|------|
| 조건이 너무 많아 배치 불가능 | 최대 시도 후 조건 완화 → 부분 만족 결과 반환 |
| 그리드 크기 변경 시 고정좌석 무효화 | 범위 초과 조건 자동 비활성화 + 토스트 알림 |
| 학생 삭제/전학 시 orphan 조건 | 저장 시 유효성 검증, 무효 조건 자동 제거 |
| 자리 뽑기 도구와의 정합성 | Phase 3에서 ToolSeatPicker에도 조건 반영 |

---

## 부록: 디자인 시스템 참고

현재 쌤핀 디자인 토큰:
- 배경: `sp-bg` (#0a0e17)
- 카드: `sp-card` (#1a2332)
- 강조: `sp-accent` (#3b82f6)
- 하이라이트: `sp-highlight` (#f59e0b)
- 경고: `text-red-400`, `bg-red-500/10`
- 보호: `text-amber-400`, `bg-amber-500/10`

모달 스타일은 기존 `showConfirm` 모달 패턴 (검정 반투명 배경 + sp-card 패널) 따를 것.
