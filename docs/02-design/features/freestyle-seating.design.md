# Design v0.2.1 — 자유 배치 모드 (freestyle seating)

- **작성일**: 2026-05-20
- **버전**: v0.2.1 (사용자 제출 설계서 v0.1 → P0 5건 + P1 8건 반영, design-validator C/M/m 13건 추가 반영)
- **연관 Plan**: [freestyle-seating.plan.md](../../01-plan/features/freestyle-seating.plan.md)
- **UI 라벨**: 「자유 배치」 (한국어)
- **내부 코드명**: `freestyle`

---

## v0.1 → v0.2 변경 요약 (사용자 피드백 반영)

| #         | 항목                                   | v0.1 (사용자 제출)       | v0.2 (보강)                                                                              |
| --------- | -------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| **P0-1**  | PDF/엑셀/한글 출력 전략                | 0줄                      | **PDF만 정식 지원, 엑셀/한글은 안내 메시지** (§5 신설)                                   |
| **P0-2**  | 스냅샷 호환                            | 0줄                      | `saveCurrentAsSnapshot` 깊은 사본 + `sanitizeSeating` 분기 의무화 (§6)                   |
| **P0-3**  | 이름 충돌 (`freeform` 중복)            | `freeform` 사용          | **`freestyle`로 변경** (전 문서)                                                         |
| **P0-4**  | 자리뽑기 도구 동작                     | 0줄                      | **그리드 모드에서만 사용 가능 + 안내** (§7)                                              |
| **P0-5**  | 제약조건 마이그레이션                  | "유클리드 거리 변환" 1줄 | 4종 제약 변환 정책 + 변환 공식 명시 (§8)                                                 |
| **P1-6**  | 빈자리 보존 정책                       | 모호                     | `studentId: null` vs `desk 자체 없음` 명시 (§3.2)                                        |
| **P1-7**  | 모바일 PWA                             | 언급 없음                | **out of scope (Phase 1)** 명시 (§13)                                                    |
| **P1-8**  | 컨테이너 종횡비                        | "width × height"         | **4:3 고정 강제** (Phase 3 §3.4)                                                         |
| **P1-9**  | 회전 UX                                | 회전만 명시              | 이름 가독성 한계 + 90° 단위 제한 (§3.1)                                                  |
| **P1-10** | 모둠형 좌표 알고리즘 모순              | 2-3열 그리드             | "균일 외곽 박스" 규칙 명시 (Phase 2)                                                     |
| **P1-11** | 유클리드 거리 변환 공식 누락           | "유클리드로"             | 공식: `normDist = euclid / 1000`, `gridDist ≈ normDist × max(rows,cols)` (§8.3)          |
| **P1-12** | Tier 3 우선순위                        | Phase 6에 포함           | **Phase 1~5 출시 후 사용자 피드백 기반 재산정** (Plan §3)                                |
| **P1-13** | 테스트 부채                            | `seatRules.ts` 추가      | `freestyleRules.ts` 별도 파일로 분리                                                     |
| **V-C1**  | PDF group 모드 동작                    | 미언급                   | 본 PDCA 범위 외, §13에 "group 모드 PDF는 별도 PDCA" 명시                                 |
| **V-C2**  | Plan-Design 작업 항목 불일치           | 11 vs 12개               | Plan §4.1에 #12 + #13 추가 (테스트 메타·ClassSeatingTab 호출처 검증)                     |
| **V-C3**  | ToolSeatPicker teachingClass 경로 가드 | 미정의                   | §3.1에 명시: 가드는 `homeroom`에만 적용. teachingClass는 Phase 1 범위 외, 항상 grid 가정 |
| **V-M1**  | ClassSeatingTab 호출처 누락            | 미언급                   | §11 수동 검증에 ClassSeatingTab 경로 추가                                                |
| **V-M2**  | frontend-design 협업 의무              | 미언급                   | Plan §3 Phase 3에 추가 명시 (디자인 단독 금지 정책)                                      |
| **V-M3**  | useMobileSeatingStore 사실 오기재      | "다른 용도"              | §3.4 정정: "SeatingData 그대로 로드, UI 화면 없음. freestyleDesks pass-through 무해"     |
| **V-M4**  | disabledInFreestyle 모델 결정 보류     | Phase 5 확장만           | §13에 "Phase 1 결정 보류, Phase 5 별도 ADR" 명시                                         |
| **V-m4**  | grid↔freestyle 전환 시 데이터 보존     | 미정의                   | §14에 추가: 양쪽 데이터 동시 보존, 활성 layout만 토글                                    |
| **V-m5**  | 테스트 baseline 수치 불일치            | 1304 (구)                | "main HEAD 기준" + 측정 직전 갱신 명시                                                   |
| **V-m6**  | rotation vs circle 프리셋 충돌         | 90° 단위 강제            | §5 정정: 데이터 모델은 자유 각도, 텍스트만 정방향 (역회전)                               |
| **V-m7**  | 4:3 종횡비 모바일 호환                 | 미언급                   | §7-2 끝에 "정규화 좌표는 종횡비 독립, 마이그레이션 0건" 명시                             |
| **V-m8**  | ToolSeatPicker 가드 Hook 순서          | 위반 가능                | §3.1 가드 위치를 "모든 hook 호출 후"로 명시                                              |

---

