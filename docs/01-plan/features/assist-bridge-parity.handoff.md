# 쌤핀 AI ↔ 브릿지 동등화 — 다음 세션 핸드오프

- **작성**: 2026-08-23 (슬라이스 1) · **갱신**: 2026-08-23 (슬라이스 2 — Phase 1 완료) · **계획서**: `assist-bridge-parity.plan.md`
- **메모리**: `project_assist_bridge_parity_plan.md` — 이 둘만 읽으면 이어받을 수 있다

## 붙여넣을 프롬프트

```
쌤핀 AI 브릿지 동등화 Phase 2를 시작해줘.

필독(순서대로):
1. docs/01-plan/features/assist-bridge-parity.plan.md — 전체 계획·오너 결정 4건 확정됨
2. docs/01-plan/features/assist-bridge-parity.handoff.md — 진행 상태·함정
3. 메모리 project_assist_bridge_parity_plan.md

Phase 1(읽기 10도메인 + 옵션 A)은 끝났다. 이번은 계획서 §2 B그룹 —
집계로 커버하는 읽기 6도메인: 성적 분포(get_grade_stats) · 수업반 출결
(get_class_attendance_stats) · 담임 출결 기간 확장 · 관찰 기록 기간 확장 ·
자리 배치(get_seating_stats) · 루브릭/수행 피드백(get_assessment_stats).

★모델에는 **집계 숫자만**, 개별 학생 데이터는 화면 카드(로컬)에만. 명단·개별 이력은
화면 카드로도 띄우지 않는다 — 개별 조회는 앱 화면으로 안내한다.

완료 기준: 게이트 4종 통과 + 도구별 단위테스트 + 파이프라인 픽스처 2곳 추가
+ 실서버 도구선택 검증(파이썬 urllib UTF-8, 셸 curl 금지).
오너 결정 4건은 확정이니 재질문·축소 금지.
```

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

## 데이터 원천 (Phase 2 에서도 쓸 것)

- **진도**: 스토어가 따로 없다 — `useTeachingClassStore.progressEntries`. `classId` 는 UUID
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
