# 기록 체계 통일 — Q2 설계서: 담임 서브카테고리 → 태그 흡수

> 작성: /ralplan consensus (deliberate 모드) · Planner → Architect → Critic 합의
> 작성일: 2026-06-24
> 성격: **설계 문서. 구현·커밋 금지 — 사용자 승인 후 단계 구현.**
> 입력 근거: 묶음① 설계서(`record-system-unification-phase1.design.md`) + Q2 코드 직접 정독(InputMode/RecordCategory/StudentRecord/studentRecordRules/applyLiveSyncWrite/aiBridgeLiveSyncCore/ManageStudentRecords/SyncFromCloud/StudentsPage + 브릿지 attendanceTools/studentRecord 미러)
> 상태: **pending approval** (문서 끝 명시)

---

## RALPLAN-DR 요약 (문서 상단 고정)

### 모드: **DELIBERATE**

고위험 신호: ① 모든 기존 `StudentRecord.subcategory`를 건드리는 마이그레이션(데이터 유실 위험) ② subcategory가 MCP 계약 필드(읽기·쓰기 양쪽) ③ 통계(`praise`)·출결 파싱이 subcategory에 결합. 데이터 유실 0이 불가침.

### 원칙 (Principles)

1. **데이터 유실 0 / 무손실·하위호환** — `StudentRecord.subcategory` 엔티티 필드는 **보존**(삭제 금지). 비출결 subcategory 값은 tags로 **복사**(이전·삭제 아님).
2. **계약은 합성/어댑터로 보존** — subcategory를 사용자 입력 축에서 제거하되 "보이지 않는 MCP 계약 슬롯"으로 격하. MCP 쓰기 멤버십·출결 구조 무변경. **단 MCP 읽기 표면의 정보량은 tags 추가로 보강한다**(원안의 "읽기 무변경"을 Critic M2에 따라 "읽기 표면은 tags additive로 보강"으로 정밀화 — 아래 §4-마).
3. **2축 대칭 통일 + 표시는 tags 단일기준** — 입력/표시/검색/내보내기에서 비출결 분류는 `category + tags`뿐. subcategory는 화면에 노출하지 않는다.
4. **출결 경로 절대 무변경** — `category==='attendance'`의 subcategory("결석 (질병)")·`attendancePeriods`·미러(`bridgeHomeroomDayAttendance`)·통계 파싱(`extractAttendanceType`)·정렬 전부 불변.

### 결정 동인 (top 3)

1. **데이터 유실 0**(불가침) — subcategory를 비우면 MCP 읽기 표면 + 통계가 깨진다.
2. **MCP 오귀속 회피** — `recordNote` 쓰기 2단 검증(category.subcategories 멤버십)이 살아있어야 외부 AI가 안전.
3. **사용자 가치 = 분류 축 단순화**(3축→2축) — 교과(`ObservationRecord`: category+tags)와 동일 경험.

---

## 1. 문제와 목표

### 1.1 문제

담임 기록(`StudentRecord`)은 분류 축이 **3개**(category + subcategory + tags)다. 교과 관찰(`ObservationRecord`)은 **2개**(category + tags). 같은 교사가 두 화면에서 다른 분류 모델을 만나며, 담임의 subcategory와 tags는 역할이 중복된다.

### 1.2 목표

담임 **비출결** 기록을 `category + tags` 2축으로 통일한다. 즉 비출결 subcategory 선택을 입력/표시 UI에서 제거하고 tags로 대체한다. + 커스텀 태그를 한 곳에서 관리하는 화면(카테고리 관리 모달 수준)을 추가한다.

### 1.3 범위

- **In**: 담임 비출결 subcategory → tags 흡수(입력·표시·검색·내보내기·편집·통계·마이그레이션), 태그 관리 화면, MCP 계약 보존(+읽기 표면 tags 보강), 모바일 칭찬 쓰기 경로 정합.
- **Out**: `StudentRecord.subcategory` 엔티티 제거(보존), 출결 subcategory/구조 변경, MCP 쓰기 계약(멤버십) 변경, 교과 측 변경(이미 2축), 물리 통합(Phase 4), 담임+교과 공용 태그 관리(T-B, 후속).

---

## 2. 현재 구조 (설계 기준선, 코드 근거)

