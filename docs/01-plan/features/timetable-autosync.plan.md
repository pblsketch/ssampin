# 시간표 자동연동 + 잠재버그 하드닝 — 구현 계획서

> 상태: **승인됨 (ralph 실행 대기)** · 대상 레포: `E:\github\ssampin` · 하네스: `.claude/skills/ssampin-develop`

## 0. 배경 & 현재 상태 (소스 근거)

- **나이스(NEIS) 학급 시간표 자동동기화 — 존재하나 무음·무감지**
  - `src/adapters/hooks/useNeisAutoSync.ts` → usecase `src/usecases/timetable/AutoSyncNeisTimetable.ts`
  - 앱 시작 1회(`hasRun` ref) + `lastSyncDate === today` 스로틀. 변경 감지 없이 `useScheduleStore.updateClassSchedule(data)`로 **조용히 덮어씀**.
- **컴시간알리미 교사 시간표 — 완전 수동 1회성**
  - UI: `src/adapters/components/Timetable/ComciganImportModal.tsx` (2단 위저드) → `onImport(schedule)` → `TimetablePage.tsx`가 미리보기 후 적용
  - 도메인: `src/domain/rules/comciganRules.ts` — `decodeLessonCode`의 `teacherIndex = n % 1000`(주석에 학교별로 깨질 수 있다는 경고 有), `summarizeTeachers`는 숫자 인덱스로 그룹(`Map<number>`), `buildTeacherSchedule`는 인덱스로 필터
  - 인프라: `src/infrastructure/comcigan/ComciganApiClient.ts`(searchSchools/getSchoolData, route 10분 캐시), IPC `electron/ipc/comcigan.ts`(comci.net 고정·safeFetch)
  - 자동동기화 훅·usecase **없음**
- **스토어**: `src/adapters/stores/useScheduleStore.ts` — `classSchedule`/`teacherSchedule` + `updateClassSchedule`/`updateTeacherSchedule` + undo/redo
- **버그 (a) 교사 인덱스 충돌**: `n % 1000` 가정이 특정 학교에서 깨지면 서로 다른 교사가 한 인덱스로 병합 → 과목 합쳐짐
- **버그 (b) 마스킹 동명이인**: 컴시간이 이름 끝 글자를 `*`로 마스킹해 넘김(예: `백순*`). 인덱스는 별개지만 목록엔 동일하게 보여 선택 혼동(데이터 병합은 아님)
- 재사용 자산: 토스트 `useToastStore`(`TimetableEditor.tsx`에서 `.getState().show()` 사용 확인), 트리거 패턴 `src/adapters/hooks/useTasksAutoSync.ts`(앱시작/저장/주기/포커스), 온양여고 실측 픽스처 `src/domain/rules/comciganRules.test.ts`

## 1. 설계 결정 (ADR 요약)

- **"실시간"의 현실적 정의**: 컴시간·나이스 모두 pull 소스(컴시간 push 불가, 나이스 REST) → **트리거 기반(앱 시작 + 수동 "새로고침") 재fetch + diff + 알림**. focus/interval 폴링은 v1 제외 (comci.net 비공식·차단 위험, 나이스 쿼터).
- **기본 정책 = 알림+확인(비파괴)**, 자동 적용은 **per-source 옵트인**. 컴시간 무음 적용은 기본 OFF(비공식 소스).
- **교사 재매칭 = 지문(마스킹 이름 1차, 과목/시수 tie-break)**, raw index 저장 금지(fetch마다 재부여 위험 → 교사 스왑 사고). 매칭 실패 시 적용 말고 "다시 선택" 안내.
- 대안 기각: B(나이스 무음 유지)=비파괴 원칙 위배 / raw index 저장=교사 스왑 / focus·interval 폴링=외부 차단.
- 결과: 나이스 기본 동작 변경(기존 자동사용자는 마이그레이션으로 autoApply=true 유지), 설정 표면 소폭 증가.

## 2. 절대 제약 (위반 시 롤백)

