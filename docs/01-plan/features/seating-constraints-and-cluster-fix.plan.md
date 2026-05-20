# Plan: 자리배치 핫픽스 — 배치 조건 미적용 + 모둠 학생 "알 수 없음"

- **생성일**: 2026-05-20
- **타입**: 핫픽스 (사용자 신고)
- **우선순위**: P0 (실제 학급 운영 차질)
- **신고자**: pblsketch (제품 오너)
- **신고 시점**: 2026-05-20 freestyle-seating Phase 5a 완료 직후
- **스코프 확정 (2026-05-20)**: 결함 1은 사용자가 재시도 후 해결 확인. "추가" 버튼 미클릭(가설 A)으로 판정. UX 보강은 별도 PDCA 로 미루고 **본 핫픽스는 결함 2만 수정**.

---

## 1. 문제 정의

격자(grid) 모드의 학급 자리배치도에서 두 가지 결함이 동시에 보고됨.

### 결함 1 — 배치 조건이 자리 바꾸기에 반영되지 않음

- **재현 단계**
  1. 담임 업무 → 자리배치 → "격자" 모드 (24명, 6열 × 4행)
  2. 상단 "배치 조건" 버튼으로 SeatZoneModal 오픈
  3. "좌석 고정" 탭에서 특정 학생을 특정 좌표로 고정 (예: 5번 정수빈 → (1,1))
     혹은 "영역 고정" 탭에서 앞단/뒷단 등 영역 지정
  4. 모달 닫고 상단 "자리 바꾸기" 클릭 → 확인
- **기대**: 셔플 결과에서 고정된 학생이 지정 좌석/영역에 그대로 있어야 함.
- **실제**: 조건이 무시되고 무작위로 섞임.

### 결함 2 — 모둠 화면에서 학생이 "알 수 없음"으로 표시되고 미배정 목록에 잔존

- **재현 단계**
  1. 격자 모드에서 24명 배치 완료
  2. 상단 "모둠" 탭으로 전환
- **기대**: 모둠 카드 각 슬롯에 격자 순서대로 학생 이름/번호가 표시.
- **실제**: 4 모둠 × 6/6 슬롯이 전부 "?" + "알 수 없음" 라벨로 표시되고,
  실제 학생 명단은 화면 하단 "미배정 학생" 영역에 그대로 남음.

---

## 2. 근본 원인 가설 (코드 정독 기반)

### 결함 2 — 거의 확정

`useSeatingStore.changeLayout('group')` 로직 (src/adapters/stores/useSeatingStore.ts:481-561):

```
if (sync && layout === 'group' && (!seating.groups || seating.groups.length === 0)) {
  // 연동 + 모둠 (최초): assignGroupsInOrder 로 자동 분배
} else if (sync && layout === 'grid' && seating.layout === 'group') {
  // 연동 + 격자: 모둠 → 격자
} else {
  // 비연동 또는 이미 groups 가 존재: 레이아웃만 전환
  const updated: SeatingData = { ...seating, layout };
}
```

세 가지 누락이 결합돼서 발생.

1. **비연동(sync=false) 모드에서 격자 → 모둠 전환 시 groups 가 자동 채워지지 않음.**
   기존 groups 가 비었거나 stale 한 채로 layout 만 'group' 으로 바뀜.
2. **`sanitizeSeating` 가 `groups` 를 정합화하지 않음.**
   명렬표 변경(syncFromRoster) 후에도 groups 의 stale studentIds 가 그대로 남음.
3. **`shuffleGroupSeating` 가 빈 모둠(groupCount=0) 처리 누락.**
   `seating.groups ?? []` 인데 groupCount = `Math.max(1, 0) = 1` 이라 1모둠에 24명을 라운드로빈으로 6명 채우고 나머지 18명은 maxSize 초과로 누락됨.

GroupSeatingView 의 `StudentChip` 은 `getStudent(studentId)?.name ?? '알 수 없음'` 으로 렌더하므로 stale ID 가 그대로 "알 수 없음"으로 보이고, `UnassignedStudents` 는 `allActiveStudentIds.filter(id => !assignedIds.has(id))` 로 실제 학생을 미배정으로 분류한다. **두 영역에 동시에 보이는 정확한 메커니즘이 확인됨.**

### 결함 1 — 후보 두 가지

코드 정독상 격자 모드의 `randomize()` 는 `RandomizeSeats` 유스케이스를 호출하고, 이 유스케이스는 `constraintsRepo.getConstraints()` → `shuffleSeatsWithConstraints()` 로 정상적으로 조건을 적용한다. 즉 코드 자체는 맞다. 그러면 실제 사용자가 보는 "조건 미적용"의 원인은 둘 중 하나:

- **A. 사용자가 SeatZoneModal 에서 "추가" 버튼을 누르지 않음.**
  스크린샷(이미지 1)을 보면 학생/좌표는 선택됐지만 화면 하단에는 여전히 "좌석 고정 조건이 없습니다." 가 표시됨. 즉 폼만 채우고 추가하지 않은 상태에서 모달을 닫고 셔플한 시나리오를 배제할 수 없다. **UX 결함 — "추가" 버튼 위치/문구가 명확하지 않다.**
