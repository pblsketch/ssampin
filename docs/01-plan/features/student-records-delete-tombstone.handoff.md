# 핸드오프 — 학생 기록 삭제 툼스톤 (기기 간 삭제 전파)

작성: 2026-07-23 · 상태: **미착수** · 선행 QA: v2.2.14 릴리즈 전 검수(HIGH 1건)

---

## 0. 이 작업을 맡은 세션에게

이 문서 하나만 읽고 시작할 수 있게 썼다. 아래 순서를 지켜라.

1. `git status --short` 로 기존 변경 확인 — 있으면 덮지 말고 이어서 작업
2. 작업 위치는 **`main` 단일 워킹트리** (새 브랜치·worktree·PR 만들지 말 것)
3. 구현 전 **§4 함정**을 먼저 읽어라. 특히 §4-①은 이 작업 전체를 망칠 수 있다
4. 완료 선언 전 **§6 검증 게이트 4종 전부** 실행

---

## 1. 무엇이 문제인가

**증상 (선생님 신고 언어):** "학생 기록을 지웠는데 다른 기기에서 다시 생겨요."

**원인:** 학생 기록(`student-records`)에는 **삭제를 기록하는 표식(툼스톤)이 없다.** 그래서
A기기에서 지워도, B기기에 남아 있던 사본이 동기화 때 "A에 없는 새 기록"으로 취급돼 되살아난다.

같은 저장소의 **출결(attendance)과 관찰기록(observations)에는 이미 툼스톤이 있다.**
학생 기록만 빠져 있는 **비대칭**이 문제다.

**근거 (코드):** `src/usecases/sync/SyncFromCloud.ts` `mergeStudentRecords()`

```ts
for (const r of remoteRecords) {
  const existing = map.get(r.id);
  if (!existing) {
    map.set(r.id, r);   // ← 리모트에만 있으면 무조건 되살린다. 삭제였는지 알 방법이 없다.
    continue;
  }
```

`mergeObservations()`(같은 파일 ~250줄)와 비교하면 차이가 명확하다. 관찰기록은 툼스톤을
병합하고 "기록의 `updatedAt` 이 삭제 시각보다 나중이면 부활, 아니면 삭제 유지" 규칙을 적용한다.

**왜 지금 드러났나:** ADR-027(출결 이중 장부 삭제)로 삭제 경로가 정리되면서 이 비대칭이 표면화됐다.

---

## 2. 목표

`student-records` 에 관찰기록과 **동등한** 삭제 전파를 넣는다.

- 한 기기에서 지운 학생 기록이 다른 기기에서 부활하지 않는다
- 지운 뒤 **다시 편집**한 기록은 정상적으로 살아난다(부활 규칙)
- 오래된 툼스톤은 자동 정리된다(무한 증식 금지)
- **기존 데이터 무손상** — 툼스톤이 없던 과거 파일도 그대로 열려야 한다

## 3. 구현 범위 (참고 좌표)

| #   | 파일                                                  | 할 일                                                                                                  |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | `src/domain/entities/StudentRecord.ts:100`            | `StudentRecordsData` 에 `deleted?: readonly StudentRecordTombstone[]` 추가 + 툼스톤 타입·TTL 상수 정의 |
| 2   | `src/usecases/studentRecords/ManageStudentRecords.ts` | 저장 시 툼스톤 생성·승계·GC. 원형: `ManageObservations.ts:36-45`                                       |
| 3   | `src/usecases/sync/SyncFromCloud.ts:138`              | `mergeStudentRecords()` 에 툼스톤 병합 + 부활 규칙. 원형: `mergeObservations()` 같은 파일 ~259-277     |
| 4   | `src/adapters/stores/useStudentRecordsStore.ts:361`   | `deleteRecord` 가 툼스톤을 남기도록 (이미 fail-closed 처리 있음 — 그 구조 유지)                        |

**원형(복붙 말고 참고):**

- 타입: `src/domain/entities/Observation.ts:21-38`
- 저장 시 툼스톤 GC: `src/usecases/classManagement/ManageObservations.ts:36-45`
- 병합 + 부활 규칙: `src/usecases/sync/SyncFromCloud.ts:259-277`

---

## 4. 함정 (반드시 먼저 읽을 것)

### ① 시각 표현이 도메인마다 다르다 — 그대로 복사하면 조용히 깨진다 🔴

| 엔티티                                    | `updatedAt` 타입                        |
| ----------------------------------------- | --------------------------------------- |
| `ObservationRecord` (`Observation.ts:11`) | **`number`** (ms)                       |
| `StudentRecord` (`StudentRecord.ts:74`)   | **`string`** (ISO), 게다가 **optional** |

관찰기록 툼스톤은 `deletedAt: number` 다. 이걸 학생 기록에 그대로 가져오면
**숫자 vs 문자열 비교**가 되어 부활 규칙이 항상 잘못 판정된다. 타입 에러도 안 난다(둘 다 비교 가능).