1. **비파괴**: 사용자의 수동 편집 시간표를 조용히 덮어쓰지 않는다. store undo 보존. 컴시간은 절대 무음 적용 안 함.
2. **잘못된 적용 0**: 교사 지문 매칭 실패 시 데이터 적용 금지(오귀속 방지).
3. **하위호환**: 신규 설정 필드는 전부 optional. 기존 `.ssampin` 데이터·기존 나이스 자동사용자 동작 유지(마이그레이션).
4. **아키텍처 4레이어**: diff·anomaly·매칭은 `src/domain`(순수, react/zustand/adapters/usecases/infra import 금지). usecase는 포트만. hook에 부수효과. adapter는 `di/container.ts` 외 infra import 금지.
5. **--sp-\* 토큰만**: 배너/토스트/설정 UI에 하드코딩 색상 금지.
6. **스코프 고정**: 컴시간 코드 해석 공식(`decodeLessonCode`) 자체를 바꾸지 않는다. 가정이 깨질 때 **감지·경고·폴백**만 추가(정상 학교 동작 불변).
7. **외부 예의**: comci.net 폴링 금지(앱시작+수동만), route 10분 캐시 재사용, 실패 시 조용히 skip.

## 3. 워크스트림 (실행 순서 = M1 → M2 → M3 → M4)

### M1 — 하드닝 (먼저·독립 출시 가능·순수 domain + modal)

- **파일**: `src/domain/rules/comciganRules.ts`(수정), `src/adapters/components/Timetable/ComciganImportModal.tsx`(수정), `src/domain/rules/comciganRules.test.ts`(추가)
- **구현**:
  - `detectDecodeAnomaly(data, lessons)` 순수함수 — 휴리스틱: (i) 실제 등장 teacherIndex 종류 수 vs `teachers[]` 비어있지 않은 항목 수의 괴리, (ii) 한 교사 비정상 주시수(예: > 30), (iii) teacher/subject 인덱스 범위초과 셀 비율. → `{ suspicious: boolean, reasons: string[] }`.
  - `summarizeTeachers` 반환 항목에 `maskedNameCollision: boolean`(같은 마스킹 이름이 2명 이상일 때 true).
  - 모달: `suspicious`면 **비차단 경고 배너**("이 학교 시간표 해석이 정확하지 않을 수 있어요 — [엑셀 불러오기]·직접 입력 권장"), 계속 진행은 가능. `maskedNameCollision` 교사는 목록에서 **과목·주N시간 강조 + 담당 학년 힌트**로 구분.
- **수용 기준**:
  - 온양여고 실측 픽스처 → `detectDecodeAnomaly.suspicious === false`(오탐 0)
  - 인덱스 충돌 픽스처(두 교사가 한 인덱스로 뭉치는 합성 데이터) → `suspicious === true`, 과목이 한 명으로 병합돼 보이지 않고 경고 노출
  - 마스킹 동명이인 픽스처(`김민*` ×2, 다른 인덱스) → 두 항목 분리 유지 + `maskedNameCollision === true`
  - tsc 0 / lint 0 / 신규 유닛 통과 / 기존 comcigan 테스트 무회귀

### M2 — diff & 매칭 기반 (순수 domain + 테스트)

- **파일**: `src/domain/rules/timetableDiff.ts`(신규), `src/domain/rules/comciganTeacherMatch.ts`(신규) + 각 `.test.ts`
- **구현**:
  - `diffTeacherSchedule(a, b)` / `diffClassSchedule(a, b)` — 정규화(교실 토큰 정렬, null 패딩 길이차 무시) 후 비교 → `{ changed: boolean, changes: {day,period,before,after}[] }`.
  - `locateTeacherByFingerprint(summaries, fp)` — fp `{ maskedName, subjects[] }`. **이름 유일 매칭 우선(시수 변해도 수용)**, 이름 중복 시 과목 교집합 최대로 tie-break, 그래도 모호/부재면 `null`.
- **수용 기준**:
  - 동일 스케줄 → `changed:false`; 교시 1개 과목 변경 → `changed:true` + 정확한 change 항목; 교실 병합순서만 다름 → `changed:false`
  - fp 이름 유일 + 시수 변경 → 매칭 성공(그 변화가 감지 대상); 이름 중복 → 과목으로 구분; 매칭 불가 → `null`
  - tsc 0 / lint 0 / 신규 유닛 통과

### M3 — 컴시간 자동연동

