# 쌤핀 모바일 현장 도구 3종 계획 (mobile-field-tools) — ralplan 합의본

작성: 2026-07-03 · 상태: **승인 대기 (pending approval — 사용자 승인 후 /ralph 투입)**
합의 기록: Planner v1 → Architect REVISE(4건) → Planner v2 → Architect **APPROVE** → Critic **APPROVE** (CRITICAL/MAJOR 0건, MINOR 3건은 본 문서에 반영 완료)
실행 예정: `/ralph` 순차 루프, **실행 모델 Opus 4.8 단독** — 본 문서만으로 추가 질문 없이 수행 가능하도록 작성됨. **결정 분기 0개.**
근거 분석: `docs/03-analysis/mobile-feature-gap/` 3건. 모든 파일·라인 참조는 2026-07-03 실코드 대조 완료(Architect·Critic 이중 검증).

---

## 0. 트랙 구조

| 트랙                                    | 항목                                                                                           | 실행                  | 결정 분기   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------- | ----------- |
| **Track A (이번 실행)**                 | M1 배점 계산기(드롭인) · M2 모둠 편성기(모바일 포크) · M3 루브릭 채점 입력(신규 페이지+스토어) | `/ralph` 자율 실행    | 0개         |
| **Track B (후속 PDCA, 이번 투입 금지)** | 과제 제출 수동 체크(제품 결정 게이트) · 자리 뽑기(모바일 seating 쓰기 경로 선행)               | 제품/아키텍처 결정 후 | 게이트 존재 |

**조사로 확정된 사실 (계획의 골격):**

1. **과제 제출 체크는 전제 불일치.** 데스크톱 과제수합에 "교사 수동 토글"이 없다 — 학생 온라인 제출(Supabase Edge Function) → 교사 조회만. `Assignment`/`Submission`(`src/domain/entities/Assignment.ts`)에 수동 체크 필드 없음, `AssignmentSupabaseClient`에 수동 쓰기 메서드 없음(RLS로 직접 접근 차단). → PC에 대응 구조가 없어 Track B로 분리(§7).
2. **루브릭은 이식이 깔끔.** `rubrics`는 SYNC_REGISTRY #26(`src/usecases/sync/syncRegistry.ts:294-302`) 기등록 → **신규 등록 불필요.** 쓰기는 `ManageRubrics.upsertGrading`(`src/usecases/rubric/ManageRubrics.ts:67-81`) 단일 경로, `rubricRules` 순수 함수 6종(`createEmptyGrading`·`toggleMark`·`setAbsentStatus`·`setCriterionNote`·`setOverallFeedback`·`findGrading`) 실재.
3. **세 도구의 이식성은 균일하지 않다.** 데스크톱 DI 컨테이너는 모바일(브라우저)에서 LocalStorageAdapter로 떨어지고 모바일 실데이터는 IndexedDB(`@mobile/di`)에 있다 → 데스크톱 스토어를 읽는 도구는 모바일에서 **빈 명단**(번들은 안 깨짐 — `ElectronStorageAdapter`는 `window.electronAPI` 전역만 사용, ToolDice 선례).
   - 배점 계산기: 스토어·명단·electron 의존 0(`ToolScoreAllocator.tsx:1-27`), props `{onBack,isFullscreen}` 일치 → 무수정 드롭인.
   - 모둠 편성기: 데스크톱 스토어 3종 최상위 구독(`ToolGrouping.tsx:5-8`) → 모바일 포크로 순수 도메인만 재사용.
   - 자리 뽑기: seating **저장**(`ToolSeatPicker.tsx:485` saveSeating, `:511` updateClass) → 모바일 읽기전용 좌석 설계와 충돌 → Track B.

## 1. Principles

