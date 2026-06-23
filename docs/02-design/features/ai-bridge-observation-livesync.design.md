# Task PRD / 설계서 — AI 브릿지 "학생 노트 쓰기" 2-트랙 (관찰기록 + 담임 노트)

- 상태: **합의 완료 · pending approval**(Planner→Architect→Critic 2라운드 + 본 세션 사실검증 반영). 실행(코드 수정)은 승인 후.
- 작성일: 2026-06-23
- 관련 레포: 본체(`e:/github/ssampin`) + 브릿지(`e:/github/ssampin-ai-bridge`)
- 선행 의존성: 옆 세션의 **담임 출결 live-sync**가 같은 파일 3개를 미커밋 수정. **출결 브랜치 머지 후** 그 위에서 진행(미머지면 rebase). 모든 변경은 출결 추가분 **옆에 additive**.

---

## 0. 한 줄 요약 (비개발자용)

쌤핀에는 학생 메모가 두 군데입니다 — **관찰기록**(내가 가르치는 수업반 학생)과 **담임 학생 기록**(우리 반 학생, 출결/상담/생활·학습/기타 카테고리 + 메모). AI가 학생을 보고 **알맞은 곳에 자동으로** 적게 합니다. (1) 수업반 학생 → 관찰기록, (2) 우리 반 학생 → 담임 기록 화면에 **AI가 카테고리 추천**(예: "분리수거 정리" → 생활·학습 > 칭찬), 선생님은 결과만 확인. 둘 다 **기존 화면**을 쓰므로 새 화면은 안 만듭니다.

---

## 1. 확정 사실 (이번 세션 직접 Read·검증)

