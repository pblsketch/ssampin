# 쌤도구 팝업 — Claude Code Ralph 핸드오프

작성: 2026-09-08. 작업 위치: `E:/github/ssampin`, 현재 브랜치 `main`.

## 요청과 현재 상태

사용자는 쌤도구를 본문뿐 아니라 독립 팝업으로도 사용하여, 시간표·생기부 등 다른 쌤핀 페이지와 함께 보고 싶어 한다. 가능성과 지원 도구 검토를 마쳤으며, 사용자가 새 Claude Opus 5 세션에서 오마이클로드 코드 Ralph로 작업을 이어가기로 했다.

- 원 검토: [tool-popup-feasibility-20260908.analysis.md](tool-popup-feasibility-20260908.analysis.md).
- **구현 0건, 팝업 실행 검증 0건.** 검토 문서와 작업 기록만 작성했다. 원 검토의 사용 흐름은 권고안이며 세부 설계 확정 증거로 취급하지 않는다.
- 다음 세션은 아래 기본안을 출발점으로 실행 가능한 계획·설계를 작성한 뒤 구현과 검증까지 진행한다. 일상적인 구현 선택은 근거를 기록하고 진행하며, 큰 범위 변경만 사용자에게 확인한다.
- 이번 세션은 핸드오프만 준비했다. 새 세션의 모델 선택·Ralph 실행은 아직 하지 않았다.

## 실행 환경과 Ralph

1. 사용자가 새 Claude Code 세션에서 **Opus 5**를 선택한다. 실제 제공 모델명은 그 세션에서 확인한다. 이 문서는 모델 ID를 추정하거나 모델이 이미 선택됐다고 주장하지 않는다.
2. `oh-my-claudecode:ralph`를 사용한다. Codex의 oh-my-codex Ralph나 GJC 워크플로우로 바꾸지 않는다.
3. 로컬 캐시에서 확인한 지침은 `C:/Users/wnsdl/.claude/plugins/cache/omc/oh-my-claudecode/5.3.0/skills/ralph/SKILL.md`이다. 새 세션에서는 실제 활성 버전의 지침을 다시 확인한다.
4. 확인한 5.3.0 지침은 세션별 `prd.json`과 `progress.txt`, 인수 조건별 검증, reviewer 승인, ai-slop-cleaner 실행 및 후속 재검증을 요구한다. 기존 다른 세션의 Ralph 상태를 덮어쓰지 않는다. 새 세션 ID가 정해지기 전 임의 PRD 상태를 만들지 않았다.
5. 구현은 main에서 작은 단계로 **순차** 진행한다. 병렬 구현 금지. Ralph의 독립 분석·리뷰는 가능하다. 사용자 지정 모델은 지원 범위에서 검토자에도 적용하되 사용할 수 없는 모델을 사용했다고 보고하지 않는다.
6. 자동 정리는 이번 작업에서 직접 수정한 부분에 한정한다. 기존 변경이 있는 공유 파일은 파일 전체를 정리하지 말고 기존 diff를 보존한다. 정리 후 관련 검증을 다시 수행한다.

## 먼저 읽을 파일과 변경 보호

- `CLAUDE.md`, `AGENTS.md`, `PROGRESS.md`, `DECISIONS.md`와 관련 ADR.
- `docs/architecture-rules.md`, `docs/design-system.md`, `docs/coding-conventions.md`, `.impeccable.md`.
- 원 검토 문서 전체, 창 가시성 관련 ADR-051·053·054.
- 수정 직전에 최신 파일을 다시 읽는다. `git status --short`와 `git diff`를 새 세션 시작 시 재확인한다.

핸드오프 시점의 다른 작업 변경:

- `docs/02-design/features/record-draft-phase34.design.md`
- `src/adapters/components/Tools/Assignment/AssignmentDetail.tsx`
- `src/adapters/hooks/useStudentLists.ts`
- `src/adapters/stores/useAssignmentStore.ts`
- `src/mobile/pages/ToolAssignmentPage.tsx`
- `src/mobile/stores/useMobileAssignmentStore.ts`
- `src/usecases/assignment/CopyMissingList.ts`, `GetSubmissions.ts`
- 미추적 학생 번호 규칙 `src/domain/rules/rosterNumbering.ts`, `submissionMatching.ts`
- 상담·자기평가 계획, 학생 번호 분석·핸드오프·재현 스크립트, 릴리즈 그림 자료도 미추적 상태.