| 영역               | 현재                                                                                                     | 좌표                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 엔티티             | `StudentRecord{category, subcategory:string(required), tags?:string[]}`                                  | `StudentRecord.ts:18-36`                                                                            |
| 봉투               | `StudentRecordsData{records, categories?}` — **schemaVersion 없음**                                      | `StudentRecord.ts:38-41`                                                                            |
| 출결 subcategory   | `"결석 (질병)"` 구조적 데이터(대표교시 합성)                                                             | `useStudentRecordsStore.ts:377`, `InputMode.tsx:366`                                                |
| 비출결 subcategory | `RecordCategoryItem.subcategories[]`의 라벨(학부모상담·칭찬·건강…)                                       | `RecordCategory.ts:22-47`                                                                           |
| 입력               | `selectedSub{categoryId, subcategory}` 칩 선택 → `addRecord(...)` **직접 호출** (toStudentRecord 미경유) | `InputMode.tsx:167-170, 377-388, 501-516`                                                           |
| 중복 감지          | `(date, category, subcategory)` 키로 skip                                                                | `InputMode.tsx:487-497`                                                                             |
| 표시               | 비출결도 `record.subcategory` 칩 직접 렌더                                                               | `DefaultRecordListView.tsx:93-94`, `StudentTimelineView.tsx:139`, `SearchMode.tsx:213/274`          |
| 내보내기           | 비출결 `rec.subcategory` 단일값                                                                          | `ExcelExporter.ts:1381/1407/1437`, `HwpxExporter.ts`, `pdf/AllPdfExporters.ts`                      |
| 통계               | `praise = category==='life' && subcategory==='칭찬'`                                                     | `studentRecordRules.ts:87-89`                                                                       |
| 모바일 칭찬 쓰기   | `{category:'life', subcategory:'칭찬'}` **tags 없음** (영구 경로)                                        | `StudentsPage.tsx:276-293`                                                                          |
| 봉투 쓰기          | add/update/delete/saveCategories 모두 `{records, categories}` 재구성                                     | `ManageStudentRecords.ts:18-65`                                                                     |
| Drive 병합         | record id별 `createdAt >=` 최신 우선, schemaVersion 미보존                                               | `SyncFromCloud.ts:19-45`                                                                            |
| MCP 쓰기           | `recordNote` subcategory 필수 + `category.subcategories` 멤버십 검증                                     | `applyLiveSyncWrite.ts:631,649`, `aiBridgeLiveSyncCore.ts:661-697`, 브릿지 `attendanceTools.ts:630` |
| MCP 읽기           | `get_homeroom_notes` → `{date, categoryId, subcategory, content}` — **tags 없음**                        | 브릿지 `attendanceTools.ts:573-589`, 미러 `studentRecord.ts:20-32,65-92`                            |

---

## 3. 핵심 결정: 비출결 subcategory의 저장 시맨틱

### 채택: **옵션 S-A′** — subcategory = "보이지 않는 MCP 계약 슬롯"

- **신규 저장(UI/모바일)**: subcategory = `synthesizeSubcategory(categoryId)` = 카테고리별 **중립 sentinel**(예 '일반'; `etc`는 기존 '기타' 재사용). **tags[0] 합성 금지** — 태그 reorder 종속 + `UnifiedRecordDraft.ts:47`의 P3 불변식("category↔tags 직교")을 역방향으로 깨므로.
- **표시/검색/내보내기**: 비출결은 **tags 직접 렌더**(0개면 카테고리명 fallback). subcategory 미노출. 출결 칩은 무변경(`getSmartTagClass`가 attendance만 분기, `recordUtils.ts:225`).
- **마이그레이션**: 비출결 레코드의 기존 subcategory를 tags에 **복사**(idempotent, includes 가드). subcategory 값은 **보존**(MCP 읽기 표면 안정). 출결 절대 제외.
- **계약 보존**: `category.subcategories[]` 보존(멤버십 검증 전용). 각 기본 카테고리에 중립 sentinel 1개 시드(외부 AI 선택지 + UI 합성값이 멤버가 되도록).

### 기각 대안 (공정한 무효화 근거)

