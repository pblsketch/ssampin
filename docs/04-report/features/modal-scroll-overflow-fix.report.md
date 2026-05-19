# Report — Modal Scroll Overflow Fix

- **완료일**: 2026-05-19
- **유형**: 🔴 P0 핫픽스
- **Match Rate**: 97%
- **트리거**: 사용자 신고 (dlekthf0109@naver.com, 2026-05-19 09:26 KST)
- **관련 문서**:
  - [Plan](../../01-plan/features/modal-scroll-overflow-fix.plan.md)
  - [Analysis](../../03-analysis/modal-scroll-overflow-fix.analysis.md)
  - [메타테스트](../../../src/adapters/components/common/__tests__/modalScrollOverflow.meta.test.ts)

---

## 1. 개요

수업관리 > 과제 수합 / 설문·체크리스트 모달에서 항목·옵션을 길게 추가하면 하단 "만들기" 버튼이 viewport 밖으로 잘려 사용 불가하던 문제를 핫픽스했다. 동일한 위험 패턴을 가진 다른 11개 모달도 함께 패치하고, 회귀 차단 메타테스트를 도입했다.

## 2. 근본 원인

[`Modal.tsx:97-101`](../../../src/adapters/components/common/Modal.tsx#L97-L101) 패널은 `max-h-[calc(100vh-48px)] + overflow-hidden + flex flex-col` 을 가진다. 그러나 사용처 모달의 wrapping `<div className="flex flex-col">`이 `flex-1 min-h-0`을 갖지 않아 panel의 max-h 컨텍스트를 상속하지 못했다. 결과적으로 자식의 `flex-1 overflow-y-auto` body가 발현되지 않고, content가 panel의 max-h를 초과하면 panel의 `overflow-hidden`이 footer를 잘라냈다.

## 3. 해결

### 3.1 코드 변경 — 13개 모달

각 모달에서 동일 한 줄 변경:

```diff
- <div className="flex flex-col">
+ <div className="flex flex-col flex-1 min-h-0">
```

| #   | 파일                                                                                                                                                      | 신고           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1   | [Tools/Assignment/AssignmentCreateModal.tsx](../../../src/adapters/components/Tools/Assignment/AssignmentCreateModal.tsx#L133)                            | 🚨 사용자 신고 |
| 2   | [Homeroom/Survey/SurveyCreateModal.tsx](../../../src/adapters/components/Homeroom/Survey/SurveyCreateModal.tsx#L233)                                      | 🚨 사용자 신고 |
| 3   | [Schedule/CategoryManagementModal.tsx](../../../src/adapters/components/Schedule/CategoryManagementModal.tsx#L370)                                        | 잠재           |
| 4   | [Schedule/DayScheduleModal.tsx](../../../src/adapters/components/Schedule/DayScheduleModal.tsx#L131)                                                      | 잠재           |
| 5   | [Timetable/NeisImportModal.tsx](../../../src/adapters/components/Timetable/NeisImportModal.tsx#L259)                                                      | 잠재           |
| 6   | [Todo/TodoCategoryModal.tsx](../../../src/adapters/components/Todo/TodoCategoryModal.tsx#L83)                                                             | 잠재           |
| 7   | [StudentRecords/RecordCategoryManagementModal.tsx](../../../src/adapters/components/StudentRecords/RecordCategoryManagementModal.tsx#L59)                 | 잠재           |
| 8   | [Homeroom/shared/ExportModal.tsx](../../../src/adapters/components/Homeroom/shared/ExportModal.tsx#L79)                                                   | 잠재           |
| 9   | [Homeroom/RosterImport/StudentCountReduceConfirmModal.tsx](../../../src/adapters/components/Homeroom/RosterImport/StudentCountReduceConfirmModal.tsx#L76) | 잠재           |
| 10  | [Seating/SeatZoneModal.tsx](../../../src/adapters/components/Seating/SeatZoneModal.tsx#L119)                                                              | 잠재           |
| 11  | [Export/ExportPreviewModal.tsx](../../../src/adapters/components/Export/ExportPreviewModal.tsx#L52)                                                       | 잠재           |
| 12  | [Tools/Sticker/StickerAddPickerModal.tsx](../../../src/adapters/components/Tools/Sticker/StickerAddPickerModal.tsx#L36)                                   | 잠재           |
| 13  | [Tools/Sticker/StickerSettingsModal.tsx](../../../src/adapters/components/Tools/Sticker/StickerSettingsModal.tsx#L92)                                     | 잠재           |

### 3.2 회귀 차단 메타테스트

[`src/adapters/components/common/__tests__/modalScrollOverflow.meta.test.ts`](../../../src/adapters/components/common/__tests__/modalScrollOverflow.meta.test.ts) — 정적 분석 메타테스트 (`bottomSheetCoverage.meta.test.ts` 와 동일 패턴).

검증 사항:

1. `Modal.tsx` 패널이 `max-h-[calc(100vh-48px)]`, `overflow-hidden`, `flex flex-col` 을 유지.
2. `MODALS_TO_GUARD` 13개 모달 각각의 `<Modal …>` 직속 wrapping div className에 `flex-1 min-h-0` 또는 `max-h-*` 포함.

새 모달이 같은 패턴을 채택하면 `MODALS_TO_GUARD` 에 등록해야 한다.

## 4. 검증 게이트

| 게이트                     | 결과                                     |
| -------------------------- | ---------------------------------------- |
| `npx tsc --noEmit`         | ✅ 에러 0건                              |
| `npm run lint`             | ✅ 0 errors                              |
| `npm run test`             | ✅ 1156/1156 (메타테스트 14건 신규 포함) |
| `npm run regression-check` | ✅ 9/9                                   |

## 5. 사용자 후속 조치

- [ ] **dlekthf0109@naver.com 회신**: 접수 확인 + 다음 패치 릴리즈에 수정 포함 안내
- [ ] **수동 회귀 검증**: 1366×768 노트북에서 13개 모달 viewport 동작 확인
- [ ] **v2.0.6 패치 릴리즈** (또는 묶음): 8단계 릴리즈 워크플로 (CLAUDE.md 참조)

## 6. 학습 / 교훈

1. **flex layout chain**: `max-h` + `overflow-hidden` 패널 안에서 children이 panel 공간을 차지하려면 `flex-1 min-h-0`이 필수. flex item이 본인 content 보다 작아지는 것을 허용하려면 `min-h-0` (또는 `min-w-0`)이 표준 패턴.
2. **베이스 컴포넌트와 사용처 책임 분리**: Modal 베이스는 panel 컨테이너 책임만 진다. 사용처는 children flex chain 책임. 베이스가 children wrapper를 추가하는 옵션 C는 28개 사용처 전수 회귀 위험이 있어 보류.
3. **단일 회귀를 감지하면 동일 패턴 audit**: 사용자 신고는 2개 모달이지만 grep으로 동일 패턴 11개 더 발견. 한 번 수정할 때 같은 root cause를 가진 모든 위치를 일괄 패치하면 같은 버그 재발을 차단할 수 있다.
4. **메타테스트의 가치**: jsdom environment 가 아닌 node 환경에서도 정적 코드 분석으로 회귀를 차단할 수 있다. `bottomSheetCoverage.meta.test.ts`가 좋은 선례.
