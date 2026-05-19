# consultation-edit-and-sync 설계서

> **Summary**: [Plan](../../01-plan/features/consultation-edit-and-sync.plan.md)의 3 Phase를 구현 단위로 분해. (1) Domain: 신규 타입 `ScheduleUpdatePatch` / `ImpactReport` / `BookingToken` 정의. (2) UseCase: `useConsultationStore`에 `updateSchedule` / `rescheduleBooking` / `cancelBooking` / `recomputeSlotAvailability` 4개 메서드 추가. (3) Infrastructure: Supabase에 `updateSchedule` / `rescheduleBooking` RPC + `cancelBooking` 재사용 + 신규 token 컬럼. (4) UI(Phase 1): ConsultationDetail 예약 카드 액션에 "변경/취소" 버튼, ConsultationTab 카드에 "수정" 버튼, `ConsultationEditModal` · `RescheduleBookingModal` · `CancelBookingConfirmDialog` 신설. (5) Phase 2: 일정표 mutation 감지 → debounce 1s 후 활성 일정 전체 `recomputeSlotAvailability` 호출. (6) Phase 3: landing/booking에 본인 예약 token + `/booking/[id]/mine` 라우트. 모든 단계에 메타테스트 정의.
>
> **Project**: 쌤핀 (SsamPin)
> **Version**: v2.0.6 후보 (Phase 1) · v2.1.0 후보 (Phase 2+3)
> **Author**: pblsketch
> **Date**: 2026-05-19
> **Status**: Draft
> **Plan Reference**: [docs/01-plan/features/consultation-edit-and-sync.plan.md](../../01-plan/features/consultation-edit-and-sync.plan.md)

---

## 1. Architecture Overview

### 1.1 Layer Touchpoints

```
domain/
  entities/Consultation.ts                ← + ScheduleUpdatePatch, ImpactReport, BookingTokenMeta (Phase 1+3)
  rules/consultationRules.ts (신규)        ← analyzeScheduleUpdateImpact, isSlotBlockedByTimetable (Phase 1+2)
  repositories/IConsultationRepository.ts ← (no change, load/save 그대로 — Supabase는 별도 client)

adapters/
  stores/useConsultationStore.ts          ← + updateSchedule, rescheduleBooking, cancelBooking,
                                              recomputeSlotAvailability, registerScheduleSyncListener
  stores/useScheduleStore.ts              ← (Phase 2) mutate 시 consultation sync 트리거 (구독자 알림)
  components/Homeroom/Consultation/
    ConsultationDetail.tsx                ← 예약 카드 액션에 "변경/취소" 버튼 (Phase 1)
    ConsultationTab.tsx                   ← Card에 "수정" 버튼 (Phase 1)
    ConsultationEditModal.tsx (신규)      ← Phase 1
    RescheduleBookingModal.tsx (신규)     ← Phase 1
    CancelBookingConfirmDialog.tsx (신규) ← Phase 1
    ScheduleUpdateImpactWarning.tsx (신규)← Phase 1 (사전 영향 시뮬레이션 UI)

infrastructure/
  supabase/ConsultationSupabaseClient.ts  ← + updateSchedule, addSlots, removeSlots,
                                              rescheduleBooking, generateBookingToken (Phase 1+3)
  supabase/sql/ (신규)
    2026-05-19__add_booking_token.sql     ← Phase 3 — booking 테이블에 token 컬럼 추가
    2026-05-19__reschedule_rpc.sql        ← Phase 1 — atomic 슬롯 swap RPC

landing/ (Phase 3 PR 별도)
  src/components/booking/bookingApi.ts    ← + getMyBooking, rescheduleMyBooking, cancelMyBooking
  src/app/booking/[id]/mine/page.tsx (신규) ← 학부모 본인 예약 페이지
  src/components/booking/MyBookingView.tsx (신규)
  src/components/booking/BookingPageContent.tsx ← alreadyBooked 분기에 "내 예약 보기" 링크 추가
```

### 1.2 Why a Supabase RPC for Reschedule?

| Option                                                               | Pros                             | Cons                                                                         | Decision |
| -------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------- | -------- |
| REST 3회 호출 (booking PATCH + 2 slot PATCH)                         | 클라이언트 단순                  | 중간 실패 시 슬롯 상태 불일치 — 두 슬롯 모두 booked로 남거나 둘 다 available | ❌       |
| Supabase function transaction (`book_consultation_slot` 패턴 재사용) | atomicity 보장, 기존 패턴 일관성 | SQL 파일 1개 추가                                                            | ✅       |

이미 `bookSlot`이 `book_consultation_slot` RPC를 사용 (atomic). 동일 패턴으로 `reschedule_consultation_booking` 추가.

---

## 2. Domain Layer

### 2.1 신규 타입 (Consultation.ts)

```typescript
// domain/entities/Consultation.ts에 추가

/** schedule 부분 갱신 패치 */
export interface ScheduleUpdatePatch {
  readonly title?: string;
  readonly type?: ConsultationType;
  readonly methods?: readonly ConsultationMethod[];
  readonly slotMinutes?: number;
  readonly dates?: readonly ConsultationDate[];
  readonly message?: string;
  /** 차단 슬롯 명시 추가 (date_startTime) — Phase 2에서 활용 */
  readonly blockedSlots?: readonly { date: string; startTime: string }[];
}

/** schedule 갱신 시 영향받는 예약 분석 */
export interface ScheduleUpdateImpact {
  /** 변경 후에도 가리키는 슬롯이 그대로 살아 있는 예약 */
  readonly preserved: readonly ConsultationBooking[];
  /** 변경 후 슬롯이 사라지거나 차단되는 예약 (사용자 결정 필요) */
  readonly affected: readonly {
    readonly booking: ConsultationBooking;
    readonly reason: 'slot_removed' | 'slot_blocked' | 'method_unsupported';
  }[];
}

/** Phase 3 — 학부모 본인 예약 인증 토큰 */
export interface BookingTokenMeta {
  readonly bookingId: string;
  readonly token: string; // nanoid(16), URL-safe
  readonly issuedAt: string;
}
```

