---
template: plan
version: 1.2
feature: roster-sample-data-removal
date: 2026-05-21
author: pblsketch
project: ssampin
version_target: v2.0.7 (Phase 1+2+3 통합 — 사용자 결정 2026-05-21)
---

> **사용자 확정 사항 (2026-05-21)**:
>
> 1. **릴리즈 묶음**: v2.0.7에 Phase 1 + Phase 2 + Phase 3 통합
> 2. **외부 참조 있을 때 보수 정책**: 자동 삭제 안 함 + 상단 배너 경고만 (사용자 데이터 손실 0건 보장)
> 3. **EmptyState UI 디자인**: frontend-design 에이전트 1순위 호출 (Design 단계에서)
> 4. **마이그레이션 안내**: 토스트 5초 + 사이드바 배지 (가볍게 알리고 지속 유도)
> 5. **🔴 최우선 불변식 (v1.2 보강)**: 본인 명단을 제대로 등록한 사용자에게 어떤 데이터 영향도 가지 않는다. 이를 위해 마이그레이션은 6중 안전 가드(A·B·C·D·E·F) AND 조건으로만 동작한다.
> 6. **Open Question #5 (샘플 코드 처리)**: Design 단계에서 결정 — 후보: 완전 삭제 / docs/fixtures/ 이동

# Plan — 담임 명단 샘플 데이터 자동 채움 제거 + 기존 사용자 자동 정리

> **요약**: 사용자가 처음 앱을 켰을 때 "담임 업무 → 명렬 관리" 탭에 자기 학생이 아닌 김민지·이서연 등 35명의 샘플 명단이 자동으로 채워져 본인 학급으로 오인하는 사고의 근본 원인을 코드에서 제거한다. 신규 사용자는 빈 명단 + 안내 카드로 시작하고, 이미 샘플이 박혀버린 기존 사용자는 안전 가드를 거쳐 자동으로 정리한다.
>
> **사용자 영향 한 문장**: 앱을 처음 켜면 모르는 학생 35명이 보이지 않고, "우리 반 명단부터 등록해 보세요"라는 친절한 안내가 보인다. 이미 샘플이 박힌 사용자도 다음 실행에서 깔끔하게 정리된다.
>
> **Project**: ssampin (쌤핀)
> **Status**: v1.2 — 6중 안전 가드 보강 (2026-05-21)
> **우선순위**: 🔴 P0 (Phase 1) / 🟡 P1 (Phase 2) / 🟢 P2 (Phase 3)
> **트리거**: 사용자 피드백 dlekthf0109@naver.com — "담임 업무에 있는 학생들이 내 학생들이 아니야" (2026-05-21)

---

## 1. 사용자 신고 요약

### 1.1 증상

> "Q담임 업무에 있는 학생들이 내학생들이 아니야. 수동으로 수정 어떻게 해?"
> "2-4 담임인데, 2-4 명단은 내가 넣었어. 근데 담임 업무에서의 2-4 명단만 다른 이름이야."

### 1.2 재현 시나리오

1. 사용자가 쌤핀을 처음 설치하고 [학교/학급 정보]에서 학교명·학급명·교사명만 입력
2. (학생 명단을 어디서 입력해야 할지 몰라) 메인 화면의 [학급] 또는 [수업 관리]에 명단을 입력하거나, 아예 입력하지 않음
3. 어느 시점에 [담임 업무] 메뉴를 열어보면 **모르는 학생 35명**(김민지·이서연·박지민·최예은·정수빈…)이 자동으로 들어가 있음
4. 사용자는 이게 어디서 왔는지 모르고, 자기 학급에 다른 사람 명단이 들어왔다고 느낌

### 1.3 사용자가 입은 인지 부담

- 자기 학급 명단인 줄 알고 출결·기록을 그 위에 쌓다가 데이터 오염
- "수정하려면 어디 가야 하나"를 5단계 이상 추적해야 함 (사용자 피드백 대화 8턴)
- 챗봇 답변도 길을 못 찾고 "[설정 → 학교/학급 정보]에 학생 명단 수정란이 있다"고 잘못 안내 → 사용자 좌절

---

## 2. 근본 원인 분석 (이전 ultrawork 정밀 분석 결과 인용)

### 2.1 직접 원인 — students.json 부재 시 샘플 35명 자동 저장

