# Design v0.2 — 자리배치 3대 신규 기능

- **작성일**: 2026-05-20
- **버전**: v0.2 (design-validator 검증 결과 반영)
- **연관 Plan**: [seating-history.plan.md](../../01-plan/features/seating-history.plan.md)
- **검증 점수**: v0.1 68/100 → v0.2 (목표 90+/100)

---

## v0.1 → v0.2 변경 요약 (CRITICAL/MAJOR 반영)

| 항목                     | v0.1                                                         | v0.2                                                                                    |
| ------------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| **C-1** ID 생성          | `nanoid` (외부 의존성)                                       | `crypto.randomUUID()` 빌트인                                                            |
| **C-2** 시그니처         | `(seats, constraints, rng?, avoidHistory?)` (rows/cols 누락) | `(seats, constraints, rows, cols, random?, options?)` 유지, `options.avoidHistory` 추가 |
| **C-3** UseCase 책임     | "최근 N개" 정책이 스토어 책임                                | `RandomizeSeats` 생성자에 `ISeatingSnapshotRepository` 주입 — 도메인 정책               |
| **M-1** persist 충돌     | "기존 스키마와 충돌" 명시                                    | 사실관계 정정 — `useSeatingStore`는 persist 미사용, 별도 키만 추가                      |
| **M-2** 복원 시 좀비 ID  | 명세 없음                                                    | 복원 시 `sanitizeSeating` 통과 의무화                                                   |
| **M-3** unit test 계획   | 없음                                                         | 10건+ 케이스 명시                                                                       |
| **M-4** 메타테스트       | 없음                                                         | 보안 가드 정적 분석 추가                                                                |
| **M-5** 모바일           | 언급 없음                                                    | out of scope 명시                                                                       |
| **M-6** 5x5 도트 프리뷰  | 고정                                                         | `seating.rows × seating.cols` 비례                                                      |
| **M-7** PWA SW           | 별도 처리 명세                                               | 삭제 (자동 새로고침으로 충분)                                                           |
| **m-1** 강도 매핑        | UI 텍스트만                                                  | "OFF / 가능하면 / 반드시" ↔ `undefined / 'prefer' / 'strict'` 명시                      |
| **m-2** `source: 'auto'` | 시점 미정                                                    | `syncFromRoster`로 명렬표 변경 시 자동 저장                                             |
| **m-3** 프리셋 소멸 정책 | 둘 다 가능                                                   | "1회 사용 후 자동 소멸 + 토스트로 알림" 확정                                            |
| **m-4** 날짜 라이브러리  | 명세 누락                                                    | 빌트인 `Intl.DateTimeFormat('ko-KR')` 사용 명시                                         |
| **m-5** ARIA             | 없음                                                         | NameLearningMode ESC 종료/role="button"/라이브 리전                                     |
| **m-6** 성능             | 명세 없음                                                    | 50KB / 5MB 한도 1% 미만                                                                 |

---

## 1. 자리배치 히스토리 (Phase 1)

### 1-1. 엔티티: `SeatingSnapshot`

```typescript
// src/domain/entities/SeatingSnapshot.ts
import type { SeatingData } from './Seating';

/** 자리배치 스냅샷 — 셔플/수동 저장/자동 트리거 시 생성 */
export interface SeatingSnapshot {
  /** 고유 ID. crypto.randomUUID() 또는 `${Date.now()}-${counter}` */
  readonly id: string;
  /** Date.now() */
  readonly timestamp: number;
  /** 라벨 — 자동 생성 또는 사용자 입력 */
  readonly label: string;
  /** 생성 트리거 */
  readonly source: SnapshotSource;
  /** SeatingData 전체 사본 (rows/cols/seats/pairMode/oddColumnMode/layout/groups 포함) */
  readonly seating: SeatingData;
}

/**
 * - 'shuffle': randomize() 성공 시 자동
 * - 'manual': 사용자가 패널에서 "현재 배치 저장" 클릭
 * - 'auto': syncFromRoster로 명렬표 변경 자동 동기화 직전 백업
 */
export type SnapshotSource = 'shuffle' | 'manual' | 'auto';
```

**제약 (도메인 규칙)**

- 외부 import 0건 — 다른 도메인 엔티티만 의존
- `any` 금지, 모든 필드 `readonly`

---

### 1-2. 리포지토리

