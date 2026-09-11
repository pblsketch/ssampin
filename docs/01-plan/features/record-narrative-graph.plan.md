# 생기부 서사 그래프 (record-narrative-graph) — 계획서

- 상태: **P0~P5b 구현 완료(2026-09-10) · 게이트 4종 초록 · 미커밋 · v2.5.2 로 일괄 출시 예정.** 결정 정본은
  [ADR-103](../../03-decisions/ADR-103.md), 세션 기록은 [docs/progress/2026-09.md](../../progress/2026-09.md).
  잔여: 하네스 20건 두 빌드 비교 · 실기기 · 실렌더 · 커밋.
- 원래 상태(계획 확정 시점): 오너 답변 7건 반영(2026-09-10), 소스 변경 0줄. ralplan 합의 v5 확정본. 4회차에서 Architect "APPROVE-READY(조건부)" · Critic "APPROVE(조건부)" — 조건은 전부 문장 수준이라 이 판에 반영했다(구조 변경 없음). 오너 승인 전에는 소스 변경 없음.
- 대화에서 확정된 오너 결정 7건이 전제다(§1).
- 선행: ADR-083 · ADR-085 · ADR-086 · ADR-093 · ADR-099 · 분석 정본 `docs/03-analysis/record-draft-flow-v2-inquiry-thread.analysis.md` §5 · 설계 `docs/02-design/features/record-evidence-board-v2.design.md` · `record-draft-template-library.design.md`

## 0. 한 줄

근거 정리의 기본 보기를 **흐름 그래프**(레인형 스토리보드)로 바꾼다. 주제(줄기) 위에 장면(4틀 + 세부 카테고리)을 놓고, 장면마다 근거 여러 개와 교사 메모를 담고, 주제끼리 화살표로 이어 이음말을 적는다. 장면 배열이 **작성 구성을 생성**한다(기존 요청서 계약·판본 문지기·회귀 검사는 형제 함수로 그대로 산다). 작성 방식 고르개 네 축은 화면에서 사라지고 **폴백은 기본값으로 고정**된다. 보드는 같은 자료의 두 번째 보기다.

## 1. 오너 결정 (2026-09-10 대화, 그대로 지킨다)

| #   | 결정                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------- |
| D1  | 보드와 흐름 그래프는 **단계가 아니라 보기 모드**다. 기본 = 흐름 보기, 보드 보기로 전환 가능.                        |
| D2  | 주제 사이에 **연결 고리**가 있을 수 있다. 연결은 선·화살표이며 **교사가 이음말을 자유롭게 적는다**(칩은 지름길).    |
| D3  | 장면(동기·과정·결과·평가) **하나에 근거 여러 개**가 들어간다.                                                       |
| D4  | 메모는 연결 고리뿐 아니라 **근거 하나하나에도** 달 수 있다. 근거 메모는 카드에 붙여 카드를 따라간다.                |
| D5  | 템플릿 7종의 요소들을 **동기·과정·결과·평가 틀 안의 세부 카테고리**로 재배치한다. 구조는 단순하게, 자유도는 충분히. |
| D6  | 작성 방식 고르개의 네 축은 **화면에서 없앤다.** 장면 배열이 유일한 설정. 기존 초점 7종 = [뼈대 고르기].             |
| D7  | 행동특성(행특)은 **별도 생활 틀**을 둔다(칸은 넷으로 맞춘다).                                                       |

## 2. RALPLAN-DR 요약

### 원칙

1. **장면은 문단의 지시다.** 초안 문단의 표식 배열은 장면 역할 배열의 **부분수열**(건너뜀 허용, 뒤바뀜 실패 — `RecordWritingStyle.ts:58-59`).
2. **없으면 기준선과 같다.** 구성 관문·근거 관문(§4)이 모두 꺼진 주제의 요청서는 P0 기준선 `base/` 픽스처와 글자 하나까지 같다. 폴백 작성 방식은 **기본값으로 고정**되므로(§4-5) 이 문장에 "저장된 style 이 기본값일 때만"이라는 단서가 없다. 판정은 **저장된** 장면 배열로 한다.
3. **소유의 정본은 근거 파일, 배치의 정본은 주제 파일. 쓰기는 근거 먼저, 장면 나중.** 두 파일을 한 트랜잭션으로 못 묶으므로 창을 보상으로 메우지 않고 **순서로 없앤다**(§3-1). 읽기는 `scenesOf` 한 곳이 가린다. `threadId` 를 바꾸는 근거 경로 **7개**가 저장 뒤 `detachFromScenes` 를 부른다. 잠금은 중첩 시 주제→근거만, 순차 획득은 자유(`moveToNewThread` 선례 `useRecordEvidenceStore.ts:594-632`).
4. **장면은 작성 방식을 생성한다.** `resolveCompositionFromScenes → ResolvedComposition | null`. `buildStyleInstruction`·#80 의도·카탈로그 모듈 `role` 무변경. 화면 요약·범례·요청서는 **같은 `resolved` 하나**에서 나온다(`recordStyleCompose.ts:30`).
5. **AI 는 제안만.** 적용 전 저장 0회, 구독 AI 전용, 실명 가림, 제외 근거 제외.
6. **점수판 없음.**

### 결정 동인

1. 품질을 가른 것은 근거의 정렬(ADR-083). 지금은 파일 저장 순서(`RecordDraftAiPanel.tsx:390-396`, `recordDraftPack.ts:180`).
2. 고르개 네 축의 조합 부담·충돌.
3. 서사를 설계·시각화하는 자리 부재.

### 대안

| 안                        | 장점                                                                          | 단점                                                              | 판정                              |
| ------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------- |
| A. **레인형 스토리보드**  | 새 라이브러리 0(`@dnd-kit` `package.json:60-62`) · 장면=문단 지시 · 세로 접힘 | 자유 배치 없음 · 줄기 폭 · 학생당 배열 노동 · 폴백 경로 유지 비용 | **채택**(오너 동의)               |
| B. 자유 노드·선 캔버스    | 임의 연결                                                                     | 신규 의존성·자동 배치·동기화 충돌 표면                            | 기각                              |
| C. P0 + 보드 열 안 정렬만 | 신규 파일 0 · 측정된 이득 전부                                                | D2·D3·D5·D6 미충족                                                | 기각(요구 미충족), **P0 로 흡수** |

### 안티테제와 긴장, 합성