1. **PC = 원본, 모바일 = 교실용 뷰 + 경량 입력.** 편집·설계는 PC 유지. 모바일 쓰기는 순회 채점 같은 "현장 손이 가는" 것만.
2. **기존 검증된 패턴 복제, 새 추상화 금지.** 스토어는 `useMobileObservationStore` 골격 모사(load/reload 개별 작성, 팩토리화 금지 — mobile-refactor 보류 B-1).
3. **데이터 계층 재사용, UI만 신설.** 도메인 엔티티·유스케이스·리포지토리·Drive 동기화는 PC와 공유.
4. **자율 실행 결정론.** Track A는 열린 분기 0개. 결정이 필요한 것은 Track B로 격리.
5. **최소 침습 공존.** 다른 세션 미커밋 파일(`electron/`, `index.html`, `landing/`, `src/adapters/di/container.ts`, `src/domain/entities/Settings.ts`, `src/global.d.ts`)과 **공유 데스크톱 컴포넌트(`ToolGrouping.tsx` 등)를 수정하지 않는다.** 모바일 DI(`src/mobile/di/container.ts`)는 별개라 안전.

## 2. Decision Drivers

1. **데이터 모델 호환성** — 쓰기 도메인이 PC와 같은 파일/엔티티로 Drive 왕복 가능한가 (루브릭 ○ / 과제 수동체크 ✗ → Track B).
2. **모바일 저장 백엔드 정합** — IndexedDB(실데이터)를 읽는가, 데스크톱 컨테이너의 localStorage(빈 데이터)를 읽는가.
3. **자율 실행 결정론 vs 침습 비용** — 공유 파일 수정 없이 모바일 파일만 추가해 열린 분기 없이 실행 가능한가.

## 3. 확정 옵션과 기각 대안

- **A1 확정** (도구 = 배점 계산기 + 모둠 편성기, 자리 뽑기 제외). A2(3종 일괄) 기각 — 자리 뽑기는 빈 명단 + localStorage 누수 + 읽기전용 좌석 설계 충돌.
- **B1 확정** (루브릭 = 모바일 전용 신규 페이지). B2(PC 컴포넌트 lazy 재사용) 기각 — 데스크톱 스토어라 빈 데이터 + 편집 UI 혼재 + 넓은 레이아웃 전제.
- **M2-b 확정** (모둠 = 모바일 포크). M2-a(공유 컴포넌트 prop 주입) 기각 — 세 스토어 최상위 구독 + DataSource 토글 + ClassRosterSelector 등으로 실제로는 침습적 이중모드화가 됨. "적은 코드 ≠ 적은 아키텍처 위험."
- **C3 확정** (과제 체크 = 이번 범위 descope → Track B). C1(신규 로컬 도메인) 스펙은 §7에 보존, C2(Edge Function) 기각 — 서버 작업·패턴 밖·범위 과도.

---

## 4. Track A 계획 본문

> **공통 게이트(각 M 완료 시):** `npx tsc --noEmit`(에러 0) + 해당 vitest. **최종(Track A 전체 후):** `npm run lint` → `npx vitest run` → `npm run regression-check`. 빌드·Playwright·실기기는 게이트 아님.
> **완료 오검증 방지:** 모바일 도구는 사전 Drive 동기화된 명단·평가지를 전제한다. tsc/vitest로는 "명단 표시"를 검증할 수 없으므로, 실데이터 표시 확인은 **사용자 수동(동기화 계정 필요)** — ralph는 tsc/vitest 통과를 "동작 검증됨"으로 참칭하지 않는다.
> **환경 함정:** dev 서버는 electron:dev 하나만(vite 2개 동시 금지), 무한로딩 시 `node_modules/.vite` 삭제. sp-\* 토큰은 Tailwind 알파 수식(`bg-sp-accent/40`) 무효 — black/white 알파·opacity 유틸만. UI 작업은 frontend-design(designer) 에이전트 협업 필수.

### M1 — 배점 계산기 이식 (소형·무위험, 최우선)

**목표:** `ToolScoreAllocator`를 모바일 쌤도구에 무수정 드롭인. 명단·동기화 무관.