```typescript
// src/domain/repositories/ISeatingSnapshotRepository.ts
import type { SeatingSnapshot } from '../entities/SeatingSnapshot';

export interface ISeatingSnapshotRepository {
  /** 최신순(timestamp DESC) 정렬된 전체 목록 */
  getSnapshots(): Promise<readonly SeatingSnapshot[]>;
  /** 추가 저장 (50개 초과 시 가장 오래된 것 자동 삭제) */
  saveSnapshot(snapshot: SeatingSnapshot): Promise<void>;
  /** ID로 삭제 */
  deleteSnapshot(id: string): Promise<void>;
  /** 전체 비우기 (설정 → 데이터 초기화 시) */
  clearAll(): Promise<void>;
}
```

```typescript
// src/adapters/repositories/JsonSeatingSnapshotRepository.ts
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { ISeatingSnapshotRepository } from '@domain/repositories/ISeatingSnapshotRepository';
import type { SeatingSnapshot } from '@domain/entities/SeatingSnapshot';

const STORAGE_KEY = 'seating-snapshots';
const MAX_SNAPSHOTS = 50;

export class JsonSeatingSnapshotRepository implements ISeatingSnapshotRepository {
  constructor(private readonly storage: IStoragePort) {}

  async getSnapshots(): Promise<readonly SeatingSnapshot[]> {
    const data = await this.storage.read<SeatingSnapshot[]>(STORAGE_KEY);
    if (!data) return [];
    return [...data].sort((a, b) => b.timestamp - a.timestamp);
  }

  async saveSnapshot(snapshot: SeatingSnapshot): Promise<void> {
    const current = await this.getSnapshots();
    const next = [snapshot, ...current].slice(0, MAX_SNAPSHOTS);
    await this.storage.write(STORAGE_KEY, next);
  }

  async deleteSnapshot(id: string): Promise<void> {
    const current = await this.getSnapshots();
    const next = current.filter((s) => s.id !== id);
    await this.storage.write(STORAGE_KEY, [...next]);
  }

  async clearAll(): Promise<void> {
    await this.storage.write(STORAGE_KEY, []);
  }
}
```

**스토리지 키**: `'seating-snapshots'` (기존 `'seating'`와 분리)

---

### 1-3. DI 컨테이너 등록

```typescript
// src/adapters/di/container.ts (추가)
import { JsonSeatingSnapshotRepository } from '@adapters/repositories/JsonSeatingSnapshotRepository';

export const seatingSnapshotRepository: ISeatingSnapshotRepository =
  new JsonSeatingSnapshotRepository(storage);
```

기존 `seatingRepository` 바로 아래 위치.

---

### 1-4. 스토어 확장 (`useSeatingStore`)

**추가 state**

```typescript
interface SeatingState {
  // ... 기존 ...
  snapshots: readonly SeatingSnapshot[];
  snapshotsLoaded: boolean;

  // 추가 actions
  loadSnapshots: () => Promise<void>;
  saveCurrentAsSnapshot: (label?: string, source?: SnapshotSource) => Promise<void>;
  restoreSnapshot: (id: string) => Promise<void>;
  deleteSnapshot: (id: string) => Promise<void>;
}
```

**`saveCurrentAsSnapshot` 구현 — 자동 라벨 포맷**

