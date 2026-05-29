#!/usr/bin/env node
/**
 * check-hex-hardcoding: MultiSurvey v2 비-fallback HEX 0건 게이트 (ADR-010).
 *
 * 검사 범위:
 *   - src/adapters/components/MultiSurvey/v2/** (Maker / Console / Student / Share / Migration)
 *
 * 검사 범위에서 제외 (ADR-010 화이트리스트 ④):
 *   - electron/ipc/_studentPageChrome.ts — DN-10 fallback 값의 정의 소스(SSOT). 본 파일이 sp-* 토큰 default HEX 정답이라 검사 대상 아님.
 *
 * 화이트리스트 (HEX이지만 허용되는 패턴):
 *   ① var(--<name>, #<fallback>) — DN-10 CSS 변수 미주입 대비 fallback. Student 정적 HTML 안전장치.
 *   ② color: { dark: '#...', light: '#...' } / { dark/light/background/foreground: '#...' } — qrcode 라이브러리 흑백 강제 옵션.
 *   ③ [Ff]allback 식별자(예: const fallbackColor = ...) 포함 라인 — CSS color-mix() 함수 등 var() fallback 미지원 case 보완.
 *
 * 판정:
 *   - 화이트리스트 마스킹 후 잔여 HEX 0건 → exit 0 PASS
 *   - 잔여 1건 이상 → exit 1 FAIL + 파일/줄/스니펫 출력
 *
 * 의미: 신규 PR에서 sp-* 토큰을 우회한 임의 색상 박힘을 즉시 차단. ADR-010 새 정량 게이트 #1.
 *
 * 사용:
 *   node scripts/check-hex-hardcoding.mjs
 *   npm run check-hex-hardcoding
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, relative, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

const SCAN_TARGETS = [resolve(ROOT, 'src/adapters/components/MultiSurvey/v2')];

// 화이트리스트 ④: 검사 범위에서 명시적으로 제외하는 파일 (DN-10 fallback 값 정의 SSOT).
const EXCLUDE_FILES = new Set([resolve(ROOT, 'electron/ipc/_studentPageChrome.ts')]);

// HEX 검출 정규식 (라인 단위). 3/4/6/8자 모두 커버.
const HEX_RE = /#[0-9A-Fa-f]{3,8}\b/g;

// 화이트리스트 ①: var(--<name>, #<fallback>) — fallback은 다양한 공백 허용.
const ALLOW_VAR_FALLBACK_RE = /var\(\s*--[a-zA-Z0-9_-]+\s*,\s*#[0-9A-Fa-f]{3,8}\s*\)/g;

// 화이트리스트 ②: qrcode color 객체 — 'dark'/'light'/'foreground'/'background' 키만 인정.
const ALLOW_QRCODE_COLOR_RE =
  /\b(?:dark|light|foreground|background)\s*:\s*['"]#[0-9A-Fa-f]{3,8}['"]/g;

// 화이트리스트 ③: [Ff]allback 식별자 포함 — CSS color-mix() 등 var() fallback 미지원 case.
// 라인 내 fallback 식별자가 있으면 그 라인을 통째로 마스킹 처리 (HEX 무시).
const ALLOW_FALLBACK_IDENT_RE = /\b[a-z]*[Ff]allback\w*\b/;

function shouldScanFile(filePath) {
  const ext = extname(filePath);
  if (ext !== '.ts' && ext !== '.tsx') return false;
  if (filePath.endsWith('.test.ts') || filePath.endsWith('.test.tsx')) return false;
  if (filePath.endsWith('.spec.ts') || filePath.endsWith('.spec.tsx')) return false;
  if (filePath.includes('__tests__')) return false;
  if (EXCLUDE_FILES.has(filePath)) return false; // 화이트리스트 ④
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

/**
 * 한 줄에서 화이트리스트 패턴을 공백으로 마스킹한 뒤 잔여 HEX hit 반환.
 * @param {string} line
 * @returns {string[]} 잔여 HEX 매치 배열
 */
function findOffendingHex(line) {
  // 화이트리스트 ③: [Ff]allback 식별자가 있으면 라인 전체 통과 (HEX 검사 skip)
  if (ALLOW_FALLBACK_IDENT_RE.test(line)) return [];
  let masked = line.replace(ALLOW_VAR_FALLBACK_RE, (m) => ' '.repeat(m.length));
  masked = masked.replace(ALLOW_QRCODE_COLOR_RE, (m) => ' '.repeat(m.length));
  const hits = masked.match(HEX_RE);
  return hits ?? [];
}

// --- 메인 ---

console.log('check-hex-hardcoding: 비-fallback HEX 0건 게이트 (ADR-010 #1)');
console.log('검사 범위:');
for (const t of SCAN_TARGETS) {
  console.log(`  - ${relative(ROOT, t) || '.'}`);
}
console.log('');

const allFiles = [];
for (const target of SCAN_TARGETS) {
  allFiles.push(...walkDir(target));
}

const offenders = [];
let scannedFiles = 0;

for (const filePath of allFiles) {
  scannedFiles += 1;
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const hits = findOffendingHex(lines[i]);
    if (hits.length > 0) {
      offenders.push({
        relPath: relative(ROOT, filePath),
        line: i + 1,
        snippet: lines[i].trim(),
        hits,
      });
    }
  }
}

console.log(`스캔 파일: ${scannedFiles}`);

if (offenders.length === 0) {
  console.log(`✓ PASS: 비-fallback HEX 0건 (sp-* 토큰 채택 정착)`);
  process.exit(0);
}

console.error('');
console.error(`✗ FAIL: 비-fallback HEX ${offenders.length}건 발견.`);
console.error(`  화이트리스트 외 HEX 하드코딩은 ADR-004 sp-* 토큰 시스템을 우회합니다.`);
console.error(
  `  - 화이트리스트 ①: var(--<name>, #<fallback>) — CSS 변수 fallback 안전장치 (DN-10).`,
);
console.error(`  - 화이트리스트 ②: qrcode color: { dark/light: '#...' } — QR 코드 흑백 강제.`);
console.error(
  `  - 화이트리스트 ③: [Ff]allback 식별자 포함 라인 — CSS color-mix() 등 var() fallback 미지원 case.`,
);
console.error(
  `  - 화이트리스트 ④: _studentPageChrome.ts — DN-10 fallback 정의 SSOT (검사 범위 제외).`,
);
console.error(`  그 외는 sp-* 토큰으로 교체하세요.`);
console.error('');
for (const off of offenders) {
  console.error(`  ${off.relPath}:${off.line}`);
  console.error(`    hits: ${off.hits.join(', ')}`);
  console.error(`    line: ${off.snippet}`);
}
process.exit(1);
