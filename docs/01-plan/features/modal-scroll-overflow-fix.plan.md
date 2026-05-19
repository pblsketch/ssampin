# Plan — Modal Scroll Overflow Fix (핫픽스)

- **작성일**: 2026-05-19
- **우선순위**: 🔴 P0 (핫픽스)
- **트리거**: 사용자 신고 (dlekthf0109@naver.com, 2026-05-19 09:26 KST)
- **영향 버전**: v2.0.5 (전 버전 공통)

---

## 1. 사용자 신고 요약

**증상**

수업관리 > 설문/체크리스트와 과제 수합 두 탭에서 모달 안에 옵션·항목을 길게 추가하면 스크롤바가 생기지 않고 하단 "만들기" 버튼이 화면 밖으로 밀려나 클릭이 불가능하다. 과제 수합은 사실상 사용 불능 상태이며, 사용자가 대안으로 사용 중인 설문/체크리스트도 같은 증상이 발생한다.

**재현 경로**

1. 수업관리 진입 → 과제 수합 또는 설문/체크리스트 탭
2. "새로 만들기"로 모달 오픈
3. 항목/옵션을 다수 추가 (예: 질문 10개 이상 + 선택형 옵션 다수)
4. 모달이 viewport 높이를 초과 → 내부 스크롤이 작동하지 않고 footer가 잘려 사라짐

---

## 2. 근본 원인 분석

### 2.1 Modal 베이스 컴포넌트 ([src/adapters/components/common/Modal.tsx:97-101](src/adapters/components/common/Modal.tsx#L97-L101))

```tsx
className={[
  'bg-sp-card border border-sp-border rounded-xl shadow-sp-lg ring-1 ring-white/5 overflow-hidden flex flex-col',
  'animate-scale-in motion-reduce:animate-none',
  SIZE_CLASS[size],
  'max-h-[calc(100vh-48px)]',
  panelClassName,
].filter(Boolean).join(' ')}
```

패널은 이미 `flex flex-col + max-h-[calc(100vh-48px)] + overflow-hidden`을 갖는다. 이는 올바른 설계다.

### 2.2 문제 모달의 wrapping 패턴

**AssignmentCreateModal.tsx:133** 과 **SurveyCreateModal.tsx:233** 둘 다:

```tsx
<Modal isOpen onClose={onClose} size="xl">
  <div className="flex flex-col">         {/* ← 높이 제약 없음, flex-1 없음 */}
    <div ...>Header</div>
    <div className="flex-1 overflow-y-auto ...">Body</div>
    <div ...>Footer (만들기 버튼)</div>
  </div>
</Modal>
```

이 wrapping div는:

- 부모(panel)가 `flex flex-col`이므로 panel의 flex child가 된다.
- 그러나 자신은 `flex-1`도 `min-h-0`도 없으므로 panel의 잔여 flex 공간을 차지하지 못하고 본인 content 높이만큼만 차지하려 한다.
- 결과: 자식의 `flex-1 overflow-y-auto`는 작동할 컨테이너 높이가 없어 발현되지 않는다.
- content가 panel의 `max-h-[calc(100vh-48px)]`를 초과하면 panel의 `overflow-hidden`이 footer를 잘라낸다.

### 2.3 정상 패턴 비교 (ClassSurveyTab.tsx:178 — SurveyCopyModal)

```tsx
<div className="flex flex-col max-h-[70vh]">
```

`max-h`를 명시하여 자체 높이 컨텍스트를 만들어 우회. 동작은 하지만 panel의 `max-h-[calc(100vh-48px)]`와 중복이며 차선책이다.

---

## 3. 영향 범위 — 같은 위험 패턴 모달 13개

전수 grep 결과 동일한 wrapping 패턴(`<Modal>` → `<div className="flex flex-col">` 직속)을 가진 모달:

| 파일                                                     | line | overflow-y-auto 사용 | 위험도        |
| -------------------------------------------------------- | ---- | -------------------- | ------------- |
| 🚨 Tools/Assignment/AssignmentCreateModal.tsx            | 133  | ✅                   | **확정 버그** |
| 🚨 Homeroom/Survey/SurveyCreateModal.tsx                 | 233  | ✅                   | **확정 버그** |
| Schedule/CategoryManagementModal.tsx                     | 370  | ✅                   | 잠재          |
| Schedule/DayScheduleModal.tsx                            | 131  | ✅                   | 잠재          |
| Timetable/NeisImportModal.tsx                            | 259  | ✅                   | 잠재          |
| Todo/TodoCategoryModal.tsx                               | 83   | ✅                   | 잠재          |
| StudentRecords/RecordCategoryManagementModal.tsx         | 59   | ✅                   | 잠재          |
| Homeroom/shared/ExportModal.tsx                          | 79   | ✅                   | 잠재          |
| Homeroom/RosterImport/StudentCountReduceConfirmModal.tsx | 76   | ✅                   | 잠재          |
| Seating/SeatZoneModal.tsx                                | 119  | ✅                   | 잠재          |
| Export/ExportPreviewModal.tsx                            | 52   | ✅                   | 잠재          |
| Tools/Sticker/StickerAddPickerModal.tsx                  | 36   | ❌                   | 낮음          |
| Tools/Sticker/StickerSettingsModal.tsx                   | 92   | ❌                   | 낮음          |

