# 담임 출결 기능 4종 추가 — 구현 계획 (attendance-neis-audit-suite)

모드: **DELIBERATE**
상태: **consensus 승인** — Planner v1 → Architect(SOUND-WITH-CHANGES, 6건) + Critic(ITERATE, 필수 9건) → Planner v2 → Architect 재검토(SOUND-WITH-CHANGES, 잔여 N1 1건·비차단) → Critic **APPROVE(조건부)**. 승인 조건 N1(통계 서류 열 색상 술어·빈 가드 분모 교체)은 본 문서 M4에 반영 완료(재비준 불요 조건).
**⚠️ pending approval — 사용자 실행 승인 대기. 승인 전 구현 착수 금지.**

> **v2 변경 요약(리뷰 반영 9건):** ①§0 CSV 사실 오류 정정 ②A 파서 CSV 삭제 ③A를 도메인 코어(지금)/파서·UI(rawRows 폴백+베타 홀드)로 분할하고 실행 순서를 위험-조정 가치 기준으로 재확정(C·B·A코어 지금 → D-1·A파서·UI는 게이트) ④B 훅을 3개 편집 핸들러로 정밀화+디바운스/디듑 ⑤D 배너(술어 교체)/통계(분모 재정의) 산식 구분 명문화 ⑥리스크 표에 Settings whole-file LWW 1행 추가 ⑦A 반영-쓰기 도메인 매핑(AttendanceRecord→StudentRecord ID) 명세 ⑧requiresDocument 다중 교시 집약 규칙+attendancePeriods 결측 진리표 ⑨B 부분일치 매칭 의미 정의+월-스캔 조회 경로 확인. **+승인 조건 N1: M4 색상 술어·빈 가드 분모 세트 교체 반영.**

---

## 0. 코드베이스 확인 결과 (계획의 사실 근거)

읽고 확인한 자산 (모두 절대경로):