**수정 파일 (모두 모바일 전용):**

- `src/mobile/App.tsx`
  - lazy 정의 추가(`ToolQRCode` lazy `:49-51` 바로 아래): `const ToolScoreAllocator = React.lazy(() => import('@adapters/components/Tools/ToolScoreAllocator').then((m) => ({ default: m.ToolScoreAllocator })));`
  - `MORE_LAZY_TOOLS`(`:64-77`)에 `'tool-score-allocator': ToolScoreAllocator,` 추가.
  - `moreSub` 상태 유니언(`:134-150`)에 `| 'tool-score-allocator'` 추가.
- `src/mobile/pages/ToolsOverviewPage.tsx`: **`CLASSROOM_TOOLS` 배열(`:1-11`)에 항목 추가** — `{ id: 'tool-score-allocator', emoji: '🧮', name: '배점 계산기', desc: '지필 문항 배점 설계' }`.

**검증:** `npx tsc --noEmit`. ⚠️ 정확한 안전 속성(Critic MINOR-2 정정): `MORE_LAZY_TOOLS`는 `Record<string, …>`이고 `onNavigate`가 캐스트하므로 **유니언 누락을 tsc가 잡지 못한다** — 유니언 추가는 규약상 필수 단계로 반드시 수행(tsc 자기방어는 M2/M3의 직접 분기에서만 성립). dev 렌더/입력/localStorage 초안 확인은 사용자 수동.
**완료 정의:** 기존 키 불변, 신규 키 `tool-score-allocator`만 추가. tsc 0.

### M2 — 모둠 편성기 이식 (모바일 포크)

**목표:** 순수 도메인 `groupingRules`만 재사용하고 모바일 명단으로 UI를 신규 작성. **공유 `ToolGrouping.tsx`는 수정하지 않는다.**

**신설·수정 파일:**

- 신규 `src/mobile/pages/ToolGroupingPage.tsx` — props `{ onBack: () => void }` (직접 페이지, `ToolAssignmentPage` 동형)
  - 재사용(순수 도메인, `ToolGrouping.tsx:11-26`에서 import 목록 확인됨): `@domain/rules/groupingRules`의 `assignGroups`, `calcGroupCount`, `validateConstraints`, `assignRolesToGroup` 및 타입 `GroupingMember`/`GroupResult`/`GroupingMethod`/`GroupingConstraints` 등.
  - 명단: `useMobileStudentStore`(담임)·`useMobileTeachingClassStore`(수업반+students). 진입 시 각 `load()` 호출. 데이터소스 = [우리 반 | 수업반] 세그먼트(모바일 `SegmentedControl` 재사용). "다른 반(classRoster)"은 미제공(데스크톱 전용 store). 명단 0명 시 안내 UI.
  - **1차 UI 범위(확정 — Critic MINOR-3 반영):** 인원/모둠 수 스테퍼, 편성 방법(무작위·번호순·가나다), 결과 카드, 다시 편성, 결과 복사(클립보드)까지만. **고급 옵션(성별/수준 균등·역할 배정·희망친구 제약)과 Excel/HWPX 내보내기는 1차 범위 제외** — designer와의 확장은 후속.
  - designer 협업으로 레이아웃·토큰 확정(sp-\* 규약).
- `src/mobile/App.tsx`: `moreSub` 유니언에 `| 'tool-grouping'` + `renderMoreSub`(`:350`)에 `tool-assignment`(`:360-361`) 동형 분기 `if (moreSub === 'tool-grouping') return <ToolGroupingPage onBack={() => setMoreSub('tools')} />;` (import 추가). 직접 분기가 `MORE_LAZY_TOOLS` 폴백(`:363`)보다 먼저 검사되므로 CLASSROOM_TOOLS 타일과 충돌 없음(검증됨).
- `src/mobile/pages/ToolsOverviewPage.tsx`: **`CLASSROOM_TOOLS` 배열에 항목 추가** — `{ id: 'tool-grouping', emoji: '👥', name: '모둠 편성기', desc: '조건별 모둠 구성' }`.