- **B. 실제 코드 버그.** 예: `constraintsRepository` 가 영속화에 실패하거나, `addFixedSeat` 가 store만 갱신하고 repo 에는 저장 실패 후 무시. RandomizeSeats 가 repo 에서 다시 읽으면 빈 조건을 받게 됨.

Do 단계에서 Playwright MCP 로 실제 클릭 흐름을 재현해 어느 쪽인지 결판낸다.

---

## 3. 수정 범위

### 결함 2 수정 — 4단계

- **F2-1 (도메인)** — `seatRules.ts` 에 `sanitizeGroups(groups, activeIds, maxSize)` 순수 함수 추가.
  비활성/결번 학생 ID 제거 + 학생이 0개 남은 모둠 자체는 보존(빈 모둠 유지).
- **F2-2 (스토어)** — `sanitizeSeating` 가 `groups` 도 sanitize. `syncFromRoster` 가 변경 감지에 groups 도 포함.
- **F2-3 (스토어)** — `changeLayout('group')` 비연동 분기에서 `(groups undefined || groups.length === 0) && seats 에 학생 존재` 인 경우 `assignGroupsInOrder` 로 자동 채움. 즉 비연동이어도 모둠이 비어 있으면 격자 학생으로 1회 초기화.
- **F2-4 (UI)** — `Seating.tsx confirmRandomize` 의 group 분기에서 `groupCount = Math.max(1, groups.length)` 를 `groupCount = groups.length > 0 ? groups.length : Math.ceil(totalStudents / 6)` 로 보정.

### 결함 1 수정 — 2단계 (Do 단계 분기)

- **재현 결과가 A (UX) 인 경우** — `SeatZoneModal` 에서 학생/좌표 선택 즉시 "추가" CTA 강조(예: 미리보기 박스에 "↓ 추가 버튼을 눌러야 저장됩니다" 안내, 추가 안 한 상태로 닫으려 하면 confirm).
- **재현 결과가 B (코드 버그) 인 경우** — 영속화 경로(`JsonSeatConstraintsRepository.saveConstraints`) + DI 와이어링 디버깅 후 수정.

두 경로 모두 **격자 셔플 직후 적용된 조건 위반 시 토스트가 이미 노출되므로**, 토스트 문구를 사용자가 더 명확히 인지하도록 한 줄 짜리 강화(예: "고정 좌석/영역이 만족되지 못했습니다 — 좌석 수를 늘리거나 조건을 재확인하세요")도 같이 검토.

---

## 4. 비-수정 (Out of Scope)

- 자유(freestyle) 모드의 제약조건 적용 — Phase 5b 별도 PDCA. 본 핫픽스는 격자 + 모둠만.
- 모둠 모드에서 셔플 시 제약조건 적용 — 본 핫픽스는 모둠 진입 시 학생 정합성 복구만. 모둠 셔플의 조건 적용은 Phase 5b 와 묶어서.
- ToolSeatPicker (자리 뽑기 도구) — 별도 컴포넌트. 본 핫픽스 대상 아님.

---

## 5. 검증 게이트

1. `npx tsc --noEmit` 에러 0
2. `npm run lint` 에러 0 (경고 증가 0)
3. `npm run test` 전체 통과 + 결함 2 회귀 테스트 3건 신규
   - `useSeatingStore.changeLayout('group')` 비연동 + 빈 groups → assignGroupsInOrder 호출 확인
   - `sanitizeSeating` 가 stale studentIds 를 groups 에서도 제거하는지
   - `confirmRandomize` 그룹 분기 groupCount 보정 (totalStudents > maxSize, groups.length === 0)
4. `npm run regression-check` 통과
5. Playwright MCP 로 두 결함 수동 재현 → 수정 후 재현 불가 확인 (스크린샷 2건 첨부)

---

## 6. 일정

- Plan/Design (병합 가능 — 작은 작업): 1세션 (지금 ~ 30분)
- Do (결함 2 코드 + 결함 1 재현/수정): 1세션 (~ 90분)
- Analyze + Iterate (필요 시): 1세션 (~ 30분)
- Report: 짧게 (~ 15분)

총 ~ 3시간, 한 세션에서 가능.

---

## 7. 의존성 / 다른 세션과의 충돌

`main` 단일 워킹트리 정책. 현재 working tree 에는 freestyle-seating Phase 5a 미커밋분이 있음(PROGRESS.md 라인 23). 해당 변경은 그대로 두고, 본 핫픽스는 동일 파일 중 `useSeatingStore.ts` 와 `Seating.tsx` 의 다른 영역(grid/group 분기, sanitize)만 건드린다. 기존 freestyle 변경 영역은 손대지 않음. 충돌 위험은 낮으나 작업 전후 `git diff` 로 의도치 않은 영역 변경 0 확인.

---

## 8. 산출물

- 코드: useSeatingStore.ts, Seating.tsx, seatRules.ts, (조건부) SeatZoneModal.tsx
- 테스트: useSeatingStore.test.ts 회귀 3건 + seatRules.test.ts 1건
- 문서: 본 plan + design(짧게) + analysis + report
- 스크린샷: 수정 전 2장 (사용자 제공), 수정 후 2장 (Playwright MCP 캡처)