---

## 4. 솔루션 비교

### 옵션 A — wrapping div에 `flex-1 min-h-0` 추가 (선택)

```tsx
<div className="flex flex-col flex-1 min-h-0">
```

- ✅ panel의 `max-h-[calc(100vh-48px)]`를 자동 상속
- ✅ 자식 `flex-1 overflow-y-auto`가 정상 발현
- ✅ 최소 변경, 회귀 위험 낮음
- ✅ 표준 Tailwind flex layout 패턴

### 옵션 B — wrapping div 자체 제거

Modal의 직접 자식으로 Header/Body/Footer를 평탄화.

- ✅ 가장 깔끔
- ⚠️ Modal 베이스의 `h2 srOnly` 처리와 children 순서 의존성 검증 필요
- ⚠️ 13개 모달 모두 영향 → 회귀 범위 큼

### 옵션 C — Modal 베이스 자체에서 children wrapper 추가

```tsx
// Modal.tsx
<div className="flex-1 min-h-0 flex flex-col">{children}</div>
```

- ✅ 모든 사용처가 자동 혜택
- ⚠️ 28개 모달 사용처 전수 회귀 검증 필요
- ⚠️ Modal 베이스 변경은 risk multiplier

### 결정 — 옵션 A + 옵션 C(베이스 보강) 조합

핫픽스(옵션 A)는 즉시 두 신고 모달에 적용하여 사용자 영향 해소. 잠재 위험 11개 모달도 옵션 A를 일괄 적용한다. Modal 베이스 보강(옵션 C)은 회귀 검증 후 별도 PDCA로 분리해 다음 릴리즈에서 검토(이번 핫픽스 scope 밖).

---

## 5. 작업 항목

### Phase 1 — 핫픽스 (즉시)

- [ ] `AssignmentCreateModal.tsx:133`: `<div className="flex flex-col">` → `<div className="flex flex-col flex-1 min-h-0">`
- [ ] `SurveyCreateModal.tsx:233`: 동일 패치
- [ ] `flex-1 min-h-0` 패턴을 다른 11개 모달에도 일괄 적용 (동일 회귀 차단)
  - Schedule/CategoryManagementModal.tsx
  - Schedule/DayScheduleModal.tsx
  - Timetable/NeisImportModal.tsx
  - Todo/TodoCategoryModal.tsx
  - StudentRecords/RecordCategoryManagementModal.tsx
  - Homeroom/shared/ExportModal.tsx
  - Homeroom/RosterImport/StudentCountReduceConfirmModal.tsx
  - Seating/SeatZoneModal.tsx
  - Export/ExportPreviewModal.tsx
  - Tools/Sticker/StickerAddPickerModal.tsx
  - Tools/Sticker/StickerSettingsModal.tsx

### Phase 2 — 회귀 차단 메타테스트

- [ ] `src/adapters/components/common/__tests__/Modal.overflow.test.tsx` 신규
  - Modal 안에 매우 긴 content를 넣었을 때 footer가 viewport 안에 보이는지 검증
  - jsdom에서는 layout 검증이 어려우므로 className 패턴 검증(메타테스트)으로 회귀 차단:
    - "Modal 직속 wrapping div는 `flex-1 min-h-0` 또는 `max-h-*`를 갖는다"
    - 13개 위험 후보 파일에서 패턴 enforce

### Phase 3 — 사용자 회신

- [ ] dlekthf0109@naver.com 회신: 접수 확인 + 수정 일정 안내

---

## 6. 검증 게이트

```bash
npx tsc --noEmit              # TypeScript 에러 0개
npm run lint                  # ESLint 통과
npm run test                  # Vitest 통과 (메타테스트 포함)
npm run regression-check      # 회귀 체크 통과
```

### 수동 회귀 시나리오

- [ ] 과제 수합 모달에 옵션 다수 추가 → 본문 스크롤 작동, "과제 생성" 버튼 항상 노출
- [ ] 설문/체크리스트 모달에 질문 10개 + 선택형 옵션 5개씩 → 본문 스크롤 작동, "만들기" 버튼 항상 노출
- [ ] 패치한 11개 잠재 위험 모달도 viewport 1366×768 / 1920×1080 환경에서 정상 동작 확인
- [ ] 모바일 PWA(m.ssampin.com)에서 영향 없음 확인 (모바일은 별도 컴포넌트)

---

## 7. 일정

- 2026-05-19 12:30 — Plan 승인
- 2026-05-19 13:00 — Do (Phase 1 + Phase 2)
- 2026-05-19 14:00 — 검증 게이트
- 2026-05-19 14:30 — Analyze (Gap)
- 2026-05-19 15:00 — Report + 사용자 회신
- 2026-05-19 또는 익일 — v2.0.6 패치 릴리즈 (필요시)

---

## 8. Out of Scope

- Modal 베이스 컴포넌트 자체 보강 (옵션 C) — 별도 PDCA
- 모달 디자인 토큰 통일 (max-h, sizes) — 디자인 시스템 차원의 작업
- 모바일 PWA의 동일 패턴 모달 — 별도 코드베이스(src/mobile)