- **S-B (엔티티에서 subcategory 제거 + MCP 재계약)**: 불가침 #2 정면 위반. 본체 + 브릿지(**별도 레포** `ssampin-ai-bridge`) 동시 변경 → 2레포 릴리즈 스큐 위험(MEMORY: 브릿지는 본체 미수정 원칙). 범위·위험 초과. **(Critic 확인: 정당한 기각, strawman 아님.)**
- **S-C (비출결 subcategory를 빈문자열로 비움)**: 무손실 원칙과 긴장 + `get_homeroom_notes`가 기존 레코드에서 빈 subcategory 반환(읽기표면 형태 변경). **단 S-A′도 신규 레코드 subcategory를 sentinel로 바꿔 읽기표면 정보량을 낮추므로, S-C 대비 차별점은 "빈문자 vs sentinel"뿐 → §4-마(tags additive 보강)로 둘의 공통 약점을 함께 해소한다.**
- **S-A (tags[0] 합성)**: drift + P3 역방향 혼입. S-A′가 고정 sentinel로 격하해 흡수.

### 합의 경위 (요약)

- **Architect: SOUND-WITH-CONCERNS** → S-A(tags[0])는 "통일의 외관을 쓴 영구 dual-write"라는 steelman. 합성값을 sentinel로 격하 + 표시를 tags화하는 **S-A′** 제안 채택.
- **Critic: ITERATE** → CRITICAL 2건(아래 §6에서 해소), MAJOR 4건(M1~M4), AC#4 거짓 지적. **전부 코드로 재검증 후 v3에 반영.**

---

## 4. 영역별 상세 설계

### (가) 도메인