### 2.2 신규 도메인 규칙 (consultationRules.ts)

```typescript
// domain/rules/consultationRules.ts (신규)

import type {
  ConsultationSchedule,
  ConsultationSlot,
  ConsultationBooking,
  ScheduleUpdatePatch,
  ScheduleUpdateImpact,
  ConsultationDate,
} from '../entities/Consultation';

/**
 * Phase 1 — schedule 패치 적용 시 영향받는 예약을 사전 계산 (DB 호출 0회, 순수 함수).
 *
 * 알고리즘:
 *  1. 패치 후 예상 슬롯 집합을 (date, startTime, endTime, slotMinutes) 기준으로 재계산
 *  2. 기존 booking이 가리키는 slot이 예상 슬롯 집합에 (date_startTime) 키로 존재하는지 확인
 *  3. 사라졌으면 'slot_removed', 차단 슬롯에 포함되면 'slot_blocked',
 *     예약 method가 패치된 methods 배열에 없으면 'method_unsupported'
 *  4. 그 외는 preserved
 *
 * 사용처: ConsultationEditModal이 사용자에게 "확인" 누르기 전 경고로 표시.
 */
export function analyzeScheduleUpdateImpact(
  current: ConsultationSchedule,
  patch: ScheduleUpdatePatch,
  slots: readonly ConsultationSlot[],
  bookings: readonly ConsultationBooking[],
): ScheduleUpdateImpact;

/**
 * Phase 2 — 슬롯 (date, startTime)가 useScheduleStore의 외부일정/휴가와 겹치는지 판정.
 *  - busyPeriods는 useScheduleStore + useTimetableStore에서 합쳐 호출자가 주입
 *  - 슬롯 [startTime, startTime+slotMinutes)와 busyPeriod [start, end)가 1분이라도 겹치면 true
 */
export function isSlotBlockedByTimetable(
  slot: { date: string; startTime: string; endTime: string },
  busyPeriods: readonly { date: string; startTime: string; endTime: string }[],
): boolean;
```

**Why pure function**: domain 레이어는 외부 의존성 금지(CLAUDE.md). 호출자(`useConsultationStore`)가 슬롯·예약·busyPeriods를 주입한다 → 테스트 용이.

---

## 3. UseCase Layer — `useConsultationStore`

### 3.1 신규 메서드 시그니처

```typescript
// adapters/stores/useConsultationStore.ts

interface ConsultationState {
  // 기존
  schedules: readonly ConsultationSchedule[];
  loaded: boolean;
  load(): Promise<void>;
  createSchedule(...): Promise<ConsultationSchedule>;
  deleteSchedule(id: string): Promise<void>;
  archiveSchedule(id: string): Promise<void>;

  // Phase 1 신규
  updateSchedule(
    id: string,
    patch: ScheduleUpdatePatch,
    options?: { onAffectedBookings?: 'cancel' | 'abort' },
  ): Promise<{ ok: true; impact: ScheduleUpdateImpact } | { ok: false; reason: string }>;

  rescheduleBooking(
    scheduleId: string,
    bookingId: string,
    newSlotId: string,
  ): Promise<{ ok: true } | { ok: false; reason: string }>;

  cancelBooking(
    scheduleId: string,
    bookingId: string,
  ): Promise<{ ok: true } | { ok: false; reason: string }>;

  // Phase 2 신규
  recomputeSlotAvailability(
    scheduleId: string,
  ): Promise<{ blockedAdded: number; availableRestored: number }>;

  /** 일정표/시간표 변경 구독 등록 (Phase 2). 최초 1회만 호출. */
  registerScheduleSyncListener(): () => void; // returns unsubscribe
}
```

### 3.2 의사코드 — `updateSchedule`

```typescript
async updateSchedule(id, patch, options = {}) {
  const current = get().schedules.find(s => s.id === id);
  if (!current) return { ok: false, reason: 'NOT_FOUND' };

  // 1) 영향 분석 (DB 호출 1회)
  const [slots, bookings] = await Promise.all([
    consultationClient.getSlots(id),
    consultationClient.getBookings(id),
  ]);
  const impact = analyzeScheduleUpdateImpact(current, patch, slots, bookings);

  // 2) 영향 있고 옵션 미지정 시 → caller에 결정 위임 (UI가 다이얼로그 띄움)
  if (impact.affected.length > 0 && !options.onAffectedBookings) {
    return { ok: true, impact }; // 아직 DB 변경 안 함, caller가 옵션 채워 재호출
  }

  // 3) 영향 예약 처리
  if (options.onAffectedBookings === 'cancel') {
    for (const a of impact.affected) {
      await consultationClient.cancelBooking(a.booking.id, id);
    }
  } else if (options.onAffectedBookings === 'abort' && impact.affected.length > 0) {
    return { ok: false, reason: 'ABORTED_BY_USER' };
  }

  // 4) schedule 메타 PATCH
  await consultationClient.updateSchedule(id, patch);

  // 5) 슬롯 재생성 (dates 또는 slotMinutes 변경 시)
  if (patch.dates || patch.slotMinutes) {
    await consultationClient.replaceSlots(id, computeNewSlots(patch, current));
    // 기존 예약이 가리키는 slot_id가 새 슬롯에 매핑되도록 RPC가 처리
  }

  // 6) 로컬 store 갱신
  set(state => ({
    schedules: state.schedules.map(s => s.id === id ? { ...s, ...patch } : s),
  }));

  // 7) consultationRepository.save로 로컬 JSON도 동기화 (오프라인 미러)
  await consultationRepository.save({ schedules: get().schedules });

  return { ok: true, impact };
}
```

