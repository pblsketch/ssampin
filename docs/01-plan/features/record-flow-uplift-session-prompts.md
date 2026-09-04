# 생기부 흐름 고도화 — 병렬 세션 시작 프롬프트 (T1~T5, T6)

- 모델: Opus 5 · 첫 명령: `/ralplan` (합의 계획 → 승인 후 구현)
- 전제: **T0(공통 기반)이 main 에 커밋된 뒤** 연다. `git log --oneline -5` 에 `feat(생기부 기반)` 커밋이 보여야 한다.
- 각 프롬프트는 그대로 복사해 새 세션 첫 입력으로 붙여 넣는다.

---

## 공통 머리말 (모든 프롬프트 맨 위에 이미 포함돼 있음)

```
너는 쌤핀(E:\github\ssampin, main 단일 워킹트리) 병렬 세션 중 하나다. 다른 세션 4개가 같은 트리에서 동시에 일한다.
정본 문서 두 개를 먼저 읽어라:
  1) docs/01-plan/features/record-flow-uplift-program.plan.md — §2 내 작업 범위, §3 파일 소유권, §7 하지 않는 것
  2) docs/03-analysis/record-draft-flow-v2-inquiry-thread.analysis.md — 왜 이걸 만드는지(좋은 세특 기준 K1~K14)
철칙:
  - §3 소유권 표에서 내 작업(T?)이 소유한 파일만 고친다. 소유 밖 파일이 필요하면 고치지 말고 계획서 §6 "소유 밖 파일 요청"에 한 줄 적는다.
  - 시작 전 git status --short 로 남의 변경을 확인하고 건드리지 않는다. 브랜치·워크트리·PR 만들지 않는다.
  - 커밋은 항상 한 줄 경로 지정: git add <paths> && git commit -m "..." -- <paths>. git add -A / git commit -a 금지.
  - UI 변경은 프론트엔드 디자인 에이전트와 함께 정한다(단독 결정 금지). 하드코딩 HEX 금지, sp-* 토큰, 라운드는 Tailwind 기본 키만.
  - domain/ 은 외부 import 금지, any 금지, 모든 UI 텍스트 한국어.
  - 게이트 4종(npx tsc --noEmit / npm run lint / npm run test / npm run regression-check)을 통과한 범위를 명시하고 끝낸다. 실행한 명령과 핵심 출력을 적는다.
  - 생기부 프롬프트 원문·측정 하네스는 저장소에 넣지 않는다(저장소가 PUBLIC, ADR-072 결정 1).
  - 선생님에게 AI 비용을 지우는 방식 금지. AI가 생기부 문장을 짓는 기능 금지(보조까지만). 게이미피케이션·점수판 금지.
  - 끝나면 PROGRESS.md 에 내 작업(T?) 항목만 추가한다(다른 항목 수정 금지).
```

---

## T1 — 말로 남기기(STT)