- `StudentRecord.subcategory` 보존(required string). 의미만 "사용자 축" → "MCP 계약 슬롯"으로 재해석.
- 신규 `synthesizeSubcategory(categoryId: string): string` (`domain/rules/studentRecordRules.ts`, 순수 함수) — 카테고리별 중립 sentinel 반환. **출결에는 호출하지 않음**(출결은 기존 경로).
- `SUBCATEGORY_SENTINEL` 상수 + `DEFAULT_RECORD_CATEGORIES`의 비출결 카테고리 subcategories[] 선두에 sentinel 시드(additive).
- **주입점 (Critic OQ#1 해소)**: 담임 데스크톱 저장은 `toStudentRecord`를 **경유하지 않는다**(`InputMode.saveForDate:501-516`이 `addRecord` 직접 호출). 따라서 sentinel 합성은 **InputMode(어댑터)가 도메인 `synthesizeSubcategory(categoryId)`를 호출**해 subcategory 인자로 전달한다(어댑터→도메인 호출, 규칙 재구현 금지 — 레이어 위반 없음). `addRecord`(store)는 sentinel을 강제하지 않는다(MCP recordNote 경로는 실제 subcategory를 받아야 하므로). `UnifiedRecordDraft.toStudentRecord`(`:69-80`, 현재 `subcategory ?? ''`)도 비출결이면 sentinel을 쓰도록 정합화하고 **기존 통과 테스트(`UnifiedRecordDraft.test.ts`) 갱신**(Critic m1).

### (나) 마이그레이션 (불가침 #3·#4 / Critic C1·M1·M4 해소) — **데이터 안전 보강판**

**게이트 = 영속 플래그 없음. "load() 멱등 정규화"로 전환 (C1 해소 + 동기화 안전).**

- **왜 플래그를 버리나 (코드 검증)**: ① `StudentRecordsData.schemaVersion`은 `ManageStudentRecords.add/update/delete/saveCategories`(`:21-64`)·`SyncFromCloud.mergeStudentRecords`(`:41-44`)가 봉투를 `{records, categories}`로 재구성하며 **드롭**(직접 검증). ② **Settings 플래그도 위험** — `settings`는 Drive 동기화 대상(`syncRegistry.ts:58-68`, `subscribeExcluded:true`지만 download 후 `reload`로 재적용)이라, A기기가 "완료" 플래그를 올리면 **아직 변환 안 된 데이터를 가진 B기기로 전파**되어 B가 마이그레이션을 건너뛸 수 있다(데이터 미변환 고착).
- **채택: 멱등 정규화 on load.** `useStudentRecordsStore.load()`(`:173-184`)에서 **매번** `normalizeStudentRecordsSubcatToTags(records)`를 실행하되, **변경이 있을 때만 저장**한다. 이미 변환된 레코드(tags가 subcategory 포함)는 스캔에서 스킵 → 변경 0 → 저장 0(순수 read no-op).
  - **자가 치유 (M4 핵심 해소)**: `student-records`는 동기화 download 후 `loaded:false`→`load()` 재실행(`syncRegistry.ts:144-151`). 따라서 다른 기기에서 받은 미변환 레코드도 **post-sync reload에서 재정규화**된다 → 플래그 전파 위험 없이 모든 기기가 수렴.
  - **비용**: records 전수 1-pass 스캔(O(n), 메모리 내, 수백~수천 건 무시 가능). 첫 변환 1회만 저장, 이후 클린이면 no-op. `load()`는 세션당 1회(+sync reload 시)라 루프 없음.
- **마이그레이션 규칙**: `category !== 'attendance' && subcategory.trim() && !tags?.includes(subcategory)` → `tags = [...(tags??[]), subcategory]`. subcategory **보존**. 출결 절대 제외.
  - **P4 엣지 규칙 (Critic m2 해소)**: category가 'attendance'가 아닌데 subcategory가 "결석 (질병)" 형태인 과거 오분류 레코드는 **category 필드만으로 판정** — 비출결이므로 subcategory 문자열을 verbatim으로 tags에 복사(추측 재분류 금지). 테스트로 못 박는다.
- **무손실 증명 (M1 해소)**: roundtrip 테스트는 **불변식이 아니라 스냅샷 대조**로 증명 — 마이그레이션 전 각 비출결 레코드의 subcategory 값이 마이그레이션 후 그 레코드 tags에 **반드시 포함**됨을 단언(pre-state 스냅샷 비교). 불변식 `tags.includes(subcategory) || subcategory===SENTINEL`은 **보조 일관성 검사**로만.
- **Drive 병합 동률 가드 (M4 심층 방어)**: 정규화는 `createdAt`을 바꾸지 않으므로 `mergeStudentRecords`(`:34`)의 `createdAt >=` 동률에서 미변환 레코드가 변환본을 덮을 수 있다. → `mergeStudentRecords`에 **동률 시 tags가 더 많은(=변환된) 쪽 우선** 가드 추가(자가 치유의 2차 안전망). 미변환↔변환 동일 id 병합 IT.

**원자성·백업·롤백 (신규 보강)**

- **원자성**: load()에서 in-memory 정규화 → `await` 영속 → 영속 성공 후에만 메모리 set. 영속이 throw하면 메모리 갱신 안 함(다음 load 재시도). 멱등이라 부분 실패 후 재시도 안전.
- **자동 안전 백업**: 정규화가 **실제로 레코드를 변경하는 첫 실행 직전**, `backupManager`로 student-records 안전 백업 1부(자동, on-load라 사용자 프롬프트 불가 → 자동 스냅샷). 변경 0이면 백업 생략.
- **가역성**: 본 마이그레이션은 **additive·비파괴**(subcategory 보존, tags에 값 추가만). 따라서 "역마이그레이션"(subcategory와 동일한 태그 제거)으로 되돌릴 수 있다 — 데이터 안전도 최상. 비상 롤백 = 자동 안전 백업 복원.
- **브릿지 직접쓰기 상호작용**: 앱 종료 중 브릿지가 직접쓰기(`liveWrite.decideWritePath 'direct'`)한 레코드는 실제 subcategory + tags 없음일 수 있다. 다음 앱 기동 load() 정규화가 그 subcategory를 tags로 흡수 → 정합. (그 사이 get_homeroom_notes는 subcategory만 노출 — S6 보강 후엔 tags도, 기동 후엔 둘 다.)

### (다) 입력 UI (InputMode)

- 비출결: subcategory 선택칩(`handleSubcategoryClick` + `cat.subcategories.map`, `:996-1012`) 제거 → 카테고리 단일 선택 + 태그칩(S4 `:1046-1099` 재사용). `selectedSub{categoryId, subcategory}` → 비출결은 `selectedCategory{categoryId}`로 단순화. 저장 시 subcategory = `synthesizeSubcategory(categoryId)`.
- **중복 감지 키 재설계 (Critic C2/M3, P0)**: 현재 `(date, category, subcategory)`(`:487-497`). 비출결 키를 → content 있으면 `(studentId, date, category, content)`, **content 비어있으면 `(studentId, date, category)`로 dedup**(빈 메모 빠른탭 이중제출 방지 — 원래 dedup 목적 보존). 출결 경로 무변경. 양/음 케이스 IT.
- 출결 경로(attendanceType/handleAttendanceReasonClick/PeriodChipGroup/여러날) 전부 무변경.
- 템플릿(`DEFAULT_TEMPLATES`)의 subcategory → 태그 prefill 매핑.

### (라) 표시·편집·검색·통계 + 쓰기 경로 정합 (전수 스윕)

- **읽기 표면 전수 인벤토리 (Critic gap, P1)**: subcategory 직접 읽기 ~20파일을 게이트 산출물로. 비출결을 tags 렌더로: `DefaultRecordListView:94`, `StudentTimelineView:139`, `SearchMode:213/274`, `StudentRecordReferencePanel`, `Dashboard/DashboardStudentRecords`, `mobile/pages/StudentsPage`, `InlineRecordEditor`, `ExcelExporter:1381/1407/1437`, `HwpxExporter`, `pdf/AllPdfExporters`.
- **쓰기 경로 인벤토리 (Critic gap)**: subcategory 생산자 3곳 — ① `InputMode`(데스크톱, sentinel 합성) ② `StudentsPage:283`(모바일 칭찬) ③ 브릿지 live-sync(`applyLiveSyncWrite.recordNote`, 실제 subcategory 유지).
- **통계 praise (Critic C2 해소)**: `getAttendanceStats` praise = `category==='life' && (tags?.includes('칭찬') || subcategory==='칭찬')` — **영구 이중기준**(제거 가능한 "마이그레이션 전 안전망"이 아님을 명시). 모바일 칭찬 경로가 영구적으로 subcategory-only를 생산하므로. **추가로 모바일 `addPraiseRecord`(`StudentsPage:283`)를 `tags:['칭찬']`도 쓰도록 정합화**(전방 일관성). 모바일 형태(subcategory-only, tags 없음) 레코드로 `praise===1` 단언하는 UT 필수.
- **정적 메타테스트 + allowlist (Critic m3)**: 신규 비출결 subcategory 직접참조를 차단하는 정적 메타테스트 추가(modal-scroll-overflow-fix 패턴). 정당한 출결 subcategory 리더는 allowlist: `getSmartTagClass`, `getAttendanceTypeFromSubcategory`, `initEditAttendancePeriods`, `extractAttendanceType`, 출결 표시 경로, 브릿지 미러.
- 편집(`InlineRecordEditor`): 비출결 `category + tags` 편집(subcategory 직접편집 제거). 출결 편집 무변경.

### (마) MCP 계약 (불가침 #2 / Critic M2 해소)

- **쓰기**: `applyRecordNote`/`checkRecordNotePayload`/브릿지 `attendanceTools` **코드 변경 0**. `category.subcategories[]` 보존 → 멤버십 검증 그대로. 외부 AI는 여전히 subcategory로 씀(UI만 태그로 전환). **신규 CT: 합성 sentinel 값이 `applyRecordNote` 멤버십을 통과함을 단언**(sentinel을 subcategories[]에 시드했으므로).
- **읽기 (M2 — Q2-S6로 본체 범위 확정, 사용자 승인 2026-06-24)**: 신규 비출결 레코드의 subcategory가 모두 sentinel이 되면 `get_homeroom_notes`를 읽는 외부 AI의 분류 정보가 붕괴한다(Principle 2의 실질 위반). → **브릿지(별도 레포) 미러 엔티티 파서에 `tags` 필드 추가(additive) + `get_homeroom_notes` note view에 tags 포함**을 **Q2-S6에 포함**(2레포 동시 출시). → **AC#4 정직화**: "MCP 쓰기 계약 무변경 + 읽기 표면은 tags additive로 보강"(읽기 품질 저하 없음).

### (바) 카테고리 관리 모달 + 태그 관리 화면 (T-A)

- 신규 "태그 관리" 화면(카테고리 관리 모달 수준): `Settings.homeroomRecordTags` CRUD + `DEFAULT_HOMEROOM_RECORD_TAGS`(내장, 삭제불가) 표시. rename = 기존 레코드 tags 치환 카스케이드, delete = 레코드 tags 제거(확인). 인프라(`homeroomRecordTags`/`customHomeroomTags`)는 S4에서 이미 존재.
- 카테고리 관리 모달의 subcategory CRUD: "고급(MCP 계약)" 섹션으로 접어 유지(외부 AI용). (최종 OQ.)

---

## 5. 사전부검 (Pre-mortem)

- **P1 (idempotency)**: 정규화 재실행 시 tags 중복 누적. → `includes` 가드(이미 포함이면 스킵=변경 0) + roundtrip 중복 단언. (멱등 정규화라 재실행 자체가 안전.)
- **P2 (출결 오염)**: 출결 레코드가 필터를 빠져 subcategory가 태그로 오염 → 통계/정렬/파싱 깨짐. → `category==='attendance'` 강제 제외 + RG-출결 불변(subcategory·attendancePeriods).
- **P3 (형태 차이)**: 마이그레이션 보존(subcategory=옛값) vs 신규 sentinel → 두 산출물 공존. → 스냅샷 무손실 단언 + 보조 불변식이 양쪽 커버.
- **P4 (C1 — 게이트 드롭) [재설계로 소멸]**: schemaVersion은 봉투 재구성에 드롭, Settings 플래그는 Drive 동기화로 전파되어 미변환 기기가 건너뜀. → **영속 플래그 폐기 + load() 멱등 정규화(변경 시만 저장)**로 전환(§4-나). 재실행이 안전·자가치유라 게이트 자체가 불필요.
- **P5 (C2 — 통계 침묵 미집계)**: 모바일 칭찬이 영구 subcategory-only라 praise tags 전환 시 신규 칭찬 미집계. → praise 영구 이중기준 + 모바일 경로 tags 정합 + 모바일형태 UT.
- **P6 (M4 — Drive 좀비)**: 동률 createdAt 병합에서 미변환 레코드가 변환본을 덮음. → post-sync reload 재정규화(자가치유, §4-나) + 병합 동률 시 tags 많은 쪽 우선 가드(2차) + 병합 IT.
- **P7 (원자성)**: 첫 변환 영속 중 크래시 → 부분 변환. → 영속 성공 후에만 메모리 set + 멱등 재시도 + 변경 직전 자동 안전 백업(§4-나).

## 5.2 테스트 계획

- **UT**: `synthesizeSubcategory`(카테고리별 sentinel), `MigrateStudentRecordsSubcatToTags`(idempotent·attendance제외·무손실 스냅샷·P4 엣지), `getAttendanceStats` praise(tags 기준 + 모바일 subcategory-only 형태), 보조 불변식.
- **IT**: migration-roundtrip(load→migrate→save→reload 안정 + 레코드수·attendance subcategory·attendancePeriods 불변 + **pre-state subcategory ∈ post tags 스냅샷 대조**), Drive 병합(미마이그레이션↔마이그레이션 동일 id → tags 유지), InputMode 비출결 저장(tags 영속 + subcategory=sentinel), 중복감지(같은날 같은카테고리 다른내용 2건 허용 + 빈메모 이중제출 차단), 편집 라운드트립, 태그 rename/delete 카스케이드.
- **CT(계약)**: `applyRecordNote` 멤버십 GREEN(category.subcategories 보존) + **합성 sentinel이 멤버십 통과**, `get_homeroom_notes` subcategory 비어있지않음(+S6 적용 시 tags 포함), `RECORD_NOTE_FIELDS` 불변, 미러파서 라운드트립(+S6 tags 파싱).
- **E2E**: 비출결 입력→태그→저장→표시 tags 칩, 태그 관리 CRUD.
- **Observability**: 정규화가 실제 변경한 레코드 수 로그(변경 0이면 무로그), 정적 메타테스트(신규 subcategory 직접참조 차단 + allowlist).
- **게이트**: `tsc --noEmit` 0 / `lint` 0 / `vitest --pool=forks` / `regression-check` + backupManager 백업.

---

## 6. Critic CRITICAL/MAJOR 해소 추적표

| 발견                                               | 등급 | 해소                                                                                                        | 좌표                                                                                            |
| -------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| C1 schemaVersion 봉투 드롭 → 영구 재실행           | CRIT | 영속 플래그 폐기 → load() 멱등 정규화(변경 시만 저장, 자가치유). settings 플래그도 Drive 전파 위험이라 기각 | §4-나, `ManageStudentRecords.ts:21-64`·`SyncFromCloud.ts:41-44`·`syncRegistry.ts:58-68,144-151` |
| C2 모바일 칭찬 영구 미집계                         | CRIT | praise 영구 이중기준 + 모바일 경로 tags 정합 + UT                                                           | §4-라, `StudentsPage.tsx:283`                                                                   |
| M1 불변식≠무손실 증명                              | MAJ  | 스냅샷 대조 단언 추가, 불변식은 보조                                                                        | §4-나                                                                                           |
| M2 MCP 읽기표면 회귀 Q2 내 출시                    | MAJ  | tags additive를 Q2-S6 본체로 격상 + AC#4 정직화(또는 명시 수용)                                             | §4-마                                                                                           |
| M3 중복키 false-negative                           | MAJ  | content 유무 분기 dedup + 음/양 IT                                                                          | §4-다                                                                                           |
| M4 Drive 병합 좀비                                 | MAJ  | 동률 병합 가드 + 병합 IT                                                                                    | §4-나                                                                                           |
| m1 toStudentRecord 빈문자→sentinel 행동변경+테스트 | MIN  | 정합화 + 기존 테스트 갱신                                                                                   | §4-가                                                                                           |
| m2 P4 엣지 처리 규칙 미정                          | MIN  | category 기준 verbatim 복사 규칙 확정                                                                       | §4-나                                                                                           |
| m3 메타테스트 allowlist                            | MIN  | 출결 리더 6종 allowlist 명시                                                                                | §4-라                                                                                           |
| OQ#1 주입점(toStudentRecord 미경유)                | OQ   | InputMode 어댑터→도메인 호출                                                                                | §4-가                                                                                           |

---

## 7. 단계 분해 (의존성, 데이터 안전 우선)

- **Q2-S0**: backupManager 백업 + RG/CT 골격 + migration-roundtrip 확장 + **subcategory 읽기/쓰기 직접참조 인벤토리** 산출.
- **Q2-S1**: 도메인(`synthesizeSubcategory` + sentinel 시드 + `MigrateStudentRecordsSubcatToTags` + praise 영구 이중기준) + UT/스냅샷 불변식.
- **Q2-S2**: 마이그레이션 배선(**load() 멱등 정규화 — 변경 시만 저장 + 변경 직전 자동 안전 백업** + Drive 병합 동률 가드) + IT roundtrip/병합/원자성.
- **Q2-S3**: 입력 UI(비출결 태그화 + **중복키 재설계**) + 편집 + 모바일 칭찬 tags 정합.
- **Q2-S4**: 표시/검색/내보내기 전수 스윕 + 정적 메타테스트(allowlist).
- **Q2-S5**: 태그 관리 화면(Settings CRUD + 카스케이드) + 카테고리 모달 정리.
- **Q2-S6 (확정 포함)**: MCP 읽기 표면 tags additive — 브릿지(별도 레포 `ssampin-ai-bridge`) 미러 엔티티 파서에 tags 파싱 추가 + `get_homeroom_notes` note view에 tags 포함. 본체+브릿지 2레포 동시 출시. (사용자 승인 2026-06-24.)

> 본 프로젝트 규칙: main 단일 워킹트리 순차. 부분커밋 `git commit -- <path>`. `useStudentRecordsStore.ts` 등 다중세션 공유 파일 신선도 확인 후 수정.

---

## 8. 수용 기준 (AC, 테스트 가능)

1. 비출결 입력이 `category + tags` 2축(subcategory 선택칩 없음), 저장 후 tags 영속 + subcategory=sentinel. (IT, UT)
2. 표시/검색/Excel/PDF/HWPX 비출결이 tags 렌더(subcategory 미노출), 출결 불변. (메타테스트, E2E)
3. 마이그레이션이 비출결 subcategory를 tags로 **무손실 복사**(스냅샷 대조), 출결·attendancePeriods·레코드수 불변, idempotent(재실행·Drive 병합 후에도). (roundtrip, 병합 IT, UT)
4. **MCP 쓰기 계약 무변경**(recordNote 멤버십·RECORD_NOTE_FIELDS·미러파서) + 합성 sentinel 멤버십 통과 + (S6 시) 읽기 표면 tags 보강. (CT)
5. praise 통계가 마이그레이션 전후 + 모바일 subcategory-only 형태 모두 정확. (UT)
6. 중복감지 false-dedup 없음(다른내용 2건 허용) + 빈메모 이중제출 차단. (IT)
7. 태그 관리 화면 CRUD + rename/delete 카스케이드. (E2E, IT)
8. 보조 불변식 `tags.includes(subcategory) || subcategory===SENTINEL` 항상 참. (UT)

---

## 9. ADR

- **Decision**: 담임 비출결 분류를 `category + tags` 2축으로 통일하되 `StudentRecord.subcategory`는 엔티티에 보존하고 "보이지 않는 MCP 계약 슬롯"으로 격하(S-A′). 마이그레이션은 무손실 복사(보존), settings 플래그로 1회 게이트. MCP 쓰기 계약 무변경 + 읽기 표면은 tags additive 보강.
- **Drivers**: ① 데이터 유실 0 ② MCP 오귀속 회피 ③ 교과와 동일 2축 경험.
- **Alternatives**: S-B(엔티티 제거, 2레포 스큐 위험 → 기각) / S-C(빈 subcategory, 읽기표면 형태변경 → 기각) / S-A(tags[0] 합성, drift·P3 역방향 → S-A′로 흡수) / schemaVersion 봉투(C1 드롭 → settings 플래그로 대체).
- **Why chosen**: 데이터 무손실 + MCP 쓰기 무변경 + 표시 tags화로 통일 체감 확보 + 검증된 인프라(S4 태그·migration-roundtrip·backupManager) 재사용. Architect/Critic 합의 흡수.
- **Consequences**: (+) 2축 통일, 데이터 안전, 출결·MCP 쓰기 무영향. (−) subcategory 그림자 잔존(계약 슬롯), 읽기표면 보강에 2레포 변경(S6), 전수 스윕 비용.
- **Follow-ups**: 담임+교과 공용 태그 관리(T-B), 물리 통합(Phase 4), subcategory 계약 슬롯 장기 폐지(브릿지 tags 보급 후).

---

## 10. 미해결 질문

### 사용자 확정 (2026-06-24)

1. **MCP 읽기 표면(M2)**: ✅ **Q2-S6 포함 확정** — 브릿지(별도 레포 `ssampin-ai-bridge`) 미러 파서 + `get_homeroom_notes`에 tags additive 추가를 Q2 범위로. 본체+브릿지 2레포 동시 출시. 읽기 품질 저하 없음.
2. **sentinel 값**: ✅ **카테고리별 중립 라벨 확정** — 카테고리마다 중립 라벨(예 counseling→'일반', life→'일반'), `etc`는 기존 '기타' 재사용. 각 기본 카테고리 subcategories[] 선두에 시드.

### 사용자 확정 — 남은 4결정 (2026-06-24)

3. **태그 delete 카스케이드**: ✅ **제거 + 확인** — 태그 관리에서 커스텀 태그 삭제 시, 그 태그를 가진 기존 기록 N건에서도 태그를 제거(삭제 전 "N건의 기록에서 이 태그가 사라집니다" 확인). 고아 태그 잔존 방지. _(사용자 체감 동작 — 뒤집기 가능: "기록은 그대로 두고 목록에서만 숨김"을 원하면 변경.)_
4. **카테고리 관리 모달 subcategory CRUD**: ✅ **접어 유지** — subcategory는 MCP 쓰기 계약(외부 AI가 `category.subcategories`에서 고름)을 지탱하므로 "고급(외부 AI 연결용)" 섹션으로 접어 유지. 일반 사용자는 태그 관리만 본다.
5. **빈메모 비출결 이중제출**: ✅ **dedup 유지** — 메모 없는 비출결 기록은 `(학생, 날짜, 카테고리)` 동일 시 이중 저장 차단(빠른탭 실수 방지). 내용이 다르면 2건 허용(false-dedup 없음). _(사용자 체감 동작 — 뒤집기 가능: "같은 카테고리도 여러 번 저장 허용"을 원하면 변경.)_
6. **태그 관리 공용화(T-B)**: ✅ **후속** — Q2는 담임 한정. 담임+교과 통합 태그 관리는 별도 PDCA 후보.

---

**상태: pending approval**

> 본 문서는 /ralplan consensus(Planner→Architect→Critic, deliberate)를 거쳤다. Architect=SOUND-WITH-CONCERNS(S-A′ 채택), Critic=ITERATE(CRITICAL 2 + MAJOR 4)를 코드 직접 검증으로 전부 해소(§6). **사용자 승인 후에만** 구현(Q2-S0→S6). 현재 코드 변경·커밋 없음.