- **안티테제**: 측정된 이득은 정렬이고 P0 가 전부 준다. 손 배열이 "날짜순 + 뼈대"보다 낫다는 측정은 없다. 또 폴백 입력을 보존하면 **보이지 않는 설정이 결과를 가르고** 교사가 진단할 수 없다.
- **인정하는 것**: P0 를 첫 단계로 두고 `base/` 기준선을 세운다. ★**오너 결정(2026-09-10 §13-4)**: P0 만 먼저 내지 않고 **P0~P5 를 전부 마친 뒤 v2.5.2 로 한꺼번에** 낸다 — 그래서 v4 의 "P3 착수 관문(2주·예/아니오)"은 **폐기**한다. 대신 P2 하네스 20건에 "P0 정렬만 적용한 빌드 vs 장면 배열 적용" **전후 비교**를 넣어 손 배열의 효과를 같은 릴리즈 안에서 기록한다. 보이지 않는 설정은 없앤다 — 폴백은 기본값 고정, 저장된 작성 방식은 P3 변환에서 **한 번만** 읽는다(§4-5).
- **긴장**: 자유도(자유 글) ↔ 되짚기. 판은 발자국이라 자유 글이 필요 없다(주제 파일도 동기화되므로 동기화는 이유가 아니다). 판에는 카탈로그 id·장면 역할·id 만.
- **합성**: 근거 먼저 쓰기(보상 삭제) + 관문 둘(근거 관문이 구성 관문을 켠다) + 자리표 분리 + 폴백 기본값 고정.

### 프리모템 (5)

1. 요청서 충돌(표식·1층 판본) → `applyCompositionVersionGate` + `followComposition` + #79-b.
2. 유령 장면 → 근거 먼저 쓰기 + `scenesOf` 가림 + 7경로 `detachFromScenes` + 장면 쓰기 prune(술어 좁힘).
3. 빈 캔버스 → 단추 둘 + 보기 기억.
4. 기본 뼈대만 깔았는데 요청서가 바뀜 → 관문 둘 + `scaffold-only` 픽스처.
5. 큐가 남의 장면·옛 장면을 실음 → `phase` 상태에 전원 스냅샷 + 확인 화면 + [이어 하기] 테스트.

## 3. 데이터 모델 (additive, 전부 선택 필드)

### 3-1. 주제 `InquiryThread` (`src/domain/entities/InquiryThread.ts`)

```ts
export interface NarrativeScene {
  readonly id: string;
  readonly role: NarrativeRole; // 형광펜 4색과 같은 저장값
  readonly moduleId?: RecordModuleId;
  readonly label?: string;
  readonly note?: string; // ≤200자, 요청서에 실림(가림·대체 통과)
  readonly noteSource?: 'ai' | 'teacher'; // AI 서사 초안 [적용]으로 들어온 메모는 'ai'. 교사가 고치면 'teacher'
  readonly evidenceIds: readonly string[];
}
export interface NarrativeLink {
  readonly fromThreadId: string;
  readonly note?: string;
}
export interface InquiryThread {
  /* …기존… */ readonly scenes?: readonly NarrativeScene[];
  readonly link?: NarrativeLink;
}
```

- 파일 헤더 불가침 2줄(`InquiryThread.ts:16-17` "AI 가 흐름을 자동 생성하지 않는다" · "담임 행특에는 쓰지 않는다")은 **P1 에서** "제안은 한다(적용은 교사)" · "생활 틀로 쓴다"로 개정한다(P5b 가 아니라 P1 — 불가침이 깨지는 단계에서).

**읽기 정본 `domain/rules/narrativeScenes.ts`** (순수, P1)