`PROGRESS.md`와 `docs/progress/2026-09.md`는 여러 작업의 변경이 섞여 있다. 최신 파일에 이번 기록만 추가한다. 이 목록은 스냅샷이며 실제 변경이 더 늘어날 수 있다. 기존 변경을 되돌리거나 일괄 스테이징하지 않는다. 새 브랜치·worktree·PR을 만들지 않는다. push·배포·릴리즈는 이번 작업 범위가 아니다.

## 구현 범위

전체 목표는 **9종**: 타이머(일반·스톱워치·발표 모드), 랜덤 뽑기, 신호등, 점수판, 룰렛, 주사위, 동전, QR코드, 활동 기호.

- 타이머와 랜덤 뽑기로 공통 기반을 먼저 검증하고 나머지 7종을 추가한다. 2종만 동작하는 상태는 중간 이정표이며 전체 완료가 아니다.
- 자리 뽑기·모둠 편성기·칠판·설문·토론·협업 도구, 외부 도구 및 사용자 미니앱은 제외.
- 기존 본문 열기·병렬 보기 유지. 병렬 슬롯에서 팝업으로 직접 옮기기는 후속 범위.
- 같은 도구를 본문과 팝업에서 동시에 조작하거나 같은 도구 팝업을 여러 개 띄우는 기능, 앱 재시작 후 실행 복구는 제외.

사용 흐름 기본안:

1. 카드의 기본 클릭은 본문 열기. 보조 버튼 `새 창으로 열기` 추가.
2. 도구 화면 `팝업으로 옮기기` → 현재 입력·진행·결과를 유지하며 이동.
3. 본문에서 다른 페이지를 자유롭게 사용. 이미 팝업으로 열린 도구는 `창 보기`·`본문으로 가져오기` 제공.
4. 같은 도구 재열기는 기존 창 포커스. 서로 다른 도구는 동시 사용.
5. 크기 조절·항상 위 토글(기본 꺼짐)·본문 복귀 제공.
6. X는 해당 실행 종료. 실행 중 또는 결과 유실 시 확인. 본문 복귀는 종료와 구분.
7. 메인 창 최소화 중에도 유지. 앱 완전 종료 시 모든 팝업 정리. 트레이 숨기기와 앱 종료를 구별.

## 코드 진입점과 핵심 위험

- `electron/main.ts`: createQuickAddWindow, getAllAppWindows, broadcastToAllWindows.
- `electron/sidePinBrowserWindow.ts`: 별도 창 준비 확인·포커스·닫기 참고. 투명창 설정을 그대로 복사하지 않는다.
- `electron/preload.ts` 및 연결된 API 타입: 허용한 요청만 노출하고 발신자·도구 ID 검증.
- `src/App.tsx`: mode별 진입, 도구 라우팅. 전용 팝업에서 대시보드의 전체 초기화·알림 작업을 중복 실행하지 않는다.
- `src/adapters/components/Tools/ToolsGrid.tsx`, `ToolLayout.tsx`, `toolRegistry.ts`, `DualToolContainer.tsx`.
- `src/adapters/components/Tools/Timer/`와 `ToolRandom.tsx`, `ToolRoulette.tsx`, `ToolScoreboard.tsx` 등 해당 9종.

화면별 useState와 창별 Zustand 저장소는 자동으로 공유되지 않는다. 단순히 새 창에서 컴포넌트를 다시 만드는 것은 상태 이전이 아니다. 세션 상태 및 조작 주체를 명확히 정의하고, 상태 전달 → 새 화면 준비 확인 → 조작권 이전 순으로 처리한다. 실패 시 원래 실행을 보존한다.

타이머는 이동 가능한 시각 기준 상태와 알람의 단일 발생 책임을 설계한다. 이동하는 동안 시간이 흐르는 점, 알람 직전 이동, 팝업 생성 실패, 중복 클릭, 종료 경합을 포함한다. 현재 코드에도 Date.now 기반 시간 보정이 있으므로 이미 있는 보정을 없는 것처럼 재구현하지 않는다.

학생 정보·제외 목록·선택 학급·설정 동기화를 구별한다. 실행 중 다른 창의 학급 변경으로 추첨 대상을 조용히 교체하지 않는다. 명단 원본은 수정하지 않는다. 작은 창은 도구별 최소 크기와 레이아웃으로 해결하며 전체 배율 축소만으로 대체하지 않는다.