**핵심 설계**: 영향 분석 결과를 caller에게 한 번 반환하고, 사용자가 UI에서 확인 후 같은 메서드를 `onAffectedBookings: 'cancel'`로 재호출 — 2-step commit 패턴. 도메인 무결성을 사용자 결정에 위임.

### 3.3 의사코드 — `rescheduleBooking`

```typescript
async rescheduleBooking(scheduleId, bookingId, newSlotId) {
  // Supabase RPC 한 방 (atomic)
  const res = await consultationClient.rescheduleBooking({
    bookingId, newSlotId, scheduleId,
  });
  if (!res.success) return { ok: false, reason: res.message };

  // 로컬 상태 갱신은 폴링이 처리 (startPolling이 이미 30s 주기 + manual refresh)
  return { ok: true };
}
```

### 3.4 의사코드 — `cancelBooking`

```typescript
async cancelBooking(scheduleId, bookingId) {
  try {
    await consultationClient.cancelBooking(bookingId, scheduleId);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}
```

`ConsultationSupabaseClient.cancelBooking`은 [이미 구현됨](../../../src/infrastructure/supabase/ConsultationSupabaseClient.ts#L328-L381). store 메서드는 thin wrapper.

### 3.5 의사코드 — `recomputeSlotAvailability` (Phase 2)

```typescript
async recomputeSlotAvailability(scheduleId) {
  const schedule = get().schedules.find(s => s.id === scheduleId);
  if (!schedule || schedule.isArchived) return { blockedAdded: 0, availableRestored: 0 };

  // 1) 현재 슬롯 + 예약 조회
  const [slots, bookings] = await Promise.all([
    consultationClient.getSlots(scheduleId),
    consultationClient.getBookings(scheduleId),
  ]);

  // 2) 일정표 + 시간표에서 busy 구간 추출
  const scheduleStore = useScheduleStore.getState();
  const timetableStore = useTimetableStore.getState();
  const busyPeriods = buildBusyPeriods(scheduleStore, timetableStore, schedule.dates);

  // 3) 각 슬롯에 대해 충돌 판정
  const bookedSlotIds = new Set(bookings.map(b => b.slotId));
  const toBlock: string[] = [];
  const toRestore: string[] = [];

  for (const slot of slots) {
    const collides = isSlotBlockedByTimetable(slot, busyPeriods);

    // 예약 있는 슬롯은 절대 자동 변경 금지 — 충돌만 별도 표시
    if (bookedSlotIds.has(slot.id)) {
      // Phase 1+2 — UI에서 충돌 시각 강조 (메타테이블 ConsultationDetail 활용)
      continue;
    }

    if (collides && slot.status === 'available') toBlock.push(slot.id);
    else if (!collides && slot.status === 'blocked') toRestore.push(slot.id);
  }

  // 4) 배치 PATCH (병렬, 멱등)
  if (toBlock.length > 0) await consultationClient.bulkUpdateSlotStatus(toBlock, 'blocked');
  if (toRestore.length > 0) await consultationClient.bulkUpdateSlotStatus(toRestore, 'available');

  return { blockedAdded: toBlock.length, availableRestored: toRestore.length };
}
```

**불변식**: 예약 있는 슬롯은 자동 변경 절대 금지. 충돌은 UI 표시만.

### 3.6 일정표 변경 구독 (Phase 2)

```typescript
registerScheduleSyncListener() {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const unsubSchedule = useScheduleStore.subscribe(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const activeSchedules = get().schedules.filter(s => !s.isArchived);
      Promise.all(activeSchedules.map(s => get().recomputeSlotAvailability(s.id)));
    }, 1000); // debounce 1s
  });

  // 시간표 동일 구독 (생략)
  return () => { unsubSchedule(); /* ... */ };
}
```

App bootstrap (e.g. `App.tsx` mount) 시 1회 호출. zustand `subscribe`로 구독.

---

## 4. Infrastructure Layer — Supabase

### 4.1 신규 메서드 (`ConsultationSupabaseClient.ts`)

```typescript
async updateSchedule(id: string, patch: {
  title?: string; type?: ConsultationType; methods?: readonly ConsultationMethod[];
  slotMinutes?: number; dates?: readonly ConsultationDate[]; message?: string;
}): Promise<void>;
// → PATCH /rest/v1/consultation_schedules?id=eq.${id}

async replaceSlots(scheduleId: string, newSlots: readonly NewSlotInput[]): Promise<void>;
// → DELETE 기존 slots (예약 없는 것만) + INSERT 신규 슬롯
// → 예약이 있는 기존 슬롯은 보존 (별도 검증 후 호출)

async rescheduleBooking(params: {
  bookingId: string; newSlotId: string; scheduleId: string;
}): Promise<{ success: boolean; message: string }>;
// → POST /rest/v1/rpc/reschedule_consultation_booking

async bulkUpdateSlotStatus(slotIds: readonly string[], status: 'available' | 'blocked'): Promise<void>;
// → PATCH /rest/v1/consultation_slots?id=in.(...)

// Phase 3
async generateBookingToken(bookingId: string): Promise<string>;
// → PATCH consultation_bookings?id=eq.${id} { token: nanoid(16) }

async getBookingByToken(token: string): Promise<BookingPublic | null>;
```

### 4.2 RPC 신설 — `reschedule_consultation_booking`

```sql
-- supabase/sql/2026-05-19__reschedule_rpc.sql
CREATE OR REPLACE FUNCTION reschedule_consultation_booking(
  p_booking_id uuid,
  p_new_slot_id uuid,
  p_schedule_id uuid
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_old_slot_id uuid;
  v_new_slot_status text;
BEGIN
  -- 1) 기존 슬롯 ID 조회 + 잠금
  SELECT slot_id INTO v_old_slot_id
  FROM consultation_bookings
  WHERE id = p_booking_id AND schedule_id = p_schedule_id
  FOR UPDATE;

  IF v_old_slot_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Booking not found');
  END IF;

  -- 2) 새 슬롯 상태 확인 (available 인지)
  SELECT status INTO v_new_slot_status
  FROM consultation_slots
  WHERE id = p_new_slot_id AND schedule_id = p_schedule_id
  FOR UPDATE;

  IF v_new_slot_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'New slot not found');
  END IF;
  IF v_new_slot_status != 'available' THEN
    RETURN jsonb_build_object('success', false, 'message', '선택한 시간대는 이미 예약되었거나 차단되었습니다.');
  END IF;

  -- 3) 예약 booking → 새 슬롯
  UPDATE consultation_bookings SET slot_id = p_new_slot_id WHERE id = p_booking_id;

  -- 4) 새 슬롯 booked, 기존 슬롯 available
  UPDATE consultation_slots SET status = 'booked' WHERE id = p_new_slot_id;
  UPDATE consultation_slots SET status = 'available' WHERE id = v_old_slot_id;

  RETURN jsonb_build_object('success', true, 'message', '예약 시간이 변경되었습니다.');
END;
$$;
```

`FOR UPDATE` 잠금으로 동시 예약 race 차단.

### 4.3 마이그레이션 — Phase 3 booking token

```sql
-- supabase/sql/2026-05-19__add_booking_token.sql
ALTER TABLE consultation_bookings
  ADD COLUMN IF NOT EXISTS token text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_consultation_bookings_token
  ON consultation_bookings (token) WHERE token IS NOT NULL;

-- RLS — 학부모 본인 접근용
CREATE POLICY parent_read_own_booking ON consultation_bookings
  FOR SELECT
  USING (token IS NOT NULL AND token = current_setting('request.jwt.claims', true)::jsonb->>'token');
-- 또는 RPC로 token 검증 (보안 더 강함, Phase 3 design 확정 단계에서 결정)
```

---

## 5. UI Layer — Phase 1 컴포넌트

### 5.1 ConsultationDetail 예약 카드 액션 패치

`src/adapters/components/Homeroom/Consultation/ConsultationDetail.tsx:623-663` 액션 영역에 2개 버튼 추가:

```tsx
<div className="ml-auto flex items-center gap-1 shrink-0">
  {/* 기존: 캘린더, 기록 */}
  {/* 신규 */}
  <button
    onClick={() => setRescheduleTarget({ booking, slot })}
    className="text-sp-muted hover:text-sp-accent ..."
    title="시간 변경"
    data-testid={`booking-${booking.id}-reschedule`}
  >
    <span className="material-symbols-outlined text-sm">schedule</span>
    <span className="text-detail">변경</span>
  </button>
  <button
    onClick={() => setCancelTarget(booking)}
    className="text-red-400/80 hover:text-red-400 ..."
    title="예약 취소"
    data-testid={`booking-${booking.id}-cancel`}
  >
    <span className="material-symbols-outlined text-sm">cancel</span>
    <span className="text-detail">취소</span>
  </button>
</div>;

{
  /* 모달 영역 (컴포넌트 하단) */
}
{
  rescheduleTarget && (
    <RescheduleBookingModal
      schedule={schedule}
      booking={rescheduleTarget.booking}
      currentSlot={rescheduleTarget.slot}
      onClose={() => setRescheduleTarget(null)}
      onSuccess={() => {
        setRescheduleTarget(null);
        refreshPolling();
      }}
    />
  );
}
{
  cancelTarget && (
    <CancelBookingConfirmDialog
      schedule={schedule}
      booking={cancelTarget}
      onClose={() => setCancelTarget(null)}
      onSuccess={() => {
        setCancelTarget(null);
        refreshPolling();
      }}
    />
  );
}
```

### 5.2 `RescheduleBookingModal` (신규)

```
┌──────────────────────────────────────────────┐
│ 시간 변경 — {학생번호}번 {학생명}                │
├──────────────────────────────────────────────┤
│ 현재 예약: {date} {start}~{end} ({method})    │
│                                              │
│ 변경할 시간대 선택:                            │
│   ○ 5/20 (월) 14:00~14:20                    │
│   ○ 5/20 (월) 14:20~14:40                    │
│   ● 5/21 (화) 09:00~09:20  ← 선택됨           │
│   ✕ 5/21 (화) 09:20~09:40  (다른 예약)        │
│                                              │
│ ┌──────────────────────────────────┐         │
│ │ 안내                              │         │
│ │ 변경 후 학부모님께 변경 사항을      │         │
│ │ 별도로 안내해 주세요.              │         │
│ └──────────────────────────────────┘         │
│                            [취소] [변경하기]   │
└──────────────────────────────────────────────┘
```

- props: `{ schedule, booking, currentSlot, onClose, onSuccess }`
- 가용 슬롯만 선택 가능 (`status === 'available'`)
- "변경하기" 클릭 → `useConsultationStore.rescheduleBooking()` 호출 → 결과 토스트 → polling refresh

### 5.3 `CancelBookingConfirmDialog` (신규)

표준 확인 다이얼로그 + 옵션 "학부모에게 안내 메시지 표시 (수동 발송)":

```tsx
<ConfirmDialog
  title="예약을 취소하시겠습니까?"
  description={`${student.number}번 ${student.name}의 ${date} ${time} 예약이 취소됩니다.\n학부모님께 별도로 안내해 주세요.`}
  confirmLabel="취소하기"
  confirmVariant="danger"
  onConfirm={async () => {
    const r = await useConsultationStore.getState().cancelBooking(schedule.id, booking.id);
    if (r.ok) {
      showToast('예약이 취소되었습니다', 'success');
      onSuccess();
    } else {
      showToast(r.reason, 'error');
    }
  }}
/>
```

`ConfirmDialog`가 없으면 기존 Modal 컴포넌트 활용 (`src/adapters/components/common/Modal.tsx` + footer 액션 2개).

### 5.4 ConsultationTab — Card 수정 버튼

`src/adapters/components/Homeroom/Consultation/ConsultationTab.tsx:181-192` 공유 버튼 옆:

```tsx
<button
  onClick={(e) => {
    e.stopPropagation();
    onEdit(schedule);
  }}
  className="text-detail text-sp-accent hover:text-sp-accent/80 ..."
  data-testid={`schedule-${schedule.id}-edit`}
>
  <span className="material-symbols-outlined text-xs">edit</span>
  수정
</button>
```

Tab 본체에 `editSchedule` state + `ConsultationEditModal` 렌더.

### 5.5 `ConsultationEditModal` (신규, ConsultationCreateModal 기반)

- 기반: 기존 `ConsultationCreateModal`을 복사해 prefill + "수정" 라벨 + `updateSchedule` 호출로 변경
- **차이점**:
  - 모든 필드 prefill
  - "확인" 클릭 시 `updateSchedule(id, patch)` (옵션 없이) → 영향 분석 결과 반환받음
  - `impact.affected.length > 0`이면 `<ScheduleUpdateImpactWarning>` 표시:

    ```
    ⚠ 다음 예약이 영향을 받습니다:
       - 3번 김OO (5/20 14:00 → 슬롯 사라짐)
       - 7번 박OO (5/21 09:20 → 차단 시간과 겹침)

    [그대로 진행 (해당 예약 취소)] [수정 취소]
    ```

  - "그대로 진행" → `updateSchedule(id, patch, { onAffectedBookings: 'cancel' })` 재호출

- (선택, 부채로 이월) `ConsultationCreateModal`과 form fields 공유 컴포넌트로 추출 — Phase 1 머지 후 별도 PR

---

## 6. Phase 2 — 일정표 동기화 상세 (v2 보강)

### 6.0 입력 소스 — 실제 도메인 매핑

쌤핀의 "일정표"는 단일 store 가 아니라 두 곳에 분산된다.

| 소스             | 위치                                                       | 의미                                                                  | 사용                                              |
| ---------------- | ---------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------- |
| 수업 시간표 변동 | `useScheduleStore.overrides: readonly TimetableOverride[]` | 일자별 시간표 임시 변경(교사 보강/휴강/맞교환)                        | 휴강·자습 등으로 비는 시간을 "유효 시간표"로 계산 |
| 학교/개인 일정   | `useEventsStore.events: readonly SchoolEvent[]`            | 행사·휴가·외부 일정 (`time`/`startTime`/`endTime`/`period` 필드 보유) | 특정 시간대 차단                                  |
| 상담 슬롯        | `consultation_slots` (Supabase)                            | 상담 가능 시간                                                        | 동기화 대상                                       |

→ Phase 2 의 입력은 **`overrides` + `events`** 두 가지를 합쳐서 `busyPeriods` 로 정규화한다.

### 6.1 busyPeriods 빌더 — 구체 구현

```typescript
// src/domain/rules/consultationRules.ts 에 추가 (Phase 2)

import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import type { TimetableOverride } from '@domain/entities/Timetable';

export interface BusyPeriod {
  readonly date: string; // "YYYY-MM-DD"
  readonly startTime: string; // "HH:mm"
  readonly endTime: string; // "HH:mm"
  readonly source: 'event' | 'override';
  readonly sourceId: string;
}

export function buildBusyPeriods(params: {
  readonly events: readonly SchoolEvent[];
  readonly overrides: readonly TimetableOverride[];
  /** 변환 대상 날짜 (상담 일정 dates) — 성능을 위해 이 날짜만 처리 */
  readonly targetDates: readonly string[];
  /** 교시 → 시간 변환 (Settings.periodTimes 에서 호출자가 주입) */
  readonly resolvePeriodTime: (period: string) => { start: string; end: string } | null;
}): readonly BusyPeriod[] {
  const dateSet = new Set(params.targetDates);
  const result: BusyPeriod[] = [];

  // 1) SchoolEvent → busy period
  for (const ev of params.events) {
    if (!dateSet.has(ev.date) && !ev.endDate) continue;

    const dates = expandEventDates(ev, dateSet);
    for (const d of dates) {
      const range = resolveEventTimeRange(ev, params.resolvePeriodTime);
      if (range) {
        result.push({
          date: d,
          startTime: range.start,
          endTime: range.end,
          source: 'event',
          sourceId: ev.id,
        });
      }
    }
  }

  // 2) TimetableOverride → busy period (kind === 'cancel' 만: 휴강은 가용,
  //    'swap'·'substitute' 는 수업이 있으므로 *해당 교시*는 busy 로 본다)
  for (const ov of params.overrides) {
    if (!dateSet.has(ov.date)) continue;
    if (ov.kind === 'cancel') continue; // 휴강 시간대는 가용으로 두는 정책
    const range = params.resolvePeriodTime(String(ov.period));
    if (range) {
      result.push({
        date: ov.date,
        startTime: range.start,
        endTime: range.end,
        source: 'override',
        sourceId: ov.id,
      });
    }
  }

  return result;
}

function expandEventDates(ev: SchoolEvent, allowed: ReadonlySet<string>): string[] {
  // 다일 행사 + recurrence 는 별도 헬퍼 필요 — 우선 단일 일자만 지원
  // (recurrence 는 후속 PDCA, Phase 2.5 로 분리)
  if (allowed.has(ev.date)) return [ev.date];
  return [];
}

function resolveEventTimeRange(
  ev: SchoolEvent,
  resolvePeriodTime: (period: string) => { start: string; end: string } | null,
): { start: string; end: string } | null {
  // 우선순위: startTime/endTime > time(HH:mm-HH:mm) > period
  if (ev.startTime && ev.endTime) {
    return { start: ev.startTime, end: ev.endTime };
  }
  if (ev.time && ev.time.includes('-')) {
    const [s, e] = ev.time.split('-').map((x) => x.trim());
    if (s && e) return { start: s, end: e };
  }
  if (ev.period) {
    if (ev.period === 'allDay') return { start: '00:00', end: '23:59' };
    const start = resolvePeriodTime(ev.period);
    if (!start) return null;
    if (ev.periodEnd) {
      const end = resolvePeriodTime(ev.periodEnd);
      if (end) return { start: start.start, end: end.end };
    }
    return start;
  }
  return null;
}
```

**도메인 무결성**: `buildBusyPeriods` 는 순수 함수. `resolvePeriodTime` 도 호출자 주입(외부 의존 0).

### 6.2 `recomputeSlotAvailability` 호출 의사코드

```typescript
// adapters/stores/useConsultationStore.ts (Phase 2 신규)
async recomputeSlotAvailability(scheduleId) {
  const schedule = get().schedules.find(s => s.id === scheduleId);
  if (!schedule || schedule.isArchived) return { blockedAdded: 0, availableRestored: 0 };

  const [slots, bookings] = await Promise.all([
    consultationSupabaseClient.getSlots(scheduleId),
    consultationSupabaseClient.getBookings(scheduleId),
  ]);

  // 1) 입력 수집
  const scheduleStore = useScheduleStore.getState();
  const eventsStore = useEventsStore.getState();
  const settings = useSettingsStore.getState().settings;
  const resolvePeriodTime = makePeriodResolver(settings.periodTimes);

  const targetDates = schedule.dates.map(d => d.date);
  const busyPeriods = buildBusyPeriods({
    events: eventsStore.events,
    overrides: scheduleStore.overrides,
    targetDates,
    resolvePeriodTime,
  });

  // 2) 슬롯별 충돌 판정 — 예약 있는 슬롯은 자동 변경 금지
  const bookedSlotIds = new Set(bookings.map(b => b.slotId));
  const toBlock: string[] = [];
  const toRestore: string[] = [];

  for (const slot of slots) {
    if (bookedSlotIds.has(slot.id)) continue; // 보존 정책
    const collides = isSlotBlockedByTimetable(slot, busyPeriods);
    if (collides && slot.status === 'available') toBlock.push(slot.id);
    else if (!collides && slot.status === 'blocked') toRestore.push(slot.id);
  }

  // 3) 배치 PATCH
  if (toBlock.length > 0) await consultationSupabaseClient.bulkUpdateSlotStatus(toBlock, 'blocked');
  if (toRestore.length > 0) await consultationSupabaseClient.bulkUpdateSlotStatus(toRestore, 'available');

  return { blockedAdded: toBlock.length, availableRestored: toRestore.length };
}
```

**Phase 1 에서 이미 구현된 부분**: `bulkUpdateSlotStatus` (인프라), `isSlotBlockedByTimetable` (도메인). Phase 2 는 `buildBusyPeriods` + `recomputeSlotAvailability` + 구독 트리거만 추가하면 된다.

### 6.3 동기화 트리거 — debounce + 구독

```typescript
// adapters/stores/useConsultationStore.ts (Phase 2)
registerScheduleSyncListener(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;

  const runAll = async () => {
    if (inFlight) return; // 동시 진행 가드
    inFlight = true;
    try {
      const active = get().schedules.filter(s => !s.isArchived);
      await Promise.all(active.map(s => get().recomputeSlotAvailability(s.id)));
    } finally {
      inFlight = false;
    }
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void runAll(); }, 1000); // debounce 1s
  };

  const unsubSchedule = useScheduleStore.subscribe(schedule);
  const unsubEvents = useEventsStore.subscribe(schedule);

  return () => { unsubSchedule(); unsubEvents(); if (timer) clearTimeout(timer); };
}
```

**호출 위치**: `App.tsx` mount 시 1회 호출(`useEffect`) → 앱 라이프타임 동안 구독 유지. 폴링과 별개로 동기화는 즉시 일어남.

### 6.4 ConsultationDetail 진입 시 fallback

```typescript
// ConsultationDetail.tsx mount useEffect 에 추가
useEffect(() => {
  void useConsultationStore.getState().recomputeSlotAvailability(schedule.id);
}, [schedule.id]);
```

→ 구독을 놓친 경우(예: 다른 PC 에서 일정표 변경) 라도 화면 진입 시 1회 재계산.

### 6.5 충돌 시각화 — ConsultationDetail

예약 있는 슬롯이 busy 와 겹치면 (자동 변경은 안 했지만 사용자에게 알려야 함):

```typescript
// ConsultationDetail.tsx 슬롯 렌더 부근
const isConflicted = useMemo(() => {
  const busy = computeBusyForSchedule(schedule);
  return new Map(
    bookings.map((b) => {
      const slot = slots.find((s) => s.id === b.slotId);
      if (!slot) return [b.id, false] as const;
      return [b.id, isSlotBlockedByTimetable(slot, busy)] as const;
    }),
  );
}, [bookings, slots, schedule]);
```

UI:

- 슬롯 카드 좌측 보더에 `border-l-2 border-yellow-400` + 우상단에 "⚠ 일정표 충돌" 배지
- 액션 영역에 "재배정 권장" 라벨(클릭하면 RescheduleBookingModal 직행)
- 사용자가 무시하면 그대로 진행 가능 — **자동 취소는 절대 안 함**

### 6.6 학부모 페이지(landing/booking) fallback — Phase 2 의 일부

학부모 페이지는 30 초마다 폴링하지만, 그 사이에 담임이 일정표를 바꾸면 stale 한 가용 슬롯이 보일 수 있다.

대응:

1. `BookingPageContent.tsx` mount 시 추가 endpoint `/rest/v1/rpc/recompute_for_booking?schedule=xxx` 호출
2. 해당 RPC 는 서버에서 `buildBusyPeriods` 동등 로직을 SQL 로 구현(또는 Edge Function)하거나, 단순히 `lastRecomputedAt` 메타데이터를 보고 "현재 가용으로 표시된 슬롯이 신뢰 가능한지" 학부모에게 안내 텍스트 표시
3. **결정**: 1차 (Phase 2) 에서는 클라이언트 측에서만 처리 — 학부모 페이지는 30 초 폴링을 5 초로 가속화 + 슬롯 클릭 직전 `getSlots` 1 회 재조회 후 status 재확인. Edge Function 까지는 Phase 2.5 또는 Phase 3 에서.

### 6.7 메타테스트

```typescript
// src/domain/rules/consultationRules.test.ts 에 추가
describe('buildBusyPeriods', () => {
  it('SchoolEvent.startTime/endTime → busy period', ...);
  it('SchoolEvent.period → resolvePeriodTime 결과 사용', ...);
  it('TimetableOverride.kind="cancel" 은 busy 에서 제외 (휴강은 가용)', ...);
  it('TimetableOverride.kind="swap"/"substitute" → busy', ...);
  it('targetDates 외 일자는 무시', ...);
});

// useConsultationStore.test.ts 에 추가
describe('recomputeSlotAvailability', () => {
  it('busy 가 가용 슬롯과 겹침 → status="blocked" PATCH', ...);
  it('busy 가 사라짐 → blocked → available 로 복구', ...);
  it('예약 있는 슬롯은 busy 충돌해도 status 변경 없음 (보존)', ...);
  it('archived schedule 은 무시', ...);
  it('연속 2회 호출 결과 같음 (멱등)', ...);
});
```

### 6.8 Phase 2 머지 안전성

- **Phase 1 머지 후 단독 진행 가능** — Phase 1 의 `bulkUpdateSlotStatus` (인프라), `isSlotBlockedByTimetable` (도메인) 가 이미 출시되어 있음
- **`registerScheduleSyncListener` 미호출이면 동작 변경 0** — App mount 에서 1줄 호출만 추가하면 활성화
- 롤백 시 listener 만 제거하면 기존 동작 그대로
- `bulkUpdateSlotStatus` 가 호출 실패해도 슬롯은 기존 status 유지 (사용자에게 무영향, 로그만 남음)

---

## 7. Phase 3 — 학부모 셀프 서비스 상세

### 7.1 token 발급 흐름

1. `bookSlot` 성공 → 백엔드가 `nanoid(16)` 생성해 `consultation_bookings.token`에 저장 + 응답에 포함
2. 학부모 브라우저 `localStorage["ssampin_booking_token_<scheduleId>"] = token` 저장
3. 예약 완료 화면에 "내 예약 보기" 버튼 → `/booking/${scheduleId}/mine?t=${token}`
4. (선택) 같은 페이지 재방문 시 localStorage에서 자동 복원 → `alreadyBooked` 상태에서 "내 예약 변경" 진입

### 7.2 `landing/src/app/booking/[id]/mine/page.tsx`

- 서버 컴포넌트로 `params.id`, `searchParams.t` 받음
- `<MyBookingView scheduleId={id} token={t} />` 클라이언트 컴포넌트 렌더

### 7.3 `MyBookingView`

```
┌──────────────────────────────────────────────┐
│ 내 예약                                       │
│                                              │
│ {제목}                                        │
│ {date} {start}~{end}                          │
│ 상담 방식: {method}                            │
│                                              │
│ [시간 변경]  [예약 취소]                       │
└──────────────────────────────────────────────┘
```

- "시간 변경" → 가용 슬롯 목록 → `rescheduleMyBooking(token, newSlotId)` 호출 (서버는 token 검증 후 `reschedule_consultation_booking` RPC 실행)
- "예약 취소" → 확인 후 `cancelMyBooking(token)` 호출

### 7.4 `bookingApi.ts` 확장

```typescript
export async function getMyBooking(token: string): Promise<MyBookingPublic | null>;
export async function rescheduleMyBooking(
  token: string,
  newSlotId: string,
): Promise<{ success: boolean; message: string }>;
export async function cancelMyBooking(
  token: string,
): Promise<{ success: boolean; message: string }>;
```

서버 측: `/rest/v1/rpc/reschedule_by_token`, `/rest/v1/rpc/cancel_by_token` 신설 (token으로 booking 조회 + 기존 RPC 재사용)

---

## 8. 데이터 무결성 & 트랜잭션

| 시나리오                              | 보장 메커니즘                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 동시에 같은 슬롯 재배정 시도          | `reschedule_consultation_booking` RPC의 `FOR UPDATE` 잠금                                                                             |
| `updateSchedule` 중 누군가 새 예약    | 영향 분석은 보수적(최신 booking 조회) + 슬롯 INSERT는 unique constraint (`schedule_id, date, start_time`)                             |
| `cancelBooking` 중 슬롯 PATCH 실패    | 현재 코드 그대로(예약 삭제 성공 + 슬롯 복구 실패 → orphan 슬롯 booked 상태). **수동 복구 가능 + 에러 로그**. 트랜잭션화는 부채로 이월 |
| `recomputeSlotAvailability` 무한 루프 | debounce 1s + 멱등성 + 예약 있는 슬롯 자동 변경 금지                                                                                  |
| 학부모 token 탈취                     | 16자 nanoid(96 bits) + URL 해시 권장 + Supabase RLS 정책으로 token 일치 시에만 SELECT/UPDATE 허용                                     |

---

## 9. 메타테스트 케이스

### 9.1 Domain — `consultationRules.test.ts`

```typescript
describe('analyzeScheduleUpdateImpact', () => {
  it('변경 없으면 모든 예약 preserved', ...);
  it('dates에서 한 날짜 제거 → 해당 날짜 예약 slot_removed', ...);
  it('slotMinutes 변경(20→30) → 기존 슬롯 경계 어긋남 → slot_removed', ...);
  it('blockedSlots에 추가 → 해당 슬롯 예약 slot_blocked', ...);
  it('methods에서 video 제거 → video 예약 method_unsupported', ...);
});

describe('isSlotBlockedByTimetable', () => {
  it('완전 포함 → true', ...);
  it('1분 겹침 → true', ...);
  it('인접 (10:00~10:20 vs 10:20~10:40) → false', ...);
});
```

### 9.2 Store — `useConsultationStore.test.ts`

```typescript
describe('updateSchedule', () => {
  it('영향 없는 패치 → ok + 슬롯 보존', ...);
  it('영향 있는 패치 + 옵션 미지정 → DB 변경 없이 impact만 반환', ...);
  it('영향 있는 패치 + onAffectedBookings=cancel → 영향 예약 cancelBooking 호출', ...);
  it('영향 있는 패치 + onAffectedBookings=abort → ok:false', ...);
});

describe('rescheduleBooking', () => {
  it('가용 슬롯으로 변경 → ok', ...);
  it('이미 booked 슬롯으로 변경 시도 → ok:false + 메시지', ...);
});

describe('cancelBooking', () => {
  it('정상 취소 → ok', ...);
});

describe('recomputeSlotAvailability', () => {
  it('busy period 추가 → 가용 슬롯 blocked 전환', ...);
  it('busy period 제거 → blocked 슬롯 available 복구', ...);
  it('예약 있는 슬롯은 busy 충돌해도 status 변경 안 됨', ...);
  it('멱등 — 연속 2회 호출 결과 같음', ...);
});
```

### 9.3 UI 정적 메타테스트 — `ConsultationDetail.meta.test.ts`

```typescript
it('예약 카드 액션 영역에 "변경" 버튼이 존재함 (회귀 차단)', () => {
  const src = fs.readFileSync(
    'src/adapters/components/Homeroom/Consultation/ConsultationDetail.tsx',
    'utf-8',
  );
  expect(src).toMatch(/data-testid={`booking-\$\{[^}]+\}-reschedule`}/);
});
it('예약 카드 액션 영역에 "취소" 버튼이 존재함 (회귀 차단)', () => {
  expect(src).toMatch(/data-testid={`booking-\$\{[^}]+\}-cancel`}/);
});
it('ConsultationCard에 "수정" 버튼이 존재함', () => {
  const src = fs.readFileSync(
    'src/adapters/components/Homeroom/Consultation/ConsultationTab.tsx',
    'utf-8',
  );
  expect(src).toMatch(/data-testid={`schedule-\$\{[^}]+\}-edit`}/);
});
```