- `scenesOf(thread, evidences)` — (a) `evidence.threadId === thread.id` 인 id 만 (b) 중복은 첫 등장만 (c) 평가 장면 0개면 맨 앞에 가상 평가 장면(저장 안 함), 2개 이상이면 첫 것만 (d) `unplaced[]` = 주제 소속인데 장면에 없는 근거, date↑·무날짜 뒤·createdAt→id.
- `placedCount(saved, evidences)` — 저장된 장면에 실제 소유 근거가 몇 건 배치돼 있나(관문 판정용).
- `isDefaultScenes(saved, { chained })` — 저장 배열 = 기본 뼈대(`legacyInquiry`, 평가 맨 앞) · 메모 0 · 라벨 0 · `!chained`. **`saved` 가 `undefined` 이거나 빈 배열이면 true**(부재 = 기본 뼈대 = 기준선 — 기존 사용자 주제 전부가 이 경우다).
- **장면 상한 20**(초과 시 `[+ 장면]` 비활성·안내). 「작성 구성」 블록 = 장면당 최대 4줄 + 메모 200자로 상한이 계산 가능하다(32,767 총량 대응).
- `chainOf(threads, startId)` — 방문 집합으로 고리 종료. [이어진 흐름 전체] 범위 = 루트→start 조상 + start 후손(갈리면 start 까지). 상한 3 은 루트부터, 넘치면 먼 쪽부터 떨어뜨리고 고지.
- `sceneMarkOf(scene)` = `NARRATIVE_ROLE_MARKS[scene.role]`(`narrativeParagraphs.ts:43-48`). 요청서 표식은 언제나 4종, 틀 라벨은 화면 전용(`MARK_WORDS` `:69-84` 외 낱말 금지 테스트 #90).

**쓰기 — 근거 먼저, 장면 나중 (`useInquiryThreadStore` + `useRecordEvidenceStore`, P1)**

- `placeInScene({ threadId, sceneId, evidenceIds, index? })`:
  ① **소유 정합(근거 락)**: 미분류면 `setThread`, 남의 줄기면 `moveToThread`(다른 줄기로 끌기가 이 경로). 이미 이 주제면 건너뜀. 이 두 근거 경로가 저장 뒤 이전 주제에 `detachFromScenes` 를 부른다(아래 7경로 규칙) — 별도 detach 단계 없음.
  ② **장면 삽입(주제 락, 한 번의 `write`)**: 다른 장면에서 제거 후 `sceneId` 의 `index` 에 삽입 → prune → 저장.
  ①이 실패하면 ② 안 함(카드 그대로). ②가 실패하면 카드는 **목표 주제의 "아직 안 놓음"** 에 있다 — 파괴적이지 않고 화면에 보인다. **보상 경로 없음, `rolledBack` 없음.** 결과 `{ placedIds, skippedIds }`.
- `placeMany(threadId, [{sceneId, evidenceIds}])` — 배치 진입점. **원칙 3 을 그대로 상속한다**: 미분류·남의 근거가 섞이면 각 id 에 ①(`setThread`/`moveToThread`)을 근거 파일에 **먼저** 끝낸 뒤(근거 저장 1회) 장면을 한 번에 쓴다(주제 저장 1회). 소유를 못 얻은 id 는 `skippedIds` 로 돌려주고 장면에 넣지 않는다. [적용]·`applyScaffold` 뒤 일괄 배치가 쓴다.
- `reorderScene`·`moveBetweenScenes`·`addScene`·`removeScene`(근거는 unplaced)·`setSceneNote`·`setSceneCategory`·`setLink`(고리 = `chainOf`)·`applyScaffold`·`detachFromScenes(threadId, ids)`.
- **prune**: 장면을 건드리는 쓰기(`placeInScene`·`placeMany`·`applyScaffold`·`moveBetweenScenes`·`removeScene`)에서만. 술어 = "근거 파일에 없는 id **또는 다른 주제 소유**". 미분류 id 는 정상 경로에서 장면에 들어올 수 없으므로(①이 먼저) 만나면 유령으로 보고 함께 잘라 낸다. 근거 읽기는 `withFileLock(SYNC_FILE_KEYS.recordEvidence, …)`(주제→근거 순서, `removeIfUnused` `useInquiryThreadStore.ts:232-238` 과 같은 방식). **읽기 실패 시 prune 을 건너뛰고 주제 쓰기는 성공시킨다**(`console.error`). 이를 위해 `useInquiryThreadStore.write`(`:111-125`, 지금은 동기 transform)를 **`Promise` 도 받는 형태로 넓힌다**(`useRecordEvidenceStore.ts:372-388` 와 같은 꼴). `add`·`update`·`remove` 는 근거를 읽지 않는다.
- **근거 스토어 7개 경로** — `setThread`(:182) · `moveToThread`(:187) · `moveToNewThread`(:194) · `unclassify`(:202) · **`ensureEvidenceFromSource`(재사용 시 주제 교체 :727-736)** · `remove`(:232) · `restoreRemoved`(:244) — 는 저장 성공 뒤 **바뀌기 전 threadId**(변환 안 지역 변수로 포착, 공개 결과 타입 불변)로 `detachFromScenes` 를 근거 락 밖에서 부른다. `restoreRemoved` 는 "아직 안 놓음"으로만. 실패는 관용.
- 검사(P1): A→B 끌기 후 B 소유·B 장면 1건·A 장면 0건 · 미분류→장면 후 threadId 있음 · ② 실패 시 목표 unplaced · `placeMany` 에 미분류 id 섞임 → 근거 저장 1회 + 주제 저장 1회, 소유 실패 id 는 `skippedIds` · 역순 중첩 락 0 · 3단 고리 종료 · `unclassify` 후 장면 0건 · `unclassify`→`setThread` 왕복 후 unplaced · `ensureEvidenceFromSource` A→B 후 A 장면 0건·다시 A 로 가면 unplaced · 주제 `remove` 후 자식 link 끊김 독립 줄기 · `normalizeScaffold` 평가 0/2 → 1 · 근거 읽기가 던져도 `update()` 성공 · 구버전 파일(`scenes` 부재) 읽기 ≠ 삭제.
- ~~P1 전 확인 1건~~ **확인 완료(2026-09-10)**: 학년도 전환은 두 파일을 **같은 조작**으로 내린다
  (`ExecuteYearTransition.ts:123-125` 에서 `record-evidence`·`inquiry-threads` 가 나란히 초기화 목록에 있고,
  `archiveScope.ts:35-36` 도 같은 축). 시차가 없으므로 전환 뒤 prune 1회는 필요 없다.

### 3-2. 근거 `RecordEvidence`

```ts
readonly note?: string; // 교사 메모 ≤200자. 카드를 따라간다. 요청서에 실린다. 원본 기록엔 안 쓴다
```

- `buildEvidence`(`useRecordEvidenceStore.ts:281-300`)가 `note` 를 받는다. `setNote(id, note)`. 재사용 경로는 이미 보존. 원본 본문이 바뀌면 기존 "원본과 내용이 달라요" 신호 옆에 "메모는 이전 본문 기준"(새 필드 없음).

### 3-3. 설정 `Settings`

```ts
readonly recordEvidenceViewMode?: 'flow' | 'board'; // 소비처 P3, 기본 'flow' 는 P3 에서
readonly recordScaffolds?: readonly RecordScaffold[];
```

- `recordWritingStyles`·`recordStylePresets`(`Settings.ts:735, 740`)는 **P3 변환에서 한 번 읽고** 그 뒤 요청서 입력으로 쓰지 않는다(§4-5). 값은 지우지 않는다(되돌리기).

### 3-4. 초안 `RecordDraft.threadId?` — 병합은 있다(`useRecordDraftsStore.ts:71, 258-264`). 호출부 2곳 + 브릿지 write 만 P0.

### 3-5. 틀 자리표 (`narrativeFrames.ts` 신설; `recordStyleCatalog.ts` 모듈 `role` 무변경)

| 틀                | 자리 1 (motive)                                                                                         | 자리 2 (process)                                                                                                                                                                                                      | 자리 3 (result)                                                                                                                                                                          | 자리 4 (evaluation) |
| ----------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 탐구 틀 `inquiry` | **동기**: 동기·질문 · 수업 맥락 · 쟁점·해석 문제 · 첫 수행의 특징 · 목적·조건 · 공동 과제 · 확인된 관심 | **과정**: 탐구 과정 · 사용한 개념 · 비교 기준 · 사용한 근거 · 반론 검토·관점 변화 · 받은 의견·자기 점검 · 학생이 고른 수정 · 선택한 전략·표현 · 제작·실행 · 검토·개선 · 개인의 행동 · 의견 교환·조정·지원 · 탐색 경험 | **결과**: 결과·적용 · 적용 범위·한계 · 한계·추가 검토 · 타당성 판단 · 자신의 결론 · 달라진 수행 · 산출물의 특징 · 공동 작업에 대한 기여 · 알게 된 조건·특성 · 선택 또는 재고 · 다음 탐색 | **평가**: 교사 판단 |
| 생활 틀 `life`    | **특성**: 반복 관찰된 특성 · 학습 태도○ · 진로○                                                         | **장면**: 대표 생활 장면 · 학급 역할○ · 인성·관계○                                                                                                                                                                    | **성장**: 자기관리·관계·책임 · 변화○ · 아쉬운 점○                                                                                                                                        | **평가**: 교사 판단 |

- 기존 35개 모듈 전부 배치(탐구 32 + 생활 3) + 신설 6 = 41. `FRAME_SLOTS[frame][role] = RecordModuleId[]`. 기존 모듈의 카탈로그 `role`(`recordStyleCatalog.ts:81, 203, 354, 362, 371`)은 그대로 — 폴백 출력 무영향(`recordStyleCompose.ts:80·145·288` 이 읽는 값). 장면 경로 표식은 `scene.role`.
- ○ 신설 6개, 이름은 `HOMEROOM_SLOTS`(`observationSlots.ts:44-51`) 문자열 그대로. 지침 문구는 P1 에서 쓴다(§13-1 승인 완료). '변화'의 `needs` = "변화 슬롯 근거 또는 30일 이상 벌어진 날짜"(`checkChangeBasis` `recordNarrativeChecks.ts:472-497` 가 슬롯 `:481` **또는** 날짜 간격 `:483-490` 을 본다 — 같은 조건).
- 자리 3 이름 '성장'. 틀은 영역이 정한다(`behavior` → 생활).
- `RECORD_STYLE_CATALOG_VERSION` 2 → 3(`RecordWritingStyle.ts:128`). `recordStyleCatalog.ts:2` 헤더 정정.
- 범례·장면 칸 머리 라벨은 **틀 이름**(오너 결정 §13-6): `frameRoleLabels(frame)` 를 `narrativeFrames.ts` 에 두고 범례·장면 칸·요약 한 줄이 그것을 쓴다(탐구 = 동기·질문/과정/결과/평가, 생활 = 특성/장면/성장/평가). `NARRATIVE_ROLE_LABELS`(`narrativeParagraphs.ts:35-40`)·색 4종·표식 4종·파서는 **무변경** — 라벨은 화면 전용이다.

### 3-6. 뼈대 `RecordScaffold`

```ts
export interface RecordScaffold {
  readonly id: string;
  readonly name: string;
  readonly frame: 'inquiry' | 'life';
  readonly scenes: readonly Pick<NarrativeScene, 'role' | 'moduleId' | 'label'>[];
  readonly builtIn?: boolean;
}
```

- 내장 7 = 초점 7종 `body` → 장면 + 평가 맨 앞. `normalizeScaffold()` 저장·적용 시 평가 1개 강제. 기본 뼈대 = `legacyInquiry`. 예시 초안(`recordStyleSamples.ts`)은 내장 7 · 기본 배열일 때만.

## 4. 요청서 (`recordStyleCompose.ts` · `recordDraftPack.ts`)

### 4-1. 구성 관문 (P2)

```ts
resolveCompositionFromScenes(saved, frame, { chained, placed }): ResolvedComposition | null
applyCompositionVersionGate(c, promptVersion): { composition: ResolvedComposition | null; downgraded: boolean }
```

- **`null` 은 `placed === 0 && isDefaultScenes(saved, { chained })` 일 때만**(`chained` 판정은 `isDefaultScenes` 안에서 한 번). `saved` 가 **부재이거나 빈 배열이면 `null`**(기존 사용자 전원 = 기준선). 근거가 1건이라도 배치되면 기본 뼈대라도 구성을 만든다(근거 관문이 구성 관문을 켠다 — "기본 뼈대 + 배치 있음" 사분면).
- `modules` = **`scenesOf` 와 같은 정규화**(소유 근거만·평가 1개·중복 첫 등장)를 거친 배열을 장면 순서대로, 카탈로그 모듈 **얕은 복사에 `role: scene.role` 덮어쓰기**(`ResolvedComposition.modules: RecordModule[]` `recordStyleCompose.ts:33`). 관문 켜짐/꺼짐 판정만 저장 배열로 한다(화면과 요청서가 평가 2개 저장본에서 갈리지 않게). 라벨만 있는 장면 = 같은 role 기본 모듈 + 라벨. `firstIsEvaluation` = 첫 장면 평가. `grouping = 'connected'`(블록을 실을 때 `groupingInstruction` 은 항상 나간다 `:154-161`; 새로 늘어나는 지시 없음). `shouldEmitComposition = true`.
- 판본 문지기: 기존 `applyPromptVersionGate`(`:330-344`) 무변경. 형제 함수가 판본<3 이면 `null` + `downgraded`. **호출부**(`RecordDraftAiPanel.buildPrompt`)가 해석·문지기 후 `DraftPackInput.composition?` 으로 넘긴다(`recordDraftPack.ts:77-78` 계약). `composition` 과 `style` 이 함께 오면 **`composition` 우선**(`recordDraftPack.ts:241` 분기). `downgraded` 경고는 패널이 직접 얹는다.
- 장면 경로의 준비 경고: `checkStyleReadiness`(`:255-322`) 의 style 기반 4종(`few-evidence`·`no-before-after`·`question-opening-unfit`·`area-focus-mismatch`)은 **끈다**(교사가 손댈 수 없는 값에 대한 경고 금지; 폴백이 `legacyInquiry` 고정이라 `few-evidence` 는 `minEvidence: 1` 로 어차피 죽은 경고다). 장면 경로 경고는 둘뿐: `downgraded` · **"실린 근거 0건"**(배치·폴백 모두 근거가 하나도 안 실릴 때).
- `DraftPackInput` 확장: `composition?` · `scenes?: DraftPackScene[]`(`{ sceneId, mark, categoryLabel?, label?, note?, evidenceIds }`, `mark` 4종) · `threadNote?`(P0) · `chain?`. `DraftPackEvidence` 에 `note?` 와 **`createdAt?: number`**(P0 정렬 동률용 — 지금 타입 `recordDraftPack.ts:39-46` 에는 없어 호출부 2곳이 넘긴다). `style` 유지(폴백 = 기본값).

### 4-2. 근거 관문 (P2)

- `placed === 0` 이면 근거 줄·순서·머리 전부 **P0 조립기와 같은 코드 경로**(구성 관문만 켜진 경우 = 오늘의 "작성 방식 고른 경로").
- `placed ≥ 1`: 장면 순서로 싣고 **실린 줄에만** 번호. 제외 4사유(`recordDraftPack.ts:180-222`)·소유 불일치는 장면 지시에서도 뺀다. 전부 빠진 장면 `근거: (제외됨)`. `unplaced` 는 "그 밖의 근거"(date↑) + "새 문단 만들지 말고 필요한 곳에만".
- **근거 안전 판정은 공용 헬퍼 `prepareEvidenceForModel()` 하나, 줄 조립은 꾸러미별**: 공용 = 가림(`redactQuestion` `redactOutbound.ts:284`, `recordDraftPack.ts:171` 이 쓰는 그 함수)·`substituteProhibited`·금지어 재검사·**메모만 제외**(대체 후에도 금지어 남으면 메모만 빼고 근거는 싣고 "메모 N건이 빠졌습니다")·예산 가산. 줄 형식·번호·머리·`hint` 는 각 꾸러미가 지금대로 조립한다(`buildRecordDraftPack` `:214` / `buildLengthAdjustPack` `:334`, 두 번째 12k 루프 `:394-399` / `threadSuggestPack` `:85·:122`). #89 는 셋의 **판정** 을 대상으로 한다. ★`threadSuggestPack` 은 지금 `substituteProhibited` 를 **안 쓴다**(`:107-114`, 금지어면 무조건 제외) — 구제분은 분류 제안에 싣지 않는다(§13-7 확정: 지금처럼 제외 유지).
- 12k 루프(`:215-222`) 재작성: chain 이면 주제 수로 1차 배분 `floor(12000/n)`, 남는 몫은 뒤 주제부터 재배분, 사슬 상한 3, 메모 글자수 포함. 잘린 것은 장면 id 와 함께 `exclusions`.
- 요청서 예시:

```
주제: 할인 문구와 선택
작성 구성(이 순서대로 문단을 씁니다):
1. [평가] 교사 판단 - … - 교사 메모: …
2. [동기] 첫 수행의 특징 - … - 근거: 1, 2
3. [과정] 받은 의견·자기 점검 - … - 근거: (제외됨)
근거 자료:
1. (2026-09-02) … (교사 메모: …)
2. (2026-09-04) …
그 밖의 근거:
3. (2026-09-25) …
```

### 4-3. 큐

- 시작 시 대상 전원의 장면을 **`phase` 상태에** 스냅샷(`runStyleRef` 처럼 ref 로 두면 [이어 하기] `RecordDraftAiPanel.tsx:908`·자동 이어가기 `:591-592` 재진입에서 깨진다).
- 학생별: 장면 있는 열린 주제 1개 → 그 장면. 0개 → 폴백. **2개 이상 → 시작 시 일괄 확인 화면**(큐 중간 정지 없음; [주제 고르기] / [전체 근거로 진행]). 결과 목록에 "서사 N장면 / 전체 근거".
- 테스트: 2명 큐 1번 메모 → 2번 요청서 0건(#88) · 주제 2개 학생 확인 화면 · **[이어 하기] 후에도 시작 시점 장면**.

### 4-4. 판 발자국

- `RecordDraftStyleStamp`(`RecordWritingStyle.ts:165-174`) 확장: `focus/opening/grouping` 선택화, `frame?`, `sceneRoles?`, `sceneIds?: (string|null)[]`(부분수열 정렬, 못 맞추면 null). `moduleIds` 는 카탈로그 id 만. 자유 글 없음. 브릿지는 판을 읽지 않으므로 브릿지 작업 없음.

### 4-5. 폴백 경로 — 기본값 고정 (P3)

- 폴백 = `DEFAULT_RECORD_WRITING_STYLE`. 저장된 `recordWritingStyles`·`recordStylePresets` 는 P3 변환에서 **한 번만** 읽는다: 프리셋 → 「내 뼈대」, 영역별 마지막 선택이 비기본이면 **같은 이름의 뼈대로 옮기고 그 영역의 기본 뼈대로 깐다** + 한 번 고지("그동안 쓰시던 「○○」을 뼈대로 옮겼습니다"). 변환 뒤 요청서 입력으로 쓰지 않는다. 요약·범례·요청서는 언제나 같은 `resolved`.
- 픽스처 `saved-style-nonempty`(P3): 저장된 비기본 style + 장면 없음 → 「작성 구성」 0줄, 요약 = "전체 근거를 날짜순으로 씁니다".

### 4-6. 회귀 검사

- #79 → **#79-a**(style 경로 `applyPromptVersionGate`, 현행 지문 `regression-grep-check.mjs:578-584` 의 거리 제약과 **호출 인자 모양**(`buildPrompt(t, runStyle)` → `composition` 인자 추가) 둘 다 갱신) · **#79-b**(composition 경로 `applyCompositionVersionGate`). #80 지문 재작성(의도 유지, 장면 경로 포함). 신규 #86 관문 둘 꺼짐=`base/` · #87 제외 근거 번호 재사상 · #88 큐 · #89 메모(세 꾸러미) · #90 표식 4종 외 0.

## 5. 화면

### 5-1. 보기 전환 (호스트 `RecordEvidenceBoard.tsx`, 이름 변경 없음)

- `[흐름] [보드]`, 기본 `flow`(P3). 공통 도구줄: 학생 · 영역 필터 · [뼈대 고르기 ▾] · [AI 서사 초안] · [엑셀 ▾] · [+ 근거 직접 입력].
- 보드 보기 = 기존 열·카드 + 역할 색 점 + 메모 표시 + **골랐을 때 메모 입력**(D4 를 두 보기에서 동일하게).

### 5-2. 흐름 보기 (`NarrativeFlowView.tsx` + `NarrativeLane.tsx`·`SceneCell.tsx`·`LinkArrow.tsx`)

```
│ ▼ 할인 문구와 선택 (5)  [○○에서 이어짐 ▾] [이 흐름으로 초안 쓰기] [이어진 흐름 전체로] [⋯]
│ ┌─ 평가 ──────┬─ 동기: 첫 수행 ─┬─ 과정: 받은 의견 ─┬─ 결과: 달라진 수행 ─┬ + 장면 ┬ 아직 안 놓음 ┐
│ │ 메모(크게)  │ ┌카드┐          │ ┌카드┐ ┌카드┐      │ ┌카드┐              │        │ ┌카드┐       │
│ └─────────────┴─────────────────┴────────────────────┴─────────────────────┴────────┴──────────────┘
│        │  이음: "기초 탐구에서 심화로"
│        ▼
│ ▼ 광고 규제는 필요한가 (3) …
├ 아직 어느 줄기에도 안 엮은 근거 (7)  ▸ 가로 서랍
```

- 줄기 머리: 제목 · [○○에서 이어짐 ▾](고리 항목 흐림) · [이 흐름으로 초안 쓰기] · [이어진 흐름 전체로] · ⋯(닫기·삭제·옛 줄기 보기·내 뼈대로 저장) · **빈 고리 힌트는 기존 `emptyLinkHints`(`threadSuggest.ts:211-232`, 근거 슬롯 축)를 그대로** 줄기 머리에.
- 장면 칸: 틀 이름 + 세부 카테고리 · 메모 · 카드 세로 · 순서 끌기 · `[+ 장면]` · 삭제 · 평가 삭제 불가·메모 큼 · '변화' 조건 힌트.
- 카드(압축형) · 끌기 4규칙(서랍→칸 / 칸 안·사이 / 다른 줄기 = `placeInScene` ① 이 `moveToThread` / 빈 캔버스 새 주제) · 연결 화살표(SVG, 칩 3 + 최근 3 + 직접 적기) · 빈 상태 단추 둘([날짜순으로 줄기 하나 만들기] = 새 주제 + 기본 뼈대 + unplaced; 요청서 차이 = 주제 줄·주제 정보 줄뿐) · 영역 필터 숨김 칩 · 1024px 미만 세로.
- 왕복: `recordFlowIntent.ts:18` `'flow'`. 쪽지 생산자 2곳(`src/adapters/components/ClassManagement/ObservationForm.tsx:582` · `Homeroom/Records/InputMode.tsx:624`) + 화면 내 전환 2곳(초안 행 [미분류 N건]·패널 [근거 정리]).
- 디자인 협업 필수 · `data-sp-floating` · `sp-*` · 라운드 · em 대시 0 메타 테스트.

### 5-3. 뼈대 고르기 (`ScaffoldPicker.tsx`, `RecordStylePicker.tsx` 대체, P3) — 내장 7 + 「내 뼈대」, [이 뼈대 깔기] = `applyScaffold`(확인), 「내 뼈대로 저장」.

### 5-4. AI 초안 패널 (`RecordDraftAiPanel.tsx`, P3)

- `RecordStylePicker` 제거. 요약 = `summarizeComposition(resolved)`; `null` 이면 **"교사 평가 → 동기·질문 → 과정 → 결과 차례로, 근거는 날짜순"** + [뼈대 고르기](폴백 요청서가 `narrativeParagraphs.ts:293-294` 로 그 순서를 강제하므로 화면도 같은 말을 해야 한다 — 보이지 않는 설정 금지).
- **범례 `RecordStyleLegend.tsx`**(`:29` style prop, `:41·56·92` 초점 이름 머리): prop 을 `{ title: string; modules: RecordModule[] }` 로 바꾼다. `title` = 주제 이름(장면 경로) / "전체 근거"(폴백). 폴백의 `modules` = **기본 4역할**(`legacyInquiry` 구성). 테스트 `recordStyleLegend.test.tsx`·`recordStylePicker.test.tsx`(삭제/대체)·`recordStyleWiring.test.tsx`·`RecordDraftAiPanel.test.tsx` 갱신(`RecordStylePicker` 참조 3곳).
- 주제 칩 · `[이어진 흐름 전체]` · 「+ 한마디」 유지 · 세부 조정·시작·묶기 UI 삭제 · `downgraded`·`few-evidence` 만 경고 · 문단↔장면 왕복.

### 5-5. AI 서사 초안 (P4) — 꾸러미·파서(깨진 입력 5종)·점선·[적용] = `applyScaffold` + **`placeMany`** + `setLink`(주제 파일 저장 1회)·적용 전 저장 0회. **이유 문장은 [적용] 때 장면 메모로 저장한다**(오너 결정 §13-2): 200자로 자르고, 실명 복원(`restoreModelText`)을 거친 뒤 저장하며, 점선 상태에서 교사가 고친 글이 있으면 그것이 우선. 근거 밖 낱말 유입 위험은 메모가 요청서로 다시 나가는 자리에서 생기므로, 저장된 AI 메모에는 `source: 'ai'` 표식을 두고 교사가 손대기 전까지 카드에 "AI 가 쓴 이유" 배지로 보인다(요청서에는 교사 메모와 같게 실린다). [AI 분류 제안]은 보드에 남긴다.

## 6. 브릿지·동기화

- 파일·동기화 키 추가 없음. `ENTITY_FIELD_CONTRACT`(`emit-entity-samples.mjs:42-190`, 5종)에 `inquiryThread`·`recordEvidence` 그룹 신설(P1 첫 항목).
- 브릿지 `normalizeRecord6`(inquiryThread `index.mjs:34857-34880`)·`normalizeRecord5`(recordEvidence) 화이트리스트 + **`attachment` 누락 수정**(`:34772-34778` vs `RecordEvidence.ts:23`, 확정 결함).
- 순서(P0·P1·P4): 브릿지 커밋 → dist → 앱 `electron/ai-bridge/index.mjs` 재생성 → 앱 커밋. 브릿지 커밋 없이 앱만 커밋 금지. 번들 없는 중간 출시 금지. `mirrorRoundtrip.test.ts` 통과.

## 7. 단계 (한 세션 = 한 단계, 병렬 구현 금지, 단계마다 게이트 4종)

| 단계                    | 내용                                                                                                                                                                                                                                                                                                                                                               | 주요 파일                                                                                                                                                                                                                                                                                                            | 수용 기준(실패할 수 있는 문장)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0**                  | 정렬(date↑·무날짜 뒤·createdAt↑·id) — **정본 자리는 `recordDraftPack.ts` 안**(`buildRecordDraftPack` :180 과 `buildLengthAdjustPack` :334, 루프 :364-401 둘 다 같은 정렬 헬퍼; `DraftPackEvidence.createdAt?` 추가, 호출부 2곳이 넘김) · 주제 정보 동봉 · `threadId` 호출부 2곳 + 브릿지 write · 번들 · 픽스처 `pre/`(P0 직전) + **`base/`(P0 적용 후 같은 커밋)** | `recordDraftPack.ts` · `RecordDraftAiPanel.tsx` · `RecordDraftView.tsx` · 브릿지 write · 픽스처(§9-2)                                                                                                                                                                                                                | `base/` 6종(`empty`·`nodate`·`prohibited`·`overflow`·`lessonContext-question`·`lifeRelation`) 대조 · `pre/`↔`base/` diff 가 근거 줄 순서·주제 정보 줄에서만(줄 집합 동일; `overflow` 잘린 id 변화를 diff 첨부, 학생 수 기준 %) · `nodate`: 무날짜 2건이 뒤이고 그 둘의 순서가 `createdAt` 으로 고정됨 · [채우기] 경로도 date↑ · 초안 threadId · 하네스 5건: 인용 순서 어긋난 문단 0·근거 밖 고유명사 0(전제 §9-3) · 브릿지 왕복. **§13-5 기본값 = 경고만(P0 를 막지 않음)**                                                                                                                                                                                                                                                                                                                                                                          |
| **P1**                  | `ENTITY_FIELD_CONTRACT` 그룹(첫 항목) · 엔티티 3필드 + 헤더 주석 2줄 개정 · `narrativeScenes.ts` · `write` Promise 확장 · 진입점(근거 먼저)·`placeMany`·`detachFromScenes` 7곳·prune · `buildEvidence(note)`·`setNote` · `narrativeFrames.ts`·`normalizeScaffold` · 설정 2칸 · 카탈로그 판본 3 · 브릿지(화이트리스트·attachment·번들) · 학년도 전환 확인           | `InquiryThread.ts` · `RecordEvidence.ts` · `Settings.ts` · `RecordWritingStyle.ts` · `narrativeScenes.ts` · `narrativeFrames.ts` · `useInquiryThreadStore.ts` · `useRecordEvidenceStore.ts` · `emit-entity-samples.mjs` · 브릿지 레포                                                                                | §3-1 검사 14건 · 메타 테스트 필드 누락 시 실패 확인 · **기존 35개** 모듈 `role` diff 0 · `base/` 대조 · `no-scenes`(`scenes` 필드 부재) = `base/` 동일 · 커밋 diff 에 `src/adapters/components/**` 0개 · 브릿지 왕복 · `scaffold-only` 픽스처(기본 뼈대·배치 0 = `base/` 동일)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **P2**                  | 구성·근거 관문 · 문지기 형제 · `renderEvidenceLine` · 번호 재사상 · 12k 루프 재작성 · chain 예산 · 판 발자국 · 큐(`phase` 스냅샷·확인 화면) · 준비 경고 축소 · #79-a/b·#80·#86~#90. `style` 폐기 안 함                                                                                                                                                             | `recordStyleCompose.ts` · `recordDraftPack.ts` · `narrativeParagraphs.ts` · `RecordAiDraft.ts` · `RecordWritingStyle.ts` · `threadSuggestPack.ts` · `RecordDraftAiPanel.tsx`                                                                                                                                         | 관문 둘 꺼짐 = `base/`+`scaffold-only`+`no-scenes` 동일 · `default-scaffold-placed`(기본 뼈대 + 배치 3) → 「작성 구성」 4줄·번호 전부 구성 줄에서 참조 · `nondefault-scaffold-unplaced`(비기본 뼈대·배치 0) → 「작성 구성」이 장면 수만큼 나가고 **근거 줄·번호는 `base/` 와 동일**(근거 관문 꺼짐) · 판본 2 → 「작성 구성」 0줄 + 경고 · 제외 근거 있는 장면에 없는 번호 0 · #88 · [이어 하기] 스냅샷 유지 · 주제 2개 확인 화면 · 메모 실명 0·금지어 메모만 제외+고지(세 꾸러미) · `chain3`: 1차 배분 `floor(12000/3)` 정확, 재배분 후 총합 ≤12,000, 어느 주제도 0건 아님, 앞 주제 1,000자면 뒤 두 주제에 3,000자 재배분을 diff 로 · 표식 4종 외 0 · 하네스 20건 = 탐구 14 + **행특 6**: 표식 부분수열 위반 0·근거 밖 고유명사 0·행특 기재요령 금지 서술 0. (화면: P3 전에는 장면이 0이라 확인 화면·경고 모두 **도달 불가** — 렌더 테스트로만 검증) |
| **(폐기) P3 착수 관문** | 오너 결정(2026-09-10): 전 단계를 마친 뒤 **v2.5.2 로 한꺼번에** 출시한다. 관문 대신 P2 하네스 20건을 **두 빌드**(P0 정렬만 / 장면 배열 적용)로 돌려 전후 비교를 기록에 남긴다. 비교 결과가 나빠도 출시를 막지 않는다 — 판단 자료다.                                                                                                                                |                                                                                                                                                                                                                                                                                                                      |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **P3**                  | 흐름 보기 UI · 보기 전환·기본 `flow` · 전환 4곳 · 뼈대 고르기 · 변환(§4-5·§8) · 고르개 제거 · 범례 prop · 보드 카드 메모 편집. **단독 출시 금지 — P5a 와 같은 릴리즈**                                                                                                                                                                                             | `NarrativeFlowView.tsx` · `NarrativeLane.tsx` · `SceneCell.tsx` · `LinkArrow.tsx` · `ScaffoldPicker.tsx` · `EvidenceCard.tsx` · `RecordDraftAiPanel.tsx` · `RecordStyleLegend.tsx`+테스트 · `recordFlowIntent.ts` · `RecordDraftView.tsx` · `ClassManagement/ObservationForm.tsx` · `Homeroom/Records/InputMode.tsx` | 끌기 → `placeInScene` 1회 · 두 보기 근거 id 집합·숨김 수 동일 · 필터 숨김 칩 · 빈 상태 단추 2 · 1024 미만 가로 스크롤 컨테이너 0 · 1440 담임/교과/유리: 장면 칸 ≥180px·카드 2줄 말줄임 · `saved-style-nonempty` 픽스처 · 변환 표(grouping 포함) 조용한 강등 0·고지 1회 · 디자인 검토 0바이트면 미승인 + 직접 검증 5항목(`data-sp-floating` 누락 0 · HEX 0 · 칸 ≥180 · 세로 접힘 · 라운드 위반 0)                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **P4**                  | AI 서사 초안 · `placeMany` 적용 · **이유 문장 → 장면 메모 저장(`noteSource: 'ai'`, 200자, 실명 복원)** · 문단↔장면 왕복 · 번들                                                                                                                                                                                                                                     | `narrativeSuggestPack.ts` · `narrativeSuggestionParser.ts` · `NarrativeFlowView.tsx` · `RecordDraftAiPanel.tsx` · 브릿지                                                                                                                                                                                             | 꾸러미 실명 0 · 파서 깨진 입력 5종 · 적용 전 저장 0회 · 주제 파일 저장 1회 · 실기기 1건: 장면 4 → 표식 부분수열·근거 밖 고유명사 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **P5a**                 | `/docs` 「흐름 보기로 서사 짜기」(작성 방식 절 **`docs.ts:2049-2062` 전체** 대체 · `:2082-2083` 형광펜 절 · 변경 이력은 `:3028`(v2.5.1 줄)을 고치지 않고 **새 줄 추가** · `lastUpdated`) · 회귀 정리. **P3 와 같은 릴리즈**                                                                                                                                        | `landing/src/content/docs.ts` · `regression-grep-check.mjs`                                                                                                                                                                                                                                                          | `docs:check` + `build` + `prettier --check` · `lastUpdated` · 회귀 초록                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **P5b**                 | ADR-103 · ADR-085 **`:22`·`:23`·`:59`** · PROGRESS/월별                                                                                                                                                                                                                                                                                                            | `ADR-103.md` · `ADR-085.md`                                                                                                                                                                                                                                                                                          | `git diff --exit-code contracts/entity-samples` · 링크                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

- **출시는 P0~P5b 전부 마친 뒤 v2.5.2 한 번**(오너 결정 2026-09-10). 중간 출시 없음. 단계 순서·게이트·번들 재생성 규칙은 그대로(작업 단위와 검증 기준선을 위한 것).

## 8. 호환·이행 (P3, 한 번 실행)

| 저장돼 있던 것                            | 가는 곳                                                                                                                                                                                                                                              |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recordStylePresets[].focus.body`         | 뼈대 장면(모듈 순서, role 은 자리표)                                                                                                                                                                                                                 |
| `opening`                                 | evaluation=평가 맨 앞 / performance=맨 뒤 / question=맨 뒤 + 첫 motive 장면 맨 앞                                                                                                                                                                    |
| `modules.disabled` / `extras`             | 제거 / 뒤에 추가                                                                                                                                                                                                                                     |
| `grouping: byAchievement` / `single`      | 장면 경로는 `connected` 고정이라 **반대 지시로 바뀐다**(`byAchievement` 는 "이어 쓰기"로, `single` 은 "서로 다른 면이면 각각 남긴다"가 새로 붙음 `recordStyleCompose.ts:155-161`) → 그 반전을 말하는 안내 1회 + 명시 표(`RECORD_FOCUS_ALIASES` 선례) |
| `instruction`                             | 뼈대에 안 들어감 → 「+ 한마디」                                                                                                                                                                                                                      |
| `recordWritingStyles`(영역별 마지막 선택) | 비기본이면 같은 이름 뼈대로 옮겨 그 영역 기본 뼈대 + 고지 1회. 이후 **요청서 입력으로 쓰지 않음**. 값은 보존                                                                                                                                         |

- 서버 규정 판본 3·「작성 구성」 이름·`buildStyleInstruction` 무변경. 구버전 앱 덮어쓰기: 부재 ≠ 삭제 테스트 + 출시 노트.

## 9. 검증

1. 게이트 4종 단계마다(USB: 무거운 작업 하나씩).
2. 픽스처: `src/domain/services/__tests__/fixtures/recordDraftPack/{pre,base}/*.txt` — **이 기능이 세우는 새 관례**, 경로는 `new URL('./fixtures/…', import.meta.url)`(`RealtimeWallBoardNormalizer.test.ts:29` 의 `path.resolve('tests/fixtures')` 는 CWD 상대라 베끼지 않음). `base/` 는 P0 적용 후 같은 커밋. P1 `scaffold-only` · P2 `default-scaffold-placed`·`chain3`·`nondefault-scaffold-unplaced` · P3 `saved-style-nonempty`.
3. 하네스 `scripts/record-style-qa.mts`: 전제 — 엔드포인트 1층 본문과 `--l1` 파일 sha256 대조, 다르면 덮고 재대조, 두 해시 기록. P0 5건, P2 20건(탐구 14·행특 6, Claude·Codex).
4. 실렌더: Playwright MCP + localStorage fixture, 1440 담임·교과·유리·1024 미만.
5. 브릿지 `mirrorRoundtrip.test.ts` + 번들 지문.
6. 실기기(오너): 거울 저장 0회 · 서랍→장면 끌기 뒤 파일 2개 변화 · 다른 줄기로 끌기 · 보드 전환 자료 동일 · 이음말 편집 · [이어진 흐름 전체] · AI 서사 초안 적용 전 파일 변화 0.

## 10. 위험

| 위험                                            | 대응(검증 가능)                                                                                                                                                |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 학생당 장면 배열 반복 노동                      | 배치 없이도 초안(뼈대만·날짜순 단추·AI 서사 초안) · P2 하네스 두 빌드 전후 비교 기록.                                                                          |
| 보이지 않는 설정이 결과를 가름                  | 폴백 기본값 고정 · 변환 1회 · 요약=범례=요청서 같은 `resolved`.                                                                                                |
| 구버전 앱이 `scenes` 를 지움                    | 부재 ≠ 삭제 테스트 + 출시 노트.                                                                                                                                |
| 유령 id 부활                                    | 근거 먼저 쓰기 · 7경로 detach · prune 술어 · 왕복 테스트.                                                                                                      |
| 12k·32,767 총량                                 | 배분·상한 3·메모 예산·`chain3` · **장면 상한 20**(「작성 구성」 블록 길이 계산 가능).                                                                          |
| 학년도 전환·보관함이 두 파일을 다른 시점에 옮김 | P1 전 코드 확인(§3-1). 그렇다면 읽기 가림으로 받치고 전환 완료 뒤 prune 1회.                                                                                   |
| 메모 실명·금지어(세 꾸러미)                     | `renderEvidenceLine` 한 곳 + #89.                                                                                                                              |
| 큐에서 남의·옛 장면                             | `phase` 스냅샷 + 확인 화면 + #88 + [이어 하기] 테스트.                                                                                                         |
| 판본 2 서버                                     | 형제 문지기 + 경고 + #79-b.                                                                                                                                    |
| P0 정렬로 잘리는 근거 변화                      | diff 첨부(학생 %) · 기본 = 경고만(§13-5).                                                                                                                      |
| 생활 틀 품질                                    | 하네스 행특 6건 · §13-1 게이트.                                                                                                                                |
| 프리셋 변환 의미 손실                           | §8 표 + 고지 + 검사.                                                                                                                                           |
| AI 서사 초안 근거 밖 낱말이 메모로 저장됨       | 오너 결정으로 저장한다. `noteSource:'ai'` 배지로 교사가 알아보게 · 요청서엔 교사 메모와 같게 실림 · P4 실기기에서 저장된 AI 메모의 근거 밖 고유명사 수를 기록. |
| OMC 에이전트 빈 반환                            | 직접 검증 전환·기록.                                                                                                                                           |

## 11. 하지 않는 것

자유 캔버스 · 다중 부모 · 색 추가 · 서버 규정 판본 변경 · 관찰 원본에 메모 · 점수판 · 보드 열 순서 끌기 · 모바일 흐름 보기 · 호스트 파일명 변경 · `style` 인자 삭제(폴백 = 기본값) · 저장된 작성 방식을 요청서 입력으로 유지 · 카탈로그 모듈 `role` 재배치 · "문단 수 = 장면 수" 보장 · **장면 축 빈 고리 힌트**(기존 슬롯 축만) · 배치 실패 보상 경로.

## 12. ADR-103 초안 (P5b)

- **결정**: 기본 보기 = 흐름 그래프(레인형), 보드 = 두 번째 보기. 장면 배열이 작성 구성을 생성(자리표 분리, 기존 계약 유지). 고르개 네 축 화면 제거·폴백 기본값 고정, 초점 7종 = 뼈대. 행특 = 생활 틀(특성·장면·성장·평가, 저장값 4종). AI 는 서사 초안까지 제안. 쓰기는 근거 먼저.
- **동인**: 정렬이 품질을 가른다(ADR-083) · 고르개 복잡도 · 서사 설계 자리 부재.
- **대안**: 자유 캔버스(기각) · 보드 정렬만(P0 로 흡수). 오너 결정: 전 단계 완료 후 v2.5.2 일괄 출시(P3 착수 관문 폐기).
- **결과**: ADR-085 `:22`(보드형 대체·전환 없음)·`:23`(끌어놓기 제거 — 이미 낡음)·`:59`(마인드맵 안 함) 수정 · ADR-099 초점·시작·묶기는 장면 배열로 흡수 · ADR-083·085 AI 제안 범위 확장 · `InquiryThread.ts:16-17` 주석(P1) · 카탈로그 판본 3.
- **후속**: 생활 틀 지침 문구 실사용 검토 · 다중 부모 · 모바일 · 하네스 두 빌드 비교 결과.

## 13. 오너 답변 (2026-09-10) — 전부 답이 왔다. 착수 차단 없음

| #   | 질문                                                     | 답                                                                                                                                           |
| --- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 생활 틀 자리 이름 `특성 · 장면 · 성장 · 평가` + 신설 6개 | **승인.** 지침 문구(`purpose/needs/forbid`)는 P1 에서 담임 슬롯 설명(`observationSlots.ts` 주석)을 바탕으로 쓰고 P2 하네스 행특 6건으로 검증 |
| 2   | AI 이유 문장을 장면 메모로 저장                          | **저장한다**(권고와 반대, 오너 결정). §5-5 · `noteSource: 'ai'`                                                                              |
| 3   | 메모 상한 200자                                          | **동의**                                                                                                                                     |
| 4   | P0 를 먼저 낼지                                          | **아니오 — P0~P5b 전부 마친 뒤 v2.5.2 로 한꺼번에.** P3 착수 관문 폐기, 대신 하네스 두 빌드 비교                                             |
| 5   | 12k 상한에서 잘리는 근거                                 | 설명 후 **기본값(경고만) 유지.** 장면 경로에서는 "그 밖의 근거"(배치 안 된 것)부터 잘리므로 선생님이 놓은 근거가 먼저 살아남는다             |
| 6   | 행특 범례 라벨                                           | **틀 이름으로**(권고대로). §3-5 `frameRoleLabels`                                                                                            |
| 7   | AI 분류 제안에 금지어 대체 구제                          | **적용 안 함**(권고대로). `threadSuggestPack` 은 지금처럼 금지어면 제외                                                                      |
