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
    // REGRESSION #28 (2026-05-23): native-desktop modal text input should try
    // in-place Win32 focus first. Falling straight back to topmost reintroduces
    // the visible widget-window flicker on the first input click.
    file: 'electron/main.ts',
    pattern: /focusForKeyboard[\s\S]{0,700}?native-desktop focus in place/,
    name: 'REGRESSION #28: native-desktop modal input uses in-place focus before topmost fallback',
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