```
너는 쌤핀(E:\github\ssampin, main 단일 워킹트리) 병렬 세션 중 하나다. 다른 세션 4개가 같은 트리에서 동시에 일한다.
정본 문서 두 개를 먼저 읽어라:
  1) docs/01-plan/features/record-flow-uplift-program.plan.md — §2 T1 범위, §3 파일 소유권, §7 하지 않는 것
  2) docs/03-analysis/record-draft-flow-v2-inquiry-thread.analysis.md — 특히 §6 STT(6-2 확인된 제약, 6-3 채택안)
철칙:
  - §3 소유권 표에서 T1 이 소유한 파일만 고친다. 소유 밖 파일이 필요하면 고치지 말고 계획서 §6 "소유 밖 파일 요청"에 한 줄 적는다.
  - 시작 전 git status --short 로 남의 변경을 확인하고 건드리지 않는다. 브랜치·워크트리·PR 만들지 않는다.
  - 커밋은 항상 한 줄 경로 지정: git add <paths> && git commit -m "..." -- <paths>. git add -A / git commit -a 금지.
  - UI 변경은 프론트엔드 디자인 에이전트와 함께 정한다. 하드코딩 HEX 금지, sp-* 토큰, 라운드는 Tailwind 기본 키만.
  - domain/ 은 외부 import 금지, any 금지, 모든 UI 텍스트 한국어.
  - 게이트 4종(npx tsc --noEmit / npm run lint / npm run test / npm run regression-check)을 통과한 범위를 명시하고 끝낸다.
  - 선생님에게 AI 비용을 지우는 방식 금지. 게이미피케이션 금지.
  - 끝나면 PROGRESS.md 에 T1 항목만 추가한다.

작업 T1 — 말로 남기기. 목표: 엔진을 넣지 않고, OS 가 이미 가진 받아쓰기를 쌤핀에서 쉽게 쓰게 한다.
확정된 사실(다시 조사하지 말 것): Windows 받아쓰기(Win+H)는 한국어 지원·인터넷 필수(Azure). 이 PC 에 오프라인 한국어 인식기 없음.
"음성 입력 시작 도구" 설정을 켜면 글자 칸 클릭 시 OS 가 마이크를 띄운다. 브라우저 Web Speech API 는 Electron 에서 동작하지 않고 모바일 크롬·사파리에서는 동작한다.
제외(오너 결정): 앱 자체 청취(WinRT)·로컬 STT 엔진 동봉·외부 유료 STT.

만들 것:
  1. electron/ipc/voiceTyping.ts(신규) + preload 노출: 렌더러 요청 → 메인이 PowerShell 로 Win+H 키 입력을 보낸다(Windows 전용, macOS 는 받아쓰기 단축키 안내 문구 반환). 쉘 인젝션 여지 0(인자 없음). 실패는 한국어 메시지로 돌려준다.
  2. 마이크 버튼 3곳: ObservationForm.tsx(데스크톱 관찰 입력) · Reminder/ReminderPopup.tsx(수업 직후 알림) · SidePin/SidePinMemoEditor.tsx(옆핀). 누르면 그 칸에 커서를 두고 1 을 부른다. 첫 1회 안내: "설정 → 음성 입력 시작 도구를 켜면 글자 칸을 클릭할 때 마이크가 저절로 나타납니다."
  3. 모바일 src/mobile/components/Class/ObservationSheet.tsx: 시트 열 때 글자 칸 자동 커서 + 마이크 버튼 → useSpeechInput 훅(Web Speech, ko-KR, 연속·중간 결과를 칸에 실시간 반영, 미지원 브라우저면 버튼 숨김, 권한 거부 시 한국어 안내).
  4. 구조화: 말로 쓴 긴 글(여러 학생이 섞임: "3번은 …했고 12번은 …")을 쌤핀 AI 의 기존 add_observation 도구(ADR-074)에 태워 학생별 미리보기 카드로 나누는 진입점을 Assist 쪽(AssistDockContainer / executeAssistWrite)에 추가한다. 새 도구를 만들지 않는다. 모델은 나누고 옮길 뿐 관찰문을 짓지 않는다. 여러 학생 = 카드 여러 장, 각각 [실행]. 쌤핀 AI 가 실험실에서 꺼져 있으면 이 진입점은 숨긴다.
  5. 설정 고지 한 줄: "음성은 OS 제조사(마이크로소프트·구글·애플) 서버에서 글자로 바뀝니다." 위치는 디자인 에이전트와 정한다.
수용 기준: 데스크톱 관찰 칸에서 버튼 → Win+H 패널이 그 칸 위에 뜬다 / 모바일 시트에서 버튼 → 말한 글자가 칸에 쌓인다 / 여러 학생 섞인 글 → 학생별 카드 N장, 이름은 별칭으로 가려져 나간다(회귀 #57 가드 통과) / 미지원 환경에서 조용히 숨김.
실기기 확인 항목(코드로 못 잡음, 끝에 목록으로 남길 것): Win+H 첫 실행 시 OS 동의 화면, 아이폰 홈 화면 설치(PWA) 상태의 Web Speech.
electron 메인/preload 를 바꾸므로 node scripts/build-electron.mjs 후 electron:dev 재시작이 필요하다는 점을 기억하라.
/ralplan 으로 시작해 계획 합의 후 구현하라.
```