```typescript
function buildAutoLabel(
  source: SnapshotSource,
  todaySnapshots: readonly SeatingSnapshot[],
): string {
  const date = new Date();
  const dateLabel = new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
  }).format(date); // "5. 20." (브라우저 로케일 표기)
  const cleaned = dateLabel.replace(/\.\s?/g, '/').replace(/\/$/, ''); // "5/20"

  const sourceLabel = source === 'shuffle' ? '셔플' : source === 'auto' ? '자동' : '저장';

  const todayCount = todaySnapshots.filter((s) => isSameDay(s.timestamp, date.getTime())).length;

  return `${cleaned} ${sourceLabel} #${todayCount + 1}`;
  // 예: "5/20 셔플 #3"
}
```

**복원 시 sanitize 의무화 (M-2)**

```typescript
restoreSnapshot: async (id: string) => {
  const snap = get().snapshots.find((s) => s.id === id);
  if (!snap) return;

  pushToHistory();

  // 학생 명단 기준으로 sanitize — 좀비 ID 제거 + 누락 학생 추가
  const students = useStudentStore.getState().students;
  const sanitized = sanitizeSeating(snap.seating, students);

  await seatingRepository.saveSeating(sanitized);
  set({ seating: sanitized });
},
```

**자동 트리거 (`randomize` 내부)**

```typescript
randomize: async () => {
  try {
    pushToHistory();
    const { seating: updated, result } = await randomizeUC.execute();
    set({ seating: updated });

    // 신규: 자동 스냅샷
    if (result.success) {
      await get().saveCurrentAsSnapshot(undefined, 'shuffle');
    }
    return result;
  } catch {
    return null;
  }
},
```

**`syncFromRoster` 직전 백업 (source='auto')**

```typescript
syncFromRoster: async (students) => {
  // ... 기존 ...
  const before = get().seating;
  const after = sanitizeSeating(before, students);
  if (before !== after) {
    // 명렬표 변경으로 좌석 변동 발생 → 백업
    await get().saveCurrentAsSnapshot(undefined, 'auto');
  }
  // ... 기존 저장 로직 ...
},
```

---

### 1-5. UI 컴포넌트

#### `SeatingHistoryPanel.tsx` (사이드 패널)

- 우측 슬라이드 패널 (기존 `Drawer` 컴포넌트 재사용 — Modal B~P 라운드 산출물)
- 헤더: "배치 기록" + 닫기 버튼
- 본문:
  - [현재 배치 저장] 버튼 (수동 저장)
  - 스냅샷 리스트 (최신순)
- 각 스냅샷 카드:
  - 라벨 + 시간 + 소스 아이콘 (🔀셔플 / 💾수동 / 🔄자동)
  - 미니 프리뷰 (`SnapshotPreviewGrid`)
  - [복원] [비교] [삭제] 버튼

#### `SnapshotPreviewGrid.tsx` (가변 미니 그리드 — M-6 반영)

```typescript
interface Props {
  seating: SeatingData;
  /** 픽셀 크기 (한 변) */
  size?: number; // 기본 80
}

// seating.rows × seating.cols 비례로 도트 그리드 렌더
// 학생 있는 셀: sp-primary 색 도트, 빈 셀: sp-border
// max-aspect-square + grid-cols-${cols} (또는 인라인 style)
```

#### `SnapshotDiffView.tsx` (비교 뷰)

- 좌: 현재 배치, 우: 스냅샷 배치
- 이동한 학생: 양쪽 모두 노란 외곽선(`ring-2 ring-sp-warning`)
- 동일 위치 학생: 회색(`opacity-40`)

#### `Seating.tsx` 툴바

```tsx
{
  isTeacherView && (
    <IconButton
      icon={<HistoryIcon />}
      label="배치 기록"
      onClick={() => setHistoryPanelOpen(true)}
    />
  );
}
```

---

### 1-6. 디자인 시스템 준수

| 요소               | 토큰                                                         |
| ------------------ | ------------------------------------------------------------ |
| 패널 배경          | `bg-sp-surface`                                              |
| 카드               | `bg-sp-card border border-sp-border rounded-xl shadow-sp-sm` |
| 본문 텍스트        | `text-sp-text`                                               |
| 보조 텍스트 (시간) | `text-sp-muted text-sm`                                      |
| 셔플 아이콘        | `text-sp-primary`                                            |
| 위험 액션 (삭제)   | `text-sp-danger hover:bg-sp-danger/10`                       |
| 다이프 하이라이트  | `ring-2 ring-sp-warning`                                     |
| 라운드             | `rounded-xl` (CLAUDE.md 라운드 정책)                         |

**금지**: 하드코딩 HEX 0건, `rounded-sp-*` 0건

---

### 1-7. unit test 계획 (M-3)

```typescript
// src/adapters/repositories/__tests__/JsonSeatingSnapshotRepository.test.ts
- saveSnapshot 후 getSnapshots 최신순 반환
- 50개 초과 시 가장 오래된 것 자동 삭제
- deleteSnapshot 후 해당 ID 미존재
- clearAll 후 빈 배열

// src/adapters/stores/__tests__/useSeatingStore.snapshot.test.ts
- randomize 성공 시 자동 스냅샷 생성 (source='shuffle')
- randomize 실패 시 스냅샷 생성 안 됨
- saveCurrentAsSnapshot (source='manual') 동작
- restoreSnapshot — 좌석이 정확히 복원됨
- restoreSnapshot — 졸업 학생 ID 자동 제거 (sanitize 통합)
- restoreSnapshot — 신규 학생 미배치 시 자동 추가
- syncFromRoster로 좌석 변동 발생 시 source='auto' 백업
- 자동 라벨 포맷 "5/20 셔플 #1" → "#2" 카운팅

