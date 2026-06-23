# 설계서 — AI 브릿지 담임 학급 출결 지원

- 상태: 초안(검토 대기)
- 작성일: 2026-06-23
- 관련 레포: 본체(`e:/github/ssampin`) + AI 브릿지(`e:/github/ssampin-ai-bridge`)
- 트리거: v2.2.2 출시 준비 중, 어제 추가한 출결 MCP 도구(`c555015`)를 실기기 테스트하다 "우리 반(담임) 출결 등록 불가" 발견

---

## 0. 한 줄 요약 (비개발자용)

어제 만든 출결 도구는 **"가르치는 수업반(교과반)" 출결만** 다루도록 만들어졌습니다. 그런데 선생님이 등록하려던 건 **"우리 반(담임 학급)"의 일일 출결**이라, 도구가 그 데이터를 보지도 쓰지도 못합니다. 게다가 교과반 출결도 **앱을 켜 둔 상태에선 저장이 막히는** 문제가 같이 발견됐습니다. 이 문서는 두 문제를 안전하게 고치는 방법을 정리한 설계서입니다.

---

## 1. 발견된 문제 2가지 (코드로 확인)

### 문제 A — 담임 학급(우리 반) 출결을 아예 지원 안 함

쌤핀은 출결을 **두 군데에 따로** 저장합니다.

| 출결 종류                         | 저장 위치                                                     | 식별자                      | 도구 지원                 |
| --------------------------------- | ------------------------------------------------------------- | --------------------------- | ------------------------- |
| **우리 반(담임) 일일 출결**       | `student-records.json` (학생 기록부, `category:'attendance'`) | 담임 학생 토큰 `stu_`       | ❌ 읽기·쓰기 모두 없음    |
| 가르치는 수업반(교과반) 교시 출결 | `attendance.json` (`useTeachingClassStore`)                   | 교과반 토큰 `cls_` / `tcs_` | ⚠️ 부분 지원(문제 B 참고) |

