# 쌤핀 AI ↔ 브릿지 동등화 — 다음 세션 핸드오프

- **작성**: 2026-08-23 (슬라이스 1) · **갱신**: 2026-08-23 (**Phase 2 완료**) · **계획서**: `assist-bridge-parity.plan.md`
- **메모리**: `project_assist_bridge_parity_plan.md` — 이 둘만 읽으면 이어받을 수 있다

## 붙여넣을 프롬프트

```
쌤핀 AI 브릿지 동등화 Phase 3(쓰기)을 시작해줘.

필독(순서대로):
1. docs/01-plan/features/assist-bridge-parity.plan.md — 전체 계획·오너 결정 4건 확정됨
2. docs/01-plan/features/assist-bridge-parity.handoff.md — 진행 상태·함정
3. 메모리 project_assist_bridge_parity_plan.md

읽기(Phase 1·2, 도구 19종)는 끝났다. 이번은 계획서 §2 C그룹 쓰기 22종 —
할일(4)·일정(3)·메모(3)·진도(3)·즐겨찾기(4)·노트(5). 오너 결정 ③으로 우선순위
없이 전부, 구현 순서는 기술 편의만 따른다.

★안전 구조가 이 Phase의 전부다: 모델은 **실행하지 못한다.**
도구 호출 제안 → 앱이 미리보기 카드 렌더 → 선생님이 [실행] 클릭 → 로컬 스토어 실행.
연속·일괄 실행 없음(한 번에 한 건). 삭제 계열은 삭제될 원문을 미리보기에 보여준다.
실행 없이 대화가 이어지면 제안은 소멸. "미리보기 없이 실행되는 경로가 없다"를 테스트로 고정.
출결 입력·관찰 추가·채점·생기부 저장(7종)은 이 계획 밖 — 하지 않는다.

완료 기준: 게이트 4종 통과 + 도구별 단위테스트 + 파이프라인 픽스처 2곳 추가
+ 실서버 도구선택 검증(파이썬 urllib UTF-8, 셸 curl 금지).
오너 결정 4건은 확정이니 재질문·축소 금지.
```

## ★Phase 2 완료 (2026-08-23) — 읽기 19종

계획서 §2 B그룹 6도메인. **원래 개별 학생 데이터인 것**을 집계로만 바꿔 내보낸다.

| 신설                            | 나가는 것                                   | 안 나가는 것                        |
| ------------------------------- | ------------------------------------------- | ----------------------------------- |
| `get_homeroom_attendance_stats` | 담임 학급 기간 합계 + 이상 있던 날짜별 인원 | 출석 인원(수업일 수를 모른다), 학생 |
| `get_class_attendance_stats`    | 교과 수업반 날짜×반별 인원(출석 포함)       | 학생 번호·이름                      |
| `get_grade_stats`               | 평가별 인원·평균·최고·최저·성취도 A~E 분포  | 학생별 점수, `studentKey`           |
| `get_seating_stats`             | 배치 방식·자리 수·앉은 인원·빈자리·모둠 수  | **좌석표 전체**(누가 어디 앉는지)   |
| `get_assessment_stats`          | 채점표별 진행·평균 + 요소별 수준 분포       | 학생별 총평·요소 메모               |

**기존 확장**: `get_records_stats` 는 기간이 두 달 이상이면 `byMonth`(달별 건수)를 붙인다
— 기간 무상한(오너 결정 ④)이라 한 학년도를 물어도 줄 수가 열두어 개로 묶인다(계획서 §4).

**실서버 도구 선택**: 대표 질문 7개 중 **6개 정답 + 1개 허용**(“8월 21일 출결”을
하루 도구 대신 기간 도구에 `from=to=8/21` 로 넣었다 — 틀린 답이 아니라 다른 경로다).
출결 세 갈래 구분은 따로 **3회씩 12번 재서 11/12**. 서버 변경 없음.

**게이트**: tsc 0 · lint 0 error · test 571파일 7,244건 · 회귀 49/49.

### Phase 2에서 실제로 밟은 것 (다음 세션이 같은 데 빠질 자리)

- **★도구를 등록해도 정규식 지름길이 먼저 걸리면 없는 것과 같다.** `출결` 정규식이
  질문을 통째로 잡아채는 바람에 "이번 달 결석 몇 번?"이 **오늘 하루치 카드**로 답해졌고,
  새로 만든 기간 도구는 모델에게 보이지도 않았다. 서버에 직접 물었을 땐 정답이 나와서
  **실서버 검증만으로는 안 잡혔다** — 앱 경로(`buildCards`)를 따로 봐야 했다.
  → `INTENT_RULES.steppedAsideWhen` 추가: 조립기 기본값(오늘·이번 달·미완료)으로
  답할 수 없는 표시가 보이면 지름길을 포기하고 모델에게 넘긴다. 칩 4개는 그대로 1왕복.