// 메타테스트 (M-4)
// src/adapters/components/Seating/__tests__/SeatingHistoryPanel.security.test.ts
- isTeacherView=false 일 때 패널 진입 버튼 미렌더
- 정적 분석: SeatingHistoryPanel.tsx 가 useStudentView() 호출 여부 (대안)
```

---

## 2. "이전 자리 피하기" (Phase 2)

### 2-1. 시그니처 (C-2 반영)

```typescript
// src/domain/rules/seatRules.ts

export interface AvoidHistoryOption {
  /** 비교할 과거 스냅샷의 seats 배열 (보통 최근 3개) */
  previousSeats: readonly (readonly (readonly (string | null)[])[])[];
  /**
   * 'strict': 위반 시 해당 배치 reject (가장 약한 제약으로 fallback 가능)
   * 'prefer': 점수 페널티만 — best-effort 선택
   */
  strength: 'strict' | 'prefer';
}

// 기존 시그니처에 options.avoidHistory 추가
export function shuffleSeatsWithConstraints(
  seats: readonly (readonly (string | null)[])[],
  constraints: SeatConstraints,
  rows: number,
  cols: number,
  random: () => number = Math.random,
  options?: {
    pairMode?: boolean;
    oddColumnMode?: OddColumnMode;
    avoidHistory?: AvoidHistoryOption; // ← NEW
  },
): ShuffleResult;
```

호출처 (`RandomizeSeats.ts`) 1곳만 수정. 다른 호출처는 옵션을 안 주면 기존 동작 유지.

### 2-2. UI ↔ 코드 매핑 (m-1)

| UI 텍스트 (한국어)     | 코드 값                                 |
| ---------------------- | --------------------------------------- |
| "이전 자리 피하기 OFF" | `avoidHistory: undefined` (옵션 미전달) |
| "가능하면 피하기"      | `{ strength: 'prefer' }`                |
| "반드시 피하기"        | `{ strength: 'strict' }`                |

설정 위치: `SeatingHistoryPanel` 상단 라디오 그룹. 기본값: OFF.

### 2-3. UseCase 책임 (C-3)

```typescript
// src/usecases/seating/RandomizeSeats.ts
export class RandomizeSeats {
  constructor(
    private readonly seatingRepo: ISeatingRepository,
    private readonly constraintsRepo: ISeatConstraintsRepository,
    private readonly snapshotRepo: ISeatingSnapshotRepository, // ← NEW
    private readonly avoidConfig: () => Promise<AvoidHistoryOption | undefined>, // ← NEW (스토어가 주입)
  ) {}