- 담임 출결의 **원본은 학생 기록부**다. [useStudentRecordsStore.ts:437-473](../../../src/adapters/stores/useStudentRecordsStore.ts#L437-L473) — 담임 출결을 저장하면서 `classId`가 있을 때만 교과반 출결부(`attendance.json`)에 미러링한다.
- 브릿지 core의 읽기 IO 목록([io.ts](../../../../ssampin-ai-bridge/packages/core/src/io.ts))에 **`student-records`를 읽는 함수가 없다.** 담임 출결 데이터에 접근하는 길 자체가 없다.
- 출결 쓰기([attendanceTools.ts:206-211](../../../../ssampin-ai-bridge/packages/mcp/src/attendanceTools.ts#L206-L211))는 `identity.kind !== 'teaching'`(= 담임 `stu_` 토큰)이면 거부한다.
- `resolveClass`([tools.ts:161-173](../../../../ssampin-ai-bridge/packages/mcp/src/tools.ts#L161-L173))는 `teaching-classes.json`에서만 반을 찾는다 — 담임 학급은 거기 없어 `classToken`이 발급되지 않는다.

> **외부 AI 진단 정정:** "classToken만 노출하면 등록된다"는 틀림 — 담임 출결은 `attendance.json`이 아니라 `student-records.json`에 저장되므로 classToken을 열어줘도 엉뚱한 곳에 쓰게 된다. "읽기는 담임 기본값으로 동작"도 틀림 — `classToken` 미지정 시 빈 결과(0건)를 준다([attendanceTools.ts:172-180](../../../../ssampin-ai-bridge/packages/mcp/src/attendanceTools.ts#L172-L180)).

### 문제 B — 교과반 출결도 "앱 켜짐" 상태에선 저장 실패

- 브릿지의 `set_attendance_record`는 앱이 켜져 있으면 `domain:'attendance'`로 본체 loopback 서버에 POST한다([attendanceTools.ts:286-305](../../../../ssampin-ai-bridge/packages/mcp/src/attendanceTools.ts#L286-L305)).
- 그런데 본체의 loopback 위임 분기([applyLiveSyncWrite.ts:454-460](../../../src/usecases/aiBridge/applyLiveSyncWrite.ts#L454-L460))는 `todos·events·recordDrafts·memos·bookmarks·notes`만 처리하고, **`attendance`는 "지원하지 않는 도메인"으로 거부**한다.
- `WriteDomain` 타입([aiBridgeLiveSyncCore.ts:260](../../../src/adapters/../../electron/ipc/aiBridgeLiveSyncCore.ts#L260))에도 `attendance`가 없다.
- 결과: **앱이 꺼져 있을 때만**(직접 파일쓰기) 교과반 출결이 저장된다. 앱을 켜 두면 실패.

---

## 2. 목표 & 범위

### 포함

1. **담임 학급 일일 출결 읽기**(`get_homeroom_attendance`): 날짜 범위로 우리 반 이상 출결 조회.
2. **담임 학급 일일 출결 쓰기**(`set_homeroom_attendance`): 학생 토큰(`stu_`) + 날짜 + 교시별 상태로 등록/수정.
3. **교과반 출결 loopback 도메인 추가**(문제 B 수정): 앱 켜짐 상태에서도 교과반 출결이 저장되도록.

### 제외(이번 범위 밖)

- 출결 통계/리포트 생성, NEIS 보고 자동화.
- 교외체험학습 등 특수 출결의 NEIS 정식 코드 매핑(아래 §5 결정 필요로 남김).

---

## 3. 설계 원칙 — "본체를 거쳐 쓴다"

학생 기록부(`student-records.json`)는 출결뿐 아니라 **상담·생활·특기사항 등 담임의 모든 기록 원본**이다. 또한 담임 출결 저장에는 ① 대표 분류(subcategory) 자동 계산, ② 교시 유효성 검증, ③ 교과반 출결부 미러링이 얽혀 있다([UpdateAttendancePeriods.ts](../../../src/usecases/studentRecords/UpdateAttendancePeriods.ts)).

→ 브릿지가 파일에 직접 쓰면 이 계산이 깨져 앱에서 잘못 보이거나 데이터가 손상될 수 있다. 따라서:

- **1순위(이번 구현): loopback 위임** — 앱이 켜진 상태에서 본체의 검증된 store 액션(`useStudentRecordsStore`)에 위임한다. 본체가 subcategory·검증·미러링을 모두 처리하므로 안전하다.
- **2순위(보류): 직접 파일쓰기**(앱 꺼짐 폴백) — student-records 구조가 복잡하고 손상 위험이 커, 이번 범위에서는 **미지원**(앱을 켜고 등록하도록 안내). 추후 별도 검토.

---

## 4. 변경 사항 (양쪽 레포)

### 4-1. 본체 (`e:/github/ssampin`)

1. `electron/ipc/aiBridgeLiveSyncCore.ts`
   - `WriteDomain`에 `'attendance'`(교과반)와 `'homeroomAttendance'`(담임) 추가.
   - `isDomainWriteAllowed`: 두 도메인 모두 `allowWrite` 게이트로 판정.
   - `validateApplyWrite`(payload 검증)에 두 도메인 분기 추가 — date(YYYY-MM-DD), period(정수), students 배열 형태 검증.
2. `src/usecases/aiBridge/applyLiveSyncWrite.ts`
   - 도메인 분기에 `attendance`(교과반) → `useTeachingClassStore.saveDayAttendance` 위임 추가.
   - `homeroomAttendance`(담임) → `useStudentRecordsStore`의 출결 추가/수정 액션 위임 추가.
   - 입력의 학생 식별자(토큰 복원된 `studentNumber`/`studentId`)와 교시별 상태를 store 액션 시그니처로 변환.
3. 테스트: `applyLiveSyncWrite` 도메인별 단위 테스트 + `aiBridgeLiveSyncCore` 게이트/검증 테스트 추가.

### 4-2. AI 브릿지 (`e:/github/ssampin-ai-bridge`, master)

1. `packages/core`
   - `student-records` 읽기 함수 + 파서(`parseStudentRecords`) 신설(읽기 전용, 손상 fail-safe).
   - 담임 출결 read 헬퍼: 학생 토큰 → `student-records`에서 해당 학생의 `category:'attendance'` 기록 조회(탈식별).
   - 담임 출결 write payload 빌더: loopback `domain:'homeroomAttendance'` 페이로드 구성(토큰→식별자 복원은 본체가 아닌 브릿지가 보유한 토큰맵으로).
2. `packages/mcp`
   - 새 도구 `get_homeroom_attendance`, `set_homeroom_attendance`(필요 시 `delete_homeroom_attendance`).
   - 담임 학생 토큰(`stu_`)을 받도록 `resolveStudentTarget`의 `homeroom` 분기 허용(기존 출결 도구의 `teaching` 강제와 분리).
   - 동의/쓰기 게이트는 기존 `assertWriteAllowed` 재사용.
3. 테스트: core 파서/read + mcp 도구 단위 테스트.
4. **번들 재생성**: `pnpm -r build` → esbuild로 `electron/ai-bridge/index.mjs` 갱신(§3 README 절차, 네이티브 `@esbuild/win32-x64/esbuild.exe` 사용).

---

## 5. status / reason 매핑 (결정 필요)

쌤핀 출결 상태값은 `present | absent | late | earlyLeave | classAbsence`, 사유는 `질병 | 인정 | 미인정 | 기타`. 교시는 조회=0, 정규=1~N, 종례=9.

사용자가 등록하려던 데이터의 제안 매핑:

| 입력                   | status   | reason   | period         | 비고                                                                                    |
| ---------------------- | -------- | -------- | -------------- | --------------------------------------------------------------------------------------- |
| 질병 결석              | `absent` | `질병`   | 해당 교시 전체 | 명확                                                                                    |
| 인정 결석(생리)        | `absent` | `인정`   | 해당 교시 전체 | 명확                                                                                    |
| 현장체험학습(교외체험) | `absent` | `인정`   | 해당 교시 전체 | ⚠️ NEIS는 '출석인정'이나 쌤핀 enum에 없음 → `absent`+`인정`+메모로 처리 **(확인 필요)** |
| 미인정 지각(조회)      | `late`   | `미인정` | 0(조회)        | 명확                                                                                    |

**결정 필요 1:** 교외체험학습을 `absent+인정`으로 둘지, 별도 표기(메모)할지.
**결정 필요 2:** "6월 1~2일 질병결석"처럼 **하루 전체** 결석을 어떤 교시들로 펼칠지 — 조회(0)+정규(1~N)+종례(9) 전부인지, 정규 교시만인지. (본체 `updateAttendanceRecord`는 `candidatePeriods`로 0·1~N·9를 다룬다.)

---

## 6. 단계별 구현 계획 + 검증 게이트

1. **PoC**: 본체 loopback에 `attendance`(교과반) 도메인 추가 → 앱 켜짐 상태에서 교과반 출결 저장 확인(문제 B 해소, 가장 작은 단위).
2. **담임 읽기**: 브릿지 core `student-records` 읽기 + `get_homeroom_attendance` 도구 → 우리 반 출결 조회 확인.
3. **담임 쓰기**: 본체 `homeroomAttendance` 도메인 + 브릿지 `set_homeroom_attendance` → 우리 반 출결 등록 확인(loopback).
4. **번들 재생성 + 통합 검증**: index.mjs 갱신 → 실제 MCP 클라이언트로 §5 데이터 등록 E2E.
5. **검증 게이트**: 본체 `tsc/lint/test/regression` 4종 + 브릿지 `pnpm -r test` + 번들 fidelity(도구 이름 grep).

각 단계는 별도 검증 후 다음으로. (담임 데이터가 걸린 작업이라 단계마다 실제 동작 확인 필수.)

---

## 7. 리스크 & 완화

| 리스크                                    | 완화                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| student-records 손상(모든 담임 기록 원본) | 직접쓰기 미지원, 본체 store 액션 위임만 사용(검증·백업·CAS 본체가 보장) |
| subcategory/미러링 불일치                 | 본체 `updateAttendancePeriods` 로직을 그대로 거침(재구현 안 함)         |
| 앱 꺼짐 시 등록 불가                      | 이번 범위에서 명시적 미지원 — "앱을 켜고 등록" 안내 문구                |
| 브릿지 토큰맵에 담임 학생 미등록          | `list_students`(classToken 미지정) 호출로 `stu_` 토큰 발급 선행         |

---

## 8. v2.2.2 일정 영향

이 작업은 본체+브릿지 양쪽 신규 구현 + 번들 재생성 + 재검증으로 **반나절~하루** 규모다. v2.2.2에 포함하면 출시가 그만큼 미뤄진다. 검토 후 ① v2.2.2 포함(지연) ② 다음 버전 분리 중 택일 필요. (현재 릴리즈 노트의 "출결" 표현은, 담임 출결 미포함 시 "수업반 출결"로 좁혀야 오해가 없다.)