---

## T2 — 근거 창고 주제 분류 + 탐구 흐름 화면 (핵심)

```
너는 쌤핀(E:\github\ssampin, main 단일 워킹트리) 병렬 세션 중 하나다. 다른 세션 4개가 같은 트리에서 동시에 일한다.
정본 문서 두 개를 먼저 읽어라:
  1) docs/01-plan/features/record-flow-uplift-program.plan.md — §2 T2 범위, §3 파일 소유권, §7 하지 않는 것
  2) docs/03-analysis/record-draft-flow-v2-inquiry-thread.analysis.md — §2 좋은 세특 기준 K1~K14, §3 갭, §5 전체(특히 5-3-b 창고에서 묶기, 5-3-c 루브릭)
철칙:
  - §3 소유권 표에서 T2 가 소유한 파일만 고친다. evidenceImport.ts 는 T5 소유라 읽기만 한다. 소유 밖 파일이 필요하면 계획서 §6 에 요청만 적는다.
  - 시작 전 git status --short 로 남의 변경을 확인하고 건드리지 않는다. 브랜치·워크트리·PR 만들지 않는다.
  - 커밋은 항상 한 줄 경로 지정: git add <paths> && git commit -m "..." -- <paths>. git add -A 금지.
  - UI 변경은 프론트엔드 디자인 에이전트와 함께 정한다(주제 열·흐름 화면은 반드시). 하드코딩 HEX 금지, sp-* 토큰, 라운드는 Tailwind 기본 키만. 사이드바 안 모달은 createPortal.
  - domain/ 은 외부 import 금지, any 금지, 모든 UI 텍스트 한국어.
  - 게이트 4종 통과 범위를 명시하고 끝낸다. 브릿지 레포(E:\github\ssampin-ai-bridge, master)를 고치면 그쪽 typecheck·test 도 돌린다. 동봉 번들(electron/ai-bridge/index.mjs)은 재생성하지 않는다(T6 가 마지막에 한 번).
  - AI 가 흐름을 자동 생성하지 않는다. 흐름을 필수로 만들지 않는다. 담임 행특에는 적용하지 않는다. 인앱 [AI 초안] 버튼은 만들지 않는다(Phase 4). 점수판·순위·누적 점수 금지 — "미분류 N건" 같은 빈 칸 표시까지만.
  - 끝나면 PROGRESS.md 에 T2 항목만 추가한다.

작업 T2 — 근거 창고 주제 분류 + 탐구 흐름. 목표: 관찰·과제·평가 낱장을 "주제(탐구 흐름)" 단위로 묶어, 초안이 활동 나열이 아니라 하나의 서사가 되게 한다.
T0 가 이미 만들어 둔 것(있는지 확인하고 그 위에서 시작): src/domain/entities/InquiryThread.ts, useInquiryThreadStore(뼈대), ObservationRecord.threadId? · RecordEvidence.threadId?, src/domain/rules/topicKeywordSources.ts(시그니처), 동기화·보관함 등록, 브릿지 normalizeRecord 화이트리스트.
현재 상태(확인됨): RecordEvidenceView.tsx 의 분류 축은 생기부 영역 탭 + 미분류 탭뿐이고 "주제" 축이 없다. 루브릭 채점→근거 끌어오기는 이미 된다(요소·수준·설명·메모·총평, 점수 제외).

만들 것:
  1. RecordEvidenceView.tsx: 영역 탭 안에 주제 열 — 미분류 | 주제 A | … | + 새 주제. 근거를 체크해 "주제로 묶기" 또는 끌어다 놓기(dnd-kit 이미 사용 중). "미분류 N건" 배지.
  2. 새 주제 이름 후보(오너 결정 순서): ① 수행평가 이름(AssessmentPlanItem.title · Rubric.title) ② 과제 제목 ③ 성취기준 키워드(T3 가 topicKeywordSources 에 원천을 더하면 자동 노출). 루브릭 요소 이름은 주제 이름이 아니라 매칭 키워드로만.
  3. 제안: 같은 키워드가 든 미분류 근거에 "이것도 이 주제?" — 문자열 포함 검사(threadSuggest.ts 순수 함수, AI 없음). 과제 제출·루브릭 채점 근거는 같은 학생의 열린 주제에 후보로 표시.
  4. 흐름 화면(RecordDraft/InquiryThread*.tsx 신규): 시간순 줄기(슬롯 라벨 표시), 빈 고리 힌트("질문이 하나뿐이에요" / "시행착오가 없어요" / "산출물 뒤 평가가 없어요"), 교사 역량 키워드 칩(분야를 붙인 형태로 안내: "○○에 대한 자료 해석력"), 다음 탐구 메모, 주제 닫기.
  5. RecordDraftView.tsx: 초안 칸에 "이 주제로" 선택 — 브릿지가 읽을 때 threadId 가 전달되게 한다.
  6. 브릿지(별도 레포): get_record_evidence 에 threadId 인자 + 응답에 threadId·주제 이름 · get_inquiry_threads(읽기 전용, 탈식별) 신설 · get_record_guidelines 에 "주제 하나를 깊게, 성취기준 원문 복사 금지·키워드만" 문구. 테스트 포함.
  7. 관찰 알림 문구에 "미분류 근거 N건" 을 더한다(누구를 부를지는 바꾸지 않는다 — ADR-072 결정 6).
수용 기준: 근거 12건이 주제 2개+미분류로 묶이고 새로고침·동기화 후 유지된다 / 주제 이름 후보 첫 줄이 수행평가 이름이다 / "이것도 이 주제?" 가 키워드 겹침일 때만 뜬다 / 흐름 화면에 빈 고리 힌트가 규칙대로 뜬다 / 브릿지 get_record_evidence(threadId) 가 그 주제 근거만 돌려주고 실명 0 / 학생 전환·리셋·자동저장에서 다른 학생 주제가 섞이지 않는다(Phase 2 슬롯 오염 사고 재발 금지 — 전환·리셋 경로 전수 테스트).
DECISIONS.md 에 ADR 1건 초안을 남겨라: "흐름은 창고에서 묶는다 — ADR-072 결정 6 과의 관계(슬롯은 기록 속성, 주제는 쌓인 뒤 드러남)".
/ralplan 으로 시작해 계획 합의 후 구현하라.
```