- `e:\github\ssampin\src\domain\entities\StudentRecord.ts` — `reportedToNeis?`, `documentSubmitted?`(단일 boolean), `attendancePeriods?`(교시별 `{period,status,reason?,memo?}` 배열), `updatedAt?`(병합 근거), `tags?`. 신규 필드는 **additive optional** 패턴.
- `e:\github\ssampin\src\domain\entities\Attendance.ts` — `AttendanceReason = '질병'|'인정'|'미인정'|'기타'`, `StudentAttendance{number,status,reason?,memo?,grade?,classNum?}`, `AttendanceRecord{classId,groupId?,date,period,students[],updatedAt?}`(레코드 단위 병합).
- `e:\github\ssampin\src\domain\rules\attendanceRules.ts` — `summarizeNeisAttendance`(일 단위 대표 접기 + '인정' 사전 필터 + `byReason` 질병/미인정/기타/인정, `:319-437`), `pickRepresentativeAttendance`, `computeAutoPeriods`. **별표8 §3 규칙이 이미 반영됨** — A/C/D는 이 위에 얹어야 하며 규칙을 깨면 안 됨.
- `e:\github\ssampin\src\adapters\components\Homeroom\Records\AttendanceStatusBanners.tsx` — 과다 카운트 근원 확인(`:44-47`): 서류 배너가 `category==='attendance' && !documentSubmitted` **부정 필터**로 **모든** 출결 기록을 '서류 필요'로 집계. D-1이 술어를 교체할 지점. (나이스 미반영 배너는 `!reportedToNeis` — 서류와 별개이며 과다 카운트 대상 아님.)
- `e:\github\ssampin\src\adapters\components\common\records\RecordCompletionBadge.tsx` — 공용 토글 배지(표시만). D는 배지가 아니라 **상위 '요구 여부' 산식**을 고침.
- `e:\github\ssampin\src\adapters\components\Homeroom\Records\ProgressMode.tsx` — 통계 탭. `NeisAttendanceSection`(생기부 기준 집계, `showBreakdown`/`showExcused` 토글, PDF/HWPX/Excel 내보내기), `StatsPeriod = 'week'|'month'|'custom'|'all'`. **서류 완료율은 긍정 완료율 산식**(`:780-786`: `docSubmitted`/`attendanceTotal`, 분모=`attendanceTotal`; 렌더 형제 술어 `:1261-1269` — 색상 `docSubmitted<attendanceTotal`·빈 가드 `attendanceTotal>0`). C와 A-UI의 자연스러운 거처(통계 탭은 타 세션의 조회 탭 리디자인과 별개).
- `e:\github\ssampin\src\adapters\components\Homeroom\Records\HomeroomAttendanceGrid.tsx` — **담임 단일 기록자**. 팔레트(종류·사유·비고)→칸 클릭→`computeAutoPeriods`→전-행 재작성→`commitEdit`(`:273-277`)→자동저장(`onSaveDay` 위임). **스토어 직접 import 금지**(`:39`). 편집 핸들러: `handleCellClick`(`:352`, 비-지우개 분기 `:363-378`), `handleMemoEdit`(`:418-441`), `applyText`(`:533-568`). **주의: `commitEdit`는 `undo`(`:467`)/`redo`(`:484`)/`clearStudentDay`(`:402`)/`clearToday`(`:516`)도 호출** — B 훅은 `commitEdit` 공유 지점이 아니라 3개 편집 핸들러에 직접 걸어야 되돌리기·지우기 오경보를 차단한다.
- `e:\github\ssampin\src\adapters\components\Homeroom\Records\AttendanceMode.tsx` — 그리드 호스트. `useSettingsStore` 구독(`:47-48`) → B 키워드 읽기 적소. `attendanceRecordsAll = useTeachingClassStore(s => s.attendanceRecords)`(`:55`) 구독 → B 월-스캔 데이터 출처. `saveGridDay`가 `saveDayAttendance → bridgeHomeroomDayAttendance` 순서 소유(`:102-125`). bridge가 `att-{studentId}-{date}` StudentRecord를 조립(`useStudentRecordsStore.ts:447-492`, bridgeId `:459` — (studentId,date)당 정확히 1건 집약).
- `e:\github\ssampin\src\adapters\components\Homeroom\Records\__tests__\attendanceSingleWriter.metatest.test.ts` — **깨면 안 되는 6종 메타가드**: (1) InputMode에 `ATTENDANCE_TYPES`/`saveDayAttendance`/`bridge`/`HomeroomAttendanceGrid` 부재(`:26-37`), (2) 출결 입력구는 AttendanceMode 유일(`:39-43`), (3) 번호충돌 렌더 게이트(`:45-51`), (4) 저장 순서 saveDayAttendance→bridge(`:53-67`), (5) 그리드 셸 `@adapters/stores/` import 0(`:69-71`), (6) 좌석 뷰 편집액션 import 0(`:73-81`). + `const periodCount = maxPeriods ?? 7` 단일 출처(`:83-89`).
- `e:\github\ssampin\src\infrastructure\parse\sheetGrid.ts` — **`loadSheetGrid`는 xlsx(exceljs) + HTML표-as-xls 폴백 두 경로뿐이다(`:37-60`). CSV 파싱 코드는 없다.** ⚠️ **v1 §0의 "HTML표 폴백/CSV 분기 이미 존재"는 거짓이었고 v2에서 삭제·정정한다.** `decodeSheetBytes`(`htmlTableGrid.ts:119-134`)의 EUC-KR/UTF-8 처리도 **HTML표 경로 전용**이지 범용 CSV 파서가 아니다. `infrastructure/parse` 전체에 CSV 파서 0건(grep 확인).
- `e:\github\ssampin\src\infrastructure\parse\htmlTableGrid.ts` (`:1-11`) — 나이스 조회 화면의 [엑셀]은 대개 진짜 xlsx가 아니라 **"HTML표를 .xls로 저장"한 파일**이며, 이는 성적 다운로드와 동일 경로로 `loadSheetGrid`가 이미 커버. A는 이 검증된 단일 경로만 재사용.
- `e:\github\ssampin\src\infrastructure\parse\NeisGradeExcelParser.ts` (`:24-33`) — A가 따를 파서 형: infra = `loadSheetGrid` + 도메인 컬럼인식/파싱 위임. **CSV 분기 없음.** 자동인식 실패 시 `rawRows` 수동 매핑 폴백 선례(`:32`) — A도 이를 채택.
- `e:\github\ssampin\scripts\emit-entity-samples.mjs` (`:62-93`) — `ENTITY_FIELD_CONTRACT.studentRecord.mirrored`에 `reportedToNeis`/`documentSubmitted`/`attendancePeriods`/`tags` 등록. 강제 메타테스트 `src\usecases\aiBridge\__tests__\entitySampleContract.meta.test.ts` 실재. **StudentRecord 신규 필드 추가(D-2) 시 이 계약 + SAMPLES 갱신 필수.**
- `e:\github\ssampin\src\usecases\sync\syncRegistry.ts` — `settings`(#1, `:64-72`, **whole-file · `subscribeExcluded` · 필드 단위 병합 없음(LWW)**)와 `student-records`(#10, `:146-153`) 이미 등록. **본 4종은 기존 동기화 엔티티에 필드만 추가 → 새 동기화 도메인 없음 → App.tsx/syncRegistry 신규 등록 불필요.**
- `e:\github\ssampin\src\domain\entities\Settings.ts` (`:409-577`) — additive optional 도배(`homeroomRecordTags?:415` 등). B 키워드·D 정책은 **Settings의 새 optional 필드**로 두면 'settings' 동기화 편승(레지스트리 변경 0). (단, whole-file LWW 특성은 §3 리스크에 반영.)
- `e:\github\ssampin\src\adapters\stores\useStudentRecordsStore.ts` (`:134,337-340`) — `bulkMarkNeisReported`(StudentRecord **id** 배열로 `reportedToNeis` 변경) 실재. **A 반영-쓰기는 이 함수를 재사용하되, 감사 매치(AttendanceRecord 도메인)→StudentRecord id 해석 단계가 선행돼야 함(§2 M5·§8 Open Question 명세).**

---

## 1. RALPLAN-DR 요약

### Principles (원칙)

1. **단일 기록자 불변식 우선.** 담임 단일날짜 출결의 유일 기록자는 출결 그리드다. 어떤 기능도 이 경계를 넘거나 메타가드 6종을 우회하지 않는다(가드를 고쳐 통과시키지 않는다).
2. **읽기-우선, 쓰기는 명시 동의로만.** 대조·경고·집계는 기본 비파괴(읽기)다. 사용자 데이터(reportedToNeis 등) 자동 변경은 사용자가 버튼으로 확인할 때만 한다.
3. **엔티티 표면 최소 변경.** 가능하면 Settings의 optional 필드와 순수 도메인 함수로 해결한다. StudentRecord 스키마 확장(D-2)은 정말 필요할 때만, 계약(ENTITY_FIELD_CONTRACT)·병합(updatedAt)·하위호환을 세트로 처리한다.
4. **규정·코드 정합.** 규정 의존 문구·산식은 기재요령 원문 확인 후 확정한다(별표8 §3 라·바·사). **사실 근거(§0)는 코드로 검증된 것만 적는다**(v1 CSV 오류 재발 방지). 기본 키워드·기본 서류요구는 규정 충돌 회피를 위해 비워둔다.
5. **위험-조정 가치로 배열·출시.** 각 기능은 검증 게이트를 개별 통과하고 독립 커밋 가능해야 한다. **실행 순서는 우선순위 숫자가 아니라 (가치 ÷ 위험 × 비차단 여부)로 정한다** — 불확실·외부차단된 부분은 뒤로, 확실·비차단·고통 해소는 앞으로.

### Decision Drivers (상위 3)

1. **실물 나이스 파일 부재(방학 중).** A의 **컬럼 매핑·파서·UI**는 실물로만 검증 가능 → 합성 픽스처로는 나이스가 아니라 픽스처 저자 가정만 검증됨. A의 확실한 **도메인 코어(diff)**와 불확실한 **파서·UI**를 분할한다.
2. **동시 세션 충돌 위험.** `SearchMode.tsx` 및 Records **조회 탭** 리디자인은 타 세션 미커밋 영역이고, 서류 배너(`AttendanceStatusBanners`)는 조회 탭에서도 렌더된다 → **D-1은 타 세션 커밋 완료 후 착수.** A-UI·C는 **통계 탭**(별개)에 두어 충돌 회피.
3. **동기화·하위호환 안전.** 신규 필드는 additive optional. Settings는 whole-file LWW(필드 병합 없음), StudentRecord는 레코드 단위 updatedAt 최신우선. D-2 스키마 확장 시 엔티티 계약 갱신 필수.

### Viable Options (기능별 핵심 결정)

#### 결정 A-1: 나이스 파서 입력 포맷

- **옵션 (a) 검증된 단일 경로(xlsx + HTML표-as-xls, `loadSheetGrid` 재사용)** _(채택)_
  - 장점: 나이스 [엑셀]=HTML표-as-xls라는 코드·프로젝트 메모리 근거(`htmlTableGrid.ts:1-11`)와 정합, 성적 파서 선례(`NeisGradeExcelParser`)와 일관, 추측 표면 최소.
  - 단점: 실물이 다른 포맷을 주면 `rawRows` 수동 매핑 폴백으로 흡수(선례 존재).
- **옵션 (b) CSV(UTF-8) 분기 신규 추가** _(무효화)_
  - 단점: **코드·실물 근거 0.** 구분자/따옴표 escape/인코딩 전부 추측 → "CSV와 HTML이 동일 `NeisAttendanceRow[]`를 낸다"는 검증은 나이스가 아니라 픽스처 저자 가정만 확인. **→ 무효화: 실물 나이스가 CSV 제공을 증명할 때까지 out-of-scope.** (도메인 diff 로직은 입력 포맷과 무관하므로 손실 없음.)

#### 결정 A-2: A 착수 시점 분할

- **A 도메인 코어(지금 착수, 완전 테스트):** `NeisAttendanceRow` 타입 + `compareAttendance(ssampinSide, neisRows): AuditDiff`(별표8 §3·`byReason`·'인정' 사전필터 정합 diff) + 식별/매칭 규칙. **손으로 작성한 `NeisAttendanceRow[]` 입력으로 유닛 테스트** — 그리드·파일·UI 무의존. 재사용 가능 저위험 자산.
- **A 파서·UI(게이트: 개학 후 실물 파일, 베타 홀드):** `parseNeisRows`(grid→rows 컬럼 매핑 확정) + infra `neisAttendanceFile.ts`(xlsx/HTML-as-xls) + `NeisAuditModal` UI + `rawRows` 수동 매핑 폴백 + **베타 라벨** + 반영-쓰기 도메인 매핑(§2 M5).
- **근거:** Driver #1(위험 최소화)과 Principle 5를 우선순위와 화해 — 확실한 부분은 지금, 불확실한 부분은 실물 대기.

#### 결정 D-1/D-2: 증빙서류 데이터 모델

- **D-1 (채택, 우선 착수분) — 단일 boolean 유지 + 정책 기반 '요구 여부' 파생:** StudentRecord 스키마 변경 0, 엔티티 계약/병합 변경 0, 과다 카운트 즉시 해소, 하위호환 완전. 서류 '종류별' 체크(② 체크리스트)는 미지원.
- **D-2 (선택, 게이트: D-1 완료 + 사용자 채택) — StudentRecord `documents?` 구조체 신설:** 종류별 체크리스트 완전 지원. `ENTITY_FIELD_CONTRACT`+SAMPLES 갱신·boolean↔배열 하위호환·배열 병합(레코드 단위 updatedAt 편승) 필요.

#### 결정 Order: 실행 순서 _(위험-조정 가치로 확정 — §2.0에 명세)_

- **채택안:** C → B → A(도메인 코어) 를 **지금** 착수(비차단·확실·저위험) → D-1(실사용 고통 해소, 타 세션 게이트) → A(파서·UI, 개학 게이트·베타) → D-2(선택). **A의 사용자 대면 파서/UI가 실물 검증에 묶이는 동안 C·B·D-1이 먼저 출시된다.**
- **기각한 v1 (a) A→B→C→D:** "가장 크고 외부 차단된 A를 맨 앞"은 위험 역배열(Driver #1과 충돌) → 미채택.

---

## 2. 단계별 구현 계획

각 마일스톤은 개별 검증 게이트(`npx tsc --noEmit` 0 / `npm run lint` / `npm run test` / `npm run regression-check`)를 통과하고 독립 커밋 가능해야 한다.

### 2.0 실행 순서 확정 (위험-조정 가치順)

| #            | 마일스톤                                                                                                | 착수 게이트                           | 위험-조정 근거                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **M1**       | **C** — 연간 누적 필터 + 개근 뷰                                                                        | 없음(지금)                            | 최소·무파일·무그리드·무-크로스세션(통계 탭). 가장 확실한 즉시 출시.                                  |
| **M2**       | **B** — 사유 키워드 반복 경고                                                                           | 없음(지금)                            | prop 주입(그리드 store-free 유지)·무파일. 저위험, 실사용 가치.                                       |
| **M3**       | **A 도메인 코어** — `compareAttendance`+타입+매칭                                                       | 없음(지금)                            | 완전 테스트 가능·재사용 저위험 자산. 사용자 가치는 M5에서 실현(내부 선-확정).                        |
| **M4**       | **D-1** — 과다 카운트 교정(배너 술어 교체 + 통계 분모 재정의)                                           | **타 세션 Records 조회 탭 커밋 완료** | 실사용 고통 최우선 해소이나 서류 배너가 조회 탭 렌더 영역과 겹쳐 게이트 존재. 게이트 해제 즉시 착수. |
| **M5**       | **A 파서·UI** — `parseNeisRows` 컬럼확정+infra loader+`NeisAuditModal`+rawRows 폴백+베타+반영-쓰기 매핑 | **개학 후 실물 나이스 파일 확보**     | 고가치·고위험·외부차단. 확실한 M3 뒤로 홀드.                                                         |
| **M6**(선택) | **D-2** — 서류 종류 체크리스트(StudentRecord 확장)                                                      | **D-1 완료 + 사용자 채택 결정**       | 엔티티 계약/병합 변경 트리거. 필요 확인 시에만.                                                      |

> "D-1·B·C 선행 출시" = 이 넷(C, B, A코어, D-1)이 모두 A의 사용자 대면 파서/UI(M5) **앞에** 놓인다. 비차단인 C·B·A코어가 먼저, D-1은 크로스세션 게이트 해제 즉시.

---

### M1 — 연간 누적 필터 + 개근 파악 뷰 (C)

**대상 파일 (레이어별)**

- `domain/rules/attendanceRules.ts` — 소형 순수 헬퍼 추가: `countWithReasonFilter(counts, includedAxes)`, `isPerfectAttendance(counts, includedAxes)`. 기존 `summarizeNeisAttendance.byReason` 재사용, 별표8 규칙(인정 기본 제외) 유지.
- `adapters/components/Homeroom/Records/ProgressMode.tsx`(`NeisAttendanceSection`) — '전체 기간' 집계에 구분 축(인정/질병/미인정/기타) 포함·제외 토글 + 개근 후보 뷰(선택 축 제외 후 결석/지각/조퇴/결과 0인 학생). "최종 확인은 나이스 기준" 고지 문구.

**신규 엔티티/필드:** 없음(순수 가법, UI 상태만).

**테스트 전략:** 헬퍼 유닛(축 토글에 따른 합계 변화, 인정 제외 기본에서 개근 후보 정확성). 기존 표 스냅샷 회귀 없음(불변).

**완료 기준(테스트 가능):**

- '전체' 기간 + 인정 제외(기본)에서 인정 기록만 있는 학생이 개근 후보로 표시(유닛).
- 질병 축 토글 시 합계·개근 후보 재계산(유닛).
- 고지 문구 노출(스모크).

---

### M2 — 사유 키워드 반복 경고 (B)

**대상 파일 (레이어별)**

- `domain/entities/Settings.ts` — `attendanceReasonKeywords?: readonly string[]`(additive optional). **기본값 없음.** 'settings' 동기화 편승(레지스트리 무변경).
- `domain/rules/attendanceKeywordRules.ts` (신규 순수 함수) — `findRepeatedKeyword({ monthEntries, keywords, studentNumber, text }): { keyword; priorDate } | null`. 엔티티 변경 없음(기존 memo/reason 텍스트에서 파생).
- `adapters/components/Settings/...` — 키워드 등록 UI. **기존 출결 관련 설정 섹션 내 추가(탭 id·라벨 불변 규칙 준수)**, 새 탭 id 금지.
- `adapters/components/Homeroom/Records/AttendanceMode.tsx` — settings에서 키워드 읽어 그리드에 prop `reasonKeywords` 주입 + **월-스캔 콜백 `scanMonthForKeyword` 제공**(그리드 store-free 유지).
- `adapters/components/Homeroom/Records/HomeroomAttendanceGrid.tsx` — **3개 편집 핸들러에만** 스캔 부착.

**B 훅 지점 정밀화 (공유 `commitEdit` 금지):**

- 부착 지점: `handleCellClick`(**비-지우개 분기만**, `:363-378`) · `applyText`(`:533`) · `handleMemoEdit`(`:418`). **`commitEdit`(공유)에 걸지 않는다** — `undo`/`redo`/`clearStudentDay`/`clearToday`도 `commitEdit`를 호출하므로 되돌리기·지우기에 키워드 경고가 오작동한다.
- 디바운스/디듑: 다중 칸 편집(전-행 재작성, 텍스트 일괄 적용) 시 매 편집마다 배너가 뜨지 않도록 **스캔 결과를 디바운스(예: 그리드 자동저장과 별개 짧은 창)하고 (studentNumber, keyword) 단위로 디듑**한다. 경고는 **비차단 배너/토스트**로 `commitEdit`·저장 흐름과 독립(저장은 그대로 진행).

**B 부분일치 매칭 의미 + 월-스캔 경로:**

- 매칭 의미: **substring · 대소문자 무시**(정규화: `toLowerCase`, 한글은 대소문자 없음). 단어 경계 없음 → "원"이 "병원/학원/지원"을 매치할 수 있음을 명시하고, **오탐 완화는 사용자가 구체적 키워드("병원") 등록으로**(기본 키워드 0개가 1차 완화). 단어 경계/정확일치 옵션은 후속 확장 여지로만 남김.
- 월-스캔 데이터 출처: `scanMonthForKeyword(studentNumber, monthPrefix)`는 **그날 그리드 매트릭스 밖의 해당 월 전체 attendanceRecords**를 조회한다. AttendanceMode는 `attendanceRecordsAll = useTeachingClassStore(s=>s.attendanceRecords)`(`:55`)를 이미 구독하므로, `attendanceRecordsAll.filter(r => r.classId===className && r.date.startsWith('YYYY-MM')).flatMap(r=>r.students).filter(s=>s.number===studentNumber)`로 memo/reason 텍스트를 수집해 콜백이 반환한다. **그리드는 store 미import(콜백만 prop 주입) — 메타가드 (5) 보존.** 착수 전 이 월 조회 경로 1줄 재확인.

**신규 엔티티/필드:** Settings에 optional 1개.

**규정 확인 필요:** 경고 문구는 기재요령 원문 확인 후 확정(Open Question). 차단 아님 명시.

**테스트 전략:** 도메인 유닛 — 같은 달 탐지, 월 경계(전월 발생 시 무경보), 교차월 오탐 없음, substring·대소문자 무시 동작, "원↔병원" 오탐 경계 케이스. 그리드: 3개 핸들러에서만 경고 표출 + `undo`/`clearToday`에서 무경보 + 저장 완료. 메타가드 6종 유지(그리드 store import 0).

**완료 기준(테스트 가능):**

- 키워드 "병원" 등록 후, 같은 달 같은 학생에 "병원" 포함 선행 기록이 있을 때 `handleCellClick`(비-지우개)/`applyText`/`handleMemoEdit`로 새 저장 → 비차단 경고 표시 + 저장 완료(유닛+그리드).
- `undo`/`redo`/`clearToday`/`clearStudentDay` 실행 시 경고 미표출(그리드).
- 다른 달이면 무경보. 다중 칸 편집에서 배너 중복/폭주 없음(디듑, 그리드).
- 기본 제공 키워드 0개. 메타가드 6종 유지.

---

### M3 — 나이스 출결 대조 점검: 도메인 코어 (A, 지금 착수분)

**대상 파일 (레이어별)**

- `domain/rules/neisAttendanceAuditRules.ts` (신규, 순수 함수 · 외부 import 0)
  - 타입: `NeisAttendanceRow { date; number; name?; status; periods?; reason? }`, `AuditDiff { onlyInSsampin[]; onlyInNeis[]; mismatch[] }`(mismatch = 구분/교시 차이).
  - `compareAttendance(ssampinSide, neisRows): AuditDiff` — `studentNumber`로 식별, 이름 표기차(공백/한자) 완화, '인정' 취급을 별표8 규칙(`attendanceRules.ts:319-437`)과 정합. **입력은 이미 파싱된 `NeisAttendanceRow[]`와 쌤핀 측 집약(`attendanceRecords`→`summarizeNeisAttendance` 또는 직접 재구성)** — 파일·그리드 무의존.

**신규 엔티티/필드:** 없음(도메인 타입만, 저장 스키마 무변경).

**테스트 전략:** 도메인 유닛 — **손으로 작성한 `NeisAttendanceRow[]`**와 알려진 쌤핀 기록셋으로 `compareAttendance`의 onlyInSsampin/onlyInNeis/mismatch 정확성. 케이스: 쌤핀-only / 나이스-only / 구분 차이 / 교시 차이 / 이름 표기차 / 인정 사유. **컬럼 매핑·파일 파싱은 이 단계에 포함하지 않음(M5).**

**완료 기준(테스트 가능):**

- 손 작성 픽스처 `NeisAttendanceRow[]` + 알려진 쌤핀 기록셋 → `compareAttendance`가 3분류 건수를 정확 반환(유닛).
- '인정' 사유가 별표8 규칙대로 diff에서 취급됨(유닛).
- 파일·UI·CSV 관련 완료 기준은 이 단계에 없음(M5로 이월).

---

### M4 — 증빙서류 세분화: 과다 카운트 교정 (D-1) — **착수 게이트: 타 세션 Records 조회 탭 커밋 완료 확인 후**

**대상 파일 (레이어별)**

- `domain/entities/Settings.ts` — `attendanceDocumentPolicy?`(구분×상태별 서류 요구: 출석인정 기본 요구, 질병/기타/미인정의 지각·조퇴·결과는 학교 방침 선택). additive optional, 'settings' 동기화 편승.
- `domain/rules/attendanceDocumentPolicy.ts` (신규 순수 함수) — `requiresDocument(record, policy): boolean` + 기본 정책 상수(출석인정만 요구).
- 과다 카운트 교정 소비처 **(배너·통계 산식 구분 명문화)**:
  - **배너 = 술어(predicate) 교체:** `adapters/components/Homeroom/Records/AttendanceStatusBanners.tsx:44-47`의 서류 부정 필터 `!r.documentSubmitted` → `requiresDocument(r, policy) && !r.documentSubmitted`. (나이스 미반영 배너 `!reportedToNeis`는 불변 — 서류 과다 카운트와 무관.)
  - **통계 = 분모(attendanceTotal) 재정의:** `adapters/components/Homeroom/Records/ProgressMode.tsx:780-786`의 `${docSubmitted}/${attendanceTotal}` 서류 완료율에서 **분모를 '서류 요구 대상'으로 재정의** — `attendanceRequiringDoc = studentRecs.filter(r=>r.category==='attendance' && requiresDocument(r, policy))`, `docSubmitted = ...filter(requiresDocument && documentSubmitted)`, 표시 `${docSubmitted}/${attendanceRequiringDoc.length}`. **"N중 M"의 의미가 '서류 요구 N건 중 제출 M건'으로 정합 유지.** (나이스 열 `neisReported/attendanceTotal`의 분모는 전체 `attendanceTotal` 불변 — 나이스 반영은 전 출결 대상.)
  - **[N1·승인 조건] 형제 술어도 세트 교체:** 서류 열의 **색상 술어**를 `docSubmitted < attendanceRequiringDoc.length`로, **빈 가드**를 `attendanceRequiringDoc.length > 0 ? … : '-'`로 함께 교체(`ProgressMode.tsx:1267-1269`). 분모만 바꾸면 "3/3 전부 제출" 학생이 `docSubmitted(3) < attendanceTotal(10)` 판정으로 주황색 오표시되고, 요구 0건 학생이 '-' 대신 '0/0'으로 뜬다.
  - `RecordCompletionBadge.tsx` 소비처 — 배지 컴포넌트 자체 불변, **표시 여부를 `requiresDocument`로 게이트**.
- 설정 UI — 정책 편집 섹션(기존 설정 섹션 내, 탭 id 불변).

**`requiresDocument` 다중 교시 집약 + `attendancePeriods` 결측 진리표:**

`StudentRecord.attendancePeriods`는 교시별 `(status, reason)` 배열이라 한 record가 서로 다른 축을 동시에 가질 수 있다. 집약·결측 규칙:

| 케이스                 | 입력                                               | `requiresDocument` 결과 규칙                                                                                                                                                                  |
| ---------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 단일 교시              | `[{late, 질병}]`, 정책=질병 지각 미요구            | 각 교시 정책 판정 → **false**                                                                                                                                                                 |
| 단일 교시              | `[{absent, 인정}]`, 정책=인정 요구                 | **true**                                                                                                                                                                                      |
| 다중 교시(혼합)        | `[{late,질병}(미요구), {classAbsence,인정}(요구)]` | **OR 집약: 어느 한 교시라도 요구면 요구 → true**                                                                                                                                              |
| 다중 교시(전부 미요구) | `[{late,질병}, {earlyLeave,기타}]`, 둘 다 미요구   | **false**                                                                                                                                                                                     |
| **결측(레거시)**       | `attendancePeriods === undefined`                  | subcategory에서 status 추론(`getAttendanceTypeFromSubcategory` 존재), **reason 미상 → '기타'로 간주**하여 정책 적용. 정책상 '기타' 계열 미요구면 **false**(보수적 — 과다 카운트 재유입 방지). |
| 빈 배열                | `attendancePeriods === []`                         | 결측과 동일 취급(위 규칙).                                                                                                                                                                    |

집약 규칙 = **OR("어느 한 교시라도 요구면 그 record는 서류 요구")**. 결측/빈 배열의 기본 동작은 **보수적 false 우선**(정책 미설정·레거시가 과다 카운트를 되살리지 않게).

**신규 엔티티/필드:** Settings에 optional 1개(policy). StudentRecord 무변경.

**테스트 전략:** `requiresDocument` **진리표(위 6케이스) 유닛**. 배너 과다 카운트 회귀(교정 전/후 카운트 차이). 통계 분모 재정의 회귀("N중 M" 값 정합). 마이그레이션(정책 미설정 + `documentSubmitted`/`attendancePeriods` undefined 기존 데이터 → 기본 정책·보수적 false로 무크래시).

**완료 기준(테스트 가능):**

- 기본 정책(출석인정만 요구)에서 질병 결석은 서류 미제출 배너에서 사라지고, 출석인정 기록은 남음(유닛+컴포넌트).
- 다중 교시 혼합 record가 OR 집약으로 판정됨(진리표 유닛).
- `attendancePeriods` 결측 레거시가 보수적 false로 안전 동작(유닛).
- 통계 서류 열이 `${docSubmitted}/${attendanceRequiringDoc.length}`로 분모 재정의되고 나이스 열 분모는 불변(컴포넌트).
- **[N1] 요구 서류 전부 제출 학생은 주황이 아닌 녹색으로, 요구 0건 학생은 '0/0'이 아닌 '-'로 표시(컴포넌트).**
- 정책을 '미인정 지각 요구'로 바꾸면 배너·통계 카운트 변동(유닛).

---

### M5 — 나이스 출결 대조 점검: 파서·UI (A, 게이트: 개학 후 실물 파일 · 베타 홀드)

**대상 파일 (레이어별)**

- `domain/rules/neisAttendanceAuditRules.ts` — `parseNeisRows(grid: unknown[][]): NeisAttendanceRow[]` 추가(헤더 자동인식: 일자/번호/성명/출결구분/결시교시/사유, 관용적 별칭·열순서 흡수). **컬럼 매핑은 실물 파일로 확정.**
- `infrastructure/parse/neisAttendanceFile.ts` (신규, 얇은 파서 — `NeisGradeExcelParser` 형) — `loadSheetGrid`(**xlsx + HTML표-as-xls 폴백 두 경로뿐, CSV 없음**) → grid → 도메인 `parseNeisRows` 위임. 자동인식 실패 시 `rawRows` 상위 일부 반환(수동 매핑 폴백, 선례 `NeisGradeExcelParser.ts:32`).
- `adapters/components/Homeroom/Records/NeisAuditModal.tsx` (신규 UI)
  - 진입점: **통계 탭 `NeisAttendanceSection` 내 "나이스 대조" 버튼**(조회 탭/`SearchMode.tsx` 미접촉). 업로드/붙여넣기 → `compareAttendance` 3분류 결과 표 → 자동인식 실패 시 `rawRows` 수동 매핑 UI. **베타 라벨 + "개학 후 실물 검증" 고지.**

**결정(대조 일치 건 reportedToNeis 자동 완료 여부):** **자동 쓰기 금지.** 기본 읽기 전용 감사. 사용자가 "일치 N건 나이스 반영 표시"를 눌러 확인할 때만 반영.

**A 반영-쓰기 도메인 매핑 명세 (MAJOR 해소):**
감사 입력은 **AttendanceRecord** 도메인(classId/date/period/`students[].number`)이지만, `bulkMarkNeisReported`는 **StudentRecord**(id 배열, `category='attendance'`, `reportedToNeis`)를 변경한다. 두 도메인은 별개이므로 매치→ID 해석 단계를 명문화한다:

1. `compareAttendance`의 일치 매치에서 **(studentNumber, date)** 키를 추출.
2. **studentNumber → studentId** 해석(담임 명렬 로스터; A 호스트가 students 보유).
3. **(studentId, date, category='attendance')로 StudentRecord 해석** — 담임 출결 미러는 하루 1건 집약(`att-{studentId}-{date}`, bridge 규칙 `useStudentRecordsStore.ts:459`)이므로 해당 record.id를 조회.
4. 수집한 **record.id 배열**(Set 디듑)을 `bulkMarkNeisReported([...ids])`에 전달.

- 실행 가능성: (studentId, date) 키로 결정적 매핑 가능(Architect 코드 확증 — bridgeId가 (studentId,date)당 정확히 1건). 순진하게 summarize 출력을 그대로 넘기면 no-op/타입오류 → 위 4단계를 M5 착수 전 확정.

**테스트 전략:** `parseNeisRows` 유닛(합성 픽스처 HTML표-as-xls 1종 + 실물 확보 후 실물 픽스처로 대체). 반영-쓰기 매핑 유닛((studentNumber,date)→record.id 해석, no-op 케이스). UI 스모크(브라우저 모드). **실물 왕복은 개학 후.**

**완료 기준(테스트 가능):**

- `parseNeisRows`가 HTML표-as-xls grid를 `NeisAttendanceRow[]`로 파싱(유닛). **CSV 관련 완료 기준 없음(삭제됨).**
- 자동인식 실패 시 `rawRows` 수동 매핑 폴백 동작(스모크).
- "반영 표시"가 (studentNumber,date)→(studentId,date,category='attendance')→record.id 해석을 거쳐 `bulkMarkNeisReported`로 확인 후에만 `reportedToNeis` 변경(유닛+스모크).
- 베타 라벨·"개학 후 실물 검증" 고지 노출(스모크).

---

### M6 (선택) — 증빙서류 세분화: 서류 종류 체크리스트 (D-2, 게이트: D-1 완료 + 사용자 채택)

- `domain/entities/StudentRecord.ts` — `documents?: readonly { kind; submitted }[]`(additive optional).
- `scripts/emit-entity-samples.mjs` — `ENTITY_FIELD_CONTRACT.studentRecord.mirrored`에 `documents` 추가 + SAMPLES 갱신(+ 배열 하위 인터페이스면 별도 계약). 강제 메타테스트(`entitySampleContract.meta.test.ts`) 통과 필수.
- 병합/하위호환: 레코드 단위 updatedAt 최신우선에 편승(쓰기 경로 updatedAt 스탬프 확인). `documentSubmitted` boolean = "요구 서류 전부 제출"로 파생하거나 override로 유지 — 규칙 명문화.
- **테스트:** 계약 스냅샷 테스트 + boolean↔배열 하위호환 유닛 + 병합 유닛.

---

## 3. 리스크와 완화책

| 리스크                                               | 영향                                                                                                    | 완화책                                                                                                                                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **실물 나이스 파일 부재**                            | A 파서 컬럼/포맷 오추정 → 오대조·베타 거짓 신뢰                                                         | **A 분할**(도메인 코어 지금·파서/UI 개학 게이트), `rawRows` 수동 매핑 폴백, **베타 라벨**, 자동 쓰기 금지(읽기 전용 기본), **CSV 분기 삭제**(검증된 xlsx/HTML-as-xls만)                                                        |
| **타 세션 충돌** (`SearchMode.tsx`/조회 탭 리디자인) | 동시 수정 소실·충돌                                                                                     | A-UI·C는 **통계 탭**(별개)에 배치, `SearchMode.tsx` 직접 수정 금지, **D-1은 타 세션 커밋 완료 확인 후 착수**(착수 전 `git status --short`)                                                                                     |
| **동기화 병합/과다카운트 회귀**                      | 기기 간 데이터 유실·오집계                                                                              | B·D 정책은 Settings additive optional. D-2 StudentRecord 필드 시 `ENTITY_FIELD_CONTRACT`+SAMPLES 갱신 + updatedAt 최신우선 병합 + 하위호환 세트. requiresDocument 결측 기본=보수적 false                                       |
| **Settings whole-file LWW 병합** _(비차단)_          | 기기 A에서 키워드·기기 B에서 정책을 각각 편집 시 whole-file가 서로 덮어 한쪽 편집 소실                  | 'settings'는 whole-file·필드 병합 없음(`syncRegistry.ts:64-72`). 저빈도 config라 실사용 영향 작음. **동시 다기기 config 편집을 지양**하고, 필요 시 편집 직후 동기화 권장(문서 고지). 데이터(출결/기록) 손실 아님 — config 한정 |
| **메타가드 위반**                                    | 단일 기록자 불변식 파손                                                                                 | B의 키워드/월-스캔은 **prop 주입**(그리드 store import 0), 스캔은 **3개 편집 핸들러**에만(공유 `commitEdit` 금지), 저장 순서 saveDayAttendance→bridge 불변, InputMode 무접촉. **가드를 고쳐 통과시키지 않음**                  |
| **A 반영-쓰기 도메인 불일치**                        | summarize 출력(AttendanceRecord)을 bulkMarkNeisReported(StudentRecord id)에 순진 전달 시 no-op/타입오류 | (studentNumber,date)→studentId→(studentId,date,category='attendance')→record.id **4단계 해석 명세**(§2 M5), A 쓰기 착수 전 확정                                                                                                |
| **규정 충돌** (경고 문구·기본 서류요구)              | 잘못된 규정 안내                                                                                        | 기본 키워드 0·문구는 기재요령 원문 확인 후 확정(Open Question), 기본 정책 보수적(출석인정만 요구)                                                                                                                              |
| **범위 팽창**                                        | 4종 동시로 리뷰/검증 폭증                                                                               | 마일스톤 독립 게이트·독립 커밋, A 분할·D-2 선택 분리                                                                                                                                                                           |

---

## 4. 명시적 제외 범위 (Out of Scope)

- **CSV(UTF-8) 파서 분기** — 코드·실물 근거 0. 실물 나이스가 CSV 제공을 증명할 때까지 제외(검증된 xlsx/HTML-as-xls만).
- **암호화 내보내기** — 본 계획 대상 아님(보류 후보).
- **전출입 날짜 기준 제외 보강** — `Student.status`/`statusChangedAt` 기반 제외는 이미 존재, 본 범위에서 추가 보강하지 않음.
- **`SearchMode.tsx` 직접 수정 / 조회 탭 Records 리디자인 영역** — 타 세션 미커밋 영역. A-UI·C는 통계 탭에만, D-1은 타 세션 커밋 후 착수.
- **새 동기화 도메인 추가** — 본 4종은 기존 엔티티(Settings/StudentRecord) 필드 확장만 → syncRegistry/App.tsx 신규 등록 없음.
- **AI 기능** — 제품 1순위 원칙상 금지(대조는 규칙 기반, 생성형 아님).

---

## 5. 사전 부검 (Pre-mortem, DELIBERATE 3 시나리오)

1. **"개학 후 실물 나이스 파일이 픽스처와 다르다"** — `parseNeisRows` 컬럼 매핑이 실제 컬럼명/병합셀/인코딩에서 깨짐. → 방어: A **파서/UI는 개학 게이트 뒤로 홀드**(M5), 도메인 코어(diff)는 실물과 무관하게 선-확정(M3), 파서는 관용적(별칭·열순서 흡수) + `rawRows` 수동 매핑 폴백, 베타 라벨로 기대치 관리, 자동 쓰기 금지로 오염 차단.
2. **"D-1 착수 시 타 세션이 배너/배지 산식을 이미 바꿔 충돌"** — 과다 카운트 교정이 조회 탭 렌더 영역과 겹침. → 방어: **D-1은 타 세션 커밋 완료 게이트**, 착수 전 `git status --short`+해당 파일 최신 읽기, 정책 게이트를 `requiresDocument` 순수 함수로 격리해 소비처 diff 최소화(배너=술어 교체·통계=분모 재정의로 명확 분리).
3. **"B 키워드 경고가 되돌리기·지우기에 오경보 / 그리드가 store를 참조하게 됨"** — 공유 `commitEdit`에 스캔을 걸면 `undo`/`clearToday`에도 경고가 뜨고, 월-스캔을 위해 그리드가 store를 import하면 메타가드 붕괴. → 방어: 스캔을 **3개 편집 핸들러(`handleCellClick` 비-지우개·`applyText`·`handleMemoEdit`)에만** 부착, 경고는 비차단으로 저장과 독립, 키워드·월-스캔은 **prop/콜백 주입**만(그리드 store import 0), 디바운스/디듑으로 다중 편집 폭주 방지, 메타테스트로 store import 0 강제.

---

## 6. 확장 테스트 계획 (DELIBERATE)

- **Unit(도메인):** `compareAttendance`(M3, 손 작성 `NeisAttendanceRow[]` 픽스처), `findRepeatedKeyword`(M2, substring·대소문자·월경계·오탐경계), `countWithReasonFilter`/`isPerfectAttendance`(M1), `requiresDocument`(M4, 다중 교시 OR 집약 + 결측 보수적 false **진리표 6케이스**), `parseNeisRows`(M5, HTML표-as-xls 픽스처 + 실물 확보 후 대체), A 반영-쓰기 매핑(M5, (studentNumber,date)→record.id). 별표8 §3 라·바·사 정합 회귀 유지.
- **Integration:** A 파서(**xlsx·HTML-as-xls 두 경로만**, CSV 없음)→도메인 파싱 왕복(M5). B 그리드 3개 핸들러에서 경고 표출 + `undo`/`clear` 무경보 + 저장 완료(M2). D 배너 술어 교체·통계 분모 재정의 전/후 카운트 + N1 색상/빈 가드(M4).
- **E2E/스모크(실렌더):** A `NeisAuditModal` 업로드/붙여넣기·`rawRows` 수동 매핑(브라우저 모드, M5), 통계 탭 C 토글(M1), 그리드 B 경고 실렌더·디듑(M2). (실기기·실물 나이스 파일 왕복은 개학 후 별도.)
- **Observability/가드:** 메타테스트(단일 기록자 6종) 유지, `emit-entity-samples` 계약 테스트(D-2 진입 시), `regression-check` 통과.
- **알려진 flaky:** autosave fake-timer 병렬 flaky는 단독 재실행으로 확인(기존 알려진 이슈).

---

## 7. ADR (consensus 확정)

- **Decision:** 담임 출결 4종을 (1) A=**도메인 코어(지금)/파서·UI(개학 게이트·베타·CSV 없음, xlsx+HTML-as-xls만)** 분할 + 읽기전용 감사(반영-쓰기는 (studentNumber,date)→StudentRecord id 4단계 매핑), (2) B=Settings optional 키워드 + 그리드 **3개 편집 핸들러** prop 주입 비차단 경고(substring·대소문자무시·디듑), (3) C=`byReason` 위 순수 가법 필터·개근 뷰, (4) D=Settings 정책 + `requiresDocument` 게이트(**배너 술어 교체·통계 분모+색상/빈 가드 세트 재정의**, 다중 교시 OR 집약·결측 보수적 false) — D-1 우선, D-2(StudentRecord `documents`) 선택. **실행 순서(위험-조정): C → B → A코어 (지금) → D-1(타 세션 게이트) → A파서·UI(개학 게이트) → D-2(선택).**
- **Drivers:** 실물 파일 부재 · 동시 세션 충돌(조회 탭) · 동기화/하위호환 안전(Settings whole-file LWW 포함).
- **Alternatives considered:** A-파서 성적파서 일반화(무효화: 컬럼 의미 직교) · A-CSV 분기(무효화: 코드·실물 근거 0) · A 맨 앞 배열(기각: 위험 역배열) · D-처음부터 구조체 필드(연기: D-2).
- **Why chosen:** 위험-조정 가치로 확실·비차단(C·B·A코어)을 앞에, 불확실·외부차단(A파서·UI)을 뒤에, 실사용 고통(D-1 과다 카운트)을 게이트 해제 즉시 — 엔티티 표면 최소 변경 + 메타가드 6종 준수.
- **Consequences:** A 사용자 대면 기능은 개학 전까지 베타(자동 쓰기 없음, 도메인 코어만 선-확정). 신규 동기화 도메인 0. Settings config는 whole-file LWW(다기기 동시 config 편집 시 상호 덮어쓰기 가능, 데이터 손실 아님). D-2 채택 시에만 엔티티 계약 갱신.
- **Follow-ups:** 개학 후 A 실물 파일로 `parseNeisRows` 컬럼 확정·실물 픽스처 교체 · A 반영-쓰기 매핑 착수 전 확정 · B 경고 문구/규정 확정 · D-2 채택 여부 사용자 결정 · 실기기 왕복 · 다음 릴리즈 고지(나이스 대조 베타).

---

## 8. Open Questions (실행 전/중 결정 필요)

- [ ] **A "일치 건 반영" 도메인 매핑 + 자동 여부** — 본 계획은 '자동 금지·명시 동의'이며, 반영-쓰기는 **(studentNumber, date)→studentId→(studentId, date, category='attendance')→StudentRecord record.id → `bulkMarkNeisReported`** 4단계 해석을 M5 착수 전 확정. 왜 중요: 두 도메인(AttendanceRecord↔StudentRecord) 불일치 no-op/타입오류 방지.
- [ ] **B 경고 문구** — 기재요령 원문 확인 후 확정(차단 아님 명시). 왜 중요: 규정 오안내 방지.
- [ ] **B 매칭 정밀도** — 기본 substring(대소문자 무시)에서 "원↔병원" 오탐 허용 여부, 단어 경계/정확일치 옵션 도입 여부. 왜 중요: 오탐 UX.
- [ ] **D 기본 서류요구 정책 기본값** — '출석인정만 요구'가 학교 방침 기본으로 타당한지 규정 확인. 왜 중요: 과다/과소 카운트 양방향 회귀 방지.
- [ ] **D `attendancePeriods` 결측 레거시 취급** — 보수적 false(과다 카운트 재유입 방지) vs subcategory 추론 요구. 본 계획은 보수적 false 우선. 왜 중요: 마이그레이션 동작 결정.
- [ ] **D-2(서류 종류 체크리스트) 채택 여부** — StudentRecord 스키마 확장 비용 대비 사용자 필요. 왜 중요: 엔티티 계약/병합 변경 트리거.
- [ ] **A 진입점 최종 위치** — 통계 탭 `NeisAttendanceSection` 버튼(조회 탭 리디자인 완료 후 재배치 여부). 왜 중요: 타 세션 충돌 회피.

---

**본 계획은 consensus 승인(조건 N1 반영 완료) 상태다. 사용자 실행 승인 전까지 구현에 착수하지 않는다(pending approval). 실행 시 §2.0 순서와 착수 게이트를 준수한다.**
