# PIN Capabilities — 쌤핀 학생 PII 게이트 정책

**상태**: APPROVED (ADR student-pii-adr-v1.2 Decision 2 + Decision 8 + Decision 9)
**도입 버전**: v1.11.x
**관련 ADR**: `docs/architecture/student-pii-adr-v1.2.md`

---

## 정책 요약

쌤핀은 **단일 PIN** (`classManagement`)을 재사용한다. PIN unlock은 학생 PII에 대한 **capability 집합**을 부여한다. 신규 글로벌 unlock 키를 추가하지 않는다 (Principle 2 — Reuse capability surface).

```
┌──────────────────────────────────────────────────────────┐
│  classManagement PIN (단일)                              │
│  ──────────────────────────────────────────────────────  │
│  Unlock → PinSession {                                   │
│    capabilities: PinCapability[]                         │
│      ├─ ViewStudentPii                                   │
│      ├─ EditStudentPii                                   │
│      ├─ ImportStudentPii                                 │
│      └─ ExportStudentPii                                 │
│    expiresAt: timestamp (5분 PII 독립 idle re-lock)      │
│  }                                                       │
└──────────────────────────────────────────────────────────┘
```

---

## PinCapability enum

```typescript
// src/domain/valueObjects/PinCapability.ts (P1에서 생성)
export type PinCapability =
  | 'ViewStudentPii'       // PII 마스크 해제 (성별·학업성취도 표시)
  | 'EditStudentPii'       // PII 편집 (성별·학업성취도 입력·수정)
  | 'ImportStudentPii'     // .ssampin import 시 PII 페이로드 수용
  | 'ExportStudentPii';    // Excel/HWPX export 시 PII 컬럼 포함
```

## 게이트 사용 위치

| Capability | 차단 표면 | 차단 미달 시 동작 |
|---|---|---|
| `ViewStudentPii` | `RosterManagementTab` PII 섹션 표시; `ToolGrouping` gender/level 자동 채움 | PII 필드 마스킹, "PIN 해제 필요" 배지 |
| `EditStudentPii` | `RosterManagementTab` PII 입력 컨트롤 | 비활성화 + 잠금 아이콘 |
| `ImportStudentPii` | `.ssampin` importer | PII 필드 strip + 토스트 알림 |
| `ExportStudentPii` | Excel/HWPX exporter `includePii` 옵션 | 옵션 자체가 disabled |

## 게이트 미사용 위치 (구조적 차단)

- **위젯 윈도우**: `window.location.hash === '#/widget'` 감지 시 PII reveal/edit 컴포넌트 미마운트, merge 함수가 PII-free Student 반환. **단 이 검사는 DX 신호이지 경계가 아니다 — Brand<NoPii> + IPC allowlist가 실제 경계** (ADR Addendum 1).
- **클라우드 sync (supabase/google)**: DTO가 `Brand<'NoPii'>`로 구조적으로 PII 부재. `createNoPiiDto` 팩토리가 유일한 합법 mint 경로.
- **로그/에러 메시지**: ESLint `no-pii-in-logs` 룰이 컴파일 타임 차단.

## Idle Re-lock

PII overlay에는 글로벌 PIN 세션과 **독립**된 5분 idle re-lock 타이머가 있다. 전역 `classManagement` 세션이 살아있어도 PII는 다시 잠긴다. 구현: `PinUnlockOverlay` 컴포넌트 (P2).

**근거**: 교사가 자리를 비운 사이 옆자리 동료/학생이 PII 화면 목격하는 시나리오 차단 (Pre-mortem #1).

## 미해결 결정

### 6개월 collapse 검토 트리거

**조건**: v1.11 production 출시 후 6개월 동안 `{View, Edit, Import, Export}` 중 어느 두 capability가 **실제로 다른 정책**을 받지 않으면 `{Read, Write}`로 축소.

- `Read = View`
- `Write = Edit ∪ Import ∪ Export`

**축소 시점**: v1.12 이후 별도 마이그레이션 PR (capability enum 변경 + 게이트 호출처 일괄 교체).

### 멀티 윈도우 PIN 세션 broker (Open Question)

현재: 단일 윈도우 전용 PII (Decision 9). 미래 교사 워크플로우가 위젯 PII 필요 시 main-process PIN 세션 broker(`ipcMain`/`ipcRenderer`) 도입. 본 ADR 범위 밖.

---

## 구현 체크리스트

- [ ] `src/domain/valueObjects/PinCapability.ts` — enum 정의 (P1)
- [ ] `src/domain/ports/IPinGate.ts` — unlock/currentSession/requireCapability 메서드 (P1)
- [ ] `src/usecases/pii/RequirePiiCapability.ts` — gate usecase (P2)
- [ ] `src/adapters/pin/ClassManagementPinGate.ts` — IPinGate 구현 (P2)
- [ ] `src/adapters/components/Common/PinUnlockOverlay.tsx` — 5분 idle re-lock UI (P2)
- [ ] `PinSettings.protectedFeatures.classManagement` 토글이 PII 게이트로 동작 — **신규 `studentPii` 키 추가 X** (Decision 2)

## 게이트 호출 패턴

```typescript
// 사용 예 (P5 RosterManagementTab)
const session = pinGate.currentSession();
const canView = session && session.capabilities.includes('ViewStudentPii');

return (
  <PinGuard
    featureKey="classManagement"
    requiredCapability="ViewStudentPii"
    fallback={<PiiMaskedNotice />}
  >
    <StudentPiiSection studentId={s.id} />
  </PinGuard>
);
```