modal-scroll-overflow-fix가 사용한 정적 패턴 검사 메타테스트 패턴 재사용.

### 9.4 Phase 3 — `landing/src/components/booking/__tests__/MyBookingView.test.tsx`

- token 유효 → 예약 정보 표시
- token 무효 → "예약을 찾을 수 없습니다" 표시
- "취소" → API mock 호출 검증

---

## 10. 마이그레이션 & 백워드 호환성

### 10.1 기존 데이터 호환

- Phase 1 — 도메인 entity 변경 없음 (`ScheduleUpdatePatch`는 신규, 기존 직렬화 영향 0)
- Phase 2 — 슬롯 status enum 그대로 (`available | booked | blocked`). 기존 데이터 그대로 사용 가능
- Phase 3 — `consultation_bookings.token` 컬럼은 NULLABLE → 기존 예약은 token 없음. 학부모 페이지에서 진입하려면 신규 예약만 가능 (또는 backfill 스크립트로 기존 예약에도 token 발급 가능, scope 밖)

### 10.2 단계별 머지 안전성

- Phase 1 단독 머지 가능: domain entity + store 메서드 + UI 추가만, 기존 흐름 손상 없음
- Phase 2 단독 머지 가능: subscribe만 등록, 기존 슬롯 동작 변경 없음 (충돌 시 blocked 전환만)
- Phase 3 단독 머지 가능: landing/ 별도 Vercel 배포, Electron 앱과 무관

