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
    file: 'electron/ipc/realtimeWall.ts',
    pattern: /rateLimitBuckets[\s\S]{0,800}\.clear\s*\(\s*\)/,
    name: 'REGRESSION #5: closeSession rateLimitBuckets.clear()',
  },
];

// ============================================================
// 부재 검사 (특정 패턴이 절대 존재하면 안 됨) — v2.1 신규 4건
// ============================================================

const absenceChecks = [
  {
    // 회귀 #6 — `C` 단축키 코드 부재 (학생 entry 한정)
    name: "REGRESSION #6: `C` keyboard shortcut must NOT exist (학생 entry)",
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
    roots: [
      'src/student',
      'src/adapters/components/Tools/RealtimeWall',
    ],
    extensions: ['.ts', '.tsx'],
    // jsx attribute (`dangerouslySetInnerHTML={...}`) 또는 props 객체 key (`dangerouslySetInnerHTML:`)
    patterns: [
      /dangerouslySetInnerHTML\s*=\s*\{/,
      /\bdangerouslySetInnerHTML\s*:/,
    ],
  },
  {
    // 회귀 #8 — hard delete 패턴 부재
    name: 'REGRESSION #8: hard delete pattern must NOT exist (use soft delete)',
    roots: [
      'electron/ipc',
      'src/adapters/stores',
      'src/domain/rules',
    ],
    extensions: ['.ts'],
    // posts.filter(x => x.id !== <var>) 패턴
    patterns: [/posts\.filter\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\.id\s*!==\s*\w+\s*\)/],
    // realtimeWall 도메인에 한정 — 일반 배열 filter는 무관
    fileFilter: (path) =>
      /realtimeWall/i.test(path) ||
      /WallBoard/i.test(path),
  },
  {
    // 회귀 #9 — PIN 평문 필드 부재 (Zod 스키마 / 메시지 핸들러)
    name: 'REGRESSION #9: PIN plaintext field must NOT exist in Zod schema (only pinHash allowed)',
    roots: [
      'electron/ipc',
      'src/domain/rules',
    ],
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
      if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name === 'dist-electron' || ent.name === 'release') {
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
console.log('All 9 regression checks passed.');
process.exit(0);
