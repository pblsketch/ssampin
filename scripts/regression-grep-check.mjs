#!/usr/bin/env node
/**
 * Realtime Wall Padlet Mode v2.1 — 회귀 위험 9건 grep 어서션.
 *
 * Design v2.1 §10.6 + §11.3 회귀 보호 정책 강제 검증.
 *
 * - 존재 검사 (5건): v1/v2 보호된 코드 라인이 실수로 사라지지 않았는지 확인.
 * - 부재 검사 (4건): v2.1에서 절대 등장하면 안 되는 패턴 (XSS/hard delete/PIN 평문/`C` 단축키).
 *
 * 사용:
 *   node scripts/regression-grep-check.mjs
 *
 * 종료 코드:
 *   - 0: 9건 모두 PASS
 *   - 1: 1건 이상 FAIL
 *
 * package.json `prebuild` 또는 별도 `regression-check` script에 통합.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

// ============================================================
// 존재 검사 (필수 패턴이 존재해야 함)
// ============================================================

const presenceChecks = [
  {
    // REGRESSION #57 (2026-08-21, UltraQA) — 쌤핀 AI 그물 ③ 배선.
    //
    // `redactOutbound`(전송 직전 이름·연락처 제거)를 만들어 놓고 **부르는 곳이 없었다.**
    // 그런데 개인정보처리방침(§11)과 패널 문구는 둘 다 "이름은 보내기 전에 지워집니다"라고
    // 약속하고 있었다 — 코드가 방침을 못 지키는 상태로 통과할 뻔했다.
    //
    // 이 프로젝트에서 "층은 만들었는데 배선을 잊은" 사고가 세 번 반복됐다.
    // `useAssistStore.ask()` 가 `redactOutbound` 를 부르고, 포트로는 원본(`cards`)이 아니라
    // 걸러낸 쪽을 넘기는지를 여기서 못 박는다.
    //
    // 2026-08-23 (ADR-067): 걸러낸 변수가 `outbound` → `effectiveOutbound` 로 바뀌었다.
    // 후속 질문에 직전 턴의 카드를 다시 싣기 위해서인데, 그 재전송분(`outboundCards`)도
    // 걸러진 뒤 저장된 것이라 **포트에 닿는 것은 여전히 걸러진 쪽뿐**이다.
    //
    // 2026-08-23 (Phase 3, 쓰기): 두 지점 사이에 쓰기 **제안** 분기가 들어와 거리가 늘었다.
    // 창을 2,500 → 4,000자로 넓힌다. **지키는 것은 그대로다** — 포트에 실리는 것이
    // 원본 `cards` 가 아니라 걸러낸 `effectiveOutbound` 인가. 쓰기 분기는 애초에 포트를
    // 부르지 않고(두 번째 왕복 없음) 화면에 제안만 띄우므로 이 경로에 새 통로를 열지 않는다.
    file: 'src/adapters/stores/useAssistStore.ts',
    pattern: /redactOutbound\([\s\S]{0,4000}?toolResults:\s*effectiveOutbound\.map\(/,
    name: 'REGRESSION #57: 쌤핀 AI 는 이름을 지운 사본만 전송한다 (그물 ③ 배선)',
  },
  {
    // REGRESSION #28 (2026-05-23): native-desktop modal text input may try
    // in-place Win32 focus, but must only accept confirmed focus. When Windows
    // cannot confirm it, fall back to the top-level window path without the
    // normal 50ms settle delay so text entry works and click flicker is reduced.
    file: 'electron/main.ts',
    pattern:
      /settleDelayMs\s*=\s*reason === ['"]modal-input\.request['"] \? 0 : 50[\s\S]*?native focus not confirmed[\s\S]*?falling back to topmost/,
    name: 'REGRESSION #28: native-desktop modal input falls back to topmost with zero settle delay when focus is unconfirmed',
  },
  {
    // REGRESSION #27 (2026-05-23): opening the modal must not switch the whole
    // native-desktop widget window to topmost. Request text-input mode only when
    // the user interacts with an editable control.
    file: 'src/widgets/components/WidgetModal.tsx',
    pattern: /pointerdown[\s\S]{0,900}?requestInputMode/,
    name: 'REGRESSION #27: native-desktop modal input mode starts on editable pointer down, not modal open',
  },
  {
    file: 'src/usecases/realtimeWall/BroadcastWallState.ts',
    pattern: /posts\.filter\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\.status\s*===\s*['"]approved['"]\s*\)/,
    name: 'REGRESSION #1: buildWallStateForStudents approved filter (Design v2.1 §10.6)',
  },
  {
    file: 'src/adapters/components/Tools/RealtimeWall/RealtimeWallCard.tsx',
    pattern: /viewerRole\s*===\s*['"]teacher['"]/,
    name: 'REGRESSION #3a: RealtimeWallCard viewerRole === teacher branch',
  },
  {
    file: 'src/adapters/components/Tools/RealtimeWall/RealtimeWallCard.tsx',
    pattern: /(teacherActions|teacherDragHandle)/,
    name: 'REGRESSION #3b: RealtimeWallCard teacherActions/teacherDragHandle naming',
  },
  // ────────────────────────────────────────────────────────────────────────
  // Realtime Wall v2.0 (β-phase) 회귀 가드 5건 (Plan §2.2 Step 14.5 / G014-A)
  // ────────────────────────────────────────────────────────────────────────
  {
    file: 'electron/ipc/realtimeWall.ts',
    pattern: /\*\*SERVER_TRUSTED_BROADCAST\*\*[\s\S]{0,800}?broadcastToStudents\b/,
    name: 'REGRESSION #42 (v2.0): electron/ipc/realtimeWall.ts 에 SERVER_TRUSTED_BROADCAST 마커 + broadcastToStudents 진입점 코멘트 유지 (Plan §2.2 Step 12)',
  },
  {
    file: 'src/shared/wsProtocol/realtimeWall.ts',
    pattern:
      /REALTIME_WALL_SERVER_MESSAGE_COUNT\s*=\s*17[\s\S]{0,200}?REALTIME_WALL_V2_NEW_MESSAGE_COUNT\s*=\s*5/,
    name: 'REGRESSION #43 (v2.0): wsProtocol/realtimeWall.ts 가 17 server messages (12 v1.15 + 5 v2.0) 카운트 정합 (Plan §2.2 Step 3.5)',
  },
  {
    file: 'src/domain/services/RealtimeWallBoardNormalizer.ts',
    pattern: /requirePin:\s*true[\s\S]{0,400}?schemaVersion:\s*['"]2\.0['"]/,
    name: 'REGRESSION #44 (v2.0): normalizeWallBoardForV2 가 신규 v2.0 보드에 requirePin: true 강제 + schemaVersion 부여 (Plan §2.2 Step 11)',
  },
  {
    file: 'src/domain/entities/RealtimeWallTabConfig.ts',
    pattern: /export\s+const\s+DEFAULT_TAB_ID\s*=\s*['"]default['"]\s+as\s+const/,
    name: 'REGRESSION #45 (v2.0): DEFAULT_TAB_ID 도메인 식별자 sentinel ("default") 보존 — UI 문자열 분리 (Plan §2.2 Step 1)',
  },
  {
    file: 'src/adapters/components/Tools/RealtimeWall/RealtimeWallCardCounterBadge.tsx',
    pattern: /absolute\s+bottom-2\s+right-2[\s\S]{0,500}?data-counter-badge=['"]true['"]/,
    name: 'REGRESSION #46 (v2.0): RealtimeWallCardCounterBadge 가 우하단 absolute + data-counter-badge 노출 — hover 의존 X (Plan §2.2 Step 7 spec L189)',
  },
  {
    // REGRESSION #5 (rev. 2026-05-11) — v2.1 리팩토링으로 rate-limit 상태가
    // 모듈 레벨 `rateLimitBuckets` Map → `session.handle` 내부로 이동했다.
    // 세션 종료 시 `session.handle.close()` 가 'closed' broadcast + WS/HTTP close +
    // rate-limit reset 을 모두 처리하므로, "closeSession() 이 handle 을 닫는다" 를
    // 검증하면 "세션 간 rate-limit 상태 누수 방지" 불변식이 그대로 유지된다.
    file: 'electron/ipc/realtimeWall.ts',
    pattern: /function\s+closeSession\s*\([\s\S]{0,500}?session\.handle\.close\s*\(\s*\)/,
    name: 'REGRESSION #5: closeSession() → session.handle.close() (rate-limit/서버 정리, v2.1 리팩토링 반영)',
  },
  {
    // REGRESSION #5b — rate limiting 이 session.handle 의 rate limiter 로 위임되는지 확인.
    // 이 배선이 끊기면 closeSession 의 reset 도 의미가 없어진다.
    file: 'electron/ipc/realtimeWall.ts',
    pattern: /isRateLimited[\s\S]{0,400}?session\.handle\.isRateLimited\s*\(/,
    name: 'REGRESSION #5b: isRateLimited()가 session.handle.isRateLimited()로 위임',
  },
  {
    // REGRESSION #26 (2026-05-23): native-desktop widget modal input mode detaches
    // the WS_CHILD window to topmost. On Windows this can expose a one-frame fallback
    // size such as 960x1032 -> 549x590 unless bounds are restored immediately after
    // disable(), before the 50ms settle wait.
    file: 'electron/main.ts',
    pattern: /stage1-restore-bounds-after-disable/,
    name: 'REGRESSION #26: native-desktop 모달 입력 전환은 disable 직후 bounds를 즉시 복원',
  },
  // ────────────────────────────────────────────────────────────────────────
  // REGRESSION #10~#16 — notification-modal-stacking-fix Phase 4 (2026-05-21)
  // 사용자 신고 "처음 일정 알림 X 안 눌림"의 근본 원인이었던 모달 동시 노출
  // 부채를 막기 위해, App.tsx 렌더 트리의 6개 모달(7개 호출처: OAuth 3종 포함)이
  // 반드시 useRegisterModal('PRIORITY', ...)로 ModalCoordinator 큐에 등록되어야 함.
  // 누락 시 회귀 — 동시 노출 시 위 모달이 아래 모달을 가린다.
  // ────────────────────────────────────────────────────────────────────────
  {
    file: 'src/adapters/components/common/ModalCoordinator.tsx',
    pattern: /export\s+function\s+ModalCoordinator/,
    name: 'REGRESSION #10: ModalCoordinator 컴포넌트 존재 (큐 인프라 마운트 시그널)',
  },
  {
    file: 'src/App.tsx',
    pattern: /<ModalCoordinator\s*\/>/,
    name: 'REGRESSION #11: App.tsx 렌더 트리에 <ModalCoordinator /> 마운트',
  },
  {
    file: 'src/adapters/components/Dashboard/EventPopup.tsx',
    pattern: /useRegisterModal\(\s*['"]EVENT_ALERT['"]/,
    name: 'REGRESSION #12: EventPopup이 EVENT_ALERT priority로 큐 등록',
  },
  {
    file: 'src/adapters/components/common/UpdateNotification.tsx',
    pattern:
      /useRegisterModal\(\s*['"]SECURITY_UPDATE['"][\s\S]{0,200}?useRegisterModal\(\s*['"]NORMAL_UPDATE['"]/,
    name: 'REGRESSION #13: UpdateNotification이 SECURITY/NORMAL_UPDATE 두 priority XOR 등록',
  },
  {
    file: 'src/adapters/components/common/FirstSyncConfirmModal.tsx',
    pattern: /useRegisterModal\(\s*['"]FIRST_SYNC['"]/,
    name: 'REGRESSION #14: FirstSyncConfirmModal이 FIRST_SYNC priority로 큐 등록',
  },
  {
    file: 'src/adapters/components/common/DriveSyncConflictModal.tsx',
    pattern: /useRegisterModal\(\s*['"]DRIVE_CONFLICT['"]/,
    name: 'REGRESSION #15: DriveSyncConflictModal이 DRIVE_CONFLICT priority로 큐 등록',
  },
  {
    // OAuth 3종 sub-modal이 모두 OAUTH_FLOW로 등록 — 최소 3회 호출 검증
    file: 'src/adapters/components/Settings/modals/OAuthModalsProvider.tsx',
    pattern:
      /useRegisterModal\(\s*['"]OAUTH_FLOW['"][\s\S]+useRegisterModal\(\s*['"]OAUTH_FLOW['"][\s\S]+useRegisterModal\(\s*['"]OAUTH_FLOW['"]/,
    name: 'REGRESSION #16: OAuthModalsProvider 3개 sub-modal 모두 OAUTH_FLOW priority 등록',
  },
  // ────────────────────────────────────────────────────────────────────────
  // REGRESSION #54~#55 — 학사 확인 팝업 2종 (2026-08-20)
  // 8월에 처음 쓰는 선생님은 개학일도 종료일도 비어 있어 두 팝업 조건이 동시에 참이 된다.
  // 코디네이터는 **등록된 것끼리만** 줄을 세우므로, 한쪽만 등록하면 나머지는 큐 밖에서
  // 독립적으로 떠 focus trap이 겹치고 입력칸이 먹통이 된다(2026-08 온보딩 사고 경로).
  // 반드시 둘 다 등록되어야 하므로 두 항목을 따로 건다.
  // ────────────────────────────────────────────────────────────────────────
  {
    file: 'src/adapters/components/SchoolYearWizard/TermStartPromptModal.tsx',
    pattern: /useRegisterModal\(\s*['"]TERM_START_PROMPT['"]/,
    name: 'REGRESSION #54: 개학일 확인 팝업이 TERM_START_PROMPT priority로 큐 등록',
  },
  {
    file: 'src/adapters/components/SchoolYearWizard/TermEndPromptModal.tsx',
    pattern: /useRegisterModal\(\s*['"]TERM_END_PROMPT['"]/,
    name: 'REGRESSION #55: 학기 종료일 확인 팝업이 TERM_END_PROMPT priority로 큐 등록',
  },
  {
    file: 'src/adapters/components/Share/SharePromptOverlay.tsx',
    pattern: /useRegisterModal\(\s*['"]SHARE_PROMPT['"]/,
    name: 'REGRESSION #17: SharePromptOverlay가 SHARE_PROMPT priority로 큐 등록',
  },
  // ────────────────────────────────────────────────────────────────────────
  // REGRESSION #24 — roster-sample-data-removal Phase 3 (2026-05-21)
  // 학생 의존 화면 8곳에 <RosterEmptyState> 가드가 존재해야 함.
  // 대표 파일 1건으로 인프라 존재를 검증하고, 8곳 전체 검사는
  // Vitest 메타테스트(rosterEmptyStateCoverage.test.ts)가 담당.
  // 누락 시 빈 명단 사용자가 빈 화면을 보며 혼란을 겪는 회귀 재발.
  // ────────────────────────────────────────────────────────────────────────
  {
    file: 'src/adapters/components/common/RosterEmptyState.tsx',
    pattern: /export\s+(default\s+function|function|const)\s+RosterEmptyState/,
    name: 'REGRESSION #24: RosterEmptyState 컴포넌트 존재 (빈 명단 가드 인프라 시그널)',
  },
  // ────────────────────────────────────────────────────────────────────────
  // REGRESSION #18~#22 — realtime-tool-student-page-health Phase 2 (2026-05-21)
  // 사용자 신고 "워드클라우드·주관식 설문 학생이 응답해도 0명·응답 미수신"의
  // 근본 원인이었던 두 부채를 차단:
  //   (a) v2.0.4 이하 학생 페이지의 상태 동시 노출 버그 — [hidden] CSS 가드로 차단
  //   (b) WS 미연결 자각 부재 — 4개 학생 페이지 우상단 연결 상태 칩으로 자각 보장
  // 누락 시 회귀: 사용자가 "보냈는데 안 갔다"는 침묵형 실패를 다시 겪는다.
  // ────────────────────────────────────────────────────────────────────────
  {
    file: 'electron/ipc/liveWordCloudHTML.ts',
    pattern: /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/,
    name: 'REGRESSION #18: liveWordCloudHTML.ts 학생 페이지 [hidden] 가드 (v2.0.5 hotfix)',
  },
  {
    file: 'electron/ipc/liveSurveyHTML.ts',
    pattern: /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/,
    name: 'REGRESSION #19: liveSurveyHTML.ts 학생 페이지 [hidden] 가드 (v2.0.5 hotfix)',
  },
  {
    file: 'electron/ipc/liveVoteHTML.ts',
    pattern: /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/,
    name: 'REGRESSION #20: liveVoteHTML.ts 학생 페이지 [hidden] 가드 (v2.0.5 hotfix)',
  },
  {
    file: 'electron/ipc/liveMultiSurveyHTML.ts',
    pattern: /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/,
    name: 'REGRESSION #21: liveMultiSurveyHTML.ts 학생 페이지 [hidden] 가드 (v2.0.5 hotfix)',
  },
  {
    // 공용 칩 헬퍼: sp-conn-chip 클래스 + role="status" + aria-live="polite" 동시 존재
    // 이 셋 중 하나라도 빠지면 학생이 연결 상태를 자각하지 못해 침묵 실패 재발
    file: 'electron/ipc/_studentPageChrome.ts',
    pattern: /sp-conn-chip[\s\S]{0,1500}?role="status"[\s\S]{0,400}?aria-live="polite"/,
    name: 'REGRESSION #22: _studentPageChrome 연결 상태 칩 구조 (sp-conn-chip + role=status + aria-live=polite)',
  },
  {
    // REGRESSION #47 (2026-06-12) — student-pages-design-refactor Phase 1.
    // 학생 페이지 공용 셸: 줌 허용 viewport(WCAG 1.4.4, viewport-fit=cover) +
    // --sps-accent 단일 파랑 토큰(plan D1). 사라지면 6개 학생 페이지 디자인
    // 단일 소스가 깨지고 색/접근성 표류가 재발한다.
    // (user-scalable=no 부재 검증은 _studentPageChrome.shell.test.ts 메타테스트 담당)
    file: 'electron/ipc/_studentPageChrome.ts',
    pattern:
      /getStudentViewportMeta[\s\S]{0,600}?viewport-fit=cover[\s\S]*?--sps-accent:\s*#3b82f6/,
    name: 'REGRESSION #47: 학생 셸 줌 허용 viewport + --sps-accent 토큰 (student-pages-design-refactor)',
  },
  // ────────────────────────────────────────────────────────────────────────
  // REGRESSION #49 — record-viewing-unification Phase C 개인정보 hard gate (2026-06-24).
  // recordIdentityAdapter 의 합성 학생키는 반드시 context(+classId)+rawKey 로 만들어져야 한다.
  // 누군가 키를 rawKey 단독으로 "단순화"하면 담임/교과의 동일 키 학생이 한 그룹으로
  // 오병합되어 엉뚱한 학생 기록이 섞이는 개인정보 사고가 재발한다.
  // (단위테스트 C-AC3 와 이중 가드 — context 가 키 첫 축으로 남아있는지 grep.)
  // ────────────────────────────────────────────────────────────────────────
  {
    file: 'src/adapters/presentation/recordIdentityAdapter.ts',
    pattern: /surfaceKey:\s*JSON\.stringify\(\s*\[\s*context\s*,[\s\S]{0,60}?rawKey\s*\]\s*\)/,
    name: 'REGRESSION #49: recordIdentityAdapter 합성키가 context+classId+rawKey 분리 키 유지 (개인정보 오병합 hard gate)',
  },
  // ────────────────────────────────────────────────────────────────────────
  // REGRESSION #60·#61 — 진도 캘린더 "글씨 많으면 화면이 잘린다" 신고(F-1, 2026-08-21).
  //
  // 두 줄이 짝으로 있어야 잘림이 막힌다. 하나만 남으면 증상이 그대로 돌아온다.
  //  #60 table-fixed  : 없으면(기본 auto) 칸 안의 긴 단원·차시 텍스트가 열 폭을 정해
  //                     표가 창보다 넓어진다. 셀의 truncate/line-clamp 도 같이 무력화된다.
  //  #61 min-w-0      : 없으면 flex 아이템 기본값 min-width:auto 때문에 본문 칸이 창보다
  //                     넓어져, 페이지가 가진 overflow-x-auto 가 영영 켜지지 않고 넘친
  //                     부분이 body 의 overflow-x:hidden 에 잘려 손댈 수 없게 된다.
  //                     (실측: 1440px 창에서 목·금 두 요일이 통째로 사라졌다.)
  // ────────────────────────────────────────────────────────────────────────
  {
    file: 'src/adapters/components/Progress/ProgressCalendarGrid.tsx',
    pattern: /<table[^>]* table-fixed /,
    name: 'REGRESSION #60: 진도 캘린더 표는 table-fixed 유지 (긴 진도 글이 열 폭을 밀어내 목·금이 잘리는 것 방지)',
  },
  {
    file: 'src/App.tsx',
    pattern: /className="flex flex-1 min-h-0 min-w-0 flex-col"/,
    name: 'REGRESSION #61: 본문 칸은 min-w-0 유지 (넓은 표가 창을 밀어내 잘리지 않고 가로 스크롤되도록)',
  },
  // ────────────────────────────────────────────────────────────────────────
  // REGRESSION #65 — 옆핀 위젯 PIN 잠금 (2026-09-01)
  //
  // 대시보드에서 잠근 위젯 4종이 옆핀에서는 그대로 보이던 것이 2단계의 출발점이다.
  // ★ 이 항목은 **grep 으로 지킬 수 없다.** `import { SidePinPinGuard }` 한 줄만 남고
  //   JSX 에서 가드가 빠져도 grep 은 초록이 된다. 그래서 진짜 방어선은 렌더 테스트이고
  //   (`SidePinWidgetZone.pinLock.test.tsx`), 여기서는 **그 테스트가 지워지거나
  //   속이 비지 않았는지**만 확인한다.
  {
    file: 'src/adapters/components/SidePin/SidePinWidgetZone.pinLock.test.tsx',
    pattern: /queryByText\(SECRET\)\)\.toBeNull\(\)/,
    name: 'REGRESSION #65: 옆핀 위젯 PIN 잠금 렌더 테스트가 살아 있다 (본문이 DOM 에 없음을 실제로 그려서 확인)',
  },
  // ────────────────────────────────────────────────────────────────────────
  // REGRESSION #67 — 옆핀 메모 칸 PIN 잠금 (2026-09-01)
  //
  // `memo` 는 PIN_FEATURE_MAP 에도 ProtectedFeatureKey 에도 있는데, 옆핀 메모 칸은
  // 위젯이 아니라 전용 화면이라 2단계의 위젯 가드가 닿지 않았다. 그래서 설정에서
  // "메모"에 자물쇠를 걸어도 옆핀 메모는 그대로 읽혔다.
  // #65 와 같은 이유로 grep 이 아니라 **렌더 테스트**가 진짜 방어선이고,
  // 여기서는 그 테스트가 지워지거나 속이 비지 않았는지만 본다.
  {
    file: 'src/adapters/components/SidePin/SidePinMemoZone.test.tsx',
    pattern: /메모 칸 PIN 잠금[\s\S]*?queryByText\(\/학부모 상담 메모\/\)\)\.toBeNull\(\)/,
    name: 'REGRESSION #67: 옆핀 메모 칸 PIN 잠금 렌더 테스트가 살아 있다 (메모 내용이 DOM 에 없음을 실제로 그려서 확인)',
  },
];

// ============================================================
// 부재 검사 (특정 패턴이 절대 존재하면 안 됨) — v2.1 신규 4건
// ============================================================

const absenceChecks = [
  // ────────────────────────────────────────────────────────────────────────
  // REGRESSION #63 — 모바일 스토어 reload()에서 `loaded:false` 금지 (2026-08-24).
  //
  // 신고: "모바일에서 진도 체크가 안 된다". 실제로는 **입력 소실**이었다.
  //
  // 모바일은 앱을 켤 때·다른 앱 갔다 돌아올 때(visibilitychange)·네트워크가 붙을 때마다
  // `useSyncTrigger` → `syncFromCloud` → `reloadAllStores` 로 전 스토어를 다시 읽는다.
  // 그때 reload 가 `loaded:false` 를 떨어뜨리면, `!loaded` 를 스피너로 갈아끼우는 화면들이
  // **열려 있던 입력 시트째로 언마운트**된다. 타이핑·스크롤 위치·서브탭 선택이 함께 날아간다.
  // (진도 탭·특기사항 탭·수행평가 채점은 early return 이라 시트가 통째로 사라졌다.)
  //
  // `loaded:false` 는 load() 의 조기 반환을 뚫으려는 용도였을 뿐, 데이터 갱신에는 필요 없다.
  // 대신 `load(true)` 로 강제 갱신한다.
  //
  // 데스크톱은 2026-07-07 에 같은 사고(노트 "글 생겼다 없어졌다")로 이미 옮겨갔는데
  // **모바일 스토어 17개는 옛 패턴 그대로 남아 있었다.** 같은 사고가 기기만 바꿔 재발했다.
  // 이 검사가 없으면 새 모바일 스토어를 추가할 때 세 번째로 재발한다.
  // ────────────────────────────────────────────────────────────────────────
  {
    name: 'REGRESSION #63: 모바일 스토어 reload()는 loaded:false 를 떨어뜨리지 않는다 (동기화 중 입력·화면 소실 방지)',
    roots: ['src/mobile/stores'],
    extensions: ['.ts'],
    // reload 본문 안에서 loaded 를 false 로 되돌리는 형태만 잡는다.
    // 초기 상태 선언(`loaded: false,`)은 정상이므로 건드리지 않는다.
    patterns: [/reload:\s*async\s*\([^)]*\)\s*=>\s*\{[\s\S]{0,400}?loaded:\s*false/],
    fileFilter: (path) => !path.includes('.test.'),
  },
  {
    // 회귀 #6 — `C` 단축키 코드 부재 (학생 entry 한정)
    name: 'REGRESSION #6: `C` keyboard shortcut must NOT exist (학생 entry)',
    roots: ['src/student'],
    extensions: ['.ts', '.tsx'],
    patterns: [
      // event.key === 'c' (대소문자 무관)
      /event\.key\s*===\s*['"]c['"]/i,
      // addEventListener('keydown', ...) 안에 'c' 키 비교가 같이 등장
      /addEventListener\(\s*['"]keydown['"][\s\S]{0,400}['"]c['"]/i,
    ],
  },
  {
    // 회귀 #7 — dangerouslySetInnerHTML 사용 부재 (학생 entry + RealtimeWall 컴포넌트)
    // jsx 속성 또는 객체 키 형태만 검사 (주석/문자열 안의 단순 언급은 허용 — Design 문서 인용 가능)
    name: 'REGRESSION #7: dangerouslySetInnerHTML must NOT exist (학생 entry + RealtimeWall)',
    roots: ['src/student', 'src/adapters/components/Tools/RealtimeWall'],
    extensions: ['.ts', '.tsx'],
    // jsx attribute (`dangerouslySetInnerHTML={...}`) 또는 props 객체 key (`dangerouslySetInnerHTML:`)
    patterns: [/dangerouslySetInnerHTML\s*=\s*\{/, /\bdangerouslySetInnerHTML\s*:/],
  },
  {
    // 회귀 #8 — hard delete 패턴 부재
    name: 'REGRESSION #8: hard delete pattern must NOT exist (use soft delete)',
    roots: ['electron/ipc', 'src/adapters/stores', 'src/domain/rules'],
    extensions: ['.ts'],
    // posts.filter(x => x.id !== <var>) 패턴
    patterns: [/posts\.filter\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\.id\s*!==\s*\w+\s*\)/],
    // realtimeWall 도메인에 한정 — 일반 배열 filter는 무관
    fileFilter: (path) => /realtimeWall/i.test(path) || /WallBoard/i.test(path),
  },
  {
    // 회귀 #9 — PIN 평문 필드 부재 (Zod 스키마 / 메시지 핸들러)
    name: 'REGRESSION #9: PIN plaintext field must NOT exist in Zod schema (only pinHash allowed)',
    roots: ['electron/ipc', 'src/domain/rules'],
    extensions: ['.ts'],
    // submit-pin-* 핸들러나 스키마에서 `pin: z.string()` 같은 평문 PIN 필드 등장
    // pinHash는 허용하지만 pin은 거부
    patterns: [
      // z.object({ ... pin: z.string ... }) — pinHash가 아닌 pin
      /\bpin\s*:\s*z\.(string|number)\(\)(?!\s*\.regex)/,
      // 'pin' literal type (submit-pin-set 등 message type literal은 허용해야 하므로 정밀 패턴 필요)
      // type: 'submit-pin-set' / 'submit-pin-verify' 자체는 허용
      // 단 Zod 객체 안에 pin: 평문 필드는 거부
    ],
    fileFilter: (path) => /realtimeWall/i.test(path),
  },
  // ────────────────────────────────────────────────────────────────────────
  // REGRESSION #23 — roster-sample-data-removal Phase 3 (2026-05-21)
  // useStudentStore.ts 에 SAMPLE_STUDENTS 상수 또는 샘플 학생 이름이 재도입되면
  // 신규 설치 시 샘플 명단이 자동 채워져 UX 문제 재발.
  // 화이트리스트:
  //   - src/domain/rules/sampleRosterSignature.ts  (합법적으로 시그니처 35명 보유)
  //   - src/domain/rules/sampleRosterSignature.test.ts
  //   - src/usecases/roster/cleanupSampleRoster.test.ts
  // ────────────────────────────────────────────────────────────────────────
  // ────────────────────────────────────────────────────────────────────────
  // REGRESSION #56 — 브라우저 기본 파일 선택 버튼 노출 금지 (2026-08-21)
  //
  // `<input type="file">` 을 그대로 두면 브라우저가 그린 "파일 선택" 버튼이 나온다.
  // 이 버튼은 우리 테마 색을 안정적으로 먹지 않아 **흰 바탕에 흰 글씨로 사라졌다**
  // (연락처 엑셀 등록 모달 실제 발생 — 사용자 신고 스크린샷).
  // `file:bg-sp-accent` 규칙이 CSS 에 생성돼 있는데도 그랬다.
  //
  // 그래서 이 저장소의 파일 업로드 20여 곳은 전부 input 을 숨기고(`hidden`/`sr-only`)
  // 직접 만든 버튼을 누르면 `inputRef.current?.click()` 하는 방식을 쓴다.
  // 새로 만든 업로드가 이 관례를 빠뜨리면 같은 사고가 반복된다.
  //
  // 검사 방법: `type="file"` 이 있는 줄부터 몇 줄 안에 `className` 이 나오는데
  // 그 안에 `hidden` 도 `sr-only` 도 없으면 실패로 본다.
  // ────────────────────────────────────────────────────────────────────────
  {
    name: 'REGRESSION #56: 브라우저 기본 파일 선택 버튼을 노출하지 않는다 (input[type=file]은 숨기고 직접 만든 버튼 사용)',
    roots: ['src'],
    extensions: ['.tsx'],
    patterns: [
      // type="file" 뒤 200자 안의 className 에 hidden/sr-only 가 없는 경우
      /type="file"(?![\s\S]{0,200}className="[^"]*\b(?:hidden|sr-only)\b)[\s\S]{0,200}className="/,
    ],
    // 테스트 파일은 querySelector('input[type="file"]') 처럼 조회만 한다 — 제외.
    fileFilter: (path) => !/\.(test|spec)\.tsx?$/.test(path),
  },
  // ────────────────────────────────────────────────────────────────────────
  // REGRESSION #58·#59 — 할일 확장 4건 M0 (2026-08-22, ADR-066 계획)
  //
  // 게이트 4종 중 이 두 규칙을 검사하는 건 regression-check 뿐이다. tsc·lint 는
  // "시계를 읽었는지"나 "인자를 빠뜨렸는지"를 모른다. grep 전용이라는 한계를
  // 여기서는 오히려 도구로 쓴다.
  // ────────────────────────────────────────────────────────────────────────
  {
    // #58 — 새 할일 도메인 규칙은 시계를 직접 읽지 않는다.
    //
    // `new Date('2026-08-21T14:00')` 형태는 **실행 머신의 시간대**로 해석돼, 같은 코드가
    // 개발자 PC(KST)와 CI(UTC)에서 다른 값을 낸다. 알림이 몇 시간씩 어긋나는 고전적 함정이다.
    // 오늘 날짜·시간대 오프셋은 바깥에서 주입받는다.
    //
    // ★ fileFilter 로 신규 파일만 겨냥한다. `src/domain/rules/todo*.ts` 로 넓히면
    //   기존 `todoRules.ts` 의 `new Date(` 8건에 걸려 손도 안 댄 파일 때문에 즉시 빨간불이
    //   된다. 그 8건은 `isOverdue(todo, today = new Date())` 같은 **기본 인자**라 위반이 아니다.
    //
    // 2026-08-27 `todoCalendarRules` 추가 — 달력에 얹는 마감일을 날짜 산술로 밀고 당기는
    //   파일이라 "하루 밀림"이 정확히 이 규칙이 막으려는 사고다. todoTime 의
    //   daysFromCivil/civilFromDays 를 빌려 쓰므로 `Date` 가 필요 없다.
    name: 'REGRESSION #58: 새 할일 도메인 규칙은 시계를 직접 읽지 않는다 (시간대 무관 보장)',
    roots: ['src/domain/rules'],
    extensions: ['.ts'],
    patterns: [/new Date\(/, /Date\.now\(/],
    fileFilter: (path) =>
      /todo(CheckRules|Time|AlarmRules|AutoBoard|CalendarRules)\.ts$/.test(path),
    // 주석에 적은 "이걸 쓰지 마라" 예시까지 잡히면, 설명을 잘 달수록 빨간불이 된다.
    stripComments: true,
  },
  {
    // #59 — 할일 알람 훅은 인자 없는 전체 삭제를 부르지 않는다.
    //
    // 알림 스케줄은 출처별로 나뉘어 있다. 기존 훅(useReminderOsPush)을 그대로 베끼면
    // 인자 없는 `clearReminderSchedule()` 을 부르게 되고, 그러면 **학생 관찰 기록 알림이
    // 통째로 사라진다.** 할일 알람을 끄려다 남의 알림을 끄는 셈이다.
    // 반드시 `clearReminderSchedule('todo')` 처럼 출처를 지정해야 한다.
    name: 'REGRESSION #59: 할일 알람 훅은 clearReminderSchedule()을 인자 없이 부르지 않는다 (기록 알림 전멸 방지)',
    roots: ['src/adapters/hooks'],
    extensions: ['.ts', '.tsx'],
    patterns: [/clearReminderSchedule\(\s*\)/],
    fileFilter: (path) => /useTodoAlarmOsPush\.tsx?$/.test(path),
    // ★ 주석은 걷어내고 본다. 이 훅의 머리 주석은 "인자 없이 부르면 기록 알림이 전멸한다"를
    //   경고하느라 금지 대상을 예시로 적을 수밖에 없다. 걷어내지 않으면 **경고를 잘 써 둘수록
    //   빨간불**이 된다 — #58 이 겪은 것과 같은 함정이다. 진짜 호출은 그대로 잡힌다.
    //   "todo 를 지정해 부르는 줄이 실제로 있는가"는 appEntryReminder.contract.test.ts 가 본다.
    stripComments: true,
  },
  {
    name: 'REGRESSION #23: SAMPLE_STUDENTS 상수가 useStudentStore.ts 에 재도입되지 않았다',
    roots: ['src/adapters/stores'],
    extensions: ['.ts'],
    patterns: [/const\s+SAMPLE_STUDENTS\s*=/],
    fileFilter: (path) => /useStudentStore\.ts$/.test(path),
  },
  {
    // 회귀 #25 — Electron file:// 환경에서 `/mode-preview/*.svg` 절대 경로는
    // `file:///mode-preview/*.svg`로 해석되어 위젯 모드 팝오버 썸네일이 깨진다.
    // `mode-preview/*.svg` 상대 경로를 써야 dist/mode-preview 로 정상 해석된다.
    name: 'REGRESSION #25: 위젯 모드 미리보기 이미지는 file:// 호환 상대 경로를 사용',
    roots: ['src/widgets', 'src/adapters/components/Widget', 'src/adapters/components/Settings'],
    extensions: ['.ts', '.tsx'],
    patterns: [/['"`]\/mode-preview\//],
  },
  {
    // UltraQA Q1: 4 개 Edge Function 이 각자 정의했던 `async function sha256Hex(...)` 가
    // 다시 등장하면 안 됨 (단일 진실 원천 `_shared/hash.ts` 사용 강제).
    name: 'REGRESSION #40 (UltraQA Q1): Edge Function 이 sha256Hex 를 중복 정의하지 않는다 (_shared/hash.ts 만 사용)',
    roots: ['supabase/functions'],
    extensions: ['.ts'],
    patterns: [/async function sha256Hex\b/],
    fileFilter: (path) => !path.includes(`${sep}_shared${sep}`),
  },
  // ────────────────────────────────────────────────────────────────────────
  // REGRESSION #51 — @nut-tree-fork/nut-js 재도입 금지 (ADR-038, 2026-08-07).
  // 스티커 자동 붙여넣기는 koffi(FFI) → user32.dll SendInput 으로 대체됐다
  // (electron/platform/win32SendKeys.ts). nut-js 포크는 낡은 jimp(0.22)에 고정되어
  // jimp → @jimp/core → file-type 취약점 알림 7건을 영구히 달고 다녔고, 상류 패치가 없다.
  // "Ctrl+V 한 번" 을 위해 이미지 라이브러리 전체를 배포하지 않는다.
  // ────────────────────────────────────────────────────────────────────────
  {
    name: 'REGRESSION #51: @nut-tree-fork/nut-js 가 재도입되지 않았다 (koffi SendInput 사용)',
    roots: ['electron', 'src', 'scripts'],
    extensions: ['.ts', '.tsx', '.mjs', '.js'],
    patterns: [/@nut-tree(-fork)?\//],
    // 이 스크립트 자신의 설명 주석과 대체 모듈의 배경 주석은 예외 (패턴을 문자열로 언급함)
    fileFilter: (path) =>
      !/regression-grep-check\.mjs$/.test(path) && !/win32SendKeys\.ts$/.test(path),
  },
  {
    name: 'REGRESSION #48: active product source must not send users to the old Notion guide',
    roots: ['src', 'landing/src', 'public', 'scripts'],
    extensions: ['.ts', '.tsx', '.mjs', '.json'],
    patterns: [
      /supsori\.notion\.site\/SsamPin/,
      /노션\s*가이드/,
      /노션\s*사용자\s*가이드/,
      /Notion\s*사용자\s*가이드/,
    ],
  },
  // ────────────────────────────────────────────────────────────────────────
  // REGRESSION #50 — record-viewing-unification Phase C 개인정보 hard gate (2026-06-24).
  // 식별 그룹핑 어댑터는 읽기 전용이어야 한다 — store import / write 메서드 0건.
  // 쓰기 의존이 생기면 표시용 어댑터가 데이터를 변형·저장할 수 있어 불가침(읽기 전용)이 깨진다.
  // (단위테스트 C-AC5 와 이중 가드. .test.ts 는 메서드명을 블랙리스트로 나열하므로 제외.)
  // ────────────────────────────────────────────────────────────────────────
  {
    name: 'REGRESSION #50: recordIdentityAdapter 는 store write 의존이 없다 (읽기 전용 hard gate)',
    roots: ['src/adapters/presentation'],
    extensions: ['.ts'],
    patterns: [
      /from\s+['"]@adapters\/stores/,
      /useStudentRecordsStore|useObservationStore|useTeachingClassStore/,
      /\b(updateAttendanceRecord|saveDayAttendance|bridgeHomeroomDayAttendance)\b/,
    ],
    fileFilter: (path) => /recordIdentityAdapter\.ts$/.test(path) && !path.includes('.test.'),
  },
  // ────────────────────────────────────────────────────────────────────────
  // REGRESSION #53 — 위젯 크기 보정에 getMinimumSize() 금지 (ADR-053, 2026-08-18).
  //
  // 위젯 창은 `resizable: false` 로 만들어진다. 크기 조절 불가 창은 Windows/Chromium 이
  // 최소 크기를 **현재 크기와 같게** 보고한다 (실측: 생성 직후 getMinimumSize=(903x703),
  // setBounds 839x985 뒤 getMinimumSize=(839x985); resizable:true 대조군은 640x480).
  //
  // 그래서 `fitWidgetSizeToWorkArea(bounds, workArea, getMinimumSize())` 는
  // max(현재, min(현재, 화면)) = 현재가 되어 **"화면보다 크면 줄인다"가 한 번도 동작하지
  // 않았다.** ADR-051 결정 6 으로 넣은 보호 장치가 출시 후에도 무력 상태였고, 자동 검사가
  // 전부 초록불이었는데도 아무도 몰랐다 (계산은 옳고 입력이 틀린 유형).
  //
  // 하한은 반드시 상수(WIDGET_ABSOLUTE_MIN_SIZE)를 쓴다.
  // ────────────────────────────────────────────────────────────────────────
  {
    name: 'REGRESSION #53: 위젯 크기 보정이 getMinimumSize()를 하한으로 쓰지 않는다 (resizable:false 함정)',
    roots: ['electron'],
    extensions: ['.ts'],
    patterns: [/getMinimumSize\s*\(\s*\)/],
    // 크기 보정 로직이 사는 파일에만 적용한다. 프로브 스크립트와 테스트는 이 API 의
    // 실제 거동을 관찰·문서화하는 것이 목적이므로 제외.
    fileFilter: (path) =>
      /(main|desktopWidgetManager|desktopWidgetDpiRestore)\.ts$/.test(path) &&
      !path.includes('.test.'),
  },
  // ────────────────────────────────────────────────────────────────────────
  // REGRESSION #66 — 온라인 교무실 계측의 개인정보 방어, **소비자 쪽** (2026-08-31, ADR-079).
  //
  // 064 마이그레이션은 "부서를 식별할 수 있는 칸을 만들지 않는" 집계 함수 하나만 내보내고,
  // 그 계약은 staffroomHealthPrivacy.meta.test.ts 가 SQL 쪽에서 지킨다.
  //
  // ★ 그런데 SQL 을 한 글자도 안 고치고 뚫는 길이 하나 남는다 —
  //   `fetchTable('staffroom_departments', { select: 'name,owner_email' })` **한 줄**이면
  //   부서 이름과 교사 이메일이 그대로 브라우저까지 간다(_lib/supabase.ts 의 fetchTable 은
  //   service_role 키로 임의의 표를 조회한다). SQL 쪽 테스트는 이걸 절대 못 본다.
  //
  // 그래서 관리자 대시보드가 교무실 표를 **직접** 조회하지 못하게 막고,
  // staffroom_ 참조는 허용된 RPC 이름 하나만 남긴다.
  // ────────────────────────────────────────────────────────────────────────
  {
    name: 'REGRESSION #66: 관리자 대시보드는 교무실 표를 직접 조회하지 않는다 (허용 RPC staffroom_health_v1 하나만)',
    roots: ['landing/src/app/admin/analytics'],
    extensions: ['.ts', '.tsx'],
    patterns: [
      // 교무실 표를 PostgREST 로 직접 읽는 길을 통째로 막는다
      /fetchTable\s*\(\s*['"`]staffroom/,
      // staffroom_health_v1 을 뺀 나머지 staffroom_* 참조 금지.
      // (ripgrep 이 아니라 JS RegExp 라 부정 전방탐색이 쓸 수 있다)
      /staffroom_(?!health_v1\b)/,
    ],
    stripComments: true,
  },
];

// ============================================================
// 계약 검사 — REGRESSION #62: text-white × 라이트 모드 보호 목록
// ============================================================
//
// 라이트 모드는 `.theme-light .text-white` 로 흰 글씨를 본문색(어두움)으로 뒤집는다 —
// "밝은 배경에 실수로 쓴 흰 글씨"를 살리는 안전장치다. 그런데 라이트 모드에서도
// 어둡게/유채색으로 남는 배경(bg-red-500 · bg-gray-800 · bg-black/55 …) 위의 흰 글씨는
// 뒤집으면 안 되고, 그 예외가 src/index.css 의 보호 목록(허용 셀렉터들)으로 관리된다.
// 목록에 없는 배경이 들어오면 **어두운 바탕에 어두운 글씨**가 되어 조용히 사라진다.
// 같은 사고가 이미 두 번 있었다: 9f54f58e(관찰 첨부·PDF 배지 등 9군데) ·
// aeeb15d1(드롭다운 option 104곳).
//
// 검사: 한 클래스 문자열 안에 `text-white` 와 "라이트 모드에서도 어두운 정적 배경"이
// 같이 있는데 index.css 보호 목록의 어떤 규칙에도 잡히지 않으면 실패.
// 보호 목록은 하드코딩하지 않고 **index.css 에서 직접 파싱한다** — CSS 쪽에서 규칙을
// 지우면 그 배경을 쓰는 컴포넌트가 즉시 빨간불이 되는 양방향 계약이다.
//
// 한계(의도된 범위): 문자열 리터럴 하나 안에서만 본다. text-white 와 bg-* 가 서로 다른
// 문자열 조각에서 합쳐지는 경우는 못 본다 — 과거 사고 두 건 모두 한 문자열 안의 조합이었다.
// 인라인 style 배경과 알파 변형(text-white/70)의 다른 구멍 두 개는
// accent-bg-white-text.metatest.test.ts 가 따로 지킨다.

const textWhiteContract = {
  name: 'REGRESSION #62: text-white 는 라이트 모드에서도 어두운 배경과 함께면 index.css 보호 목록에 있어야 한다 (라이트 모드 흰 글씨 실종 계약)',
  cssFile: 'src/index.css',
  roots: ['src'],
  extensions: ['.ts', '.tsx'],
};

/**
 * index.css 에서 보호 목록을 파싱한다.
 * - `[class*='bg-…']` 규칙은 CSS 와 같은 "부분 문자열" 의미로 본다.
 * - `.bg-sp-…` 규칙은 정확한 클래스 토큰 의미로 본다.
 */