- **★도구 이름이 설명보다 세다.** `get_attendance_stats` 라는 총칭 이름이 수업반 질문까지
  빨아들였다. 설명 문구를 두 번 고쳐도 경계가 흔들렸고(한 번은 A가, 한 번은 B가 틀렸다),
  `get_homeroom_attendance_stats` 로 **이름에 범위를 넣자** 9/9 로 안정됐다.
- **★한 번씩 물으면 우연을 실력으로 오해한다.** 애매한 경계는 3회씩 재야 한다.
- **모델은 질문의 말을 그대로 인자에 옮긴다** — "3학년 2반 수업 출결"을 물으면
  `className: "3학년 2반 수업"` 이 온다. 딱 맞는 반이 없으면 공백을 지우고 포함 관계로
  한 번 더 본다. **후보가 둘 이상이면 쓰지 않는다**(엉뚱한 반 숫자를 맞다고 말하는 것이
  전체를 보여주는 것보다 나쁘다).
- **담임과 수업반은 저장 구조가 달라 셀 수 있는 것도 다르다.** 담임은 이상만 기록돼
  **출석을 셀 수 없고**(수업일 수를 모른다), 수업반은 전원 명부가 저장돼 셀 수 있다.
  못 세는 것을 0 으로 내보내면 모델이 없는 출석률을 지어낸다.

## ★Phase 1 완료 (슬라이스 2, 2026-08-23)

**등록 도구 14종** — 계획서 §2 A그룹 10도메인이 전부 들어왔다.

| 신설                | 나가는 것                                         | 비고                                        |
| ------------------- | ------------------------------------------------- | ------------------------------------------- |
| `get_timetable`     | 날짜·요일·교시·과목·교실                          | 변동(교체·보강) 반영. 빈 교시는 안 담는다   |
| `get_progress`      | 날짜·학급명·교시·단원·차시·상태·메모              | 학급은 **UUID 가 아니라 이름**으로          |
| `get_memos`         | **내용 전문**·수정일                              | 오너 결정 ①. 최근 순, 서버 상한 안에서 자름 |
| `get_note_list`     | 노트책·구역·제목·고정·수정일                      | **본문 없음**(계획서 확정)                  |
| `get_bookmarks`     | 이름·**도메인만**·묶음                            | 오너 결정 ②. 깨진 주소는 빈 문자열          |
| `get_week_overview` | 날짜별 교시 수·급식·일정·디데이 + 미완료 할 일 수 | 다른 요약을 불러다 접는다                   |

**기존 도구 인자 보강**: `get_attendance_summary{date}` · `get_records_stats{from,to}` ·
`get_my_todos{includeCompleted}` — 예전에는 오늘·이번 달·미완료로 고정이었다.

**실서버 도구 선택 8/8 정답** (파이썬 urllib UTF-8). 인자까지 정확했다 —
"내일"→`{from:2026-08-24}`, "8월 21일 출결"→`{date:"2026-08-21"}`,
"끝낸 것까지"→`{includeCompleted:true}`. **서버 변경 없음.**

**게이트**: tsc 0(내 범위) · lint 0 error · test 567파일 7,145건 통과 · 회귀 49/49.

### 슬라이스 2에서 새로 배운 것

- **`INTENT_RULES.build` 재사용으로는 더는 두 정본을 막을 수 없다.** `build` 가 인자를 안
  받기 때문이다. 대신 **인자를 받는 조립기 한 벌**(`buildAttendanceSummary` 등)을 두고
  정규식 경로와 실행기가 각자의 기본값으로 그것을 부른다.
- **재구성(그물 ②)은 깊이 1 까지만 화이트리스트를 적용한다.** 주간 요약을
  `days[].events[]` 로 만들면 안쪽이 안 걸러진 채 나간다 — 그래서 그날 일정은
  **한 줄 문자열로 합쳐서** 담는다.
- **스토어가 비어 있으면 AI 가 "0건"이라고 사실과 다르게 답한다.** 메모·노트·즐겨찾기·
  시간표는 각자의 화면에서만 불러오는 구조라, 그 화면을 안 연 날엔 텅 비어 있다.
  컨테이너에 **켜져 있을 때 한 번 불러오는 effect** 를 넣었다(각 load 는 멱등).
- **시간표만 `getState()` 로 그때그때 읽는다.** 합성 선택자는 스토어가 바뀌어도 같은
  함수라, 구독해 두면 시간표를 고친 직후 질문했을 때 옛 시간표가 답에 남는다.