---

## T3 — 성취기준·루브릭 연결

```
너는 쌤핀(E:\github\ssampin, main 단일 워킹트리) 병렬 세션 중 하나다. 다른 세션 4개가 같은 트리에서 동시에 일한다.
정본 문서 두 개를 먼저 읽어라:
  1) docs/01-plan/features/record-flow-uplift-program.plan.md — §2 T3 범위, §3 파일 소유권, §7 하지 않는 것
  2) docs/03-analysis/record-draft-flow-curriculum-standards.analysis.md(§3 MCP 실측) + docs/03-analysis/record-draft-flow-v2-inquiry-thread.analysis.md(§4 성취기준은 키워드로만, §5-3-c 루브릭)
철칙:
  - §3 소유권 표에서 T3 가 소유한 파일만 고친다. 소유 밖 파일이 필요하면 계획서 §6 에 요청만 적는다.
  - 시작 전 git status --short 확인. 브랜치·워크트리·PR 만들지 않는다.
  - 커밋은 항상 한 줄 경로 지정: git add <paths> && git commit -m "..." -- <paths>. git add -A 금지.
  - UI 변경(성취기준 고르기)은 프론트엔드 디자인 에이전트와 함께. sp-* 토큰, 라운드는 Tailwind 기본 키만.
  - domain/ 은 외부 import 금지, any 금지, 모든 UI 텍스트 한국어. 오프라인 완전 동작 — 런타임에 MCP·네트워크를 부르지 않는다.
  - ★성취기준 원문은 AI 에 보내지 않는다(오너 결정: 원문을 넣으면 복사형 세특이 나온다). 키워드만 쓴다. 원문은 화면 표시와 T4 복사 검사에만.
  - 게이트 4종 통과 범위를 명시하고 끝낸다. 학사 규정 의존 문구는 기재요령 원문을 확인한 뒤 정한다.
  - 끝나면 PROGRESS.md 에 T3 항목만 추가한다.

작업 T3 — 성취기준·루브릭 연결. 목표: 성취기준 정본(코드·원문·과목·영역·학년군·출처)을 앱에 번들하고, 핵심 키워드만 뽑아 주제·매칭·검사에 쓴다. 루브릭과 평가계획서에 이미 있는 성취기준 코드를 버리지 않는다.
확정된 사실: MCP 패키지 korean-elementary-learning-map-mcp(초등 620건) · korean-secondary-learning-map-mcp(중·고 3,838건) · korean-vocational-learning-map-mcp(특성화고 47,625건), MIT, npx 실행. 성취기준 코드·officialText·sourceLocator 는 정본. topic 의 evidence/assessmentPrompts 는 기계 생성 틀 문장이라 쓰지 않는다. 2026학년도 중3·고3 은 2015 개정이라 자료가 없다(2027 전 학년 적용). 이 환경에 korean-teacher-skills 플러그인으로 초·중등 MCP 가 연결돼 있어 조회로 검증할 수 있다.
T0 가 만들어 둔 것: Rubric.standardCodes? · ProgressEntry.standardCodes? · Assignment.standardCodes? 선택 필드, src/domain/rules/topicKeywordSources.ts 시그니처.

만들 것:
  1. scripts/fetch-curriculum-standards.mjs: 초·중등 npm 패키지 데이터에서 코드·원문·과목·영역·학년군·학교급·출처(sourceLocator)만 추출 → src/domain/data/curriculumStandards.{elementary,secondary}.json. topic·선수관계·이수경로는 넣지 않는다. 특성화고는 용량을 재 보고 선택 번들 여부를 보고한다. 데이터 출처·라이선스(MIT, 원문은 공공저작물)를 파일 머리에 남긴다.
  2. 키워드 추출은 번들 시점에: Kiwi(kiwi-nlp, E:\test\ssampin-record-check\RESEARCH-oss.md 에 44MB 구성 검증됨)로 원문의 명사만 → keywords[] 동봉. 런타임 형태소 분석 없음. 추출 품질을 20건 표본으로 눈으로 확인해 보고한다.
  3. src/domain/services/scoringRubricParser.ts: 평가계획서에서 읽은 성취기준 코드를 버리지 말고 RubricCandidate.standardCodes 로 실어, 루브릭 생성 시 Rubric.standardCodes 에 들어가게 한다.
  4. 성취기준 고르기 UI: 진도(ClassManagement/ProgressEntryFields.tsx) · 과제(Tools/Assignment/AssignmentCreateModal.tsx) · 루브릭 편집. 수업반의 subject·학년으로 목록을 좁힌다(검색은 보조 — 부분 문자열 매칭). 2015 개정 학년은 "이 학년은 2022 개정 자료가 없습니다 — 직접 입력" 을 그대로 적고 자유 입력(standardText?)을 허용한다. 학교급은 설정값 + 특성화고 구분 필요 여부를 보고한다.
  5. topicKeywordSources.ts 에 성취기준 키워드 원천을 구현한다(T2 가 자동으로 쓴다).
수용 기준: 앱 오프라인 상태에서 성취기준 목록이 뜬다 / 진도·과제·루브릭에 코드가 저장·동기화된다 / 평가계획서 업로드로 만든 루브릭에 코드가 붙어 있다 / 키워드에 서술어("이해하고", "그릴 수 있다")가 없다 / AI 로 나가는 어떤 경로에도 원문이 실리지 않는다(브릿지 응답 grep 으로 확인).
/ralplan 으로 시작해 계획 합의 후 구현하라.
```

