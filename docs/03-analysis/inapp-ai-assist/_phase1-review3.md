판정: APPROVED

---

## 수정 항목별 판정

| #                          | 판정               | 근거                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 신규-1 UUID/`opaqueFields` | ✅ 실제로 됨       | `AssistTool.ts:59-72` 타입 선언 · `assistToolRegistry.ts:53-54` `opaqueFields:['id']` · `assertNoPii.ts:132-137` opaque 분기(이름 대조는 유지) · `assistPipeline.fixture.test.ts:119-125` UUID 2개 고정. **두 UUID 모두 phone 정규식에 실제로 매치함을 직접 확인**(`05-9129-3171`, `055-98416693`) — 픽스처가 하중을 견딘다 |
| 신규-2 `sick` 3곳          | ✅                 | `plan.md:242`(원안 삭제 사유만 서술) · `:278`(필드 판정표) · `:1061`(Phase 2 요청 JSON) 전부 `classAbsence`. `sick` 잔존은 "뺐다"는 설명 문장 1곳뿐                                                                                                                                                                         |
| 신규-3 `address`           | ✅                 | `assertNoPii.ts:45-51` `address:true` · `:33-35` 구조화는 false 유지 · `plan.md:1480` 갱신됨                                                                                                                                                                                                                                |
| 신규-4 불변식 2건          | ⚠️ 됐으나 약함     | `contract.test.ts:60-79`, `:81-93` 존재하고 동작한다. 다만 **필드명 휴리스틱이라 새 도구에는 안 통한다** — 아래 결함 1·2                                                                                                                                                                                                    |
| 신규-5 depth 3             | ✅ **판단이 맞다** | 현 레지스트리의 중첩 허용 필드가 전부 스칼라(`:51` id/name/grade/classNum, `:62` category/count, `:73` title/due/done)라 depth 3 객체가 물리적으로 존재할 수 없다. 단 **그걸 지키는 불변식이 없다** — 결함 3                                                                                                                |
| 신규-6 PRD US-005/006      | ✅                 | `prd-ssampin-ai.json:86`(강등·바로 뒤), `:103`(classAbsence) 구현과 일치                                                                                                                                                                                                                                                    |
| 테스트 제목                | ✅                 | `sanitizeToolResult.test.ts:72`                                                                                                                                                                                                                                                                                             |
| `{}` → 대표 픽스처         | ✅                 | `assistPipeline.fixture.test.ts:110-144`, 도구 누락 시 실패하는 가드(`:137`)까지 있음                                                                                                                                                                                                                                       |
| 2-d 숫자 미검사            | ✅ 타당            | `assertNoPii.ts:143-151`. 근거 주석 확인. **결정 자체는 타당**(아래 확인 방법) — 단 회귀 테스트 없음(결함 5)                                                                                                                                                                                                                |
| 상태(체크박스·worklog)     | ⚠️ 지적함          | 결함 8                                                                                                                                                                                                                                                                                                                      |

이미 확인된 사실 반증: 없음. `npx tsc --noEmit` **exit 0**, Phase 1 테스트 **13파일 97건 통과** 직접 재실행 확인.

---

## 2번(새 구멍) 항목별 — 어떻게 확인했는가

**(a) `opaqueFields` 로 UUID 패턴 검사를 끈 것이 실제 위험을 놓치는가 → 놓치지 않는다**

1. **id 출처 전수 추적**: `E:\github\ssampin\src\adapters\stores\useTeachingClassStore.ts:288, 304, 384, 497` — 학급 id 생성은 4곳 전부 `generateUUID()`. `E:\github\ssampin\src\infrastructure\utils\uuid.ts:5-15` 는 `crypto.randomUUID()`/`getRandomValues` 기반. **외부(엑셀·나이스·컴시간 import)에서 id 문자열을 받아 그대로 쓰는 경로는 0건.** 사람이 읽는 정보가 들어올 통로가 없다.
2. **범위 확인**: 재구성 후 `id` 라는 키가 살아남는 도구는 `list_classes` 하나뿐(`assistToolRegistry.ts:51`). 다른 도구는 `id` 를 화이트리스트에 안 넣었다.
3. **방어 잔존 확인**: `assertNoPii.ts:135` 는 `NO_PATTERNS` 여도 `detectKeywords(node, nameGroups)` 를 그대로 돈다 — id 에 명단 이름이 들어가면 **여전히 차단된다.** 즉 끈 것은 "형태 판정"뿐이고 "명단 대조"는 살아 있다.

**(b) 숫자 패턴 검사 완전 차단이 타당한가 → 타당하다**

