# Ralph 핸드오프 프롬프트 — 시간표 자동연동 + 잠재버그 하드닝

> 사용법: 아래 `=== 프롬프트 시작 ===` ~ `=== 프롬프트 끝 ===` 사이 전체를 복사해, **`E:\github\ssampin`에서 연 Claude Code 세션**에 그대로 붙여넣으세요. 첫 줄의 `/oh-my-claudecode:ralph` 가 ralph 루프를 띄웁니다.
>
> 스코프 조절: M1(하드닝)만 먼저 하려면 3번 "실행 순서"를 `M1만`으로 바꾸고 6번 완료 조건을 M1 스토리로 한정하세요.

---

=== 프롬프트 시작 ===

/oh-my-claudecode:ralph 쌤핀 "시간표 자동연동 + 잠재버그 하드닝"을 계획서대로 구현한다. --critic=architect

## 0. 작업 위치 & 권위 문서

- 레포: `E:\github\ssampin` (현재 세션 루트)
- **권위 계획서(먼저 전체 정독)**: `docs/01-plan/features/timetable-autosync.plan.md`
  - PRD 스토리·수용 기준은 계획서의 각 워크스트림(M1~M4) "수용 기준" 블록을 **그대로** prd.json에 옮긴다(임의 보일러플레이트 금지).
- 하네스: `.claude/skills/ssampin-develop/`(아키텍처 규칙·워크스페이스 프로토콜), `.impeccable.md`(디자인 토큰), `CLAUDE.md`(검증 게이트)

## 1. 절대 제약 (위반 시 즉시 롤백)

1. **비파괴**: 사용자의 수동 편집 시간표를 조용히 덮어쓰지 않는다. `useScheduleStore` undo 보존. **컴시간은 절대 무음 적용 금지**(항상 알림+확인).
2. **잘못된 적용 0**: 교사 지문 매칭 실패 시 데이터 적용 금지 → "다시 선택" 안내(오귀속/교사 스왑 방지).
3. **하위호환**: 신규 설정 필드 전부 optional. 기존 `.ssampin` 데이터·기존 나이스 자동사용자 동작 유지(M4 마이그레이션으로 `autoApply=true` 부여).
4. **아키텍처 4레이어 순수성**: diff·anomaly·지문매칭 = `src/domain`(순수 — react/zustand/@adapters/@usecases/infra import 금지). usecase는 포트만. hook에 부수효과. adapter는 `di/container.ts` 외 infra import 금지.
5. **--sp-\* 토큰만**: 배너·토스트·설정 UI에 하드코딩 색상 금지(`.impeccable.md` 토큰).
6. **컴시간 해석 공식 불변**: `decodeLessonCode`(teacherIndex/subjectIndex 계산)를 **바꾸지 않는다**. 가정이 깨질 때 감지·경고·폴백만 추가(정상 학교 동작 불변).
7. **외부 예의**: comci.net 폴링 금지 — 트리거는 **앱 시작 + 수동 "새로고침"만**. `ComciganApiClient`의 route 10분 캐시 재사용, 실패 시 조용히 skip.

## 2. 치명적 함정 (이미 분석됨 — 재발견 말 것)

- **⚠️ teacherIndex 불안정성**: 컴시간 `teacherIndex`(= `n % 1000`)는 fetch마다 재부여될 수 있다. **raw index를 저장해 재동기화하면 다른 교사로 조용히 바뀐다(사고).** → 저장·재매칭은 **지문(마스킹 이름 1차 + 과목 tie-break)** 으로 한다. `src/domain/rules/comciganTeacherMatch.ts` 신규.
- **지문 매칭 역설**: 시간표가 바뀌면 과목·시수도 바뀐다. 지문 비교를 시수까지 엄격히 하면 진짜 변경 때마다 매칭 실패한다. → **이름 유일 매칭이면 시수 변해도 수용**(그게 감지 대상), 이름 중복일 때만 과목으로 tie-break.
- **마스킹 이름**: 컴시간이 이름 끝 글자를 `*`로 마스킹해 넘긴다(`백순*`). 인덱스는 별개지만 목록 표시가 동일 → 구분 표시 필요(데이터 병합 아님).
- **나이스 현행 무음 적용**: `useNeisAutoSync`가 변경 감지 없이 `updateClassSchedule`로 덮어쓴다. M4에서 정책화하되 기존 사용자 마이그레이션 필수.
- **빌드 경계**: electron main(`tsconfig.electron.json`)은 `@domain` 별칭이 없다 — 이번 작업은 renderer(domain/usecases/adapters)만 건드리므로 electron main에 `src/domain/**`을 import하지 말 것.
- **재사용**: 토스트는 `useToastStore.getState().show(...)`(예: `TimetableEditor.tsx`), 트리거 패턴은 `src/adapters/hooks/useTasksAutoSync.ts`, 나이스 훅/usecase 패턴은 `useNeisAutoSync.ts`/`AutoSyncNeisTimetable.ts`, 실측 픽스처는 `comciganRules.test.ts`(온양여고).

