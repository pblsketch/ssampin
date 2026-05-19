# Plan — Consultation Edit & Schedule Sync

- **작성일**: 2026-05-19
- **우선순위**: 🔴 P0 (사용자 신고 — 운영 차단)
- **트리거**: 사용자 신고 (2026-05-19 — 학부모 변경 요청 반복, 담임·학부모 양쪽 수정 불가, 일정표 변경 무시로 이중 예약 위험)
- **영향 버전**: v2.0.5 (전 버전 공통, 상담 예약 기능 도입 이후 누적 부채)
- **연관 시스템**: ConsultationSchedule / Booking / Slot 도메인, landing/booking 학부모 페이지, useScheduleStore 일정표

---

## 1. 사용자 신고 요약

### 신고 ① — 개별 예약 수정 불가

> "담임이 변경하려고 해도 안 되고 신청자가 변경하려고 해도 상담예약 내역에서는 수정 버튼이 아예 없어서 너무 불편함. 학부모께서 변경 요청을 자꾸 주신다."

### 신고 ② — 일정 자체(시간/유형) 즉시 수정 불가

> "담임 업무 > 상담 예약 탭에서 기존 예약 설정(시간/유형 등)을 즉시 수정할 수 있는 기능 부재."

### 신고 ③ — 일정표 변경이 예약 가용성에 반영되지 않음

> "일정표에 따로 변경해 놓아도 예약화면에서는 계속 가능한 시간대로 나오기 때문에 다른 분이 이중예약 가능성도 있음."

---

## 2. 근본 원인 분석

### 2.1 담임용 예약 카드에 수정/취소 버튼 부재