1. **살아남는 숫자 필드 전수 확인**: `assistToolRegistry.ts:34,42,51,62,73` → `present/absent/late/early/classAbsence/count/total/grade/classNum` — **전부 집계값 또는 학년·반 번호.** 개인을 지목하는 숫자(학번·전화)를 담는 필드가 화이트리스트에 하나도 없다.
2. **숫자화 시 방어가 실제로 무의미한지 확인**: 전화번호를 number 로 담으면 `01099998888` → `1099998888` 로 앞 0 이 소실되고, phone 정규식은 `(01[016-9]|0\d{1,2})` 로 시작하므로 **어차피 안 걸린다.** 주민번호도 앞자리 0 이면 동일. 숫자에는 이름도 담기지 않는다 → 주석 근거가 실제와 일치.
3. **오탐 쪽 실측 확인**: 13자리 epoch 가 rrn 정규식(`\d{6}[-\s]?[1-8]\d{6}`)에 걸린다는 지적은 구조상 맞다(`maskRules.ts:20`).

**(c) `address:true` 가 자유 입력에서 오탐을 만드는가 → 우려한 모양("3층 교무실")은 오탐이 아니다**
`maskRules.ts:56` 의 주소 정규식은 **시/도 + (시|군|구) + (로|길|동|읍|면|리) + 번지**를 전부 요구한다. 후보 문장 7개를 실제로 돌렸다:

- `"3층 교무실 회의"` → **매치 없음** · `"부산 출장 3일"` → **매치 없음** · `"경기 성남 분당구 정자동 178 회의"` → **매치 없음**(`성남`에 시/군/구 접미사가 없어 체인이 끊김)
- `"서울 강남구 테헤란로 152 방문"`, `"경북 안동시 육사로 21 연수"` → 매치. **이건 정탐**(실제 주소)이나 결과 전체가 막힌다 → 결함 7과 결합.
- 별건으로 **birth 6자리가 자유 입력에서 오탐한다**: `"2교시 준비물 100301"` → `100301` 매치. 공문번호·문서번호가 제목에 들어가면 할 일 도구가 통째로 막힌다(결함 7이 해소되면 대가가 작아진다).

**(d) 새 계약 테스트 2건이 우회 가능한가 → 가능하다. 단 기존 5종은 별도 픽스처가 막는다**

- `contract.test.ts:63` 정규식에 후보 18개를 실제로 돌린 결과 `absentReason`·`statusNote`·`memoText`·`summary`·`comment`·`사유`·`freeText` **전부 false**(결함 1).
- `contract.test.ts:81-93` 은 opaqueFields 가 **실재 필드인지**만 본다 — `opaqueFields:['title']` 처럼 자유 입력 필드를 지목하는 것을 막지 않는다(결함 2).
- 다만 **역추적 결과 기존 5종은 다른 테스트가 막는다**: `absentReason` 을 resultFields 에 넣으면 `sanitizeToolResult.test.ts:39` 가 빨간불, `opaqueFields:['title']` 을 넣으면 `assistPipeline.fixture.test.ts:157-164`(제목 속 전화번호)가 빨간불. **구멍은 "앞으로 추가될 도구"에만 열려 있다.** 그래서 반려 사유로 올리지 않았다.

---

## 새 결함

