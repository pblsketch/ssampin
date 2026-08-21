판정: REJECTED

(좁은 반려입니다 — 그물 ①~④ 코드 본체는 건전하고, 남은 건 문서 3곳 + 새로 확인된 오탐 경로 1건입니다.)

## 8건 판정

| #   | 판정                          | 근거                                                                                                                                                                                                                                                                  |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **고쳐짐**                    | `E:\github\ssampin\src\domain\rules\assertNoPii.ts:29-44`(STRUCTURED birth:false / FREE_TEXT birth:true) + `:111-119`(키 기반 분기). 파이프라인 테스트가 `date`·`due`·`period` 정상 통과를 실증(`assistPipeline.fixture.test.ts:52-95`). 13파일 95건 재실행 통과 확인 |
| 2   | **고쳐짐**                    | `E:\github\ssampin\src\usecases\assist\__tests__\assistPipeline.fixture.test.ts:44-49` 이 집계→sanitize→gate 를 실제 순서로 돌림. 층별 테스트에는 없던 경로                                                                                                           |
| 3   | **고쳐짐**                    | 같은 파일 `:52-95` — 날짜 3종(`2026-08-21`·`2026-08-25`·기간 문자열) 전부 포함                                                                                                                                                                                        |
| 4   | **고쳐짐(단, depth 2 까지)**  | `sanitizeToolResult.ts:44-50, 60-76`, `findDisallowedFields:96-107`. depth 3 이상은 여전히 참조 복사 — 아래 신규-4 참조                                                                                                                                               |
| 5   | **고쳐짐**                    | `assertNoPii.ts:121-135`(숫자·키 검사, `path` 기록). 키 오탐은 없음(아래 근거)                                                                                                                                                                                        |
| 6   | **코드 고쳐짐 / 문서 미수정** | 코드: `summarizeAttendance.ts:28-30,66`·`assistToolRegistry.ts:31-34`. 문서: 계획서에 `sick` 3곳 잔존                                                                                                                                                                 |
| 7   | **고쳐짐**                    | `screenAssistInput.ts:94, 147-157`. 강등이지 삭제 아님, 인접 판정 정확(아래)                                                                                                                                                                                          |
| 8   | **미흡**                      | "13곳 전부 수정" 은 사실이 아님 — 최소 3+2곳 잔존(신규-2·5)                                                                                                                                                                                                           |

## 새 결함

**[중간] UUID 학급 id 가 전화번호 패턴에 걸려 `list_classes` 가 영구 차단될 수 있다**
`src/domain/services/assistToolRegistry.ts:51` 이 `id` 를 내보내고, 실제 id 는 UUID v4 (`src/adapters/stores/useTeachingClassStore.ts:288` → `src/infrastructure/utils/uuid.ts:5`)입니다. 구조화 필드는 `phone: true` 이고(`assertNoPii.ts:30`), 전화 정규식의 경계가 `(?<![\d-])` 라 **앞이 16진수 문자면 통과**합니다(`src/domain/privacy/maskRules.ts:31`).

실측 30만 개 중 717개(0.24%)가 매치했습니다. 실제 샘플:

```
a4755b0f-69b8-4b05-9129-3171a4a53e17  ->  05-9129-3171
4ab33394-53d7-4b46-b055-98416693eab5  ->  055-98416693
```

학급당 0.24%, 걸리면 그 id 는 **결정론적으로 매번** 걸리므로 해당 교사는 `list_classes` 를 영구히 못 씁니다. 1차 치명 결함과 **같은 부류(오탐이 기능을 죽인다)** 이고, 새 파이프라인 테스트가 `id: 'c1'`(`assistPipeline.fixture.test.ts:99`)을 쓰기 때문에 구조적으로 못 잡습니다. 해법 후보: 레지스트리에 `opaqueFields`(패턴 검사 제외) 선언 / `id` 반환 제거 / 경계를 `(?<![\dA-Za-z-])` 로(단 `maskRules` 는 쿨메신저와 공유라 파급 확인 필요).

**[중간] 계획서에 `sick` 3곳 잔존 — Phase 2 통신 규격 예시 포함**
`docs/01-plan/features/in-app-chatbot-zen.plan.md:242`(§4.2 화이트리스트), `:278`(§4.2.2), **`:1056`(요청 JSON 예시)**. `classAbsence` 는 계획서에 0회 등장합니다. 레지스트리 주석이 "계획서 §4.2 의 화이트리스트" 를 근거로 삼는데 그 근거 문서가 다른 값을 말하고 있고, `:1056` 은 Phase 2 Edge Function 이 그대로 베낄 자리입니다. 게다가 `.omc/prd-ssampin-ai.json` US-006 수용 기준 3번("반환 스키마가 계획서 §4.2 화이트리스트와 **정확히 일치**한다")이 지금 문자 그대로 거짓이 됐습니다.