---

## T4 — 점검 축 확장(로컬 규칙)

```
너는 쌤핀(E:\github\ssampin, main 단일 워킹트리) 병렬 세션 중 하나다. 다른 세션 4개가 같은 트리에서 동시에 일한다.
정본 문서 두 개를 먼저 읽어라:
  1) docs/01-plan/features/record-flow-uplift-program.plan.md — §2 T4 범위, §3 파일 소유권, §7 하지 않는 것
  2) docs/03-analysis/record-draft-flow-v2-inquiry-thread.analysis.md — §2 기준 K1~K14, §7 점검 축 확장 표
철칙:
  - §3 소유권 표에서 T4 가 소유한 파일만 고친다(src/domain/rules/recordNarrativeChecks.ts 신규 · useRecordDraftsStore.ts · 브릿지 grounding.ts·check_record_draft · 저장소 밖 하네스). RecordDraftView.tsx 는 T2 소유 — 라벨은 T0 가 옮겨 둔 src/domain/rules/recordDraftFlagLabels.ts 에만 더한다.
  - 시작 전 git status --short 확인. 브랜치·워크트리·PR 만들지 않는다.
  - 커밋은 항상 한 줄 경로 지정: git add <paths> && git commit -m "..." -- <paths>. git add -A 금지.
  - domain/ 은 외부 import 금지, any 금지, 순수 함수·결정론적·오프라인. 막지 않고 flag 만 단다(ADR-072 결정 5-b).
  - 브릿지(E:\github\ssampin-ai-bridge) 미러는 양쪽 값이 어긋나면 안 된다 — hasProhibitedRecordItem 선례처럼 본체 정본 + 브릿지 미러 + 대조 테스트. 동봉 번들은 재생성하지 않는다(T6).
  - 생기부 프롬프트 원문·하네스 사례는 저장소에 넣지 않는다. 하네스는 E:\test\ssampin-record-draft-eval 에서만.
  - 게이트 4종 + 브릿지 테스트 통과 범위를 명시하고 끝낸다.
  - 끝나면 PROGRESS.md 에 T4 항목만 추가한다.

작업 T4 — 점검 축 확장. 목표: 오너 자료가 정의한 "나쁜 세특" 유형을 AI 없이 로컬 규칙으로 잡아 초안 저장 때 경고한다.
배경(확인됨): 기존 점검은 근거 일치(checkGrounding)·누출·기재 금지(hasProhibitedRecordItem)·바이트만 본다. E:\test\ssampin-record-check 는 AI 맞춤법 검사를 실측으로 탈락시키고 로컬 규칙으로 결론 냈다(같은 정신).

만들 것 — src/domain/rules/recordNarrativeChecks.ts(순수 함수, 각 검사가 {code, label, detail} flag 반환):
  1. 성취기준 복사: 초안 ↔ 연결된 성취기준 원문(T3 번들, 없으면 검사 생략)의 어절 n-gram 겹침(기본 4어절 연속).
  2. 공통 입력 문구: 같은 교사·같은 반의 다른 학생 초안과 문장 단위 중복(첫 문장 가중). 비교 대상은 호출자가 넘긴다(스토어에서).
  3. 일반 평가 나열: 사전 어휘("성실", "이해력이 뛰어남", "수업 태도가 바름", "책임감이 강함" 등 — 자료 §2 K8)가 구체 장면(날짜·산출물·행동 동사) 없이 연속.
  4. 활동 나열: 활동 명사(보고서·실험·발표·토론·설문·제작) N개 이상인데 질문 표지("궁금", "의문", "질문", "왜")가 0.
  5. 변화 근거 없음: "점차·꾸준히·갈수록·지속적으로·매번" 이 있는데 근거에 시기 대비(담임 슬롯 '변화' 또는 두 학기 날짜)가 없다 — 근거 메타는 호출자가 넘긴다.
  6. 관찰 불가 내면 표현: "이해함·파악함·깨달음·흥미를 느낌·자신감을 얻음·함양함" → 행동 동사 대체 제안을 detail 에.
연결: useRecordDraftsStore.upsert 관문에서 호출해 groundingFlags 에 합친다(hasProhibitedRecordItem 선례). 라벨은 recordDraftFlagLabels.ts 에 한국어로. 오탐 억제를 위한 가드(예: "대학원"≠"학원" 같은 예외)를 테스트로 고정한다 — 규칙마다 검출·오탐·무결 3종 테스트.
브릿지: packages/core/src/grounding.ts 에 미러 + check_record_draft 응답에 새 flag + 미러 대조 테스트.
하네스(저장소 밖): E:\test\ssampin-record-draft-eval 에 F 사례(성취기준 키워드만 줬을 때 원문을 복원해 쓰는가) · G 사례(줄기 8단계를 순서대로/뒤섞어 줬을 때 나열형·순서 창작이 나오는가) 추가. 실행은 오너 승인 후(API 호출 비용).
수용 기준: 6종 검사 각각 검출·오탐·무결 테스트 통과 / 실측 A 사례(풍부) 초안에는 경고 0 / "다른 학생에게 옮겨도 말이 되는" 일반 평가 나열 초안에 경고 / 본체·브릿지 미러 값 일치 테스트 / 저장은 막히지 않는다.
/ralplan 으로 시작해 계획 합의 후 구현하라.
```