**검증:** `npx tsc --noEmit`(직접 분기라 유니언 누락 시 tsc 에러로 자기방어 성립). `groupingRules` 도메인은 PC 기존 테스트 커버(중복 작성 금지). 명단 표시·편성 실행은 사용자 수동.
**완료 정의:** 담임/수업반 명단으로 편성 실행. 공유 PC 컴포넌트 미수정(PC 위험 0). 신규 키 `tool-grouping`만 추가. tsc 0.

### M3 — 수행평가 루브릭 채점 입력 (대형·최고가치)

**목표:** PC에서 만든 평가지에 폰으로 학생별 기준 점수만 입력. 평가지 설계·수정·출력은 PC 유지(모바일 미구현이 설계 의도).

**수정·신설 파일 (모두 모바일 전용, 공유 파일 미수정):**

1. `src/mobile/di/container.ts`
   - import: `import type { IRubricRepository } from '@domain/repositories/IRubricRepository';` + `import { JsonRubricRepository } from '@adapters/repositories/JsonRubricRepository';`
   - 등록: `export const rubricRepository: IRubricRepository = new JsonRubricRepository(storage);`
2. 신규 `src/mobile/stores/useMobileRubricStore.ts` — 골격은 `useMobileObservationStore` 복제:
   - `const manageRubrics = new ManageRubrics(rubricRepository);` (`@usecases/rubric/ManageRubrics`)
   - state: `rubrics`, `gradings`, `loaded`; `load`/`reload` — `manageRubrics.load()`는 `RubricsData | null` 반환이므로 **null 방어 필수**(observation의 `getAll()`과 달리 nullable).
   - 조회: `rubricsForClass(classId)`, `gradingFor(rubricId, studentId)`(도메인 `findGrading` 재사용).
   - 쓰기: `toggleMark`/`setAbsent`/`setCriterionNote`/`setOverallFeedback` → `manageRubrics.upsertGrading(currentData, grading)` → set → `useMobileDriveSyncStore.getState().triggerSaveSync()`.
   - **⚠️ 시그니처+본문 미러 기준 = PC `src/adapters/stores/useRubricStore.ts:144-199` (Critic MINOR-1, 필수 준수):** 각 메서드는 `(rubricId, classId, studentId, …)`로 **`classId`를 받고**(createEmptyGrading에 필요), 순수 함수 호출 **외의 스토어 레벨 가드까지 그대로 미러**할 것 — `toggleMark`의 결시생 차단 가드(`if (grading.status === 'absent') return`, `:152`)와 `rubrics.find(...) === undefined` 가드, `setAbsent`의 undefined 가드. 순수 함수만 감싸면 결시생에게 마크가 붙는 등 PC와 조용한 행동 분기가 생긴다.
   - 평가지 create/update/delete/copy는 **미구현**(PC 전용).
3. `src/mobile/stores/useMobileDriveSyncStore.ts` `reloadAllStores` — **하드코딩 목록 두 곳 모두** 등재(SYNC_REGISTRY와 독립): 구조분해 import 블록(`:32-62`) + Promise.all reload(`:64-79`).
4. 신규 UI `src/mobile/pages/ToolRubricPage.tsx`
   - 흐름: 수업반 선택(`useMobileTeachingClassStore.classes`) → 평가지 목록(`rubricsForClass`) → 학생 목록 → 학생 탭 시 바텀시트에서 기준(criterion)별 수준(level) 선택 + 결시 토글 + (선택) 기준 메모/총평.
   - **`studentId`는 반드시 `studentKey(tcStudent)`(`@domain/entities/TeachingClass:22`)** — PC가 실제로 이 키를 사용함이 검증됨(`RubricGradingView.tsx:12,66`). 다른 키를 쓰면 폰 채점이 PC와 다른 학생에 붙는다.
   - 기존 모바일 컴포넌트 재사용: `SegmentedControl`, 바텀시트, 명단 리스트. designer 협업 필수.
