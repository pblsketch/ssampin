# Analysis — Modal Scroll Overflow Fix

- **작성일**: 2026-05-19
- **Plan 문서**: [docs/01-plan/features/modal-scroll-overflow-fix.plan.md](../01-plan/features/modal-scroll-overflow-fix.plan.md)
- **Match Rate**: **97%**

---

## 1. Plan → Do Gap 표

| Plan 항목                                                   | 실제 구현           | 일치 | 비고                                                                                                                                                                                    |
| ----------------------------------------------------------- | ------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AssignmentCreateModal.tsx:133 `flex-1 min-h-0` 추가         | ✅ 완료             | 100% | line 133 그대로 패치                                                                                                                                                                    |
| SurveyCreateModal.tsx:233 동일 패치                         | ✅ 완료             | 100% | line 233 그대로 패치                                                                                                                                                                    |
| Schedule/CategoryManagementModal.tsx:370                    | ✅ 완료             | 100% |                                                                                                                                                                                         |
| Schedule/DayScheduleModal.tsx:131                           | ✅ 완료             | 100% |                                                                                                                                                                                         |
| Timetable/NeisImportModal.tsx:259                           | ✅ 완료             | 100% |                                                                                                                                                                                         |
| Todo/TodoCategoryModal.tsx:83                               | ✅ 완료             | 100% |                                                                                                                                                                                         |
| StudentRecords/RecordCategoryManagementModal.tsx:59         | ✅ 완료             | 100% |                                                                                                                                                                                         |
| Homeroom/shared/ExportModal.tsx:79                          | ✅ 완료             | 100% |                                                                                                                                                                                         |
| Homeroom/RosterImport/StudentCountReduceConfirmModal.tsx:76 | ✅ 완료             | 100% |                                                                                                                                                                                         |
| Seating/SeatZoneModal.tsx:119                               | ✅ 완료             | 100% |                                                                                                                                                                                         |
| Export/ExportPreviewModal.tsx:52                            | ✅ 완료             | 100% |                                                                                                                                                                                         |
| Tools/Sticker/StickerAddPickerModal.tsx:36                  | ✅ 완료             | 100% |                                                                                                                                                                                         |
| Tools/Sticker/StickerSettingsModal.tsx:92                   | ✅ 완료             | 100% |                                                                                                                                                                                         |
| 메타테스트 작성 (회귀 차단)                                 | ✅ 완료             | 100% | [modalScrollOverflow.meta.test.ts](../../src/adapters/components/common/__tests__/modalScrollOverflow.meta.test.ts) — Modal 베이스 보존 + 13개 모달 height 컨텍스트 검증 (14 assertion) |
| dlekthf0109@naver.com 회신                                  | ⏳ 사용자 행동 필요 | —    | 사용자 안내 메시지 준비됨                                                                                                                                                               |

**일치 항목 14/14 = 100% (코드 변경 기준)**
**전체 Match Rate**: 사용자 회신 단계 제외 시 100%, 포함 시 14/15 = 93% → **종합 97%**.

---

## 2. 검증 게이트 결과

| 게이트                     | 결과    | 비고                                                  |
| -------------------------- | ------- | ----------------------------------------------------- |
| `npx tsc --noEmit`         | ✅ 통과 | 출력 없음 = 에러 0건                                  |
| `npm run lint`             | ✅ 통과 | 0 errors, 118 warnings (pre-existing, 본 패치와 무관) |
| `npm run test`             | ✅ 통과 | 1156/1156 (메타테스트 14건 신규 포함)                 |
| `npm run regression-check` | ✅ 통과 | 9/9                                                   |

---

## 3. 변경 사항

### 3.1 코드 변경 — 13개 파일, 각 +1/-1

```
src/adapters/components/Export/ExportPreviewModal.tsx                   | 2 +-
src/adapters/components/Homeroom/RosterImport/StudentCountReduceConfirmModal.tsx | 2 +-
src/adapters/components/Homeroom/Survey/SurveyCreateModal.tsx           | 2 +-
src/adapters/components/Homeroom/shared/ExportModal.tsx                 | 2 +-
src/adapters/components/Schedule/CategoryManagementModal.tsx            | 2 +-
src/adapters/components/Schedule/DayScheduleModal.tsx                   | 2 +-
src/adapters/components/Seating/SeatZoneModal.tsx                       | 2 +-
src/adapters/components/StudentRecords/RecordCategoryManagementModal.tsx| 2 +-
src/adapters/components/Timetable/NeisImportModal.tsx                   | 2 +-
src/adapters/components/Todo/TodoCategoryModal.tsx                      | 2 +-
src/adapters/components/Tools/Assignment/AssignmentCreateModal.tsx      | 2 +-
src/adapters/components/Tools/Sticker/StickerAddPickerModal.tsx         | 2 +-
src/adapters/components/Tools/Sticker/StickerSettingsModal.tsx          | 2 +-
```

각 파일에서 동일 패턴: `<div className="flex flex-col">` → `<div className="flex flex-col flex-1 min-h-0">`.

### 3.2 신규 파일

- [src/adapters/components/common/**tests**/modalScrollOverflow.meta.test.ts](../../src/adapters/components/common/__tests__/modalScrollOverflow.meta.test.ts) — 회귀 차단 메타테스트

---

## 4. 검증 시나리오 — 수동 회귀

해당 환경에서 수동 검증해야 할 항목:

- [ ] 과제 수합 모달에 항목/옵션 다수 추가 → 본문 스크롤 동작, "과제 생성" 버튼 항상 노출
- [ ] 설문/체크리스트 모달에 질문 10개 + 선택형 옵션 5개씩 → 본문 스크롤 동작, "만들기" 버튼 항상 노출
- [ ] 1366×768 / 1920×1080 / 작은 노트북 viewport에서 13개 모달 모두 정상 동작 확인
- [ ] 모바일 PWA(m.ssampin.com) 영향 없음 (별도 코드베이스, 변경 없음)

---

## 5. 잠재적 위험

### 5.1 회귀 가능성

- 메타테스트가 `<Modal …>` 직속 첫 `<div className="…">` 패턴에 매칭한다. 모달 wrapping 구조가 크게 바뀌면 (예: Fragment, Conditional render) 매칭이 실패할 수 있음. 그 경우 메타테스트 자체가 fail → 명시적 가시화되므로 수용 가능한 위험.
- 새 모달이 같은 패턴을 채택할 때 `MODALS_TO_GUARD` 목록 등록을 잊으면 회귀가 다시 발생할 수 있음 → 메타테스트 헤더 주석에 명시.

### 5.2 Out of Scope

- Modal 베이스 자체에 `flex-1 min-h-0` wrapper를 추가하는 옵션 C는 별도 PDCA로 분리 (28개 모달 사용처 전수 회귀 검증 필요).
- 모바일 PWA의 동일 패턴 모달은 별도 코드베이스(src/mobile), 이번 scope 밖.

---

## 6. 결론

- ✅ 사용자 신고된 두 모달(Assignment, Survey)의 사용 불능 상태 해소.
- ✅ 동일 위험 패턴 11개 모달도 함께 패치하여 같은 회귀 소스를 차단.
- ✅ 메타테스트로 향후 회귀 사전 차단.
- ⏳ dlekthf0109@naver.com 회신은 사용자 행동 (Claude 가 발송하지 않음).
- 📌 v2.0.6 패치 릴리즈 후보. 다른 보류 항목(drop-crash-fix 등)과 묶음 릴리즈도 가능.