- **카드가 `title` 하나만 그리고 있었다** — 도구를 늘릴 때마다 백지 카드가 늘어나는
  구조였다(급식은 `dishes`, 시간표는 `subject`). 본문 후보 키 목록으로 일반화했다.
- `new URL('https://ㅁㄴㅇㄹ')` 는 **예외가 아니라 punycode 도메인**(`xn--0pdgbv`)을 준다.
  "깨진 주소" 테스트를 그걸로 짜면 틀린 기대를 잠그게 된다.

## 슬라이스 1에서 된 것 (커밋 `b85a0011`·`fcfedbf7`)

- **옵션 A 2왕복 배선 완료** — 정규식에 안 걸린 질문은 모델이 도구를 고른다.
  레지스트리 `params` + `toModelToolSchemas()` → 포트/클라이언트 tools·toolCalls →
  스토어 2왕복 → 컨테이너 `executeAssistTool()`(인자 불신·기본값 방어).
- **신규 3종 가동**: get_meals · get_ddays(daysLeft 앱 계산) · get_events(반복 전개는
  domain `getEventsForDate` 재사용). 실서버 도구선택 **3/3 정답**, 서버 재배포 불필요.
- 같은 날 선행 작업: 대화 이력(ADR-067)·목록 카드·날짜 지시문(서버 v3 배포됨).

## 새 도구 추가 절차 (슬라이스 1에서 확립)

1. `usecases/assist/summaries/`에 요약 순수함수 + 테스트 (오늘 날짜·기간은 인자로)
2. `domain/services/assistToolRegistry.ts` 등록 — **freeTextFields 필수**(자유 입력
   자리 전부), 필요 시 `params` 스키마 + `opaqueFields`(UUID 등)
3. `AssistDockContainer.executeAssistTool()`의 switch 에 실행 분기 (인자는 항상 불신)
4. ★`usecases/assist/__tests__/assistPipeline.fixture.test.ts` **두 곳**(REAL·TRAPS)에
   픽스처 추가 — 안 하면 전체 테스트가 막는다(의도된 강제)
5. 실행기 테스트(`executeAssistTool.test.ts`)에 케이스 추가

## 데이터 원천 (Phase 3 에서도 쓸 것)

- **진도**: 스토어가 따로 없다 — `useTeachingClassStore.progressEntries`. `classId` 는 UUID
- **수업반 출결**: `useTeachingClassStore.attendanceRecords` — (반·날짜·교시)마다 전원 명부
- **성적**: `useGradeAnalysisStore` — plans / writtenResults / performanceResults 세 갈래.
  성취도 판정은 `gradeStandardRules.achievementOf` 재사용(고정분할 90/80/70/60)
- **루브릭**: `useRubricStore` — 총점·만점은 `rubricRules.calculateTotal`·`calculateMaxScore`
- **자리 배치**: `useSeatingStore.seating` 한 벌(담임 학급). grid/group/freestyle 세 모양
- **시간표**: `useScheduleStore.getEffectiveTeacherSchedule(date, weekendDays)`.
  주말 수업 설정은 `useSettingsStore().settings.enableWeekendDays`
- **노트**: `useNoteStore` 의 `notebooks` / `sections` / `pagesMeta` 세 갈래
- **메모**: `useMemoStore.memos` — 제목 필드가 **없다**(content 뿐)
- **즐겨찾기**: `useBookmarkStore` 의 `bookmarks` / `groups`

## 함정 (이번 세션에서 실제로 밟은 것)

- **셸을 거친 한글은 깨진다** — curl -d 한글이 cp949 로 변조돼 서버에 도착, 모델이
  깨진 글자를 "그대로" 되풀이해 오진했다. 실서버 검증은 **파이썬 urllib UTF-8**로만
- **Bash 히어독 파이썬에서 역슬래시 소실** — `\n`·`\d` 리터럴은 `chr(92)` 조립, 쓴 뒤 grep 확인
- **다른 세션 진행 중**: StaffRoom(교무실 서식)·쿨메신저·Todo 계열 파일 + `package.json`
  - `DECISIONS.md`·`PROGRESS.md`(미커밋 내용 혼재 — ADR-067 도 그 안에 있음).
    건드리지 말고, 커밋은 **경로 지정**으로.
    tsc 에서 `StaffRoom/PostEditor.tsx` 에러가 보여도 내 몫 아님(슬라이스 2 때도 그랬다)
- 분당 상한 6회 — 실서버 검증을 연속으로 두드리면 budget 축소 응답이 온다

## 영구 경계 (어길 수 없음)

개별 학생 데이터 모델 전송 금지(`ALLOWED_GRADES=[1]`, ADR-061 결정 7) ·
생기부 3종 금지 · 학생 데이터 쓰기 금지 · BYOK 금지 · 2등급 도구 신설 금지
