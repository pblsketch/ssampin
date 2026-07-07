# 시간표 불러오기 확장 — 압핀 연동 + 나이스 교사 시간표 재조합

## Context (왜)

시간표 화면은 현재 **나이스**·**컴시간**에서 시간표를 불러온다. 여기에 세 가지를 추가·정돈한다.

1. 일부 학교가 쓰는 **압핀(유원테크, sgpap.com)** 에서 학급/교사 시간표 불러오기 (+자동 변경감지).
2. 불러오기 소스가 3개(나이스/컴시간/압핀)로 늘어나 헤더 버튼이 과밀 → **단일 '불러오기' 드롭다운**으로 정돈.
3. **나이스에서 교사 시간표** 불러오기 — 나이스엔 교사 시간표가 없으므로 **학급 시간표를 재조합**해 구성.

압핀 프로토콜은 이미 리버스·검증 완료(`docs/압핀-시간표-연동-가능성-조사.md`, 공개 파서 `pblsketch/appin-timetable-parser`). 그 로직을 앱 4레이어로 이식한다.

### 확정된 결정 (사용자)

- 압핀: **학급 + 교사 둘 다** 불러오기.
- UI: **단일 '불러오기' 드롭다운** (기존 나이스·컴시간 버튼도 함께 통합).
- 압핀 **자동 변경감지 포함**.
- 나이스 교사 시간표는 **학급 재조합** 방식(분석 결과 아래).

---

## 기존 패턴 (그대로 따를 참조)

컴시간 연동이 가장 가까운 참조. 호출 체인:

```
UI → comciganPort(DI) → ComciganApiClient → transport.fetchRaw
   → window.electronAPI.comcigan.fetchRaw → ipcMain 'comcigan:fetch' → safeFetchBytes → comci.net
도메인 순수변환: domain/rules/comciganRules.ts (decode/build*Schedule/parse*)
```