5. `src/mobile/App.tsx`: `moreSub` 유니언에 `| 'tool-rubric'` + `renderMoreSub`에 직접 분기(M2와 동형).
6. `src/mobile/pages/ToolsOverviewPage.tsx`: **관리 도구 섹션(`:47-85`)에 하드코딩 버튼 추가**(과제/설문 버튼과 동형: `onClick={() => onNavigate('tool-rubric')}`, `material-symbols-outlined` 아이콘 `grading`, 제목 "수행평가 채점", 부제 "평가지 점수 입력"). **⚠️ CLASSROOM_TOOLS 배열에 넣지 말 것 — 스타일 불일치.**

**동기화:** `rubrics`는 SYNC_REGISTRY #26에 기존재 — **syncRegistry 수정 금지**, 그대로 왕복됨.
**검증:** `npx tsc --noEmit`; 신규 vitest `src/mobile/stores/__tests__/useMobileRubricStore.test.ts` — load 매핑(null 포함), toggleMark→gradings upsert, **결시생 가드(absent 상태에서 toggleMark 무시)**, setAbsent, triggerSaveSync 호출(spy). 도메인 `rubricRules`는 PC 기존 테스트 커버(중복 금지). PC 평가지 표시·입력 왕복은 사용자 수동.
**완료 정의:** 평가지 조회 + 기준별 점수 입력 저장 + Drive 트리거 + PC와 studentId/marks/가드 행동 정합. 신규 키 `tool-rubric`만 추가. tsc 0 + 신규 vitest 통과.

---

## 5. 위험과 완화

| 위험                           | 영향                                      | 완화                                                                     |
| ------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------ |
| 모바일 명단 빈 상태(M2)        | "동작하는데 데이터 없음" 오인             | 명단 백엔드를 IndexedDB(모바일 스토어)로 직접 사용, 0명 시 안내 UI       |
| studentId 키 불일치(M3)        | 폰 채점이 다른 학생에 붙음                | `studentKey` 강제(PC 사용 검증됨) + 테스트                               |
| 스토어 가드 누락(M3)           | 결시생 채점 허용 등 PC와 조용한 행동 분기 | useRubricStore `:144-199` 본문 미러 + 결시 가드 vitest                   |
| 동시 편집 충돌(파일 단위)      | PC·폰 동시 수정 시 한쪽 업로드 스킵       | 사용 안내("채점 중엔 폰으로만") — SyncToCloud 특성상 실위험 낮음, 문서화 |
| reloadAllStores 한 곳 누락(M3) | 다운로드 후 루브릭 미갱신                 | 두 곳(`:32-62`/`:64-79`) 체크리스트                                      |
| ToolsOverviewPage 배치 오류    | 스타일 불일치                             | 규약: M1·M2=CLASSROOM_TOOLS 배열, M3=관리도구 버튼                       |
| 다른 세션 미커밋 파일 충돌     | 병합 충돌                                 | 모바일 파일만 수정, 공유 컴포넌트·데스크톱 DI·electron 등 미수정         |
| vite 이중 서버 교착            | 무한 로딩                                 | electron:dev 하나만, `.vite` 삭제 예방                                   |
| sp-\* 알파 수식                | UI 색 조용히 투명                         | black/white 알파·opacity 유틸만                                          |
| ralph 완료 오검증              | tsc/vitest ≠ 실데이터 표시                | 완료 정의에 "표시 확인=사용자 수동" 명시                                 |

## 6. 테스트 계획

