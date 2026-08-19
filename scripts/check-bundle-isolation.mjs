#!/usr/bin/env node
/**
 * 번들 격리 게이트 — 학생 SPA 에 특정 코드 누설 차단 + 교사 SPA 에 존재 확인.
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
/**
 * 감시 대상. 각 항목은 **학생 SPA 에 0회, 교사 SPA 에 1회 이상** 이어야 한다.
 *
 * ⚠️ needle 은 **압축(minify)에도 살아남는 문자열**이어야 한다.
 * 클래스·함수 이름은 압축 과정에서 바뀔 수 있으므로 쓰면 안 되고,
 * 패키지 이름이나 저장 경로 같은 문자열 리터럴을 쓴다.
 */
const NEEDLES = [
  {
    needle: 'exceljs',
    studentLeakHint: "XlsxExporter.ts 의 `await import('exceljs')` 경로를 확인하라.",
    teacherMissingHint:
      'XlsxExporter 가 호출되는 모든 코드 경로가 dead-code-eliminated 됐는지 확인하라.',
  },
  {
    // 학생 얼굴 사진. 학생 화면에 "지금은 안 뜬다"가 아니라 "뜨게 만들 수 없다"를 보장한다 —
    // 사진 바이트가 화면으로 들어오는 유일한 관문이 이 저장 경로이므로,
    // 학생 번들에 이 문자열이 없으면 사진을 렌더할 방법이 원리적으로 없다.
    needle: 'student-photos',
    studentLeakHint:
      '학생 화면이 사진 저장소에 닿았다. StudentApp 계열에서 DI 컨테이너(studentPhotoRepository) 로 이어지는 import 를 끊어라.',
    teacherMissingHint:
      '교사 앱에서 학생 사진 저장소가 통째로 트리셰이킹됐다 — 이름 학습 사진 기능이 끊겼는지 확인하라.',
  },
];

/**
 * @param {string} dir
 * @param {string} needle
 * @returns {boolean} true if any `.js` file inside contains `needle`.
 */
function anyJsContainsNeedle(dir, needle) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  for (const f of files) {
    const content = readFileSync(join(dir, f), 'utf-8');
    if (content.toLowerCase().includes(needle)) return true;
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

for (const { needle, studentLeakHint, teacherMissingHint } of NEEDLES) {
  if (anyJsContainsNeedle(STUDENT_DIST, needle)) {
    fail(1, `학생 SPA 번들에 '${needle}' 발견 — 격리 깨짐. ${studentLeakHint}`);
  }
  if (!anyJsContainsNeedle(TEACHER_DIST, needle)) {
    fail(
      1,
      `교사 SPA 번들에 '${needle}' 부재 — 게이트가 헛돌 위험 (vacuous-gate prevention). ${teacherMissingHint}`,
    );
  }
}

ok(
  `감시 대상 ${NEEDLES.length}건(${NEEDLES.map((n) => n.needle).join(', ')}) 모두 학생 SPA 부재 + 교사 SPA 존재.`,
);
