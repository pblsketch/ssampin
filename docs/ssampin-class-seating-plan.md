# 📋 쌤핀 수업관리 × 좌석배치 연동 — 기획 문서

## 배경

교과전담 선생님은 담임반이 아닌 **여러 반**을 가르침.
현재 쌤핀의 좌석배치는 담임 학급(단일 명렬표) 전용이라, 교과전담 선생님은 **수업관리에서 반별 명렬표를 따로 관리**하면서도 **좌석배치 기능을 사용할 수 없음**.

### 사용자 요청 원문
> "교과전담이라서 반별로 자리배치되게 되면 좋겠어요. 반별 명렬표를 불러와서 자리배치하고 세이브할 수 있게 되면 활용이 좀더 용이할 것 같습니다!"

---

## 현재 구조 분석

### 좌석배치 (Seating)
- **데이터**: `seating.json` — 단일 SeatingData (rows, cols, seats[][])
- **학생 참조**: `useStudentStore`의 Student[] (담임반 명렬표)
- **저장**: `JsonSeatingRepository` → `storage.write('seating', data)`
- **한계**: 학급 1개만 지원, 수업반별 구분 없음

### 수업관리 (ClassManagement)
- **데이터**: `teaching-classes.json` — TeachingClass[] (id, name, subject, students[])
- **학생**: TeachingClassStudent (number, name, grade?, classNum?)
- **탭**: 명렬표(ClassRosterTab) + 진도관리(ProgressTab)
- **좌석배치 탭**: ❌ 없음

### 핵심 차이
| | 담임 좌석배치 | 수업관리 |
|---|---|---|
| 학생 타입 | Student (id, name) | TeachingClassStudent (number, name, grade?, classNum?) |
| 식별자 | UUID (id) | 복합키 (grade-classNum-number) |
| 좌석 데이터 | 단일 파일 | 학급별 분리 필요 |
| 저장 키 | 'seating' | 'teaching-classes' |

---

## 설계

### 원칙
1. **기존 담임 좌석배치는 그대로 유지** — 담임 선생님 기존 사용 경험 보존
2. **수업관리 탭에 좌석배치 추가** — 교과전담 워크플로우에 자연스럽게 녹임
3. **학급별 독립 좌석 데이터** — 각 수업반마다 별도 좌석배치 저장
4. **코드 최대한 재사용** — 기존 Seating 컴포넌트를 props로 범용화

### 데이터 구조 변경

```typescript
// TeachingClass 엔티티에 좌석 데이터 추가
export interface TeachingClass {
  readonly id: string;
  readonly name: string;
  readonly subject: string;
  readonly students: readonly TeachingClassStudent[];
  readonly seating?: TeachingClassSeating;  // ✨ NEW
  readonly createdAt: string;
  readonly updatedAt: string;
}

// 수업반 전용 좌석 데이터
export interface TeachingClassSeating {
  readonly rows: number;
  readonly cols: number;
  readonly seats: readonly (readonly (string | null)[])[];  // studentKey 저장
  readonly pairMode?: boolean;
}
```

**좌석 셀 값**: `TeachingClassStudent`의 `studentKey()` (예: "1-2-15" = 1학년 2반 15번)
→ 기존 Seating은 Student UUID를 쓰지만, 수업반 좌석은 복합키를 사용

### UI 구조

```
수업관리 페이지
├── 좌측: 학급 리스트 (기존)
└── 우측: 탭 콘텐츠
    ├── 📋 명렬표 (기존 ClassRosterTab)
    ├── 💺 좌석배치 (✨ NEW — ClassSeatingTab)
    └── 📈 진도관리 (기존 ProgressTab)
```

### ClassSeatingTab UX 흐름