- **파일**: `src/domain/entities/Settings.ts`(수정), `src/usecases/timetable/AutoSyncComciganTimetable.ts`(신규+test), `src/adapters/hooks/useComciganAutoSync.ts`(신규), `src/adapters/components/Timetable/ComciganImportModal.tsx`(수정), `src/App.tsx`(배선), 설정 UI 컴포넌트(수정)
- **구현**:
  - Settings: `comcigan.autoSync { enabled, autoApply(기본 false), lastSyncDate }` + 저장 지문 `{ schoolCode, maskedName, subjects[] }` — 기존 `neis.autoSync` 중첩 optional 패턴 미러.
  - usecase `autoSyncComciganTimetable(comciganPort, saved, currentTeacherSchedule)`: 재fetch(getSchoolData→decodeTimetable) → `locateTeacherByFingerprint` → `buildTeacherSchedule` → `diffTeacherSchedule(current, built)` → `{ skipped, matched, changed, data, diff }`. 스로틀(앱당 1회 + lastSyncDate).
  - hook `useComciganAutoSync`(useNeisAutoSync 미러): 앱시작; enabled+저장지문 有면 usecase 실행; `matched && changed`면 토스트/배너 "시간표가 바뀌었어요 · [검토하기]" → ComciganImportModal을 **미리보기(비파괴)** 로 오픈; `!matched`면 "교사 매칭 실패 · 다시 선택" 안내(적용 금지); autoApply=true일 때만 무음 적용 허용(컴시간은 기본 false).
  - 모달: import 성공 시 지문 저장. 수동 "새로고침" 진입점.
  - App.tsx: `useComciganAutoSync()` 배선(`useNeisAutoSync()` 옆).
- **수용 기준**:
  - 상류 변경(픽스처로 시뮬) → `changed:true` → 알림; 미변경 → 무알림·무쓰기
  - 지문 이름-유일 매칭 유지; 매칭 실패 시 데이터 적용 0 + "다시 선택"
  - autoApply=false(기본)에서 무음 적용 안 됨
  - tsc 0 / lint 0 / 신규 유닛(skip/changed/nomatch) 통과 / 4레이어 grep 통과

### M4 — 나이스 변경인지 + 정책 통일 + 마이그레이션

- **파일**: `src/usecases/timetable/AutoSyncNeisTimetable.ts`(수정), `src/adapters/hooks/useNeisAutoSync.ts`(수정), `src/domain/entities/Settings.ts`(마이그레이션), 설정 UI(수정)
- **구현**:
  - usecase가 현재 `classSchedule`와 `diffClassSchedule` → `changed` 반환.
  - hook: 정책 반영 — 기본 notify(변경 시 배너), `neis.autoSync.autoApply=true`일 때만 무음 적용. unchanged면 쓰기 스킵.
  - 마이그레이션: 기존 `neis.autoSync.enabled` 사용자 → `autoApply: true` 부여(현행 무음 동작 하위호환).
- **수용 기준**:
  - 나이스 변경 → 정책대로(기본 알림 / 옵트인 무음); 미변경 → 중복 쓰기 없음
  - 기존 자동사용자 마이그레이션 후 동작 불변
  - tsc 0 / lint 0 / 테스트 통과

## 4. 검증 게이트 (각 스토리 passes:true 전 실제 실행)

- `npx tsc --noEmit` 0 에러 · `npm run lint` 0 에러 · `npm run test`(vitest) 통과 · `npm run regression-check`(≥ 현재 38) · `npm run build` 성공(postbuild 번들격리·계약동기화 게이트 통과).
- 4레이어 순수성: 신규 domain 파일이 react/zustand/adapters/usecases/infra를 import하지 않음(grep 확인).
- 기존 수동 컴시간 불러오기·엑셀 불러오기·직접 입력·나이스 동기화 **무회귀**.

## 5. 리스크 & 완화

- 교사 스왑 오적용 → 지문 재매칭 + 매칭 실패 시 미적용 + 컴시간 무음 기본 OFF + undo 보존
- 상류 부하/차단 → 앱시작+수동만, 10분 캐시, 실패 시 조용히 skip
- 이상감지 오탐 → 보수적 임계 · 비차단 경고 · 온양여고 픽스처로 오탐 0 검증
- 나이스 무음→알림 전환 혼란 → 마이그레이션으로 기존 자동사용자 유지

## 6. 후속 (이번 스코프 아님)

- per-source full policy UI(off/notify/auto) · 폴링형 준실시간 · 컴시간 변경 이력 뷰