function parseTextWhiteProtectionList(css) {
  const substrings = new Set();
  for (const m of css.matchAll(/\.theme-light\s+\[class\*='(bg-[^']+)'\]\.text-white/g)) {
    substrings.add(m[1]);
  }
  const exact = new Set();
  for (const m of css.matchAll(/\.theme-light\s+\.(bg-sp-[a-z-]+)\.text-white/g)) {
    exact.add(m[1]);
  }
  // 액센트 자동 대비 규칙(.bg-sp-accent.text-white)은 테마 무관 전역이라 따로 본다.
  if (/\.bg-sp-accent\.text-white/.test(css)) exact.add('bg-sp-accent');
  return { substrings, exact };
}

/** 색이 아닌 bg-* 유틸리티 (background-size/position/repeat 등) — 검사 대상이 아니다. */
const NON_COLOR_BG =
  /^bg-(none|auto|cover|contain|fixed|local|scroll|clip-|origin-|no-repeat|repeat|bottom|top|left|right|center|blend-|opacity-)/;

/** 라이트 모드에서 밝은 배경 — 흰 글씨를 어두운 글씨로 뒤집는 기본 동작이 옳다. */
const LIGHT_SAFE_BG = /^bg-(white|transparent|current|inherit)\b/;

/**
 * 테마 토큰 중 라이트 모드에서도 진하게 남는 것들 — 보호 목록에 있어야 한다.
 * (sp-surface·sp-card 같은 나머지 sp 토큰은 라이트에서 밝아지므로 뒤집는 게 맞다.
 * 라이트에서도 어두운 sp 토큰을 새로 만들면 여기와 index.css 에 함께 올릴 것.)
 */