## 3. 실행 순서 (PRD 스토리 = 이 순서)

- **M1 하드닝**(먼저·독립 머지 가능): `detectDecodeAnomaly` + 마스킹 동명이인 구분. 순수 domain + 모달.
- **M2 기반**(순수 domain): `timetableDiff.ts`(diffTeacher/diffClass) + `comciganTeacherMatch.ts`(지문 매칭).
- **M3 컴시간 자동연동**: Settings 확장 + usecase `AutoSyncComciganTimetable` + hook `useComciganAutoSync` + 모달 지문저장/새로고침 + App.tsx 배선 + 설정 토글.
- **M4 나이스 변경인지 + 정책 통일 + 마이그레이션**: `AutoSyncNeisTimetable`가 changed 반환, `useNeisAutoSync` 정책 반영, 기존 사용자 마이그레이션.

## 4. 워크스트림별 착지점 (요약 — 상세·수용기준은 계획서 본문)

- **M1**: `comciganRules.ts`에 `detectDecodeAnomaly(data,lessons)→{suspicious,reasons}` + `summarizeTeachers`에 `maskedNameCollision`. 모달에 비차단 경고 배너 + 동명이인 구분(과목·주N시간·담당학년). 수용: 온양여고 픽스처 오탐0 / 충돌 픽스처 경고+병합안됨 / 마스킹중복 픽스처 분리+플래그.
- **M2**: `timetableDiff.ts`(정규화 후 {changed,changes[]}) + `comciganTeacherMatch.ts`(이름 유일 우선). 수용: 병합순서만 다름→changed:false / 과목변경→changed:true / 이름유일+시수변경→매칭성공 / 모호→null.
- **M3**: `Settings.ts`에 `comcigan.autoSync{enabled,autoApply(기본false),lastSyncDate}` + 지문{schoolCode,maskedName,subjects}. usecase→{skipped,matched,changed,data,diff}. hook: matched&changed→"검토하기" 미리보기(비파괴), !matched→"다시 선택", autoApply=true만 무음. 수용: 변경→알림/미변경→무알림·무쓰기/매칭실패→적용0/기본무음안됨.
- **M4**: usecase changed 반환 + hook 정책(기본 notify, 옵트인 auto) + unchanged 쓰기스킵 + 마이그레이션(기존 enabled→autoApply true). 수용: 정책대로 동작/미변경 중복쓰기없음/기존사용자 불변.

## 5. 검증 게이트 (각 스토리 passes:true 전 실제 실행 후 출력 확인)

- `npx tsc --noEmit` 0 · `npm run lint` 0 · `npm run test`(vitest) 통과 · `npm run regression-check`(≥38) · `npm run build` 성공(postbuild 번들격리·계약동기화 게이트 통과).
- 4레이어 grep: 신규 `src/domain/**` 파일이 react/zustand/@adapters/@usecases/infra를 import하지 않음.
- 무회귀: 기존 수동 컴시간 불러오기·엑셀 불러오기·직접 입력·나이스 동기화.

## 6. 완료 처리

- M1~M4 모든 PRD 스토리 passes:true + architect(THOROUGH — 데이터 무결성/자동적용이라) 검증 통과 후 `/oh-my-claudecode:cancel`.
- deslop은 코드 변경분에만. 커밋은 **명시 path만**(잡파일·문서 미포함), 릴리즈/버전 bump는 하지 않는다(이번은 기능 구현까지).

## 7. 막히면

- 데이터 무결성·교사 매칭·비파괴 관련 모호함이 생기면 **추측해서 자동 적용을 켜지 말고** 중단·질문(비파괴가 기본).
- 컴시간 해석 공식을 바꿔야 할 것 같으면 먼저 보고(스코프 밖).

=== 프롬프트 끝 ===