| 사실                                                                                                                                                                                                                                       | 근거                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 관찰기록은 수업반 전용 — `ObservationRecord.classId` 필수, UI 전부 ClassManagement                                                                                                                                                         | [Observation.ts:4](../../../src/domain/entities/Observation.ts#L4), [useObservationStore.ts:15-21](../../../src/adapters/stores/useObservationStore.ts#L15-L21)                                |
| 담임 학생 기록 화면 **이미 존재** — `useStudentRecordsStore.addRecord(studentId, category, subcategory, content, date, …)`                                                                                                                 | [InputMode.tsx:76](../../../src/adapters/components/Homeroom/Records/InputMode.tsx#L76), [useStudentRecordsStore.ts:105-116](../../../src/adapters/stores/useStudentRecordsStore.ts#L105-L116) |
| 카테고리는 **개방형 string** + 사용자가 **UUID 커스텀 카테고리/세부항목 런타임 추가** 가능                                                                                                                                                 | `RecordCategory.ts`(개방 string), `useStudentRecordsStore` `addCategory`/`addSubcategory`                                                                                                      |
| 출결은 합성 id `att-{studentId}-{date}`로만 생성되는 **별도 트랙**                                                                                                                                                                         | `useStudentRecordsStore`(출결 레코드 합성 id)                                                                                                                                                  |
| **loopback IPC 핸들러는 `isDomainWriteAllowed`를 호출하지 않음** — `validateApplyWrite`(형태) → `applyWrite`(렌더러)만. 즉 권한 게이트는 **브릿지 측 `assert*` + 서버 가동조건**, 카테고리 진위 검증의 신뢰 주체는 **렌더러 라이브 store** | [aiBridgeLiveSync.ts:97-104](../../../electron/ipc/aiBridgeLiveSync.ts#L97-L104)                                                                                                               |
| `add_observation`은 loopback 경로 없음(직접쓰기 전용) → 앱 켜짐이면 항상 `WriteConflictError`                                                                                                                                              | 브릿지 `tools.ts addObservation` → `write.ts appendObservation`(`decideWritePath!==direct` throw)                                                                                              |
| `set_homeroom_attendance`=loopback-only, `get_homeroom_attendance`=consent-gated read 이미 존재(mirror 대상)                                                                                                                               | 브릿지 `attendanceTools.ts`                                                                                                                                                                    |
| `runTool`이 모든 에러를 일반 문구로 뭉갬(외부 AI 오진 원인)                                                                                                                                                                                | 브릿지 `server.ts:123-136`                                                                                                                                                                     |

---

## 2. 채택 설계 — 옵션 β (담임 전용 새 도구), 합의 권장

|      | α 단일 자동라우팅 도구                                                       | **β 담임 전용 새 도구 `set_homeroom_note` (채택)**                                                            |
| ---- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 형태 | `add_observation`이 토큰종류로 분기                                          | `add_observation`은 수업반 전용 유지 + `set_homeroom_note`(stu\_ 전용) 신설                                   |
| 장점 | 도구 1개                                                                     | 출결 패턴 1:1 mirror·리스크 최소 / 각 도구가 단일 저장소·스키마·오프라인동작 / 검증·PII 격리 / 기존 계약 보존 |
| 단점 | 2저장소·2스키마·2오프라인동작이 한 도구에 섞여 검증·설명 비대, 하위호환 깨짐 | 도구 1개 추가(단 `list_students`가 토큰종류 알려주고 도구설명에 명시하면 AI가 알아서 선택)                    |

"AI 자동 라우팅"은 **AI가 토큰 종류를 보고 올바른 도구를 고르는 형태**로 충족됩니다.

---

## 3. 트랙 A — 수업반 관찰기록 loopback 수정 (토큰 cls*/tcs*)

`add_observation`이 앱 켜짐에서도 저장되게(유일하게 loopback 없는 쓰기 도구).

1. 본체 [aiBridgeLiveSyncCore.ts](../../../electron/ipc/aiBridgeLiveSyncCore.ts): `WriteDomain`·`DOMAINS`에 `'observations'` 추가(출결 옆). `validateApplyWrite`에 create 전용 분기(studentId 필수·content≤500·date·tags·classId·out-of-spec 거부).
2. 본체 [applyLiveSyncWrite.ts](../../../src/usecases/aiBridge/applyLiveSyncWrite.ts): domain 유니온 + `LiveSyncWriteDeps.observations.add` + `applyObservations`(`applyAttendance` mirror).
3. 본체 [useAiBridgeLiveSync.ts](../../../src/adapters/hooks/useAiBridgeLiveSync.ts): `observations.add → useObservationStore.getState().addRecord({studentId, classId: classId??'', date: date??오늘, content, tags: tags??[]})`. visibility는 store가 항상 private 고정 → 인자 추가 안 함.
4. 브릿지 `liveWrite.ts`: `LiveWriteDomain`에 `'observations'`.
5. 브릿지 `tools.ts addObservation`: `appendObservation` 직접호출 → `createVia(ctx,'observations',data,idem, directFallback)`(앱 켜짐=loopback / 닫힘=기존 직접쓰기 폴백 재사용). 멱등키 `deriveIdemKey`.
6. 브릿지 `server.ts runTool`: `WriteConflictError`/`WriteDisabledError`는 **고정 안내문**을 클라에 전달(raw 입력 echo 금지). add_observation 설명 "닫은 상태 권장"→"켜둔 상태에서도 저장" 갱신.

---

## 4. 트랙 B — 담임 노트 → student-records 라우팅 (토큰 stu\_, 신규)

담임 학생 토큰 → `student-records.json`에 `[categoryId + subcategory + 메모]` 저장. 화면은 이미 존재 — 쓰기 경로만 연결. 출결 트랙 mirror.

### 4-1. 검증 주체 = 렌더러 라이브 store (Architect#2 지적 반영 — "자기검증 writer" 제거)

- **본체 `validateApplyWrite`(`recordNote` 분기)**: **형태만** 검사(studentId 필수·content≤2000·categoryId 문자열·subcategory 문자열·date·op=create·out-of-spec 거부). main process는 렌더러 store 접근 불가하므로 **카테고리 진위는 여기서 판정하지 않음**.
- **본체 렌더러 `applyRecordNote`(진짜 게이트)**: `useStudentRecordsStore.getState().categories`(신뢰 가능한 라이브 원본)로 **categoryId 존재 + ≠`attendance` + subcategory 멤버십** 재검증. 불일치 시 거부 + **라이브 허용목록 회신**(자동보정·자동생성 금지). → 브릿지 payload를 신뢰하지 않음(client 불신 원칙 준수).
- **브릿지 `set_homeroom_note`(UX 선검증, 비권위)**: `readStudentRecords`로 categories 읽어 빠른 오류·허용목록을 AI에 즉시 주되, 최종 권위는 렌더러. (브릿지 파서가 현재 `categories[]`를 버리므로 — 파싱 함수 **신규 추가**, 기존 `parseStudentRecords`는 records 전용 유지.)
- **출결 영역 분리 불변식**: `categoryId==='attendance'`는 양 레이어 공통 **항상 거부**(출결은 합성 id 트랙). 이 한 가지만 공통 상수.

### 4-2. 변경 지점

- 본체 `aiBridgeLiveSyncCore.ts`: `WriteDomain`·`DOMAINS`에 `'recordNote'`. `validateApplyWrite` 형태 분기.
- 본체 `applyLiveSyncWrite.ts`: domain 유니온 + `LiveSyncWriteDeps.recordNote{ add, categories }` + `applyRecordNote`(라이브 재검증 → `sr.addRecord(...)`).
- 본체 `useAiBridgeLiveSync.ts`: `recordNote.add → sr.addRecord(studentId, categoryId, subcategory, content, date??오늘)`, `recordNote.categories → useStudentRecordsStore.getState().categories`.
- 브릿지 `entities/studentRecord.ts`: `categories[]` 파싱 함수 **신규**(기존 함수 보존).
- 브릿지 `set_homeroom_note`(신규, `set_homeroom_attendance` mirror): stu\_ 강제, **loopback-only**(직접쓰기 미지원=원본 보호), 라이브 카테고리 선검증, payload `{studentId, categoryId, subcategory, content, date?}` → `postLoopback(domain:'recordNote')`.
- 브릿지 `server.ts`: `set_homeroom_note` 등록. 설명에 **비대칭 명시**("관찰기록은 앱 닫힘에도 저장되나 담임 노트는 앱 켜진 상태에서만 — 학생 기록부 원본 보호").

---

## 5. 결정 필요 (대부분 권장값 — 확인만)

1. **권한 토글**: 담임 노트를 `allowWrite`로 게이트할지 `allowRecordWrite`로 할지. → **권장: 출결 세션의 담임 쓰기와 동일 토글에 맞춤**(확인 필요 — 출결이 `allowWrite`면 노트도 `allowWrite`. 생기부 초안=`allowRecordWrite`는 법정기록 전용이라 별개).
2. **읽기 도구 `get_homeroom_notes` 포함 여부**: → **권장: 포함**(없으면 AI가 쓴 노트를 AI로 확인 불가). `get_homeroom_attendance`의 consent-gated read + **탈식별 파이프라인**(content·subcategory) 통과.
3. **content 길이 상한**: → **권장: 2000자**(메모 동급).
4. **출결 머지 타이밍 / v2.2.2 일정**: 머지 후 진행. 본체+브릿지 신규 + 번들 재생성으로 반나절~하루 → v2.2.2 포함(지연) vs 다음 버전 분리 택일.

---

## 6. 검증 게이트 (완료 선언 전)

1. 본체: `npx tsc --noEmit`(0) → `npm run lint`(0) → `npm run test`(observations·recordNote 신규 단위테스트 GREEN) → `npm run regression-check`.
2. 브릿지: `pnpm -r test`(addObservation loopback/direct/refuse + set_homeroom_note 라이브검증·loopback-only + categories 파서).
3. 번들 재생성: `pnpm -r build` → `electron/ai-bridge/index.mjs` → 도구이름/도메인 grep fidelity.
4. E2E(앱 켜둔 채): ① 수업반 학생 add_observation → 관찰 화면 반영 ② 담임 학생 set_homeroom_note("분리수거 정리", life>칭찬) → 담임 기록 반영 ③ **UUID 커스텀 카테고리** 노트 성공(화이트리스트 회귀 방지) ④ attendance/미존재 categoryId·subcategory → 거부+허용목록 ⑤ 앱 닫힘: add_observation 직접쓰기 성공 / set_homeroom_note 거부.

---

## 7. 충돌 회피 (옆 출결 세션 미커밋)

동일 파일(`aiBridgeLiveSyncCore.ts`·`applyLiveSyncWrite.ts`·`useAiBridgeLiveSync.ts`·브릿지 `liveWrite.ts`·`server.ts`·`entities/studentRecord.ts`)은 출결 추가분 **옆에 additive**(WriteDomain/도메인 한 단어, validate/apply/deps 새 분기, 파서 신규 함수)로만. 기존 심볼 수정 금지. (additive는 소스 diff 충돌만 방지 — 공유 `student-records.json` 런타임 동시쓰기는 렌더러 단일스레드 직렬 적용으로 회피, 기존 출결과 동일.)

---

## 8. ADR

- **결정**: 2-트랙(수업반→observations loopback, 담임→recordNote→student-records) + 옵션 β(전용 도구 `set_homeroom_note`) + 카테고리 검증 권위는 렌더러 라이브 store.
- **동인**: 커스텀 카테고리 정확성 / 출결 세션 충돌 회피 / student-records 무결성 / 진단성 / 제품방향(자동 라우팅·새 화면 금지).
- **대안**: α 단일도구(검증·오프라인동작 혼재로 기각), 1-B 담임 관찰화면 신설(화면 이미 존재라 불필요), 페이로드 자기검증(client 불신 위반으로 기각).
- **귀결**: MCP 도구 1~2개 추가, 양 레포 + 번들. 담임 노트는 loopback-only(앱 켜짐 필요).