---

## T5 — 과제수합 파일 본문 유입

```
너는 쌤핀(E:\github\ssampin, main 단일 워킹트리) 병렬 세션 중 하나다. 다른 세션 4개가 같은 트리에서 동시에 일한다.
정본 문서 두 개를 먼저 읽어라:
  1) docs/01-plan/features/record-flow-uplift-program.plan.md — §2 T5 범위, §3 파일 소유권, §7 하지 않는 것
  2) docs/03-analysis/record-draft-flow-curriculum-standards.analysis.md — §2-1 "과제수합 파일과 첨부의 대우가 다르다"
철칙:
  - §3 소유권 표에서 T5 가 소유한 파일만 고친다(useAssignmentStore.ts · 과제 제출 내려받기·추출 usecase·IPC · evidenceImport.ts). RecordEvidenceView.tsx 는 T2 소유 — 화면 변경이 필요하면 계획서 §6 에 요청만.
  - 시작 전 git status --short 확인. 브랜치·워크트리·PR 만들지 않는다.
  - 커밋은 항상 한 줄 경로 지정: git add <paths> && git commit -m "..." -- <paths>. git add -A 금지.
  - domain/ 은 외부 import 금지, any 금지. 오프라인이면 추출을 대기시키고 실패는 조용히 넘기되 "본문 추출 안 됨" 을 남긴다.
  - ★구글 드라이브 파일 목록은 100개에서 조용히 잘린다(실제 사고, 메모리 참조) — 페이지네이션을 반드시 처리한다.
  - 게이트 4종 통과 범위를 명시하고 끝낸다. electron IPC 를 바꾸면 재번들·재시작이 필요하다.
  - 끝나면 PROGRESS.md 에 T5 항목만 추가한다.

작업 T5 — 과제수합 파일 본문 유입. 목표: 학생이 과제수합으로 낸 파일의 본문이 근거 창고에 들어오게 한다.
현재 상태(확인됨): Submission 은 textContent(텍스트 제출)와 fileName·driveFileId 만 있고, submissionToEvidence 는 텍스트+파일명만 싣는다. 반면 첨부(ObservationAttachment.extractedText)는 본문이 들어온다 — 같은 파일인데 올린 경로에 따라 대우가 다르다.
T0 가 만들어 둔 것: Submission.extractedText?(선택 필드).

만들 것:
  1. 제출 파일 내려받기 → 본문 추출 → Submission.extractedText 저장. 추출기는 첨부 extractedText 가 쓰는 기존 경로를 재사용한다(텍스트·HWP·HWPX·PDF·DOCX; 이미지는 "추출 불가" 표시). 새 파서를 만들지 않는다.
  2. 언제 추출하나: 제출 목록을 새로고침할 때 새 제출만, 용량 상한(예: 10MB)과 동시 처리 상한을 두고, 실패는 재시도 1회 후 "추출 안 됨" 으로 남긴다. 사용자가 원하면 다시 시도할 수 있게 한다.
  3. evidenceImport.submissionToEvidence 가 extractedText 를 싣는다(파일명·지각 여부는 유지). 기존 테스트(점수 미포함 회귀 가드)는 그대로 통과해야 한다. 근거 창고의 기재 금지 자동 표시(excludedFromAi)가 본문에도 적용됨을 테스트로 확인한다.
  4. 개인정보: 본문에 학생 실명이 들어 있어도 근거 창고 → 브릿지 경로는 deidentify 가 명단 기준으로 가린다는 점을 확인하고, 명단 밖 이름은 못 가린다는 한계를 문서에 남긴다.
수용 기준: 텍스트·HWP·PDF 제출 3종이 근거로 끌어올 때 본문이 보인다 / 100건 넘는 제출도 전부 처리된다 / 오프라인에서 오류 없이 대기 / 이미지 제출은 "추출 불가" 표시 / 점수·배점 숫자가 근거에 섞이지 않는 기존 가드 통과.
/ralplan 으로 시작해 계획 합의 후 구현하라.
```

