# 쌤도구 팝업 — 계획서 (S0)

- 작성: 2026-09-08 · 위치: `main` 단일 워킹트리
- 출처: [핸드오프](../../03-analysis/tool-popup.handoff.md) · [검토](../../03-analysis/tool-popup-feasibility-20260908.analysis.md)
- 설계서: [tool-popup.design.md](../../02-design/features/tool-popup.design.md)

## 1. 무엇을 만드는가

쌤도구를 **본문 안에서만** 쓰던 것을, **별도 창(팝업)** 으로 띄워 시간표·생기부 같은 다른 쌤핀 화면과
동시에 쓸 수 있게 한다. 창을 옮길 때 진행 중인 시간·입력·결과가 그대로 따라간다.

## 2. 지원 범위 — 9종

| 도구 | id | 옮겨야 할 상태 |
| --- | --- | --- |
| 타이머 | `tool-timer` | 탭(일반/스톱워치/발표), 남은 시간·총 시간·프리셋·상태, 스톱워치 경과·랩, 발표자 목록·순서·진행 |
| 랜덤 뽑기 | `tool-random` | 모드, 선택 학급, 제외 목록, 뽑기 이력, 현재 결과, 이름 입력 |
| 신호등 | `tool-traffic-light` | 현재 불, 라벨 |
| 점수판 | `tool-scoreboard` | 팀 이름·점수·색, 증감 단위 |
| 룰렛 | `tool-roulette` | 항목 목록, 회전 각도, 마지막 결과, 이력, 당첨 제거 설정 |
| 주사위 | `tool-dice` | 주사위 수·면수, 마지막 결과, 합계, 이력 |
| 동전 | `tool-coin` | 마지막 결과, 앞/뒤 누적 |
| QR코드 | `tool-qrcode` | 입력 내용, 표시 크기·설정 |
| 활동 기호 | `tool-work-symbols` | 선택한 기호, 보조 표시 상태 |

**제외**: 자리 뽑기·모둠 편성기·칠판·설문 3종·워드클라우드·토론 2종·협업 보드·담벼락·과제수합·서명받기·
서식·마크다운 변환기·학교 알리미·배점 계산기·내 이모티콘·외부 사이트 도구·사용자 미니앱.
같은 도구를 두 창에서 **동시에 조작**하는 것, 앱 재시작 후 실행 복구도 이번 범위가 아니다.

## 3. 사용 흐름

1. 쌤도구 카드에 보조 버튼 **[새 창으로 열기]** 를 둔다. 카드 본체 클릭은 지금처럼 본문 열기.
2. 도구 화면 머리줄에 **[팝업으로 옮기기]**. 지금 진행 중인 상태를 그대로 넘긴다.
3. 이미 팝업으로 열린 도구의 본문 페이지에는 **"팝업으로 사용 중"** 안내와 **[창 보기]** · **[본문으로 가져오기]** 만 보인다(도구를 중복으로 그리지 않는다).
4. 같은 도구는 창 하나만. 다시 열면 기존 창을 앞으로 가져온다. 서로 다른 도구는 동시에 띄울 수 있다.
5. 팝업 창에는 크기 조절, **[항상 위]** 토글(기본 꺼짐), **[본문으로 가져오기]**, 닫기.
6. 닫기 = 그 실행 종료. 본문 복귀는 종료와 다르게 취급한다.
7. 메인 창을 최소화하거나 다른 페이지로 가도 팝업은 살아 있다. 앱을 완전히 끄면 팝업도 정리한다.

## 4. 다른 세션 변경 보호 (2026-09-08 시점 스냅샷)

아래 파일은 **다른 세션의 미커밋 변경**이라 이번 작업에서 건드리지 않는다.

- `src/adapters/components/Tools/Assignment/AssignmentDetail.tsx`
- `src/adapters/components/Homeroom/Survey/SurveyCreateModal.tsx`
- `src/adapters/hooks/useStudentLists.ts`
- `src/adapters/stores/useAssignmentStore.ts`, `src/adapters/stores/useSurveyStore.ts`
- `src/domain/entities/Survey.ts`, `src/domain/rules/surveyRules.ts`
- `src/domain/rules/rosterNumbering.ts`, `src/domain/rules/submissionMatching.ts`(미추적)
- `src/infrastructure/supabase/SurveySupabaseClient.ts`
- `src/mobile/pages/ToolAssignmentPage.tsx`, `src/mobile/stores/useMobileAssignmentStore.ts`
- `src/usecases/assignment/**`, `src/usecases/studentRecords/**`
- `DECISIONS.md`, `PROGRESS.md`, `docs/progress/2026-09.md`, `docs/02-design/features/record-draft-phase34.design.md`
  → 이 4개는 **덧붙이기만** 하고 기존 줄을 고치지 않는다.