const DARK_SP_TOKENS = new Set(['bg-sp-accent', 'bg-sp-error', 'bg-sp-highlight']);

/** 이 배경 토큰이 text-white 와 만나면 보호 목록이 필요한가. */
function bgNeedsProtection(token) {
  if (NON_COLOR_BG.test(token) || LIGHT_SAFE_BG.test(token)) return false;
  if (token.startsWith('bg-sp-')) return DARK_SP_TOKENS.has(token);
  // 중립색 50~500 은 라이트 모드에서 밝은 면이라 뒤집는 게 맞다 — index.css 의
  // "회색 계열은 어두운 구간(600~900)만 잡는다. 500 이하는 …" 정책과 같은 기준.
  const neutral = token.match(/^bg-(gray|slate|zinc|neutral|stone)-(\d+)/);
  if (neutral) return Number(neutral[2]) >= 600;
  // 나머지 전부 — 팔레트 유채색, bg-black, bg-[임의값], bg-gradient-*(색이 from-* 에
  // 있어 보호 목록이 못 잡는다) — 는 위험으로 보고, 목록에 없으면 사람이 판단하게 한다.
  return true;
}

/**
 * 주석을 공백으로 바꾸되 **줄 수는 보존**한다 — 실패 위치를 줄 번호로 보여주기 위해.
 * (stripComments 와 같은 이유로 필요하다: 사고 설명 주석에 금지 조합을 예시로 적으면
 * 설명을 잘 달수록 빨간불이 된다. `https://` 보호도 동일.)
 */