  async execute(): Promise<{ seating: SeatingData; result: ShuffleResult }> {
    const current = await this.seatingRepo.getSeating();
    if (current === null) throw new Error('좌석 데이터가 없습니다.');

    const constraints = await this.constraintsRepo.getConstraints();
    const avoidOption = await this.avoidConfig();

    // 최근 N개 스냅샷의 seats만 추출 (도메인 정책: N=3)
    let avoidHistory: AvoidHistoryOption | undefined;
    if (avoidOption) {
      const recentSnaps = (await this.snapshotRepo.getSnapshots()).slice(0, 3);
      avoidHistory = {
        previousSeats: recentSnaps.map((s) => s.seating.seats),
        strength: avoidOption.strength,
      };
    }

    const result = shuffleSeatsWithConstraints(
      current.seats,
      constraints,
      current.rows,
      current.cols,
      Math.random,
      {
        pairMode: current.pairMode,
        oddColumnMode: current.oddColumnMode,
        avoidHistory,
      },
    );

    const updated: SeatingData = { ...current, seats: result.seats };
    await this.seatingRepo.saveSeating(updated);
    return { seating: updated, result };
  }
}
```

### 2-4. 알고리즘 (Fallback 통합)

기존 3단계 fallback에 1단계 추가:

1. **시도 0~200회**: 기존 제약 + `avoidHistory` 모두 만족
2. **strict 시 시도 200회 실패** → `avoidHistory` 해제 (가장 약한 제약)
3. **기존 분리 거리 완화 단계** (기존 동작 유지)

`prefer` 모드에서는 reject 안 함, 위반 수를 ShuffleResult.violations에 기록.

### 2-5. unit test (M-3)

```typescript
// src/domain/rules/__tests__/seatRules.avoidHistory.test.ts
- avoidHistory.previousSeats 빈 배열 → 기존 동작과 동일
- strict + 단일 이전 배치 → 학생 1명도 같은 좌표에 가지 않음
- strict + 200회 실패 시 fallback 작동 (success=true, relaxed 정보 노출)
- prefer + 이전 배치 → 위반 학생 수가 violations에 기록
- prefer 모드는 절대 reject 안 함 (success=true 보장)
- 3개 이전 배치 누적 제약 동작
- fixedSeats 학생은 avoidHistory 영향 받지 않음
- pairMode + avoidHistory 동작
- 모든 학생이 모든 이전 배치에 동일 좌표였던 극단 케이스
- 좌석 수가 학생 수와 정확히 일치할 때(빈자리 0) 동작
```

---

## 3. 이름 학습 모드 (Phase 3a)

### 3-1. 진입점

```tsx
// Seating.tsx 툴바
{
  isTeacherView && (
    <IconButton
      icon={<LearningIcon />}
      label="이름 학습"
      onClick={() => setNameLearningOpen(true)}
    />
  );
}
```

### 3-2. State (로컬, 스토어 불필요)

```typescript
interface NameLearningState {
  mode: 'free' | 'sequential' | 'quiz';
  revealed: Set<string>;
  current: string | null;
  answers: Map<string, boolean>;
  startTime: number;
  elapsed: number;
}
```

### 3-3. 접근성 (m-5)

| 요소             | ARIA / 키보드                                                                        |
| ---------------- | ------------------------------------------------------------------------------------ |
| 오버레이         | `role="dialog" aria-modal="true" aria-label="이름 학습 모드"`                        |
| LearningCard     | `role="button" tabIndex={0} aria-pressed={revealed} aria-label="좌석 ${r}행 ${c}열"` |
| 정답/오답 피드백 | `aria-live="polite"` 영역                                                            |
| ESC 키           | 종료                                                                                 |
| Tab/Shift+Tab    | 카드 순회                                                                            |
| Enter/Space      | 현재 카드 플립                                                                       |

### 3-4. 플립 애니메이션 (design-system.md sp-\* 토큰)

```css
.learning-card {
  perspective: 600px;
  transition: transform var(--sp-duration-medium) var(--sp-ease-out);
}
.learning-card.revealed {
  transform: rotateY(180deg);
}
@media (prefers-reduced-motion: reduce) {
  .learning-card {
    transition: none;
  }
}
```

`motion-reduce:` Tailwind 변형도 함께 사용.

---

## 4. 우연을 가장한 배치 (Phase 3b)

### 4-1. 리포지토리 확장

```typescript
// src/domain/repositories/ISeatingRepository.ts (수정)
export interface ISeatingRepository {
  getSeating(): Promise<SeatingData | null>;
  saveSeating(data: SeatingData): Promise<void>;
  // ↓ 신규
  getPreset(): Promise<SeatingData | null>;
  savePreset(data: SeatingData): Promise<void>;
  clearPreset(): Promise<void>;
}
```

```typescript
// src/adapters/repositories/JsonSeatingRepository.ts (확장)
async getPreset(): Promise<SeatingData | null> {
  return this.storage.read<SeatingData>('seating-preset');
}
async savePreset(data: SeatingData): Promise<void> {
  return this.storage.write('seating-preset', data);
}
async clearPreset(): Promise<void> {
  return this.storage.delete('seating-preset'); // IStoragePort 시그니처 확인 필요
}
```

> **TODO (구현 시 확인)**: `IStoragePort.delete` 시그니처 존재 여부. 없다면 `write(key, null)` 또는 `write(key, undefined)`로 대체.

### 4-2. 스토어 확장

```typescript
interface SeatingState {
  // ...
  presetArrangement: SeatingData | null;