## 1. 시스템 컨텍스트

### 1-1. 영향 받는 레이어

```
┌─ adapters/components/Seating/        (Phase 3+ — Freestyle 렌더링/에디터)
├─ adapters/components/Tools/           (Phase 1 — 자리뽑기 freestyle 가드)
├─ adapters/stores/useSeatingStore.ts   (Phase 1 — sanitize/snapshot 확장)
├─ adapters/repositories/Json...        (Phase 1 — 마이그레이션)
├─ usecases/seating/                    (Phase 5 — shuffle freestyle)
├─ domain/entities/Seating.ts           (Phase 1 — FreestyleDesk 추가)
├─ domain/rules/freestyleRules.ts       (Phase 1 — 신규 파일)
└─ infrastructure/export/pdf/...        (Phase 1 — 가드, Phase 3+ 정식)
```

### 1-2. Phase별 범위 (Plan §3 참조)

이 Design v0.2 는 **Phase 1 (데이터 모델 + 호환 인프라)** 만 정밀 설계. Phase 2~6 은 인터페이스 수준 윤곽만 정의.

---

## 2. Phase 1 — 데이터 모델 + 호환 인프라

### 2-1. 엔티티: `FreestyleDesk`

```typescript
// src/domain/entities/Seating.ts (확장)

import type { OddColumnMode } from '@domain/rules/seatingLayoutRules';

/** 자리 배치 레이아웃 타입 */
export type SeatingLayout = 'grid' | 'group' | 'freestyle'; // 'freestyle' 신규

/** 자유 배치의 책상 단위. CSS absolute positioning 으로 렌더된다. */
export interface FreestyleDesk {
  /** 고유 ID. crypto.randomUUID() 또는 `desk-${Date.now()}-${counter}` */
  readonly id: string;
  /** 정규화 X 좌표 0~1000 (컨테이너 폭에 비례) */
  readonly x: number;
  /** 정규화 Y 좌표 0~1000 (컨테이너 높이에 비례) */
  readonly y: number;
  /** 회전 각도 0~360°. 책상의 시각적 회전 (Phase 3+ 한계 있음 §3.1) */
  readonly rotation?: number;
  /**
   * 배정된 학생 ID.
   * - `string`: 학생 배정됨
   * - `null`: 책상은 있지만 비어 있음 (의도적 빈 자리)
   *
   * **모델 구분**:
   * - 책상 자체가 없음 → `freestyleDesks` 배열에서 제외
   * - 책상은 있고 학생만 없음 → `studentId: null`
   * (grid 모드의 `seats[r][c] = null` 과 동일한 의미)
   */
  readonly studentId: string | null;
  /** 모둠 소속 ID (clusters 프리셋에서 사용). 비어있으면 모둠 없음 */
  readonly groupId?: string;
}

/** 학급 자리 배치 데이터 */
export interface SeatingData {
  readonly rows: number;
  readonly cols: number;
  readonly seats: readonly (readonly (string | null)[])[];
  readonly pairMode?: boolean;
  readonly oddColumnMode?: OddColumnMode;
  readonly layout?: SeatingLayout;
  readonly groupGridSync?: boolean;
  readonly groups?: readonly SeatGroup[];

  // === 신규 === (모두 optional — 하위 호환)
  /** 자유 배치 책상 목록. `layout === 'freestyle'` 일 때만 사용. */
  readonly freestyleDesks?: readonly FreestyleDesk[];
  /** 자유 배치 생성 시 사용한 프리셋 타입 (UI 표시용). 사용자가 자유 편집 후에도 보존. */
  readonly freestylePreset?: FreestylePresetType;
}

export type FreestylePresetType =
  | 'rows' // Tier 1: 일제식
  | 'clusters' // Tier 1: 모둠형
  | 'ushape' // Tier 1: ㄷ자형
  | 'pairs' // Tier 2: 짝꿍
  | 'facing_rows' // Tier 2: 찬반토론
  | 'circle' // Tier 2: 원형
  | 'double_horseshoe' // Tier 3
  | 'hybrid_zones' // Tier 3
  | 'exam' // Tier 3
  | 'chevron'; // Tier 3
```

**도메인 규칙 준수**

- ✅ 외부 import 0건 (`OddColumnMode` 는 도메인 내부)
- ✅ `any` 금지, 모든 필드 `readonly`
- ✅ ID 생성은 빌트인 `crypto.randomUUID()` (nanoid 등 외부 라이브러리 금지)

### 2-2. 도메인 순수 함수: `freestyleRules.ts` (신규 파일)

기존 [`seatRules.ts`](../../../src/domain/rules/seatRules.ts) 가 이미 500+줄 누적이라 부풀림 방지를 위해 별도 파일로 격리.