---

## T6 — 통합·검증·가이드·릴리즈 (T1~T5 커밋 뒤, 혼자)

```
너는 쌤핀(E:\github\ssampin, main) 통합 세션이다. 병렬 세션 T1~T5 가 끝나 커밋돼 있다. 다른 세션은 열려 있지 않다.
정본: docs/01-plan/features/record-flow-uplift-program.plan.md §2 T6 · §4 실기기 확인 목록 · §6 소유 밖 파일 요청.
할 것:
  1. git log 로 T1~T5 커밋을 확인하고 한 트리에서 게이트 4종 + npm run regression-check + 브릿지(E:\github\ssampin-ai-bridge) typecheck·test + cd landing && npm run docs:check && npm run build.
  2. 계획서 §6 의 소유 밖 파일 요청을 처리한다. 중복·충돌·두 정본을 정리한다.
  3. 브릿지 동봉 번들 electron/ai-bridge/index.mjs 를 한 번 재생성하고 tools/list 실측으로 새 도구·필드가 보이는지 확인한다.
  4. /docs 사용자 가이드(landing/src/content/docs.ts): 말로 남기기 · 주제로 묶기 · 성취기준 고르기 · 점검 경고 설명. 릴리즈 노트에 "금지 항목을 걸러 준다"류 과장 금지 — "눈에 띄게 알려 준다" 가 사실. git log | grep -i revert 로 되돌려진 가이드가 있는지 확인.
  5. 실기기 확인 목록(§4)을 오너에게 넘길 형태로 정리한다. 실험실 토글 여부를 항목별로 제안한다.
  6. PROGRESS.md 정리, DECISIONS.md 의 T2 ADR 초안 확정, 릴리즈는 reference_release_workflow 8단계 SOP 에 따라 오너 승인 후.
철칙: 커밋은 경로 지정, 검증 결과는 실행 명령과 핵심 출력을 함께 적는다, 완료는 게이트 통과 뒤에만 선언한다.
```