**[중간] `address` 는 자유 입력 필드에서도 꺼져 있는데 계획서는 차단한다고 적혀 있다**
`assertNoPii.ts:34,43` 둘 다 `address: false`. 반면 `plan.md:1475` 는 assertNoPii 테스트 목록에 "전화·주민번호·이메일·**생년월일·주소** 각각 / 명단 이름 잔존 시 **차단(예외)**" 이라고 적혀 있습니다. 즉 (a) 주소가 자유 입력 제목에서 그냥 통과하고, (b) 같은 문서 `:1266` 은 "예외로 흐름을 끊지 않는다" 라 자체 모순입니다. 주소 정규식은 시/도+구/군+로/길+번지 체인을 요구해 오탐이 낮으므로 FREE_TEXT 에는 켜는 쪽이 계획과 맞습니다. Phase 3의 `get_my_schedule.place` 가 오면 더 커집니다.

**[중간] 자유 입력 필드 선언 누락을 잡는 불변식이 없다**
`freeTextFields` 도입으로 생년월일 검사가 **키 이름 기반 옵트인**이 됐는데, 계약 테스트는 `get_my_todos`/`count_students` 만 하드코딩 검사합니다(`assistToolRegistry.contract.test.ts:40-49`). 누가 `get_my_schedule: {items:[{time,title,place}]}` 를 `freeTextFields: []` 로 추가해도 **아무 테스트도 빨간불이 안 됩니다.** 1차에서 지적된 "사람이 기억하는 설계는 6개월 뒤 무너진다" 가 여기로 이동했습니다. 권고: `title|memo|content|note|place|reason|description` 류 키가 resultFields/nestedFields 에 있으면 freeTextFields 선언을 강제하는 계약 테스트.

**[낮음] depth 3 이상은 재구성도 검사도 안 된다**
`sanitizeToolResult.ts:44-50` 은 한 단계만 `pick` 합니다. 지금 5종은 depth-2 잎이 전부 스칼라라 실제 문제는 **없습니다**(집계 함수 5개 반환 타입으로 확인). 다만 `pick` 이 값을 참조 복사하므로, 원본이 `due: {date, timeZone}` 같은 객체가 되면 통째로 나가고 `findDisallowedFields:96-107` 도 잡지 못합니다. 타입(`ToolResultValue`)이 중첩 객체를 허용하므로 컴파일도 막지 않습니다.

**[낮음] PRD 수용 기준이 구현과 반대로 남아 있다**
`.omc/prd-ssampin-ai.json` US-005 기준 3번: "'예방' 이 **함께 있으면** 심각 판정을 **건너뛴다**(자살예방교육 → 통과)". 이번 수정은 정확히 이 문장을 폐기하고 인접 강등으로 바꿨습니다(evidence 란에만 기록). 다음 세션이 AC 를 기준으로 검증하면 **고친 것을 되돌립니다.**

**[낮음] 테스트 파일 안의 낡은 주장**
`src/domain/services/__tests__/sanitizeToolResult.test.ts:72` — `it('중첩 값은 그대로 옮긴다 — 재구성은 얕은 화이트리스트다')`. 지적 4번이 폐기한 문장이 그물 ②의 테스트 제목으로 살아 있습니다(데이터가 이미 깨끗해서 통과할 뿐).

**[낮음] 상태 기록 불일치**
계획서 Phase 1 인수 조건 11개 중 9개가 아직 `[ ]`(`plan.md:1262-1272`)인데 PRD 는 US-001~008 전부 `passes:true`. 워크로그 검증표도 "12파일·83건"(`ssampin-ai.worklog.md`) — 지금은 13파일·95건입니다.

## 검증 항목별 답

**2-a. birth 를 끈 게 실제 위험을 놓치는가** — 지금 스키마에서는 아닙니다. 구조화 문자열 필드는 `date`·`className`·`period`·`due`·`category`·`id`·`name` 뿐이고, 학생 생년월일이 들어올 경로가 레지스트리에 없습니다(학생 단위 도구 자체가 0종). 그리고 **이름 대조(keyword)는 구조화 필드에서도 계속 켜져 있어** 실명 유출은 그대로 막힙니다. 다만 안전이 "레지스트리를 짜는 사람이 freeTextFields 를 안 빠뜨림" 에만 걸려 있는 게 문제입니다(신규-4).

**2-b. depth 2 한계** — 현재 스키마에서는 문제 없음(위 낮음 항목).

**2-c. `startsWith(suffix, end)` 정확한가 · 우회 가능한가** — 판정 자체는 정확합니다. `자살예방`만 강등, `자살 예방`(띄어쓰기)은 심각 유지 → 보수적 방향입니다. 강등돼도 finding 은 남아 화면에 표시되고, 이 층은 애초에 차단하지 않으므로 "우회해서 얻는 것" 이 없습니다. `자해예방 차원에서 자해 사실을` 처럼 두 번 나오면 두 번째는 심각 유지되는 것도 확인했습니다(`screenAssistInput.ts:141-159` 의 매 occurrence 판정 구조).

**2-d. 키 검사 오탐** — 없습니다. 키는 전부 ASCII 식별자(`items`·`title`·`due`·`byCategory`…)이고 명단 값은 2자 이상 한글이라 부분 일치가 성립하지 않습니다. 다만 **숫자 검사** 쪽에 잠복 오탐이 있습니다: 13자리 정수는 rrn 정규식에 걸리는데, epoch ms 는 7번째 자리가 1~8 이면 매치라 실측 **1000개 중 800개**가 걸렸습니다. 지금 스키마에 13자리 숫자가 없어 발현되지 않을 뿐이니, `updatedAt`·`timestamp` 류 필드를 추가하는 순간 그 도구가 죽습니다.

