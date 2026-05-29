#!/usr/bin/env node
/**
 * check-sp-coverage: MultiSurvey v2 sp-* 토큰 채택률 ≥ MIN_BINDINGS 게이트 (ADR-010).
 *
 * 검사 범위:
 *   - src/adapters/components/MultiSurvey/v2/** (Maker / Console / Student / Share / Migration)
 *   - electron/ipc/_studentPageChrome.ts (DN-10 정적 HTML CSS 변수 inline 주입 위치)
 *
 * 카운트 대상 (sp-* 바인딩):
 *   - Tailwind sp-* 유틸리티 클래스: `sp-bg`, `sp-text`, `sp-border`, `text-sp-*`, `bg-sp-*`, `border-sp-*`, `shadow-sp-*` 등
 *   - CSS 변수 inline: `var(--sp-*)`
 *   - 두 패턴 합산해 카운트
 *
 * 임계값:
 *   - Phase B baseline 582 → MIN_BINDINGS = 500 (회귀 차단 임계). Phase C·D 컴포넌트 증감 시 본 상수 조정.
 *
 * 판정:
 *   - 카운트 >= MIN_BINDINGS → exit 0 PASS
 *   - 카운트 <  MIN_BINDINGS → exit 1 FAIL + 누락 범위 안내
 *
 * 의미: sp-* 토큰 채택률이 Phase B 시점 baseline 아래로 떨어지지 않게 회귀 차단. ADR-010 새 정량 게이트 #2.
 *
 * 사용:
 *   node scripts/check-sp-coverage.mjs
 *   npm run check-sp-coverage
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, relative, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

const SCAN_TARGETS = [
  resolve(ROOT, 'src/adapters/components/MultiSurvey/v2'),
  resolve(ROOT, 'electron/ipc/_studentPageChrome.ts'),
];

// Phase B baseline: 582 bindings. Phase B B.7 시점 측정값 - 82(여유) = 500.
const MIN_BINDINGS = 500;

// 카운트 대상 정규식:
// ① sp-* 유틸리티/접두/단어: sp-bg, sp-text-base, text-sp-muted, bg-sp-accent, border-sp-border, shadow-sp-lg 등.
//    단어 경계 안에서 `sp-` 식별자 직후 알파벳/하이픈 한 글자 이상 등장.
// ② CSS 변수 var(--sp-*): inline style or fallback 표기.
// 두 정규식을 하나로 합쳐 라인당 매치 카운트.
const SP_BINDING_RE = /(?:\bsp-[a-zA-Z][a-zA-Z0-9-]*\b|var\(\s*--sp-[a-zA-Z0-9-]+\s*[,)])/g;

function shouldScanFile(filePath) {
  const ext = extname(filePath);
  if (ext !== '.ts' && ext !== '.tsx') return false;
  if (filePath.endsWith('.test.ts') || filePath.endsWith('.test.tsx')) return false;
  if (filePath.endsWith('.spec.ts') || filePath.endsWith('.spec.tsx')) return false;
  if (filePath.includes('__tests__')) return false;
  return true;
}

function walkDir(dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  const stat = statSync(dir);
  if (stat.isFile()) {
    return shouldScanFile(dir) ? [dir] : [];
  }
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'dist-electron') continue;
    const fullPath = join(dir, entry);
    const subStat = statSync(fullPath);
    if (subStat.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else if (subStat.isFile() && shouldScanFile(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

/** 라인에서 sp-* 바인딩 매치 수 반환. */
function countBindings(line) {
  const hits = line.match(SP_BINDING_RE);
  return hits ? hits.length : 0;
}

// --- 메인 ---

console.log(`check-sp-coverage: sp-* 토큰 바인딩 ≥ ${MIN_BINDINGS}건 게이트 (ADR-010 #2)`);
console.log('검사 범위:');
for (const t of SCAN_TARGETS) {
  console.log(`  - ${relative(ROOT, t) || '.'}`);
}
console.log('');

const allFiles = [];
for (const target of SCAN_TARGETS) {
  allFiles.push(...walkDir(target));
}

let totalBindings = 0;
const perFile = [];

for (const filePath of allFiles) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  let fileCount = 0;
  for (const line of lines) {
    fileCount += countBindings(line);
  }
  perFile.push({ relPath: relative(ROOT, filePath), count: fileCount });
  totalBindings += fileCount;
}

console.log(`스캔 파일: ${allFiles.length}`);
console.log(`총 sp-* 바인딩: ${totalBindings}`);
console.log('');

if (totalBindings >= MIN_BINDINGS) {
  console.log(
    `✓ PASS: sp-* 바인딩 ${totalBindings}건 (임계 ${MIN_BINDINGS}건 충족 — Phase B baseline 582 기준 회귀 차단)`,
  );
  process.exit(0);
}

console.error('');
console.error(
  `✗ FAIL: sp-* 바인딩 ${totalBindings}건 (임계 ${MIN_BINDINGS}건 미달 — Phase B baseline 회귀 가능).`,
);
console.error(
  `  ADR-010 #2: sp-* 토큰 채택률 회귀 방지. 임의 색상/스타일을 sp-* 토큰으로 교체하세요.`,
);
console.error('');
console.error('파일별 카운트 (오름차순):');
perFile
  .sort((a, b) => a.count - b.count)
  .slice(0, 15)
  .forEach((f) => console.error(`  ${f.count.toString().padStart(4, ' ')}  ${f.relPath}`));

process.exit(1);