```
[학급 선택] → [좌석배치 탭 클릭]
    │
    ├── 좌석 데이터 없음?
    │   └── 빈 상태 안내 + [자동 배치] 버튼
    │       "이 수업반의 좌석 배치를 시작해보세요!"
    │       [📋 명렬표 순서대로 배치] [🎲 랜덤 배치]
    │
    └── 좌석 데이터 있음?
        └── 좌석 배치도 표시
            ├── 학생 카드: 번호 + 이름 (반 정보 포함)
            ├── 드래그로 자리 교환
            ├── 🎲 랜덤 배치 버튼
            ├── ↩️ 실행 취소/다시 실행
            └── 💾 자동 저장
```

### 상세 UI 설계

#### 1. 좌석 카드 (SeatCard)
```
┌─────────────┐
│  1-2  15번  │  ← 반 정보 (1학년 2반) + 번호
│   홍길동    │  ← 이름
└─────────────┘
```
- 담임 좌석배치와 동일한 드래그&드롭
- 반 정보가 있으면 상단에 작게 표시 (예: "1-2")
- 반 정보가 없으면 번호만 표시

#### 2. 툴바
```
[교실 정면 ▲]

[편집 ✏️] [랜덤 배치 🎲] [그리드 조절 📐] [짝꿍 모드 👥] [되돌리기 ↩️] [다시 ↪️]
```
- 기존 Seating 컴포넌트의 툴바를 그대로 재사용
- 내보내기(엑셀/HWPX)도 지원 — "1학년 2반 음악 좌석배치표" 형식

#### 3. 빈 상태 (Empty State)
```
       💺
  좌석 배치를 시작해보세요!
  
  명렬표에 등록된 학생들의 자리를
  쉽게 배치할 수 있어요.

  [📋 명렬표 순서대로 배치]  [🎲 랜덤 배치]
```

#### 4. 명렬표 동기화 알림
명렬표에서 학생을 추가/삭제한 경우:
```
┌──────────────────────────────────────┐
│ ⚠️ 명렬표가 변경되었어요            │
│ 새로운 학생 2명이 추가되었습니다.    │
│                                      │
│ [빈 자리에 배치]  [나중에]           │
└──────────────────────────────────────┘
```

---

## 변경 파일 목록

### 엔티티/타입 (1파일)
| 파일 | 변경 |
|------|------|
| `src/domain/entities/TeachingClass.ts` | `TeachingClassSeating` 인터페이스 추가, `TeachingClass`에 `seating?` 필드 추가 |

### 스토어 (1파일)
| 파일 | 변경 |
|------|------|
| `src/adapters/stores/useTeachingClassStore.ts` | 좌석 관련 액션 추가: `updateSeating`, `randomizeSeating`, `swapSeats`, `clearSeating`, `resizeGrid`, `togglePairMode` |

### 컴포넌트 (3파일 신규 + 1파일 수정)
| 파일 | 변경 |
|------|------|
| `src/adapters/components/ClassManagement/ClassSeatingTab.tsx` | ✨ 신규 — 좌석배치 탭 메인 |
| `src/adapters/components/ClassManagement/ClassSeatCard.tsx` | ✨ 신규 — 수업반용 좌석 카드 (반 정보 표시) |
| `src/adapters/components/ClassManagement/ClassShuffleOverlay.tsx` | ✨ 신규 — 랜덤 배치 결과 오버레이 |
| `src/adapters/components/ClassManagement/ClassManagementPage.tsx` | 탭에 '좌석배치' 추가 |

### 도메인 로직 (1파일)
| 파일 | 변경 |
|------|------|
| `src/domain/rules/seatRules.ts` | 기존 함수를 TeachingClassStudent 호환으로 오버로드 또는 제네릭화 |

---

## 리스크 & 대안

| 리스크 | 대안 |
|--------|------|
| 기존 Seating 코드 변경 시 담임 기능 깨짐 | Seating 코드는 건드리지 않고, ClassSeatingTab에서 독립 구현 |
| 학생 수 많을 때 성능 | grid 크기 자동 계산 유지 (calcGridSize) |
| 명렬표 변경 시 좌석 데이터 불일치 | sanitizeSeating 로직 재사용 |
| 엑셀 내보내기 시 반 정보 표시 | "학년-반" 프리픽스 추가 |