## Ralph 단계와 인수 조건

새 세션의 PRD에 아래 단계를 검증 가능한 user story로 분해한다. 현재 모두 미구현이다.

| 단계 | 산출물·통과 조건 |
| --- | --- |
| S0 현황·설계 | 최신 변경 보호 목록, 지원 범위, 세션 상태·창 생명주기·실패 복구 계약, 테스트 계획 작성. `docs/01-plan/features/tool-popup.plan.md`, `docs/02-design/features/tool-popup.design.md`에 기록 |
| S1 창 기반 | 독립 창 생성·재열기 포커스·항상 위·크기·종료·내부 화면 허용 목록. 잘못된 요청과 로드 실패를 검증 |
| S2 타이머·뽑기 | 타이머 3개 모드 및 뽑기의 왕복 이동 상태 유지. 알람 1회, 학급·제외·이력 보존. Electron 실제 창으로 페이지 이동·최소화·실패 복구 확인 |
| S3 나머지 7종 | 모든 9종의 입력·결과·동작 유지와 작은 창 사용성 검증. 점수·룰렛 이력·QR 내용도 보존 |
| S4 통합·회귀 | 기존 본문·병렬 보기 유지, 단축키·모달·전체화면·메인 최소화·다중 창 및 모니터 복구 확인. 개발 브라우저 폴백·팝업 차단 안내 확인 |
| S5 가이드·최종 검증 | 공개 가이드 소스 갱신, 코드 게이트와 빌드, 실제 Electron 증거, reviewer 승인, 정리 후 재검증 및 보고서 |

최소 실제 시나리오:

- 5분 타이머 실행 → 팝업 이동 → 본문 시간표·생기부 이동 → 본문 복귀. 시간 연속성과 알람 1회 확인.
- 스톱워치의 경과 시간·랩, 발표 타이머의 발표자·순서·진행 상태 유지.
- 뽑기 후 제외·선택 학급·이력 유지. 룰렛 회전 중 이동은 안전하게 처리하고 결과를 재추첨하지 않음.
- 이동 중 연속 클릭·창 닫기·로드 실패·타이머 종료 시 실행 유실 및 이중 실행 없음.
- 타이머+뽑기+점수판 동시 사용. 창을 반복해서 열고 닫은 뒤 이벤트·알람·타이머가 누적되지 않음. CPU·메모리 관찰 기록.
- 최소 창 크기, 많은 팀, QR 스캔, 100%/150%/200% 배율, 보조 모니터 분리, 절전 복귀.
- 외부 URL·잘못된 도구 ID·허용되지 않은 발신 요청 거절.

검증 명령: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run regression-check`, `npm run build`; landing에서 `npm run docs:check`, `npm run build`.

`landing/src/content/docs.ts`와 필요 시 `landing/public/docs/screenshots/`를 갱신한다. Notion 사용자 가이드는 수정하지 않는다. Playwright로 로컬 HTML을 검증할 때는 HTTP 서버를 사용한다. 브라우저 테스트만으로 Electron 팝업 검증을 대체하지 않는다. 설치/패키지 검증은 별도로 표시하고 사용자의 설치 앱을 임의로 교체하지 않는다.

테스트·로그·스크린샷 등 실제 증거를 `docs/03-analysis/`의 이번 기능 QA 문서에 연결하고 완료 보고는 `docs/04-report/features/tool-popup.report.md`에 남긴다. 기기나 환경이 없어 수행 못 한 검증은 미검증으로 남기고 PRD를 전부 통과로 표시하지 않는다. 기존 실패도 원인과 영향 범위를 구분하며 무관한 작업을 임의로 수정하지 않는다.

## 종료 기준

9종 구현, 활성 인수 조건 검증, 가이드 갱신, reviewer 승인과 정리 후 재검증까지 수행해야 전체 완료다. 실행 증거가 없으면 구현 완료와 실기기 미검증을 분리해 보고한다. 완료 선언을 위해 테스트를 삭제하거나 범위를 조용히 축소하지 않는다.

PROGRESS와 월별 기록은 최신 상태에 이번 작업만 반영한다. ADR이 필요하면 현재 마지막 번호를 확인하고 새 번호를 정한다. 번호를 미리 예약하지 않는다. 공개 작업 승인은 별도이며, push·배포하지 않는다.
