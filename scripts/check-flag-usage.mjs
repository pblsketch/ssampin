#!/usr/bin/env node
/**
 * check-flag-usage: useRealtimeToolFlag 호출 횟수 제한 검사.
 *
 * Plan §5.2 D5: `useRealtimeToolFlag`는 feature flag이므로 과도한 call site 확산을
 * 방지하기 위해 3개 이하만 허용한다. 4개 이상이면 exit 1로 실패한다.
 *
 * 검사 대상: src/ 디렉터리 (재귀)
 * 제외: node_modules, dist, *.test.ts, *.spec.ts, __tests__/
 *
 * 결과:
 *   - 카운트 <= 3: exit 0, 모든 hit를 file:line 형식으로 출력
 *   - 카운트 > 3:  exit 1, 모든 hit와 초과 안내 출력
 *
 * 사용:
 *   node scripts/check-flag-usage.mjs
 *   npm run check-flag-usage
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC_DIR = resolve(ROOT, 'src');

const FLAG_CALL = 'useRealtimeToolFlag(';
const MAX_ALLOWED = 3;

/**
 * 파일이 검사 대상인지 판단한다.
 * @param {string} filePath 절대 경로
 * @returns {boolean}
 */
function shouldScan(filePath) {
  // 확장자 필터: .ts, .tsx만 검사
  const ext = extname(filePath);
  if (ext !== '.ts' && ext !== '.tsx') return false;

  // 테스트 파일 제외
  if (filePath.endsWith('.test.ts') || filePath.endsWith('.test.tsx')) return false;
  if (filePath.endsWith('.spec.ts') || filePath.endsWith('.spec.tsx')) return false;

  // __tests__ 디렉터리 제외
  if (filePath.includes('__tests__')) return false;

  return true;
}

/**
 * 디렉터리를 재귀 탐색하여 대상 파일 목록을 반환한다.
 * @param {string} dir
 * @returns {string[]}
 */
function walkDir(dir) {
  const results = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    // 제외 디렉터리
    if (entry === 'node_modules' || entry === 'dist' || entry === 'dist-electron') continue;

    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else if (stat.isFile() && shouldScan(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * 파일 내에서 FLAG_CALL의 모든 줄 번호를 반환한다.
 * import 라인은 제외한다.
 * @param {string} filePath
 * @returns {{ line: number, text: string }[]}
 */
function findCallSites(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    // import 라인 제외 (import ... from '...' 패턴)
    if (/^\s*import\s/.test(lineText)) continue;
    if (lineText.includes(FLAG_CALL)) {
      hits.push({ line: i + 1, text: lineText.trim() });
    }
  }
  return hits;
}

// --- 메인 실행 ---

console.log(`check-flag-usage: '${FLAG_CALL}' 호출 횟수 검사 (최대 허용: ${MAX_ALLOWED}개)`);
console.log(`검사 범위: ${SRC_DIR}`);
console.log('');

const files = walkDir(SRC_DIR);
const allHits = [];

for (const filePath of files) {
  const hits = findCallSites(filePath);
  for (const hit of hits) {
    allHits.push({
      filePath,
      relPath: relative(ROOT, filePath),
      ...hit,
    });
  }
}

const count = allHits.length;

if (count === 0) {
  console.log(`결과: 0개 (useRealtimeToolFlag 호출 없음 — flag 미생성 또는 import만 존재)`);
  console.log(`exit 0`);
  process.exit(0);
}

console.log(`발견된 호출 위치 (${count}개):`);
for (const hit of allHits) {
  console.log(`  ${hit.relPath}:${hit.line}  →  ${hit.text}`);
}
console.log('');

if (count > MAX_ALLOWED) {
  console.error(
    `✗ FAIL: useRealtimeToolFlag 호출이 ${count}개로 허용치(${MAX_ALLOWED}개)를 초과합니다.`,
  );
  console.error(`  feature flag는 최소화된 call site를 유지해야 합니다 (Plan §5.2 D5).`);
  console.error(`  초과 call site를 제거하거나, 호출을 상위 컴포넌트 1곳으로 집중시키세요.`);
  process.exit(1);
}

console.log(`✓ PASS: useRealtimeToolFlag 호출 ${count}개 (허용치 ${MAX_ALLOWED}개 이내)`);
process.exit(0);