```typescript
// src/domain/rules/freestyleRules.ts (신규)
import type { FreestyleDesk, SeatingData } from '@domain/entities/Seating';
import type { Student } from '@domain/entities/Student';
import { isStudentActive } from './studentActivity';

/**
 * 졸업·전학 학생이 freestyleDesks 에 좀비로 남는 것을 방지.
 * 활성 학생이 아닌 ID 는 studentId 를 null 로 만든다 (책상 자체는 보존).
 *
 * 책상 자체 삭제는 정책상 하지 않는다 — 교사가 의도적으로 배치한 책상을
 * 자동으로 사라지게 하면 사용자 신뢰가 깨진다.
 */
export function sanitizeFreestyleDesks(
  desks: readonly FreestyleDesk[],
  students: readonly Student[],
): readonly FreestyleDesk[] {
  const activeIds = new Set(students.filter(isStudentActive).map((s) => s.id));
  let changed = false;
  const sanitized = desks.map((desk) => {
    if (desk.studentId !== null && !activeIds.has(desk.studentId)) {
      changed = true;
      return { ...desk, studentId: null };
    }
    return desk;
  });
  return changed ? sanitized : desks;
}

/**
 * 두 책상 사이의 유클리드 거리 (정규화 좌표 기준).
 * 결과 범위: 0 ~ ~1414 (대각선 최대).
 */
export function euclideanDistance(a: FreestyleDesk, b: FreestyleDesk): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * 빈 FreestyleDesk 깊은 사본 생성 헬퍼 (스냅샷 저장 시 사용).
 *
 * ⚠️ V-m1 경고: FreestyleDesk 필드가 모두 primitive(string/number/null)일 때만 안전한
 * 1-level shallow spread. 중첩 객체 필드(예: metadata?: Record<string, unknown>) 추가 시
 * 깊은 사본 로직 보강 필수.
 */
export function cloneFreestyleDesks(
  desks: readonly FreestyleDesk[] | undefined,
): FreestyleDesk[] | undefined {
  return desks?.map((d) => ({ ...d }));
}
```

**파일 분리 이유**

- 기존 `seatRules.ts` (500+줄) 부풀림 방지
- freestyle 전용 로직을 한 곳에 모아 향후 Phase 2~5 확장 용이
- domain 레이어 외부 의존성 0건 유지

### 2-3. 스토어 확장: `useSeatingStore.ts`

#### 2-3-1. `sanitizeSeating` 확장 (freestyle 분기)

```typescript
// src/adapters/stores/useSeatingStore.ts (sanitizeSeating 확장)
import { sanitizeFreestyleDesks } from '@domain/rules/freestyleRules';

function sanitizeSeating(seating: SeatingData, students: readonly Student[]): SeatingData {
  // === 기존 grid/group 로직 (변경 없음) ===
  // ... seats 2D 배열 sanitize ...
  let result: SeatingData = /* 기존과 동일 */;

  // === 신규: freestyle 분기 ===
  if (result.freestyleDesks && result.freestyleDesks.length > 0) {
    const sanitizedDesks = sanitizeFreestyleDesks(result.freestyleDesks, students);
    if (sanitizedDesks !== result.freestyleDesks) {
      result = { ...result, freestyleDesks: sanitizedDesks };
    }
  }

  return result;
}
```

**불변 조건**

- grid/group 모드 SeatingData (freestyleDesks 가 undefined) → 기존 결과 100% 동일
- freestyleDesks 가 빈 배열 → 분기 스킵, 결과 동일

#### 2-3-2. `saveCurrentAsSnapshot` 깊은 사본 확장

```typescript
// src/adapters/stores/useSeatingStore.ts (saveCurrentAsSnapshot 확장)
import { cloneFreestyleDesks } from '@domain/rules/freestyleRules';

saveCurrentAsSnapshot: async (label, source = 'manual') => {
  const { seating, snapshots } = get();
  // ...
  const snapshot: SeatingSnapshot = {
    id: newSnapshotId(),
    timestamp: now,
    label: finalLabel,
    source,
    seating: {
      ...seating,
      seats: seating.seats.map((row) => [...row]),
      groups: seating.groups
        ? seating.groups.map((g) => ({ ...g, studentIds: [...g.studentIds] }))
        : undefined,
      // === 신규 ===
      freestyleDesks: cloneFreestyleDesks(seating.freestyleDesks),
    },
  };
  // ...
};
```

**P0-2 회귀 차단**: 스냅샷 저장 후 원본 `freestyleDesks[0].x = 999` 변경해도 스냅샷 안의 값은 불변.

### 2-4. 리포지토리: 마이그레이션 (`JsonSeatingRepository`)

스키마 변경이 **순수 추가**(`freestyleDesks?: optional`)라 별도 마이그레이션 코드 불필요. 다만 회귀 차단 메타 테스트 추가:

```typescript
// src/adapters/repositories/__tests__/JsonSeatingRepository.test.ts (추가)
test('기존 grid 데이터는 freestyleDesks 필드 없이 그대로 보존된다', async () => {
  const legacy: SeatingData = {
    rows: 4,
    cols: 5,
    seats: [[null, null, null, null, null] /*...*/],
  };
  await repo.saveSeating(legacy);
  const loaded = await repo.getSeating();
  expect(loaded).toEqual(legacy);
  expect(loaded?.freestyleDesks).toBeUndefined(); // ⛔ 자동 빈 배열 주입 금지
});
```

---

## 3. Phase 1 — 가드(Guard) 정책

### 3-1. 자리뽑기 도구 (`ToolSeatPicker.tsx`)

[`src/adapters/components/Tools/ToolSeatPicker.tsx`](../../../src/adapters/components/Tools/ToolSeatPicker.tsx) 진입 시 freestyle 모드 감지 → **읽기전용 안내 화면**으로 전환.