`git status --short` 는 작업 도중에도 다시 확인한다. 일괄 스테이징·되돌리기 금지.

## 5. 단계 (Ralph user story 대응)

| 단계 | 내용 | PRD |
| --- | --- | --- |
| S0 | 계획·설계 문서 | US-000 |
| S1a | 도메인 규칙 — 허용목록·창 사양·이관 시간 계산 | US-001 |
| S1b | Electron 창 관리자·IPC·preload | US-002 |
| S1c | 렌더러 진입점 `mode=toolPopup`·세션 이관 배선·브라우저 폴백 | US-003 |
| S2 | 타이머 3모드 + 랜덤 뽑기 | US-004 |
| S3 | 나머지 7종 | US-005 |
| S4 | 통합·회귀(본문 열기·병렬 보기 유지, 중복 실행 방지) | US-006 |
| S5 | 실제 Electron 검증·사용자 가이드·보고서 | US-007 |

## 6. 테스트 계획

**자동(게이트 4종에 포함)**

- 도메인 규칙 단위 테스트 — 허용목록 거절, 창 사양, 이관 중 흐른 시간 반영, 알람 due 판정.
- Electron 창 관리자 단위 테스트 — 가짜 `BrowserWindow` 로 단일 창 보장·재열기 포커스·준비 실패 정리·허용목록 거절·발신자 검증.
- 도구별 `capture → resume` 왕복 테스트 9종 — 스냅샷이 상태를 잃지 않는지.
- 중복 실행 방지 테스트 — 연속 클릭 시 `open` 이 한 번만 호출되는지(ref 가드).
- 기존 병렬 보기·도구 등록 테스트가 그대로 통과하는지(회귀).

**수동(실제 Electron 창)** — `docs/03-analysis/tool-popup.qa.md` 에 증거와 함께 기록.

1. 5분 타이머 시작 → 팝업 이동 → 본문에서 시간표·생기부 이동 → 본문 복귀. 시간 연속·알람 1회.
2. 스톱워치 경과·랩, 발표 타이머 발표자·순서 유지.
3. 뽑기 제외·학급·이력 유지. 룰렛 회전 중 이동 시 재추첨 없음.
4. 이동 중 연속 클릭·창 닫기·로드 실패 — 유실·이중 실행 없음.
5. 타이머+뽑기+점수판 동시. 반복 개폐 후 알람·이벤트 누적 없음. CPU·메모리 관찰.
6. 최소 창 크기, 팀 많은 점수판, QR 스캔, 100/150/200% 배율, 보조 모니터 분리, 절전 복귀.
7. 외부 URL·잘못된 도구 id·허용 안 된 발신 요청 거절.

**검증 명령**: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run regression-check`, `npm run build`,
`cd landing && npm run docs:check && npm run build`.

## 7. 위험과 대응

| 위험 | 대응 |
| --- | --- |
| 알람이 두 창에서 두 번 울림 | 캡처 함수가 **먼저 정지**시키고 스냅샷을 만든다. 소유자는 항상 한 곳 |
| 이동 중 시간이 멈춤 | 스냅샷에 `capturedAt` 을 넣고 새 창에서 흐른 시간을 더해 복원 |
| 팝업 로드 실패로 실행 유실 | 준비 확인 전에는 원본을 해제하지 않는다. 실패 시 스냅샷으로 원복 |
| 연속 클릭 중복 실행 | `useState` 가 아니라 `useRef` 가드(과거 사고 기록) |
| 팝업이 대시보드 초기화를 중복 실행 | `mode=toolPopup` 은 `MainApp` 을 아예 렌더하지 않는다 |
| 외부 URL 로드 | 내부 화면만 로드 + `installNavigationGuard` + 허용목록 검사 |
| 작은 창에서 버튼 접근 불가 | 도구별 최소 크기를 창 사양에 두고, 배율 축소로 대체하지 않는다 |
