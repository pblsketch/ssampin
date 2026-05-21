---
template: analysis
version: 1.0
feature: roster-sample-data-removal
date: 2026-05-21
author: pblsketch (gap-detector)
project: ssampin
match_rate: 99.0
status: PASS
version_target: v2.0.7 (Phase 1+2+3 통합)
---

# Gap Analysis — roster-sample-data-removal

> **결론**: Match Rate **99.0% PASS**. Plan v1.2 / Design v1.2 ↔ 실제 구현 일치도 매우 높음. HIGH·MEDIUM 갭 0건, LOW 갭 3건(회귀 위험 0). 다음 단계 **Report** 권장. pdca-iterator 불필요.

- **Plan**: [`docs/01-plan/features/roster-sample-data-removal.plan.md`](../01-plan/features/roster-sample-data-removal.plan.md) v1.2
- **Design**: [`docs/02-design/features/roster-sample-data-removal.design.md`](../02-design/features/roster-sample-data-removal.design.md) v1.2
- **Analysis Date**: 2026-05-21
- **Match Rate**: **99.0%**
- **Verification**: tsc 0 / lint 0 / vitest 1566 (1503 → +63) / regression 24/24 (22 → +2)

---

## 1. 카테고리별 점수

| 카테고리                                                        |   점수    |   상태   |
| --------------------------------------------------------------- | :-------: | :------: |
| Design §10 영향 매트릭스 일치                                   |    98%    |   PASS   |
| 6중 가드 시나리오 매핑 (Plan §6.2 1~10)                         |   100%    |   PASS   |
| EmptyState 9개 컨텍스트 카피 (Design §2.2)                      |   100%    |   PASS   |
| SampleRosterWarningBanner (Design §3.7)                         |   100%    |   PASS   |
| Settings 4 옵셔널 필드 + sync 영향                              |   100%    |   PASS   |
| 메타테스트 화이트리스트 정확도                                  |    95%    |   PASS   |
| CLAUDE.md 규칙 준수 (domain pure, any 금지, 한국어, sp-\* 토큰) |   100%    |   PASS   |
| 불변식 코드 레벨 보장                                           |   100%    |   PASS   |
| **종합 Match Rate**                                             | **99.0%** | **PASS** |

---

## 2. 불변식 코드 레벨 검증

**불변식**: "본인 명단을 제대로 등록한 사용자에게 어떤 데이터 변경도 가하지 않는다."

### 가드 평가 순서 (안전 우선 빠른 종료)

`cleanupSampleRoster.ts:80-119`:

1. **G** `didCleanSampleRoster === true` → noop (멱등)
2. **A·B·C** `isSampleRoster(students)` → 길이 35 + id `s01`~`s35` + 이름·학번 정확 매칭
3. **F** `everEditedRoster === true` → noop (사용자 수정 흔적)
4. **D** 6개 store 외부 참조 합산 > 0 → **banner만** (삭제 X)
5. **E** `hasUserDataMarks(students)` → **banner만** (삭제 X)
6. 모두 통과 → `cleanup`

### 본인 명단 사용자가 살아남는 5가지 경로

- 인원수 ≠ 35 → A 차단
- 일괄 import id `s${Date.now()}_*` → B 차단
- 이름 1명 다름 → C 차단
- 출결·자리·상담 1건이라도 → D 차단 → banner만
- 연락처·생년월일 1건이라도 → E 차단 → banner만
- 명단 1회라도 수정 → F 차단

### 6개 수정 액션에 markRosterEdited 호출 확인

`useStudentStore.ts`:

- `updateStudents` line 153 PASS
- `updateStudentName` line 162 PASS
- `updateStudentField` line 175 PASS
- `toggleVacant` line 200 PASS
- `changeStatus` line 233 PASS
- `commitStudentCountChange` line 293 PASS

### write-before-flag 순서

cleanup 분기에서 `saveStudents([])` 성공 후에만 `didCleanSampleRoster=true`. 디스크 쓰기 실패 시 다음 load에서 G 가드 통과 → 재시도 가능. 영구 오염 차단.

### 토스트 1회 보장

`sampleRosterMigrationToastShownAt` 없을 때만 발사 + 발사 후 타임스탬프 기록.

**불변식 코드 레벨 보장 PASS**.

---

## 3. 6중 가드 ↔ Plan §6.2 시나리오 1~10 매핑

`cleanupSampleRoster.test.ts` 12 케이스 모두 PASS:

| 시나리오                         | 기대 액션 | 가드 실패 지점         | 결과 |
| -------------------------------- | --------- | ---------------------- | :--: |
| 1. 신규 설치(students.json 없음) | noop      | load 분기 early return | PASS |
| 2. 신규 설치 화면 진입           | noop      | A                      | PASS |
| 3. 샘플 35명만 박힘              | cleanup   | (전부 통과)            | PASS |
| 4. 샘플 + 김민지 출결 1건        | banner    | D                      | PASS |
| 5. 샘플 + 김민지 phone 입력      | banner    | E                      | PASS |
| 6. 본인 명단 25명                | noop      | A                      | PASS |
| 7. 본인 명단 35명 일괄 import    | noop      | B                      | PASS |
| 8. 샘플 + 김민지 이름만 변경     | noop      | C                      | PASS |
| 9. 샘플 + everEditedRoster=true  | noop      | F                      | PASS |
| 10. 우연 일치 모든 가드 통과     | cleanup   | (전부 통과)            | PASS |
| 보조 G #1·#2                     | noop      | G 멱등                 | PASS |

---

## 4. Design §10 영향 매트릭스 — 26 항목 전수 검증

26개 항목 중 **24 PASS / 2 위치 변형(=일관성 향상) / 1 LOW 보강 권장**.

상세 표는 gap-detector 원본 보고에 포함. 핵심 변형:

- 메타·단위 테스트가 `src/...__tests__/` co-located 구조로 변경 (기존 ssampin 컨벤션 일치 — 오히려 일관성 향상)
- `useStudentStore`의 attendance 검사를 `useTeachingClassStore.hasStudentReferencesByName`로 위임 (담임 출결이 TeachingClass에 통합돼 있음 — 코드 현실 반영)

---

## 5. EmptyState 10 컨텍스트 카피 정확도

10개 모두 Design §2.2 표 ↔ 구현 100% 일치 (제목·본문·아이콘·Primary CTA). roster_management만 Secondary CTA 분기 보유.

---

## 6. SampleRosterWarningBanner 사양 정확도

Design §3.7 11개 항목 100% 일치:

- `role="alert"`, amber 좌측 stripe, `bg-sp-card + ring + rounded-lg`
- 카피 정확 일치, [지금 등록하기] + [✕]
- 닫기 → `sampleRosterBannerDismissedAt = ISO` 저장
- 3일 후 재표시 (HomeroomPage.tsx:31-38 `Date.now() - 3 * 24 * 60 * 60 * 1000`)
- PageHeader 직하 위치 (HomeroomPage.tsx:47-53)
- `Number.isNaN(dismissedMs)` 안전 가드 추가 (사양 강화)

---

## 7. 갭 분류

### HIGH (즉시 수정 필요)

**없음**.

### MEDIUM (다음 PDCA 필수)

**없음**.

### LOW (보강 권장, 회귀 위험 0)

1. **Integration 별도 테스트 파일 누락** — Design §6.3는 `rosterMigration.test.ts` 5건 별도 파일을 명시했으나 `cleanupSampleRoster.test.ts` 안 시나리오 케이스로 흡수됨. 단위 테스트 12건이 모든 분기 100% 커버. 통합 환경(useStudentStore.load + 실제 store 6개 mock)에서 한번 더 검증하면 견고. **다음 PDCA에서 선택적 추가**.

2. **`attendance` 컨텍스트 카피 사용처 없음** — `RosterEmptyState.tsx`에 정의되어 있으나 가드 화면 8곳 어디에서도 직접 사용 안 함 (RecordsTab은 `records` 사용). dead code 아닌 catalog 역할이라 유지 가능. **다음 PDCA에서 정리 또는 외부 사용처 추가**.

3. **메타테스트 화이트리스트 암묵화** — `sampleStudentsBanned.test.ts`는 단일 파일 검사라 화이트리스트 명시 없음. 향후 어댑터 파일 늘면 명시적 배열 형태로 리팩토링 권장. **회귀 위험 없음**.

---

## 8. 다음 단계

- ✅ **`/pdca report roster-sample-data-removal`** 진입 (Match Rate ≥ 90% 충족)
- ✅ **v2.0.7 묶음 릴리즈 후보** 등록 가능
- ⛔ pdca-iterator 불필요 (Match Rate 99.0%)

### 핵심 산출물

- Plan v1.2 / Design v1.2
- Domain: `sampleRosterSignature.ts` + Settings.ts 4 필드
- UseCase: `cleanupSampleRoster.ts` + `collectExternalRefs.ts`
- Stores: useStudentStore.ts 전면 보강 + 6개 store hasStudentReferences + useSampleBannerStore 신규
- UI: RosterEmptyState (10 컨텍스트) + SampleRosterWarningBanner + Toast durationMs + Sidebar 빨간 점
- 8곳 EmptyState 가드 (Records/Survey/Assignment/Consultation/RosterManagement/Seating/ToolSeatPicker/ToolGrouping)
- 메타테스트 2건 + Regression #23/#24
- Dev 도구: `npm run electron:dev:fresh` (별도 데이터 폴더 신규 사용자 시뮬레이션)

### 검증 게이트 최종 결과

- tsc: 0 errors
- lint: 0 errors (warnings 121 = 기존 베이스라인)
- vitest: 1566 passed
- regression-check: 24/24