⚠️ **Hook 순서 보호 (V-m8)**: React Hook 규칙 위반을 피하기 위해 `useState`/`useEffect`/`useMemo`/스토어 hook 모두 호출 완료 후 첫 conditional return 자리에 가드를 둔다. ToolSeatPicker.tsx 의 line ~45-80 구간 hook 선언 직후가 안전한 위치.

⚠️ **적용 범위 (V-C3)**: 이 가드는 `seatDataSource === 'homeroom'` 경로에만 적용된다. **`teachingClass` 별 자리배치(`TeachingClassSeating` 엔티티)는 Phase 1 범위 외이며 항상 grid 모드를 가정한다.** Phase 5+ 에서 teachingClass 의 freestyle 지원 여부 별도 결정.

```tsx
// 모든 hooks 선언 완료 후 첫 conditional return 자리에 둔다
if (seatDataSource === 'homeroom' && seating.layout === 'freestyle') {
  return (
    <ToolLayout onBack={onBack}>
      <div className="rounded-xl bg-sp-card p-8 text-center">
        <p className="text-base text-sp-text mb-2">
          자리뽑기는 자유 배치 모드에서 사용할 수 없습니다.
        </p>
        <p className="text-sm text-sp-muted">
          자리배치 화면에서 「그리드 모드」로 전환한 뒤 다시 시도해 주세요.
        </p>
        {/* 자유 배치 → 그리드 빠른 전환 버튼은 Phase 4+ */}
      </div>
    </ToolLayout>
  );
}
// 이하 기존 그리드 자리뽑기 로직 (변경 없음)
```

