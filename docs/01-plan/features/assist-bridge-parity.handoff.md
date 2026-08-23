# 쌤핀 AI ↔ 브릿지 동등화 — 다음 세션 핸드오프

- **작성**: 2026-08-23 (슬라이스 1 마친 세션) · **계획서**: `assist-bridge-parity.plan.md`
- **메모리**: `project_assist_bridge_parity_plan.md` — 이 둘만 읽으면 이어받을 수 있다

## 붙여넣을 프롬프트

```
쌤핀 AI 브릿지 동등화 Phase 1을 이어서 해줘.

필독(순서대로):
1. docs/01-plan/features/assist-bridge-parity.plan.md — 전체 계획·오너 결정 4건 확정됨
2. docs/01-plan/features/assist-bridge-parity.handoff.md — 진행 상태·함정
3. 메모리 project_assist_bridge_parity_plan.md

이번 작업: Phase 1 잔여 7개 도메인을 계획서 §2 표 순서대로.
시간표(get_timetable) → 진도(get_progress) → 메모(get_memos, 내용까지 전송)
→ 노트 목록(get_note_list) → 즐겨찾기(get_bookmarks, URL은 도메인만)
→ 주간요약(get_week_overview) → 기존 도구 인자 보강.

완료 기준: 게이트 4종 통과 + 도구별 단위테스트 + 파이프라인 픽스처 2곳 추가
+ 실서버 도구선택 검증(파이썬 urllib UTF-8, 셸 curl 금지).
오너 결정 4건은 확정이니 재질문·축소 금지.
```

## 지금까지 된 것 (슬라이스 1, 커밋 `b85a0011`·`fcfedbf7`)

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

## 도메인별 메모 (계획서 §2 보충)

- **시간표**: `useScheduleStore`. 학생 정보 없음. 요일×교시 구조 확인부터
- **진도**: 진도 스토어 위치 탐색 필요(이번에 확인 안 함). 단원명·메모 = freeText
- **메모**: `useMemoStore`. **내용까지 전송**(오너 결정 ① — 재질문 금지).
  content 를 freeTextFields 로. 긴 내용은 서버 상한(항목당 4,000자) 안에서 자르기
- **노트**: `useNoteStore`. 제목만(내용 제외는 계획서 확정 사항)
- **즐겨찾기**: `useBookmarkStore`. **URL 은 도메인만**(오너 결정 ②) — 요약 함수에서
  `new URL().hostname` 추출, 깨진 URL 방어
- **주간요약**: 다른 요약들의 조합. 마지막에

## 함정 (이번 세션에서 실제로 밟은 것)

- **셸을 거친 한글은 깨진다** — curl -d 한글이 cp949 로 변조돼 서버에 도착, 모델이
  깨진 글자를 "그대로" 되풀이해 오진했다. 실서버 검증은 **파이썬 urllib UTF-8**로만
- **Bash 히어독 파이썬에서 역슬래시 소실** — `\n`·`\d` 리터럴은 `chr(92)` 조립, 쓴 뒤 grep 확인
- **다른 세션 진행 중**: StaffRoom(교무실 서식)·Todo 계열 파일 + `package.json`(lexical)
  - `DECISIONS.md`(미커밋 ADR 다수 혼재 — ADR-067 도 그 안에 있음). 건드리지 말고,
    커밋은 **경로 지정**으로. tsc/lint 에서 StaffRoom 에러가 보여도 내 몫 아님
- 분당 상한 6회 — 실서버 검증을 연속으로 두드리면 budget 축소 응답이 온다

## 영구 경계 (어길 수 없음)

개별 학생 데이터 모델 전송 금지(`ALLOWED_GRADES=[1]`, ADR-061 결정 7) ·
생기부 3종 금지 · 학생 데이터 쓰기 금지 · BYOK 금지 · 2등급 도구 신설 금지