**3. 파이프라인 테스트가 진짜 증명하는가** — 예. tautology 아닙니다. 이 파일을 지우면 **1번 치명 결함이 그대로 되살아납니다**: 다른 어떤 테스트도 "구조화 날짜가 관문을 통과하는지" 를 보지 않습니다(`assertNoPii.test.ts:69-80` 의 정상 픽스처에는 날짜 필드가 없음). 중첩 재구성 실증(`:156-173`)도 이 파일에만 있습니다. 약한 부분 두 곳: ① `:110-115` 의 "모든 도구가 빈 결과에서 통과" 는 `{}` 라 원리적으로 실패할 수 없는 준-공허 테스트(도구별 대표 픽스처로 바꿔야 의미 생김), ② `id: 'c1'` 처럼 **실제 데이터 모양이 아닌 픽스처**가 신규-1 을 가립니다.

**4. 문서 자기모순** — §5.7 계열은 전환 배너·매핑표가 잘 붙어 대체로 정합합니다(24 개념 vs 32 단어 불일치도 `input-guard.design.md:130-133` 에서 명시적으로 해소). ADR-061 결정 7-4 보정도 코드와 일치합니다. 남은 모순은 위 신규-2·3·6, 그리고 `plan.md:843` §5.7.3-a 제목이 아직 "**차단** 키워드 초안(24개) — 오너 확정 **대기**" 이고 설계 규칙 1번이 "허용목록이 차단목록보다 먼저 평가된다" 인 점(Q9 는 `:1774` 에서 해소됐다고 적혀 있어 문서 내에서 엇갈립니다).

**5. PRD US-001~008** — US-001·002·003·004·007 은 수용 기준과 코드가 일치합니다. **US-005 기준 3번**과 **US-006 기준 3번**은 위와 같이 지금 구현과 어긋납니다. US-008 evidence 의 "전체 테스트 실패 0" 도 이번 세션 실행 결과와 다릅니다(아래).

## 제시하신 두 판단에 대한 확인

- **`coolMessagePii.ts:136` 타입 오류** — 지금은 **오류가 없습니다.** 방금 `npx tsc --noEmit` 를 돌렸고 **출력 0줄(에러 0)** 입니다. 해당 위치는 `if (found.kind !== 'phone' && ...) continue;` 로 좁히기가 들어가 있어 이미 해소된 상태입니다. "무관하다" 는 판단 자체는 맞습니다(그 파일은 `maskRules`·`types` 만 import). 다만 워크로그의 "tsc 전체가 빨간불이다" 는 **현재 사실이 아니므로** 그 문단은 지워야 합니다.
- **SyncSubscribers 실패** — 판단 맞습니다. 그 메타 테스트는 `src/usecases/sync/__tests__/SyncSubscribers.test.ts:33-42` 에서 `App.tsx` 를 읽어 `STORE_SUBSCRIBE_MAP` 과 대조하고, `git diff src/App.tsx` 에 다른 세션의 `useStaffContactStore` / `'staff-contacts'` 추가가 실제로 들어와 있습니다(+10줄). `grep -rn "assist" src/usecases/sync/` 는 **0건**입니다. assist 와 무관한 타 세션 경합이 맞습니다.

## APPROVED 로 가려면 (전부 작은 작업)

1. `list_classes` 의 불투명 id 를 패턴 검사에서 제외하거나 `id` 반환을 없앨 것 + **UUID 를 쓰는 파이프라인 테스트** 추가(`id: 'c1'` 탈피). 회귀 고정으로 위에 붙인 실패 UUID 2개를 그대로 픽스처에 쓰면 됩니다.
2. `plan.md:242, 278, 1056` 의 `sick` → `classAbsence` (특히 `:1056` Phase 2 예시).
3. `plan.md:1475` 의 주소·예외 서술을 코드와 맞추거나, FREE_TEXT_PATTERNS 에 `address: true` 를 켤 것(둘 중 하나를 선택하고 그 근거를 주석에 남길 것).
4. `.omc/prd-ssampin-ai.json` US-005 기준 3번 · US-006 기준 3번 갱신.
5. freeTextFields 선언 누락을 잡는 계약 테스트 1건.

참고 파일: `E:\github\ssampin\src\domain\rules\assertNoPii.ts` · `E:\github\ssampin\src\domain\services\assistToolRegistry.ts` · `E:\github\ssampin\src\domain\services\sanitizeToolResult.ts` · `E:\github\ssampin\src\domain\rules\screenAssistInput.ts` · `E:\github\ssampin\src\usecases\assist\__tests__\assistPipeline.fixture.test.ts` · `E:\github\ssampin\src\domain\privacy\maskRules.ts` · `E:\github\ssampin\docs\01-plan\features\in-app-chatbot-zen.plan.md` · `E:\github\ssampin\.omc\prd-ssampin-ai.json`