[src/adapters/components/Homeroom/Consultation/ConsultationDetail.tsx:623-663](src/adapters/components/Homeroom/Consultation/ConsultationDetail.tsx#L623-L663)

예약된 슬롯 카드의 액션 영역(`<div className="ml-auto flex items-center gap-1 shrink-0">`)에 렌더링되는 버튼은 **캘린더 추가**, **기록 작성** 2개뿐. 변경·취소·재예약 진입점 자체가 코드에 없음.

### 2.2 인프라 `cancelBooking()` 구현됐으나 UI에서 호출 안 됨

[src/infrastructure/supabase/ConsultationSupabaseClient.ts:328-381](src/infrastructure/supabase/ConsultationSupabaseClient.ts#L328-L381)

`cancelBooking(bookingId)`은 예약 삭제 + 슬롯 상태를 `available`로 복구하는 정상 로직. 그러나 어떤 컴포넌트·스토어에서도 호출되지 않아 사장된 기능.

### 2.3 UseCase 레이어에 update 메서드 전무

[src/adapters/stores/useConsultationStore.ts:12-22](src/adapters/stores/useConsultationStore.ts#L12-L22)

`useConsultationStore`가 노출하는 메서드는 `load / createSchedule / deleteSchedule / archiveSchedule` 4개. **`updateSchedule` · `rescheduleBooking` · `cancelBooking`이 없음** → UI에서 호출하려 해도 갈 곳이 없음.

### 2.4 일정 자체 편집 모달·진입점 부재

[src/adapters/components/Homeroom/Consultation/ConsultationTab.tsx:148-197](src/adapters/components/Homeroom/Consultation/ConsultationTab.tsx#L148-L197)

`ConsultationCard`에 "공유" 버튼만 존재. `ConsultationCreateModal`은 있으나 `ConsultationEditModal` 부재. 현재 일정을 변경하려면 **삭제 → 재생성**이 유일한 길 → 기존 예약·공유 링크·QR 모두 무효화되는 파괴적 동작.

### 2.5 슬롯 가용성이 정적(static) — 일정표 변경 사후 반영 안 됨

[src/infrastructure/supabase/ConsultationSupabaseClient.ts:165-192](src/infrastructure/supabase/ConsultationSupabaseClient.ts#L165-L192)

`createSchedule()`이 슬롯을 일괄 생성할 때 `blockedSlots` 파라미터(생성 시점 스냅샷)만 참조. 이후 담임이 `useScheduleStore`(일정표)에서 휴가·외부일정·차단 시간을 추가해도 **이미 생성된 슬롯의 `status='available'`은 그대로 유지** → 학부모 예약 화면(landing/booking)에 가용으로 표시 → 이중 예약 위험.

### 2.6 학부모용 "내 예약" 화면 부재

[landing/src/components/booking/BookingPageContent.tsx:11-21](landing/src/components/booking/BookingPageContent.tsx#L11-L21)

`ViewState`에 `alreadyBooked` 상태는 있으나 해당 상태에서 "변경/취소" 액션이 없음. 학부모는 본인 예약을 조회·수정·취소할 수 있는 경로가 전무.

---

## 3. 영향 범위

| 신고                             | 영향 사용자        | 현재 우회책                                             | 심각도                  |
| -------------------------------- | ------------------ | ------------------------------------------------------- | ----------------------- |
| ① 개별 예약 변경 불가            | 전체 담임 + 학부모 | 담임이 일정 자체 삭제 후 재생성 (모든 예약자 통지 필요) | 🔴 P0                   |
| ② 일정 설정 즉시 수정 불가       | 전체 담임          | 동일 — 삭제 후 재생성                                   | 🔴 P0                   |
| ③ 일정표↔슬롯 비동기 → 이중 예약 | 전체 담임 + 학부모 | 담임이 수동으로 예약 거절·외부 연락                     | 🟠 P1 (사고 발생 시 P0) |

**누적 영향**: 상담 시즌(학기 초/말, 학부모 면담 주간) 운영 차단 수준. 한 일정에 평균 10~20명 예약 가정 시, 한 학교에서 동시 영향 가능 사용자 수백 명.

---

## 4. 솔루션 비교

### 옵션 A — Phase 1만 핫픽스(개별 예약 수정·취소)

- ✅ 최소 변경, 가장 빠른 출시
- ⚠️ 신고 ②(일정 설정 수정)와 ③(이중 예약) 미해결 → 사용자 재신고 예상

### 옵션 B — 신고 ①②만 (UI + UseCase, 일정표 동기화 제외)

- ✅ 담임 운영 부담 70% 해소
- ⚠️ 이중 예약 위험은 잔존 (사고 가능성)

### 옵션 C — 신고 ①②③ 전부 (학부모 페이지 포함)

- ✅ 운영 차단 완전 해소
- ⚠️ 검증 부담 큼, 학부모 페이지(landing/) 별도 배포 사이클(Vercel)

### 결정 — **옵션 C, 단 3 Phase 분리 머지**

- **Phase 1 (P0 핫픽스)** — 담임용 예약·일정 수정 UI + UseCase 메서드. 단일 PR로 신고 ①② 해소.
- **Phase 2 (P1 안전성)** — 일정표 ↔ 슬롯 가용성 동기화. 신고 ③ 해소. Phase 1 머지 후 즉시 착수.
- **Phase 3 (학부모 셀프 서비스)** — landing/booking에 본인 예약 변경·취소 화면. Vercel 배포 분리.

각 Phase는 독립 PR + 독립 머지 가능. Phase 1만 머지돼도 운영 부담 70% 해소.

---

## 5. 작업 항목

### Phase 1 — 담임용 수정 UI + UseCase (P0, 단일 PR)

**5.1 UseCase 메서드 신설** — `src/adapters/stores/useConsultationStore.ts`

- [ ] `updateSchedule(id, patch)` 추가
  - 시간(`dates`) · 유형(`type`) · 방법(`methods`) · 슬롯 길이(`slotMinutes`) · 제목 · 차단 슬롯 패치 가능
  - **기존 예약 보존 정책**: 패치로 인해 기존 예약이 가리키는 슬롯이 사라지면 → `affectedBookings[]` 반환 + UI가 사용자에게 결정 요청(취소 통지 or 재배정 안내)
  - shareUrl/adminKey/createdAt은 불변
- [ ] `rescheduleBooking(scheduleId, bookingId, newSlotId)` 추가
  - 기존 슬롯 `available`로 복구 + 새 슬롯 `booked`로 점유
  - 예약자 정보(암호화된 booker_info, memo) 보존
  - Supabase atomic 처리 (실패 시 롤백)
- [ ] `cancelBooking(scheduleId, bookingId, reason?)` 추가
  - `ConsultationSupabaseClient.cancelBooking()` 호출 + 로컬 store 상태 갱신
  - 취소 사유 옵션 (학부모 통지용)

**5.2 인프라 보강** — `src/infrastructure/supabase/ConsultationSupabaseClient.ts`

- [ ] `updateSchedule(id, patch)` 메서드 신규 (현재 부재)
- [ ] `rescheduleBooking(bookingId, newSlotId)` 트랜잭션 (booking row 업데이트 + 두 슬롯 상태 swap)

**5.3 담임 UI — 예약 카드 액션 추가** — `src/adapters/components/Homeroom/Consultation/ConsultationDetail.tsx:623-663`

- [ ] 액션 영역에 "시간 변경" 버튼 추가 → `RescheduleBookingModal` 오픈
- [ ] 액션 영역에 "취소" 버튼 추가 → `CancelBookingConfirmDialog` 오픈
- [ ] 두 버튼 모두 확인 다이얼로그 통과 후 실행, 결과 토스트 표시

**5.4 담임 UI — 일정 카드 편집 진입점** — `src/adapters/components/Homeroom/Consultation/ConsultationTab.tsx:148-197`

- [ ] `ConsultationCard`에 "수정" 버튼 추가 (공유 버튼 옆)
- [ ] `ConsultationEditModal` 신설 (`ConsultationCreateModal`을 기반으로 prefill + diff 기반 update 호출)
  - 기존 예약이 영향받는 변경(예: 시간대 축소)의 경우 경고 + 영향 예약 목록 표시
  - 사용자가 "그대로 진행" 선택 시 영향받는 예약은 자동 취소 + 통지 안내 메시지

**5.5 회귀 차단 메타테스트** — `src/adapters/stores/__tests__/useConsultationStore.test.ts`

- [ ] `updateSchedule` — schedule 메타 패치 시 기존 booking 보존
- [ ] `rescheduleBooking` — 슬롯 swap + 예약자 정보 보존
- [ ] `cancelBooking` — 예약 삭제 + 슬롯 상태 복구
- [ ] 도메인 메타테스트 — `ConsultationDetail.tsx`의 예약 카드 액션 영역에 "변경" "취소" 텍스트 또는 testId가 존재함을 정적 검사로 enforce (회귀 차단)

### Phase 2 — 슬롯 가용성 ↔ 일정표 동기화 (P1, 별도 PR)

**5.6 UseCase 추가** — `useConsultationStore`

- [ ] `recomputeSlotAvailability(scheduleId)` 추가
  - 현재 `useScheduleStore` 상태 + `useTimetableStore`(휴가·외부일정) 조회
  - 슬롯별 `(date, startTime)`이 차단 시간과 겹치면 `status='blocked'`로 전환, 기존 예약은 보존하되 충돌 플래그 표시
  - 멱등 (여러 번 호출해도 같은 결과)

**5.7 동기화 트리거**

- [ ] 일정표 변경 이벤트 구독: `useScheduleStore` mutate 시 활성 상담 일정 전체에 대해 `recomputeSlotAvailability` 호출 (debounce 1s)
- [ ] 학부모 예약 페이지 진입 시 fallback 재계산 호출 (서버 side `landing/src/components/booking/bookingApi.ts`에 endpoint 추가)
- [ ] ConsultationDetail 진입 시 fallback 재계산 호출

**5.8 충돌 감지 UI**

- [ ] ConsultationDetail에서 충돌 슬롯(예약 있는데 차단 시간과 겹침)을 시각적으로 강조 + 담임에게 "재배정 또는 취소" 액션 유도

**5.9 메타테스트**

- [ ] `recomputeSlotAvailability` 단위 테스트 — 차단 시간 추가 시 가용 슬롯이 blocked로 전환됨
- [ ] 예약 있는 슬롯은 절대 자동으로 status 변경되지 않음 (보존 정책)

### Phase 3 — 학부모 셀프 서비스 (P1, landing/ PR 분리)

**5.10 학부모 예약 조회 토큰**

- [ ] 예약 생성 시 booking-level token(`bookingKey`) 발급 (예: `nanoid(12)`)
- [ ] 예약 완료 화면에서 "내 예약 보기" 링크 안내: `/booking/:scheduleId/mine?token=...`
- [ ] (선택) 이메일·SMS 알림은 본 PDCA scope 밖

**5.11 학부모 "내 예약" 페이지** — `landing/src/app/booking/[id]/mine/page.tsx` 신설

- [ ] token으로 본인 예약 조회 (`bookingApi.getMyBooking(token)`)
- [ ] "시간 변경" → 가용 슬롯 목록 → `rescheduleBooking` 호출
- [ ] "취소" → 확인 후 `cancelBooking` 호출

**5.12 BookingPageContent 통합**

- [ ] `alreadyBooked` 상태에서 "내 예약 변경" 진입 링크 노출 (URL 해시 또는 LocalStorage의 booking token 활용)

---

## 6. 검증 게이트

```bash
npx tsc --noEmit              # TypeScript 에러 0개
npm run lint                  # ESLint 통과
npm run test                  # Vitest 통과 (메타테스트 포함)
npm run regression-check      # 회귀 체크 통과

# landing/ Phase 3
cd landing && npm run build   # Next.js 빌드 통과
```

### 수동 회귀 시나리오

**Phase 1**

- [ ] 담임이 상담 일정 생성 → 학부모 예약 → 담임이 "시간 변경" 버튼으로 다른 슬롯에 재배정 → 학부모 페이지에서 이전 슬롯 다시 가용으로 표시
- [ ] 담임이 "취소" 버튼으로 예약 취소 → 슬롯 가용 복구 + 학부모 페이지 반영
- [ ] 담임이 "일정 수정"으로 시간대 추가 → 새 슬롯 자동 생성, 기존 예약 보존
- [ ] 담임이 "일정 수정"으로 시간대 축소 → 영향 예약 경고 다이얼로그 표시

**Phase 2**

- [ ] 담임이 일정표에서 특정 시간을 휴가로 등록 → 활성 상담 일정의 해당 슬롯이 학부모 페이지에서 사라지거나 차단 상태로 표시
- [ ] 이미 예약 있는 슬롯과 새 휴가가 겹치면 → 담임 ConsultationDetail에 충돌 경고 표시

**Phase 3**

- [ ] 학부모가 예약 완료 후 "내 예약 보기" 링크 클릭 → 본인 예약 조회 + 변경/취소 가능
- [ ] 다른 학부모의 token으로는 접근 불가

---

## 7. 일정 (제안)

| Phase           | 항목                                       | 기간                             |
| --------------- | ------------------------------------------ | -------------------------------- |
| **Phase 1**     | 담임용 수정 UI + UseCase                   | 2026-05-19 ~ 2026-05-20 (1.5일)  |
| Phase 1         | Plan 승인 → Design → Do → Analyze → Report | 동일                             |
| **Phase 2**     | 일정표 동기화                              | Phase 1 머지 후 1일              |
| **Phase 3**     | 학부모 셀프 서비스                         | Phase 2 머지 후 1~2일            |
| **묶음 릴리즈** | v2.0.6 패치 또는 v2.1.0 마이너             | Phase 1 완료 직후 우선 출시 가능 |

Phase 1만 우선 v2.0.6 패치로 출시하고, Phase 2/3은 후속 릴리즈로 분리 가능.

---

## 8. Out of Scope

- 학부모에게 변경/취소 알림을 자동 발송하는 이메일·SMS 시스템 (별도 PDCA — 비용·인프라 검토 필요)
- 상담 예약 외 다른 도메인(설문, 과제 수합)의 유사 수정 UX 통일 (디자인 시스템 차원의 별도 PDCA)
- ConsultationCreateModal과 ConsultationEditModal 코드 공유 리팩토링 (Phase 1 머지 후 부채 정리)
- 모바일 PWA(m.ssampin.com) 담임 페이지의 상담 예약 수정 — 현재 모바일은 조회 위주, 별도 검토 필요

---

## 9. 리스크 및 완화

| 리스크                                            | 완화                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `updateSchedule`이 기존 예약을 잘못 무효화        | 영향 예약 사전 시뮬레이션 + 사용자 확인 다이얼로그 + 메타테스트로 회귀 차단                 |
| Supabase 트랜잭션 실패로 슬롯 상태 불일치         | `cancelBooking()`처럼 슬롯 복구 로직 명시, 실패 시 sentry/console.error 후 사용자 토스트    |
| 일정표 변경 → 슬롯 재계산이 무한 루프             | Phase 2 동기화에 debounce + 멱등성 보장 + 단방향 흐름 (일정표 → 슬롯)                       |
| 학부모 token 노출 시 타인이 예약 변경             | token은 URL 해시 또는 별도 endpoint로 전달, 서버 측 검증 필수, 12자리 이상 random           |
| 다중 세션 충돌 (CLAUDE.md 다중 세션 git 프로토콜) | feature/ 브랜치 작업, `git status` 확인 후 명시 경로 add만, 다른 세션 in-progress 파일 회피 |

---

## 10. 다음 액션

1. **본 Plan 승인** (사용자 확인)
2. `/pdca design consultation-edit-and-sync` — 설계 문서 작성 (Phase 1 우선)
3. `/pdca do consultation-edit-and-sync` — Phase 1 구현 (ssampin-develop 스킬 또는 수동)
4. `/pdca analyze consultation-edit-and-sync` — Gap 검증
5. Phase 1 완료 후 머지 → Phase 2 착수