→ `StudentRecordTombstone.deletedAt` 은 **ISO 문자열**로 정의하고,
`StudentRecord.updatedAt` 과 **같은 축**에서 문자열 비교해야 한다.

### ② `updatedAt` 이 없는 과거 기록의 처리

`StudentRecord.updatedAt` 은 optional이다. 스탬프가 없는 옛 기록은 부활 비교에서
`(rec.updatedAt ?? '') > deletedAt` → 항상 false → **삭제가 이긴다.**
이게 맞는 기본값이지만(지운 걸 되살리는 것보다 안전), **의도한 동작임을 테스트로 못박아라.**

### ③ 새 write 경로는 `updatedAt` 스탬프가 필수

이 저장소의 기존 규칙이다(2026-07-13 데이터 유실 신고의 재발 방지책).
툼스톤을 도입하면서 새로 만드는 저장 경로가 있으면 반드시 `updatedAt` 을 찍어라.
안 찍으면 ②에 의해 그 기록은 영원히 부활하지 못한다.

### ④ 툼스톤 TTL 과 무한 증식

관찰기록은 90일(`OBSERVATION_TOMBSTONE_TTL_MS`). 학생 기록도 같은 값으로 맞춰라.
**GC를 빼먹으면 툼스톤이 무한히 쌓여 동기화 파일이 계속 커진다.**

### ⑤ 툼스톤을 AI 브릿지 계약 샘플에 넣지 마라 (선례 확인 완료)

동기화 메타데이터는 외부 AI에 노출하지 않는 **`notMirrored`** 분류다(`StudentRecord.ts:39` 주석).
이건 추측이 아니라 **현재 파일로 확인된 규칙**이다:

- `contracts/entity-samples/observation.json` → `deleted` **0회** (툼스톤이 이미 있는 도메인인데도 없음)
- `contracts/entity-samples/studentRecord.json` → `updatedAt` **없음**

→ `deleted` / `deletedAt` 을 `studentRecord.json` 에 **추가하지 마라.**
`scripts/emit-entity-samples.mjs` 로 샘플을 재생성한다면 이 필드가 **제외된 채로** 나오는지 확인하라.

관련 메타테스트: `src/usecases/aiBridge/__tests__/entitySampleContract.meta.test.ts`
(둘 다 실존 확인함 — 경로 그대로 쓰면 된다)

### ⑥ 기존 파일 호환

`deleted` 는 **optional** 이어야 한다. 과거 파일에는 이 키가 없다.
`deleted.length > 0` 일 때만 직렬화하는 관찰기록 방식을 따라라(`SyncFromCloud.ts:280` 근처).

---

## 5. 반드시 넣을 테스트

`mergeStudentRecords` 단위 테스트로 아래 시나리오를 고정하라.

1. **삭제 전파** — 로컬에서 지운 기록이 리모트에 남아 있어도 부활하지 않는다
2. **정당한 부활** — 삭제 후 그 기록을 다시 편집(`updatedAt` 이 `deletedAt` 보다 나중)하면 살아난다
3. **스탬프 없는 옛 기록** — `updatedAt` 이 없으면 삭제가 이긴다(함정 ②)
4. **TTL GC** — 90일 지난 툼스톤은 저장 시 사라진다
5. **하위 호환** — `deleted` 키가 없는 과거 파일이 그대로 병합된다
6. **툼스톤 병합** — 양쪽 툼스톤이 id별 최신 `deletedAt` 으로 합쳐진다

---

## 6. 검증 게이트 (완료 선언 전 전부)

```bash
npx tsc --noEmit          # 에러 0개
npm run lint              # 에러 0개 (경고 132건은 기존)
npm run test -- --maxWorkers=4   # 전량 통과 (기준선: 3807 passed / 312 files, 2026-07-23)
npm run regression-check  # 38/38
npx prettier --check <수정한 파일들>
```

`--maxWorkers=4` 를 빼면 Windows에서 타임아웃 flaky가 난다.

---

## 7. 완료 후

- `PROGRESS.md` 갱신
- `DECISIONS.md` 에 ADR 추가 (직전 번호는 **ADR-027**, 이 작업은 **ADR-028** 후보)
- 사용자 행동이 바뀌지 않으므로 `/docs` 사용자 가이드는 **갱신 불필요**.
  단 릴리즈 노트에는 "지운 기록이 다시 생기던 문제" 로 넣을 것
- 커밋은 작업 단위 완료 후 (사용자 요청 시 push)

---

## 8. 범위 밖 (건드리지 말 것)

- **출결·관찰기록 툼스톤** — 이미 정상. 리팩터링 대상 아님
- **`reorderClasses` 통째 저장 문제** — 별도 과제(같은 QA에서 MED로 발견, `teaching-classes` 도메인)
- **동기화 잔여 하드닝 R6(멀티탭)·R7(미래필드)** — 별도 PDCA