[`src/adapters/stores/useStudentStore.ts:86-92`](e:/github/ssampin/src/adapters/stores/useStudentStore.ts#L86-L92)

```typescript
load() {
  const data = await studentRepository.getStudents()
  if (data === null) {
    await studentRepository.saveStudents(SAMPLE_STUDENTS)  // ← 35명을 디스크에 박음
    set({ students: SAMPLE_STUDENTS, loaded: true })
    return
  }
  // ...
}
```

[`useStudentStore.ts:12-48`](e:/github/ssampin/src/adapters/stores/useStudentStore.ts#L12-L48)에 정의된 `SAMPLE_STUDENTS`는 학번 1~35의 "1학년 2반" 가상 명단. 신규 설치 직후 담임 업무를 진입하면 [`RecordsTab.tsx:35-38`](e:/github/ssampin/src/adapters/components/Homeroom/Records/RecordsTab.tsx#L35-L38)에서 `load()`가 호출되며 이 샘플이 영구 저장된다.

### 2.2 기여 원인 — 3개로 분리된 학생 명단 저장소

| 저장소                  | 화면                         | 파일                    |
| ----------------------- | ---------------------------- | ----------------------- |
| `useStudentStore`       | 담임 업무 → 명렬 관리        | `students.json` ★       |
| `useTeachingClassStore` | 수업 관리 → 학급별 명렬 관리 | `teaching-classes.json` |
| `useClassRosterStore`   | 쌤도구 → 명단 선택기         | `class-rosters.json`    |

사용자가 [수업 관리]에 명단을 넣어도 담임 업무는 `students.json`만 보므로 샘플 35명이 그대로 노출됨. 이 3-store 구조 자체는 roster-data-consistency PDCA(v2.0.4)에서 "최소 침습" 원칙으로 의도적으로 유지된 결정([`design.md:40-41`](e:/github/ssampin/docs/02-design/features/roster-data-consistency.design.md#L40-L41)).

### 2.3 왜 PDCA(v2.0.4)에서 못 잡혔는가

roster-data-consistency는 **이미 입력된 명단의 정합성**(status↔isVacant 동기화, 일괄 import id 보존)에 집중했고, **빈 명단의 초기 상태**는 다루지 않았다. SAMPLE_STUDENTS 자동 채움은 "초기 사용자 경험을 위한 의도된 데모"로 그대로 두었으나, 실제로는 데모가 아니라 디스크에 영구 저장되는 폭탄이었다.

---

## 3. 목표 (Success Criteria)

### 3.1 사용자 가치

1. **신규 사용자**: 첫 진입 시 모르는 학생을 보지 않는다. "우리 반 명단을 등록하세요"라는 명확한 안내만 본다.
2. **기존 피해 사용자**: 다음 앱 실행에서 자동으로 샘플이 정리되고 1회성 안내를 받는다.
3. **본인 명단이 있는 사용자**: 어떤 변화도 느끼지 않는다 (마이그레이션이 자기 데이터를 건드리지 않음).

### 3.2 측정 가능한 기준

| 항목                                   | 기준                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| 신규 설치 후 첫 담임 업무 진입         | `students.json` 파일이 생기지 않거나 빈 배열로 생성. 화면에 RosterEmptyState 카드 표시. |
| 샘플 35명만 박힌 기존 사용자의 첫 진입 | 자동 정리 + 1회성 토스트. 자리배치·출결·과제 등 다른 화면에서도 빈 상태 안내.           |
| 샘플 위에 출결/기록을 쌓은 기존 사용자 | **삭제하지 않음**. 상단 배너 "이 명단이 샘플일 가능성이 있어요" 경고만 표시.            |
| 본인 명단이 있는 사용자                | 어떤 변화도 없음. 0건 회귀.                                                             |
| TypeScript 에러                        | 0개                                                                                     |
| Lint 에러                              | 0개                                                                                     |
| 신규 테스트                            | 15건 이상 (시그니처 매칭 + 외부 참조 검사 + EmptyState 렌더 + 마이그레이션 멱등성)      |
| 회귀 차단 메타테스트                   | 1건 추가 (SAMPLE_STUDENTS 재도입 시 CI 실패)                                            |

---

## 4. 비목표 (Non-Goals)

- 3-store 통합 (담임/수업반/쌤도구) — roster-data-consistency 후속 PDCA로 분리
- 수업반 → 담임반 역방향 명단 복사 액션 — 별도 PDCA
- 메뉴 라벨 변경 ("학교/학급 정보" → "학교 정보") — 별도 UX PDCA
- 온보딩 위자드 재설계 — 별도 PDCA
- 다기기 Google Drive 동기화 충돌 해결 — roster-data-consistency 부채로 인계

---

## 5. Phase Breakdown

### Phase 1 (P0 — 핫픽스): SAMPLE_STUDENTS 코드 제거 + 빈 상태 UI

**범위**:

- [`useStudentStore.ts:12-48`](e:/github/ssampin/src/adapters/stores/useStudentStore.ts#L12-L48) `SAMPLE_STUDENTS` 상수 삭제
- [`useStudentStore.ts:91-92`](e:/github/ssampin/src/adapters/stores/useStudentStore.ts#L91-L92) null 분기에서 `saveStudents(SAMPLE_STUDENTS)` 제거 → `set({ students: [], loaded: true })` 로 변경
- 신규 컴포넌트 `<RosterEmptyState>` 생성: 친절한 한글 안내 + "명단 등록하기" CTA (사이드바 [담임 업무] → [명렬 관리] 탭으로 이동)
- 학생 의존 화면 8곳 상단에 EmptyState 가드 (Records / Seating / Survey / Assignment / Roster / Consultation / SeatPicker / GroupShuffle)

**검증**: 신규 설치 후 첫 진입 시 빈 상태 카드 표시 확인.

**예상 작업량**: 1일

### Phase 2 (P1 — 마이그레이션): 기존 샘플 데이터 자동 정리 — 6중 안전 가드

**🔴 최우선 불변식**: 본인 명단을 제대로 등록한 사용자에게 어떤 데이터 변경도 가하지 않는다. 다음 6개 가드 **전부 AND 통과** 시에만 정리한다.

| 가드                                      | 검사 내용                                                                                                                                        | 본인 명단 등록 사용자가 살아남는 이유                                                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. 인원수 정확 매칭**                   | `students.length === 35`                                                                                                                         | 학급 인원이 35명 아니면 즉시 제외                                                                                                                                       |
| **B. id 패턴 정확 매칭**                  | 모든 학생 id가 `s01`~`s35` 집합과 정확 일치 (정렬 후 비교)                                                                                       | 일괄 import·인원수[+]로 만든 id는 `s${Date.now()}_${idx}` 형식 → 매칭 안 됨                                                                                             |
| **C. 이름·학번·grade·classNum 100% 일치** | 35명 모두 SAMPLE_STUDENTS 정의(`useStudentStore.ts:12-48`)와 정확 일치                                                                           | 본인 학생 이름이 김민지·이서연…과 우연히 일치할 확률 0                                                                                                                  |
| **D. 외부 참조 0건**                      | StudentRecord / Seating / SeatConstraints / SeatPicker / Attendance(담임) / Consultation 에서 s01~s35 id를 참조하는 레코드 1건이라도 있으면 거부 | 본인 학급으로 쓰는 중이면 출결·자리배치 1회는 했을 것                                                                                                                   |
| **E. 추가 입력 필드 무흔적 (v1.2 신규)**  | 35명 전원의 `phone`·`parentPhone`·`parentPhone2`·`birthDate`·`statusNote`가 모두 빈 값 또는 undefined                                            | 사용자가 연락처/생년월일을 1개라도 입력했다면 본인 입력으로 간주, 거부                                                                                                  |
| **F. 사용자 수정 흔적 부재 (v1.2 신규)**  | `settings.everEditedRoster === false`                                                                                                            | RosterManagementTab의 모든 수정 액션(`updateStudents`·`updateStudentField`·`setStudentCount`·import 등)에서 이 플래그를 `true`로 세팅 → 한 번이라도 만진 적 있으면 거부 |
| **G. 멱등성 가드**                        | `settings.didCleanSampleRoster === false`                                                                                                        | 이전에 한 번 정리한 사용자는 재실행 시 스킵                                                                                                                             |

**처리 분기**:

- 가드 A~G **모두 통과** → 자동 정리(`students = []` + 디스크 빈 배열 저장) + `didCleanSampleRoster = true` + 1회성 토스트 5초 + 사이드바 배지
- 가드 A~C 통과 + 가드 D 또는 E 실패 → **삭제 안 함**, 상단 배너만: "이 명단이 샘플일 가능성이 있어요. 우리 반 명단을 직접 등록하시면 정리됩니다."
- 가드 A~C 중 하나라도 실패 → 본인 명단 확정, 아무 동작 안 함, 배너도 안 띄움

**`everEditedRoster` 플래그 신설 위치**:

- `Settings.ts`에 `everEditedRoster?: boolean` 추가
- `useStudentStore.ts`의 모든 수정 액션(`updateStudents`, `updateStudentField`, `setStudentCount`, import) 끝에 `useSettingsStore.update({ everEditedRoster: true })` 추가
- 마이그레이션 검사 시 이 플래그가 `false` 또는 `undefined`일 때만 통과

**검증**:

- 단위 테스트 7건 (각 가드별 양성/음성 케이스)
- 통합 테스트 5건 (위험 시나리오 ①~⑤ 전수)
- 멱등성 테스트 (load 10회 반복해도 1회만 정리)
- 회귀 테스트 (본인 명단 등록한 사용자 시뮬레이션 — 어떤 변경도 없음 확인)

**예상 작업량**: 2.5일 (가드 강화로 +0.5일)

### Phase 3 (P2 — 회귀 차단): 메타테스트 + 문서

**범위**:

- `tests/meta/sampleStudentsBanned.test.ts` — `useStudentStore.ts`에 `SAMPLE_STUDENTS` 또는 비슷한 패턴(35명 하드코딩 명단)이 재도입되면 CI 실패
- `tests/meta/emptyRosterGuardCoverage.test.ts` — 학생 의존 화면 8곳에 `<RosterEmptyState>` 가드가 누락되면 CI 실패
- README / CLAUDE.md 또는 docs/ 안에 "샘플 명단은 코드에 박지 않는다" 원칙 문서화

**예상 작업량**: 0.5일

---

## 6. 검증 계획

### 6.1 4단계 게이트

```bash
npx tsc --noEmit              # TypeScript 에러 0개
npm run lint                   # ESLint 통과
npm run test                   # Vitest 통과 (신규 15건 이상 + 메타테스트 2건)
npm run regression-check       # 9/9 → 11/11 확장
```

### 6.2 수동 검증 시나리오

| 시나리오                                                                                      | 가드 검사 결과                                      | 기대 동작                                                                                                  |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1. 신규 설치(students.json 없음) → 진입                                                       | (Phase 1) 빈 배열로 시작                            | 빈 상태 카드 + [명단 등록하기] CTA                                                                         |
| 2. 신규 설치 → 모든 학생 의존 화면 진입                                                       | (Phase 1) 빈 배열                                   | 일관된 빈 상태 카드                                                                                        |
| 3. 샘플 35명만 박힌 데이터 (피해 사용자)                                                      | A·B·C·D·E·F·G 전부 통과                             | 자동 정리 + 토스트 + 배지. 다음 진입 시 토스트 안 뜸.                                                      |
| 4. 샘플 35명 + 김민지에 출결 1건                                                              | A·B·C 통과 / **D 실패**                             | 자동 정리 안 함. 배너만.                                                                                   |
| 5. 샘플 35명 + 김민지 연락처 입력                                                             | A·B·C·D 통과 / **E 실패**                           | 자동 정리 안 함. 배너만.                                                                                   |
| 6. 본인 명단 25명 등록                                                                        | **A 실패**                                          | 변화 없음. 배너 없음.                                                                                      |
| 7. 본인 명단 35명 일괄 import                                                                 | A 통과 / **B 실패** (id가 `s${Date.now()}_*`)       | 변화 없음. 배너 없음.                                                                                      |
| 8. 샘플 위에 사용자가 "수정" 1회 (예: 김민지 이름만 변경)                                     | A·B 통과 / **C·F 실패**                             | 변화 없음. 배너 없음.                                                                                      |
| 9. 샘플 35명 + 사용자가 1번 만진 후 다시 원래대로 복구                                        | A·B·C·D·E 통과 / **F 실패** (everEditedRoster=true) | 변화 없음. 배너 없음.                                                                                      |
| 10. 우연히 35명 이름 모두 일치 + 연락처 미입력 + 출결 미기록 + 명단 수정 미경험 (극단 케이스) | A·B·C·D·E·F·G 통과                                  | 자동 정리 — 단 이 경우 실제로는 신규 설치 직후 한 번도 안 만진 상태와 동치이므로 본인 데이터가 아님 (안전) |

### 6.3 Playwright 추가 검증 (선택)

신규 설치 시나리오를 Playwright로 자동화해 release 직전 1회 실행.

---

## 7. 위험과 완화

| 위험                                                | 영향                                                                     | 완화                                                                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 우연히 김민지·이서연 등 35명을 실제로 가르치는 교사 | 진짜 명단이 삭제됨                                                       | 6중 가드(A~F) AND. 가드 B(id 패턴)·E(연락처 무흔적)·F(수정 흔적 부재) 중 어느 하나라도 실패하면 거부. 실사용 중이면 D·E·F 중 최소 1개는 반드시 걸림. |
| 외부 참조 검사 누락                                 | 출결/기록 데이터 손실                                                    | 가드 D에서 6개 엔티티 전수 검사. 1건이라도 있으면 거부.                                                                                              |
| 사용자가 연락처·생년월일만 입력하고 출결 미기록     | 입력한 추가 정보 손실                                                    | 가드 E(추가 필드 무흔적). phone/parentPhone/birthDate 등 1개라도 값 있으면 거부.                                                                     |
| 사용자가 명단을 한 번 만지고 그대로 둠              | 가드 D·E 모두 통과해 잘못 삭제 가능                                      | 가드 F(`everEditedRoster` 플래그). RosterManagementTab의 모든 수정 액션에서 플래그 세팅. 가드 C도 추가 방어.                                         |
| Google Drive Sync 양방향 충돌                       | 한 기기에서 정리 후 다른 기기가 옛 students.json을 덮어씀                | `didCleanSampleRoster` + `everEditedRoster` 플래그를 sync 대상에 포함. 양쪽 기기가 동일하게 판정.                                                    |
| `everEditedRoster` 플래그 도입 누락                 | 기존 사용자는 이 플래그가 undefined → 가드 F 통과 → 다른 가드만으로 판정 | 마이그레이션 시 undefined를 false로 취급. 단 가드 A~E가 모두 통과하는 시나리오 자체가 극히 좁아 실질 위험 낮음.                                      |
| EmptyState UI가 너무 많은 화면을 건드림             | 회귀 위험                                                                | 공통 컴포넌트 1개로 통일. 메타테스트로 누락 차단.                                                                                                    |
| Phase 1만 머지 후 Phase 2 지연                      | 기존 피해 사용자는 여전히 샘플 봄                                        | v2.0.7 묶음에 Phase 1+2+3 통합.                                                                                                                      |

---

## 8. 릴리즈 전략

### 8.1 v2.0.7 묶음 후보 (확정 대기)

현재 v2.0.7 후보 묶음:

- ✅ notification-modal-stacking-fix Phase 0~4 — Match Rate 97% PASS (2026-05-21)
- 🆕 **roster-sample-data-removal Phase 1+2** (본 PDCA)
- 🟡 Phase 3 (메타테스트) — v2.0.7에 포함 권장 (회귀 차단이 본 PDCA 핵심 가치)

### 8.2 사용자 안내 문안 (release-notes.json 후보)

```json
{
  "type": "fix",
  "title": "처음 사용할 때 모르는 학생 명단이 자동으로 들어가던 문제 해소",
  "description": "이전 버전에서는 명단을 입력하지 않으면 예시 학생 35명이 자동으로 표시됐습니다. 이제는 빈 화면에서 '우리 반 명단 등록하기' 안내가 보이며, 이미 예시 명단이 들어가 있던 분들도 다음 실행에서 자동으로 정리됩니다."
}
```

---

## 9. 의존성 / 참고

- [roster-data-consistency PDCA](e:/github/ssampin/docs/01-plan/features/roster-data-consistency.plan.md) — 3-store 분리 구조 결정
- [homeroom-audit Report](e:/github/ssampin/docs/04-report/homeroom-audit.report.md) — 데이터 cascade 부재 지적
- [ultrawork 정밀 분석 결과 (2026-05-21 대화)] — 5개 에이전트 병렬 추적 결과

---

## 10. Open Questions

### 확정 (2026-05-21)

1. ✅ **릴리즈 묶음**: v2.0.7에 Phase 1+2+3 통합
2. ✅ **외부 참조 검사 시 보수 정책**: 1건이라도 있으면 자동 삭제 거부 + 상단 배너 경고만 표시
3. ✅ **EmptyState 디자인**: frontend-design 에이전트 1순위 (Design 단계에서 호출)
4. ✅ **마이그레이션 안내 형식**: 토스트 5초 + 사이드바 배지 (지속 유도)

### Design 단계에서 결정

5. ⏳ **샘플 데이터 보존 여부**: 코드 완전 삭제 vs `docs/fixtures/sample-roster.json`으로 이동
6. ⏳ **외부 참조 검사 엔티티 범위 최종 확인**: 6개(StudentRecord/Seating/SeatConstraints/SeatPicker/Attendance/Consultation) 외 추가 대상
7. ⏳ **배너 디자인 톤**: 경고색(amber) vs 정보색(blue) — frontend-design과 협의
8. ⏳ **사이드바 배지 사라지는 조건**: 명단 1명 등록 시 vs 사용자가 직접 닫을 때
9. ⏳ **Phase 1/2 Atomicity**: 동일 PR 단일 커밋 vs Phase별 커밋 분리