  setPresetFromCurrent: () => Promise<void>;
  clearPreset: () => Promise<void>;
  randomizeWithPreset: () => Promise<ShuffleResult | null>;
  hasPreset: () => boolean;
}
```

### 4-3. `randomizeWithPreset()` 동작 (m-3)

```typescript
randomizeWithPreset: async () => {
  const { presetArrangement } = get();
  if (!presetArrangement) return null;

  pushToHistory();

  // 프리셋도 sanitize 거침 (졸업 학생 좀비 방지)
  const students = useStudentStore.getState().students;
  const sanitized = sanitizeSeating(presetArrangement, students);

  await seatingRepository.saveSeating(sanitized);
  await seatingRepository.clearPreset();
  set({ seating: sanitized, presetArrangement: null });

  // 자동 스냅샷 (source='shuffle' — 학생 인식과 동일)
  await get().saveCurrentAsSnapshot(undefined, 'shuffle');

  // 1회 사용 후 자동 소멸 + 토스트 알림
  toast.info('프리셋 배치가 적용되었습니다.');

  return { success: true, attempts: 1, relaxed: false, violations: [], seats: sanitized.seats };
},
```

### 4-4. UI 변경

| 위치             | 변경                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Seating.tsx 툴바 | 프리셋 활성 시 작은 🎯 인디케이터 (교사 뷰만)                                             |
| 셔플 버튼 클릭   | 내부적으로 `hasPreset() ? randomizeWithPreset() : randomize()` 분기                       |
| 설정 메뉴        | "🎯 프리셋 배치" 섹션 — [현재 배치를 프리셋으로 저장] / [프리셋 미리보기] / [프리셋 제거] |
| 학생/프로젝터 뷰 | 프리셋 관련 UI 완전 숨김 (`isTeacherView=false`)                                          |

### 4-5. 보안 메타테스트 (M-4)

```typescript
// src/adapters/components/Seating/__tests__/PresetSecurity.meta.test.ts
- Seating.tsx에서 🎯 아이콘 렌더 위치가 isTeacherView 조건 안에 있는지 정적 검증
- 설정 메뉴 "프리셋 배치" 섹션이 isTeacherView 조건 안에 있는지 정적 검증
- (대안) E2E: 학생 뷰 진입 시 🎯 인디케이터 미렌더 확인
```

---

## 5. 파일 변경 요약

| 변경 | 파일                                                         | Phase     |
| ---- | ------------------------------------------------------------ | --------- |
| 신규 | `src/domain/entities/SeatingSnapshot.ts`                     | 1         |
| 신규 | `src/domain/repositories/ISeatingSnapshotRepository.ts`      | 1         |
| 신규 | `src/adapters/repositories/JsonSeatingSnapshotRepository.ts` | 1         |
| 수정 | `src/adapters/di/container.ts`                               | 1         |
| 수정 | `src/adapters/stores/useSeatingStore.ts`                     | 1, 2, 3b  |
| 신규 | `src/adapters/components/Seating/SeatingHistoryPanel.tsx`    | 1         |
| 신규 | `src/adapters/components/Seating/SnapshotPreviewGrid.tsx`    | 1         |
| 신규 | `src/adapters/components/Seating/SnapshotDiffView.tsx`       | 1         |
| 수정 | `src/adapters/components/Seating/Seating.tsx`                | 1, 3a, 3b |
| 신규 | unit test 3건                                                | 1         |
| 수정 | `src/domain/rules/seatRules.ts`                              | 2         |
| 수정 | `src/usecases/seating/RandomizeSeats.ts`                     | 2         |
| 신규 | `src/domain/rules/__tests__/seatRules.avoidHistory.test.ts`  | 2         |
| 신규 | `src/adapters/components/Seating/NameLearningMode.tsx`       | 3a        |
| 신규 | `src/adapters/components/Seating/LearningCard.tsx`           | 3a        |
| 수정 | `src/domain/repositories/ISeatingRepository.ts`              | 3b        |
| 수정 | `src/adapters/repositories/JsonSeatingRepository.ts`         | 3b        |
| 신규 | 보안 메타테스트 1건                                          | 3b        |

---

## 6. 범위 외 (Out of Scope)

- **모바일**: `src/mobile/`에 자리배치 화면 없음 — 모바일은 이 PDCA에서 다루지 않음
- **PWA SW 캐시**: 기존 `controllerchange` 리스너로 자동 새로고침됨 — 별도 처리 불필요
- **외부 의존성 추가**: nanoid, date-fns 등 일절 도입 금지 (빌트인 사용)
- **persist 마이그레이션**: `useSeatingStore`는 persist 미사용. 신규 스토리지 키만 추가 (`seating-snapshots`, `seating-preset`)

---

## 7. 검증 게이트 (각 Phase 완료 조건)

```bash
npx tsc --noEmit              # 0 errors
npm run lint                  # 0 errors
npm run test                  # 신규 테스트 포함 전체 통과
npm run regression-check      # 통과
```

수동 검증 시나리오는 [seating-history.plan.md §4.4](../../01-plan/features/seating-history.plan.md)에 명시.

---

## 8. 변경 로그

- **v0.1** (2026-05-20): 최초 설계 (사용자 제공)
- **v0.2** (2026-05-20): design-validator 검증 결과 반영 — C-1/C-2/C-3 + M-1~M-7 + m-1~m-6 보강
