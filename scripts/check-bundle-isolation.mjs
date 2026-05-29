#!/usr/bin/env node
/**
 * 번들 격리 게이트 — 학생 SPA 에 exceljs 누설 차단 + 교사 SPA 에 exceljs 존재 확인.
 *
 * 동작 원칙: two-way assertion (vacuous-gate prevention).
 * - 학생 SPA(dist-student/assets/*.js) 에 'exceljs' 0회 등장
 * - 교사 SPA(dist/assets/*.js) 에 'exceljs' 1회 이상 등장 (dynamic import 가 끊긴 경우 즉시 감지)
 *
 * Exit codes (5-state matrix, Plan §4 H2 / Delta v3.1 OC-5):
 *   0 — clean: exceljs in teacher dist AND absent from student dist
 *   1 — exceljs leaked into dist-student/assets/*.js
 *   1 — exceljs MISSING from dist/assets/*.js (dynamic import severed → vacuous gate 위험)
 *   2 — dist-student/assets/ directory does not exist
 *   2 — dist/assets/ directory does not exist
 *
 * 실행: `node scripts/check-bundle-isolation.mjs`
 * CI wire: `package.json` postbuild hook.
 *
 * NOTE: 본 스크립트는 teacher app(`dist/`)와 student app(`dist-student/`) 두 vite build
 * 산출물을 모두 요구한다. `npm run build` 가 두 vite 빌드를 모두 실행하므로 postbuild 안전.
 * `npm run build:student` 단독 실행 후에는 dist/ 부재로 exit 2 가 발생할 수 있다.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const TEACHER_DIST = resolve('dist/assets');
const STUDENT_DIST = resolve('dist-student/assets');
const NEEDLE = 'exceljs';

/**
 * @param {string} dir
 * @returns {boolean} true if any `.js` file inside contains `NEEDLE`.
 */
function anyJsContainsNeedle(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  for (const f of files) {
    const content = readFileSync(join(dir, f), 'utf-8');
    if (content.toLowerCase().includes(NEEDLE)) return true;
  }
  return false;
}

function fail(code, message) {
  console.error(`✗ bundle-isolation gate FAIL (exit ${code}): ${message}`);
  process.exit(code);
}

function ok(message) {
  console.log(`✓ bundle-isolation gate PASS: ${message}`);
  process.exit(0);
}

// --- gate ---

if (!existsSync(STUDENT_DIST)) {
  fail(
    2,
    `학생 SPA 빌드 디렉토리 부재 (${STUDENT_DIST}). 먼저 \`npm run build:student\` 또는 \`npm run build\` 실행 필요.`,
  );
}
if (!existsSync(TEACHER_DIST)) {
  fail(
    2,
    `교사 SPA 빌드 디렉토리 부재 (${TEACHER_DIST}). 먼저 \`npm run build\` 실행 필요 (vite build 가 dist/ 산출).`,
  );
}

const studentLeak = anyJsContainsNeedle(STUDENT_DIST);
if (studentLeak) {
  fail(
    1,
    `학생 SPA 번들에 '${NEEDLE}' 발견 — dynamic import 격리 깨짐. XlsxExporter.ts 의 \`await import('exceljs')\` 경로를 확인하라.`,
  );
}

const teacherHasNeedle = anyJsContainsNeedle(TEACHER_DIST);
if (!teacherHasNeedle) {
  fail(
    1,
    `교사 SPA 번들에 '${NEEDLE}' 부재 — XlsxExporter dynamic import 가 의도치 않게 끊겨 있을 수 있음 (vacuous-gate prevention). XlsxExporter 가 호출되는 모든 코드 경로가 dead-code-eliminated 됐는지 확인하라.`,
  );
}

ok(
  `학생 SPA(${STUDENT_DIST}) 에 '${NEEDLE}' 부재 + 교사 SPA(${TEACHER_DIST}) 에 '${NEEDLE}' 존재.`,
);