- 학급 불러오기는 **공용 적용 경로** 재사용: 모달 `onImport(data: ClassScheduleData, maxPeriods)` → `TimetablePage.handleNeisImport` → `updateClassSchedule` ([TimetablePage.tsx:361](src/adapters/components/Timetable/TimetablePage.tsx#L361), [ComciganClassImportModal.tsx:26](src/adapters/components/Timetable/ComciganClassImportModal.tsx#L26)).
- 교사 불러오기: 모달 → `previewSchedule` → `TeacherExcelPreviewModal` → `updateTeacherSchedule` ([TimetablePage.tsx:979-1016](src/adapters/components/Timetable/TimetablePage.tsx#L979)).
- 내부 타입: `ClassScheduleData={[day]:ClassPeriod[]}`(ClassPeriod={subject,teacher}), `TeacherScheduleData={[day]:(TeacherPeriod|null)[]}`(TeacherPeriod={subject,classroom}), day='월'~'금', 교시 0-based ([Timetable.ts](src/domain/entities/Timetable.ts)).
- 자동연동 3계층: 순수 diff(`domain/rules/timetableDiff.ts`) + usecase(`AutoSyncComciganTimetable.ts`) + hook 부수효과(`useComciganAutoSync.ts`) + App.tsx 등록.
- **시간표는 이미 syncRegistry 등록됨**(class-schedule/teacher-schedule/timetable-overrides) → 새 동기화 도메인 불필요. 압핀 설정은 `settings.appin`(settings 도메인이 이미 동기화).
- 아키텍처: domain은 아무것도 import 안 함, infra→domain, usecase→domain만, container.ts만 infra 조립.

---

## 나이스 교사 시간표 재조합 — 분석

- **나이스 시간표 API엔 교사 필드 없음** — `PERIO·ITRT_CNTNT(과목)·ALL_TI_YMD·GRADE·CLASS_NM`뿐 ([NeisApiClient.ts:288](src/infrastructure/neis/NeisApiClient.ts#L288)). 나이스 "교사 시간표" API 부재.
- **유일 방법**: 교사의 수업반(`TeachingClass{subject, name, students[grade?,classNum?]}`)으로 각 학급 나이스 시간표를 스캔해 `ITRT_CNTNT==subject`인 교시를 교사 그리드로 재조립.
- **잘 됨**: 반별 고정 수업(중학교/담임식).
- **한계**: (a) 과목명 정규화 필요 (b) 학급 식별(name 파싱/students grade·classNum) 애매 시 사용자 지정 (c) 고교 선택과목 이동수업은 단일 나이스 학급에 안 잡혀 **제외/안내** (d) 팀티칭 과다배정 가능.
- **결론**: best-effort 재구성 → **미리보기+수정 단계 필수**(TeacherExcelPreviewModal 재사용). 수업반 미등록 시 안내.

---

## 신규/수정 파일 (레이어별)

### 압핀 (컴시간 패턴 미러)

- `src/domain/entities/AppinTimetable.ts` — 타입(`AppinSchool{webdir,name}`, `AppinClassRef{grade,classNum,label}`, grid cell 타입) + `AppinError`/`getAppinErrorMessage`.
- `src/domain/ports/IAppinPort.ts` — `resolveSchool(city,name)`, `getElements(webdir)`, `getWeekGrid(webdir,filename)`, `listWeekFiles(webdir)`.
- `src/domain/rules/appinRules.ts` — **순수**: parseGrid/parseCell(EUC-KR은 infra에서 디코딩 후 문자열 전달), `buildClassScheduleFromAppin(row)→ClassScheduleData`, `buildTeacherScheduleFromAppin(row)→TeacherScheduleData`, `classIndexOf`, `estimateWeekFromDate`. (공개 파서 로직 이식.)
- `src/infrastructure/appin/AppinApiClient.ts` — `IAppinPort` 구현. transport 주입(electron IPC/vite 프록시). 정적파일 EUC-KR `TextDecoder('euc-kr')` 디코딩, php 응답 UTF-8. getupdir 요청 **UTF-8 필수**.
- `electron/ipc/appin.ts` — `registerAppinHandlers` (`safeFetchBytes`, `allowedHosts=['www.sgpap.com']`, GET 정적 + POST form 둘 다). + `main.ts` 등록 + `preload.ts` 노출 `window.electronAPI.appin` + `global.d.ts` 타입.
- `src/usecases/timetable/AutoSyncAppinTimetable.ts` + `src/adapters/hooks/useAppinAutoSync.ts` (자동 변경감지, 컴시간 3계층 미러) + `App.tsx` 등록.
- `src/adapters/di/container.ts` — `export const appinPort: IAppinPort = new AppinApiClient()`.
- `src/domain/entities/Settings.ts` — `AppinSettings{autoSync?, webdir?, ...}` + `settings.appin`.
- `vite.config.ts` — `/appin-api` 프록시(브라우저 dev).
- UI: `src/adapters/components/Timetable/AppinClassImportModal.tsx`, `AppinTeacherImportModal.tsx` (Modal+IconButton+sp-\*; 압핀 학교검색은 **정확일치**라 시/군+학교명 2필드+찾기; 교사는 **교사번호 입력**).

### 나이스 교사 재조합

- `src/domain/rules/neisTeacherReconstruct.ts` — **순수**: `reconstructTeacherSchedule(teachingClasses, classTimetablesByClass, subjectMatcher)→{schedule, unmatched[]}`. 과목명 정규화 매처.
- `src/usecases/timetable/ReconstructNeisTeacherSchedule.ts` — 수업반→나이스 학급 도출 + fetch 오케스트레이션(INeisPort 사용).
- UI: `src/adapters/components/Timetable/NeisTeacherImportModal.tsx` — 수업반 목록 확인/학급·과목 매핑 수정 → 재조합 → `TeacherExcelPreviewModal` 합류.

### UI 통합 (불러오기 드롭다운)

- `src/adapters/components/Timetable/ImportSourceMenu.tsx` (신규 공용 드롭다운) — 현재 탭(교사/학급)에 맞는 소스 목록 표시.
- `TimetablePage.tsx` — 기존 개별 불러오기 버튼(나이스·컴시간) 제거 → 드롭다운 하나로 교체. 각 소스 모달 트리거 연결.
- **프론트엔드 디자인 에이전트 협업 필수**(feedback: UI 단독 금지).

### 테스트 (컴시간 스타일)

- `appinRules.test.ts`(손수 grid 픽스처), `AppinApiClient.test.ts`(transport 주입), `neisTeacherReconstruct.test.ts`(수업반+학급표 픽스처), `AutoSyncAppinTimetable.test.ts`(포트 mock).

---

## 단계별 구현 순서 (ralph 스토리)

- **P1 압핀 기반**: entities/ports/rules/infra/IPC/DI/프록시 + 단위테스트. (통신·파싱 검증)
- **P2 압핀 학급 불러오기**: AppinClassImportModal → `handleNeisImport` 재사용 + 실학교 파싱.
- **P3 불러오기 UI 통합**: ImportSourceMenu 드롭다운으로 나이스·컴시간·압핀 통합(디자인 협업).
- **P4 압핀 교사 불러오기**: AppinTeacherImportModal(교사번호) → 미리보기.
- **P5 압핀 자동 변경감지**: usecase/hook/diff + App 등록 + settings.appin.
- **P6 나이스 교사 재조합**: 규칙+usecase+모달+미리보기(선택과목 제외 안내).

---

## 검증 (완료 게이트)

- 각 단계: `npx tsc --noEmit`(0) · `npm run lint` · `npm run test`(vitest) · `npm run regression-check`.
- 단위테스트: 압핀 파싱/재조합/자동연동 순수 로직.
- 실동작: `npm run electron:dev`로 실학교(예: 압핀 등록 학교) 불러와 화면 확인 — 학급/교사 그리드가 실제로 채워지는지. (electron IPC 변경 → build-electron 재번들 필요.)
- 아키텍처 리뷰(architect): 레이어 경계·import 규칙·SSRF 가드.

## 열린 리스크

- 나이스 교사 재조합 정확도(과목명·학급 매핑) → 미리보기 필수, 선택과목 제외.
- 압핀은 남의 서버(sgpap.com) → 조회량 최소화, 규격 변경 시 깨질 수 있음(자동연동 스로틀은 컴시간과 동일 하루1회).
- IPC 변경마다 electron 재빌드·재시작(watch 아님).