function stripCommentsKeepLines(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

function runTextWhiteContract() {
  const css = readFileSafe(join(ROOT, textWhiteContract.cssFile));
  if (css === null) {
    return { ok: false, scanned: 0, problems: [`${textWhiteContract.cssFile} 을 읽지 못했다`] };
  }

  const { substrings, exact } = parseTextWhiteProtectionList(css);
  // 파싱 실패(셀렉터 형식 변경 등)가 조용히 "전부 위반"으로 보이지 않게 형태부터 확인한다.
  if (substrings.size < 10 || !exact.has('bg-sp-accent')) {
    return {
      ok: false,
      scanned: 0,
      problems: [
        `index.css 보호 목록 파싱 실패 — 부분일치 ${substrings.size}건, 정확일치 [${[...exact].join(', ')}]. ` +
          '셀렉터 형식을 바꿨다면 parseTextWhiteProtectionList 를 함께 고칠 것.',
      ],
    };
  }

  const files = textWhiteContract.roots
    .flatMap((root) => walk(join(ROOT, root), textWhiteContract.extensions, []))
    .filter((f) => !/\.(test|spec)\.tsx?$/.test(f));

  const problems = [];
  for (const file of files) {
    const raw = readFileSafe(file);
    if (raw === null) continue;
    const src = stripCommentsKeepLines(raw);

    // 문자열 리터럴(따옴표 3종)을 훑는다. 템플릿 리터럴은 안쪽 분기 문자열까지
    // 한 덩어리로 잡히므로, 따옴표를 공백으로 바꿔 토큰 경계로 만든 뒤 본다.
    const literalRe = /(["'`])((?:(?!\1)[\s\S])*)\1/g;
    let m;
    while ((m = literalRe.exec(src))) {
      const normalized = m[2].replace(/['"`]/g, ' ');
      // 뒤집기 규칙(.theme-light .text-white)은 정확한 text-white 토큰에만 걸린다 —
      // hover:text-white 와 text-white/70 은 별도 규칙 소관이라 여기서 안 본다.
      if (!/(^|\s)text-white(?=\s|$)/.test(normalized)) continue;

      const bgTokens = [...normalized.matchAll(/(?:^|\s)(bg-[^\s]+)/g)].map((t) => t[1]);
      const dangerous = bgTokens.filter(bgNeedsProtection);
      if (dangerous.length === 0) continue;

      const isProtected =
        [...substrings].some((s) => normalized.includes(s)) ||
        [...exact].some((t) => new RegExp(`(^|\\s)${t}(?=\\s|$)`).test(normalized));
      if (isProtected) continue;

      const line = src.slice(0, m.index).split('\n').length;
      const rel = relative(ROOT, file).split(sep).join('/');
      problems.push(`${rel}:${line}  text-white + ${dangerous.join(', ')}`);
    }
  }

  return { ok: problems.length === 0, scanned: files.length, problems };
}

// ============================================================
// 계약 검사 — REGRESSION #64: 떠 있는 면 × data-sp-floating
// ============================================================
//
// 유리를 켜면 index.css 규칙 ① 이 "카드 안 카드"의 배경을 지운다(겹친 면이 두 번 칠해져
// 다시 불투명해지는 것을 막는 규칙이다). 그런데 드롭다운·팝오버처럼 **위에 떠서 아래를
// 가려야 하는 면**도 카드 안에 있으면 똑같이 걸려, 배경이 통째로 사라진다.
//
// 실제 사고가 세 번 반복됐다:
//   - 2026-08-23  할 일 수정 창의 달력 팝오버
//   - 2026-08-28  설정 > 학교 정보 검색 결과 — 뒤 "학년/반"·"담당 과목" 글자와 겹쳐 읽힘
//                 (실측 배경색 rgba(0,0,0,0) — 반투명이 아니라 아예 없었다)
//   - 같은 날 훑어보니 날씨 지역 검색·대시보드 일정 필터도 같은 상태였다
//
// 처방은 data-sp-floating 표시 하나인데, 붙이는 것을 잊으면 **조용히** 투명해진다.
// 화면을 열어 보기 전까지 아무도 모른다. 그래서 사람의 기억 대신 이 검사가 지킨다.
//
// 검사: 한 JSX 여는 태그 안에서 bg-sp-card 와 위치 클래스(absolute/fixed)가 같이 쓰였는데
// 그 태그에 data-sp-floating / data-sp-overlay-surface / role="dialog" 중 아무것도 없으면 실패.
// (뒤 두 가지도 결과적으로 불투명하게 되돌리므로 통과로 본다 — index.css 규칙 ⑥ 소관.)
//
// 대상은 유리가 켜지는 **데스크톱 메인 창**뿐이다. useGlassSurface() 를 부르는 곳은
// src/App.tsx 한 곳이라, src/mobile · src/student 에는 sp-glass-on 이 붙지 않는다.
//
// 한계(의도된 범위):
//   - bg-sp-card/80 처럼 투명도 수식이 붙은 것은 보지 않는다. 그쪽은 애초에 배경색이
//     칠해지지 않는 별개 결함이고(sp-* 토큰은 Tailwind 알파 수식을 지원하지 않는다),
//     "원래 얼마나 진해야 하는가"라는 디자인 판단이 필요해 이 검사로 강제할 수 없다.
//   - 클래스가 변수·헬퍼를 거쳐 조립되면 못 본다. 사고 세 건 모두 태그 안에 직접 쓰여 있었다.

const floatingContract = {
  name: 'REGRESSION #64: 유리에서 떠 있는 면(bg-sp-card + absolute/fixed)은 data-sp-floating 을 달아야 한다 (드롭다운 유령 상자 계약)',
  cssFile: 'src/index.css',
  // 유리가 켜지는 창에서 렌더되는 곳만. mobile/student 는 sp-glass-on 이 붙지 않는다.
  roots: ['src/adapters', 'src/widgets'],
  extensions: ['.tsx'],
};

/** 통과로 인정하는 표시들. index.css 에서 직접 읽어 양방향 계약으로 만든다. */
function parseFloatingMarkers(css) {
  const markers = new Set();
  if (/\[data-sp-floating\]\.bg-sp-card/.test(css)) markers.add('data-sp-floating');
  if (/\[data-sp-overlay-surface\]/.test(css)) markers.add('data-sp-overlay-surface');
  if (/\[role='dialog'\]\.bg-sp-card/.test(css)) markers.add('role-dialog');
  return markers;
}

/**
 * src 안의 JSX 여는 태그를 하나씩 떼어 준다.
 *
 * 문자열·템플릿 리터럴 안의 <, > 와 중괄호 식({cond ? ... : ...}) 안의 > 에 속지 않아야
 * 한다. 그래서 따옴표와 중괄호 깊이를 함께 따라간다.
 */
function* iterateJsxOpenTags(src) {
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== '<') continue;
    // </div> 닫는 태그와 a < b 같은 비교식은 건너뛴다. 여는 태그는 <Name 또는 <name 이다.
    if (!/[A-Za-z]/.test(src[i + 1] ?? '')) continue;
    let depth = 0;
    let quote = null;
    let j = i + 1;
    for (; j < src.length; j++) {
      const c = src[j];
      if (quote) {
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        quote = c;
        continue;
      }
      if (c === '{') {
        depth++;
        continue;
      }
      if (c === '}') {
        depth--;
        continue;
      }
      if (c === '<' && depth === 0) break; // 태그가 안 닫혔다 — 포기하고 다음으로
      if (c === '>' && depth === 0) {
        yield { text: src.slice(i, j + 1), index: i };
        break;
      }
    }
    i = j;
  }
}

/**
 * 태그 안에 쓰인 클래스 토큰을 모은다.
 *
 * 정규식을 문자열로 조립하지 않는 이유: 이스케이프가 한 겹 삼켜지면(`\\s` → `\s`)
 * 공백 대신 글자 `s` 를 찾게 되어 **아무것도 매치하지 않고 조용히 전부 통과**한다.
 * 실제로 이 검사를 처음 넣을 때 그 상태로 "52건 통과"가 나왔다.
 * 그래서 토큰을 직접 쪼개 집합으로 비교한다 — 이스케이프가 끼어들 자리가 없다.
 *
 * 따옴표 3종 구간을 모두 모으므로 `className={cond ? 'a' : 'b'}` 처럼 조건부로
 * 붙는 클래스도 함께 본다.
 */
function classTokens(tagText) {
  const tokens = new Set();
  for (const m of tagText.matchAll(/(["'`])((?:(?!\1)[\s\S])*)\1/g)) {
    for (const t of m[2].split(/\s+/)) {
      if (t) tokens.add(t);
    }
  }
  return tokens;
}

function runFloatingContract() {
  const css = readFileSafe(join(ROOT, floatingContract.cssFile));
  if (css === null) {
    return { ok: false, scanned: 0, problems: [floatingContract.cssFile + ' 을 읽지 못했다'] };
  }

  const markers = parseFloatingMarkers(css);
  // 파싱 실패(선택자 형식 변경 등)가 조용히 "전부 위반"으로 보이지 않게 형태부터 확인한다.
  if (!markers.has('data-sp-floating')) {
    return {
      ok: false,
      scanned: 0,
      problems: [
        'index.css 에서 [data-sp-floating].bg-sp-card 규칙을 찾지 못했다. ' +
          '규칙 ①-예외를 지웠거나 이름을 바꿨다면 parseFloatingMarkers 를 함께 고칠 것.',
      ],
    };
  }

  const files = floatingContract.roots
    .flatMap((root) => walk(join(ROOT, root), floatingContract.extensions, []))
    .filter((f) => !/\.(test|spec)\.tsx?$/.test(f));

  const problems = [];
  for (const file of files) {
    const rawSrc = readFileSafe(file);
    if (rawSrc === null) continue;
    const src = stripCommentsKeepLines(rawSrc);

    for (const tag of iterateJsxOpenTags(src)) {
      const tokens = classTokens(tag.text);
      if (!tokens.has('bg-sp-card')) continue;
      if (!tokens.has('absolute') && !tokens.has('fixed')) continue;

      const marked =
        /\bdata-sp-floating\b/.test(tag.text) ||
        (markers.has('data-sp-overlay-surface') && /\bdata-sp-overlay-surface\b/.test(tag.text)) ||
        (markers.has('role-dialog') && /role=(["'])dialog\1/.test(tag.text));
      if (marked) continue;

      const line = src.slice(0, tag.index).split('\n').length;
      const rel = relative(ROOT, file).split(sep).join('/');
      problems.push(rel + ':' + line + '  ' + tag.text.replace(/\s+/g, ' ').slice(0, 90));
    }
  }

  return { ok: problems.length === 0, scanned: files.length, problems };
}

// ============================================================
// Glob walker (의존성 0)
// ============================================================

function walk(dir, exts, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      // node_modules / dist 등 무시
      if (
        ent.name === 'node_modules' ||
        ent.name === 'dist' ||
        ent.name === 'dist-electron' ||
        ent.name === 'release'
      ) {
        continue;
      }
      walk(full, exts, acc);
    } else if (ent.isFile()) {
      if (exts.some((e) => ent.name.endsWith(e))) {
        acc.push(full);
      }
    }
  }
  return acc;
}

function readFileSafe(path) {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

// ============================================================
// 추적 금지 경로 검사 (git 이 실제로 무엇을 들고 있는지 확인)
// ============================================================
//
// REGRESSION #52 (2026-08-14): 이 저장소는 공개(GPL)다. 학생 이름·생기부·점수가 든
// 파일이 한 번 올라가면 이력·포크·크롤러에 남아 되돌릴 수 없다.
//
// 실제 사고: 다른 작업 도중 `git add .` 로 문서 1,013개(187MB)가 통째로 스테이징됐고,
// 그 안에 생기부 표본·학생명렬표·시험점수·자리배치도·사용자 문의 메일이 섞여 있었다.
// 커밋 직전에 발견해 되돌렸다. 일부는 과거 커밋(b1d4f641)에서 일부러 지웠던 파일이라,
// 지우는 것만으로는 재발을 막지 못한다는 뜻이다.
//
// .gitignore 만으로는 부족하다. 이미 추적 중인 파일에는 효력이 없고, `git add -f` 로
// 우회된다. 그래서 여기서는 파일 내용이 아니라 **git 이 실제로 추적하는 목록**을 본다.
const forbiddenTrackedPaths = [
  {
    name: 'REGRESSION #52: 학생 개인정보가 든 표본 문서는 공개 저장소에 추적되면 안 된다',
    // git pathspec. 디렉터리를 주면 그 아래 전부를 뜻한다.
    paths: ['docs/markdown-converter-test-docs', 'docs/sample-scores', 'docs/edzip/제출서식'],
    // 이미 추적 중이지만 사람이 열어 보고 "실제 학생 정보 아님"을 확인한 파일.
    // 2026-08-14 확인: 두 파일 모두 제목이 "… 성적표 (가상)" 이고 이름도 예시 이름이다.
    // 성적 분석 기능(1ddba40a)의 시험용 표본이라 추적이 맞다.
    // 새 파일을 여기 넣으려면 반드시 먼저 열어서 실제 학생 정보가 없는지 확인할 것.
    allowTracked: [
      'docs/sample-scores/2-1-1회고사-점수.xlsx',
      'docs/sample-scores/2-1-2회고사-점수.xlsx',
    ],
    hint: '.gitignore 에 이미 등재돼 있다. 추적되고 있다면 `git add -f` 로 우회했거나 과거에 추적된 파일이다. `git rm --cached <경로>` 로 추적만 해제할 것(디스크 파일은 남는다). 실제 학생 정보가 아님을 직접 확인했다면 이 검사의 allowTracked 에 근거와 함께 추가할 것.',
  },
];

// ============================================================
// 실행
// ============================================================

let failed = 0;
let passed = 0;
const failures = [];

// --- 존재 검사 ---
for (const c of presenceChecks) {
  const fullPath = join(ROOT, c.file);
  const content = readFileSafe(fullPath);
  if (content === null) {
    console.error(`X ${c.name} — file not found: ${c.file}`);
    failed++;
    failures.push({ name: c.name, reason: 'file not found' });
    continue;
  }
  if (!c.pattern.test(content)) {
    console.error(`X ${c.name} — pattern not found in ${c.file}`);
    failed++;
    failures.push({ name: c.name, reason: `pattern missing in ${c.file}` });
  } else {
    console.log(`OK ${c.name}`);
    passed++;
  }
}

// --- 부재 검사 ---
/**
 * 주석을 걷어낸다 — `stripComments: true` 인 검사에만 쓴다.
 *
 * 왜 필요한가: "이걸 쓰지 마라"를 금지하는 검사일수록, 그 이유를 설명하는 주석에
 * **금지 대상을 예시로 적게 된다.** 그러면 설명이 잘 달린 파일일수록 검사에 걸린다
 * (실제 발생: `todoTime.ts` 가 "왜 시계를 직접 읽지 않는가"를 설명하다 자기 규칙에 걸렸다).
 *
 * `https://` 가 잘려 나가지 않도록 `//` 앞에 콜론이 없을 때만 줄 주석으로 본다.
 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

for (const c of absenceChecks) {
  const allFiles = c.roots.flatMap((root) => walk(join(ROOT, root), c.extensions, []));
  const files = c.fileFilter ? allFiles.filter((f) => c.fileFilter(f)) : allFiles;

  let hits = [];
  for (const file of files) {
    const raw = readFileSafe(file);
    if (raw === null) continue;
    const content = c.stripComments ? stripComments(raw) : raw;
    for (const pat of c.patterns) {
      if (pat.test(content)) {
        const rel = relative(ROOT, file).split(sep).join('/');
        hits.push(`${rel}  (matches /${pat.source}/${pat.flags})`);
      }
    }
  }
  // ★ 0개를 훑고 초록이 되지 않게 한다 (2026-08-31).
  //   walk() 는 없는 디렉터리를 만나면 조용히 [] 를 돌려주므로(위 try/catch), roots 에 오타가
  //   나거나 나중에 폴더 이름이 바뀌면 **검사가 아무것도 안 지키면서 계속 통과한다.**
  //   개인정보 게이트(#66)처럼 "막고 있다"를 믿고 쓰는 검사에서 이건 조용한 무력화다.
  const minScanned = c.minScanned ?? 1;
  if (files.length < minScanned) {
    console.error(
      `X ${c.name}\n     - 훑은 파일이 ${files.length}개다 (최소 ${minScanned}). roots=${c.roots.join(', ')} 경로가 살아 있는지 확인하라.`,
    );
    failed++;
    failures.push({ name: c.name, hits: [`scanned ${files.length} file(s)`] });
    continue;
  }

  if (hits.length > 0) {
    console.error(`X ${c.name}`);
    for (const hit of hits) {
      console.error(`     - ${hit}`);
    }
    failed++;
    failures.push({ name: c.name, hits });
  } else {
    console.log(`OK ${c.name}  (scanned ${files.length} file(s))`);
    passed++;
  }
}

// --- 계약 검사: text-white × 라이트 모드 보호 목록 ---
{
  const result = runTextWhiteContract();
  if (!result.ok) {
    console.error(`X ${textWhiteContract.name}`);
    for (const p of result.problems.slice(0, 30)) {
      console.error(`     - ${p}`);
    }
    if (result.problems.length > 30) {
      console.error(`     ... 외 ${result.problems.length - 30}건`);
    }
    console.error(
      '     → 그 배경이 라이트 모드에서도 어둡게 남는 게 맞으면 src/index.css 보호 목록에 규칙을 추가하고,',
    );
    console.error(
      '       테마를 따라 밝아지는 배경이면 text-white 대신 테마 글자색(text-sp-* 등)을 쓸 것.',
    );
    failed++;
    failures.push({ name: textWhiteContract.name, hits: result.problems });
  } else {
    console.log(`OK ${textWhiteContract.name}  (scanned ${result.scanned} file(s))`);
    passed++;
  }
}

// --- 계약 검사: 떠 있는 면 × data-sp-floating ---
{
  const result = runFloatingContract();
  if (!result.ok) {
    console.error(`X ${floatingContract.name}`);
    for (const p of result.problems.slice(0, 30)) {
      console.error(`     - ${p}`);
    }
    if (result.problems.length > 30) {
      console.error(`     ... 외 ${result.problems.length - 30}건`);
    }
    console.error(
      '     → 드롭다운·팝오버·메뉴처럼 다른 내용 위에 뜨는 면이면 여는 태그에 data-sp-floating 을 달 것.',
    );
    console.error(
      '       (유리를 켜면 index.css 규칙 ① 이 카드 안 배경을 지워, 표시가 없으면 그림자만 남은 유령 상자가 된다.)',
    );
    console.error(
      '       배경이 비쳐도 되는 장식용 면이라면 bg-sp-card 대신 다른 표현을 쓰거나 이 검사에 근거와 함께 예외를 남길 것.',
    );
    failed++;
    failures.push({ name: floatingContract.name, hits: result.problems });
  } else {
    console.log(`OK ${floatingContract.name}  (scanned ${result.scanned} file(s))`);
    passed++;
  }
}

// --- 추적 금지 경로 검사 ---
for (const c of forbiddenTrackedPaths) {
  let tracked;
  try {
    const out = execFileSync('git', ['ls-files', '-z', '--', ...c.paths], {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    // 한글 파일명은 자모 결합 방식이 두 가지라(NFC/NFD) 글자가 같아도 문자열 비교가 어긋난다.
    // 양쪽을 같은 방식으로 맞춘 뒤 비교한다.
    const allowed = new Set((c.allowTracked ?? []).map((f) => f.normalize('NFC')));
    tracked = out
      .split('\0')
      .filter(Boolean)
      .filter((f) => !allowed.has(f.normalize('NFC')));
  } catch {
    // git 이 없거나 저장소가 아니면(배포용 압축본 등) 검사할 대상 자체가 없다.
    // 조용히 넘기지 않고 눈에 띄게 남긴다 — 개수가 줄면 왜 줄었는지 알 수 없기 때문.
    console.log(`OK ${c.name}  (git 저장소가 아니라 건너뜀)`);
    passed++;
    continue;
  }

  if (tracked.length > 0) {
    console.error(`X ${c.name}`);
    console.error(`     추적 중인 파일 ${tracked.length}개:`);
    for (const f of tracked.slice(0, 20)) {
      console.error(`     - ${f}`);
    }
    if (tracked.length > 20) {
      console.error(`     ... 외 ${tracked.length - 20}개`);
    }
    console.error(`     → ${c.hint}`);
    failed++;
    failures.push({ name: c.name, hits: tracked });
  } else {
    console.log(`OK ${c.name}  (검사 경로 ${c.paths.length}개, 추적 0건)`);
    passed++;
  }
}

console.log('');
console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);

if (failed > 0) {
  console.error('');
  console.error('===========================================================');
  console.error('Regression check FAILED. See Design v2.1 §10.6 / §11.3.');
  console.error('===========================================================');
  process.exit(1);
}
console.log(`All ${passed} regression checks passed.`);
process.exit(0);