- **신규 vitest:** `useMobileRubricStore.test.ts`(M3 — load/null, toggleMark upsert, 결시 가드, setAbsent, triggerSaveSync spy). M2는 도메인 기존 테스트 커버로 스토어 신규 없음(렌더 스모크 선택).
- **회귀:** `npm run regression-check`(grep 기반 — 파일 추가로 안 깨짐). 공유 컴포넌트 미수정이라 PC 회귀 위험 낮음.
- **최종 게이트:** `npx tsc --noEmit` → `npm run lint` → `npx vitest run` → `npm run regression-check` (4개 스크립트 실재 확인됨).
- **비게이트(사용자 수동):** 실기기 렌더/터치, 동기화 계정으로 명단·평가지 표시, 채점 PC 왕복, 클립보드 복사.

## 7. Track B (후속 별도 PDCA — 이번 ralph 투입 금지)

### B-① 과제 제출 수동 체크 (제품 결정 게이트)

- **기본 = descope.** "온라인 제출 ≠ 수동 체크" 개념 분기와 PC 패리티 부재는 제품 결정 사안.
- **강행 시(C1) 확정 스펙 보존:** 신규 `assignment-checks.json`(`{ checks: { assignmentId; studentNumber; checked; checkedAt }[] }`) + `JsonAssignmentCheckRepository(storage)` + `useMobileAssignmentCheckStore` + `reloadAllStores` 두 곳. **공유 `syncRegistry.ts` 등록은 반드시 `subscribeExcluded: true` + `reload: async () => {}`(no-op)** — 데스크톱 스토어가 없어 일반 도메인으로 넣으면 `SyncSubscribers.test.ts` **(b)**(STORE_SUBSCRIBE_MAP 등재 강제)가 즉시 실패, `subscribeExcluded`면 (b) 스킵·(e)는 no-op으로 통과. 교차기기 안전 근거: `SyncToCloud.execute`(`SyncToCloud.ts:90-95`)는 로컬 파일 없으면 업로드 스킵 + 매니페스트 remote+local 병합 → 데스크톱이 이 파일을 몰라도 리모트를 삭제하지 않음(검증됨). UI에 "온라인 제출과 별개의 수동 체크이며 현재 PC에는 표시되지 않습니다" 문구 필수.
- C2(Supabase Edge Function 신설) 기각 — 서버 작업·온라인 전용·패턴 밖.

### B-② 자리 뽑기 모바일 이식

- 선행: 모바일 seating 쓰기 경로 신설(읽기전용 설계 변경) — 대형 아키텍처 결정. 데스크톱 컴포넌트는 `saveSeating`(`:485`)·`updateClass`(`:511`)로 저장하므로 그대로 얹으면 localStorage로 새거나 설계 충돌.

## 8. ADR

- **Decision:** Track A로 모바일에 배점 계산기(무수정 드롭인)·모둠 편성기(모바일 포크, 순수 groupingRules 재사용)·루브릭 채점 입력(신규 페이지+모바일 스토어, PC useRubricStore 본문 미러)을 /ralph 자율 실행으로 추가. 과제 수동 체크·자리 뽑기는 Track B로 분리.
- **Drivers:** 데이터 모델 호환성 / 저장 백엔드 정합 / 자율 실행 결정론 대 침습 비용.
- **Alternatives considered:** 도구 3종 일괄(A2), PC 루브릭 컴포넌트 재사용(B2), 모둠 prop 주입(M2-a), 과제 Supabase 경로(C2), 과제 즉시 구현(C1→게이트 이연) — 각 실코드 근거로 기각.
- **Consequences:** 모바일 파일 위주 추가 + 공유 컴포넌트 미수정으로 위험 국소·PC 회귀 0. Track A 결정 분기 0으로 자율 실행 결정론 확보. 과제 PC 패리티·자리뽑기 seating 쓰기는 정직하게 후속 격리.
- **Follow-ups:** Track B ①(제품 결정 후), B-②(seating 쓰기 경로), 모둠 고급 옵션·내보내기 designer 확장, 루브릭 평가지 모바일 편집(비권장).
