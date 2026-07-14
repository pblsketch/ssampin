# 동기화 2차 하드닝 — 합의 계획서 (RALPLAN-DR, deliberate)

> 상태: CONSENSUS(rev.5) — QA 반영 재합의 완료 (pending approval — 사용자 승인 대기)
> 모드: DELIBERATE (데이터 무결성·스키마 변경·다기기 공유 = 고위험)
> 산출 대상: 이 문서(계획). 구현은 승인 후 별도 세션.
> 선행 핸드오프: `docs/01-plan/features/sync-hardening-2.handoff.md` · 원형 결정: `DECISIONS.md` ADR-019, PROGRESS.md 최상단 2개 섹션.
>
> **개정 이력:** rev.1(Planner) → 합의 루프 1회차[Architect C1~C5 / Critic N1~N3] → **rev.3 CONSENSUS(3자 합의 완료)** → **외부 QA(Codex gpt-5.6-sol, 2026-07-14) NO-GO** — 3자 합의가 놓친 구조 결함 2건(BLOCKER)이 실행 재현으로 실증 → 사용자가 rev.4 개정 승인 → rev.4(QA 8건 반영) → **rev.4 재합의 루프[Architect APPROVE_WITH_CHANGES F1~F6·B2/H3 증명 확인 / Critic 조건부 APPROVE + NEW-K1~K3]** → **rev.5(본 문서, F1~F6·NEW-K1~K3 반영, 3자 재합의 완료 — 재검 불요)**.
> QA 아티팩트: `.omc/artifacts/ask/codex-read-the-utf-8-korean-qa-brief-at-omc-qa-brief-sync-hardenin-2026-07-14T00-10-56-366Z.md` · 다이제스트: `scratchpad/qa-findings-digest.md`.
> **rev.4 핵심 방향(두 BLOCKER의 공통 뿌리 = P6):** "저장은 통째 스냅샷이 아니라 **변경 의도(intent)로 표현**하고, 의도를 **락 안의 fresh 상태에 적용**한다." rev.1~3의 "유스케이스 본문만 락으로 감싼다"는 스토어가 락 밖 in-memory 스냅샷으로 저장 페이로드를 이미 만들어 넘기므로 실효가 없음이 실증됐다.

---

## 0. 개요 (오너용 한 문단)

2026-07-13 실사용자 데이터 유실을 v2.2.13에서 급하게 막았지만, 외부 QA가 **아직 안 고친 구조 결함 2건**을 실행으로 재현했습니다. 이번 트랙에서 정석으로 해소하되, v2.2.13에서 방금 출시한 병합 코드의 회귀를 최소화합니다.

- **A. 파일 쓰기 경합** — 여러 저장 흐름이 "읽고→고치고→통째로 다시 쓰는" 구조라 겹치면 나중 저장이 먼저 저장을 삼킵니다. **QA가 새로 밝힌 핵심:** 화면(메모리)에 담긴 낡은 목록으로 저장 꾸러미를 미리 만들어 넘기기 때문에, 저장 함수만 잠가서는 못 막습니다 → **"무엇을 바꾸겠다"는 의도만 넘기고, 실제 변형은 잠금 안에서 최신 상태로** 다시 계산해야 합니다.
- **B. 학생 기록 항목 충돌 (HIGH)** — 두 기기가 같은 기록의 서로 다른 체크를 고치면 한쪽이 사라집니다. **QA가 밝힌 추가 위험:** 화면 전체를 통째로 저장하면, 동기화 직후 화면이 낡았을 때 무관한 편집만 해도 낡은 체크값이 되살아납니다(오늘 코드에도 있는 잠복 버그). 이것까지 함께 닫습니다.

**작업 규모(정직 고지):** QA 반영으로 A 트랙이 커졌습니다. 저장 페이로드를 "의도"로 바꾸는 리팩터링이 **출결 스토어 3경로·관찰 스토어 4경로·학생기록 저장 API(시그니처 변경)**에 걸쳐 필요합니다. 스토리는 A1·A2a·A2b·A2c·(조건부)A3·B1·B2·(선택)C의 8개로 재분해됩니다. rev.3의 "유스케이스 본문 래핑"보다 **손대는 파일·테스트가 늘어난다**는 점을 오너가 알고 승인해 주십시오. 대신 이 설계는 오늘 코드의 잠복 유실 버그(낡은 화면 통째 덮어쓰기)까지 구조적으로 닫아 트랙 정당성이 강화됩니다.

---

## 1. 원칙 (Principles)

1. **P1 — 데이터를 잃느니 중복이 낫다.** 애매하면 보존(병합·유지). 통째 유실 금지. (ADR-019 계승)
2. **P2 — "체크 해제도 사용자 의도다."** 단순 OR-병합 금지. `9ce4c1cf`가 고친 "체크 해제가 동기화로 되살아나는 버그"를 되돌리면 안 된다. 항목 단위 "가장 최근 수정"이 정답.
3. **P3 — v2.2.13 회귀 표면 최소화.** 병합 4함수와 기존 테스트 49종은 방금 출시된 코드. 새 동작은 additive로만.
4. **P4 — 데이터-손실-바닥: 어떤 값도 "기록 단위 LWW 이상으로" 사라지지 않는다.** 새 병합이 실패/폴백해도 손실은 최소한 오늘의 record-LWW와 동일 — 그 이상 잃지 않는다. 단 이는 "손실 바닥"이지 "최신성 항상 우위"가 아니다 — C1은 드물게 LWW보다 낡은 값을 고를 수 있으나(§13 R1) 그때도 값은 소실되지 않는다(양 기기 잔존).
5. **P5 — 구버전 앱과 같은 Drive 공유 시 LWW 동등 수준으로 안전하다.** (rev.4 H5 정밀화) 구버전이 새 스키마를 몰라도 데이터 손실은 오늘의 record-LWW 이하로 내려가지 않는다. **"완전 보존"이 아니라 "LWW 동등"** — 구버전이 낡은 체크값을 가진 채 무관 편집만 해도 그 체크가 되살아날 수 있으나(§13 R1-c), 이는 record-LWW와 같은 결과라 바닥을 지킨다.
6. **P6 (rev.4 신규 — 두 BLOCKER의 공통 원칙) — 저장은 스냅샷이 아니라 의도(intent)다.** 스토어는 "전체 배열/전체 레코드"를 만들어 넘기지 않는다. "이 레코드를 upsert / 이 반의 하루를 교체 / 이 태그를 추가 / 이 필드를 이 값으로" 같은 **변경 의도**만 유스케이스에 넘기고, 유스케이스가 **락 안에서 최신(fresh) 상태를 읽어 의도를 적용**한다. **정확성·반응성 분리(F4 — rev.5):** Zustand의 **authoritative(참) 상태는 유스케이스가 반환한 저장 결과로만** 갱신한다(낙관 갱신 금지). **단, 컴포넌트 레벨의 임시 pending 피드백(저장칩·discrete 토글의 즉시 시각 반영)은 허용**한다 — 정확성(authoritative=반환값)과 반응성(임시 피드백)을 분리해, sync 락 경합 중에도 출결 그리드 연속입력·저장칩이 랙 걸리지 않게 한다(§11 실렌더 게이트로 검증). — 이 원칙이 B1(락 밖 스냅샷)과 B2(화면 통째 덮어쓰기) 두 BLOCKER를 동시에 닫는다.

