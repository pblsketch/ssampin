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
];

// ============================================================
// 부재 검사 (특정 패턴이 절대 존재하면 안 됨) — v2.1 신규 4건
// ============================================================

const absenceChecks = [
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
];

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
for (const c of absenceChecks) {
  const allFiles = c.roots.flatMap((root) => walk(join(ROOT, root), c.extensions, []));
  const files = c.fileFilter ? allFiles.filter((f) => c.fileFilter(f)) : allFiles;

  let hits = [];
  for (const file of files) {
    const content = readFileSafe(file);
    if (content === null) continue;
    for (const pat of c.patterns) {
      if (pat.test(content)) {
        const rel = relative(ROOT, file).split(sep).join('/');
        hits.push(`${rel}  (matches /${pat.source}/${pat.flags})`);
      }
    }
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