**근거**: 메모리의 [feedback_seat_picker_private_no_student_exposure](#) 정책(자리뽑기 비공개 사전 배정 학생 공개 화면 노출 금지)은 freestyle 모드에서 책상 좌표 변경으로 인해 보장이 깨질 위험. 안전한 방향으로 1차는 비활성.

### 3-2. PDF 출력 (`SeatingPdf.ts`)

[`src/infrastructure/export/pdf/SeatingPdf.ts`](../../../src/infrastructure/export/pdf/SeatingPdf.ts) 진입 직후 가드:

```typescript
export async function exportSeatingToPdf(
  seating: SeatingData,
  // ...
): Promise<ArrayBuffer> {
  if (seating.layout === 'freestyle') {
    throw new Error(
      '자유 배치 모드의 PDF 출력은 다음 업데이트에서 지원될 예정입니다. ' +
        '현재는 그리드 또는 모둠 모드로 전환해 주세요.',
    );
  }
  // 이하 기존 grid/group PDF 생성 로직 (변경 없음)
}
```

UI 호출처(`Seating.tsx`)는 이 예외를 catch 해서 토스트로 안내. **Phase 3 이후 정식 지원** (정규화 좌표 → A4 가로 폭 매핑).

### 3-3. 엑셀/한글 출력 (`ExcelExporter.ts`, `HwpxExporter.ts`)

엑셀과 한글은 "표 형태"라 자유 좌표 표현이 본질적으로 어렵다. **PDF만 정식 지원** 결정에 따라 영구 미지원:

```typescript
// ExcelExporter.ts — seating 시트 생성 함수에 가드
function buildSeatingSheet(workbook: ExcelJS.Workbook, seating: SeatingData /*...*/) {
  if (seating.layout === 'freestyle') {
    // 시트는 만들되 안내 메시지만 채움
    const sheet = workbook.addWorksheet('자리배치');
    sheet.getCell('A1').value = '자유 배치 모드는 엑셀로 출력할 수 없습니다. PDF로 출력해 주세요.';
    return;
  }
  // 이하 기존 grid/group 로직 (변경 없음)
}

// HwpxExporter.ts 도 동일 패턴
```

**근거**: 엑셀/한글에서 자유 좌표를 표현하려면 (a) 가장 가까운 그리드 칸 근사 — 모양 깨짐, (b) 이미지 캡처 삽입 — 수정 불가능. 사용자 결정에 따라 **안내 메시지로 통일**.

### 3-4. 모바일 (`src/mobile/`)

[`src/mobile/stores/useMobileSeatingStore.ts`](../../../src/mobile/stores/useMobileSeatingStore.ts)는 `seatingRepository.getSeating()`을 호출하는 **SeatingData 전용 스토어**다. 현재 모바일에는 자리배치를 렌더링하는 UI 화면이 없어, 이 스토어는 데이터 로드만 수행하고 어디서도 사용되지 않는다.

**freestyle 영향**: `freestyleDesks` 필드는 모바일에서 단순 보존(pass-through)만 되어 안드로이드/iOS 동기화에 무해함. Phase 1 범위 외. Phase 3+ 에서 모바일 렌더링 검토 시 별도 PDCA.

---

## 4. 빈자리(null) 모델 명시 (P1-6 보강)

| 의도                                  | grid 모드                             | freestyle 모드                                                     |
| ------------------------------------- | ------------------------------------- | ------------------------------------------------------------------ |
| 책상 자체가 없음                      | (해당 없음 — 그리드는 항상 직사각형)  | `freestyleDesks` 배열에서 desk 객체 자체 제외                      |
| 책상은 있고 학생 없음 (의도적 빈자리) | `seats[r][c] = null`                  | `desk.studentId = null`                                            |
| 학생이 결번/전학 처리됨               | `sanitizeSeating` 이 자동 `null` 처리 | `sanitizeFreestyleDesks` 가 `studentId` 만 `null` 처리 (책상 보존) |

**셔플 정책 (Phase 5 예정)**: grid 모드의 `shuffleSeats` 는 "원본 null 좌표는 null 유지"로 빈자리 보존. freestyle 모드는 "원본 `studentId: null` 인 desk 는 셔플 후에도 null 유지" 동일 정책.

---

## 5. 회전(rotation) UX 한계 명시 (P1-9 보강, V-m6 정정)

원형 배치(`circle` 프리셋)에서 책상이 중심을 바라보게 회전하면 학생 이름이 **거꾸로/옆으로 보이는 문제**가 발생.

**Phase 1 결정 (정정 v0.2.1)**: 데이터 모델의 `rotation` 필드는 **자유 각도 허용**(0~360°, Phase 2 `circle` 프리셋이 360/N 각도를 그대로 저장). Phase 3 렌더링에서:

- **책상 외곽선·테두리·아바타**는 `rotation` 값 그대로 회전
- **학생 이름 텍스트는 항상 정방향**: SeatCard 내부에서 텍스트 wrapper 에 `rotate(-rotation)` 역회전 적용

근거: 한국어 텍스트 가독성 + 사용자(교사)가 출력물에서 학생 이름을 식별해야 함. v0.2의 "90° 단위 강제"는 circle 프리셋(8명=45°, 12명=30°)과 충돌하여 폐기.

---

## 6. 회귀 방지 — 메타 테스트 6종 (P0-2 핵심)

```typescript
// src/adapters/stores/__tests__/useSeatingStore.snapshot.test.ts (추가)

test('스냅샷 저장 후 원본 freestyleDesks 변경이 스냅샷에 영향 없음', async () => {
  // P0-2 회귀 차단: 깊은 사본 보장
  const store = createTestStore();
  store.setSeating({
    /*...*/,
    layout: 'freestyle',
    freestyleDesks: [{ id: 'd1', x: 100, y: 200, studentId: 's1' }],
  });
  await store.saveCurrentAsSnapshot('테스트');
  const snapshot = store.snapshots[0]!;

  // 원본 변경
  (store.seating.freestyleDesks![0] as any).x = 999;

  // 스냅샷은 불변
  expect(snapshot.seating.freestyleDesks![0].x).toBe(100);
});
```

```typescript
// src/domain/rules/freestyleRules.test.ts (신규)

test('sanitizeFreestyleDesks: 졸업 학생 ID는 null로, 책상은 보존', () => {
  const desks: FreestyleDesk[] = [
    { id: 'd1', x: 100, y: 200, studentId: 'active' },
    { id: 'd2', x: 300, y: 400, studentId: 'graduated' },
  ];
  const students = [{ id: 'active', /*...*/, status: 'active' }];
  const result = sanitizeFreestyleDesks(desks, students);

  expect(result[0].studentId).toBe('active');
  expect(result[1].studentId).toBeNull(); // 졸업 학생 → null
  expect(result.length).toBe(2);          // 책상은 보존
});

test('sanitizeFreestyleDesks: 변경 없으면 원본 참조 그대로 반환 (React memo 최적화)', () => {
  const desks: FreestyleDesk[] = [{ id: 'd1', x: 100, y: 200, studentId: 'active' }];
  const students = [{ id: 'active', /*...*/, status: 'active' }];
  const result = sanitizeFreestyleDesks(desks, students);
  expect(result).toBe(desks); // 참조 동일 (재렌더 최소화)
});
```

```typescript
// src/adapters/stores/__tests__/useSeatingStore.freestyle.test.ts (신규)

test('grid 모드 SeatingData 로드→저장→로드 시 freestyleDesks 자동 주입 없음', async () => {
  const legacy: SeatingData = {
    rows: 4, cols: 5,
    seats: Array.from({length:4}, () => Array.from({length:5}, () => null)),
  };
  await store.load();
  // ...
  const reloaded = await repo.getSeating();
  expect(reloaded).toEqual(legacy);
  expect(reloaded?.freestyleDesks).toBeUndefined();
});

test('자리뽑기 도구는 freestyle 모드에서 안내 메시지를 표시한다', () => {
  // ToolSeatPicker 컴포넌트 렌더 + freestyle seating → 안내 텍스트 노출
  const { getByText } = render(<ToolSeatPicker /* ... */ />);
  expect(getByText('자리뽑기는 자유 배치 모드에서 사용할 수 없습니다.')).toBeInTheDocument();
});

test('PDF 출력은 freestyle 모드에서 안내 에러를 throw 한다', async () => {
  const freestyle: SeatingData = { /*...*/, layout: 'freestyle', freestyleDesks: [] };
  await expect(exportSeatingToPdf(freestyle, /*...*/)).rejects.toThrow(/자유 배치 모드의 PDF 출력은/);
});

test('엑셀 출력은 freestyle 모드에서 안내 메시지 시트만 생성한다', async () => {
  // ExcelExporter — A1 셀에 안내 메시지가 들어있는지 확인
});
```

---

## 7. Phase 2~6 인터페이스 윤곽 (참고용)

### 7-1. Phase 2 — 프리셋 좌표 생성

```typescript
// src/domain/rules/freestyleRules.ts (Phase 2 에서 추가)

export interface FreestylePresetParams {
  type: FreestylePresetType;
  studentCount: number; // 8 ~ 40 명
  columns?: number; // rows 프리셋: 4~7
  groupSize?: number; // clusters 프리셋: 3/4/5/6 기본값
  groupSizes?: number[]; // clusters 프리셋: 모둠별 인원 직접 지정
  teacherPosition?: 'top' | 'bottom';
}

export function generateFreestyleDesks(params: FreestylePresetParams): FreestyleDesk[];
```

**Tier 1 알고리즘 보강 (P1-10)**:

- `clusters` 프리셋: 모둠을 "균일 외곽 박스" 단위로 배치 → 모둠 인원이 가변(3/4/5/6)이어도 모둠 카드 외곽선은 동일 크기 보장 → 정렬 깨짐 방지
- `circle` 프리셋: 반지름 동적 계산 — `radius = 200 + min(200, studentCount × 8)` → 8명일 때 너무 넓지 않고, 40명일 때 너무 좁지 않음

### 7-2. Phase 3 — 렌더링 (`FreestyleSeatingView`)

```typescript
// 컨테이너 종횡비 4:3 강제 (P1-8)
<div className="rounded-xl bg-sp-card" style={{ aspectRatio: '4 / 3' }}>
  <div ref={containerRef} className="relative w-full h-full">
    {desks.map((desk) => (
      <SeatCard
        key={desk.id}
        style={{
          position: 'absolute',
          left: `${(desk.x / 1000) * containerWidth}px`,
          top:  `${(desk.y / 1000) * containerHeight}px`,
          transform: `rotate(${desk.rotation ?? 0}deg)`, // 자유 각도 그대로
          // 이름 텍스트는 SeatCard 내부에서 rotate(-rotation) 역회전으로 정방향 유지 (§5)
        }}
        // ... 기존 SeatCard props
      />
    ))}
    {/* 교탁 표시 */}
  </div>
</div>
```

> ℹ️ **종횡비 독립성 (V-m7)**: 정규화 좌표(0~1000)는 컨테이너 종횡비와 무관하므로 모바일 9:16 또는 다른 비율 컨테이너에서도 **데이터 마이그레이션 0건**. 종횡비 차이는 렌더링 시점의 `left/top` 픽셀 계산에서만 흡수된다.

### 7-3. Phase 5 — 셔플 + 제약조건 마이그레이션 (§8 참조)

---

## 8. 제약조건 마이그레이션 (Phase 5 — P0-5 핵심)

### 8-1. 4종 제약 변환 매트릭스

| 기존 제약 (grid)                                | freestyle 변환 정책                                                                                                                                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FixedSeatConstraint { row, col }`              | grid → freestyle 전환 시 해당 `(row, col)` 위치의 desk를 찾아 **`fixedDeskId`로 변환**. 변환 결과를 사용자에게 토스트로 안내 ("출석부 1번 학생이 1행 1열 책상에 고정되어 있었습니다 → 책상 ID `desk-abc123`에 자동 매핑") |
| `ZoneConstraint { zone }`                       | **정규화 좌표 박스로 변환**: `front1` → `{y < 250}`, `front2` → `{y < 500}`, `back1` → `{y > 750}`, `left1` → `{x < 250}`, `right1` → `{x > 750}`, `center` → `{250 < x < 750 && 250 < y < 750}`                          |
| `SeparationConstraint { minDistance }` (맨해튼) | **유클리드 거리 변환 공식**: `normEuclid = minDistance × (1000 / max(rows, cols))`. 예: 5x4 그리드에서 `minDistance=2` → `normEuclid = 2 × (1000/5) = 400` (정규화 좌표 400 단위 이상 떨어져야 함)                        |
| `AdjacencyConstraint { maxDistance }` (맨해튼)  | 동일 공식으로 `normEuclid = maxDistance × (1000 / max(rows, cols))`                                                                                                                                                       |

### 8-2. 변환 불가능한 제약 — 비활성 보존

freestyle 모드에서 변환할 수 없거나 의미 모호한 제약은 **삭제하지 않고 비활성 보존**. grid 모드로 되돌리면 자동 복원.

```typescript
// src/domain/entities/SeatConstraints.ts (Phase 5 확장)
export interface SeatConstraints {
  readonly zones: readonly ZoneConstraint[];
  readonly separations: readonly SeparationConstraint[];
  readonly adjacencies: readonly AdjacencyConstraint[];
  readonly fixedSeats: readonly FixedSeatConstraint[];
  // === Phase 5 신규 ===
  /** freestyle 모드 전용 — desk ID 기반 고정 */
  readonly freestyleFixed?: readonly { studentId: string; deskId: string; reason: string }[];
  /** freestyle 모드에서 비활성 보존된 grid 제약 (grid 복귀 시 재활성) */
  readonly disabledInFreestyle?: {
    fixedSeats?: readonly FixedSeatConstraint[];
    zones?: readonly ZoneConstraint[];
  };
}
```

### 8-3. 셔플 통합

Phase 5 에서 `shuffleFreestyleSeats` 신규 함수 도입. 기존 `shuffleSeatsWithConstraints` 와 시그니처를 통일하여 호출처(`RandomizeSeats` UseCase) 변경 최소화.

---

## 9. Path Alias 및 의존성 (Clean Architecture 준수)

| 신규 파일                                             | 의존 가능                                                                               |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `domain/entities/Seating.ts` (확장)                   | `domain/rules/seatingLayoutRules` 만                                                    |
| `domain/rules/freestyleRules.ts` (신규)               | `domain/entities/Seating`, `domain/entities/Student`, `domain/rules/studentActivity` 만 |
| `adapters/stores/useSeatingStore.ts` (확장)           | 기존 + `@domain/rules/freestyleRules`                                                   |
| `adapters/components/Tools/ToolSeatPicker.tsx` (확장) | 기존 + `seating.layout === 'freestyle'` 분기                                            |
| `infrastructure/export/pdf/SeatingPdf.ts` (가드)      | 기존                                                                                    |
| `infrastructure/export/ExcelExporter.ts` (가드)       | 기존                                                                                    |
| `infrastructure/export/HwpxExporter.ts` (가드)        | 기존                                                                                    |

❌ **금지**: `domain/rules/freestyleRules.ts` 가 외부 라이브러리(nanoid 등) import (도메인 레이어 원칙)

---

## 10. 변경 파일 목록 (Phase 1)

| #   | 파일                                                                | 종류      | 변경 규모                                                                               |
| --- | ------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------- |
| 1   | `src/domain/entities/Seating.ts`                                    | 확장      | 3 필드 + 1 type 추가                                                                    |
| 2   | `src/domain/rules/freestyleRules.ts`                                | 🆕 신규   | ~60줄                                                                                   |
| 3   | `src/adapters/stores/useSeatingStore.ts`                            | 확장      | 2 함수 확장 (sanitize, snapshot)                                                        |
| 4   | `src/adapters/repositories/JsonSeatingRepository.ts`                | 변경 없음 | (optional 필드라 자동 보존)                                                             |
| 5   | `src/adapters/components/Tools/ToolSeatPicker.tsx`                  | 확장      | 가드 1개 추가 (~15줄)                                                                   |
| 6   | `src/infrastructure/export/pdf/SeatingPdf.ts`                       | 확장      | 가드 1개 (3줄)                                                                          |
| 7   | `src/infrastructure/export/ExcelExporter.ts`                        | 확장      | 가드 1개 (~5줄)                                                                         |
| 8   | `src/infrastructure/export/HwpxExporter.ts`                         | 확장      | 가드 1개 (~5줄)                                                                         |
| 9   | `src/domain/rules/freestyleRules.test.ts`                           | 🆕 신규   | ~80줄, 6 테스트                                                                         |
| 10  | `src/adapters/stores/__tests__/useSeatingStore.snapshot.test.ts`    | 추가      | 1 테스트                                                                                |
| 11  | `src/adapters/stores/__tests__/useSeatingStore.freestyle.test.ts`   | 🆕 신규   | ~100줄, 5 테스트                                                                        |
| 12  | `src/adapters/repositories/__tests__/JsonSeatingRepository.test.ts` | 추가      | 1 테스트 (마이그레이션 회귀)                                                            |
| 13  | `src/adapters/components/ClassManagement/ClassSeatingTab.tsx`       | 변경 없음 | export 가드는 함수 내부에 위치(작업 #7~#8)라 호출처 변경 0. 수동 검증 시나리오에 포함만 |

**총 신규 코드**: ~250줄 (테스트 포함 ~430줄). 기존 도메인 로직 0 변경.

---

## 11. 검증 게이트

```bash
# 1단계: 구문 검증
npx tsc --noEmit              # 0 errors

# 2단계: 코드 품질
npm run lint                  # 0 errors (--fix 후)

# 3단계: 테스트
npm run test                  # baseline (main HEAD 기준 측정 직전 갱신) + 신규 ~13 통과

# 4단계: 회귀 방지
npm run regression-check      # 9/9 통과
```

> ℹ️ **baseline 수치 (V-m5)**: 메모리상 v2.0.6 baseline 은 1352 이나, Phase 1 시작 시점 main HEAD 의 `npm run test` 결과를 측정 직전에 다시 확인하여 baseline 으로 사용한다. Plan §4.4 와 본 §11 의 신규 테스트 개수는 ~13건으로 통일.

**수동 검증 시나리오** (Plan §4.4 와 일치)

1. ✅ 기존 grid 모드 사용자 — 앱 켰을 때 저장 파일 byte 변화 0
2. ✅ freestyle 필드 추가 후 그리드 복귀 — 데이터 손실 0 (양쪽 데이터 동시 보존 §14)
3. ✅ 자리뽑기 도구 — freestyle 모드(`homeroom` 경로)면 안내 메시지 + 비활성
4. ✅ PDF 출력 — freestyle 모드면 토스트로 "Phase 3에서 지원 예정" 안내
5. ✅ 엑셀/한글 출력 — freestyle 모드면 "PDF로 출력해 주세요" 안내 + 작업 스킵
6. ✅ **ClassSeatingTab 경로 (V-M1)** — 수업명단 자리배치 탭에서도 freestyle 모드면 #4~#5 와 동일한 안내가 표시되는지 확인

---

## 12. 위험 요소 및 대응 (Phase 1 한정)

| 위험                                          | 대응                                                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 기존 grid/group 모드 깨짐 (P0)                | 메타 테스트 6종 + `npm run regression-check` 9/9 통과                                                            |
| 스냅샷 깊은 사본 누락 (P0-2)                  | `cloneFreestyleDesks` 함수 분리 + 단위 테스트로 강제                                                             |
| 자리뽑기 도구 freestyle 진입 시 크래시 (P0-4) | 진입 직후 가드, fallback UI 명시                                                                                 |
| 다른 세션 충돌 (NEIS 등)                      | 작업 시작 시 `git status --short` 확인. freestyle 작업 범위는 자리배치 영역에 집중되어 NEIS Schedule 등과 비접점 |
| 모바일 freestyle 진입 시 UI 깨짐              | `src/mobile/` 에 자리배치 화면 없음 — out of scope                                                               |

---

## 13. Out of Scope (Phase 1)

- 🚫 UI 렌더링 (`FreestyleSeatingView.tsx`) — Phase 3
- 🚫 프리셋 좌표 생성 알고리즘 — Phase 2
- 🚫 드래그 인터랙션 — Phase 4
- 🚫 셔플 + 제약조건 마이그레이션 — Phase 5
- 🚫 PDF freestyle 정식 출력 — Phase 3
- 🚫 PDF **group 모드** 거동 수정 (V-C1) — 별도 PDCA. 현재 `SeatingPdf.ts`는 grid/pair 기반이라 group 모드에서 row-major 흘림 버그가 있으나 본 PDCA 범위 외
- 🚫 `teachingClass` 경로 freestyle 지원 (V-C3) — Phase 5+ 별도 결정
- 🚫 모바일 freestyle 지원 — 별도 PDCA
- 🚫 자유 배치 ↔ 그리드 빠른 전환 버튼 — Phase 4
- 🚫 `SeatConstraints.disabledInFreestyle?` 필드 도입 (V-M4) — Phase 5 별도 ADR. Phase 1에서는 freestyle 진입 시 기존 grid 제약조건이 그대로 보존되며 실행만 되지 않는 상태로 둔다
- 🚫 Tier 2/3 프리셋 (짝꿍/찬반/원형/V자/이중ㄷ자 등) — Phase 6 (사용자 피드백 기반 재산정)

---

## 14. 의사결정 기록

| 결정                                          | 채택                                                                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 내부 코드 이름                                | `freestyle` (담벼락 `freeform` 충돌 회피)                                                                                    |
| 출력 전략                                     | PDF만 정식 지원 (Phase 3+) / 엑셀·한글은 영구 미지원 + 안내                                                                  |
| 자리뽑기 도구                                 | 그리드 모드에서만 사용 가능 (안내 메시지 + 비활성)                                                                           |
| 회전 텍스트 (V-m6 정정)                       | 데이터는 자유 각도(0~360°), 텍스트만 SeatCard 내부에서 역회전으로 정방향                                                     |
| 컨테이너 종횡비                               | 4:3 고정 (모바일 세로/데스크톱 가로 차이 흡수). 정규화 좌표는 종횡비 독립                                                    |
| 제약 마이그레이션                             | grid↔freestyle 양방향 자동 변환 + 변환 불가 제약은 비활성 보존 (Phase 5)                                                     |
| **grid↔freestyle 전환 시 데이터 보존 (V-m4)** | **양쪽 데이터(`seats` + `freestyleDesks`) 동시 보존, 활성 layout 만 토글**. 시험 대형 → 일제식 → 재시험 대형 워크플로우 지원 |
| Tier 3 우선순위                               | Phase 1~5 출시 후 사용자 피드백 기반 재산정                                                                                  |
| PDF group 모드 거동 (V-C1)                    | 본 PDCA 범위 외, 별도 PDCA                                                                                                   |
| teachingClass freestyle 지원 (V-C3)           | Phase 5+ 별도 결정                                                                                                           |

---

## 15. 참고 문서

- [Plan](../../01-plan/features/freestyle-seating.plan.md)
- 사용자 제출 설계서 (대화 기록)
- 도메인 규칙: `docs/architecture-rules.md`, `docs/coding-conventions.md`, `docs/design-system.md`
- 관련 코드:
  - [`src/domain/entities/Seating.ts:1-48`](../../../src/domain/entities/Seating.ts)
  - [`src/domain/entities/SeatConstraints.ts:1-55`](../../../src/domain/entities/SeatConstraints.ts)
  - [`src/domain/entities/SeatingSnapshot.ts:1-29`](../../../src/domain/entities/SeatingSnapshot.ts)
  - [`src/domain/rules/seatRules.ts:326-633`](../../../src/domain/rules/seatRules.ts)
  - [`src/adapters/stores/useSeatingStore.ts:56-106`](../../../src/adapters/stores/useSeatingStore.ts)
  - [`src/adapters/repositories/JsonSeatingRepository.ts:1-32`](../../../src/adapters/repositories/JsonSeatingRepository.ts)
  - [`src/infrastructure/export/pdf/SeatingPdf.ts:1-50`](../../../src/infrastructure/export/pdf/SeatingPdf.ts)
  - [`src/adapters/components/Tools/ToolSeatPicker.tsx:1-60`](../../../src/adapters/components/Tools/ToolSeatPicker.tsx)
  - [`electron/ipc/realtimeWall.ts:268-294`](../../../electron/ipc/realtimeWall.ts) (이름 충돌 회피 대상)