---

## 2. 결정 동인 (Decision Drivers, 상위 3)

1. **DD1 — 무결성 우선, 긴급도 하.** 조용한 유실이라 사후 발견 어려움. 정확성 > 성능 > 편의.
2. **DD2 — 회귀 위험 억제.** 출시 직후 코드라 blast radius 큼. 손대는 경로 수가 위험을 좌우.
3. **DD3 — 스키마·계약 파급.** B는 엔티티 스키마 변경 → `ENTITY_FIELD_CONTRACT` + 브릿지 계약 + 구버전 호환 동반.

---

## 3. 범위

### 포함

- **A. 저장 경합 제거(intent 전환 포함).** **record-merge 3도메인(student-records/attendance/observations) + 우회 경로**의 "읽기→변형→통째 쓰기" 경합 제거 — **유스케이스 본문 락 + 스토어의 락-밖 스냅샷 저장 경로를 intent 메서드로 전환**(rev.4 B1 해소). 우회 직접 쓰기(cascade·로드 마이그레이션) 포함(N1). **(F1 정정 — rev.5) "전 도메인"이 아니다:** teaching-classes(#15, 명렬·좌석)·curriculum-progress(#16)·기타 non-merge 도메인은 SyncFromCloud가 병합 아닌 latest-wins whole-file로 다운로드하며 본 트랙에서 **락을 적용하지 않는다(의도적)** — 오늘과 동일한 무직렬화 경합으로 남기되 손실 밀도가 낮고 본 트랙이 미악화한다(§13 R5 1급 잔여·후속 PDCA).
- **B. StudentRecord 항목 단위 병합 + 의도 기반 저장.** reportedToNeis / documentSubmitted / documents / followUpDone(+followUp/followUpDate)를 항목 단위 "가장 최근 수정"으로 병합, 저장은 before→after 의도로(rev.4 B2 해소).
- (선택) **병합 출력 정렬** — 무해한 재업로드 진동 제거(핸드오프 §2-4).

### 범위 밖 (핸드오프 §4 재확인)

- 인앱 복구(Drive 리비전), 카테고리·태그·records 삭제 전파(툼스톤), 논리시계 — 별도 PDCA/범위 밖.

---

## 4. 후보안 (Viable Options)

### 결정 A: "어느 층에서, 어떻게 쓰기 경합을 막을 것인가"

경합의 본질: 두 흐름이 각자 `read`(같은 스냅샷) → 각자 `write`. **`write`만 순서화해도 소용없다** — 이미 낡은 스냅샷을 읽었기 때문. 락은 **repository 읽기부터** 감싸야 한다. **rev.4 QA 실증 추가:** 스토어가 **락 밖 in-memory(Zustand `get()`)로 저장 페이로드(전체 배열/레코드)를 이미 만들어** 유스케이스에 넘기면, 유스케이스 본문을 락으로 감싸도 그 낡은 페이로드가 그대로 저장돼 경합이 잔존한다(useTeachingClassStore:659/718/349·useObservationStore:110~133 실증). → **변형이 일어나는 지점까지 임계구역에 넣어야 한다 = 저장을 의도(intent)로 표현(P6).**

현재 경합 당사자 (검증된 실제 위치):

- ① `SyncFromCloud` 병합 후 `storage.write`(유스케이스 우회 직접 쓰기) — 충돌 분기 student-records **347**·attendance **366**·observations **385**, 최초 다운로드 **483/492/501**. (※ **402는 병합이 아니라 일반 최신 다운로드 분기**(:395~405) — 병합 writer 목록에서 제외, rev.4 L8.)
- ② 유스케이스 저장 — `ManageStudentRecords`(per-instance 체인 보유), `ManageObservations`/`ManageAttendance`(체인 없음, getAll→build→save가 메서드 본문).
- ③ **스토어의 락-밖 스냅샷 저장(rev.4 B1 — BLOCKER):** `useTeachingClassStore` 출결 3경로(saveRecord:659, saveDayAttendance:718, deleteClass:349) + `useObservationStore` customTags/Categories 4경로(:110~133)가 in-memory 전체 배열을 만들어 `saveAll`/`saveCustom*`에 넘김.
- ④ **우회 직접 쓰기(N1):** `useStudentRecordsStore.cascadeTagChange`(:503~504)·`MigrateStudentRecordsSubcatToTags.migrateStudentRecordsOnLoad`(:49~50)가 repository.saveRecords 직접 호출.
- ⑤ 다중 창(위젯) — `electron/main.ts:2506 broadcastToAllWindows`가 시사하는 별도 렌더러 간 경합.
- ⑥ (참고) main 프로세스 직접 쓰기 — `backup:import`(main.ts:3348~3356)는 main이 데이터 파일 직접 교체(렌더러 락 밖). §13 [backup-import] OQ.

저장 최종 관문(전부 CAS 없음): Electron `data:write`(main.ts:2457~2519, 백업+tmp→rename, CAS 없음), 브라우저 `localStorage.setItem`, 모바일 `db.put`. 참고: AI 브릿지는 `withLock`+CAS 보유(개념 참고용).

| 옵션                                                                  | 개요                                                                                                                 | Pros                                                    | Cons                                                         |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| **A1. 유스케이스 체인 확대**                                          | writeChain 패턴 복제                                                                                                 | 검증된 패턴                                             | ①③④⑤ 미커버 — QA 재현 경합 잔존                              |
| **A2. main 뮤텍스+CAS 전면**                                          | data:write에 버전 CAS                                                                                                | 모든 writer·다중 창 커버                                | 브라우저/모바일 무 main·전 경로 거절·재시도(회귀 큼)·P3 위배 |
| **A3. 하이브리드 — 공용 락 + intent 전환 + (조건부) main CAS 백스톱** | `usecases/shared/fileWriteLock.ts` 싱글턴 + **스토어 스냅샷 경로를 intent 메서드로 전환(P6)** + 다중 창은 조건부 CAS | QA 재현 경합 정확히 닫음·백엔드 무관·잠복 버그까지 해소 | 스토어 리팩터 필요(작업량 증가) · CAS는 실측 게이트 후       |

### 결정 B-1: 필드 시각 표현 — **B1 `type FieldUpdatedAt` 최상위 별칭(notMirrored)** (QA 유효 확인, 재론 금지)

- 계약에 필드 1개(notMirrored)만 추가 → 브릿지 무영향. AttendanceDocumentItem 불변. **최상위 `type` 별칭 필수**(인라인 객체는 `extractInterfaceFields` 첫-brace 절단으로 유령필드 테스트 실패). B2-평면 필드/B3-항목시각(kind, 브릿지 미러 영향)은 기각·보류.

### 결정 B-2: documents 병합 — **B-2a 그룹 단위 + `deriveDocumentSubmitted` 재계산** (rev.4 H4 강화)

- documents+documentSubmitted를 한 그룹으로, 시각 최신 쪽 documents 채택 후 **정본 `deriveDocumentSubmitted`(attendanceDocumentPolicy.ts:106)로 재계산**. **원시 `documents.every()` 금지** — `[].every()===true`라 `{documents:[], documentSubmitted:false}`를 true로 뒤집는 빈-배열 함정(H4). B-2b(kind 단위)는 브릿지 미러 영향으로 보류.

---

## 5. 선택안 + 근거 (rev.4)

- **결정 A → A3(하이브리드 + intent 전환) 채택.** A1은 ①③④⑤ 미커버로 사문화, A2는 회귀 표면 과대(백스톱만 조건부 흡수). 핵심은 **P6 intent 전환**: 스토어가 넘기던 전체 스냅샷을 의도 메서드로 바꿔, 변형을 락 안 fresh-read에 적용.
- **결정 B-1 → B1 별칭 / 결정 B-2 → B-2a(deriveDocumentSubmitted) 채택.** (위 §4 근거.)

### 5.1 항목별 병합 규칙 (mergeStudentRecords — 값 + 결과 fieldUpdatedAt 맵)

1. 추적 항목 f ∈ {reportedToNeis, documentGroup(=documents+documentSubmitted), followUpDone(+followUp/followUpDate **한 그룹**)}.
2. **유효 시각(effective) 3분기(C1, QA 유효 확인):**
   - **(a) 양측 맵 보유** → 각 측 e(f) = `fieldUpdatedAt[f]`(키 있으면 그 값). record.updatedAt 미개입.
   - **(b) 한쪽 맵 부재**(구버전 드롭) → 그 측 e(f) = `record.updatedAt`(백스톱). _단 이 백스톱은 무관 편집으로 체크 부활 가능 — §13 R1-c, P4 바닥은 유지._
   - **(c) 맵 보유·키 f 없음**(한 번도 안 건드림) → e(f) = `createdAt`(무관 편집의 updatedAt 상승 격리).
3. **승자 = e(f) 큰 쪽. 동률 = record-LWW/preferRemote.**
4. **불변식(H4):** documentGroup 채택 후 `deriveDocumentSubmitted(documents, documentSubmitted)` 재계산(원시 every 금지).
5. **결과 fieldUpdatedAt 맵 합성 (H3 — rev.4 신규 필수):** 아래 표. **키 합집합** + 선택 쪽 유효시각을 결과 스탬프로 materialize(clamp) + dormant 키 생략 + **불변식 `createdAt ≤ fieldUpdatedAt[f] ≤ 결과.updatedAt`**(결과.updatedAt = record-LWW BASE 승자의 updatedAt). BASE 맵에 키가 없는데 상대 값만 오버레이하면 다음 병합에서 (c)createdAt로 퇴화해 뒤집힐 수 있으므로, **선택된 값의 시각을 반드시 결과 맵에 남긴다.**

   | 필드 f         | 결과 value                                       | 선택 유효시각 e(f)                           | 결과 fieldUpdatedAt[f]                                                                                                                  |
   | -------------- | ------------------------------------------------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
   | reportedToNeis | e(f) 큰 쪽 값(동률 record-LWW)                   | (a)맵값 / (b)record.updatedAt / (c)createdAt | 선택 쪽 키 있으면 그 값, 없으면 e(f) materialize — `createdAt≤·≤결과.updatedAt` clamp. **양측 무-키·무-편집이면 키 생략(dormant 유지)** |
   | documentGroup  | 위와 동일 → `deriveDocumentSubmitted` 재계산(H4) | 동일                                         | 동일                                                                                                                                    |
   | followUpDone   | 위와 동일(followUp/followUpDate 동반)            | 동일                                         | 동일                                                                                                                                    |
   - **2단계 병합 수렴 테스트(필수):** merge(A,B) 후 merge(result,C) = 병합 순서 무관·재병합 안정(뒤집힘·재업로드 진동 없음).

6. **쓰기 계약(B2 intent — rev.4 "시그니처 불변" 폐기):** fieldUpdatedAt 스탬프는 **디스크 diff가 아니라 사용자 의도(before→after)에서 파생**. `update(before, after)`/`updateMany([{before,after}])`가 **before→after에서 실제 바뀐 필드만** 추출 → 락 안 fresh 레코드에 적용(**F2 — rev.5: 변경 필드(before≠after)는 after 값으로 fresh에 "절대 SET" — CAS "fresh==before일 때만 적용"이 아님**) → 바뀐 추적 필드만 now 스탬프 → 최종 레코드 반환. 사용자가 안 건드린 필드는 before==after라 추출에서 빠져 **fresh(디스크) 값 보존** → 낡은 화면값이 저장되지 않고 fieldUpdatedAt도 안 찍힘. **이 설계가 "낡은 화면 통째 덮어쓰기"라는 오늘 코드의 잠복 버그까지 구조적으로 닫는다**(트랙 정당성 강화).
7. **P4 유지:** 3분기 어느 폴백도 최악은 record-LWW.

### 5.2 A와 B 순서·원자성

- 권장 순서 A → B. **B2는 병합+스탬프가 한 스토리(M7 — rev.4에서 rev.3의 B2·B3를 하나로 병합).** 한 게이트·한 커밋. bridge 맵 드롭 회귀 때문에 병합·스탬프를 쪼개 출시하면 안 된다.
- B1(스키마)만 선행 출시는 안전(additive·dormant).

---

## 6. 하위/상위 호환성 (구버전 앱 ↔ 같은 Drive) — rev.4 H5 정정

- **경로 ①: 구버전이 미지 필드 spread 보존** → fieldUpdatedAt 스테일 → C1 (a) 판정 → 구버전이 f를 더 늦게 고쳐도 옛 신버전 스탬프가 이길 수 있음(낡은 승자, §13 R1). 손실 아님.
- **경로 ②: 구버전이 미지 필드 드롭** → C1 (b) 백스톱(맵 부재 측 e=record.updatedAt). **~~"P5 완전 보존"~~ 철회(rev.4 H5):** (b)는 맵 없는 쪽의 **모든 항목** 유효시각을 record.updatedAt로 본다. 구버전이 낡은 체크값을 가진 채 내용/출결 상세만 나중에 수정하면 그 최신 updatedAt이 체크값까지 승자로 만들어 신버전의 체크 해제를 되살릴 수 있다 → **§13 잔여 R1-c(1급) + map-drop×무관 편집 테스트.** record-LWW와 동일 결과라 P4 바닥은 유지되나 "완전 보존"은 과대 주장이었다.
- **결론:** 어느 경로든 **"record-LWW 이상"(P4 바닥)**. 신버전끼리는 항목 단위로 더 정확. **검증:** 구버전 spread/드롭 2경로 + map-drop×무관 편집을 통합/유닛 테스트로 재현.

---

## 7. Pre-mortem

1. **저장 직렬화가 새는 3경로.** (a)스토어 락-밖 스냅샷(B1) — 유스케이스 본문만 감싸면 낡은 페이로드 그대로 저장 → intent 전환으로만 닫힘. (b)우회 직접 쓰기(N1 cascade·마이그레이션). (c)CAS 백스톱이 토큰 없는 기존 호출을 거절해 저장 조용히 실패 → fail-open·실측 게이트.
2. **화면 통째 덮어쓰기가 체크 부활 강화(B2).** rev.3의 "current/input diff"는 낡은 화면 값을 "사용자 변경"으로 오인해 새 fieldUpdatedAt까지 찍어 9ce4c1cf 회귀 악화 → **before→after 의도 추출로 교체**(안 건드린 필드는 추출에서 빠짐).
3. **빈 배열 documentSubmitted 부활(H4).** 원시 `[].every()===true` → `deriveDocumentSubmitted` 정본 강제.
4. **결과 fieldUpdatedAt 미보존으로 재병합 뒤집힘(H3).** BASE에 키 없는데 값만 오버레이 → 다음 병합 (c) 퇴화 → 결과 맵 materialize + 2단계 수렴 테스트.
5. **마이그레이션 대량 재업로드.** 지연 스탬프(lazy) — 구 기록은 실제 편집 시에만 스탬프.

---

## 8. 확장 테스트 계획 (rev.4)

### Unit — 기존 49종 전량 보존 (P3)

- mergeAttendance(20)/mergeObservations(18)/mergeCategories(6) 그대로 통과. **기준선 실행 확인됨(QA): 49 통과.**
- **`ManageStudentRecords.concurrency.test` 5종 — 시그니처 변경 어댑테이션(정직 고지):** B2가 `update(record)` → `update(before, after)`로 시그니처를 바꾸므로 5종의 **호출 형태를 새 API로 재작성**한다(직렬화·원자 일괄·실패 격리·연속 변이·빈 목록의 **의도는 보존**, 최종 필드값 단언은 유효). deep-equal이 아닌 개별 필드 단언이라(QA 확인) fieldUpdatedAt 추가는 무해.

### Unit — 신규

- **A/intent(P6):** upsertRecord/replaceDayForClass/deleteByClass/add·removeCustomTag·Category가 **락 안 fresh-read에 의도 적용** — 저장소 c1,c2 상태에서 낡은 [c1] 의도 저장 시 c2 미소실(QA 재현 시나리오 역검증).
- **B2/before-after:** ① 낡은 화면(before==after인 미변경 필드)이 fresh 디스크 값을 안 덮음 ② 바뀐 필드만 fieldUpdatedAt 스탬프 ③ 반환 레코드로 Zustand 갱신.
- **B/C1 병합:** ①서로 다른 항목 둘 다 보존 ②(c)무관 편집 격리 ③(b)백스톱 ④documentGroup+H4 재계산 ⑤체크 해제 유지(P2) ⑥followUp 한 그룹.
- **H3 결과 맵:** 필드별 [선택값|유효시각|결과 맵] + **2단계 병합(A+B 후 C) 수렴** + 불변식 createdAt≤·≤updatedAt.
- **H4 빈 배열:** `{documents:[]}` × fallback(false/true/undefined) 3케이스 — 체크 부활 없음.
- **H5/R1-c:** map-drop(구버전) × 무관 편집 → record-LWW 동일 결과(부활하되 바닥 유지) 명시.
- **C5 회귀 잠금(신규 `mergeStudentRecords.field.test.ts`):** 현 record-LWW(SyncFromCloud.ts:50~67)·createdAt/tags 폴백·mergeCategories 위임(현재 이 함수 무테스트 — 정직 고지).
- **계약:** `entitySampleContract.meta.test.ts` — fieldUpdatedAt notMirrored 통과.

### Integration

- SyncFromCloud 3분기 × student-records/observations/attendance에서 **동시 스토어 intent 저장**과 겹쳐도 무유실.
- (N1) cascade/로드 마이그레이션 × sync 병합 무유실. 구버전 2경로 재현.
- **(F3·K3 — rev.5) intra-period 동시 다학생 편집:** 같은 (class,date,period)의 서로 다른 두 학생을 두 흐름이 동시 편집 → per-student upsert intent로 **둘 다 생존**(replaceDayForClass 재사용이면 손실 재현 → per-student upsert 채택을 이 테스트가 강제).

### E2E (실기기, 승인 후 릴리즈 전)

- 2기기 A=나이스·B=서류 → 양쪽 생존. 동기화 중 메모 추가 → 생존. 출결 그리드 저장 중 동기화 → 무유실.

### Observability

- 경합 감지 로그(락 대기 초과/CAS 거절), 항목 병합 결정 로그(분기 시에만).

---

## 9. 핸드오프 §2 함정·제약 승계 (전 6항)

1. **엔티티 새 필드 = `ENTITY_FIELD_CONTRACT` 분류 필수**(안 하면 `entitySampleContract.meta.test.ts` 실패). 새 인터페이스면 `sampleObjectsFor` switch도. reportedToNeis/documentSubmitted는 mirrored, 동기화 메타 시각은 notMirrored 선례 → fieldUpdatedAt은 최상위 `type` 별칭(switch 회피)·notMirrored·AttendanceDocumentItem 불변.
2. **병합 4함수 = v2.2.13 출시 코드.** 49종 보존. **단 `mergeStudentRecords`는 49종에 없음(전용 테스트 부재)** → C5 회귀 잠금 선행.
3. **시계 오차 승자 뒤집힘 = 수용된 트레이드오프.** 논리시계 범위 밖.
4. **병합 출력 정렬 부재 = 저비용 동반 수리(비차단).** 스토리 C.
5. **세션 규칙:** main 단일 워킹트리·명시 path 커밋·게이트(tsc/lint/vitest/regression)+**스키마 변경 시 브릿지 레포 게이트**.
6. **카테고리·customTags 툼스톤·인앱 복구 = 범위 밖.**

---

## 10. 작업 분해 (스토리 단위 — 구현 세션이 그대로 집행)

> rev.4: A2를 A2a/A2b/A2c로 분할(B1 intent 전환 반영), B2·B3를 B2 하나로 병합(M7). 각 스토리 종료 시 게이트 통과 후 명시-path 커밋.

### 스토리 A1 — 공용 파일 락 프리미티브 + 락 키 정본 (C4·M6)

- **신규:** `src/usecases/shared/fileWriteLock.ts` — 모듈 싱글턴(파일명별 Promise 체인 Map). `withFileLock(key, fn)` = 같은 키 직렬·다른 키 병렬·실패 격리. 외부 의존 0.
- **락 키 정본(M6 — rev.4):** `@usecases/sync/syncRegistry`에 **`export const SYNC_FILE_KEYS = { studentRecords:'student-records', attendance:'attendance', observations:'observations', … } as const`** 신설 — **락 키 전용 named 정본(부분집합)**. **(F6 정정 — rev.5)** `SYNC_FILE_KEYS`는 `SYNC_FILES`/`SYNC_REGISTRY`의 파생 원천이 **아니다**: sync 도메인 정본은 여전히 `SYNC_REGISTRY`이고 `SYNC_FILES = SYNC_REGISTRY.filter(...).map(...)`(syncRegistry.ts:351)에서 파생된다. **역할 분리 — `SYNC_FILE_KEYS`=락 키 정본, `SYNC_FILES`/`SYNC_REGISTRY`=sync 도메인 정본.** 락 키는 **`SYNC_FILE_KEYS.*`로만** 접근(리터럴 금지를 집행할 이름 있는 정본 — 기존 `SYNC_FILES: readonly string[]`는 집행 불가였음).
- **락 범위:** 반드시 repository 읽기부터.
- **테스트 격리(NEW-1c):** 리셋 훅 또는 락 DI로 per-instance 격리 보존.
- **의존성:** 없음. **검증:** 신규 유닛(직렬·병렬·실패 격리)·tsc/lint.

### 스토리 A2a — 유스케이스/Sync/우회 경로 락 배선 (C4·N1·NEW-1·NEW-C1)

- **파일:**
  - `SyncFromCloud.ts` — 병합 분기 read→merge→write(347/366/385, 483/492/501)를 파일 락으로. (**402 제외** — 일반 다운로드, L8.)
  - `ManageObservations.ts`·`ManageAttendance.ts` — getAll→build→save 본문을 락으로(build 계약 불변).
  - `ManageStudentRecords.ts` — per-instance writeChain을 **전역 락으로 통일**. **(NEW-1a) 락 키 `SYNC_FILE_KEYS.studentRecords`를 생성자/DI 주입**(생성자가 filename-agnostic:7 — 미주입 시 sync와 락 도메인 분리로 사문화). **(NEW-1b) 비재진입 규율** — `saveCategoriesUnsafe`(:108~116) 전례 승계(-Unsafe 내부 변형·한 계층 획득·같은 파일 중첩 금지).
  - **(N1)** `cascadeTagChange`(:503~507)·`migrateStudentRecordsOnLoad`(:49~50) 락 내부화. **(NEW-C1) cascade는 in-memory `get().records`(:485)가 아니라 락 안 `repository.getRecords()` fresh records에서 재계산**(bulk 메서드 이관 권장). migration은 이미 fresh-read라 전체 감싸기로 충분(비대칭).
- **의존성:** A1. **검증:** concurrency.test(어댑테이션 후) + SyncFromCloud×유스케이스·cascade/migration×sync 무유실 통합.

### 스토리 A2b — 출결 스토어 intent 전환 (P6·rev.4 B1 해소)

- **인벤토리(구현 세션이 논쟁 없이 집행):**

  | 스토어 액션(현재)                                                           | 현재 문제                                                                                                                                                  | 신규 intent 메서드(유스케이스)                                                                                                                                                                                                       | 락 키      |
  | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
  | `useTeachingClassStore.saveRecord`(:640~699)                                | in-memory 전체 upsert 배열→`saveAll`                                                                                                                       | `ManageAttendance.upsertRecord(record)` (락 안 fresh getAll→키 upsert→build)                                                                                                                                                         | attendance |
  | `useTeachingClassStore.saveDayAttendance`(:718~755)                         | 하루 전체 교체, getAll 락 밖                                                                                                                               | `ManageAttendance.replaceDayForClass(classId,date,recordsByPeriod)` (기존 `saveDayBatch`:140 확장·group 처리·락 안)                                                                                                                  | attendance |
  | `useTeachingClassStore.deleteClass`(:340~366) 출결 부분                     | in-memory filter→`saveAll(keep,true)`                                                                                                                      | `ManageAttendance.deleteByClass(classId,{groupIdIfLast})` (락 안 fresh filter)                                                                                                                                                       | attendance |
  | `useStudentRecordsStore.updateAttendanceRecord`(:585) 출결 부분 (**K2·F3**) | 단일 학생 편집인데 stale `getDayAttendance`(:617)로 하루치 재구성→`saveDayAttendance`(:649) = **동시 편집된 타 학생 fresh 덮음**(intra-period 다학생 손실) | **per-student upsert intent** `ManageAttendance.upsertStudentEntry(classId,date,period,studentEntry)`(락 안 그 학생 엔트리만 fresh period record에 병합) — **replaceDayForClass 재사용 금지**(stale 하루 페이로드가 co-student 덮음) | attendance |

- **(K1 — rev.5, 필수·선택지 아님) 기존 `saveAll`류 = 스토어 도달 불가:** whole-array 저장(`saveAll`/`saveDayBatch` 등)은 **삭제(권장) 또는 private/-Unsafe로 SyncFromCloud 병합 쓰기 전용**으로 한정한다. 스토어/adapter 계층에서 **호출 불가**여야 B1(락 밖 whole-array 저장)이 재발하지 않는다. intent 메서드가 유일한 스토어-대면 쓰기 경로(가능하면 lint/architecture 주석 가드). `set()`은 유스케이스 반환값으로(P6).
- **동반 주의:** `deleteClass`는 attendance + progress 두 파일을 비원자 저장(cross-file — [A-teachingclass] 부류, §13 R4). progress도 같은 intent 패턴(`ManageProgress.deleteByClass`) 권장.
- **(F1 — rev.5) 같은 스토어 반쪽 전환 비일관 고지:** `useTeachingClassStore`는 attendance 3경로만 intent로 전환되고 **teaching-classes(명렬·좌석) 15+ 액션(`saveClasses`:385·`manageClasses.update` 등)은 의도적으로 스냅샷 저장·미직렬화로 남긴다**(§13 R5). 같은 파일이 반쪽만 intent라는 비일관은 유지보수 함정이므로 **후속 PDCA로 명시 큐잉 + 소스 주석 표시**할 것(락 확대는 본 트랙 범위 밖).
- **의존성:** A2a. **검증:** upsert/replaceDay/delete/upsertStudentEntry가 락 안 fresh 적용 유닛 + sync 동시 무유실 통합 + (F3) intra-period 다학생 동시 편집 무손실(§8).

### 스토리 A2c — 관찰 스토어 intent 전환 (P6·rev.4 B1 해소)

- **인벤토리:**

  | 스토어 액션(현재)                                 | 신규 intent 메서드                                             | 락 키        |
  | ------------------------------------------------- | -------------------------------------------------------------- | ------------ |
  | `useObservationStore.addCustomTag`(:110~118)      | `ManageObservations.addCustomTag(tag)` (락 안 fresh union)     | observations |
  | `useObservationStore.removeCustomTag`(:120~124)   | `ManageObservations.removeCustomTag(tag)` (락 안 fresh filter) | observations |
  | `useObservationStore.addCustomCategory`(:126~133) | `ManageObservations.addCustomCategory(cat)`                    | observations |

- **(F5 — rev.5) `removeCustomCategory`는 실존하지 않음**(grep 확인) — rev.4의 "(있으면)" 헤지 행 삭제.
- **(K1 — rev.5, 필수) 기존 `saveCustomTags/saveCustomCategories`(ManageObservations:86~96, 전체 배열 수용) = 스토어 도달 불가:** 삭제 또는 private/-Unsafe(SyncFromCloud 전용). 스토어는 add/removeCustomTag·addCustomCategory intent만 호출. **관찰 레코드 CRUD(add/update/delete)는 이미 단일 레코드 intent**라 A2a 본문 락으로 충분(별도 전환 불필요).
- **의존성:** A2a. **검증:** 동시 태그 추가 무유실 유닛.

### 스토리 A3 — (조건부) electron main CAS 백스톱

- `data:write` 버전 CAS + fail-open. **선결 게이트:** "위젯 등 보조 창이 공유 파일을 실제로 쓰는가" 실측. 안 쓰면 후속 큐. 의존 A2a.

### 스토리 B1 — StudentRecord fieldUpdatedAt 스키마 + 계약 (C3·N3)

- `StudentRecord.ts` — **최상위 `type FieldUpdatedAt = { reportedToNeis?: string; documentGroup?: string; followUpDone?: string }`** + `readonly fieldUpdatedAt?: FieldUpdatedAt`(인라인 금지 사유 주석). `emit-entity-samples.mjs` notMirrored에 추가.
- **선결 결정(N3):** followUpDone/followUp/followUpDate = **한 그룹(단일 시각)**(addRecord:250 동반 세팅 근거).
- 의존성 없음(A와 독립). 검증 `entitySampleContract.meta.test.ts`.

### 스토리 B2 — 항목 병합 + 의도 기반 스탬프 (병합 원자, M7 = 구 B2+B3)

- **파일:**
  - `SyncFromCloud.ts` `mergeStudentRecords`(:28~77) — §5.1 규칙 1~5(C1 3분기 + H3 결과 맵 합성 + H4 deriveDocumentSubmitted). 기존 createdAt/tags 폴백·mergeCategories 불변.
  - `ManageStudentRecords.ts` `update`/`updateMany` — **시그니처 변경: `update(before, after)` / `updateMany([{before,after}])`**(rev.4 B2). before→after 변경 필드만 추출→락 안 fresh 적용→바뀐 추적 필드만 스탬프→최종 레코드 반환. documentGroup 변경 시 `deriveDocumentSubmitted` 재계산.
  - **호출부 전환(F5·K2 명시 — rev.5):** `useStudentRecordsStore` toggles(:302~340)·bulkMark(:367~407)·bridge(:552~576)·**`updateRecord`(:286)**·**`updateAttendanceRecord`(:585, student-records 추적필드 부분: before=input.record·after=updatedRecord)** → 새 API로(before=화면 원본, after=편집본). `set()`은 반환 레코드로. **`updateAttendanceRecord`는 A2b(attendance per-student upsert)+B2(student-records before/after)를 한 호출에 이중 쓰기 = cross-file 비원자(§13 R4) — 양 트랙 동시 편입, 두 쓰기 비원자성 고지.**
  - 신규 `mergeStudentRecords.field.test.ts`(C1 6종 + H3 2단계 수렴 + H4 3케이스 + C5 회귀 잠금).
- **자동 해소:** intent 스탬프 중앙화로 bridge 맵 드롭·UpdateAttendancePeriods 미스탬프 해소.
- **의존성:** B1, (권장) A2a. **검증:** 위 신규 유닛 + concurrency 5종(어댑테이션) + 통합(2기기·구버전 2경로·map-drop) + **브릿지 레포 게이트**.

### 스토리 C — (선택) 병합 출력 정렬

- 병합 4함수 출력 결정적 정렬(id/key). 1회 대량 재업로드 고지. 의존성 없음.

---

## 11. 검증 게이트

```bash
npx tsc --noEmit            # 0
npm run lint                # 0 에러
npm run test                # 49 병합 + 경합 5(어댑테이션) + 신규 전부
npm run regression-check    # 통과(수치는 실행 시 확인 — 헤더 주석 스테일)
```

- **스키마 변경(B):** `npm run gen:entity-samples` + `entitySampleContract.meta.test.ts` + **브릿지 레포 게이트**(mirrorRoundtrip 무회귀 — fieldUpdatedAt notMirrored라 브릿지 무변경 정상).
- **IPC 변경(A3):** `node scripts/build-electron.mjs` + electron:dev 재시작 실렌더.
- **플래키:** RenderTemplate·FillFormFields·pdf 3종·JsonInteractiveLessonRepository 단독 재실행 확정. `npm test` tail 파이프 exit 유실 주의.
- **(F4·K3 실렌더 게이트 — rev.5) 출결 그리드 UX 회귀 방지(필수):** 팔레트 **연속입력 + 자동저장 + 저장칩**을 **실렌더로 검증(StrictMode 포함)** — P6의 "authoritative=반환값" 갱신이 sync 락 경합 중에도 저장칩 랙/고착을 유발하지 않는지(프로젝트 메모리 "StrictMode mountedRef 미복원=저장칩 고착=실렌더로만 발견" 이력). 인라인 텍스트 편집 반응성도 포함.

---

## 12. ADR 초안 (승인 시 ADR-023 승격)

- **제목:** ADR-023 — 동기화 2차 하드닝: 의도 기반 저장 직렬화(공용 락) + StudentRecord 항목 단위 병합
- **Decision:**
  1. `usecases/shared/fileWriteLock.ts` 싱글턴 + **락 키 정본 `SYNC_FILE_KEYS as const`**(M6; sync 도메인 정본 `SYNC_REGISTRY`와 역할 분리, F6). 유스케이스 본문·SyncFromCloud 병합·우회 경로를 파일별 직렬화. **스토어의 락-밖 스냅샷 저장을 intent 메서드(P6)로 전환** — 출결 3경로·관찰 tags/categories. ManageStudentRecords는 락 키 DI 주입(NEW-1a)·비재진입 규율(NEW-1b)·cascade 락 내부 fresh-read(NEW-C1). **(rev.5)** 커버리지는 **record-merge 3도메인 + 우회 경로로 한정**(전 도메인 아님, F1 — teaching-classes/curriculum-progress non-merge 도메인은 명시 out-of-scope §13 R5). whole-array save 메서드는 **스토어 도달 불가로 봉쇄**(K1, B1 재발 차단). `updateAttendanceRecord`는 attendance **per-student upsert intent**로 전환(F3, intra-period 다학생 보존). CAS 백스톱은 실측 게이트 조건부.
  2. `StudentRecord.fieldUpdatedAt`(최상위 `type` 별칭, notMirrored)으로 항목 병합 — **유효 시각 3분기(a/b/c)** + **결과 맵 합성(H3, 키 합집합·시각 materialize·2단계 수렴)** + documents는 `deriveDocumentSubmitted` 재계산(H4). 스탬프는 **before→after 의도**에서 파생(rev.4 — "시그니처 불변" 폐기, `update(before,after)`), 이로써 낡은 화면 통째 덮어쓰기 잠복 버그까지 해소.
- **Drivers:** 무결성 우선·회귀 억제·계약 파급 최소.
- **Alternatives:** A1(사문화)·A2 전면 CAS(회귀 과대)·B2-평면·B3/B-2b-kind(브릿지 영향)·rev.3 "유스케이스 본문 래핑"(락 밖 스냅샷으로 QA NO-GO)·rev.3 "current/input diff 시그니처 불변"(낡은 화면 오인으로 QA NO-GO).
- **Consequences:** 스토어 저장 API가 intent로 이동(작업량 증가). update 시그니처 변경 → concurrency.test 어댑테이션. bridge 맵 드롭·잠복 덮어쓰기 해소. R1(낡은 승자)·R1-c(map-drop 부활)·R2(kind 분기)·R3(시계)·R4(cross-file 비원자)·**R5(non-merge 도메인 무직렬화, F1)**는 잔여. CAS·정렬은 조건부.
- **Follow-ups:** 인앱 복구·툼스톤·CAS·정렬·논리시계.

---

## 13. 범위 밖 + 잔여 + Open Questions

### 범위 밖

- 인앱 복구(Drive 리비전)·툼스톤(카테고리/태그/records)·논리시계.

### 잔여(1급 고지 + 테스트)

- **R1 (C1 vs LWW 판정 분기 — 의도적 교환):** 신×신 disjoint 편집(HIGH 버그)을 고치는 대가로, 경로① 구버전 spread 보존 후 f를 더 늦게 편집 시 낡은 신버전 스탬프 채택(손실 무). §8 유닛.
- **R1-b (followUp 그룹 시각 상승):** followUp 텍스트만 편집해도 그룹 시각 상승 → 병합이 그 쪽 followUpDone 채택. record-LWW 동일 결과(P4 바닥).
- **R1-c (rev.4 H5 — 경로② map-drop 부활):** 구버전이 낡은 체크값을 가진 채 무관 편집만 해도 (b)백스톱의 record.updatedAt이 체크값까지 승자로 만들어 신버전 체크 해제 부활. **record-LWW 동일 결과라 P4 바닥 유지**, 그러나 §6 "P5 완전 보존"은 철회. map-drop×무관 편집 테스트.
- **R2:** documents 그룹 내 kind 단위 동시 분기 손실(B-2a).
- **R3:** 시계 오차 승자 뒤집힘(수용).
- **R4 (cross-file 비원자):** deleteClass의 attendance+progress, updateAttendanceRecord의 student-records+teaching-classes — 파일별 락은 교차파일 원자성 미보장(기존 위험, 본 트랙 미악화).
- **R5 (F1 — rev.5 신규 1급, 문서 가드): teaching-classes/curriculum-progress 등 non-merge 도메인은 본 트랙에서 락 미적용(의도적).** `useTeachingClassStore`의 명렬·좌석 15+ 액션(`saveClasses`:385 등)과 curriculum-progress(#16)는 in-memory whole-array 저장이지만, SyncFromCloud가 병합 아닌 **latest-wins whole-file**로 다운로드하는 도메인이라 이번 트랙은 record-merge 3도메인만 커버하고 **이들은 오늘과 동일한 무직렬화로 남긴다**(merge-clobber보다 손실 밀도 낮음·본 트랙 미악화·P4 바닥). 미래 회귀 오인 방지 문서 가드 — **락 확대는 후속 PDCA**(같은 `useTeachingClassStore`가 attendance만 반쪽 전환된 비일관 포함).

### C1이 정답으로 만든 케이스(잔여 아님)

- 신버전 추적 항목 편집 후 무관 편집 겹침 → (c)분기가 f 시각을 createdAt으로 격리해 상대의 정당한 편집이 승리(원안이면 record-LWW 퇴화). §8 유닛 ②.

### 해소된 Open Questions

- **[A-scope]:** `usecases/shared/fileWriteLock.ts`. **[B-followup]:** 한 그룹(단일 시각).

### 잔존 Open Questions (→ `.omc/plans/open-questions.md`)

- **[A3-CAS] — 해소(2026-07-14 구현 세션 실측): CAS 불채택, 후속 큐 이동.** 정적 전수 추적 결과
  보조 창은 record-merge 3도메인 파일을 쓰지 않는다 — ① 위젯 창(WidgetApp, App.tsx:578)에서
  3도메인 스토어를 쓰는 아이템은 StudentRecords 위젯(=DashboardStudentRecords 재수출,
  `{records, loaded, load, categories}`만 구독 = 읽기 전용)·TodayProgress(읽기 전용)뿐
  ② QuickAdd 보조 창은 todo/event/memo/note/bookmark 전용(useQuickAddStore.ts:3)
  ③ autoSyncOnSave 구독·syncFromCloud 타이머는 MainApp(:664~) 내부 useEffect라 보조 창에서
  실행되지 않음(보조 창의 sync 쓰기 없음). 위젯이 쓰는 파일(todos/memos/settings 등)은
  non-merge 도메인 = R5 잔여(기존 위험·본 트랙 미악화). → electron data:write CAS 백스톱은
  회귀 표면 0 원칙대로 **미구현**, R5 후속 PDCA에서 non-merge 다중 창과 함께 재평가.
- **[B-bridge]** 브릿지 직접 쓰기의 record.updatedAt 스탬프 여부(C1 (b)백스톱·H5 관련).
- **[A-teachingclass/R4]** cross-file 비원자 경합(파일별 락 한계) — 실측·범위 판단.
- **[lock-key]** `SYNC_FILE_KEYS` 값 ↔ 각 스토리지 파일명 일치 1줄 확인.
- **[backup-import]** `backup:import`(main 직접 쓰기)의 autoSync/동기화 경합 1회 확인.
- **[saveAll-격리]** (K1 재서술 — rev.5) **"스토어-대면 도달 불가"는 필수 요구**(선택지 아님, §10 A2b/A2c). 열려 있는 것은 **격리 방식뿐** — 삭제(권장) vs private/-Unsafe(SyncFromCloud 전용). 어느 쪽이든 스토어에서 whole-array save 호출이 불가능해야 B1 재발이 차단된다.
- **[C-sort]** 병합 출력 정렬 편승 타이밍.

---

## RALPLAN-DR 요약 (rev.5)

- **Principles(6):** 유실<중복 / 체크 해제도 의도 / v2.2.13 회귀 최소 / 데이터-손실-바닥(LWW 이상) / 구버전 LWW 동등 안전 / **P6 저장=의도(intent)**.
- **Options:** A(A1 체인 / A2 main CAS / **A3 하이브리드+intent 채택**) · B-1(**FieldUpdatedAt 별칭**) · B-2(**그룹+deriveDocumentSubmitted**).
- **선택안:** A3(공용 락 + `SYNC_FILE_KEYS` 정본 + 스토어 intent 전환 + 조건부 CAS) + B1 별칭 + B2 병합(C1 3분기 + H3 결과 맵 + H4 derive + before/after 의도 스탬프).
- **rev.2:** C1~C5·N1~N3. **rev.3:** NEW-1a/b/c·NEW-2·NEW-3·NEW-C1·OQ backup-import.
- **rev.4(QA NO-GO 반영):** [B1] A2 재설계=P6 intent 전환(출결3·관찰4 인벤토리) · [B2] update 시그니처 before/after(잠복 덮어쓰기 해소) · [H3] 결과 fieldUpdatedAt 합성표+2단계 수렴 · [H4] deriveDocumentSubmitted(빈 배열 함정) · [H5] 경로② R1-c 강등·P5 "완전"→"LWW 동등" · [M6] `SYNC_FILE_KEYS as const` · [M7] B2+B3 단일 스토리 · [L8] :402 제외.
- **rev.5(재합의 마감):** [F1] 스코프 정정(record-merge 3도메인+우회)·R5 non-merge 잔여 · [F2] patch=절대 SET(CAS 아님) · [F3] `updateAttendanceRecord` per-student upsert · [F4] authoritative/pending 분리·실렌더 게이트 · [F5] removeCustomCategory 삭제·updateRecord/updateAttendanceRecord 명시 · [F6] `SYNC_FILE_KEYS`(락 키)/`SYNC_REGISTRY`(도메인) 역할 분리 · [K1] whole-array save 스토어 도달 불가(필수) · [K2] updateAttendanceRecord 양 트랙 편입·cross-file 고지 · [K3] F3/F4 테스트·게이트·R5 문서 가드. **판정: 3자 재합의 완료(Architect APPROVE_WITH_CHANGES·Critic 조건부 APPROVE — 반영 후 재검 불요) — 사용자 승인 대기.**
