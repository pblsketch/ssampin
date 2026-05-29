/**
 * 번들 격리 게이트 (vitest leg) — exceljs 가 학생 SPA 번들에 누설되지 않음 + 교사 SPA 에는 존재.
 *
 * 동작 = 파일 바이트 검증 (CLAUDE.md P3). silent skip 금지 (Plan §4 H2 / Delta v3.1 OC-5):
 * - 4건의 silent-skip 분기(line 19/31/42/45 in former impl)는 throw 로 교체되었다.
 * - dist-student/assets/ 또는 dist/assets/ 부재 시 즉시 throw — actionable message로 빌드 안내.
 * - 본 테스트는 CI postbuild + `npm run check:bundle-isolation` 의 sibling.
 *   (CI 게이트 진실성은 `scripts/check-bundle-isolation.mjs` 가 책임. 본 vitest leg 는 로컬-dev convenience.)
 *
 * Two-way assertion (vacuous gate prevention):
 *   (a) 학생 SPA 번들에 'exceljs' 0회 등장 (negative)
 *   (b) 교사 SPA 번들에 'exceljs' 1회 이상 등장 (positive — dynamic import 가 끊긴 경우 즉시 감지)
 *
 * 기존 PASS 분기:
 *   (c) 학생 SPA gzip 크기가 baseline + growthBudget 이하 (regression gate)
 *
 * Plan §4 H2 / AC `bundle-01` two-way + `bundle-02` baseline-delta.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';

const TEACHER_DIST = path.resolve('dist/assets');
const STUDENT_DIST = path.resolve('dist-student/assets');
const BASELINE_PATH = path.resolve('tests/fixtures/student-bundle-baseline.json');

const NEEDLE = /exceljs/i;

function readJsFiles(dir: string): string[] {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
}

function anyJsContains(dir: string, needle: RegExp): boolean {
  const files = readJsFiles(dir);
  for (const f of files) {
    const content = fs.readFileSync(path.join(dir, f), 'utf-8');
    if (needle.test(content)) return true;
  }
  return false;
}

describe('XlsxExporter — bundle isolation (Plan §4 H2 / OC-5)', () => {
  it('학생 SPA 번들(dist-student/assets) 에 exceljs 0회 등장 [negative]', () => {
    if (!fs.existsSync(STUDENT_DIST)) {
      throw new Error(
        `bundle isolation gate requires student build first — 디렉토리 부재: ${STUDENT_DIST}. ` +
          `먼저 \`npm run build:student\` 또는 \`npm run build\` 를 실행하라. ` +
          `silent skip 은 금지(Plan §4 H2 / Delta v3.1 OC-5).`,
      );
    }
    const files = readJsFiles(STUDENT_DIST);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const content = fs.readFileSync(path.join(STUDENT_DIST, f), 'utf-8');
      expect(
        content,
        `학생 SPA 번들 ${f} 에 'exceljs' 등장 — dynamic import 격리 깨짐`,
      ).not.toMatch(NEEDLE);
    }
  });

  it('교사 SPA 번들(dist/assets) 에 exceljs 1회 이상 등장 [positive — vacuous gate prevention]', () => {
    if (!fs.existsSync(TEACHER_DIST)) {
      throw new Error(
        `bundle isolation gate requires teacher build first — 디렉토리 부재: ${TEACHER_DIST}. ` +
          `먼저 \`npm run build\` 를 실행하라 (vite build 가 dist/ 산출). ` +
          `silent skip 은 금지(Plan §4 H2 / Delta v3.1 OC-5).`,
      );
    }
    const present = anyJsContains(TEACHER_DIST, NEEDLE);
    expect(
      present,
      `교사 SPA 번들에 'exceljs' 부재 — XlsxExporter dynamic import 가 의도치 않게 끊겨 있을 수 있음. ` +
        `(vacuous-gate prevention: 학생 SPA 격리 검증이 무의미해지지 않도록 positive 한도를 보장한다.)`,
    ).toBe(true);
  });

  it('학생 SPA bundle gzip 크기가 baseline + growthBudget 이하 [bundle-02 regression]', () => {
    if (!fs.existsSync(STUDENT_DIST)) {
      throw new Error(
        `bundle-02 baseline gate requires student build first — 디렉토리 부재: ${STUDENT_DIST}.`,
      );
    }
    if (!fs.existsSync(BASELINE_PATH)) {
      throw new Error(
        `baseline JSON 부재: ${BASELINE_PATH}. ` +
          `Plan §4 H5 / Step 5.5 의 fixture 가 누락됐다 — 첫 빌드 후 capture 필요.`,
      );
    }

    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8')) as {
      files: Array<{ name?: string; gzipBytes: number }>;
      growthBudget: { absoluteBytes: number };
    };

    const studentJs = readJsFiles(STUDENT_DIST).find((f) => f.startsWith('student-'));
    if (!studentJs) {
      throw new Error(
        `학생 SPA 메인 청크(student-*.js) 를 ${STUDENT_DIST} 에서 찾지 못함 — vite 출력 패턴 변경 의심.`,
      );
    }

    const baselineFile = baseline.files[0];
    if (!baselineFile) {
      throw new Error(
        `baseline JSON 의 files[] 가 비어 있음 (${BASELINE_PATH}) — fixture malformed.`,
      );
    }

    const gz = zlib.gzipSync(fs.readFileSync(path.join(STUDENT_DIST, studentJs))).length;
    const baselineGzip = baselineFile.gzipBytes;
    const budget = baseline.growthBudget.absoluteBytes;
    expect(
      gz,
      `학생 SPA gzip ${gz}B 가 baseline ${baselineGzip}B + budget ${budget}B 한도 초과`,
    ).toBeLessThanOrEqual(baselineGzip + budget);
  });
});