| #   | 심각도 | 위치                                                                                               | 내용                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 중간   | `src/domain/services/__tests__/assistToolRegistry.contract.test.ts:63`                             | `FREE_TEXT_LIKE` 가 **소문자 단일 단어 정확 일치**뿐이라 `absentReason`·`statusNote`·`memoText`·`summary` 를 못 잡는다. 하필 자기네 함정 픽스처가 쓰는 이름(`sanitizeToolResult.test.ts:29`)이 통과한다. **권고: 이름 추측을 버리고 전수 분류 강제** — resultFields·nestedFields 의 모든 필드가 `freeTextFields`/`structuredFields`/`opaqueFields` 중 **정확히 하나**에 속하는지 검사(누락 = 컴파일 아닌 테스트 실패). 대가: 선언이 늘어난다. 이득: 이름 규칙에 의존하지 않는다                                                                                   |
| 2   | 중간   | `src/domain/rules/assertNoPii.ts:133-137`                                                          | `opaqueFields` 가 `freeTextFields` 를 **덮는다**(opaque 분기가 먼저 return). 교집합 금지 불변식이 없다. **결함 7의 오탐을 만난 미래 세션의 최단 우회가 정확히 이것**이다 — `opaqueFields:['title']` 한 줄. 기존 도구는 파이프라인 테스트가 막지만 새 도구는 안 막힌다. 권고: 계약 테스트에 `opaqueFields ∩ freeTextFields === ∅` 추가(1줄)                                                                                                                                                                                                                        |
| 3   | 중간   | `assistToolRegistry.contract.test.ts:54`                                                           | `nestedFields` 강제가 `['items','classes','byCategory']` **필드명 3개 하드코딩**. 새 도구가 `entries`·`rows`·`list` 를 쓰면 강제되지 않고 depth 1 이 그대로 뚫린다. **신규-5(depth 3)와 같은 뿌리다.** 권고: 이미 있는 `REAL` 픽스처(`assistPipeline.fixture.test.ts:113`)를 재사용해 "재구성 결과를 순회했을 때 ①`nestedFields` 선언 없는 중첩 객체가 남으면 실패 ②depth 3 객체가 있으면 실패"로 바꾸면 3과 신규-5 가 한 번에 닫힌다                                                                                                                             |
| 4   | 중간   | `docs/01-plan/features/in-app-chatbot-zen.plan.md:808` ↔ `src/domain/rules/assertNoPii.ts:104-110` | **입력창 경로의 패턴 정책이 미확정.** 계획서 표는 "입력의 전화·주민번호·이메일·**주소** = 차단"인데 **생년월일은 그 행에 없다.** 그런데 그 자리에 쓸 수 있는 유일한 함수 `checkOutboundText` 는 `FREE_TEXT_PATTERNS` 를 써서 **birth 를 켠다.** Phase 3 에서 그대로 붙이면 `"2026-08-25 일정 알려줘"` 가 차단된다 — **1차 치명 결함과 똑같은 모양이 입력 경로에 잠복.** `ssampin-ai.input-guard.design.md` 에는 패턴 언급이 **0줄**이라 근거가 계획서 한 줄뿐이다. Phase 3 착수 전에 "입력창은 어느 함수·어느 PatternConfig 인가"를 문서와 코드 양쪽에 못 박을 것 |
| 5   | 낮음   | `src/domain/rules/assertNoPii.ts:143-151`                                                          | 숫자 미검사 결정에 **회귀 테스트가 없다**(주석뿐). 다른 6개 결정은 전부 실증 테스트가 붙어 있는데 이것만 없다. `checkOutboundValue({ updatedAt: 1787303036913 }).blocked === false` 한 줄이면 재도입을 막는다                                                                                                                                                                                                                                                                                                                                                     |
| 6   | 낮음   | `docs/.../in-app-chatbot-zen.plan.md:404`                                                          | §4.4 그물 ③ 본문은 아직 "패턴 검사: phone·rrn·email·birth·address" + "하나라도 걸리면 차단"으로만 적혀 있다. 필드별 차등(구조화 birth off · opaque · 숫자 제외)은 §10.1(`:1480`)에만 반영됐다. **정본 설명 절과 테스트 절이 서로 다른 말을 한다**                                                                                                                                                                                                                                                                                                                 |
| 7   | 낮음   | `docs/.../in-app-chatbot-zen.plan.md:293-294` ↔ `assertNoPii.ts:168`                               | §4.2.2 는 `get_my_todos.title` 이 걸리면 "**필드만 비운다**(`title:null`+`titleRedacted:true`)"인데, 구현은 **결과 전체를 `blocked`** 로 되돌린다. (c)에서 실측한 주소·6자리 오탐이 여기에 걸리면 할 일 카드가 통째로 사라진다. `hits[].path` 가 있어 구현은 가능하나 Phase 1 에 API 도 테스트도 없다 → Phase 2 인수 조건으로 명시 필요                                                                                                                                                                                                                           |
| 8   | 낮음   | `docs/.../in-app-chatbot-zen.plan.md:1264-1274`                                                    | 체크박스 11개 중 9개 미체크. **다만 전부 켜면 안 된다** — `sanitizeToolResult 를 거치지 않은 객체는 중계 호출 타입이 거부한다`는 **아직 거짓**이다. `ModelSafe<T>` 를 소비하는 자리가 0곳(전 코드 grep: `sanitizeToolResult` 호출부 = 테스트뿐). 즉 **그물 ②의 컴파일 강제는 Phase 2 전까지 공허하다.** 이 항목만 "Phase 2 로 이월"로 표기하고 나머지 8개를 체크할 것                                                                                                                                                                                             |
| 9   | 낮음   | `.omc/prd-ssampin-ai.json:143-151, 45, 80, 140`                                                    | `reviewRounds` 에 **2차(REJECTED·6건)가 없다.** US-002 evidence "7건"(실제 9건) · US-005 제목 "키워드 24개"(본문은 32) · US-008 evidence "5932건"(worklog 는 6,086) — 수치 3건 낡음                                                                                                                                                                                                                                                                                                                                                                               |

---

## 참고 파일

- `E:\github\ssampin\src\domain\entities\AssistTool.ts`
- `E:\github\ssampin\src\domain\services\assistToolRegistry.ts`
- `E:\github\ssampin\src\domain\services\sanitizeToolResult.ts`
- `E:\github\ssampin\src\domain\rules\assertNoPii.ts`
- `E:\github\ssampin\src\domain\privacy\maskRules.ts` (정규식 정본)
- `E:\github\ssampin\src\usecases\assist\__tests__\assistPipeline.fixture.test.ts`
- `E:\github\ssampin\src\domain\services\__tests__\assistToolRegistry.contract.test.ts`
- `E:\github\ssampin\src\infrastructure\utils\uuid.ts` · `E:\github\ssampin\src\adapters\stores\useTeachingClassStore.ts`
- `E:\github\ssampin\docs\01-plan\features\in-app-chatbot-zen.plan.md` · `E:\github\ssampin\.omc\prd-ssampin-ai.json`

**승인 조건 아님(권고 순서)**: Phase 2 착수 전 결함 4 → 2 → 3 → 1, 문서 6·8·9 는 같은 작업 단위에서 정리. 결함 7 은 Phase 2 인수 조건에 넣으면 (c)의 오탐 대가가 함께 작아진다.