---

## 11. 검증 게이트 (Plan에서 인용)

```bash
npx tsc --noEmit
npm run lint
npm run test
npm run regression-check

# Phase 3
cd landing && npm run build
```

수동 회귀 시나리오는 [Plan §6](../../01-plan/features/consultation-edit-and-sync.plan.md#6-검증-게이트) 참조.

---

## 12. 위험 요소 (Design 차원)

| 위험                                          | 완화                                                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `replaceSlots`가 예약 있는 슬롯을 실수로 삭제 | `analyzeScheduleUpdateImpact`로 사전 검출 → caller 결정 위임. SQL DELETE는 `status != 'booked'` 조건 필수 |
| RPC 트랜잭션 실패 후 클라이언트 상태가 stale  | RPC 호출 후 `startPolling` 강제 1회 trigger (manual refresh)                                              |
| Phase 2 debounce가 너무 짧아 N+1 호출         | 1s debounce + 동시 진행 가드 (`isRecomputing` ref)                                                        |
| 학부모 token URL을 SNS에 공유 → 타인 변경     | 본 PDCA scope: 16자 nanoid + 사용자 안내. 추가 보안 (OTP, 단방향 hash)은 후속 PDCA                        |

---

## 13. 다음 액션

1. **본 Design 승인** (사용자 확인)
2. `/pdca do consultation-edit-and-sync` — Phase 1 구현 착수
   - 또는 `ssampin-develop` 스킬로 4 레이어 분해 후 병렬 구현
3. Phase 1 머지 → Phase 2 design 보강 (이중 예약 시나리오 user test) → 구현
4. Phase 2 머지 → Phase 3 (landing/) 별도 PR
